import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { SKILL_INDEX_KEY, freshnessOf } from "../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"
import type { StdioOptions } from "node:child_process"

// `bun run dev`: applies local D1 migrations and, when the local skill index
// is missing or stale, runs the index workflow's crawl and publish locally,
// then starts `wrangler dev`. Neither step stops the worker from starting.
// Arguments go to `wrangler dev`; `--persist-to` reaches the steps too and
// `--remote` skips them.

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const INDEX_BINDING = "CONFIGS"
const DATABASE_BINDING = "DATABASE"

const PERSIST_FLAG = "--persist-to"
const REMOTE_FLAG = "--remote"

// Packet-dropping networks would otherwise stall the crawl for minutes.
const CRAWL_TIME_LIMIT_SECONDS = 30
const MS_PER_SECOND = 1000

// stdin closed: `d1 migrations apply` takes its own yes when nothing can answer.
const PREPARE_STDIO: StdioOptions = ["ignore", "inherit", "inherit"]

const devArgs = process.argv.slice(2)

const main = () => {
  if (!devArgs.includes(REMOTE_FLAG)) {
    const store = localStoreFlags(devArgs)
    applyLocalMigrations(store)
    ensureLocalIndex(store)
  }
  startWorker(devArgs)
}

const applyLocalMigrations = (store: readonly string[]) => {
  const applied = wrangler(
    ["d1", "migrations", "apply", DATABASE_BINDING, ...store],
    PREPARE_STDIO
  )
  if (applied.status !== 0) {
    console.error(
      "The local D1 migrations were not applied, so signing in fails until they are."
    )
  }
}

const ensureLocalIndex = (store: readonly string[]) => {
  const stored = readLocalIndex(store)
  const reason = whyBuild(stored)
  if (reason === undefined) return
  console.log(`Building the local skill index, because ${reason}.`)
  if (buildLocalIndex(store)) return
  console.error(notBuiltNotice(stored))
}

const buildLocalIndex = (store: readonly string[]) => {
  const scratch = mkdtempSync(join(tmpdir(), "skill-index-dev-"))
  try {
    const file = join(scratch, "skill-index.json")
    return crawlInto(file) && publishLocally(file, store)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const startWorker = (args: readonly string[]) => {
  const worker = spawn("bunx", ["wrangler", "dev", ...args], {
    cwd: SERVER_ROOT,
    stdio: "inherit",
  })
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => worker.kill(signal))
  }
  // Null only when a signal ended the worker.
  worker.on("exit", (code) => process.exit(code ?? 1))
}

const localStoreFlags = (args: readonly string[]) => [
  "--local",
  ...persistFlag(args),
]

/** The `--persist-to` among `args`, in either spelling. */
const persistFlag = (args: readonly string[]): string[] => {
  const at = args.findIndex(
    (arg) => arg === PERSIST_FLAG || arg.startsWith(`${PERSIST_FLAG}=`)
  )
  if (at === -1) return []
  const flag = args[at] ?? ""
  return flag.includes("=") ? [flag] : [flag, args[at + 1] ?? ""]
}

const readLocalIndex = (store: readonly string[]): SkillIndex | undefined => {
  const read = wrangler(
    [...onIndexKey("get", store), "--text"],
    ["ignore", "pipe", "ignore"]
  )
  if (read.status !== 0) return undefined
  const parsed = skillIndexSchema.safeParse(parseJson(read.stdout))
  return parsed.success ? parsed.data : undefined
}

const whyBuild = (index: SkillIndex | undefined) => {
  if (index === undefined) {
    return "the local store holds none this branch can read"
  }
  if (freshnessOf(index.builtAt) === "stale") {
    return `the local store's copy was built at ${index.builtAt}`
  }
  return undefined
}

// SIGTERM reaches the crawl through `bun run`; a stopped crawl prints nothing.
const crawlInto = (file: string) => {
  const crawl = spawnSync("bun", ["run", "build:skill-index", file], {
    cwd: SERVER_ROOT,
    env: anonymousEnvironment(),
    stdio: PREPARE_STDIO,
    timeout: CRAWL_TIME_LIMIT_SECONDS * MS_PER_SECOND,
  })
  if (ranOutOfTime(crawl)) console.error(CRAWL_STOPPED_NOTICE)
  return crawl.status === 0
}

const ranOutOfTime = ({ error }: { error?: Error }) =>
  error !== undefined && "code" in error && error.code === "ETIMEDOUT"

const publishLocally = (file: string, store: readonly string[]) =>
  wrangler([...onIndexKey("put", store), "--path", file], PREPARE_STDIO)
    .status === 0

// Without GITHUB_TOKEN: the anonymous allowance suffices, and an expired token
// would fail with a 401.
const anonymousEnvironment = (): NodeJS.ProcessEnv => {
  const { GITHUB_TOKEN: _token, ...rest } = process.env
  return rest
}

// A stale index is still served; only an unreadable or absent one is a 503.
const notBuiltNotice = (stored: SkillIndex | undefined) =>
  stored === undefined
    ? "The local skill index was not built, so Add skill search answers 503 until a later `bun run dev` builds one."
    : `The local skill index was not rebuilt, so Add skill search serves the copy built at ${stored.builtAt}, marked stale, until a later \`bun run dev\` rebuilds it.`

const CRAWL_STOPPED_NOTICE = `The skill index crawl took longer than ${String(CRAWL_TIME_LIMIT_SECONDS)} s, so it was stopped.`

const onIndexKey = (command: "get" | "put", store: readonly string[]) => [
  "kv",
  "key",
  command,
  SKILL_INDEX_KEY,
  "--binding",
  INDEX_BINDING,
  ...store,
]

const wrangler = (args: readonly string[], stdio: StdioOptions) =>
  spawnSync("bunx", ["wrangler", ...args], {
    cwd: SERVER_ROOT,
    stdio,
    encoding: "utf8",
  })

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

main()
