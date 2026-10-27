import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { HttpResponse, delay, http } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { INDEXED_REPOS } from "../src/crawl"
import {
  WRANGLER_AGENT_SKILLS_LIST,
  devEnvironment,
  publishIntoLocalStore,
  startDev,
} from "./helpers/local-dev"
import { githubServing, startStandInGitHub } from "./helpers/stand-in-github"

import type { SkillIndex, SkillIndexEntry } from "@workspace/matrix/skill-index"
import type { DevSession } from "./helpers/local-dev"
import type { StandInGitHub, StandInRepo } from "./helpers/stand-in-github"

// `bun run dev` builds the local skill index when missing or older than three
// days, and applies the local D1 migrations, before the worker starts. Each
// case runs over its own store with a stand-in GitHub.

const DAY_MS = 24 * 60 * 60 * 1000

// Far enough either side of three days that the run's own minutes don't matter.
const OLDER_THAN_THREE_DAYS = 4 * DAY_MS
const YOUNGER_THAN_THREE_DAYS = 1 * DAY_MS

// An entry carrying their sum came from the crawl.
const MANIFEST_BYTES = 1_024
const REFERENCE_BYTES = 2_048

const GITHUB_AUTHORIZE = /^https:\/\/github\.com\/login\/oauth\/authorize\?/

const builtAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

const standInSkill = (repo: string, at: number): SkillIndexEntry => {
  const name = `stand-in-skill-${String(at + 1)}`
  return {
    name,
    description: `Crawled from the stand-in ${repo}, never from github.com`,
    repo,
    path: `skills/${name}`,
    stars: 1_000 + at,
    bytes: MANIFEST_BYTES + REFERENCE_BYTES,
  }
}

const CRAWLED: SkillIndexEntry[] = INDEXED_REPOS.map(standInSkill)

const BUILT_FROM_THE_CRAWL: Record<keyof SkillIndex, unknown> = {
  builtAt: expect.any(String),
  skills: CRAWLED,
}

const skillMd = ({ name, description }: SkillIndexEntry) =>
  [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
  ].join("\n")

const repoHolding = (skill: SkillIndexEntry): StandInRepo => ({
  stars: skill.stars,
  defaultBranch: "main",
  tree: [
    { path: "skills", type: "tree" },
    { path: skill.path, type: "tree" },
    { path: `${skill.path}/SKILL.md`, type: "blob", size: MANIFEST_BYTES },
    {
      path: `${skill.path}/references/guide.md`,
      type: "blob",
      size: REFERENCE_BYTES,
    },
  ],
  files: { [`${skill.path}/SKILL.md`]: skillMd(skill) },
})

const ESTATE: Record<string, StandInRepo> = Object.fromEntries(
  CRAWLED.map((skill) => [skill.repo, repoHolding(skill)])
)

// Served means the store was left alone; absent means it was rebuilt.
const LEFT_OVER: SkillIndexEntry = {
  name: "left-over-skill",
  description: "What the store held before this run of `bun run dev`",
  repo: "obra/superpowers",
  path: "skills/left-over-skill",
  stars: 1,
  bytes: 1,
}

// Claude Code's, which wrangler reads as an AI agent it installs skills for.
const AN_AI_AGENT = { CLAUDECODE: "1" }

const GITHUB_DOWN = [
  http.all("*", () => new HttpResponse(null, { status: 503 })),
]

// Wrangler's own GitHub requests are excluded.
const askedByTheCrawl = (url: string) => {
  const { pathname } = new URL(url)
  return INDEXED_REPOS.some((repo) => pathname.includes(`/${repo}`))
}

// A network that drops packets.
const GITHUB_SILENT = [
  http.all("*", ({ request }) =>
    askedByTheCrawl(request.url)
      ? delay("infinite")
      : new HttpResponse(null, { status: 404 })
  ),
]

const indexBuiltAgo = (ms: number): SkillIndex => ({
  builtAt: builtAgo(ms),
  skills: [LEFT_OVER],
})

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// Reads the body so no connection stays open while the worker stops.
const askForIndex = async (running: DevSession) => {
  const response = await fetch(`${running.origin}/skills`)
  return {
    status: response.status,
    freshness: response.headers.get(SKILL_INDEX_FRESHNESS_HEADER),
    body: parseJson(await response.text()),
  }
}

// Better Auth writes OAuth state to D1 first, so this fails unmigrated.
const startSigningIn = async (running: DevSession) => {
  const response = await fetch(`${running.origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "github" }),
  })
  return { status: response.status, body: parseJson(await response.text()) }
}

let scratch: string
let github: StandInGitHub
let dev: DevSession | undefined

const store = () => join(scratch, "store")

const environment = () => devEnvironment(scratch, github.environment)

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "server-dev-e2e-"))
  github = await startStandInGitHub(scratch, githubServing(ESTATE))
})

afterEach(async () => {
  await dev?.stop()
  dev = undefined
  await github.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe("`bun run dev` in apps/server", () => {
  it("builds the skill index into a store that has none, before the worker answers", async ({
    signal,
  }) => {
    dev = await startDev(store(), environment(), signal)

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual(BUILT_FROM_THE_CRAWL)
  })

  it("rebuilds an index older than three days", async ({ signal }) => {
    await publishIntoLocalStore(
      store(),
      indexBuiltAgo(OLDER_THAN_THREE_DAYS),
      environment(),
      signal
    )
    dev = await startDev(store(), environment(), signal)

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual(BUILT_FROM_THE_CRAWL)
  })

  // A fresh index is not rebuilt.
  it("keeps an index younger than three days, and asks GitHub for nothing", async ({
    signal,
  }) => {
    const kept = indexBuiltAgo(YOUNGER_THAN_THREE_DAYS)
    await publishIntoLocalStore(store(), kept, environment(), signal)
    dev = await startDev(store(), environment(), signal)

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual(kept)
    expect(github.requested()).toStrictEqual([])
  })

  // The check above can fail: a variable let through is a request, whatever
  // the caller's wrangler has cached.
  it("keeps an index younger than three days, and asks GitHub only for wrangler's skills list once an AI agent's variable is let through", async ({
    signal,
  }) => {
    const underAnAgent = devEnvironment(scratch, {
      ...github.environment,
      ...AN_AI_AGENT,
    })
    const kept = indexBuiltAgo(YOUNGER_THAN_THREE_DAYS)
    await publishIntoLocalStore(store(), kept, underAnAgent, signal)
    dev = await startDev(store(), underAnAgent, signal)

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.body).toStrictEqual(kept)
    expect(
      new Set(github.requested()),
      "the check above cannot see a variable let through: wrangler answered from a skills list cached outside this run, or no longer asks for one"
    ).toStrictEqual(new Set([WRANGLER_AGENT_SKILLS_LIST]))
  })

  it("applies the local D1 migrations, so signing in starts instead of failing", async ({
    signal,
  }) => {
    dev = await startDev(store(), environment(), signal)

    const signIn = await startSigningIn(dev)
    const toGitHub: Record<string, unknown> = {
      url: expect.stringMatching(GITHUB_AUTHORIZE),
      redirect: true,
    }

    expect(signIn.status, dev.output()).toBe(200)
    expect(signIn.body).toStrictEqual(toGitHub)
  })

  // GitHub out of reach never stops the worker from starting.
  describe("when GitHub cannot be reached", () => {
    beforeEach(async () => {
      await github.close()
      github = await startStandInGitHub(scratch, GITHUB_DOWN)
    })

    it("still starts the worker over a store with no index, and says skill search answers 503", async ({
      signal,
    }) => {
      dev = await startDev(store(), environment(), signal)

      const served = await askForIndex(dev)

      expect(served.status, dev.output()).toBe(503)
      expect(dev.output()).toMatch(
        /skill index was not built, so Add skill search answers 503/
      )
      expect(github.requested()).not.toStrictEqual([])
    })

    // A stale index is still served, so 503 would be false.
    it("still starts the worker over a stale index, and says it serves that copy marked stale", async ({
      signal,
    }) => {
      const left = indexBuiltAgo(OLDER_THAN_THREE_DAYS)
      await publishIntoLocalStore(store(), left, environment(), signal)
      dev = await startDev(store(), environment(), signal)

      const served = await askForIndex(dev)

      expect(served.status, dev.output()).toBe(200)
      expect(served.freshness).toBe("stale")
      expect(served.body).toStrictEqual(left)
      expect(dev.output()).toContain(
        `serves the copy built at ${left.builtAt}, marked stale`
      )
    })
  })

  // The crawl gets 30 s; `startDev` gives up after 90 s.
  describe("when GitHub never answers", () => {
    beforeEach(async () => {
      await github.close()
      github = await startStandInGitHub(scratch, GITHUB_SILENT)
    })

    it("stops the crawl after 30 s, starts the worker, and says skill search answers 503", async ({
      signal,
    }) => {
      dev = await startDev(store(), environment(), signal)

      const served = await askForIndex(dev)

      expect(served.status, dev.output()).toBe(503)
      expect(dev.output()).toContain("took longer than 30 s, so it was stopped")
      expect(dev.output()).toMatch(
        /skill index was not built, so Add skill search answers 503/
      )
      expect(github.requested()).not.toStrictEqual([])
    })
  })
})
