import { SELF, env } from "cloudflare:test"
import { SKILL_INDEX_UNAVAILABLE_BODY } from "@workspace/api-mocks/fixtures"
import { hc } from "hono/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexSchema,
} from "@workspace/matrix/skill-index"

import { upstreamMock } from "../vitest.setup"
import { SKILL_INDEX_KEY } from "./skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"
import type { AppType } from "./index"

const BASE = "https://api.test"

const STARS = 268_868

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const RECENTLY = 2 * HOUR_MS
const LONG_ENOUGH_AGO_TO_BE_STALE = 30 * DAY_MS

const someTimeAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

// One entry far past the per-skill cap, so a dropped `bytes` field shows.
const CARRIABLE_BYTES = 80_159
const OVERSIZED_BYTES = 1_128_695

const indexBuiltAt = (builtAt: string): SkillIndex => ({
  builtAt,
  skills: [
    {
      name: "brainstorming",
      description: "From KV, because nothing else can put it there",
      repo: "obra/superpowers",
      path: "skills/brainstorming",
      stars: STARS,
      bytes: CARRIABLE_BYTES,
    },
    {
      name: "docx",
      description: "The second entry, so a whole index is distinguishable",
      repo: "anthropics/skills",
      path: "skills/docx",
      stars: STARS,
      bytes: OVERSIZED_BYTES,
    },
  ],
})

const publish = (index: SkillIndex) =>
  env.CONFIGS.put(SKILL_INDEX_KEY, JSON.stringify(index))

const getIndex = () => SELF.fetch(`${BASE}/skills`)

const readIndex = async (response: Response): Promise<SkillIndex> =>
  skillIndexSchema.parse(await response.json())

const maxAgeOf = (response: Response) =>
  Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1])

describe("GET /skills", () => {
  // Storage is shared across files; clear only this route's key.
  beforeEach(async () => {
    await env.CONFIGS.delete(SKILL_INDEX_KEY)
  })

  // `clearMocks` does not restore a spy.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("serves the whole index the scheduled build published", async () => {
    const published = indexBuiltAt(someTimeAgo(RECENTLY))
    await publish(published)

    const response = await getIndex()

    expect(response.status).toBe(200)
    expect(await readIndex(response)).toStrictEqual(published)
  })

  // Any outbound call is the regression; the list names where it went.
  it("reaches no upstream at all", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))
    const reached: string[] = []
    upstreamMock.events.on("request:start", ({ request }) => {
      reached.push(request.url)
    })

    const response = await getIndex()

    expect(response.status).toBe(200)
    expect(reached).toStrictEqual([])
  })

  // Only between a first deploy and the first successful build.
  it("503s before the scheduled build has ever published an index", async () => {
    const response = await getIndex()

    expect(response.status).toBe(503)
  })

  // Against the api-mocks constant, so its mirror of this body cannot drift.
  it("says the index is not available yet in the body of its 503", async () => {
    const response = await getIndex()

    expect(await response.text()).toBe(SKILL_INDEX_UNAVAILABLE_BODY)
  })

  it("503s, and logs why, when the store refuses the read", async () => {
    vi.spyOn(env.CONFIGS, "get").mockRejectedValueOnce(
      new Error("the store is down")
    )
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await getIndex()

    expect(response.status).toBe(503)
    expect(logged).toHaveBeenCalledWith({
      event: "skill_index_failure",
      reason: "could not read the published index: the store is down",
    })
  })

  // The build publishes; a stored index the worker cannot serve is its signal.
  it("logs that the published index broke the contract when it cannot serve it", async () => {
    await env.CONFIGS.put(SKILL_INDEX_KEY, JSON.stringify({ skills: "no" }))
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    await getIndex()

    expect(logged).toHaveBeenCalledWith({
      event: "skill_index_failure",
      reason: "the published index no longer matches the contract",
    })
  })

  // 503, not 500: the next build overwrites it and nobody links to it.
  it("503s when what is stored is not an index", async () => {
    await env.CONFIGS.put(SKILL_INDEX_KEY, JSON.stringify({ skills: "no" }))

    const response = await getIndex()

    expect(response.status).toBe(503)
  })

  // A pre-`bytes` index lives under the old key and is never read.
  it("does not read an index published under the superseded key", async () => {
    const retired = "skill-index:v1"
    expect(SKILL_INDEX_KEY).not.toBe(retired)
    await env.CONFIGS.put(
      retired,
      JSON.stringify(indexBuiltAt(someTimeAgo(RECENTLY)))
    )

    const response = await getIndex()

    expect(response.status).toBe(503)
    await env.CONFIGS.delete(retired)
  })

  it("503s when the stored bytes are not JSON at all", async () => {
    await env.CONFIGS.put(SKILL_INDEX_KEY, "half a jso")

    const response = await getIndex()

    expect(response.status).toBe(503)
  })

  it("serves each entry's weight, which is what a caller refuses on", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const index = await readIndex(await getIndex())

    expect(index.skills.map((skill) => skill.bytes)).toStrictEqual([
      CARRIABLE_BYTES,
      OVERSIZED_BYTES,
    ])
  })

  it("calls a recently built index fresh, and says how long that lasts", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await getIndex()

    expect(response.headers.get(SKILL_INDEX_FRESHNESS_HEADER)).toBe("fresh")
    expect(maxAgeOf(response)).toBeGreaterThan(0)
  })

  // Several missed builds; `max-age=0` stops proxies holding it.
  it("calls a long-unrefreshed index stale, and asks callers not to hold it", async () => {
    await publish(indexBuiltAt(someTimeAgo(LONG_ENOUGH_AGO_TO_BE_STALE)))

    const response = await getIndex()
    const index = await readIndex(response)

    expect(response.status).toBe(200)
    expect(response.headers.get(SKILL_INDEX_FRESHNESS_HEADER)).toBe("stale")
    expect(maxAgeOf(response)).toBe(0)
    expect(index.skills).toHaveLength(2)
  })

  it("admits the configured web origin", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    )
  })

  // Each CORS run appends `Origin` to Vary, so a second mount covering this
  // path names it twice.
  it("names the origin once in Vary", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("vary")).toBe("Origin")
  })

  it("does not admit any other origin", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "https://evil.example" },
    })

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  // A custom header is invisible cross-origin unless exposed.
  it("lets a browser read the freshness header it sets", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.headers.get("access-control-expose-headers")).toContain(
      SKILL_INDEX_FRESHNESS_HEADER
    )
  })

  // A route dropped from the exported chain vanishes from the client.
  it("is reachable through the typed client the editor uses", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))
    const client = hc<AppType>(BASE, { fetch: SELF.fetch.bind(SELF) })

    const response = await client.skills.$get()

    expect(response.status).toBe(200)
    if (!response.ok) throw new Error("the index was not served")
    expect((await response.json()).skills).toHaveLength(2)
  })
})
