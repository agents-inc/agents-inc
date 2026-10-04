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

/**
 * THE GLOBAL CONFIG A PROJECT INSTALL WRITES.
 *
 * Run from a project directory, `init` never writes the session's global half
 * as it stands: it merges that half into the global config already on disk,
 * which on a clean machine is the blank pair `ensureBlankPair` has just
 * written. The CLI's `config-gate/propagate.ts` resolves the file it writes
 * through {@link addSessionToGlobal}, and the editor's output preview resolves
 * the file it draws through the same call over {@link blankGlobalConfig} — so
 * the fields this merge carries across are the fields the drawn global
 * `config.ts` holds, and a second copy would be a second answer to what that
 * file says.
 */

/**
 * The configuration the CLI's blank global `config.ts` template
 * (`generateBlankGlobalConfigSource`) holds, as a loader reads it back.
 *
 * What a project install on a machine with nothing installed merges its global
 * half into. The editor's output preview has no file to read, so it starts from
 * this; the CLI's `project-config.test.ts` loads the template and holds it
 * against this, which is what keeps the two one claim.
 */
export function blankGlobalConfig(): ProjectConfig {
  return {
    name: GLOBAL_CONFIG_NAME,
    skills: [],
    agents: [],
    selectedDomains: [],
  }
}

/**
 * Deep-additive stack merge: appends any (agent, category, skill) triple present in
 * `incoming` but missing in `existing`. Never removes or overwrites existing entries
 * (including their `preloaded` flags). Returns a fresh stack object — inputs are not
 * mutated. `changed` is true iff at least one new agent, category, or skill assignment
 * was appended.
 */
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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

/**
 * Mutates `existingAgentStack` in place by appending any category or skill assignment
 * from `incomingAgentStack` that is not already present. Returns true if anything was
 * appended. Caller must pass a cloned `existingAgentStack` — this function is only
 * called on the merged copy, never on the original input.
 */
function mergeAgentCategories(
  existingAgentStack: StackAgentConfig,
  incomingAgentStack: StackAgentConfig
): boolean {
  let changed = false
  for (const [category, incomingAssignments] of typedEntries<
    Category,
    SkillAssignment[]
  >(incomingAgentStack)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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

/**
 * Mutates `existingAssignments` in place by appending a copy of each incoming assignment whose id
 * it does not already hold — an id repeated within `incomingAssignments` is appended once. Returns
 * true if anything was appended. Called on the merged copy only, like
 * {@link mergeAgentCategories}.
 */
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

/**
 * Merges new global-scoped items into an existing global config.
 * Adds skills/agents that don't already exist. Never removes existing items.
 *
 * The CLI's unit tests for it are the `mergeGlobalConfigs` describe block in
 * `local-installer.test.ts`, which reach it through `config-gate/propagate.ts`.
 */
export function mergeGlobalConfigs(
  existing: ProjectConfig,
  incoming: ProjectConfig
): { config: ProjectConfig; changed: boolean } {
  const existingSkillIds = new Set(existing.skills.map((s) => s.id))
  const existingAgentNames = new Set(existing.agents.map((a) => a.name))

  const incomingActiveSkills = incoming.skills.filter((s) => !s.excluded)
  const incomingActiveAgents = incoming.agents.filter((a) => !a.excluded)
  const newSkills = incomingActiveSkills.filter(
    (s) => !existingSkillIds.has(s.id)
  )
  const newAgents = incomingActiveAgents.filter(
    (a) => !existingAgentNames.has(a.name)
  )

  const mergedSkills = [...existing.skills, ...newSkills]
  const mergedAgents = [...existing.agents, ...newAgents]

  // Per-agent stack merge policy: deep-additive. Project-context edits must NEVER remove
  // or overwrite global state; individual projects express their local view via tombstones
  // in the PROJECT config, not by rewriting the GLOBAL config (see commit 403df46:
  // "never modify global config from project-level operations").
  //
  // Merge rule per triple (agent, category, skill):
  //   - agent absent in existing    -> add from incoming
  //   - category absent in existing -> add from incoming
  //   - skill id absent in existing -> append from incoming
  //   - everything already present  -> keep existing as-is (including its preloaded flag)
  // Anything present only in `existing` is left untouched.
  const { stack: mergedStack, changed: stackChanged } = additiveMergeStack(
    existing.stack,
    incoming.stack
  )

  // Merge selected domains (union, no duplicates)
  const mergedSelectedDomains = [
    ...new Set([
      ...(existing.selectedDomains ?? []),
      ...(incoming.selectedDomains ?? []),
    ]),
  ]

  // Marketplace identity (`marketplace`, `marketplaceName`) travels on the global partition of
  // `splitConfigByScope` but was previously lost here, leaving the global config with no
  // record of where its plugins came from. `uninstall` reads `config.marketplaceName` to build
  // the `<id>@<marketplace name>` registry key (getCliInstalledPluginKeys) — without it a global
  // uninstall silently owns nothing and leaves registered plugins behind.
  //
  // Precedence is FILL-ONLY: existing wins, incoming is used solely when the global config
  // has no value yet. Both fields are scalar but the merged config is multi-marketplace by
  // construction — this merge never removes skills, so after a second project init from a
  // different marketplace the skills array holds plugins from BOTH, and whichever label is
  // recorded orphans the other's registry key. Repointing is therefore never a strict
  // improvement, and doing it from a project context would silently rewrite global state on
  // behalf of every other registered project (commit 403df46). This also matches
  // `mergeConfigs`, which preserves `existingConfig.marketplaceName` on the home-root install
  // path. Changing global marketplace identity stays an explicit global-scope operation
  // (`init` run from ~), which writes the global config directly and bypasses this merge.
  const addsEntries = newSkills.length > 0 || newAgents.length > 0

  // No term for the marketplace identity: it is filled only alongside an added entry, and
  // `addsEntries` already marks the merge dirty — which is what `writeGlobalPairWhenChanged` (the
  // CLI's lib/config-gate/index.ts) tests before writing, so the fill is never dropped unwritten.
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

/**
 * The marketplace identity the global config records after a merge: its own, with each field it
 * lacks filled from `arriving` — and `arriving` is `null` unless the merge ADDS an entry.
 *
 * The entries are what came from that marketplace. A project session inlines every global entry
 * it holds, so the incoming half names the project's marketplace even when each of those entries
 * is the global install's own; filling from it then would name, in the one config every project
 * inherits, a catalogue none of its entries came from.
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

/** What one resolution decided: the config to commit, and whether the global data changed. */
export type ResolvedGlobalConfig = { config: ProjectConfig; changed: boolean }

/**
 * The standing resolution, and the one every caller but `edit --from` gets: the session's global
 * items are ADDED and nothing is taken away.
 *
 * A project install has asked nobody about the machine, so it may not decide for it (commit
 * 403df46, "never modify global config from project-level operations"). The `hasGlobalItems`
 * shortcut is part of that: a session carrying nothing global is not a statement that the global
 * install should be empty. So is {@link withTheDomainsItAdds}: a domain the session picked for the
 * project alone is not one the global install takes on.
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
 * The session's global half, with its domains narrowed to those a global skill it ADDS comes from.
 *
 * A split hands its global half the session's whole domain selection, the project's own picks
 * included, because a domain selection belongs to the config it is written in. Merged into the
 * global install as it stands, a project that picked an API skill for itself would widen the
 * domains every project inherits — and rewrite the global config while adding nothing to it.
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
