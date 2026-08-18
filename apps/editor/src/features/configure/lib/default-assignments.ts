import { resolveAssignment } from "@workspace/matrix"

import { activeSkillById } from "@/stores/catalog-store"

import type { Assignment } from "@/stores/persisted-schema"

// Which sub-agents a freshly picked skill reaches, and how each of them loads
// it. The rule is the shared resolver's — the same one the CLI's config
// generator reads — so a skill reaches the same agents on either surface.
//
// The skill is handed over as a TAXONOMY rather than as a bare id, and that is
// what makes a loaded marketplace work. The resolver answers a bare id by
// looking it up in the VENDORED catalogue, so a marketplace's id would find
// nothing there and reach nobody; stating the domain and category it actually
// has gets it answered on those, whichever marketplace they came from. A skill
// no loaded catalogue carries — added from GitHub this session, or stale — has
// no taxonomy to state and still reaches nobody, which is the correct answer:
// relevance unknown, so the user assigns it by hand.
const taxonomyOf = (skillId: string) => {
  const skill = activeSkillById(skillId)
  if (!skill) return undefined

  return {
    id: skill.id,
    domainId: skill.domainId,
    categoryId: skill.categoryId,
  }
}

/** Everything a fresh selection starts with: the resolver's targets, each row live. */
export const defaultAssignmentsFor = (
  skillId: string
): Record<string, Assignment> => {
  const taxonomy = taxonomyOf(skillId)
  if (!taxonomy) return {}

  return Object.fromEntries(
    resolveAssignment(taxonomy).map(({ agentId, load }) => [
      agentId,
      { load, enabled: true },
    ])
  )
}
