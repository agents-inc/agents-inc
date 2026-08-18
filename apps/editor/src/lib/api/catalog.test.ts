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
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import { catalogUrl, fetchCatalog, parseMarketplaceRef } from "./catalog"

// The editor's half of a marketplace's `catalog.json`. Fetched from GitHub
// DIRECTLY rather than through our worker, which is the whole design: org
// content never transits anything of ours, and the token that authorizes it
// never leaves the browser it was pasted into.
//
// What is under test is the translation, exactly as `skill-index.test.ts` tests
// its own: a status GitHub documents becomes one of this module's result kinds,
// and the kind is what decides whether the dialog offers a token, names a
// broken build, or says the network is down. Three different fixes, so folding
// any two together would send an author to the wrong one.

const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

// The dialog's field is the marketplace, and a marketplace is a repository. The
// `github:` prefix is what `--marketplace` takes on the CLI, so a value copied
// from one surface to the other has to work on both.
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

  // A branch or tag on the end, which is how an author tests a catalogue before
  // it is on the default branch.
  it("carries a branch through when one is named", () => {
    expect(parseMarketplaceRef("acme/skills#next")).toStrictEqual({
      owner: "acme",
      repo: "skills",
      ref: "next",
    })
  })

  // A name is not a repository. Refusing here is what keeps the failure at the
  // field the user is looking at rather than in a 404 from GitHub.
  it.each(["", "   ", "acme", "acme/", "/skills", "acme/skills/extra"])(
    "refuses %o as a marketplace",
    (input) => {
      expect(parseMarketplaceRef(input)).toBeUndefined()
    }
  )
})

// The path is `.claude-plugin/catalog.json` because that is where `build
// marketplace` writes it, beside the manifest. Pinned because the two halves
// are in different packages and nothing else would notice them disagreeing.
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

  // The whole reason the token is optional: the public case has to work with
  // the field left empty, and it has to work without sending an empty header.
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

  // The token authorizes; it never identifies. The marketplace is still what
  // says which repository, and the token only decides whether we may read it.
  it("reads a private marketplace once the token authorizes it", async () => {
    const result = await fetchCatalog(
      PRIVATE_MARKETPLACE_REF,
      MARKETPLACE_TOKEN
    )

    expect(result).toStrictEqual({ ok: true, matrix: MARKETPLACE_CATALOG })
  })

  // GitHub 404s a private repository for a caller who may not see it, so this
  // status cannot mean "wrong name" — it has to offer the token.
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

  // 403 is scopes or the anonymous rate limit, and both are fixed by a token.
  it("reads a 403 as something a token might fix", async () => {
    configMockServer.use(catalogForbiddenHandler)

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ kind: "unauthorized" })
  })

  // The failure with no retry in it. The bytes parsed as JSON and are not a
  // catalogue, so asking again returns the same bytes — what has to change is
  // the author's build, and the message names the field that says so.
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

  // Diagnostics carry the paths and the codes, never the catalogue: a private
  // marketplace's skill names are the org's, and the whole point of fetching
  // browser-direct is that they stay there.
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

  it("reads an unreachable GitHub as its own kind of failure", async () => {
    configMockServer.use(catalogUnreachableHandler)

    const result = await fetchCatalog(MARKETPLACE_REF)

    expect(result).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "acme/skills is unreachable — check the connection and try again",
    })
  })

  // Refused at the field rather than sent to GitHub as a URL that cannot exist.
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
