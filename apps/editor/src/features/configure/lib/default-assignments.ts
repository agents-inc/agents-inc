// The relevance + default-load rule behind auto-assignment: which sub-agents
// a freshly selected skill reaches, and how each of them loads it. Pure —
// (skill id) in, assignments out — so the store can apply it and the tests can
// pin it. The whole answer comes from the matrix's shared resolver — the same
// one the CLI's config generator reads — so a pick lands on the same agents,
// loading the same way, from either surface.
//
// The resolver's relevance rule, in short: a domain skill reaches its own
// domain's agents, a shared skill reaches every implementation domain's, a
// meta skill reaches the flavors its authored mapping row names, and an id the
// catalog does not carry — added from GitHub this session, or stale — reaches
// nobody. The empty answer is deliberate: relevance unknown, so the ••• panel
// (already id-agnostic) is where such a skill finds a home.

import { resolveAssignment } from "@workspace/matrix"

import type { Assignment } from "@/stores/persisted-schema"

/** Everything a fresh selection starts with: the resolver's targets, each row live. */
export const defaultAssignmentsFor = (
  skillId: string
): Record<string, Assignment> =>
  Object.fromEntries(
    resolveAssignment(skillId).map(({ agentId, load }) => [
      agentId,
      { load, enabled: true },
    ])
  )
