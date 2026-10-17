import { defaultAssignmentsFor } from "./default-assignments"

import type { ProposalGroup, ProposalRow } from "../components/proposal"
import type { CatalogSkill } from "@workspace/matrix"

// Rows are built from skill ids alone, through the same resolver a click uses,
// so a row cannot describe a placement the app would not make.

const restingLoad = (skillId: string) => {
  const loads = new Set(
    Object.values(defaultAssignmentsFor(skillId)).map(({ load }) => load)
  )

  if (loads.size === 0) return "no sub-agent"
  return loads.size === 1 ? [...loads][0]! : "mixed"
}

type AddedSkill = { id: string; skill: CatalogSkill }

// An id with no row is not applied either: nothing arrives unseen.
const isNamed = (entry: {
  id: string
  skill: CatalogSkill | undefined
}): entry is AddedSkill => Boolean(entry.skill)

const toRow = ({ id, skill }: AddedSkill): ProposalRow => ({
  name: skill.displayName,
  state: restingLoad(id),
  // Amber marks a deliberate pick; this is the app's default.
  amber: false,
  added: true,
})

// Rows and applied ids come from one derivation so they cannot disagree.
export type ProposedChanges = {
  groups: ProposalGroup[]
  ids: string[]
}

// Already-chosen ids are dropped: `Apply` would toggle them back off.
export const groupsFor = (
  skillIds: readonly string[],
  skillById: (id: string) => CatalogSkill | undefined,
  selected: Readonly<Record<string, unknown>>
): ProposedChanges => {
  const added = skillIds
    .filter((id) => !(id in selected))
    .map((id) => ({ id, skill: skillById(id) }))
    .filter(isNamed)

  const rows = added.map(toRow)

  return {
    groups:
      rows.length === 0 ? [] : [{ subject: "Skills", verb: "added", rows }],
    ids: added.map(({ id }) => id),
  }
}
