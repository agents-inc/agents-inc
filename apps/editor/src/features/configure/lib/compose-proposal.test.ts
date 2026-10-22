import { describe, expect, it } from "vitest"

import { groupsFor } from "./compose-proposal"

import type { ProposalRow } from "../components/proposal"
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
    const reactRow: Record<keyof ProposalRow, unknown> = {
      name: "React",
      state: expect.any(String),
      amber: false,
      added: true,
    }

    expect(groups).toStrictEqual([
      { subject: "Skills", verb: "added", rows: [reactRow] },
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

// The load a row names is the one a click would give the skill.
describe("the load a proposed row names", () => {
  const PRELOADED_EVERYWHERE = entry("web-framework-react", "React")
  const MIXED = entry("web-styling-tailwind", "Tailwind")
  const PLACED_NOWHERE = entry(UNKNOWN_ID, "Not placed")

  const stateOf = (skill: CatalogSkill) =>
    groupsFor([skill.id], () => skill, nothingSelected).groups[0]?.rows[0]
      ?.state

  it("names the one load every sub-agent would take it at", () => {
    expect(stateOf(PRELOADED_EVERYWHERE)).toBe("preloaded")
  })

  it("says mixed when sub-agents would take it at different loads", () => {
    expect(stateOf(MIXED)).toBe("mixed")
  })

  it("says no sub-agent when the resolver places it on none", () => {
    expect(stateOf(PLACED_NOWHERE)).toBe("no sub-agent")
  })
})
