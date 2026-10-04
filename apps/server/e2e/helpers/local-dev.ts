import { spawn, spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"

import { SKILL_INDEX_KEY } from "../../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// `bun run dev` in apps/server, run the way a developer runs it: from this
// workspace, as a tree of real processes, over a local store of its own.
//
// Every run gets a `--persist-to` of its own, so nothing here reads or writes
// the developer's `.wrangler/state`, and wrangler's logs and dev registry go to
// the run's scratch directory rather than `~/.wrangler`. Arguments after the
// script name reach `wrangler dev`, and `--persist-to` reaches the steps
// `bun run dev` takes before it.

/** apps/server: where `bun run` finds the script and wrangler its config. */
export const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..")

// The binding .github/workflows/build-skill-index.yml publishes through.
const INDEX_BINDING = "CONFIGS"

// The three secrets, held to values that cannot buy anything — the same ones,
// for the same reason, as `FAKE_SECRETS` in vitest.config.ts. A developer's
// `.dev.vars` holds real ones and `wrangler dev` reads it; `--var` wins over
// that file, so the worker started here never holds them.
const FAKE_SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-not-a-real-key",
  BETTER_AUTH_SECRET: "not-a-real-secret-not-a-real-secret-32",
  GITHUB_CLIENT_SECRET: "not-a-real-github-client-secret",
}

const FAKE_SECRET_ARGS = Object.entries(FAKE_SECRETS).flatMap(
  ([name, value]) => ["--var", `${name}:${value}`]
)

const READY_LINE = /Ready on (http:\/\/\S+)/

const POLL_MS = 200
const READY_WITHIN_MS = 90_000
const STOP_WITHIN_MS = 10_000

export type DevSession = {
  /** Where the worker answers, as wrangler announced it. */
  origin: string
  /** Everything the run printed so far, colour codes removed. */
  output: () => string
  stop: () => Promise<void>
}

/**
 * The environment every process here runs in: the caller's, less any GitHub
 * token — the ruled step needs none — and with wrangler kept off the network
 * and out of `~/.wrangler`.
 */
export const devEnvironment = (
  scratch: string,
  overrides: Record<string, string>
): NodeJS.ProcessEnv => {
  const { GITHUB_TOKEN: _token, ...inherited } = process.env
  return {
    ...inherited,
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_HIDE_BANNER: "true",
    WRANGLER_LOG_PATH: join(scratch, "wrangler-logs"),
    WRANGLER_REGISTRY_PATH: join(scratch, "wrangler-registry"),
    ...overrides,
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      if (address === null || typeof address === "string") {
        reject(new Error("no free port to start the worker on"))
        return
      }
      probe.close(() => resolve(address.port))
    })
  })

const killGroup = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(-pid, signal)
  } catch {
    // The group has already gone.
  }
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * The workflow's own publish step — `wrangler kv key put` under the key the
 * worker reads — with `--local` where the workflow says `--env production
 * --remote`. How a store comes to hold an index of a given age.
 */
export const publishIntoLocalStore = (
  store: string,
  index: SkillIndex,
  environment: NodeJS.ProcessEnv
) => {
  const file = join(dirname(store), "published-skill-index.json")
  writeFileSync(file, JSON.stringify(index))
  const put = spawnSync(
    "bunx",
    [
      "wrangler",
      "kv",
      "key",
      "put",
      SKILL_INDEX_KEY,
      "--path",
      file,
      "--binding",
      INDEX_BINDING,
      "--local",
      "--persist-to",
      store,
    ],
    { cwd: SERVER_DIR, env: environment, encoding: "utf8" }
  )
  if (put.status !== 0) {
    throw new Error(
      `could not publish an index into ${store}: ${put.error?.message ?? put.stderr}`
    )
  }
}

/**
 * `bun run dev`, started over `store` and returned once wrangler says the
 * worker is ready. Its own process group, so `stop` reaches workerd as well
 * as the script.
 */
export const startDev = async (
  store: string,
  environment: NodeJS.ProcessEnv
): Promise<DevSession> => {
  const port = await freePort()
  const child = spawn(
    "bun",
    [
      "run",
      "dev",
      "--port",
      String(port),
      "--persist-to",
      store,
      ...FAKE_SECRET_ARGS,
    ],
    {
      cwd: SERVER_DIR,
      env: environment,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  const { pid } = child
  if (pid === undefined) throw new Error("`bun run dev` did not start")

  let printed = ""
  const collect = (chunk: Buffer) => {
    printed += chunk.toString()
  }
  child.stdout.on("data", collect)
  child.stderr.on("data", collect)
  const output = () => stripVTControlCharacters(printed)

  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve))
      killGroup(pid, "SIGTERM")
      await Promise.race([exited, sleep(STOP_WITHIN_MS)])
    }
    killGroup(pid, "SIGKILL")
  }

  const deadline = Date.now() + READY_WITHIN_MS
  for (;;) {
    const origin = READY_LINE.exec(output())?.[1]
    if (origin !== undefined) return { origin, output, stop }
    if (child.exitCode !== null || Date.now() > deadline) {
      await stop()
      throw new Error(
        `\`bun run dev\` never said it was ready (exit ${String(child.exitCode)}):\n${output()}`
      )
    }
    await sleep(POLL_MS)
  }
}
