import { describe, expect, it } from "vitest"

import { groupsFor } from "./compose-proposal"

import type { CatalogSkill } from "@workspace/matrix"

/**
 * ONE DERIVATION OF "WHAT APPLY WILL ADD", NOT TWO.
 *
 * The composer draws rows from this function and then applies a list of ids,
 * and until EDITOR-58 it filtered that list itself — the same predicate written
 * twice, in two files. The two agree on every id the seated catalogue knows and
 * part company on every id it does not: the rows drop such an id because there
 * is no name to draw, and a second filter that only asks whether the visitor
 * already holds it keeps it.
 *
 * That divergence is invisible on screen, which is the whole reason it is
 * asserted here: `config-store.toggleSkill` refuses an id no catalogue carries
 * and returns in silence, so the extra id is swallowed rather than shown. A
 * defect nothing can see is one nothing will report, and it survives exactly as
 * long as the two derivations are allowed to disagree.
 */

// A catalogue entry in the one field the rows read — the rest is filled in
// because a `CatalogSkill` is a real type and casting a stub to it would let a
// field this function starts reading tomorrow arrive as `undefined`.
const entry = (id: string, displayName: string): CatalogSkill => ({
  id,
  slug: id,
  displayName,
  description: "",
  categoryId: "web-framework",
  domainId: "web",
  conflictsWith: [],
  discourages: [],
  requires: [],
})

const KNOWN = entry("web-framework-react", "React")

// An id no seated catalogue carries: what a marketplace the visitor has since
// switched away from leaves behind, and what a model free-associating a plugin
// name produces. Both reach this function the same way.
const UNKNOWN_ID = "web-framework-not-in-this-catalogue"

const catalogue = (skill: string) => (skill === KNOWN.id ? KNOWN : undefined)

const nothingSelected: Record<string, unknown> = {}

describe("groupsFor", () => {
  it("draws one added row per proposed skill the catalogue can name", () => {
    const { groups } = groupsFor([KNOWN.id], catalogue, nothingSelected)

    expect(groups).toStrictEqual([
      {
        subject: "Skills",
        verb: "added",
        rows: [
          {
            name: "React",
            state: expect.any(String) as string,
            amber: false,
            added: true,
          },
        ],
      },
    ])
  })

  // The claim the whole seam exists for: the ids handed back are the ids behind
  // the rows, so a caller cannot apply something it never drew.
  it("reports exactly the ids its rows stand for", () => {
    const { groups, ids } = groupsFor(
      [KNOWN.id, UNKNOWN_ID],
      catalogue,
      nothingSelected
    )

    expect(ids).toStrictEqual([KNOWN.id])
    expect(groups[0]?.rows.map((row) => row.name)).toStrictEqual(["React"])
  })

  // An id the visitor already holds is not a change, and proposing it would
  // make `Apply` toggle it back OFF — the opposite of what a row saying
  // "added" claims.
  it("drops an id the visitor already holds from both halves", () => {
    const { groups, ids } = groupsFor([KNOWN.id], catalogue, {
      [KNOWN.id]: {},
    })

    expect(ids).toStrictEqual([])
    expect(groups).toStrictEqual([])
  })

  // No group rather than an empty one: an empty bordered box is furniture, and
  // the block's own zero-change form is what a proposal with nothing to do
  // renders as.
  it("answers with no group and no ids when nothing survives", () => {
    expect(groupsFor([UNKNOWN_ID], catalogue, nothingSelected)).toStrictEqual({
      groups: [],
      ids: [],
    })
  })
})
