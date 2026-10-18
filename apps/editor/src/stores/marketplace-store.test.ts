import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import {
  migrateSavedMarketplaces,
  readSavedMarketplaces,
  tokenFor,
  useMarketplaceStore,
} from "./marketplace-store"

const EMPTY = { current: "", saved: {} }

const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

describe("readSavedMarketplaces", () => {
  it("restores the chosen marketplace and every token beside it", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_CANONICAL_REF,
        saved: {
          [MARKETPLACE_CANONICAL_REF]: "",
          [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN,
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: {
        [MARKETPLACE_CANONICAL_REF]: "",
        [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN,
      },
    })
  })

  it("restores a marketplace saved without a token", () => {
    expect(
      readSavedMarketplaces({
        current: MARKETPLACE_CANONICAL_REF,
        saved: { [MARKETPLACE_CANONICAL_REF]: "" },
      })
    ).toStrictEqual({
      current: MARKETPLACE_CANONICAL_REF,
      saved: { [MARKETPLACE_CANONICAL_REF]: "" },
    })
  })

  it("discards a token filed under no marketplace and keeps the rest", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_CANONICAL_REF,
        saved: {
          "": MARKETPLACE_TOKEN,
          [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN,
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("falls back to the public catalogue when the choice names nothing saved", () => {
    expect(
      readSavedMarketplaces({
        current: "someone/else",
        saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
      })
    ).toStrictEqual({
      current: "",
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("keeps tokens for a browser sitting on the public catalogue", () => {
    expect(
      readSavedMarketplaces({
        current: "",
        saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
      })
    ).toStrictEqual({
      current: "",
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("re-keys a marketplace saved in the form the CLI reads as a path", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_REF,
        saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("carries the choice onto the re-keyed entry", () => {
    expect(
      readSavedMarketplaces({
        current: MARKETPLACE_REF,
        saved: { [MARKETPLACE_REF]: "" },
      }).current
    ).toBe(MARKETPLACE_CANONICAL_REF)
  })

  it("collapses two spellings of one repository and keeps the credential", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_REF,
        saved: {
          [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN,
          [PRIVATE_MARKETPLACE_CANONICAL_REF]: "",
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("keeps the credential whichever spelling was saved holding it", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_CANONICAL_REF,
        saved: {
          [PRIVATE_MARKETPLACE_CANONICAL_REF]: "",
          [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN,
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
  })

  // Current-version slots reach this parse, never the migration: zustand
  // migrates only on a version mismatch.
  it("reports a slot it could not read", () => {
    readSavedMarketplaces({ current: 7, saved: {} })

    expect(sink.issue).toHaveBeenCalledWith(
      expect.stringContaining("marketplace"),
      expect.objectContaining({ issues: ["current: invalid_type"] })
    )
  })

  // An absent slot is every first visit, so reporting it would be noise.
  it("reports nothing for a slot that was never written", () => {
    readSavedMarketplaces(undefined)

    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("reports nothing for a slot it read", () => {
    readSavedMarketplaces({
      current: MARKETPLACE_CANONICAL_REF,
      saved: { [MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })

    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("names no repository of the visitor's in what it reports", () => {
    readSavedMarketplaces({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: 7 },
    })

    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_MARKETPLACE_REF
    )
  })

  it.each([
    ["an empty slot", undefined],
    ["a slot from nothing", null],
    ["a blob of the wrong shape", { current: 7 }],
    ["a blob with a non-string token", { current: "", saved: { a: 7 } }],
    ["a slot with no map at all", { current: MARKETPLACE_REF }],
    ["a bare string", "acme/skills"],
    ["the shape this store used to hold", { marketplace: MARKETPLACE_REF }],
  ])("reads %s as no marketplace at all", (_label, persisted) => {
    expect(readSavedMarketplaces(persisted)).toStrictEqual(EMPTY)
  })
})

describe("migrateSavedMarketplaces", () => {
  it("carries a v1 marketplace and its token into the keyed shape", () => {
    expect(
      migrateSavedMarketplaces(
        { marketplace: PRIVATE_MARKETPLACE_REF, token: MARKETPLACE_TOKEN },
        0
      )
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    })
  })

  it("carries a v1 marketplace saved without a token", () => {
    expect(
      migrateSavedMarketplaces({ marketplace: MARKETPLACE_REF }, 0)
    ).toStrictEqual({
      current: MARKETPLACE_REF,
      saved: { [MARKETPLACE_REF]: "" },
    })
  })

  it("leaves a slot already in the keyed shape alone", () => {
    const keyed = {
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    }

    expect(migrateSavedMarketplaces(keyed, 1)).toStrictEqual(keyed)
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("discards a v1 token that names no marketplace", () => {
    expect(
      migrateSavedMarketplaces({ marketplace: "", token: MARKETPLACE_TOKEN }, 0)
    ).toBeUndefined()
  })

  it("reports a blob it cannot carry", () => {
    expect(migrateSavedMarketplaces({ nothing: "useful" }, 0)).toBeUndefined()

    expect(sink.issue).toHaveBeenCalledWith(
      expect.stringContaining("marketplace"),
      expect.objectContaining({ fromVersion: 0 })
    )
  })

  it("reports nothing for a slot it carried", () => {
    migrateSavedMarketplaces({ marketplace: MARKETPLACE_REF }, 0)

    expect(sink.issue).not.toHaveBeenCalled()
  })
})

describe("readSavedMarketplaces on a blob that is not an object", () => {
  it("names the root as what it could not read", () => {
    readSavedMarketplaces("acme/skills")

    expect(sink.issue).toHaveBeenCalledWith(
      "Discarded unreadable saved marketplaces",
      expect.objectContaining({ issues: ["(root): invalid_type"] })
    )
  })
})

// zustand migrates only on a version mismatch; called at the current version,
// the blob is already this version's.
describe("migrateSavedMarketplaces at the current version", () => {
  const CURRENT_VERSION = 2

  it("hands the blob back untouched", () => {
    const blob = { marketplace: MARKETPLACE_REF }

    expect(migrateSavedMarketplaces(blob, CURRENT_VERSION)).toBe(blob)
  })
})

describe("the marketplace store's actions", () => {
  beforeEach(() => {
    useMarketplaceStore.setState({ current: "", saved: {} })
  })

  it("files a token under its marketplace and chooses it, keeping the others", () => {
    useMarketplaceStore.getState().remember(MARKETPLACE_CANONICAL_REF, "")
    useMarketplaceStore
      .getState()
      .remember(PRIVATE_MARKETPLACE_CANONICAL_REF, MARKETPLACE_TOKEN)

    const { current, saved } = useMarketplaceStore.getState()
    expect({ current, saved }).toStrictEqual({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: {
        [MARKETPLACE_CANONICAL_REF]: "",
        [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN,
      },
    })
  })

  it("chooses a saved marketplace without touching any token", () => {
    useMarketplaceStore
      .getState()
      .remember(PRIVATE_MARKETPLACE_CANONICAL_REF, MARKETPLACE_TOKEN)
    useMarketplaceStore.getState().remember(MARKETPLACE_CANONICAL_REF, "")

    useMarketplaceStore.getState().choose(PRIVATE_MARKETPLACE_CANONICAL_REF)

    expect(useMarketplaceStore.getState().current).toBe(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
    expect(tokenFor(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(MARKETPLACE_TOKEN)
  })

  it("goes back to the public catalogue, keeping the tokens", () => {
    useMarketplaceStore
      .getState()
      .remember(PRIVATE_MARKETPLACE_CANONICAL_REF, MARKETPLACE_TOKEN)

    useMarketplaceStore.getState().choosePublic()

    expect(useMarketplaceStore.getState().current).toBe("")
    expect(tokenFor(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(MARKETPLACE_TOKEN)
  })

  it("holds no token for a marketplace nobody saved", () => {
    expect(tokenFor(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe("")
  })
})

describe("the marketplace slot", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("persists under a key of its own", async () => {
    const written = new Map<string, string>()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: (key: string, value: string) => written.set(key, value),
        removeItem: (key: string) => written.delete(key),
      },
    })
    vi.resetModules()
    const { useMarketplaceStore: store } = await import("./marketplace-store")

    store.getState().remember(MARKETPLACE_CANONICAL_REF, "")

    expect([...written.keys()]).toStrictEqual(["agents-inc:marketplace:v1"])
  })
})
