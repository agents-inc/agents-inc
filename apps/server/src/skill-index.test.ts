import { SELF, env } from "cloudflare:test"
import { hc } from "hono/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexSchema,
} from "@workspace/matrix/skill-index"

import { SKILL_INDEX_KEY } from "./skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"
import type { AppType } from "./index"

// These run the real worker in the real runtime against a simulated KV. What
// they cover is the whole of what the route now does: read one key, or refuse.
// The crawl that used to happen behind this route lives in `crawl.ts` and is
// covered beside it — nothing here reaches GitHub, and one test proves it.

const BASE = "https://api.test"

const STARS = 268_868

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Comfortably inside the window the route calls fresh, and comfortably outside
// it. Named rather than spelled out at each call site because what the tests
// assert is which side of the window a build falls on, not the arithmetic.
const RECENTLY = 2 * HOUR_MS
const LONG_ENOUGH_AGO_TO_BE_STALE = 30 * DAY_MS

const someTimeAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

// One entry within the per-skill cap and one far past it, because the weight is
// now part of what an entry IS: an index of uniformly small skills would let a
// route that dropped the field on the way out still look right.
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

// Parsed with the shared schema rather than asserted field by field: the route
// declares that schema as its 200, so a response that does not satisfy it is a
// broken contract however good the individual assertions below look.
const readIndex = async (response: Response): Promise<SkillIndex> =>
  skillIndexSchema.parse(await response.json())

const maxAgeOf = (response: Response) =>
  Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1])

describe("GET /skills", () => {
  // The pool stopped isolating storage between tests when it dropped
  // `isolatedStorage` in 0.20, and `reset()` would empty every binding —
  // including whatever another test file is holding. Clearing exactly this
  // route's key is the narrow version of the same thing.
  beforeEach(async () => {
    await env.CONFIGS.delete(SKILL_INDEX_KEY)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("serves the whole index the scheduled build published", async () => {
    const published = indexBuiltAt(someTimeAgo(RECENTLY))
    await publish(published)

    const response = await getIndex()

    expect(response.status).toBe(200)
    expect(await readIndex(response)).toStrictEqual(published)
  })

  // The point of the move. A request that reaches upstream is a request that
  // can be slow, rate-limited or refused, and this route can now be none of
  // those things — so any outbound call at all is the regression.
  it("reaches no upstream at all", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))
    const upstream = vi.fn(() =>
      Promise.reject(new Error("nothing may call out"))
    )
    vi.stubGlobal("fetch", upstream)

    const response = await getIndex()

    expect(response.status).toBe(200)
    expect(upstream).not.toHaveBeenCalled()
  })

  // Reachable exactly once in this worker's life: between a first deploy and
  // the first scheduled build that succeeds. The stored index never expires,
  // so nothing can take the route back here afterwards.
  it("503s before the scheduled build has ever published an index", async () => {
    const response = await getIndex()

    expect(response.status).toBe(503)
  })

  // Not 500, unlike a config under a content-addressed id. Nobody holds a link
  // to this key and the next scheduled build overwrites it, so bytes that no
  // longer satisfy the contract are an index this worker does not have rather
  // than an integrity failure it has to confess to.
  it("503s when what is stored is not an index", async () => {
    await env.CONFIGS.put(SKILL_INDEX_KEY, JSON.stringify({ skills: "no" }))

    const response = await getIndex()

    expect(response.status).toBe(503)
  })

  // The shape change that brought `bytes` in is handled by bumping the key, as
  // this module has always said it would be. What that buys is exactly this: an
  // index written by the crawl that predates the field is not read as a current
  // one and then rejected — it is not read at all, so the worker is never
  // serving a contract it has already outgrown.
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

  // The number the dialog refuses on. It is carried through untouched, which is
  // the only reason the refusal can arrive before a visitor stages anything.
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

  // The header's whole job now: the build is daily, so an index this old means
  // the scheduled build has missed several runs in a row and nothing else
  // anywhere would say so. The list is still real — it is served, at 200 —
  // and `max-age=0` is what stops a proxy holding onto it once it is not.
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

  it("does not admit any other origin", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "https://evil.example" },
    })

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  // Setting the freshness header is only half of sending it. A custom response
  // header is discarded by the browser unless the server also names it here,
  // with no error raised anywhere — so without this the header is set on every
  // response above, travels, and arrives as `null` in the one caller that
  // matters. Nothing else in either workspace notices: `SELF.fetch` and
  // `hc<AppType>` are not browsers and read it either way.
  it("lets a browser read the freshness header it sets", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))

    const response = await SELF.fetch(`${BASE}/skills`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.headers.get("access-control-expose-headers")).toContain(
      SKILL_INDEX_FRESHNESS_HEADER
    )
  })

  // Same reason the config routes have one: apps/editor reads its client off
  // `AppType`, so a route dropped out of the exported chain vanishes from the
  // editor's surface rather than failing here.
  it("is reachable through the typed client the editor uses", async () => {
    await publish(indexBuiltAt(someTimeAgo(RECENTLY)))
    const client = hc<AppType>(BASE, { fetch: SELF.fetch.bind(SELF) })

    const response = await client.skills.$get()

    expect(response.status).toBe(200)
    if (!response.ok) throw new Error("the index was not served")
    expect((await response.json()).skills).toHaveLength(2)
  })
})
