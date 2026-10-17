import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import {
  migrateSavedMarketplaces,
  readSavedMarketplaces,
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
