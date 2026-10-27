import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WRANGLER_AGENT_SKILLS_LIST,
  devEnvironment,
  publishIntoLocalStore,
  startDev,
} from "./local-dev"
import {
  cameTrueWithin,
  isRunning,
  onlyRun,
  standInCommand,
  stopIfRunning,
} from "./stand-in-commands"
import { githubServing, startStandInGitHub } from "./stand-in-github"

import type { SkillIndex } from "@workspace/matrix/skill-index"
import type { StandInCommand } from "./stand-in-commands"
import type { StandInGitHub } from "./stand-in-github"

// How the helpers run their processes, with stand-ins for `bunx wrangler` and `bun run dev`, so no
// worker starts. Collected by vitest.e2e.config.ts: the workerd pool `test` uses cannot spawn.

const PUBLISHED_INDEX: SkillIndex = {
  builtAt: "2026-10-16T09:00:00.000Z",
  skills: [],
}

const STARTS_WITHIN_MS = 5_000
const GONE_WITHIN_MS = 2_000

// Wrangler reads a variable its rule names no value for as set whatever it holds, unless empty.
const ANY_VALUE = "any value"

type AgentRule = {
  agent: string
  variables: Readonly<Record<string, string>>
}

// The rules wrangler's agent detector (`detectAgent` in wrangler-dist/cli.js, am-i-vibing 0.5.0 in
// wrangler 4.118) matches, one row per alternative. Rules made only of variables every process has
// (HOME with USER, SHELL, TERM_PROGRAM=zed) are left out: wrangler asks GitHub nothing under them.
const WRANGLER_AGENT_RULES: readonly AgentRule[] = [
  { agent: "opencode", variables: { OPENCODE: ANY_VALUE } },
  { agent: "opencode", variables: { OPENCODE_BIN_PATH: ANY_VALUE } },
  { agent: "opencode", variables: { OPENCODE_SERVER: ANY_VALUE } },
  { agent: "opencode", variables: { OPENCODE_APP_INFO: ANY_VALUE } },
  { agent: "opencode", variables: { OPENCODE_MODES: ANY_VALUE } },
  { agent: "claude-code", variables: { CLAUDECODE: ANY_VALUE } },
  {
    agent: "cursor-agent",
    variables: { CURSOR_TRACE_ID: ANY_VALUE, PAGER: "head -n 10000 | cat" },
  },
  { agent: "cursor", variables: { CURSOR_TRACE_ID: ANY_VALUE } },
  { agent: "antigravity", variables: { ANTIGRAVITY_AGENT: ANY_VALUE } },
  { agent: "antigravity", variables: { ANTIGRAVITY_PROJECT_ID: ANY_VALUE } },
  { agent: "gemini-agent", variables: { GEMINI_CLI: "1" } },
  { agent: "codex", variables: { CODEX_THREAD_ID: ANY_VALUE } },
  { agent: "replit", variables: { REPL_ID: ANY_VALUE } },
  { agent: "aider", variables: { AIDER_API_KEY: ANY_VALUE } },
  {
    agent: "replit-assistant",
    variables: { REPL_ID: ANY_VALUE, REPLIT_MODE: "assistant" },
  },
  { agent: "windsurf", variables: { CODEIUM_EDITOR_APP_ROOT: ANY_VALUE } },
  { agent: "crush", variables: { CRUSH: "1" } },
  { agent: "crush", variables: { AGENT: "crush" } },
  { agent: "crush", variables: { AI_AGENT: "crush" } },
  { agent: "amp", variables: { AMP_CURRENT_THREAD_ID: ANY_VALUE } },
  { agent: "amp", variables: { AGENT: "amp" } },
  { agent: "auggie", variables: { AUGMENT_AGENT: "1" } },
  { agent: "qwen-code", variables: { QWEN_CODE: "1" } },
  {
    agent: "vscode-copilot-agent",
    variables: { TERM_PROGRAM: "vscode", GIT_PAGER: "cat" },
  },
  { agent: "warp", variables: { TERM_PROGRAM: "WarpTerminal" } },
  { agent: "pi", variables: { PI_CODING_AGENT: "true" } },
]

const CALLER_SETTING = "SERVER_E2E_CALLER_SETTING"
const KEPT = "kept from the caller"

// Where the caller's wrangler keeps its config, its cached skills list included.
const CALLER_CONFIG_HOME = join(tmpdir(), "the-callers-config")

let scratch: string
let github: StandInGitHub
let standIns: StandInCommand[]

const store = () => join(scratch, "store")

const standIn = (...args: Parameters<typeof standInCommand>) => {
  const command = standInCommand(...args)
  standIns.push(command)
  return command
}

const environmentFor = (command: StandInCommand) =>
  devEnvironment(scratch, { ...github.environment, ...command.environment })

const aLiveTest = () => new AbortController().signal

// What devEnvironment passes on from a caller whose environment also holds `variables`.
const passedOnFromACallerWith = (
  variables: Readonly<Record<string, string>>
) => {
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value)
  try {
    return devEnvironment(scratch, {})
  } finally {
    vi.unstubAllEnvs()
  }
}

const stillMatches = (environment: NodeJS.ProcessEnv, rule: AgentRule) =>
  Object.entries(rule.variables).every(([name, value]) => {
    const passed = environment[name]
    return value === ANY_VALUE
      ? passed !== undefined && passed !== ""
      : passed === value
  })

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "server-local-dev-"))
  github = await startStandInGitHub(scratch, githubServing({}))
  standIns = []
})

afterEach(async () => {
  for (const run of standIns.flatMap((command) => command.runs())) {
    stopIfRunning(run.pid)
  }
  await github.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe("devEnvironment", () => {
  it("passes on none of the variables wrangler reads as an AI agent, so wrangler asks GitHub nothing of its own", () => {
    const matchedStill = WRANGLER_AGENT_RULES.filter((rule) =>
      stillMatches(passedOnFromACallerWith(rule.variables), rule)
    )

    expect(matchedStill).toStrictEqual([])
  })

  it("passes on the rest of the caller's environment", () => {
    const passed = passedOnFromACallerWith({ [CALLER_SETTING]: KEPT })

    expect(passed[CALLER_SETTING]).toBe(KEPT)
  })

  it("gives wrangler a config folder inside the run's own scratch, so no skills list the caller's wrangler cached stands in for asking GitHub", () => {
    const passed = passedOnFromACallerWith({
      XDG_CONFIG_HOME: CALLER_CONFIG_HOME,
    })

    expect(
      passed.XDG_CONFIG_HOME?.startsWith(`${scratch}${sep}`),
      "wrangler reads the caller's cached skills list, so whether it asks GitHub depends on that list's age"
    ).toBe(true)
  })
})

describe("publishIntoLocalStore", () => {
  it("lets the stand-in GitHub in this worker answer what the publish asks it", async () => {
    const wrangler = standIn(scratch, "bunx", "asks-github")

    await publishIntoLocalStore(
      store(),
      PUBLISHED_INDEX,
      environmentFor(wrangler),
      aLiveTest()
    )

    expect(github.requested()).toStrictEqual([WRANGLER_AGENT_SKILLS_LIST])
  })

  it("stops the publish once the test has given up on it", async () => {
    const wrangler = standIn(scratch, "bunx", "runs-until-stopped")
    const test = new AbortController()
    let settled = false
    const markSettled = () => {
      settled = true
    }

    const publishing = publishIntoLocalStore(
      store(),
      PUBLISHED_INDEX,
      environmentFor(wrangler),
      test.signal
    )
    void publishing.then(markSettled, markSettled)
    // Subject guard: the abort below must land on a publish that is under way.
    expect(
      await cameTrueWithin(() => wrangler.runs().length > 0, STARTS_WITHIN_MS)
    ).toBe(true)
    test.abort()

    expect(
      await cameTrueWithin(() => settled, GONE_WITHIN_MS),
      "a publish its test gave up on runs on until wrangler exits by itself"
    ).toBe(true)
    const [outcome] = await Promise.allSettled([publishing])
    const { pid } = onlyRun(wrangler)

    expect(
      outcome.status,
      "a publish that outlives its test carries on into the next one's store"
    ).toBe("rejected")
    expect(await cameTrueWithin(() => !isRunning(pid), GONE_WITHIN_MS)).toBe(
      true
    )
  })
})

describe("startDev", () => {
  it("starts a dev server for a test still running, and stops it when asked", async () => {
    const dev = standIn(scratch, "bun", "runs-until-stopped")

    const session = await startDev(store(), environmentFor(dev), aLiveTest())
    const { pid, said } = onlyRun(dev)

    expect(session.origin).toBe(said)
    await session.stop()
    expect(await cameTrueWithin(() => !isRunning(pid), GONE_WITHIN_MS)).toBe(
      true
    )
  })

  it("stops the dev server it started once the test gives up", async () => {
    const dev = standIn(scratch, "bun", "runs-until-stopped")
    const test = new AbortController()

    await startDev(store(), environmentFor(dev), test.signal)
    const { pid } = onlyRun(dev)
    // Subject guard: the abort below must land on a server that is running.
    expect(isRunning(pid)).toBe(true)
    test.abort()

    expect(
      await cameTrueWithin(() => !isRunning(pid), GONE_WITHIN_MS),
      "a server its timed-out test started outlives the test, and nothing stops it"
    ).toBe(true)
  })

  it("stops waiting for a dev server once the test gives up on it", async () => {
    const dev = standIn(scratch, "bun", "never-says-ready")
    const test = new AbortController()
    let settled = false
    const markSettled = () => {
      settled = true
    }

    const starting = startDev(store(), environmentFor(dev), test.signal)
    void starting.then(markSettled, markSettled)
    // Subject guard: the abort below must land while the server is starting.
    expect(
      await cameTrueWithin(() => dev.runs().length > 0, STARTS_WITHIN_MS)
    ).toBe(true)
    test.abort()
    const { pid } = onlyRun(dev)

    expect(
      await cameTrueWithin(() => settled, GONE_WITHIN_MS),
      "a start its test gave up on keeps waiting for the server to say it is ready"
    ).toBe(true)
    await expect(starting).rejects.toBe(test.signal.reason)
    expect(await cameTrueWithin(() => !isRunning(pid), GONE_WITHIN_MS)).toBe(
      true
    )
  })

  it("refuses to start one for a test that has already given up", async () => {
    const dev = standIn(scratch, "bun", "runs-until-stopped")

    const [settled] = await Promise.allSettled([
      startDev(store(), environmentFor(dev), AbortSignal.abort()),
    ])

    expect(
      settled.status,
      "a server started after its test ended is one nothing stops"
    ).toBe("rejected")
    // A stand-in records its run only once it is up, so give one the time a start takes.
    await cameTrueWithin(() => dev.runs().length > 0, STARTS_WITHIN_MS)
    expect(dev.runs()).toStrictEqual([])
  })
})
