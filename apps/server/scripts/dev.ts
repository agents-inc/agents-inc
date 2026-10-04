import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { SKILL_INDEX_KEY, freshnessOf } from "../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"
import type { StdioOptions } from "node:child_process"

// `bun run dev` — `wrangler dev`, over a local store that can do what
// production's does (owner, 2026-10-02: "Get local in line with prod").
//
// Two things in production's store come from outside the worker, and nothing
// put either into a local one. The D1 tables come from
// `wrangler d1 migrations apply`, run at deploy, so signing in locally died on
// `no such table`. And GET /skills serves one KV key that only
// .github/workflows/build-skill-index.yml writes, to production, so the
// editor's Add skill search answered 503. Before starting the worker this
// applies the local migrations, then runs that workflow's two steps against
// the local store — `build:skill-index`, then `wrangler kv key put` with
// `--local` — whenever the store holds no index this branch can read, or one
// the worker itself calls stale (`freshnessOf`: three days).
//
// Neither step stops the worker from starting. What fails is said in one
// line, and the worker starts over whatever the store already holds. A crawl
// still running after CRAWL_TIME_LIMIT_SECONDS is stopped, and counts as one
// that failed.
//
// Every argument goes to `wrangler dev`. `--persist-to` is honoured by both
// steps too, so they fill the store that worker reads, and `--remote` skips
// them, since a remote worker reads no local store.

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// The bindings wrangler.jsonc gives the store and the database, which the
// workflow and the deploy resolve the same way.
const INDEX_BINDING = "CONFIGS"
const DATABASE_BINDING = "DATABASE"

const PERSIST_FLAG = "--persist-to"
const REMOTE_FLAG = "--remote"

// A live crawl takes a few seconds. On a network that drops packets its
// requests wait until the runtime gives up, about five minutes, and the
// worker waited with them.
const CRAWL_TIME_LIMIT_SECONDS = 30
const MS_PER_SECOND = 1000

// stdin is closed for every step before the worker, not inherited:
// `d1 migrations apply` asks "continue? (Y/n)" on a terminal, and takes its
// yes when nothing can answer.
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

/** The workflow's crawl and publish, into the local store. */
const buildLocalIndex = (store: readonly string[]) => {
  const scratch = mkdtempSync(join(tmpdir(), "skill-index-dev-"))
  try {
    const file = join(scratch, "skill-index.json")
    return crawlInto(file) && publishLocally(file, store)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** `wrangler dev` with `args`, which this process lives and exits with. */
const startWorker = (args: readonly string[]) => {
  const worker = spawn("bunx", ["wrangler", "dev", ...args], {
    cwd: SERVER_ROOT,
    stdio: "inherit",
  })
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => worker.kill(signal))
  }
  // The code is null only when a signal ended the worker.
  worker.on("exit", (code) => process.exit(code ?? 1))
}

/** What points a wrangler command at the store `wrangler dev` reads. */
const localStoreFlags = (args: readonly string[]) => [
  "--local",
  ...persistFlag(args),
]

/** The `--persist-to` among `args`, in whichever of its two spellings. */
const persistFlag = (args: readonly string[]): string[] => {
  const at = args.findIndex(
    (arg) => arg === PERSIST_FLAG || arg.startsWith(`${PERSIST_FLAG}=`)
  )
  if (at === -1) return []
  const flag = args[at] ?? ""
  return flag.includes("=") ? [flag] : [flag, args[at + 1] ?? ""]
}

/** What the store holds under the index key, if this branch can read it. */
const readLocalIndex = (store: readonly string[]): SkillIndex | undefined => {
  const read = wrangler(
    [...onIndexKey("get", store), "--text"],
    ["ignore", "pipe", "ignore"]
  )
  if (read.status !== 0) return undefined
  const parsed = skillIndexSchema.safeParse(parseJson(read.stdout))
  return parsed.success ? parsed.data : undefined
}

/** Why the store's index needs building, or nothing when it is current. */
const whyBuild = (index: SkillIndex | undefined) => {
  if (index === undefined) {
    return "the local store holds none this branch can read"
  }
  if (freshnessOf(index.builtAt) === "stale") {
    return `the local store's copy was built at ${index.builtAt}`
  }
  return undefined
}

// Stopped with SIGTERM, which `bun run` passes on to the crawl it started.
// A stopped crawl prints nothing of its own, so this says why it stopped.
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

// Without GITHUB_TOKEN, which `build:skill-index` would otherwise send. The
// crawl makes two API calls per allowlisted repository, well inside the
// anonymous allowance, while an expired token in a developer's shell is
// refused with a 401 that no token at all is not.
const anonymousEnvironment = (): NodeJS.ProcessEnv => {
  const { GITHUB_TOKEN: _token, ...rest } = process.env
  return rest
}

// A stale index is still served, marked stale; only an unreadable or absent
// one makes the route answer 503.
const notBuiltNotice = (stored: SkillIndex | undefined) =>
  stored === undefined
    ? "The local skill index was not built, so Add skill search answers 503 until a later `bun run dev` builds one."
    : `The local skill index was not rebuilt, so Add skill search serves the copy built at ${stored.builtAt}, marked stale, until a later \`bun run dev\` rebuilds it.`

const CRAWL_STOPPED_NOTICE = `The skill index crawl took longer than ${String(CRAWL_TIME_LIMIT_SECONDS)} s, so it was stopped.`

/** `kv key <command>` on the index key, in the local store. */
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
