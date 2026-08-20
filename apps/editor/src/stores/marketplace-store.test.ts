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

  // The public case, which is every visitor who never opened the dialog.
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

  // The rewritten form of `discards a token that names no marketplace`. The old
  // rule dropped the WHOLE slot, because there was only one and a token with
  // nothing to spend it on named nothing. Keyed, that rule is per-entry: the
  // unkeyed token still names nothing and still goes, and every other token is
  // none of its business — dropping those with it would be this row's own
  // defect wearing the safety rule's clothes.
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

  // A choice this browser cannot have made: nothing was ever loaded from it, so
  // there is no token filed for it and no reason to believe it resolves. The
  // public catalogue is what the app opens on when it has no choice to restore
  // — and the tokens stay, because which catalogue to show has never been a
  // statement about credentials.
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

  // No marketplace chosen, which is the public catalogue asked for by name.
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

  // Every slot written before the ref was normalised holds the bare
  // `owner/repo` the dialog's placeholder asks for, which is a LOCAL DIRECTORY
  // to `--marketplace`. Re-keyed on the way in rather than left beside a new
  // entry: the token has to stay reachable, and a slot that kept the old key
  // would go on minting the ref that cannot be installed.
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

  // The choice moves with the entry it names. Without this the re-keyed slot
  // holds a `current` that matches none of its keys, and `choiceAmong` drops it
  // to the public catalogue — the visitor's own marketplace lost to the fix.
  it("carries the choice onto the re-keyed entry", () => {
    expect(
      readSavedMarketplaces({
        current: MARKETPLACE_REF,
        saved: { [MARKETPLACE_REF]: "" },
      }).current
    ).toBe(MARKETPLACE_CANONICAL_REF)
  })

  // Both spellings of one repository in one slot, which is what the
  // unnormalised key left behind — two entries, two copies of one PAT, and a
  // switcher offering the repository the browser is already on. They collapse,
  // and the credential survives the collapse: a PAT is shown once and cannot be
  // recovered, so "no token held" can never be what replaces one.
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

  // The same collapse the other way round, so the rule is about the CREDENTIAL
  // rather than about which key happened to be written first.
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

  // Every browser at the CURRENT version arrives here rather than at the
  // migration below: zustand calls `migrate` only on a version mismatch and
  // hands the raw state to `merge` otherwise, so a slot that fails this parse
  // while carrying the current version reaches this line and no other. A
  // partial write, a hand edit — or the case the rule is actually about, a
  // shape change shipped without a version bump, which would make this the door
  // every browser hits at once. What it discards is a PAT that is shown once
  // and can be read back from nowhere.
  it("reports a slot it could not read", () => {
    readSavedMarketplaces({ current: 7, saved: {} })

    expect(sink.issue).toHaveBeenCalledWith(
      expect.stringContaining("marketplace"),
      expect.objectContaining({ issues: ["current: invalid_type"] })
    )
  })

  // The other half, and the reason the report above is worth having at all. An
  // ABSENT slot is every visitor who has never opened the dialog, and a warning
  // filed against all of them is noise that gets the warning removed again —
  // which is the split `config-store`'s own `merge` draws, for that reason.
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

  // The field and the code, and nothing the visitor typed. A record key here IS
  // a repository the visitor named, and the value beside it is their
  // credential, so nothing past the field's own name travels — the same rule
  // the migration keeps by reporting versions only.
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

  // The deploy that lands the canonical key meets browsers holding the keyed
  // shape, which is every browser that ever saved a marketplace. It is carried
  // through untouched, ref included: re-keying is `readSavedMarketplaces`'s
  // job and every migrated slot passes through it on the way to the store, so
  // doing it twice would be two places to disagree.
  //
  // Nothing reported, because nothing was discarded — a keyed slot falling to
  // the single-slot parse would be read as unreadable, and the marketplace and
  // the PAT would go together.
  it("leaves a slot already in the keyed shape alone", () => {
    const keyed = {
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: MARKETPLACE_TOKEN },
    }

    expect(migrateSavedMarketplaces(keyed, 1)).toStrictEqual(keyed)
    expect(sink.issue).not.toHaveBeenCalled()
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
