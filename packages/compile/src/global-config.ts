import { isDeepEqual } from "remeda"

import { skillDomain, type CompileCatalog } from "./catalog.js"
import { GLOBAL_CONFIG_NAME } from "./paths.js"
import { typedEntries } from "./typed-object.js"
import type {
  AgentName,
  Category,
  ProjectConfig,
  SkillAssignment,
  StackAgentConfig,
} from "./types.js"

// The global config a project install writes: the session's global half merged into what is on
// disk. The CLI and the editor preview both resolve it through {@link addSessionToGlobal}.

/** The CLI's blank global `config.ts` template as a loader reads it back. */
export function blankGlobalConfig(): ProjectConfig {
  return {
    name: GLOBAL_CONFIG_NAME,
    skills: [],
    agents: [],
    selectedDomains: [],
  }
}

/** Deep-additive: appends missing (agent, category, skill) triples; never overwrites or mutates. */
function additiveMergeStack(
  existing: Partial<Record<AgentName, StackAgentConfig>> | undefined,
  incoming: Partial<Record<AgentName, StackAgentConfig>> | undefined
): { stack: Partial<Record<AgentName, StackAgentConfig>>; changed: boolean } {
  const merged: Partial<Record<AgentName, StackAgentConfig>> = existing
    ? structuredClone(existing)
    : {}
  if (!incoming) return { stack: merged, changed: false }

  let changed = false
  for (const [agentName, incomingAgentStack] of typedEntries<
    AgentName,
    StackAgentConfig
  >(incoming)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
    if (!incomingAgentStack) continue

    const existingAgentStack = merged[agentName]
    if (!existingAgentStack) {
      merged[agentName] = structuredClone(incomingAgentStack)
      changed = true
      continue
    }

    if (mergeAgentCategories(existingAgentStack, incomingAgentStack)) {
      changed = true
    }
  }

  return { stack: merged, changed }
}

/** Mutates the cloned `existingAgentStack`; true if anything was appended. */
function mergeAgentCategories(
  existingAgentStack: StackAgentConfig,
  incomingAgentStack: StackAgentConfig
): boolean {
  let changed = false
  for (const [category, incomingAssignments] of typedEntries<
    Category,
    SkillAssignment[]
  >(incomingAgentStack)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
    if (!incomingAssignments) continue

    const existingAssignments = existingAgentStack[category]
    if (!existingAssignments) {
      existingAgentStack[category] = incomingAssignments.map((a) => ({ ...a }))
      changed = true
      continue
    }

    if (appendMissingAssignments(existingAssignments, incomingAssignments)) {
      changed = true
    }
  }
  return changed
}

/** Mutates the cloned `existingAssignments`; an id repeated in `incomingAssignments` lands once. */
function appendMissingAssignments(
  existingAssignments: SkillAssignment[],
  incomingAssignments: SkillAssignment[]
): boolean {
  const existingIds = new Set(existingAssignments.map((a) => a.id))
  let changed = false
  for (const assignment of incomingAssignments) {
    if (existingIds.has(assignment.id)) continue
    existingAssignments.push({ ...assignment })
    existingIds.add(assignment.id)
    changed = true
  }
  return changed
}

/** Adds global items that don't exist yet; never removes. */
export function mergeGlobalConfigs(
  existing: ProjectConfig,
  incoming: ProjectConfig
): { config: ProjectConfig; changed: boolean } {
  const newSkills = activeEntriesNotIn(
    incoming.skills,
    existing.skills,
    (s) => s.id
  )
  const newAgents = activeEntriesNotIn(
    incoming.agents,
    existing.agents,
    (a) => a.name
  )

  const mergedSkills = [...existing.skills, ...newSkills]
  const mergedAgents = [...existing.agents, ...newAgents]

  // Project-context edits never remove or overwrite global state, including `preloaded` flags.
  const { stack: mergedStack, changed: stackChanged } = additiveMergeStack(
    existing.stack,
    incoming.stack
  )

  const mergedSelectedDomains = [
    ...new Set([
      ...(existing.selectedDomains ?? []),
      ...(incoming.selectedDomains ?? []),
    ]),
  ]

  // Marketplace identity is fill-only: the merged config may hold plugins from several
  // marketplaces, so repointing it from a project would orphan another's registry key.
  const addsEntries = newSkills.length > 0 || newAgents.length > 0

  // The identity fill only happens alongside an added entry, which `addsEntries` already counts.
  const changed =
    addsEntries ||
    stackChanged ||
    !isDeepEqual(existing.selectedDomains ?? [], mergedSelectedDomains)

  return {
    config: {
      ...existing,
      skills: mergedSkills,
      agents: mergedAgents,
      stack: mergedStack,
      selectedDomains: mergedSelectedDomains,
      ...marketplaceIdentityFilledFrom(existing, addsEntries ? incoming : null),
    },
    changed,
  }
}

function activeEntriesNotIn<Entry extends { excluded?: boolean }>(
  incoming: Entry[],
  existing: Entry[],
  keyOf: (entry: Entry) => string
): Entry[] {
  const held = new Set(existing.map(keyOf))
  return incoming.filter((entry) => !entry.excluded && !held.has(keyOf(entry)))
}

/**
 * Fills only when the merge adds an entry: a project session inlines global entries it did not
 * bring, so its marketplace may not be theirs.
 */
function marketplaceIdentityFilledFrom(
  existing: ProjectConfig,
  arriving: ProjectConfig | null
): Pick<ProjectConfig, "marketplace" | "marketplaceName"> {
  const marketplaceName = existing.marketplaceName ?? arriving?.marketplaceName
  const marketplace = existing.marketplace ?? arriving?.marketplace
  return {
    ...(marketplaceName !== undefined && { marketplaceName }),
    ...(marketplace !== undefined && { marketplace }),
  }
}

export type ResolvedGlobalConfig = { config: ProjectConfig; changed: boolean }

/**
 * The resolution every caller but `edit --from` gets: global items are added, never removed. A
 * session with nothing global does not empty the global install.
 */
export function addSessionToGlobal(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
  catalog: CompileCatalog
): ResolvedGlobalConfig {
  const hasGlobalItems =
    globalSplit.skills.length > 0 || globalSplit.agents.length > 0
  if (!hasGlobalItems) {
    return {
      config: existingGlobalConfig ?? {
        name: GLOBAL_CONFIG_NAME,
        skills: [],
        agents: [],
      },
      changed: false,
    }
  }

  const arriving = withTheDomainsItAdds(
    globalSplit,
    existingGlobalConfig,
    catalog
  )
  if (!existingGlobalConfig) return { config: arriving, changed: true }
  return mergeGlobalConfigs(existingGlobalConfig, arriving)
}

/**
 * Narrows the domains to those a newly added global skill comes from, so a project's own picks do
 * not widen what every project inherits.
 */
function withTheDomainsItAdds(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
  catalog: CompileCatalog
): ProjectConfig {
  const installed = new Set(
    existingGlobalConfig?.skills.map((skill) => skill.id)
  )
  const arrivingDomains = new Set(
    globalSplit.skills
      .filter((skill) => !skill.excluded && !installed.has(skill.id))
      .map((skill) => skillDomain(catalog, skill.id))
  )
  return {
    ...globalSplit,
    selectedDomains: (globalSplit.selectedDomains ?? []).filter((domain) =>
      arrivingDomains.has(domain)
    ),
  }
}
