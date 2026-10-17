import { spawn, spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"

import { SKILL_INDEX_KEY } from "../../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// `bun run dev` as real processes, with a `--persist-to` and wrangler state of
// its own per run, so the developer's `.wrangler` is untouched.

export const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..")

const INDEX_BINDING = "CONFIGS"

// Worthless secrets (as in vitest.config.ts); `--var` overrides `.dev.vars`.
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
  origin: string
  output: () => string
  stop: () => Promise<void>
}

// The caller's environment minus any GitHub token, with wrangler offline.
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

// The workflow's publish step, run `--local`.
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

// Its own process group, so `stop` reaches workerd as well.
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
