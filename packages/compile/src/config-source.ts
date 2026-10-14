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
  quoteText,
  renderArrayLine,
  renderKey,
  renderTypeImportLine,
  renderValueLine,
  sourceEntry,
  valueEntries,
  type ArrayEntry,
  type LinePosition,
} from "./installed-format.js"
import { DEFAULT_PLUGIN_NAME, GLOBAL_CONFIG_NAME } from "./paths.js"
import type {
  AgentScopeConfig,
  ProjectConfig,
  SkillAssignment,
  SkillConfig,
} from "./types.js"

/**
 * Renders `config.ts` sources and writes nothing: writing a config half is `config-gate/`'s alone.
 */

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
  "agentsDir",
  "stacksFile",
  "categoriesFile",
  "rulesFile",
] as const satisfies readonly (keyof ProjectConfig)[]

/** Fields that are extracted into typed named variables above the export default */
const EXTRACTED_FIELDS = new Set([
  "skills",
  "agents",
  "stack",
  "selectedDomains",
])

/**
 * The loader schema's field order, so the writer is a fixed point: the wizard, a Zod load and a
 * merge insert keys in different orders.
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
  "agentsSource",
  "projects",
] as const satisfies readonly (keyof ProjectConfig)[]

/** The same rule for the entries inside `skills` and `agents`. */
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

/** Elements that are not keyed records (off `JSON.parse`) pass through whole. */
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

/** Code units, as a bare `.sort()`; `localeCompare` would make the bytes depend on the machine. */
function compareNamesInCodeUnitOrder(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Sub-agents by name and categories in catalogue declaration order, whoever assembled the stack: a
 * compiled sub-agent lists its skills in stack order, so producer order would change its file.
 */
function canonicalizeStackOrder(
  stack: Record<string, Record<string, unknown>>,
  catalog: CompileCatalog
): Record<string, Record<string, unknown>> {
  const byDeclaration = byCategoryDeclarationOrder(catalog)
  const withCategoriesInOrder = Object.entries(stack).map(
    ([agent, categories]) =>
      [agent, withKeysOrderedBy(categories, byDeclaration)] as const
  )

  return withKeysOrderedBy(
    Object.fromEntries(withCategoriesInOrder),
    compareNamesInCodeUnitOrder
  )
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

function exportFieldPosition(key: string): LinePosition {
  return {
    indent: INDENT_STEP,
    prefix: `${renderKey(key)}: `,
    suffix: ",",
  }
}

function renderScalarField(key: string, value: unknown): string {
  return renderValueLine(value, exportFieldPosition(key))
}

type ConfigArrays = {
  skills: unknown[]
  agents: unknown[]
  stack: Record<string, unknown> | undefined
  selectedDomains: unknown[]
}

function extractConfigArrays(cleaned: Record<string, unknown>): ConfigArrays {
  // Boundary cast: plain JSON values. `??` runs first because the round trip drops
  // undefined-valued keys.
  return {
    skills: (cleaned.skills ?? []) as unknown[],
    agents: (cleaned.agents ?? []) as unknown[],
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
    // Boundary cast: cleaned comes from JSON.parse(JSON.stringify(...)), so the stack
    // is a plain JSON record of agent -> category -> assignment arrays
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
      "entries, or `globalImportPath` to import and spread them. Neither was given, and the " +
      "standalone writer this used to fall through to emits a global-shaped config carrying " +
      "the `projects` tracking array a project root must never hold."
  )
}

/** Spreads the global config's arrays first, then the project's. */
function generateProjectConfigWithGlobalImport(
  cleaned: Record<string, unknown>,
  globalImportPath: string
): string {
  const importPath = `${globalImportPath}/config`

  const { skills, agents, stack, selectedDomains } =
    extractConfigArrays(cleaned)

  const hasProjectDomains = selectedDomains.length > 0
  const hasStack = stack != null && Object.keys(stack).length > 0

  const typeImports = buildTypeImports({
    hasSkills: true,
    hasAgents: true,
    hasStack,
    hasSelectedDomains: hasProjectDomains,
  })

  const lines: string[] = [
    `import globalConfig from ${quoteText(importPath)}`,
    renderTypeImportLine(typeImports, CONFIG_TYPES_SPECIFIER),
  ]

  lines.push(
    ...entryDeclaration("skills", "SkillConfig[]", [
      sourceEntry("...globalConfig.skills"),
      ...valueEntries(skills),
    ])
  )
  lines.push(
    ...entryDeclaration("agents", "AgentScopeConfig[]", [
      sourceEntry("...globalConfig.agents"),
      ...valueEntries(agents),
    ])
  )

  if (hasStack) {
    lines.push(...declaration("stack", STACK_TYPE, stack))
  }

  if (hasProjectDomains) {
    lines.push(
      ...entryDeclaration("selectedDomains", "Domain[]", [
        sourceEntry("...(globalConfig.selectedDomains ?? [])"),
        ...valueEntries(selectedDomains),
      ])
    )
  }

  const scalarFields = Object.entries(cleaned)
    .filter(([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name")
    .map(([key, value]) => renderScalarField(key, value))

  const exportFields: string[] = [
    `  ...globalConfig,`,
    renderScalarField("name", resolveProjectName(cleaned)),
    `  skills,`,
    `  agents,`,
    ...(hasStack ? [`  stack,`] : []),
    ...(hasProjectDomains ? [`  selectedDomains,`] : []),
    ...scalarFields,
  ]

  lines.push(``)
  lines.push(`export default {`)
  lines.push(...exportFields)
  lines.push(`} satisfies ProjectConfig`)

  lines.push(``)
  return lines.join("\n")
}

function generateStandaloneConfig(cleaned: Record<string, unknown>): string {
  const { skills, agents, stack, selectedDomains } =
    extractConfigArrays(cleaned)

  const hasSkills = skills.length > 0
  const hasAgents = agents.length > 0
  const hasStack = stack != null && Object.keys(stack).length > 0
  const hasSelectedDomains = selectedDomains.length > 0

  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasSelectedDomains,
  })

  const lines: string[] = [
    renderTypeImportLine(typeImports, CONFIG_TYPES_SPECIFIER),
  ]

  if (hasSkills) {
    lines.push(...declaration("skills", "SkillConfig[]", skills))
  }

  if (hasAgents) {
    lines.push(...declaration("agents", "AgentScopeConfig[]", agents))
  }

  if (hasStack) {
    lines.push(...declaration("stack", STACK_TYPE, stack))
  }

  if (hasSelectedDomains) {
    lines.push(...declaration("selectedDomains", "Domain[]", selectedDomains))
  }

  // Extracted fields reference their variable, or an empty literal when none was emitted.
  const renderExportField = (key: string, value: unknown): string[] => {
    if (!EXTRACTED_FIELDS.has(key)) return [renderScalarField(key, value)]
    if (key === "skills") return [`  skills${hasSkills ? "" : ": []"},`]
    if (key === "agents") return [`  agents${hasAgents ? "" : ": []"},`]
    if (key === "stack") return hasStack ? [`  stack,`] : []
    return [`  selectedDomains${hasSelectedDomains ? "" : ": []"},`]
  }
  const exportFields = Object.entries(cleaned).flatMap(([key, value]) =>
    renderExportField(key, value)
  )

  lines.push(``)
  lines.push(`export default {`)
  lines.push(...exportFields)
  lines.push(`} satisfies ProjectConfig`)

  lines.push(``)
  return lines.join("\n")
}

function buildTypeImports(flags: {
  hasSkills: boolean
  hasAgents: boolean
  hasStack: boolean
  hasSelectedDomains: boolean
}): string[] {
  return [
    flags.hasSelectedDomains && "Domain",
    "ProjectConfig",
    flags.hasStack && "ProjectAgentName",
    flags.hasAgents && "AgentScopeConfig",
    flags.hasSkills && "SkillConfig",
    flags.hasStack && "StackAgentConfig",
  ].filter((t): t is string => Boolean(t))
}

/** Project configs never inherit "global" as their name from the globalConfig spread. */
function resolveProjectName(cleaned: Record<string, unknown>): unknown {
  return cleaned.name && cleaned.name !== GLOBAL_CONFIG_NAME
    ? cleaned.name
    : DEFAULT_PLUGIN_NAME
}

type InlinedGlobalPartition = {
  /** Global entries with active entries replaced by their project tombstones. */
  globalSkills: unknown[]
  globalAgents: unknown[]
  projectSkills: unknown[]
  projectAgents: unknown[]
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

  const isExcluded = (entry: unknown): boolean =>
    (entry as { excluded?: boolean }).excluded === true
  const idOf = (entry: unknown): string => (entry as { id: string }).id
  const nameOf = (entry: unknown): string => (entry as { name: string }).name

  const excludedGlobalSkills = project.skills.filter(isExcluded)
  const excludedGlobalAgents = project.agents.filter(isExcluded)
  const projectSkills = project.skills.filter((s) => !isExcluded(s))
  const projectAgents = project.agents.filter((a) => !isExcluded(a))

  const excludedSkillIds = new Set(excludedGlobalSkills.map(idOf))
  const excludedAgentNames = new Set(excludedGlobalAgents.map(nameOf))
  const globalSkills = [
    ...global.skills.filter((s) => !excludedSkillIds.has(idOf(s))),
    ...excludedGlobalSkills,
  ]
  const globalAgents = [
    ...global.agents.filter((a) => !excludedAgentNames.has(nameOf(a))),
    ...excludedGlobalAgents,
  ]

  const projectAgentNames = new Set(projectAgents.map(nameOf))
  const filteredStack: Record<string, unknown> | undefined = project.stack
    ? Object.fromEntries(
        Object.entries(project.stack).filter(([agent]) =>
          projectAgentNames.has(agent)
        )
      )
    : undefined

  return {
    globalSkills,
    globalAgents,
    projectSkills,
    projectAgents,
    filteredStack,
    selectedDomains: [
      ...new Set([...global.selectedDomains, ...project.selectedDomains]),
    ],
  }
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
  ).filter(([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name")
}

/** Self-contained: global items under `// global`, then project items under `// project`. */
function generateProjectConfigWithInlinedGlobal(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>
): string {
  const partition = partitionInlinedConfigEntries(cleaned, cleanedGlobal)
  const {
    globalSkills,
    globalAgents,
    projectSkills,
    projectAgents,
    filteredStack,
  } = partition

  const hasGlobalSkills = globalSkills.length > 0
  const hasProjectSkills = projectSkills.length > 0
  const hasSkills = hasGlobalSkills || hasProjectSkills

  const hasGlobalAgents = globalAgents.length > 0
  const hasProjectAgents = projectAgents.length > 0
  const hasAgents = hasGlobalAgents || hasProjectAgents

  const hasStack =
    filteredStack != null && Object.keys(filteredStack).length > 0
  const hasSelectedDomains = partition.selectedDomains.length > 0

  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasSelectedDomains,
  })

  const lines: string[] = [
    renderTypeImportLine(typeImports, CONFIG_TYPES_SPECIFIER),
  ]

  if (hasSkills) {
    lines.push(
      ...entryDeclaration(
        "skills",
        "SkillConfig[]",
        scopeSectionEntries(globalSkills, projectSkills)
      )
    )
  }

  if (hasAgents) {
    lines.push(
      ...entryDeclaration(
        "agents",
        "AgentScopeConfig[]",
        scopeSectionEntries(globalAgents, projectAgents)
      )
    )
  }

  if (hasStack) {
    lines.push(...declaration("stack", STACK_TYPE, filteredStack))
  }

  if (hasSelectedDomains) {
    lines.push(
      ...declaration("selectedDomains", "Domain[]", partition.selectedDomains)
    )
  }

  const scalarFields = mergeInlinedScalarFields(cleaned, cleanedGlobal)

  const exportFields: string[] = [
    renderScalarField("name", resolveProjectName(cleaned)),
    ...scalarFields.map(([key, value]) => renderScalarField(key, value)),
    hasSkills ? `  skills,` : `  skills: [],`,
    hasAgents ? `  agents,` : `  agents: [],`,
    ...(hasStack ? [`  stack,`] : []),
    ...(hasSelectedDomains ? [`  selectedDomains,`] : []),
  ]

  lines.push(``)
  lines.push(`export default {`)
  lines.push(...exportFields)
  lines.push(`} satisfies ProjectConfig`)

  lines.push(``)
  return lines.join("\n")
}

/** The scope comments are entries: a `//` line keeps the array one entry per line. */
function scopeSectionEntries(
  global: unknown[],
  project: unknown[]
): ArrayEntry[] {
  return [
    ...(global.length > 0
      ? [commentEntry("global"), ...valueEntries(global)]
      : []),
    ...(project.length > 0
      ? [commentEntry("project"), ...valueEntries(project)]
      : []),
  ]
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
