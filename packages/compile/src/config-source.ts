import { omit } from "remeda"

import {
  byCategoryDeclarationOrder,
  isExclusiveCategory,
  type CompileCatalog,
} from "./catalog.js"
import {
  INDENT_STEP,
  commentEntry,
  isKeyedRecord,
  propertyPosition,
  quoteText,
  renderArrayLine,
  renderTypeImportLine,
  renderValueLine,
  sourceEntry,
  valueEntries,
  type ArrayEntry,
  type LinePosition,
} from "./installed-format.js"
import { DEFAULT_PLUGIN_NAME, GLOBAL_CONFIG_NAME } from "./paths.js"
import { bytewise } from "./string.js"
import type {
  AgentScopeConfig,
  ProjectConfig,
  SkillAssignment,
  SkillConfig,
  SkillScope,
} from "./types.js"

// Renders `config.ts` sources and writes nothing; writing is `config-gate/`'s alone.

/**
 * `isProjectConfig: true` needs `globalConfig` or `globalImportPath` (`globalConfig` wins).
 * {@link generateProjectConfig} enforces it at runtime: a discriminated union on the literal widens
 * to `boolean` at un-annotated call sites.
 */
export type ConfigSourceOptions = {
  isProjectConfig?: boolean

  /** Inlines global skills/agents for a self-contained snapshot. */
  globalConfig?: ProjectConfig

  /** For the spread form. A parameter because this package runs in a browser. */
  globalImportPath?: string
}

/**
 * Fields an author writes by hand and no install produces. Each stays in the file that declares
 * it: a project's name in the global config would rename every installation without one.
 */
export const HAND_WRITTEN_FIELDS = [
  "branding",
  "skillsDir",
  "stacksFile",
  "categoriesFile",
  "rulesFile",
] as const satisfies readonly (keyof ProjectConfig)[]

/** Emitted as typed named variables above the export default. */
const EXTRACTED_FIELDS = new Set([
  "skills",
  "agents",
  "stack",
  "selectedDomains",
])

/**
 * The loader schema's field order, so the writer is a fixed point: a Zod load and a merge insert
 * keys in different orders.
 */
const CANONICAL_FIELD_ORDER = [
  "name",
  "description",
  "agents",
  "skills",
  "author",
  "selectedDomains",
  "stack",
  "marketplace",
  "marketplaceName",
  "projects",
] as const satisfies readonly (keyof ProjectConfig)[]

const CANONICAL_SKILL_ENTRY_ORDER = [
  "id",
  "scope",
  "origin",
  "excluded",
] as const satisfies readonly (keyof SkillConfig)[]

const CANONICAL_AGENT_ENTRY_ORDER = [
  "name",
  "scope",
  "model",
  "codexModel",
  "effort",
  "excluded",
] as const satisfies readonly (keyof AgentScopeConfig)[]

const CANONICAL_ASSIGNMENT_ORDER = [
  "id",
  "preloaded",
  "local",
  "path",
] as const satisfies readonly (keyof SkillAssignment)[]

/** Unnamed (passthrough) keys keep their arrival order, after every named one. */
function withKeysInSchemaOrder(
  record: Record<string, unknown>,
  schemaOrder: readonly string[]
): Record<string, unknown> {
  const named = new Set<string>(schemaOrder)
  const inSchemaOrder = schemaOrder
    .filter((key) => key in record)
    .map((key): [string, unknown] => [key, record[key]])
  const passthrough = Object.entries(record).filter(([key]) => !named.has(key))

  return Object.fromEntries([...inSchemaOrder, ...passthrough])
}

function canonicalizeFieldOrder(
  cleaned: Record<string, unknown>
): Record<string, unknown> {
  return withKeysInSchemaOrder(cleaned, CANONICAL_FIELD_ORDER)
}

/** An absent array stays absent: the emission tells it from an empty one. */
function withEntriesInSchemaOrder(
  cleaned: Record<string, unknown>
): Record<string, unknown> {
  const reordered = { ...cleaned }
  if (Array.isArray(reordered.skills)) {
    reordered.skills = entriesInSchemaOrder(
      reordered.skills,
      CANONICAL_SKILL_ENTRY_ORDER
    )
  }
  if (Array.isArray(reordered.agents)) {
    reordered.agents = entriesInSchemaOrder(
      reordered.agents,
      CANONICAL_AGENT_ENTRY_ORDER
    )
  }
  return reordered
}

function entriesInSchemaOrder(
  entries: unknown[],
  schemaOrder: readonly string[]
): unknown[] {
  return entries.map((entry: unknown) =>
    isKeyedRecord(entry) ? withKeysInSchemaOrder(entry, schemaOrder) : entry
  )
}

function withKeysOrderedBy<T>(
  record: Record<string, T>,
  compareKeys: (a: string, b: string) => number
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => compareKeys(a, b))
  )
}

/**
 * Sub-agents by name and categories in catalogue declaration order, whoever assembled the stack: a
 * compiled sub-agent lists its skills in stack order, so producer order would change its file.
 */
export function canonicalizeStackOrder<Assignments>(
  stack: Record<string, Record<string, Assignments>>,
  catalog: CompileCatalog
): Record<string, Record<string, Assignments>> {
  const byDeclaration = byCategoryDeclarationOrder(catalog)
  const withCategoriesInOrder = Object.entries(stack).map(
    ([agent, categories]) =>
      [agent, withKeysOrderedBy(categories, byDeclaration)] as const
  )

  return withKeysOrderedBy(Object.fromEntries(withCategoriesInOrder), bytewise)
}

const CONFIG_TYPES_SPECIFIER = "./config-types"

const STACK_TYPE = "Partial<Record<ProjectAgentName, StackAgentConfig>>"

function declarationPosition(name: string, type: string): LinePosition {
  return { indent: 0, prefix: `const ${name}: ${type} = `, suffix: "" }
}

/** Every declaration is preceded by a blank line, which the emitted pair's readers key on. */
function declaration(name: string, type: string, value: unknown): string[] {
  return ["", renderValueLine(value, declarationPosition(name, type))]
}

function entryDeclaration(
  name: string,
  type: string,
  entries: readonly ArrayEntry[]
): string[] {
  return ["", renderArrayLine(entries, declarationPosition(name, type))]
}

function renderScalarField(key: string, value: unknown): string {
  return renderValueLine(value, propertyPosition(key, INDENT_STEP))
}

type ConfigArrays = {
  skills: SkillConfig[]
  agents: AgentScopeConfig[]
  stack: Record<string, unknown> | undefined
  selectedDomains: unknown[]
}

function extractConfigArrays(cleaned: Record<string, unknown>): ConfigArrays {
  // Boundary cast: the JSON round trip of a `ProjectConfig`. `??` runs first because the round
  // trip drops undefined-valued keys.
  return {
    skills: (cleaned.skills ?? []) as SkillConfig[],
    agents: (cleaned.agents ?? []) as AgentScopeConfig[],
    stack: cleaned.stack as Record<string, unknown> | undefined,
    selectedDomains: (cleaned.selectedDomains ?? []) as unknown[],
  }
}

/**
 * JSON round trip (drops undefined), `projects` removed for project configs, stack compaction, and
 * canonical key order at every level the bytes expose, so the bytes depend on values alone.
 */
function cleanForEmission(
  config: ProjectConfig,
  catalog: CompileCatalog,
  options: { dropProjects: boolean }
): Record<string, unknown> {
  // Boundary cast: `JSON.parse` is typed `any`.
  const cleaned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>
  if (options.dropProjects) {
    delete cleaned.projects
  }
  if (cleaned.stack) {
    // Boundary cast: a JSON round trip, so agent -> category -> assignment arrays.
    const compacted = compactStackAssignments(
      cleaned.stack as Record<string, Record<string, unknown[]>>,
      catalog
    )
    cleaned.stack = canonicalizeStackOrder(compacted, catalog)
  }
  return canonicalizeFieldOrder(withEntriesInSchemaOrder(cleaned))
}

/**
 * Typed named declarations first, then an `export default` referring to each. The catalogue is a
 * parameter: exclusivity and declaration order differ between the CLI's catalogue and the editor's.
 */
export function generateConfigSource(
  config: ProjectConfig,
  catalog: CompileCatalog,
  options?: ConfigSourceOptions
): string {
  if (options?.isProjectConfig) {
    return generateProjectConfig(config, catalog, options)
  }

  return generateStandaloneConfig(
    cleanForEmission(config, catalog, { dropProjects: false })
  )
}

/**
 * Refuses options naming neither emission: the standalone writer would answer a project request
 * with a global-shaped file carrying `projects`.
 */
function generateProjectConfig(
  config: ProjectConfig,
  catalog: CompileCatalog,
  options: ConfigSourceOptions
): string {
  const cleaned = cleanForEmission(config, catalog, { dropProjects: true })

  if (options.globalConfig) {
    return generateProjectConfigWithInlinedGlobal(
      cleaned,
      cleanForEmission(options.globalConfig, catalog, { dropProjects: true })
    )
  }
  if (options.globalImportPath !== undefined) {
    return generateProjectConfigWithGlobalImport(
      cleaned,
      options.globalImportPath
    )
  }

  throw new Error(
    "A project config needs the global config it extends: pass `globalConfig` to inline its " +
      "entries, or `globalImportPath` to import and spread them. Neither was given."
  )
}

function generateProjectConfigWithGlobalImport(
  cleaned: Record<string, unknown>,
  globalImportPath: string
): string {
  const { skills, agents, stack, selectedDomains } =
    extractConfigArrays(cleaned)
  const emitted: EmittedSections = {
    hasSkills: true,
    hasAgents: true,
    hasStack: hasStackEntries(stack),
    hasSelectedDomains: selectedDomains.length > 0,
  }
  const scalarFields = Object.entries(cleaned)
    .filter(([key]) => isCopiedScalarField(key))
    .map(([key, value]) => renderScalarField(key, value))

  return assembleConfigSource({
    imports: [
      `import globalConfig from ${quoteText(`${globalImportPath}/config`)}`,
      renderTypeImportLine(buildTypeImports(emitted), CONFIG_TYPES_SPECIFIER),
    ],
    declarations: [
      ...entryDeclaration("skills", "SkillConfig[]", [
        sourceEntry("...globalConfig.skills"),
        ...valueEntries(skills),
      ]),
      ...entryDeclaration("agents", "AgentScopeConfig[]", [
        sourceEntry("...globalConfig.agents"),
        ...valueEntries(agents),
      ]),
      ...(emitted.hasStack ? declaration("stack", STACK_TYPE, stack) : []),
      ...(emitted.hasSelectedDomains
        ? entryDeclaration("selectedDomains", "Domain[]", [
            sourceEntry("...(globalConfig.selectedDomains ?? [])"),
            ...valueEntries(selectedDomains),
          ])
        : []),
    ],
    exportFields: [
      `  ...globalConfig,`,
      renderScalarField("name", resolveProjectName(cleaned)),
      `  skills,`,
      `  agents,`,
      ...(emitted.hasStack ? [`  stack,`] : []),
      ...(emitted.hasSelectedDomains ? [`  selectedDomains,`] : []),
      ...scalarFields,
    ],
  })
}

function generateStandaloneConfig(cleaned: Record<string, unknown>): string {
  const { skills, agents, stack, selectedDomains } =
    extractConfigArrays(cleaned)
  const emitted: EmittedSections = {
    hasSkills: skills.length > 0,
    hasAgents: agents.length > 0,
    hasStack: hasStackEntries(stack),
    hasSelectedDomains: selectedDomains.length > 0,
  }

  return assembleConfigSource({
    imports: [
      renderTypeImportLine(buildTypeImports(emitted), CONFIG_TYPES_SPECIFIER),
    ],
    declarations: [
      ...(emitted.hasSkills
        ? declaration("skills", "SkillConfig[]", skills)
        : []),
      ...(emitted.hasAgents
        ? declaration("agents", "AgentScopeConfig[]", agents)
        : []),
      ...(emitted.hasStack ? declaration("stack", STACK_TYPE, stack) : []),
      ...(emitted.hasSelectedDomains
        ? declaration("selectedDomains", "Domain[]", selectedDomains)
        : []),
    ],
    exportFields: Object.entries(cleaned).flatMap(([key, value]) =>
      standaloneExportField(key, value, emitted)
    ),
  })
}

/** Extracted fields reference their variable, or an empty literal when none was emitted. */
function standaloneExportField(
  key: string,
  value: unknown,
  emitted: EmittedSections
): string[] {
  if (!EXTRACTED_FIELDS.has(key)) return [renderScalarField(key, value)]
  if (key === "skills") return [`  skills${emitted.hasSkills ? "" : ": []"},`]
  if (key === "agents") return [`  agents${emitted.hasAgents ? "" : ": []"},`]
  if (key === "stack") return emitted.hasStack ? [`  stack,`] : []
  return [`  selectedDomains${emitted.hasSelectedDomains ? "" : ": []"},`]
}

type ConfigSourceParts = {
  imports: string[]
  /** Each already led by its blank line. */
  declarations: string[]
  exportFields: string[]
}

function assembleConfigSource({
  imports,
  declarations,
  exportFields,
}: ConfigSourceParts): string {
  return [
    ...imports,
    ...declarations,
    "",
    "export default {",
    ...exportFields,
    "} satisfies ProjectConfig",
    "",
  ].join("\n")
}

type EmittedSections = {
  hasSkills: boolean
  hasAgents: boolean
  hasStack: boolean
  hasSelectedDomains: boolean
}

function hasStackEntries(stack: Record<string, unknown> | undefined): boolean {
  return stack != null && Object.keys(stack).length > 0
}

function buildTypeImports(flags: EmittedSections): string[] {
  return [
    flags.hasSelectedDomains && "Domain",
    "ProjectConfig",
    flags.hasStack && "ProjectAgentName",
    flags.hasAgents && "AgentScopeConfig",
    flags.hasSkills && "SkillConfig",
    flags.hasStack && "StackAgentConfig",
  ].filter((t): t is string => Boolean(t))
}

/** A project copies these as they stand; its `name` is {@link resolveProjectName}'s. */
function isCopiedScalarField(key: string): boolean {
  return !EXTRACTED_FIELDS.has(key) && key !== "name"
}

/** Project configs never inherit "global" as their name from the globalConfig spread. */
function resolveProjectName(cleaned: Record<string, unknown>): unknown {
  return cleaned.name && cleaned.name !== GLOBAL_CONFIG_NAME
    ? cleaned.name
    : DEFAULT_PLUGIN_NAME
}

type InlinedGlobalPartition = {
  /** Global entries with active entries replaced by their project tombstones. */
  globalSkills: SkillConfig[]
  globalAgents: AgentScopeConfig[]
  projectSkills: SkillConfig[]
  projectAgents: AgentScopeConfig[]
  filteredStack: Record<string, unknown> | undefined
  selectedDomains: unknown[]
}

/**
 * Excluded globals render under `// global`; an active global entry is replaced by its tombstone,
 * which masks it for this project. Global agents' stacks stay in the global config.
 */
function partitionInlinedConfigEntries(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>
): InlinedGlobalPartition {
  const project = extractConfigArrays(cleaned)
  const global = extractConfigArrays(cleanedGlobal)

  const excludedGlobalSkills = project.skills.filter(isExcluded)
  const excludedGlobalAgents = project.agents.filter(isExcluded)
  const projectAgents = project.agents.filter((a) => !isExcluded(a))

  return {
    globalSkills: maskedByTombstones(global.skills, excludedGlobalSkills, idOf),
    globalAgents: maskedByTombstones(
      global.agents,
      excludedGlobalAgents,
      nameOf
    ),
    projectSkills: project.skills.filter((s) => !isExcluded(s)),
    projectAgents,
    filteredStack: stackOfAgents(project.stack, projectAgents),
    selectedDomains: [
      ...new Set([...global.selectedDomains, ...project.selectedDomains]),
    ],
  }
}

const isExcluded = (entry: SkillConfig | AgentScopeConfig): boolean =>
  entry.excluded === true
const idOf = (skill: SkillConfig): string => skill.id
const nameOf = (agent: AgentScopeConfig): string => agent.name

function maskedByTombstones<Entry>(
  globalEntries: Entry[],
  tombstones: Entry[],
  keyOf: (entry: Entry) => string
): Entry[] {
  const masked = new Set(tombstones.map(keyOf))
  return [
    ...globalEntries.filter((entry) => !masked.has(keyOf(entry))),
    ...tombstones,
  ]
}

function stackOfAgents(
  stack: Record<string, unknown> | undefined,
  agents: AgentScopeConfig[]
): Record<string, unknown> | undefined {
  if (!stack) return undefined

  const names = new Set(agents.map(nameOf))
  return Object.fromEntries(
    Object.entries(stack).filter(([agent]) => names.has(agent))
  )
}

/**
 * One canonically ordered sequence, project values winning, so a re-emit moves no line. The
 * global's {@link HAND_WRITTEN_FIELDS} stay in the global's file.
 */
function mergeInlinedScalarFields(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>
): [string, unknown][] {
  return Object.entries(
    canonicalizeFieldOrder({
      ...omit(cleanedGlobal, HAND_WRITTEN_FIELDS),
      ...cleaned,
    })
  ).filter(([key]) => isCopiedScalarField(key))
}

/** Self-contained: global items under `// global`, then project items under `// project`. */
function generateProjectConfigWithInlinedGlobal(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>
): string {
  const partition = partitionInlinedConfigEntries(cleaned, cleanedGlobal)
  const emitted: EmittedSections = {
    hasSkills:
      partition.globalSkills.length > 0 || partition.projectSkills.length > 0,
    hasAgents:
      partition.globalAgents.length > 0 || partition.projectAgents.length > 0,
    hasStack: hasStackEntries(partition.filteredStack),
    hasSelectedDomains: partition.selectedDomains.length > 0,
  }
  const scalarFields = mergeInlinedScalarFields(cleaned, cleanedGlobal)

  return assembleConfigSource({
    imports: [
      renderTypeImportLine(buildTypeImports(emitted), CONFIG_TYPES_SPECIFIER),
    ],
    declarations: [
      ...(emitted.hasSkills
        ? entryDeclaration(
            "skills",
            "SkillConfig[]",
            scopeSectionEntries(partition.globalSkills, partition.projectSkills)
          )
        : []),
      ...(emitted.hasAgents
        ? entryDeclaration(
            "agents",
            "AgentScopeConfig[]",
            scopeSectionEntries(partition.globalAgents, partition.projectAgents)
          )
        : []),
      ...(emitted.hasStack
        ? declaration("stack", STACK_TYPE, partition.filteredStack)
        : []),
      ...(emitted.hasSelectedDomains
        ? declaration("selectedDomains", "Domain[]", partition.selectedDomains)
        : []),
    ],
    exportFields: [
      renderScalarField("name", resolveProjectName(cleaned)),
      ...scalarFields.map(([key, value]) => renderScalarField(key, value)),
      emitted.hasSkills ? `  skills,` : `  skills: [],`,
      emitted.hasAgents ? `  agents,` : `  agents: [],`,
      ...(emitted.hasStack ? [`  stack,`] : []),
      ...(emitted.hasSelectedDomains ? [`  selectedDomains,`] : []),
    ],
  })
}

/** The scope comments are entries: a `//` line keeps the array one entry per line. */
function scopeSectionEntries(
  global: unknown[],
  project: unknown[]
): ArrayEntry[] {
  return [
    ...scopeSection("global", global),
    ...scopeSection("project", project),
  ]
}

function scopeSection(scope: SkillScope, entries: unknown[]): ArrayEntry[] {
  return entries.length > 0
    ? [commentEntry(scope), ...valueEntries(entries)]
    : []
}

function carriesFlags(assignment: SkillAssignment): boolean {
  return Boolean(assignment.preloaded || assignment.local || assignment.path)
}

/** Structural only: assignments may name skills outside the generated union. */
function isSkillAssignment(value: unknown): value is SkillAssignment {
  if (typeof value !== "object" || value === null) return false
  // Boundary cast: probing an unknown object's field inside the guard
  return typeof (value as { id?: unknown }).id === "string"
}

/**
 * A flag-less (or `preloaded: false`) assignment collapses to its bare id; one carrying a flag
 * keeps the object form.
 */
function compactAssignment(assignment: unknown): unknown {
  if (!isSkillAssignment(assignment)) return assignment
  if (!carriesFlags(assignment)) return assignment.id
  return withKeysInSchemaOrder(assignment, CANONICAL_ASSIGNMENT_ORDER)
}

/**
 * An exclusive category emits its one assignment bare; a non-exclusive one keeps its array. Two
 * skills in an exclusive category cannot be expressed, so it throws rather than drop one.
 */
function compactCategoryAssignments(
  category: string,
  assignments: unknown[],
  catalog: CompileCatalog
): unknown {
  const compacted = assignments.map(compactAssignment)
  if (!isExclusiveCategory(catalog, category)) return compacted

  if (compacted.length > 1) {
    throw new Error(
      `Category '${category}' is exclusive but holds ${compacted.length} skills: ${JSON.stringify(compacted)}`
    )
  }
  return compacted[0]
}

/** For `edit --from`, which removes skills before writing: refuses before the first removal. */
export function refuseUnwritableStack(
  stack: ProjectConfig["stack"],
  catalog: CompileCatalog
): void {
  for (const agentStack of Object.values(stack ?? {})) {
    compactCategories(agentStack, catalog)
  }
}

function compactCategories(
  categories: Record<string, unknown[]>,
  catalog: CompileCatalog
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(categories)
      .filter(
        ([, assignments]) =>
          Array.isArray(assignments) && assignments.length > 0
      )
      .map(([category, assignments]) => [
        category,
        compactCategoryAssignments(category, assignments, catalog),
      ])
  )
}

function compactStackAssignments(
  stack: Record<string, Record<string, unknown[]>>,
  catalog: CompileCatalog
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(stack)
      .map(
        ([agent, categories]) =>
          [agent, compactCategories(categories, catalog)] as const
      )
      .filter(([, categories]) => Object.keys(categories).length > 0)
  )
}

export function generateBlankGlobalConfigSource(): string {
  return `import type { ProjectConfig } from ${quoteText(CONFIG_TYPES_SPECIFIER)}

export default {
  name: ${quoteText(GLOBAL_CONFIG_NAME)},
  skills: [],
  agents: [],
  selectedDomains: [],
} satisfies ProjectConfig\n`
}
