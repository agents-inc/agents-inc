import { defaultAssignmentsFor } from "./default-assignments"

import type { ProposalGroup, ProposalRow } from "../components/proposal"
import type { CatalogSkill } from "@workspace/matrix"

// What a proposal's rows say, built from SKILL IDS and nothing else.
//
// The model returns ids; everything drawn beside them is derived here from the
// app's own rules — `defaultAssignmentsFor` is the same resolver a click on a
// cell goes through, so a proposed row cannot describe a placement the app
// would not actually make. That is the whole reason the model is not allowed to
// send load, scope or agent: two sources for one answer is how they disagree.

// The load a freshly-selected skill rests at, read off the resolver rather than
// assumed. A skill that reaches several sub-agents at one load says it once; one
// that genuinely differs says `mixed`, which is true and rare.
const restingLoad = (skillId: string) => {
  const loads = new Set(
    Object.values(defaultAssignmentsFor(skillId)).map(({ load }) => load)
  )

  if (loads.size === 0) return "no sub-agent"
  return loads.size === 1 ? [...loads][0]! : "mixed"
}

/** A proposed id together with the catalogue entry that lets it be drawn. */
type AddedSkill = { id: string; skill: CatalogSkill }

/**
 * Whether the seated catalogue can name this id.
 *
 * An id it cannot name has no row to draw, which is also why it is not applied:
 * a reviewable changeset promises that nothing arrives unseen.
 */
const isNamed = (entry: {
  id: string
  skill: CatalogSkill | undefined
}): entry is AddedSkill => Boolean(entry.skill)

const toRow = ({ id, skill }: AddedSkill): ProposalRow => ({
  name: skill.displayName,
  state: restingLoad(id),
  // Never amber: an added skill resting at its own default is the app choosing,
  // not the visitor overriding, and amber is reserved for what somebody
  // deliberately picked.
  amber: false,
  added: true,
})

/**
 * What a proposal DRAWS and what applying it WILL SELECT, answered together.
 *
 * One question with two readers, and the two are handed back from one place
 * because a second derivation of the same predicate is a disagreement waiting
 * for an input that tells them apart. The composer used to filter the ids for
 * itself, which was only ever harmless because `toggleSkill` refuses an id no
 * catalogue carries: the rows dropped such an id and the second filter kept it.
 */
export type ProposedChanges = {
  groups: ProposalGroup[]
  /** The ids behind the rows, in the order the rows are drawn. */
  ids: string[]
}

/**
 * The proposal's groups, and the ids they stand for.
 *
 * One group, `Skills added`, and deliberately not more. **Ids the visitor has
 * already chosen are dropped rather than listed as changes** — proposing what
 * somebody already has reads as a change that will not happen, and `Apply`
 * would then toggle it back off, which is the opposite of what the row said.
 * `ProposalGroup.verb` has a `changed` member for when the model is allowed to
 * propose an assignment; today it is not, so nothing here produces one.
 */
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
