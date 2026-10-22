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
  type SeedSkill,
  type SkillTaxonomy,
} from "@workspace/matrix"
import { groupBy, indexBy, isDefined, mapValues, omit, partition } from "remeda"

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

const SCOPE_CONFIG_NAMES = {
  skill: { list: "skillConfigs", entry: "SkillConfig" },
  agent: { list: "agentConfigs", entry: "AgentScopeConfig" },
} as const

type StackBuildInputs = {
  agentList: AgentName[]
  activeSkillsByCategory: Map<Category, SkillId[]>
  skillScope: Map<SkillId, SkillScope>
  agentScope: Map<AgentName, SkillScope>
  existingStack: Partial<Record<AgentName, StackAgentConfig>>
  catalog: CompileCatalog
  newlyAddedSkillIds: ReadonlySet<SkillId> | undefined
  scopeEligibilityGained: ReadonlySet<string> | undefined
}

type ResolvedSkillEntry = { skillId: SkillId; category: Category }

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
  if (agentList.length > 0) {
    assertScopeConfigsGiven(options?.skillConfigs, options?.agentConfigs)
  }

  // Empty only when agentList is, and then no scope work runs.
  const skillConfigs = options?.skillConfigs ?? []
  const agentConfigs = options?.agentConfigs ?? []

  diagnostics().verbose(
    `generateProjectConfigFromSkills: ${selectedSkillIds.length} skills, ` +
      `matrix has ${typedKeys<SkillId>(catalog.skills).length} entries, ` +
      `agents=[${agentList.join(", ")}]`
  )
  const { validSkills, foundCount, absentSkillIds } = resolveValidSkills(
    selectedSkillIds,
    skillConfigs,
    catalog
  )
  reportAbsentSkills(absentSkillIds, catalog)
  diagnostics().verbose(
    `generateProjectConfigFromSkills: ${foundCount} found, ${absentSkillIds.length} not found, ` +
      `${agentList.length} agents in stack`
  )

  const stack = buildStackForSelection({
    agentList,
    activeSkillsByCategory: skillIdsByCategory(validSkills),
    skillScope: buildSkillScopeMap(skillConfigs),
    agentScope: activeAgentScopeMap(agentConfigs),
    existingStack: options?.existingStack ?? {},
    catalog,
    newlyAddedSkillIds:
      options?.newlyAddedSkillIds === undefined
        ? undefined
        : new Set(options.newlyAddedSkillIds),
    scopeEligibilityGained: options?.scopeEligibilityGained,
  })

  return {
    name,
    agents: [
      ...resolveActiveAgentConfigs(agentList, options?.agentConfigs),
      ...agentConfigs.filter((ac) => ac.excluded),
    ],
    skills: options?.skillConfigs ?? asProjectCopies(selectedSkillIds),
    ...(stack && { stack }),
    ...(options?.description && { description: options.description }),
    ...(options?.author && { author: options.author }),
  }
}

export function isScopePairCompatible(
  skillScope: SkillScope,
  agentScope: SkillScope
): boolean {
  return isSeedScopePairWritable(skillScope, agentScope)
}

export function scopeEligibilityKey(
  agent: AgentName,
  skillId: SkillId
): string {
  return `${agent}|${skillId}`
}

function assertScopeConfigsGiven(
  skillConfigs: SkillConfig[] | undefined,
  agentConfigs: AgentScopeConfig[] | undefined
): void {
  if (!skillConfigs) {
    throw new Error(
      `generateProjectConfigFromSkills: selectedAgents was passed without skillConfigs. ` +
        `Callers must pass a SkillConfig for every selected skill.`
    )
  }
  if (!agentConfigs) {
    throw new Error(
      `generateProjectConfigFromSkills: selectedAgents was passed without agentConfigs. ` +
        `Callers must pass an AgentScopeConfig for every selected agent.`
    )
  }
}

function resolveValidSkills(
  selectedSkillIds: SkillId[],
  skillConfigs: SkillConfig[],
  catalog: CompileCatalog
): {
  validSkills: ResolvedSkillEntry[]
  foundCount: number
  absentSkillIds: SkillId[]
} {
  const [found, absent] = partition(
    selectedSkillIds.map((skillId) => ({
      skillId,
      skill: catalog.skills[skillId],
    })),
    isInCatalog
  )

  const excludedSkillIds = effectivelyExcludedSkillIds(skillConfigs)
  const validSkills = found
    .map(({ skillId, skill }) => ({
      skillId,
      // Boundary cast: a catalogue category id is a CategoryPath.
      category: extractCategoryFromPath(skill.category as CategoryPath),
    }))
    .filter(hasCategory)
    .filter((entry) => !excludedSkillIds.has(entry.skillId))

  return {
    validSkills,
    foundCount: found.length,
    absentSkillIds: absent.map((entry) => entry.skillId),
  }
}

function isInCatalog(entry: {
  skillId: SkillId
  skill: CatalogSkill | undefined
}): entry is { skillId: SkillId; skill: CatalogSkill } {
  return entry.skill != null
}

function hasCategory(entry: {
  skillId: SkillId
  category: Category | undefined
}): entry is ResolvedSkillEntry {
  return entry.category != null
}

function extractCategoryFromPath(
  categoryPath: CategoryPath
): Category | undefined {
  if (categoryPath === LOCAL_PSEUDO_CATEGORY) return undefined
  return categoryPath
}

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

function skillIdsByCategory(
  skills: ResolvedSkillEntry[]
): Map<Category, SkillId[]> {
  return new Map(
    typedEntries(groupBy(skills, (entry) => entry.category)).map(
      ([category, entries]) => [category, entries.map((entry) => entry.skillId)]
    )
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
  return typedFromEntries(
    inputs.agentList
      .map((agent) => [agent, buildAgentStack(agent, inputs)] as const)
      .filter(([, agentStack]) => hasCategories(agentStack))
  )
}

function buildAgentStack(
  agent: AgentName,
  inputs: StackBuildInputs
): StackAgentConfig {
  return typedFromEntries(
    inCanonicalCategoryOrder(inputs.activeSkillsByCategory, inputs.catalog)
      .map(
        ([category, skillIds]) =>
          [category, assignmentsFor(agent, category, skillIds, inputs)] as const
      )
      .filter(([, assignments]) => assignments.length > 0)
  )
}

function hasCategories(agentStack: StackAgentConfig): boolean {
  return typedKeys<Category>(agentStack).length > 0
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

function assignmentsFor(
  agent: AgentName,
  category: Category,
  skillIds: SkillId[],
  inputs: StackBuildInputs
): SkillAssignment[] {
  return skillIds
    .filter((id) => isScopeCompatible(agent, id, inputs))
    .filter((id) => survivesCuration(agent, category, id, inputs))
    .filter((id) => isPreservedOrRelevant(agent, category, id, inputs))
    .map((id) => toStackAssignment(id, agent, category, inputs))
}

function isScopeCompatible(
  agent: AgentName,
  skillId: SkillId,
  inputs: StackBuildInputs
): boolean {
  return isScopePairCompatible(
    getScopeOrThrow(inputs.skillScope, skillId, "skill"),
    getScopeOrThrow(inputs.agentScope, agent, "agent")
  )
}

function getScopeOrThrow<K>(
  map: Map<K, SkillScope>,
  key: K,
  kind: keyof typeof SCOPE_CONFIG_NAMES
): SkillScope {
  const scope = map.get(key)
  if (scope !== undefined) return scope

  const { list, entry } = SCOPE_CONFIG_NAMES[kind]
  throw new Error(
    `generateProjectConfigFromSkills: ${kind} '${String(key)}' missing from ${list}. ` +
      `Caller must pass a ${entry} for every selected ${kind}.`
  )
}

/**
 * An existing agent keeps what its prior stack had, appends skills in `newlyAddedSkillIds` or
 * pairs in `scopeEligibilityGained`, and omits the rest (the user removed them).
 */
function survivesCuration(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs
): boolean {
  const { existingStack, newlyAddedSkillIds, scopeEligibilityGained } = inputs
  const isNewAgent = existingStack[agent] === undefined
  if (newlyAddedSkillIds === undefined || isNewAgent) return true

  return (
    isInPriorStack(existingStack, agent, category, skillId) ||
    newlyAddedSkillIds.has(skillId) ||
    scopeEligibilityGained?.has(scopeEligibilityKey(agent, skillId)) === true
  )
}

function isPreservedOrRelevant(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs
): boolean {
  return (
    isInPriorStack(inputs.existingStack, agent, category, skillId) ||
    isRelevantPair(inputs.catalog, skillId, category, agent)
  )
}

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
 * The generator writes `preloaded` only where true, so a bare `{ id }` read back is the user's
 * curated lazy and outranks any default.
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

function isInPriorStack(
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  skillId: SkillId
): boolean {
  return priorLoadState(existingStack, agent, category, skillId) !== undefined
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

function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value)
}

function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value)
}

function resolveActiveAgentConfigs(
  agentList: AgentName[],
  providedConfigs: AgentScopeConfig[] | undefined
): AgentScopeConfig[] {
  if (providedConfigs === undefined) {
    return agentList.map((name) => ({ name, scope: "project" as const }))
  }

  const activeByName = indexBy(
    providedConfigs.filter((a) => !a.excluded),
    (a) => a.name
  )
  return agentList.map((agentName) => {
    const active = activeByName[agentName]
    if (!active) {
      throw new Error(
        `generateProjectConfigFromSkills: selected agent '${agentName}' has no ` +
          `non-excluded AgentScopeConfig in agentConfigs.`
      )
    }
    return active
  })
}

function asProjectCopies(skillIds: SkillId[]): SkillConfig[] {
  return skillIds.map((id) => ({
    id,
    scope: "project" as const,
    origin: EJECT_SOURCE,
  }))
}

/** Values are already SkillAssignment[] (normalized by loadStacks()). */
export function buildStackProperty(
  stack: Stack
): Partial<Record<AgentName, StackAgentConfig>> {
  return typedFromEntries(
    typedEntries<AgentName, StackAgentConfig>(stack.agents)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
      .filter(([, agentConfig]) => agentConfig && hasCategories(agentConfig))
      .map(
        ([agent, agentConfig]) =>
          [agent, withResolvedLoads(agent, agentConfig)] as const
      )
      .filter(([, agentStack]) => hasCategories(agentStack))
  )
}

function withResolvedLoads(
  agent: AgentName,
  agentConfig: StackAgentConfig
): StackAgentConfig {
  return mapCategoriesDroppingEmpty(agentConfig, (assignments) =>
    assignments.map((assignment) =>
      toStackPropertyAssignment(assignment, agent)
    )
  )
}

/**
 * An author's flag rides through (`loadStacks` makes even bare strings explicit for third-party
 * stacks).
 */
function toStackPropertyAssignment(
  assignment: SkillAssignment,
  agent: AgentName
): SkillAssignment {
  if (assignment.preloaded !== undefined) return assignment
  if (mappedLoadState(assignment.id, agent) === "lazy") return assignment

  return { ...assignment, preloaded: true }
}

function mapCategoriesDroppingEmpty(
  agentStack: StackAgentConfig,
  transform: (assignments: SkillAssignment[]) => SkillAssignment[]
): StackAgentConfig {
  return typedFromEntries(
    typedEntries<Category, SkillAssignment[]>(agentStack)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops Partial's `| undefined`; this guards an explicitly-undefined slot
      .filter(([, assignments]) => assignments !== undefined)
      .map(
        ([category, assignments]) => [category, transform(assignments)] as const
      )
      .filter(([, transformed]) => transformed.length > 0)
  )
}

export function splitConfigByScope(config: ProjectConfig): SplitConfigResult {
  // Excluded-global tombstones go to the project partition as overrides.
  const [globalSkills, projectSkills] = partition(config.skills, (s) =>
    isActiveAt(s, "global")
  )
  const [globalAgents, projectAgents] = partition(config.agents, (a) =>
    isActiveAt(a, "global")
  )
  const stack = splitStackByScope(
    config.stack ?? {},
    globalAgents,
    projectAgents,
    new Set(globalSkills.map((s) => s.id))
  )

  // `stack` is written on both partitions unconditionally: the spread carries the undivided
  // stack, and an empty derivation must still say `{}` or the merger keeps the stale one.
  return {
    global: {
      ...omit(config, HAND_WRITTEN_FIELDS),
      name: GLOBAL_CONFIG_NAME,
      agents: globalAgents,
      skills: globalSkills,
      stack: stack.global,
    },
    project: {
      ...config,
      agents: projectAgents,
      skills: projectSkills,
      stack: stack.project,
    },
  }
}

/** Global agents reference only global skills; project agents keep every reference. */
function splitStackByScope(
  stack: NonNullable<ProjectConfig["stack"]>,
  globalAgents: AgentScopeConfig[],
  projectAgents: AgentScopeConfig[],
  globalSkillIds: ReadonlySet<SkillId>
): Record<SkillScope, NonNullable<ProjectConfig["stack"]>> {
  const globalAgentSplits = stackEntriesOf(stack, globalAgents).map(
    ([agent, agentStack]) =>
      [agent, splitAgentStack(agentStack, globalSkillIds)] as const
  )
  const nonEmptyHalves = (scope: SkillScope) =>
    globalAgentSplits
      .map(([agent, split]) => [agent, split[scope]] as const)
      .filter(([, half]) => hasCategories(half))

  return {
    global: typedFromEntries(nonEmptyHalves("global")),
    project: typedFromEntries([
      ...nonEmptyHalves("project"),
      ...stackEntriesOf(stack, projectAgents),
    ]),
  }
}

function stackEntriesOf(
  stack: NonNullable<ProjectConfig["stack"]>,
  agents: AgentScopeConfig[]
): (readonly [AgentName, StackAgentConfig])[] {
  return agents.flatMap(({ name }) => {
    const agentStack = stack[name]
    return agentStack ? [[name, agentStack] as const] : []
  })
}

function splitAgentStack(
  agentStack: StackAgentConfig,
  globalSkillIds: ReadonlySet<SkillId>
): Record<SkillScope, StackAgentConfig> {
  const isGlobalSkill = (assignment: SkillAssignment) =>
    globalSkillIds.has(assignment.id)

  return {
    global: mapCategoriesDroppingEmpty(agentStack, (assignments) =>
      assignments.filter(isGlobalSkill)
    ),
    project: mapCategoriesDroppingEmpty(agentStack, (assignments) =>
      assignments.filter((assignment) => !isGlobalSkill(assignment))
    ),
  }
}

/** What the CLI installs: a shared configuration decoded against the catalog. */
export type InstallSelection = {
  skills: SkillConfig[]
  selectedAgents: AgentName[]
  agentConfigs: AgentScopeConfig[]
  assignedStack: Partial<Record<AgentName, StackAgentConfig>>
  selectedStackId: string | null
  /** The sharer's description (`init --from`); undefined takes the applied stack's. */
  description?: string
  selectedDomains: Domain[]
  validation: SelectionValidation
}

/** A skipped skill and the sub-agents it alone brought in, installed without it. */
export type SkippedSkillAgents = { skillId: string; agentNames: AgentName[] }

export type SeedMapping = {
  result: InstallSelection
  skippedSkillIds: string[]
  skippedAgentNames: string[]
  /** Only skills naming such a sub-agent. */
  agentsOnlySkippedSkillsCarried: SkippedSkillAgents[]
}

type SeedAgentMap = {
  known: Map<AgentName, SeedAgent>
  switchedOff: Set<string>
  unknown: string[]
}

type InstallableSeedSkill = {
  id: SkillId
  category: Category
  domain: Domain
  seedSkill: SeedSkill
  catalogSkill: CatalogSkill
}

type PlacedAssignment = {
  agent: AgentName
  category: Category
  assignment: SkillAssignment
}

type UnwritableAssignment = { skillId: SkillId; agent: AgentName }

type AssignmentRow =
  | ({ kind: "placed" } & PlacedAssignment)
  | ({ kind: "unwritable" } & UnwritableAssignment)
  | { kind: "unknownAgent"; agentName: string }

/**
 * A shared configuration in the shape `init --from` installs. Unknown ids are skipped, never
 * fatal, so a rename cannot break older links; a sub-agent a skipped skill names is installed
 * without it. Assignments become `assignedStack`, which replaces the derived stack. An unwritable
 * pair is the one fatal case: nothing downstream filters `assignedStack`.
 */
export function seedToInstallSelection(
  payload: SeedPayload,
  catalog: CompileCatalog
): SeedMapping {
  const agentMap = readAgentMap(payload.agents)
  const { installable, skipped } = resolveSeedSkills(payload.skills, catalog)
  const rows = installable.flatMap((skill) => assignmentRows(skill, agentMap))
  refuseUnwritableAssignments(rows)

  const placed = rows.filter((row) => row.kind === "placed")
  const carried = new Set(agentsCarriedIn(placed, agentMap))
  const selectedAgents = withAgentsSkippedSkillsName(carried, skipped, agentMap)
  const skills = installable.map(toSeedSkillConfig)

  return {
    result: {
      skills,
      selectedAgents,
      agentConfigs: selectedAgents.map((name) =>
        agentScopeConfig(name, agentMap.known.get(name))
      ),
      assignedStack: assignedStackOf(placed),
      selectedStackId: payload.stackId,
      // Absent and empty are different files on disk.
      ...(payload.description !== undefined && {
        description: payload.description,
      }),
      selectedDomains: orderDomains([
        ...new Set(installable.map((skill) => skill.domain)),
      ]),
      // Revalidated: the payload was consistent against the authoring app's catalog, not this one.
      validation: validateSelection(
        skills.map((skill) => skill.id),
        catalog
      ),
    },
    skippedSkillIds: skipped.map(({ skillId }) => skillId),
    skippedAgentNames: skippedAgentNamesOf(agentMap, rows),
    agentsOnlySkippedSkillsCarried: skipped.flatMap((skill) =>
      agentsOnlyItCarried(skill, agentMap, carried)
    ),
  }
}

function refuseUnwritableAssignments(rows: AssignmentRow[]): void {
  const unwritable = rows.filter((row) => row.kind === "unwritable")
  if (unwritable.length > 0) {
    throw new Error(unwritableAssignmentsError(unwritable))
  }
}

/** By a skill that installs, or switched on. */
function agentsCarriedIn(
  placed: PlacedAssignment[],
  agentMap: SeedAgentMap
): AgentName[] {
  return [...placed.map((row) => row.agent), ...agentsSwitchedOn(agentMap)]
}

/** A sub-agent never depends on a skill loading. */
function withAgentsSkippedSkillsName(
  carried: ReadonlySet<AgentName>,
  skipped: SkippedSeedSkill[],
  agentMap: SeedAgentMap
): AgentName[] {
  return [
    ...new Set([
      ...carried,
      ...skipped.flatMap((skill) => agentsNamedBy(skill, agentMap)),
    ]),
  ]
}

function skippedAgentNamesOf(
  agentMap: SeedAgentMap,
  rows: AssignmentRow[]
): string[] {
  const unknownAssignees = rows
    .filter((row) => row.kind === "unknownAgent")
    .map((row) => row.agentName)

  return [...new Set([...agentMap.unknown, ...unknownAssignees])]
}

type SkippedSeedSkill = { skillId: string; seedSkill: SeedSkill }

/** Each sub-agent this catalog ships that the skill names and the configuration leaves on. */
function agentsNamedBy(
  { seedSkill }: SkippedSeedSkill,
  agentMap: SeedAgentMap
): AgentName[] {
  return Object.keys(seedSkill.assignments)
    .filter(isAgentName)
    .filter((name) => !agentMap.switchedOff.has(name))
}

function agentsOnlyItCarried(
  skill: SkippedSeedSkill,
  agentMap: SeedAgentMap,
  carried: ReadonlySet<AgentName>
): SkippedSkillAgents[] {
  const agentNames = agentsNamedBy(skill, agentMap).filter(
    (name) => !carried.has(name)
  )

  return agentNames.length === 0 ? [] : [{ skillId: skill.skillId, agentNames }]
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

function agentsSwitchedOn(agentMap: SeedAgentMap): AgentName[] {
  return [...agentMap.known]
    .filter(([, entry]) => entry.on === true)
    .map(([name]) => name)
}

function resolveSeedSkills(
  seedSkills: SeedPayload["skills"],
  catalog: CompileCatalog
): { installable: InstallableSeedSkill[]; skipped: SkippedSeedSkill[] } {
  const looked = Object.entries(seedSkills).map(([skillId, seedSkill]) => ({
    skillId,
    seedSkill,
    installable: installableSkill(skillId, seedSkill, catalog),
  }))

  return {
    installable: looked.map((entry) => entry.installable).filter(isDefined),
    skipped: looked
      .filter((entry) => entry.installable === undefined)
      .map(({ skillId, seedSkill }) => ({ skillId, seedSkill })),
  }
}

function installableSkill(
  skillId: string,
  seedSkill: SeedSkill,
  catalog: CompileCatalog
): InstallableSeedSkill | undefined {
  const catalogSkill = catalog.skills[skillId]
  if (!catalogSkill?.category) return undefined
  const domain = categoryDomain(catalog, catalogSkill.category)
  if (domain === undefined) return undefined

  // Boundary casts: these come from the catalogue's own keys, and the `local` pseudo-category
  // (no domain) has already returned.
  return {
    id: skillId as SkillId,
    category: catalogSkill.category as Category,
    domain: domain as Domain,
    seedSkill,
    catalogSkill,
  }
}

function toSeedSkillConfig({
  id,
  seedSkill,
  catalogSkill,
}: InstallableSeedSkill): SkillConfig {
  return {
    id,
    scope: seedSkill.scope,
    origin:
      seedSkill.install === "eject"
        ? EJECT_SOURCE
        : sourceForSkill(catalogSkill),
  }
}

function sourceForSkill(skill: CatalogSkill): string {
  return (
    skill.availableSources?.find((s) => s.primary)?.name ??
    DEFAULT_PUBLIC_SOURCE_NAME
  )
}

function assignmentRows(
  skill: InstallableSeedSkill,
  agentMap: SeedAgentMap
): AssignmentRow[] {
  return Object.entries(skill.seedSkill.assignments)
    .map(([agentName, load]) => assignmentRow(skill, agentName, load, agentMap))
    .filter(isDefined)
}

function assignmentRow(
  skill: InstallableSeedSkill,
  agentName: string,
  load: SeedLoadState,
  agentMap: SeedAgentMap
): AssignmentRow | undefined {
  if (agentMap.switchedOff.has(agentName)) return undefined
  if (!isAgentName(agentName)) return { kind: "unknownAgent", agentName }

  const agentScope = seedAgentScope(agentMap.known.get(agentName))
  if (!isScopePairCompatible(skill.seedSkill.scope, agentScope)) {
    return { kind: "unwritable", skillId: skill.id, agent: agentName }
  }

  return {
    kind: "placed",
    agent: agentName,
    category: skill.category,
    assignment: toSkillAssignment(skill.id, load),
  }
}

function toSkillAssignment(
  skillId: SkillId,
  load: SeedLoadState
): SkillAssignment {
  return { id: skillId, preloaded: load === "preloaded" }
}

/** `skills` is keyed by id, so a `(skill, sub-agent)` pair occurs once: nothing to de-duplicate. */
function assignedStackOf(
  placed: PlacedAssignment[]
): Partial<Record<AgentName, StackAgentConfig>> {
  return mapValues(
    groupBy(placed, (row) => row.agent),
    (agentRows) =>
      mapValues(
        groupBy(agentRows, (row) => row.category),
        (categoryRows) => categoryRows.map((row) => row.assignment)
      )
  )
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

/** The wire carries any Codex id so a retired one cannot break a link. */
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
