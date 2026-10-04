import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { HttpResponse, delay, http } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { INDEXED_REPOS } from "../src/crawl"
import {
  devEnvironment,
  publishIntoLocalStore,
  startDev,
} from "./helpers/local-dev"
import { githubServing, startStandInGitHub } from "./helpers/stand-in-github"

import type { SkillIndex, SkillIndexEntry } from "@workspace/matrix/skill-index"
import type { DevSession } from "./helpers/local-dev"
import type { StandInGitHub, StandInRepo } from "./helpers/stand-in-github"

// `bun run dev` is how a developer starts the worker the editor talks to, and
// it has to leave that worker able to do what production's does (owner,
// 2026-10-02, journey 25: "Get local in line with prod").
//
// Two things stood in the way. `GET /skills` serves one KV key that only the
// daily workflow writes, and it writes production's store — so a local worker
// answered 503 and the editor's Add skill search found nothing. And nothing
// applied the D1 migrations, so signing in failed. The ruling: before the
// worker starts, `bun run dev` builds the local skill index the way the
// workflow does whenever the store has none or holds one older than three
// days, and applies the local migrations.
//
// Each case starts `bun run dev` over a store of its own, with GitHub played
// by a stand-in on the network path, and asks the running worker what the
// editor would. Nothing here reaches github.com.

const DAY_MS = 24 * 60 * 60 * 1000

// Either side of the three days the ruling and the worker's own `freshnessOf`
// draw the line at, far enough from it that the run's own minutes cannot
// carry a build across.
const OLDER_THAN_THREE_DAYS = 4 * DAY_MS
const YOUNGER_THAN_THREE_DAYS = 1 * DAY_MS

// What the stand-in tree reports for each skill's two files. The crawl weighs
// a directory from these, so an entry carrying their sum came from the crawl.
const MANIFEST_BYTES = 1_024
const REFERENCE_BYTES = 2_048

// Where signing in sends the browser next.
const GITHUB_AUTHORIZE = /^https:\/\/github\.com\/login\/oauth\/authorize\?/

const builtAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

/** One skill in each allowlisted repository, as the crawl should index it. */
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

// What a store held before this run — named so that seeing it served means
// the store was left alone, and not seeing it means it was rebuilt.
const LEFT_OVER: SkillIndexEntry = {
  name: "left-over-skill",
  description: "What the store held before this run of `bun run dev`",
  repo: "obra/superpowers",
  path: "skills/left-over-skill",
  stars: 1,
  bytes: 1,
}

// GitHub answering nothing the crawl can use, which is what a developer who
// is offline, or on a bad day for GitHub, gets from it.
const GITHUB_DOWN = [
  http.all("*", () => new HttpResponse(null, { status: 503 })),
]

// The crawl's requests, and not wrangler's own: run under an AI agent,
// wrangler asks GitHub for its skill list whenever the day-long cache in its
// global config has lapsed, and that wait is not the crawl's.
const askedByTheCrawl = (url: string) => {
  const { pathname } = new URL(url)
  return INDEXED_REPOS.some((repo) => pathname.includes(`/${repo}`))
}

// GitHub taking every request the crawl makes and answering none, which is
// what a network that drops packets gets from it: the crawl waits on each
// until its runtime gives up, about five minutes later.
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

// What the editor's Add skill dialog asks for. The body is always read, so no
// response holds its connection open while the worker is stopped.
const askForIndex = async (running: DevSession) => {
  const response = await fetch(`${running.origin}/skills`)
  return {
    status: response.status,
    freshness: response.headers.get(SKILL_INDEX_FRESHNESS_HEADER),
    body: parseJson(await response.text()),
  }
}

// The first call the editor's Sign in button makes. Better Auth records the
// OAuth state in D1 before it answers, so this fails on a database nothing
// migrated, and needs no network: it only builds GitHub's URL.
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
  it("builds the skill index into a store that has none, before the worker answers", async () => {
    dev = await startDev(store(), environment())

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual({
      builtAt: expect.any(String) as string,
      skills: CRAWLED,
    })
  })

  it("rebuilds an index older than three days", async () => {
    publishIntoLocalStore(
      store(),
      indexBuiltAgo(OLDER_THAN_THREE_DAYS),
      environment()
    )
    dev = await startDev(store(), environment())

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual({
      builtAt: expect.any(String) as string,
      skills: CRAWLED,
    })
  })

  // The other half of "whenever it is missing or older than three days":
  // an index still inside the window is the current picture, and rebuilding
  // it on every start would spend GitHub's anonymous allowance for nothing.
  it("keeps an index younger than three days, and asks GitHub for nothing", async () => {
    const kept = indexBuiltAgo(YOUNGER_THAN_THREE_DAYS)
    publishIntoLocalStore(store(), kept, environment())
    dev = await startDev(store(), environment())

    const served = await askForIndex(dev)

    expect(served.status, dev.output()).toBe(200)
    expect(served.freshness).toBe("fresh")
    expect(served.body).toStrictEqual(kept)
    expect(github.requested()).toStrictEqual([])
  })

  it("applies the local D1 migrations, so signing in starts instead of failing", async () => {
    dev = await startDev(store(), environment())

    const signIn = await startSigningIn(dev)

    expect(signIn.status, dev.output()).toBe(200)
    expect(signIn.body).toStrictEqual({
      url: expect.stringMatching(GITHUB_AUTHORIZE) as string,
      redirect: true,
    })
  })

  // Owner's decision after the red stage, 2026-10-02: GitHub out of reach
  // never stops the worker from starting, and `bun run dev` says in one line
  // what skill search will do instead.
  describe("when GitHub cannot be reached", () => {
    beforeEach(async () => {
      await github.close()
      github = await startStandInGitHub(scratch, GITHUB_DOWN)
    })

    it("still starts the worker over a store with no index, and says skill search answers 503", async () => {
      dev = await startDev(store(), environment())

      const served = await askForIndex(dev)

      expect(served.status, dev.output()).toBe(503)
      expect(dev.output()).toMatch(
        /skill index was not built, so Add skill search answers 503/
      )
      expect(github.requested()).not.toStrictEqual([])
    })

    // A stale index is still served, marked stale, so saying 503 here would
    // be false.
    it("still starts the worker over a stale index, and says it serves that copy marked stale", async () => {
      const left = indexBuiltAgo(OLDER_THAN_THREE_DAYS)
      publishIntoLocalStore(store(), left, environment())
      dev = await startDev(store(), environment())

      const served = await askForIndex(dev)

      expect(served.status, dev.output()).toBe(200)
      expect(served.freshness).toBe("stale")
      expect(served.body).toStrictEqual(left)
      expect(dev.output()).toContain(
        `serves the copy built at ${left.builtAt}, marked stale`
      )
    })
  })

  // Review of the same change, 2026-10-02: on a network that drops packets
  // the worker did not start for about five minutes, with nothing on screen
  // but the line saying the index was being built. The crawl now gets 30 s,
  // and running out of them is the offline case, said the offline way.
  // `startDev` gives up on a worker not ready within 90 s, so a crawl left
  // to wait out its runtime fails here.
  describe("when GitHub never answers", () => {
    beforeEach(async () => {
      await github.close()
      github = await startStandInGitHub(scratch, GITHUB_SILENT)
    })

    it("stops the crawl after 30 s, starts the worker, and says skill search answers 503", async () => {
      dev = await startDev(store(), environment())

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
