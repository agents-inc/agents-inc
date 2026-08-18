import {
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import {
  migrateSavedMarketplaces,
  readSavedMarketplaces,
} from "./marketplace-store"

// Which catalogues this browser saved, and the token each one needed. Kept as a
// pure read for the reason `readSavedStack` is: the untrusted half can then be
// exercised without a browser, and the browser half is proved end-to-end where
// a real localStorage is.
//
// KEYED BY MARKETPLACE, which is the whole of EDITOR-39 on this side. A single
// slot made "which marketplace is mine" and "which token do I have" one fact,
// so saving a second marketplace overwrote the first — and a GitHub PAT is
// shown once and cannot be recovered.
//
// The two fields are still not equal partners, but the asymmetry is now
// per-entry. The marketplace IDENTIFIES the repository and is the KEY; the
// token only AUTHORIZES reading it and is the value. So a token can no longer
// be held for nothing — it names its repository by construction — and the one
// rule left is the same one said of a key: an entry filed under no marketplace
// names nothing, and is dropped without touching its neighbours.

const EMPTY = { current: "", saved: {} }

const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

describe("readSavedMarketplaces", () => {
  it("restores the chosen marketplace and every token beside it", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_REF,
        saved: {
          [MARKETPLACE_REF]: "",
          [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN,
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_REF,
      saved: {
        [MARKETPLACE_REF]: "",
        [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN,
      },
    })
  })

  // The public case, which is every visitor who never opened the dialog.
  it("restores a marketplace saved without a token", () => {
    expect(
      readSavedMarketplaces({
        current: MARKETPLACE_REF,
        saved: { [MARKETPLACE_REF]: "" },
      })
    ).toStrictEqual({
      current: MARKETPLACE_REF,
      saved: { [MARKETPLACE_REF]: "" },
    })
  })

  // The rewritten form of `discards a token that names no marketplace`. The old
  // rule dropped the WHOLE slot, because there was only one and a token with
  // nothing to spend it on named nothing. Keyed, that rule is per-entry: the
  // unkeyed token still names nothing and still goes, and every other token is
  // none of its business — dropping those with it would be this row's own
  // defect wearing the safety rule's clothes.
  it("discards a token filed under no marketplace and keeps the rest", () => {
    expect(
      readSavedMarketplaces({
        current: PRIVATE_MARKETPLACE_REF,
        saved: {
          "": MARKETPLACE_TOKEN,
          [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN,
        },
      })
    ).toStrictEqual({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    })
  })

  // A choice this browser cannot have made: nothing was ever loaded from it, so
  // there is no token filed for it and no reason to believe it resolves. The
  // public catalogue is what the app opens on when it has no choice to restore
  // — and the tokens stay, because which catalogue to show has never been a
  // statement about credentials.
  it("falls back to the public catalogue when the choice names nothing saved", () => {
    expect(
      readSavedMarketplaces({
        current: "someone/else",
        saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
      })
    ).toStrictEqual({
      current: "",
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    })
  })

  // No marketplace chosen, which is the public catalogue asked for by name.
  it("keeps tokens for a browser sitting on the public catalogue", () => {
    expect(
      readSavedMarketplaces({
        current: "",
        saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
      })
    ).toStrictEqual({
      current: "",
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    })
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

// The deploy that lands the keyed shape meets browsers holding the single slot.
// Reading one as unparseable would discard it — every stored marketplace AND
// every stored PAT, invisibly, by the same discard path that exists to be safe.
// That is this row's own defect arriving through the deploy, so the one slot is
// carried over rather than dropped: a PAT cannot be recovered, and this is the
// last moment it exists.
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

  // The public case: a marketplace saved before the token field existed at all.
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
      current: MARKETPLACE_REF,
      saved: { [MARKETPLACE_REF]: "" },
    }

    expect(migrateSavedMarketplaces(keyed, 1)).toStrictEqual(keyed)
  })

  // A token with no repository to spend it on names nothing, exactly as it did
  // before — and this is the one door where that judgement is still whole-slot,
  // because a v1 slot IS one entry.
  it("discards a v1 token that names no marketplace", () => {
    expect(
      migrateSavedMarketplaces({ marketplace: "", token: MARKETPLACE_TOKEN }, 0)
    ).toBeUndefined()
  })

  // Reported rather than absorbed. A discard here is somebody's marketplace and
  // somebody's PAT becoming empty state with nothing on screen to say so, which
  // is the same silence `config-store` files its own version discards under.
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
