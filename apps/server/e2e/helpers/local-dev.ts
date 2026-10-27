import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"

import { SKILL_INDEX_KEY } from "../../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// `bun run dev` as real processes, with a `--persist-to` and wrangler state of
// its own per run, so the developer's `.wrangler` is untouched.

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..")

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

// What wrangler asks GitHub for under an AI agent, unless it has a copy under a
// day old in its config folder.
export const WRANGLER_AGENT_SKILLS_LIST =
  "https://api.github.com/repos/cloudflare/skills/contents/skills"

// What wrangler's agent detector (`detectAgent` in wrangler-dist/cli.js) reads
// as an AI agent, under which wrangler asks GitHub for cloudflare/skills. A rule
// needs all of its variables, so one name per rule is enough.
const AI_AGENT_VARIABLES: readonly string[] = [
  "OPENCODE",
  "OPENCODE_BIN_PATH",
  "OPENCODE_SERVER",
  "OPENCODE_APP_INFO",
  "OPENCODE_MODES",
  "CLAUDECODE",
  "CURSOR_TRACE_ID",
  "ANTIGRAVITY_AGENT",
  "ANTIGRAVITY_PROJECT_ID",
  "GEMINI_CLI",
  "CODEX_THREAD_ID",
  "REPL_ID",
  "AIDER_API_KEY",
  "CODEIUM_EDITOR_APP_ROOT",
  "CRUSH",
  "AGENT",
  "AI_AGENT",
  "AMP_CURRENT_THREAD_ID",
  "AUGMENT_AGENT",
  "QWEN_CODE",
  "TERM_PROGRAM",
  "PI_CODING_AGENT",
]

const WITHHELD_FROM_DEV: ReadonlySet<string> = new Set([
  "GITHUB_TOKEN",
  ...AI_AGENT_VARIABLES,
])

// A copy rather than `Object.fromEntries`, which would lose the bindings
// `wrangler types` declares on `NodeJS.ProcessEnv`.
const callerEnvironmentWithout = (withheld: ReadonlySet<string>) => {
  const environment = { ...process.env }
  for (const name of withheld) delete environment[name]
  return environment
}

export const devEnvironment = (
  scratch: string,
  overrides: Record<string, string>
): NodeJS.ProcessEnv => ({
  ...callerEnvironmentWithout(WITHHELD_FROM_DEV),
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_HIDE_BANNER: "true",
  WRANGLER_LOG_PATH: join(scratch, "wrangler-logs"),
  WRANGLER_REGISTRY_PATH: join(scratch, "wrangler-registry"),
  // Empty, so no skills list the caller's wrangler cached stands in for
  // asking GitHub. Wrangler reads `~/.wrangler` instead where that exists.
  XDG_CONFIG_HOME: join(scratch, "wrangler-config"),
  ...overrides,
})

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

type Exit = { code: number | null; stderr: string }

// Never `spawnSync`: the stand-in GitHub's proxy, which the command reaches
// through `HTTPS_PROXY`, answers from this worker, so blocking it hangs the
// command. Its own process group, so an abort stops what it starts as well;
// the run still ends with the process, its exit code then null.
const runUntilExit = (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal
) =>
  new Promise<Exit>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: SERVER_DIR,
      env: environment,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const stopOnAbort = () => {
      if (child.pid !== undefined) killGroup(child.pid, "SIGKILL")
    }
    signal.addEventListener("abort", stopOnAbort, { once: true })
    child.once("error", (error) => {
      signal.removeEventListener("abort", stopOnAbort)
      reject(error)
    })
    child.once("close", (code) => {
      signal.removeEventListener("abort", stopOnAbort)
      resolve({ code, stderr })
    })
  })

// The workflow's publish step, run `--local`. `signal` is the test's: a test
// that has timed out stops its publish rather than leave it running.
export const publishIntoLocalStore = async (
  store: string,
  index: SkillIndex,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal
) => {
  signal.throwIfAborted()
  const file = join(dirname(store), "published-skill-index.json")
  writeFileSync(file, JSON.stringify(index))
  const put = await runUntilExit(
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
    environment,
    signal
  )
  signal.throwIfAborted()
  if (put.code !== 0) {
    throw new Error(`could not publish an index into ${store}: ${put.stderr}`)
  }
}

// Its own process group, so `stop` reaches workerd as well. `signal` is the
// test's: a test that has timed out starts no server, and stops the one it has.
export const startDev = async (
  store: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal
): Promise<DevSession> => {
  const port = await freePort()
  // Nothing awaits from here until the abort listener is added, so an abort
  // lands either here or on the listener.
  signal.throwIfAborted()
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
    signal.removeEventListener("abort", stopOnAbort)
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve))
      killGroup(pid, "SIGTERM")
      await Promise.race([exited, sleep(STOP_WITHIN_MS)])
    }
    killGroup(pid, "SIGKILL")
  }
  const stopOnAbort = () => {
    void stop()
  }
  signal.addEventListener("abort", stopOnAbort, { once: true })

  const deadline = Date.now() + READY_WITHIN_MS
  for (;;) {
    signal.throwIfAborted()
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
