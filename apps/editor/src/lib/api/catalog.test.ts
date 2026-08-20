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

// `clearMocks` empties the spies; it does not put a stubbed global back. One
// test below serves its own catalogue that way, and leaving the stub in place
// would silently take the mocked GitHub away from every test after it.
afterEach(() => {
  vi.unstubAllGlobals()
})

// A skill id out of a PRIVATE catalogue — the org's own vocabulary, and the one
// thing fetching browser-direct exists to keep off anything of ours.
const PRIVATE_SKILL_ID = "acme-internal-billing-ledger"

// A catalogue that IS a catalogue apart from one entry, so the failure lands
// INSIDE the `skills` record rather than on it.
//
// That depth is the whole point. `MALFORMED_CATALOG` breaks `skills` at the top
// level, so every path it produces is one segment long and a record key can
// never appear in one — which is how the guard beside it passed for months
// while a joined path leaked the keys of a private catalogue.
const CATALOG_WITH_A_BROKEN_SKILL = {
  ...MARKETPLACE_CATALOG,
  skills: { [PRIVATE_SKILL_ID]: { id: PRIVATE_SKILL_ID } },
}

// Served without msw because the payload is this test's own rather than a
// fixture the Playwright specs share. Stubbing the transport keeps the suite's
// no-network guarantee for the same reason interception does: nothing leaves.
const serving = (body: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )

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

// The one form a ref is kept in, and it is the CLI's rather than the field's.
//
// `--marketplace` routes on a protocol prefix and reads everything without one
// as a path on the receiver's own disk, so a bare `owner/repo` — which is
// exactly what the dialog's placeholder asks for — is not a repository to the
// half of the system that has to install from it. Every spelling the field
// accepts therefore comes out as one string, which is what makes the ref a
// storage key as well as a wire value.
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

  // A branch is part of which catalogue this is, so it survives the rewrite —
  // and `--marketplace` takes it in the same place giget does.
  it("keeps a branch on the end of the canonical form", () => {
    expect(canonicalMarketplaceRef("acme/skills#next")).toBe(
      "github:acme/skills#next"
    )
  })

  // Already canonical in, unchanged out. Said as its own case because this
  // runs on every read of the slot: a rewrite that moved a ref it had already
  // rewritten would be a new key on every load.
  it("leaves a ref that is already canonical alone", () => {
    expect(canonicalMarketplaceRef("github:acme/skills")).toBe(
      canonicalMarketplaceRef(canonicalMarketplaceRef("acme/skills"))
    )
  })

  // Not a repository, so there is nothing to canonicalise and nothing here to
  // say about it: `fetchCatalog` refuses it at the field the user is looking
  // at, which is where the sentence belongs.
  it.each(["", "   ", "acme", "acme/skills/extra"])(
    "hands %o back trimmed rather than inventing a repository",
    (input) => {
      expect(canonicalMarketplaceRef(input)).toBe(input.trim())
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

  // The same promise as above, held against the catalogue that can actually
  // break it: a failure one level down carries the record KEY in its path, and
  // `matrixSchema` keys `categories`, `skills` and a stack's `skills` by the
  // MARKETPLACE's ids rather than by ours.
  //
  // Asserted over the whole call log rather than over `issues`, because a check
  // on the reported field alone passes while the path leaks — the shape
  // `marketplace-store.test.ts` settled on for the same reason.
  it("names no skill of the marketplace's own in what it reports", async () => {
    vi.stubGlobal("fetch", serving(CATALOG_WITH_A_BROKEN_SKILL))

    await fetchCatalog(PRIVATE_MARKETPLACE_REF, MARKETPLACE_TOKEN)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_SKILL_ID
    )
  })

  // The other half of the split, and it is not a leak: whoever reads this
  // fetched the catalogue with their own token, and "skills" alone does not
  // locate one broken entry among three hundred. The path stays whole where it
  // never leaves the browser.
  it("names the broken entry in full on screen", async () => {
    vi.stubGlobal("fetch", serving(CATALOG_WITH_A_BROKEN_SKILL))

    const result = await fetchCatalog(
      PRIVATE_MARKETPLACE_REF,
      MARKETPLACE_TOKEN
    )

    // The mirror image of the assertion above, over the whole result for the
    // same reason: what must never appear in one channel must still appear in
    // the other, or the split has quietly become a truncation of both.
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
