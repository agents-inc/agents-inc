import { describe, expect, it } from "vitest"

import { groupsFor } from "./compose-proposal"

import type { CatalogSkill } from "@workspace/matrix"

// Rows and applied ids must come from one derivation: an id the rows drop but
// apply keeps is swallowed silently by `toggleSkill`.

// A full `CatalogSkill` rather than a cast stub, so a newly read field cannot
// arrive as `undefined`.
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

  it("reports exactly the ids its rows stand for", () => {
    const { groups, ids } = groupsFor(
      [KNOWN.id, UNKNOWN_ID],
      catalogue,
      nothingSelected
    )

    expect(ids).toStrictEqual([KNOWN.id])
    expect(groups[0]?.rows.map((row) => row.name)).toStrictEqual(["React"])
  })

  // Proposing a held id would make `Apply` toggle it off.
  it("drops an id the visitor already holds from both halves", () => {
    const { groups, ids } = groupsFor([KNOWN.id], catalogue, {
      [KNOWN.id]: {},
    })

    expect(ids).toStrictEqual([])
    expect(groups).toStrictEqual([])
  })

  it("answers with no group and no ids when nothing survives", () => {
    expect(groupsFor([UNKNOWN_ID], catalogue, nothingSelected)).toStrictEqual({
      groups: [],
      ids: [],
    })
  })
})
