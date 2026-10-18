import {
  MALFORMED_CATALOG,
  MARKETPLACE_CATALOG,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_REF,
  catalogForbiddenHandler,
  catalogUnauthorizedHandler,
  catalogUnreachableHandler,
  malformedCatalogHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import {
  canonicalMarketplaceRef,
  catalogUrl,
  fetchCatalog,
  parseMarketplaceRef,
} from "./catalog"

const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

// `clearMocks` does not restore a stubbed global.
afterEach(() => {
  vi.unstubAllGlobals()
})

const PRIVATE_SKILL_ID = "acme-internal-billing-ledger"

// Broken one level down, so the failure path carries a record key.
const CATALOG_WITH_A_BROKEN_SKILL = {
  ...MARKETPLACE_CATALOG,
  skills: { [PRIVATE_SKILL_ID]: { id: PRIVATE_SKILL_ID } },
}

// Stubs the transport: this payload is the test's own, not a shared fixture.
const serving = (body: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )

describe("parseMarketplaceRef", () => {
  it.each([
    ["acme/skills", { owner: "acme", repo: "skills" }],
    ["github:acme/skills", { owner: "acme", repo: "skills" }],
    ["gh:acme/skills", { owner: "acme", repo: "skills" }],
    ["  acme/skills  ", { owner: "acme", repo: "skills" }],
    ["https://github.com/acme/skills", { owner: "acme", repo: "skills" }],
  ])("reads %s as the repository behind it", (input, expected) => {
    expect(parseMarketplaceRef(input)).toStrictEqual(expected)
  })

  it("carries a branch through when one is named", () => {
    expect(parseMarketplaceRef("acme/skills#next")).toStrictEqual({
      owner: "acme",
      repo: "skills",
      ref: "next",
    })
  })

  it.each(["", "   ", "acme", "acme/", "/skills", "acme/skills/extra"])(
    "refuses %o as a marketplace",
    (input) => {
      expect(parseMarketplaceRef(input)).toBeUndefined()
    }
  )
})

describe("canonicalMarketplaceRef", () => {
  it.each([
    ["acme/skills", "github:acme/skills"],
    ["github:acme/skills", "github:acme/skills"],
    ["gh:acme/skills", "github:acme/skills"],
    ["https://github.com/acme/skills", "github:acme/skills"],
    ["https://github.com/acme/skills.git", "github:acme/skills"],
    ["  acme/skills  ", "github:acme/skills"],
  ])("reads %o as %o", (input, expected) => {
    expect(canonicalMarketplaceRef(input)).toBe(expected)
  })

  it("keeps a branch on the end of the canonical form", () => {
    expect(canonicalMarketplaceRef("acme/skills#next")).toBe(
      "github:acme/skills#next"
    )
  })

  // Runs on every read of the slot, so it must be idempotent.
  it("leaves a ref that is already canonical alone", () => {
    expect(canonicalMarketplaceRef("github:acme/skills")).toBe(
      canonicalMarketplaceRef(canonicalMarketplaceRef("acme/skills"))
    )
  })

  it.each(["", "   ", "acme", "acme/skills/extra"])(
    "hands %o back trimmed rather than inventing a repository",
    (input) => {
      expect(canonicalMarketplaceRef(input)).toBe(input.trim())
    }
  )
})

describe("catalogUrl", () => {
  it("addresses the catalogue beside the marketplace manifest", () => {
    expect(catalogUrl({ owner: "acme", repo: "skills" })).toBe(
      "https://api.github.com/repos/acme/skills/contents/.claude-plugin/catalog.json"
    )
  })

  it("asks for the named branch when there is one", () => {
    expect(catalogUrl({ owner: "acme", repo: "skills", ref: "next" })).toBe(
      "https://api.github.com/repos/acme/skills/contents/.claude-plugin/catalog.json?ref=next"
    )
  })
})

describe("fetchCatalog", () => {
  it("returns the catalogue the marketplace published", async () => {
    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({ ok: true, matrix: MARKETPLACE_CATALOG })
  })

  it("reads a public marketplace with no token at all", async () => {
    const seen: (string | null)[] = []
    configMockServer.events.on("request:start", ({ request }) => {
      seen.push(request.headers.get("Authorization"))
    })

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result.ok).toBe(true)
    expect(seen).toStrictEqual([null])
    configMockServer.events.removeAllListeners()
  })

  it("reads a private marketplace once the token authorizes it", async () => {
    const result = await fetchCatalog(
      PRIVATE_MARKETPLACE_REF,
      MARKETPLACE_TOKEN
    )

    expect(result).toStrictEqual({ ok: true, matrix: MARKETPLACE_CATALOG })
  })

  it("reads a 404 as something a token might fix", async () => {
    const result = await fetchCatalog(PRIVATE_MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "unauthorized",
      error:
        "acme/private-skills could not be read (404) — if it is private, a token with repo access will reach it",
    })
  })

  it("reads a 401 as something a token might fix", async () => {
    configMockServer.use(catalogUnauthorizedHandler)

    const result = await fetchCatalog(MARKETPLACE_REF, "ghp_stale")

    expect(result).toStrictEqual({
      ok: false,
      kind: "unauthorized",
      error:
        "acme/skills could not be read (401) — if it is private, a token with repo access will reach it",
    })
  })

  it("reads a 403 as something a token might fix", async () => {
    configMockServer.use(catalogForbiddenHandler)

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ kind: "unauthorized" })
  })

  it("names the field a malformed catalogue got wrong", async () => {
    configMockServer.use(malformedCatalogHandler)

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "invalid",
      error:
        "acme/skills published an unreadable catalog.json — skills: invalid_type",
    })
  })

  it("reports the malformed catalogue without carrying its contents", async () => {
    configMockServer.use(malformedCatalogHandler)

    await fetchCatalog(MARKETPLACE_REF)

    expect(sink.issue).toHaveBeenCalledWith(
      "Marketplace published an unreadable catalog",
      { issues: ["skills: invalid_type"] }
    )
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      MALFORMED_CATALOG.version
    )
  })

  // Asserted over the whole call log: a check on `issues` alone passes while
  // the path leaks.
  it("names no skill of the marketplace's own in what it reports", async () => {
    vi.stubGlobal("fetch", serving(CATALOG_WITH_A_BROKEN_SKILL))

    await fetchCatalog(PRIVATE_MARKETPLACE_REF, MARKETPLACE_TOKEN)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_SKILL_ID
    )
  })

  it("names the broken entry in full on screen", async () => {
    vi.stubGlobal("fetch", serving(CATALOG_WITH_A_BROKEN_SKILL))

    const result = await fetchCatalog(
      PRIVATE_MARKETPLACE_REF,
      MARKETPLACE_TOKEN
    )

    expect(result).toMatchObject({ ok: false, kind: "invalid" })
    expect(JSON.stringify(result)).toContain(`skills.${PRIVATE_SKILL_ID}.slug`)
  })

  it("reads an unreachable GitHub as its own kind of failure", async () => {
    configMockServer.use(catalogUnreachableHandler)

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "acme/skills is unreachable — check the connection and try again",
    })
  })

  it("refuses a marketplace that is not a repository without asking GitHub", async () => {
    const seen: string[] = []
    configMockServer.events.on("request:start", ({ request }) => {
      seen.push(request.url)
    })

    const result = await fetchCatalog("acme")

    expect(result).toStrictEqual({
      ok: false,
      kind: "invalid",
      error: 'acme is not a marketplace — name one as "owner/repo"',
    })
    expect(seen).toStrictEqual([])
    configMockServer.events.removeAllListeners()
  })
})

describe("parseMarketplaceRef on a pasted address", () => {
  it("reads an http address as the repository behind it", () => {
    expect(parseMarketplaceRef("http://github.com/acme/skills")).toStrictEqual({
      owner: "acme",
      repo: "skills",
    })
  })
})

describe("what fetchCatalog asks GitHub for", () => {
  // The raw bytes, rather than the base64 envelope the API answers by default.
  it("asks for the catalogue's raw bytes", async () => {
    const fetching = serving(MARKETPLACE_CATALOG)
    vi.stubGlobal("fetch", fetching)

    await fetchCatalog(MARKETPLACE_REF)

    expect(fetching).toHaveBeenCalledWith(
      catalogUrl({ owner: "acme", repo: "skills" }),
      { headers: { Accept: "application/vnd.github.raw+json" } }
    )
  })
})

const INTERNAL_SERVER_ERROR = 500

describe("what fetchCatalog says when it cannot read a catalogue", () => {
  // No token fixes a server error, so the advice is to retry.
  it("offers a retry for a status no token can change, and reports it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: INTERNAL_SERVER_ERROR })
        )
    )

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "acme/skills could not be read (500) — try again",
    })
    expect(sink.issue).toHaveBeenCalledWith("Marketplace catalog GET failed", {
      status: INTERNAL_SERVER_ERROR,
    })
  })

  it("names the root when what was published is not a catalogue at all", async () => {
    vi.stubGlobal("fetch", serving("not a catalogue"))

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "invalid",
      error:
        "acme/skills published an unreadable catalog.json — (root): invalid_type",
    })
    expect(sink.issue).toHaveBeenCalledWith(
      "Marketplace published an unreadable catalog",
      { issues: ["(root): invalid_type"] }
    )
  })

  it("names every field a malformed catalogue got wrong, in one message", async () => {
    vi.stubGlobal("fetch", serving({ ...MALFORMED_CATALOG, version: 7 }))

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "invalid",
      error:
        "acme/skills published an unreadable catalog.json — version: invalid_type, skills: invalid_type",
    })
  })

  it("names the marketplace as typed, without the padding around it", async () => {
    expect(await fetchCatalog("  acme  ")).toStrictEqual({
      ok: false,
      kind: "invalid",
      error: 'acme is not a marketplace — name one as "owner/repo"',
    })
  })
})
