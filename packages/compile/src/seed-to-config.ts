import {
  AGENT_NAMES,
  CODEX_MODEL_NAMES,
  isSeedScopePairWritable,
  resolveAssignment,
  resolveLoadState,
  seedAgentScope,
  SKILL_IDS,
  type LoadState,
  type SeedAgent,
  type SeedLoadState,
  type SeedPayload,
  type SkillTaxonomy,
} from "@workspace/matrix"
import { groupBy, indexBy, omit, partition } from "remeda"

import {
  byCategoryDeclarationOrder,
  categoryDomain,
  type CatalogSkill,
  type CompileCatalog,
} from "./catalog.js"
import { seatedCatalog } from "./catalog-seat.js"
import { HAND_WRITTEN_FIELDS } from "./config-source.js"
import { diagnostics } from "./diagnostics.js"
import { orderDomains } from "./domain-order.js"
import {
  CLI_INVOKE_COMMAND,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  GLOBAL_CONFIG_NAME,
  LOCAL_PSEUDO_CATEGORY,
} from "./paths.js"
import {
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
  isActiveAt,
} from "./scope-predicates.js"
import { validateSelection } from "./selection.js"
import { inAnEnglishList } from "./string.js"
import { typedEntries, typedFromEntries, typedKeys } from "./typed-object.js"
import type {
  AgentName,
  AgentScopeConfig,
  Category,
  CodexModelName,
  CategoryPath,
  Domain,
  ProjectConfig,
  SelectionValidation,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillScope,
  Stack,
  StackAgentConfig,
} from "./types.js"

export type SplitConfigResult = {
  global: ProjectConfig
  project: ProjectConfig
}

export type ProjectConfigOptions = {
  description?: string
  author?: string
}

const MATRIX_SAMPLE_SIZE = 5

function extractCategoryFromPath(
  categoryPath: CategoryPath
): Category | undefined {
  if (categoryPath === LOCAL_PSEUDO_CATEGORY) return undefined
  return categoryPath
}

type StackBuildInputs = {
  agentList: AgentName[]
  activeSkillsByCategory: Map<Category, SkillId[]>
  skillScope: Map<SkillId, SkillScope>
  agentScope: Map<AgentName, SkillScope>
  existingStack: Partial<Record<AgentName, StackAgentConfig>>
  catalog: CompileCatalog
  /**
   * Skills new to this session's top-level selection. Undefined disables per-agent curation
   * preservation, so every scope-compatible, relevant skill lands on every existing agent. Defined
   * (even empty), a skill absent from an agent's prior stack and from this set is omitted.
   */
  newlyAddedSkillIds?: ReadonlySet<SkillId>
  /**
   * `(agent, skillId)` pairs whose scope compatibility was gained this session, by flipping either
   * scope; admits pairs the skill-id diff would miss. Keys from `scopeEligibilityKey()`.
   */
  scopeEligibilityGained?: ReadonlySet<string>
}

export function scopeEligibilityKey(
  agent: AgentName,
  skillId: SkillId
): string {
  return `${agent}|${skillId}`
}

function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value)
}

function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value)
}

/**
 * `undefined` when the prior save had no entry. The generator writes `preloaded` only where true,
 * so a bare `{ id }` read back is the user's curated lazy and outranks any default.
 */
function priorLoadState(
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  skillId: SkillId
): LoadState | undefined {
  const prior = existingStack[agent]?.[category]?.find((a) => a.id === skillId)
  if (prior === undefined) return undefined

  return prior.preloaded === true ? "preloaded" : "lazy"
}

/**
 * The same table the editor's default assignments read. Only catalog skills on roster agents are
 * put to it: a local or marketplace skill, or a hand-written agent, is lazy by rule.
 * `resolveLoadState` throws on unknown ids, and catching that would be a silent fallback.
 */
function mappedLoadState(skillId: SkillId, agent: AgentName): LoadState {
  if (!isSkillId(skillId) || !isAgentName(agent)) return "lazy"

  return resolveLoadState({ skillId, agentId: agent })
}

/**
 * Targeting reads a domain and category, not catalog membership, so a marketplace skill is placed
 * by the LOADED catalogue's taxonomy. A category with no domain sends the id alone.
 */
function taxonomyOrIdOf(
  catalog: CompileCatalog,
  skillId: SkillId,
  category: Category
): SkillId | SkillTaxonomy {
  // Boundary cast: a catalogue category's `domain` is a Domain, typed `string` on the narrow
  // catalogue shape so the wire `Matrix` satisfies it too.
  const domainId = categoryDomain(catalog, category) as Domain | undefined
  if (domainId === undefined) return skillId

  return { id: skillId, domainId, categoryId: category }
}

/** The same targeting the editor's default assignments read, so both surfaces agree. */
function isRelevantPair(
  catalog: CompileCatalog,
  skillId: SkillId,
  category: Category,
  agent: AgentName
): boolean {
  return resolveAssignment(taxonomyOrIdOf(catalog, skillId, category)).some(
    (target) => target.agentId === agent
  )
}

/** A triple the prior save carries rides through wherever it sits; a new one needs targeting. */
function isPreservedOrRelevant(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs
): boolean {
  const hasPriorEntry =
    priorLoadState(inputs.existingStack, agent, category, skillId) !== undefined
  return (
    hasPriorEntry || isRelevantPair(inputs.catalog, skillId, category, agent)
  )
}

function getScopeOrThrow<K>(
  map: Map<K, SkillScope>,
  key: K,
  kind: "skill" | "agent"
): SkillScope {
  const scope = map.get(key)
  if (scope === undefined) {
    throw new Error(
      `generateProjectConfigFromSkills: ${kind} '${String(key)}' missing from ` +
        `${kind === "skill" ? "skillConfigs" : "agentConfigs"}. ` +
        `Caller must pass a ${kind === "skill" ? "SkillConfig" : "AgentScopeConfig"} ` +
        `for every selected ${kind}.`
    )
  }
  return scope
}

/**
 * Project skills never reach global agents; global skills reach any agent. The rule lives in
 * `isSeedScopePairWritable` (`@workspace/matrix/seed`) so the editor and CLI share it.
 */
export function isScopePairCompatible(
  skillScope: SkillScope,
  agentScope: SkillScope
): boolean {
  return isSeedScopePairWritable(skillScope, agentScope)
}

function isScopeCompatible(
  skillId: SkillId,
  agent: AgentName,
  skillScope: Map<SkillId, SkillScope>,
  agentScope: Map<AgentName, SkillScope>
): boolean {
  const sScope = getScopeOrThrow(skillScope, skillId, "skill")
  const aScope = getScopeOrThrow(agentScope, agent, "agent")
  return isScopePairCompatible(sScope, aScope)
}

/**
 * The per-agent curation rule; the scope filter has already run.
 *   - new agent → every skill the shared resolver targets lands, at the mapping's default.
 *   - existing agent → keep what its prior stack had; append skills in `newlyAddedSkillIds` or
 *     pairs in `scopeEligibilityGained`; omit the rest (the user removed them).
 * Without `newlyAddedSkillIds` every scope-compatible skill passes.
 */
function shouldIncludeTriple(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs
): boolean {
  if (inputs.newlyAddedSkillIds === undefined) return true

  const agentExistingStack = inputs.existingStack[agent]
  if (agentExistingStack === undefined) {
    return true
  }

  const priorCategory = agentExistingStack[category]
  if (priorCategory && priorCategory.some((a) => a.id === skillId)) return true

  if (inputs.newlyAddedSkillIds.has(skillId)) return true
  const scopeEligibility = inputs.scopeEligibilityGained
  if (
    scopeEligibility &&
    scopeEligibility.has(scopeEligibilityKey(agent, skillId))
  ) {
    return true
  }
  return false
}

function toStackAssignment(
  id: SkillId,
  agent: AgentName,
  category: Category,
  inputs: StackBuildInputs
): SkillAssignment {
  const prior = priorLoadState(inputs.existingStack, agent, category, id)
  const load = prior ?? mappedLoadState(id, agent)

  return load === "preloaded" ? { id, preloaded: true } : { id }
}

/**
 * Catalogue declaration order, so the same selection always emits the same bytes. The writer holds
 * the same rule for a stack it did not build.
 */
function inCanonicalCategoryOrder(
  activeSkillsByCategory: Map<Category, SkillId[]>,
  catalog: CompileCatalog
): [Category, SkillId[]][] {
  const byDeclaration = byCategoryDeclarationOrder(catalog)
  return [...activeSkillsByCategory].sort(([a], [b]) => byDeclaration(a, b))
}

function buildAgentStack(
  agent: AgentName,
  inputs: StackBuildInputs
): StackAgentConfig | undefined {
  const agentStack: StackAgentConfig = {}
  for (const [category, skillIds] of inCanonicalCategoryOrder(
    inputs.activeSkillsByCategory,
    inputs.catalog
  )) {
    const assignments = skillIds
      .filter((id) =>
        isScopeCompatible(id, agent, inputs.skillScope, inputs.agentScope)
      )
      .filter((id) => shouldIncludeTriple(agent, category, id, inputs))
      .filter((id) => isPreservedOrRelevant(agent, category, id, inputs))
      .map((id) => toStackAssignment(id, agent, category, inputs))
    if (assignments.length > 0) {
      agentStack[category] = assignments
    }
  }
  return typedKeys<Category>(agentStack).length > 0 ? agentStack : undefined
}

function buildStackForSelection(
  inputs: StackBuildInputs
): Partial<Record<AgentName, StackAgentConfig>> | undefined {
  // No agents in play: `undefined` omits the key, so the merger keeps the existing stack.
  if (inputs.agentList.length === 0) {
    diagnostics().verbose(
      `buildStackForSelection: no agents — returning undefined (stack untouched)`
    )
    return undefined
  }

  // Agents in play: `{}` is a real "nothing preloads" result the merger trusts. `undefined`
  // would resurrect the stale stack.
  const result: Partial<Record<AgentName, StackAgentConfig>> = {}
  for (const agent of inputs.agentList) {
    const built = buildAgentStack(agent, inputs)
    if (built) result[agent] = built
  }
  return result
}

type ResolvedSkillEntry = { skillId: SkillId; category: Category }

/**
 * Reports and drops ids this marketplace does not carry, and ids whose every entry is excluded. An
 * excluded global entry beside an active project one is kept.
 */
function resolveValidSkills(
  selectedSkillIds: SkillId[],
  skillConfigs: SkillConfig[],
  catalog: CompileCatalog
): {
  validSkills: ResolvedSkillEntry[]
  foundCount: number
  skippedCount: number
} {
  const looked = selectedSkillIds.map((skillId) => ({
    skillId,
    skill: catalog.skills[skillId],
  }))
  const found = looked.filter(
    (
      entry
    ): entry is typeof entry & { skill: NonNullable<typeof entry.skill> } =>
      entry.skill != null
  )
  const absentSkillIds = looked
    .filter((entry) => entry.skill == null)
    .map((entry) => entry.skillId)

  reportAbsentSkills(absentSkillIds, catalog)

  const excludedSkillIds = effectivelyExcludedSkillIds(skillConfigs)

  const validSkills = found
    .map(({ skillId, skill }) => ({
      skillId,
      // Boundary cast: a catalogue category id is a CategoryPath.
      category: extractCategoryFromPath(skill.category as CategoryPath),
    }))
    .filter(
      (entry): entry is typeof entry & { category: Category } =>
        entry.category != null
    )
    .filter((entry) => !excludedSkillIds.has(entry.skillId))

  return {
    validSkills,
    foundCount: found.length,
    skippedCount: absentSkillIds.length,
  }
}

/** The user gets the actionable warning; the catalogue sample goes to verbose diagnostics. */
function reportAbsentSkills(
  absentSkillIds: SkillId[],
  catalog: CompileCatalog
): void {
  if (absentSkillIds.length === 0) return

  for (const skillId of absentSkillIds) {
    diagnostics().warn(absentSkillWarning(skillId))
  }

  const matrixSample = typedKeys<SkillId>(catalog.skills)
    .slice(0, MATRIX_SAMPLE_SIZE)
    .join(", ")
  diagnostics().verbose(
    `${absentSkillIds.length} skills absent from the matrix. Matrix keys sample: [${matrixSample}]`
  )
}

function absentSkillWarning(skillId: SkillId): string {
  return (
    `Skill '${skillId}' is not in this marketplace — it stays in the configuration and no ` +
    `sub-agent is given it. Run '${CLI_INVOKE_COMMAND} update' to refresh the marketplace, or ` +
    `remove it with '${CLI_INVOKE_COMMAND} edit'.`
  )
}

/** Excluded entries spread first, so an active entry for the same skill wins. */
function buildSkillScopeMap(
  skillConfigs: SkillConfig[]
): Map<SkillId, SkillScope> {
  const [excludedConfigs, activeConfigs] = partition(skillConfigs, (s) =>
    Boolean(s.excluded)
  )
  return new Map(
    [...excludedConfigs, ...activeConfigs].map((s) => [s.id, s.scope])
  )
}

/** With agentConfigs, every selected agent must have an active entry; without, project scope. */
function resolveActiveAgentConfigs(
  agentList: AgentName[],
  providedConfigs: AgentScopeConfig[] | undefined
): AgentScopeConfig[] {
  const providedByName = providedConfigs
    ? indexBy(
        providedConfigs.filter((a) => !a.excluded),
        (a) => a.name
      )
    : {}
  return agentList.map((agentName) => {
    if (providedConfigs) {
      const provided = providedByName[agentName]
      if (!provided) {
        throw new Error(
          `generateProjectConfigFromSkills: selected agent '${agentName}' has no ` +
            `non-excluded AgentScopeConfig in agentConfigs.`
        )
      }
      return provided
    }
    return { name: agentName, scope: "project" as const }
  })
}

/**
 * Rebuilds the stack (agent -> category -> SkillAssignment[]) from the current selection and any
 * prior stack. A triple lands when the agent and skill are selected and active, the skill's scope
 * reaches the agent, and it is either already in the prior stack or targeted by the shared
 * resolver. Prior triples keep their load state; new ones take the shared mapping's default.
 * The catalogue comes from {@link seatedCatalog}.
 */
export function generateProjectConfigFromSkills(
  name: string,
  selectedSkillIds: SkillId[],
  options?: ProjectConfigOptions & {
    selectedAgents?: AgentName[]
    skillConfigs?: SkillConfig[]
    agentConfigs?: AgentScopeConfig[]
    existingStack?: Partial<Record<AgentName, StackAgentConfig>>
    /**
     * Skills new to this session. Passing it, even empty, opts into per-agent curation
     * preservation; undefined seeds everything.
     */
    newlyAddedSkillIds?: readonly SkillId[]
    /**
     * Scope-compatibility gains `newlyAddedSkillIds` cannot express; see {@link
     * scopeEligibilityKey}.
     */
    scopeEligibilityGained?: ReadonlySet<string>
  }
): ProjectConfig {
  const catalog = seatedCatalog()
  const agentList = options?.selectedAgents
    ? [...options.selectedAgents].sort()
    : []

  // Scope lookups must never silently default.
  if (agentList.length > 0) {
    if (!options?.skillConfigs) {
      throw new Error(
        `generateProjectConfigFromSkills: selectedAgents was passed without skillConfigs. ` +
          `Callers must pass a SkillConfig for every selected skill.`
      )
    }
    if (!options.agentConfigs) {
      throw new Error(
        `generateProjectConfigFromSkills: selectedAgents was passed without agentConfigs. ` +
          `Callers must pass an AgentScopeConfig for every selected agent.`
      )
    }
  }

  // Empty only when agentList is, and then no scope work runs.
  const skillConfigs = options?.skillConfigs ?? []
  const agentConfigs = options?.agentConfigs ?? []

  diagnostics().verbose(
    `generateProjectConfigFromSkills: ${selectedSkillIds.length} skills, ` +
      `matrix has ${typedKeys<SkillId>(catalog.skills).length} entries, ` +
      `agents=[${agentList.join(", ")}]`
  )

  const { validSkills, foundCount, skippedCount } = resolveValidSkills(
    selectedSkillIds,
    skillConfigs,
    catalog
  )

  diagnostics().verbose(
    `generateProjectConfigFromSkills: ${foundCount} found, ${skippedCount} not found, ` +
      `${agentList.length} agents in stack`
  )

  const activeSkillsByCategory = new Map(
    typedEntries(groupBy(validSkills, (entry) => entry.category)).map(
      ([category, entries]) => [category, entries.map((entry) => entry.skillId)]
    )
  )

  const skillScope = buildSkillScopeMap(skillConfigs)
  const agentScope = activeAgentScopeMap(agentConfigs)

  const newlyAddedSkillIdsSet: ReadonlySet<SkillId> | undefined =
    options?.newlyAddedSkillIds === undefined
      ? undefined
      : new Set(options.newlyAddedSkillIds)

  const stackProperty = buildStackForSelection({
    agentList,
    activeSkillsByCategory,
    skillScope,
    agentScope,
    catalog,
    existingStack: options?.existingStack ?? {},
    ...(newlyAddedSkillIdsSet !== undefined && {
      newlyAddedSkillIds: newlyAddedSkillIdsSet,
    }),
    ...(options?.scopeEligibilityGained !== undefined && {
      scopeEligibilityGained: options.scopeEligibilityGained,
    }),
  })

  const skills: SkillConfig[] =
    options?.skillConfigs ??
    selectedSkillIds.map((id) => ({
      id,
      scope: "project" as const,
      origin: EJECT_SOURCE,
    }))

  const activeAgentConfigs = resolveActiveAgentConfigs(
    agentList,
    options?.agentConfigs
  )
  const excludedAgentConfigs = agentConfigs.filter((ac) => ac.excluded)
  const finalAgentConfigs: AgentScopeConfig[] = [
    ...activeAgentConfigs,
    ...excludedAgentConfigs,
  ]

  return {
    name,
    agents: finalAgentConfigs,
    skills,
    ...(stackProperty && { stack: stackProperty }),
    ...(options?.description && { description: options.description }),
    ...(options?.author && { author: options.author }),
  }
}

/**
 * An author's flag rides through (`loadStacks` makes even bare strings explicit for third-party
 * stacks). An entry with no flag takes the shared mapping's load, as a hand-picked skill does.
 */
function toStackPropertyAssignment(
  assignment: SkillAssignment,
  agent: AgentName
): SkillAssignment {
  if (assignment.preloaded !== undefined) return assignment
  if (mappedLoadState(assignment.id, agent) === "lazy") return assignment

  return { ...assignment, preloaded: true }
}

/** Values are already SkillAssignment[] (normalized by loadStacks()). */
export function buildStackProperty(
  stack: Stack
): Partial<Record<AgentName, StackAgentConfig>> {
  return typedFromEntries(
    typedEntries<AgentName, StackAgentConfig>(stack.agents)
      .filter(
        ([, agentConfig]) =>
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
          agentConfig && typedKeys<Category>(agentConfig).length > 0
      )
      .map(([agentId, agentConfig]) => {
        const resolvedMappings: StackAgentConfig = typedFromEntries(
          typedEntries<Category, SkillAssignment[]>(agentConfig)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
            .filter(([, assignments]) => assignments && assignments.length > 0)
            .map(([category, assignments]) => [
              category,
              assignments.map((assignment) =>
                toStackPropertyAssignment(assignment, agentId)
              ),
            ])
        )
        return [agentId, resolvedMappings] as const
      })
      .filter(([, mappings]) => typedKeys<Category>(mappings).length > 0)
  )
}

function splitAgentStack(
  agentStack: StackAgentConfig,
  globalSkillIds: ReadonlySet<SkillId>
): { global: StackAgentConfig; project: StackAgentConfig } {
  const perCategory = typedEntries<Category, SkillAssignment[]>(agentStack)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
    .filter(([, assignments]) => assignments !== undefined)
    .map(([category, assignments]) => {
      const [globalOnly, projectOnly] = partition(assignments, (a) =>
        globalSkillIds.has(a.id)
      )
      return { category, globalOnly, projectOnly }
    })
  return {
    global: Object.fromEntries(
      perCategory
        .filter((c) => c.globalOnly.length > 0)
        .map((c) => [c.category, c.globalOnly])
    ),
    project: Object.fromEntries(
      perCategory
        .filter((c) => c.projectOnly.length > 0)
        .map((c) => [c.category, c.projectOnly])
    ),
  }
}

/**
 * Splits by skill scope; agents follow the skills their stack references. Selected domains go to
 * both partitions; hand-written fields to the project alone.
 */
export function splitConfigByScope(config: ProjectConfig): SplitConfigResult {
  // Excluded-global tombstones go to the project partition as overrides.
  const [globalSkills, projectSkills] = partition(config.skills, (s) =>
    isActiveAt(s, "global")
  )
  const [globalAgents, projectAgents] = partition(config.agents, (a) =>
    isActiveAt(a, "global")
  )

  // Global agents reference only global skills; project agents keep every reference.
  const globalSkillIds = new Set(globalSkills.map((s) => s.id))
  const globalStack: NonNullable<ProjectConfig["stack"]> = {}
  const projectStack: NonNullable<ProjectConfig["stack"]> = {}

  if (config.stack) {
    for (const agent of globalAgents) {
      const agentStack = config.stack[agent.name]
      if (!agentStack) continue
      const split = splitAgentStack(agentStack, globalSkillIds)
      if (typedKeys<Category>(split.global).length > 0) {
        globalStack[agent.name] = split.global
      }
      if (typedKeys<Category>(split.project).length > 0) {
        projectStack[agent.name] = split.project
      }
    }
    for (const agent of projectAgents) {
      const agentStack = config.stack[agent.name]
      if (agentStack) {
        projectStack[agent.name] = agentStack
      }
    }
  }

  // `stack` is written on both partitions unconditionally: the spread carries the undivided
  // stack, and an empty derivation must still say `{}` or the merger keeps the stale one.
  const globalConfig: ProjectConfig = {
    ...omit(config, HAND_WRITTEN_FIELDS),
    name: GLOBAL_CONFIG_NAME,
    agents: globalAgents,
    skills: globalSkills,
    stack: globalStack,
  }

  const projectConfig: ProjectConfig = {
    ...config,
    name: config.name,
    agents: projectAgents,
    skills: projectSkills,
    stack: projectStack,
  }

  return { global: globalConfig, project: projectConfig }
}

/** What the CLI installs: a shared configuration decoded against the catalog. */
export type InstallSelection = {
  skills: SkillConfig[]
  selectedAgents: AgentName[]
  agentConfigs: AgentScopeConfig[]
  /** Per-`(skill, sub-agent)` holdings and loads. */
  assignedStack: Partial<Record<AgentName, StackAgentConfig>>
  selectedStackId: string | null
  /** The sharer's description (`init --from`); undefined takes the applied stack's. */
  description?: string
  selectedDomains: Domain[]
  validation: SelectionValidation
}

export type SeedMapping = {
  result: InstallSelection
  /** Reported, never fatal. */
  skippedSkillIds: string[]
  skippedAgentNames: string[]
}

const KNOWN_AGENTS = new Set<string>(AGENT_NAMES)

function sourceForSkill(skill: CatalogSkill): string {
  return (
    skill.availableSources?.find((s) => s.primary)?.name ??
    DEFAULT_PUBLIC_SOURCE_NAME
  )
}

/** `skills` is keyed by id, so a `(skill, sub-agent)` pair occurs once: nothing to de-duplicate. */
function addToAgentStack(
  stack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  assignment: SkillAssignment
): void {
  const agentStack = (stack[agent] ??= {})
  const assignments = (agentStack[category] ??= [])
  assignments.push(assignment)
}

function toSkillAssignment(
  skillId: SkillId,
  load: SeedLoadState
): SkillAssignment {
  return { id: skillId, preloaded: load === "preloaded" }
}

type SeedAgentMap = {
  known: Map<AgentName, SeedAgent>
  /** Dropped, with their assignment rows. */
  switchedOff: Set<string>
  /** Reported, never fatal. */
  unknown: string[]
}

function readAgentMap(agents: SeedPayload["agents"]): SeedAgentMap {
  const known = new Map<AgentName, SeedAgent>()
  const switchedOff = new Set<string>()
  const unknown: string[] = []

  for (const [name, entry] of Object.entries(agents)) {
    if (!isAgentName(name)) unknown.push(name)
    else if (entry.on === false) switchedOff.add(name)
    else known.set(name, entry)
  }

  return { known, switchedOff, unknown }
}

/** An absent key keeps whatever the agent's metadata says. */
function agentScopeConfig(
  name: AgentName,
  entry: SeedAgent | undefined
): AgentScopeConfig {
  return {
    name,
    scope: seedAgentScope(entry),
    ...(entry?.model !== undefined && { model: entry.model }),
    ...offeredCodexModel(name, entry?.codexModel),
    ...(entry?.effort !== undefined && { effort: entry.effort }),
  }
}

const OFFERED_CODEX_MODELS = new Set<string>(CODEX_MODEL_NAMES)

function isOfferedCodexModel(id: string): id is CodexModelName {
  return OFFERED_CODEX_MODELS.has(id)
}

/**
 * The wire carries any Codex id so a retired one cannot break a link; an id this build does not
 * offer is dropped with a warning, and the sub-agent runs on the session's model.
 */
function offeredCodexModel(
  agent: AgentName,
  id: string | undefined
): Pick<AgentScopeConfig, "codexModel"> {
  if (id === undefined) return {}
  if (isOfferedCodexModel(id)) return { codexModel: id }

  diagnostics().warn(codexModelNotOfferedWarning(agent, id))
  return {}
}

function codexModelNotOfferedWarning(agent: AgentName, id: string): string {
  return (
    `Sub-agent '${agent}' asks for Codex model '${id}', which this version of the CLI does not ` +
    `offer, so it runs on the session's model. Offered: ${inAnEnglishList(CODEX_MODEL_NAMES)}.`
  )
}

type UnwritableAssignment = { skillId: SkillId; agent: AgentName }

/**
 * Names every pair, not just the first, and both halves: the skill could move to global scope or
 * the sub-agent be pinned to the project.
 */
function unwritableAssignmentsError(
  assignments: UnwritableAssignment[]
): string {
  return [
    "This configuration cannot be installed: a project-scoped skill never reaches a sub-agent " +
      "that rests at global scope, so these assignments have nowhere to be written:",
    ...assignments.map(({ skillId, agent }) => `  ${skillId} -> ${agent}`),
    "Re-share it with each sub-agent above pinned to the project, or each skill above at global scope.",
  ].join("\n")
}

/**
 * A shared configuration in the shape `init --from` installs. Unknown ids are skipped, never
 * fatal, so a rename cannot break older links. Assignments become `assignedStack`, which replaces
 * the derived stack. An unwritable pair is the one fatal case: nothing downstream filters
 * `assignedStack`.
 */
export function seedToInstallSelection(
  payload: SeedPayload,
  catalog: CompileCatalog
): SeedMapping {
  const domains = new Set<Domain>()
  const assignedStack: Partial<Record<AgentName, StackAgentConfig>> = {}
  const skills: SkillConfig[] = []
  const skippedSkillIds: string[] = []
  const unwritable: UnwritableAssignment[] = []
  const agentNames = new Set<AgentName>()
  const agentMap = readAgentMap(payload.agents)
  const skippedAgentNames = new Set<string>(agentMap.unknown)

  for (const [skillId, entry] of Object.entries(payload.skills)) {
    const skill = catalog.skills[skillId]
    const domain = skill?.category
      ? categoryDomain(catalog, skill.category)
      : undefined

    if (!skill?.category || domain === undefined) {
      skippedSkillIds.push(skillId)
      continue
    }

    // Boundary casts: both come from the catalogue's own keys, and the `local` pseudo-category
    // (no domain) already left with the skips.
    const id = skillId as SkillId
    const category = skill.category as Category

    domains.add(domain as Domain)

    skills.push({
      id,
      scope: entry.scope,
      origin: entry.install === "eject" ? EJECT_SOURCE : sourceForSkill(skill),
    })

    // An agent is not switched on by a skill this catalog cannot install.
    for (const [agentName, load] of Object.entries(entry.assignments)) {
      if (agentMap.switchedOff.has(agentName)) continue
      if (!KNOWN_AGENTS.has(agentName)) {
        skippedAgentNames.add(agentName)
        continue
      }

      // Boundary cast: guarded by KNOWN_AGENTS immediately above.
      const agent = agentName as AgentName
      if (
        !isScopePairCompatible(
          entry.scope,
          seedAgentScope(agentMap.known.get(agent))
        )
      ) {
        unwritable.push({ skillId: id, agent })
        continue
      }

      agentNames.add(agent)
      addToAgentStack(
        assignedStack,
        agent,
        category,
        toSkillAssignment(id, load)
      )
    }
  }

  if (unwritable.length > 0)
    throw new Error(unwritableAssignmentsError(unwritable))

  // Switched on by the map alone, with no skill to carry them in.
  for (const [name, entry] of agentMap.known) {
    if (entry.on === true) agentNames.add(name)
  }

  const selectedAgents = [...agentNames]

  return {
    result: {
      skills,
      selectedAgents,
      agentConfigs: selectedAgents.map((name) =>
        agentScopeConfig(name, agentMap.known.get(name))
      ),
      assignedStack,
      selectedStackId: payload.stackId,
      // Absent and empty are different files on disk.
      ...(payload.description !== undefined && {
        description: payload.description,
      }),
      selectedDomains: orderDomains([...domains]),
      // Revalidated: the payload was consistent against the authoring app's catalog, not this one.
      validation: validateSelection(
        skills.map((skill) => skill.id),
        catalog
      ),
    },
    skippedSkillIds,
    skippedAgentNames: [...skippedAgentNames],
  }
}
