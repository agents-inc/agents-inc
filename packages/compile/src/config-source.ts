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
 * This module renders `config.ts` sources; it writes nothing, and neither does
 * anything it is called from. Putting either half of a config pair on disk is
 * `config-gate/`'s exclusive privilege in the CLI, because that write owes
 * consequences no caller can be relied on to remember — a rendered half any
 * caller may then write is exactly the ungated write the gate exists to prevent.
 */

/**
 * Which of the three emissions is wanted.
 *
 * At least one of `globalConfig` and `globalImportPath` accompanies
 * `isProjectConfig: true`, and {@link generateProjectConfig} enforces it —
 * `globalConfig` wins where both are given. The invalid pairing is refused at
 * runtime rather than made unrepresentable, which is the repository's usual
 * answer and was measured before it was rejected: the discrimination has to be
 * on `isProjectConfig`'s LITERAL type, and an un-annotated `const options = cond
 * ? { isProjectConfig: true, globalConfig } : undefined` widens that property to
 * `boolean`, so the call stops compiling with a message about inference rather
 * than about the mistake. It costs a file the union's author never opened — the
 * same shape as the Storybook-args collapse in
 * `.ai-docs/agent-findings/2026-08-26-a-discriminated-union-on-component-props-collapses-storybook-args-to-never.md`.
 */
export type ConfigSourceOptions = {
  /**
   * When true, generates a project config — inlining the global config's entries
   * when `globalConfig` is given, importing and spreading them when
   * `globalImportPath` is.
   */
  isProjectConfig?: boolean

  /**
   * When provided alongside `isProjectConfig`, inlines global skills/agents directly.
   * Produces a self-contained, readable config snapshot.
   */
  globalConfig?: ProjectConfig

  /**
   * Absolute path to the global `.claude-src/`, for the spread form that imports
   * from it rather than inlining it.
   *
   * A PARAMETER rather than a read, because the value is `os.homedir()` and this
   * package runs in a browser. `getGlobalConfigImportPath()` in the CLI's
   * `config-writer.ts` is the one producer, and it has no production caller:
   * `writeProjectConfigPair` is the only site passing `isProjectConfig` and it
   * always passes `globalConfig` too, which takes the inlining branch above.
   */
  globalImportPath?: string
}

/** Fields that are extracted into typed named variables above the export default */
const EXTRACTED_FIELDS = new Set([
  "skills",
  "agents",
  "stack",
  "selectedDomains",
])

/**
 * The loader schema's own field order, which is the order a config read back off
 * disk arrives in. Emitting in it is what makes the writer a fixed point: the
 * three producers of an in-memory config — the wizard's literal, a Zod-parsed
 * load, a merge that appends at the tail — insert their keys in three different
 * orders, and without this the same values would emit as three different files.
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

/**
 * The same rule one level in, for the three record shapes a config carries
 * INSIDE an array. {@link CANONICAL_FIELD_ORDER} reaches the top-level fields
 * and {@link canonicalizeStackOrder} reaches the stack's keys; an entry's own
 * keys were left to whoever minted it, and the printer emits a record's keys in
 * the order it is handed them, so they reached disk in the producer's own.
 *
 * The loader rebuilds every entry through its schema, so a producer that
 * disagrees with the schema is not a fixed point: `toggleSkillScope` mints a
 * tombstone as `{ id, scope, excluded, origin }`, and re-emitting the same
 * config after a load moved the line. An `edit` run that changed nothing about
 * that skill still rewrote it, and a second implementation drawing these bytes
 * drew a line no install writes.
 */
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
  "effort",
  "excluded",
] as const satisfies readonly (keyof AgentScopeConfig)[]

const CANONICAL_ASSIGNMENT_ORDER = [
  "id",
  "preloaded",
  "local",
  "path",
] as const satisfies readonly (keyof SkillAssignment)[]

/**
 * A record rebuilt with the keys the schema names first and in its order. A key
 * the schema does not name is passthrough data the writer has no order of its
 * own to impose, so those keep the order they arrived in, after every named one.
 */
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

/** The cleaned config rebuilt in the loader schema's top-level field order. */
function canonicalizeFieldOrder(
  cleaned: Record<string, unknown>
): Record<string, unknown> {
  return withKeysInSchemaOrder(cleaned, CANONICAL_FIELD_ORDER)
}

/**
 * The cleaned config with the elements of `skills` and `agents` rebuilt in their
 * own schema's key order.
 *
 * An array the config does not carry stays absent: assigning would mint the key,
 * and the emission tells an absent array from an empty one.
 */
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

/**
 * Every element of one entry array rebuilt in the schema's key order. The writer
 * emits whatever it is handed, and these arrive off a `JSON.parse`, so an
 * element that is not a keyed record has no keys to order and passes through
 * whole rather than being flattened by `Object.entries`.
 */
function entriesInSchemaOrder(
  entries: unknown[],
  schemaOrder: readonly string[]
): unknown[] {
  return entries.map((entry: unknown) =>
    isKeyedRecord(entry) ? withKeysInSchemaOrder(entry, schemaOrder) : entry
  )
}

/** A record rebuilt with its keys reordered; the values themselves are untouched. */
function withKeysOrderedBy<T>(
  record: Record<string, T>,
  compareKeys: (a: string, b: string) => number
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => compareKeys(a, b))
  )
}

/**
 * Code-unit order over two names — what a bare `.sort()` gives, and so what
 * `generateProjectConfigFromSkills` already emits its sub-agent keys in.
 * `localeCompare` is deliberately not used: it orders the same two names
 * differently under different locales, which would make the emitted bytes a
 * property of the machine.
 */
function compareNamesInCodeUnitOrder(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The stack's key order, decided by the roster rather than by whoever assembled
 * the stack: sub-agents by name, and each sub-agent's categories in the
 * catalogue's declaration order — the two orders the generator already builds a
 * stack in.
 *
 * The generator is not the only producer. The seed decode assembles a stack from
 * a shared payload, in the order that payload lists its skills, so the same
 * curation reached disk as different bytes depending on which end of a share
 * round trip wrote it. That is not merely a noisy diff: a compiled sub-agent
 * lists its dynamic skills in the order its stack entry carries them, so the two
 * ends compiled different files from identical configuration.
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

/** The specifier both emitted config roots import their types from. */
const CONFIG_TYPES_SPECIFIER = "./config-types"

/** The annotation the emitted `stack` declaration carries. */
const STACK_TYPE = "Partial<Record<ProjectAgentName, StackAgentConfig>>"

/** Where a top-level `const <name>: <type> = …` declaration puts its value. */
function declarationPosition(name: string, type: string): LinePosition {
  return { indent: 0, prefix: `const ${name}: ${type} = `, suffix: "" }
}

/**
 * One `const <name>: <type> = <value>` declaration, and the blank line the
 * writer puts before it. Both together, because every declaration is separated
 * from the last and the emitted pair's readers key on that blank line.
 */
function declaration(name: string, type: string, value: unknown): string[] {
  return ["", renderValueLine(value, declarationPosition(name, type))]
}

/** The same, for an array whose entries carry comments or written-out source. */
function entryDeclaration(
  name: string,
  type: string,
  entries: readonly ArrayEntry[]
): string[] {
  return ["", renderArrayLine(entries, declarationPosition(name, type))]
}

/** Where one property of the `export default` table of contents sits. */
function exportFieldPosition(key: string): LinePosition {
  return {
    indent: INDENT_STEP,
    prefix: `${renderKey(key)}: `,
    suffix: ",",
  }
}

/** One scalar field as a line of the `export default` table of contents. */
function renderScalarField(key: string, value: unknown): string {
  return renderValueLine(value, exportFieldPosition(key))
}

type ConfigArrays = {
  skills: unknown[]
  agents: unknown[]
  stack: Record<string, unknown> | undefined
  selectedDomains: unknown[]
}

/** The four extracted array/stack fields of a cleaned config, defaulted for emission. */
function extractConfigArrays(cleaned: Record<string, unknown>): ConfigArrays {
  // Boundary cast: cleaned comes from JSON.parse(JSON.stringify(...)) so arrays are plain JSON
  // values. The `??` runs BEFORE the cast on purpose — `cleaned` is a Record of `unknown`, and
  // casting first would tell the checker the value is present when the round-trip drops any key
  // whose value was undefined.
  return {
    skills: (cleaned.skills ?? []) as unknown[],
    agents: (cleaned.agents ?? []) as unknown[],
    stack: cleaned.stack as Record<string, unknown> | undefined,
    selectedDomains: (cleaned.selectedDomains ?? []) as unknown[],
  }
}

/**
 * Shared pre-emission cleanup: JSON round-trip (drops undefined values), optional
 * `projects` removal (project configs never emit the global tracking list),
 * stack compaction (strip flag-less assignments to bare strings while preserving
 * SkillAssignment[] arrays), and canonical key ordering at all three levels the
 * emitted bytes expose — the top-level fields, the stack's own keys, and each
 * entry inside the `skills`, `agents` and stack-assignment arrays. Every level
 * is ordered here rather than by its producer, so the bytes are decided by the
 * config's values alone.
 */
function cleanForEmission(
  config: ProjectConfig,
  catalog: CompileCatalog,
  options: { dropProjects: boolean }
): Record<string, unknown> {
  // Boundary cast: `JSON.parse` is typed `any`, and round-tripping an object always
  // yields one — dropping its undefined-valued keys is exactly why this is here.
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
 * Generates a TypeScript config file source from a ProjectConfig object.
 * The typed named variables (skills, agents, stack, selectedDomains) are declared
 * first, with the export default below them acting as a table of contents that
 * refers to each by name.
 *
 * The catalogue is a parameter and never a module this file reaches: the bytes
 * depend on which categories are exclusive and on the order the catalogue
 * declares them, so a renderer reading a singleton would answer differently in
 * the CLI (which merges the machine's local skills in) and in the editor.
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
 * The project emission the options name — inlining the global config's entries,
 * or importing and spreading them.
 *
 * Those are the only two, so naming neither is refused rather than answered.
 * Falling through to the standalone writer answered a project request with a
 * GLOBAL-shaped file: `dropProjects` is false there, so the emitted config
 * carries the global `projects` tracking array, which a project root must never
 * hold. Nothing in the CLI reaches this today, but `generateConfigSource` is a
 * public export of this package and the caller that cannot be seen from here is
 * the editor's.
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

/**
 * Generates a project config source that imports from the global config and extends it.
 * Typed named variables are declared above the export default. The export default at
 * the bottom acts as a table of contents. Arrays (skills, agents, selectedDomains) are
 * spread with globalConfig first, then project items.
 */
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
    // Always present, spread from global.
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

/**
 * Generates a standalone config source with typed named variables above the export default.
 * The export default at the bottom acts as a table of contents, referencing the named variables.
 */
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

  // Extracted fields reference their named variable (or an empty literal when the
  // variable was not emitted); `stack` is omitted entirely when absent.
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

/**
 * Builds the type import list based on which extracted fields are present.
 * ProjectConfig is always included. Other types are included only when used.
 */
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
  /** Active (non-excluded) project entries. */
  projectSkills: unknown[]
  projectAgents: unknown[]
  /** Project stack filtered to project-scoped agents only. */
  filteredStack: Record<string, unknown> | undefined
  /** Merged unique global + project values. */
  selectedDomains: unknown[]
}

/**
 * Pure partition of project + global entries for the inlined snapshot.
 *
 * Excluded globals are routed to the project partition by splitConfigByScope,
 * but render under "// global" in the output for readability. When inlining,
 * active global entries are replaced by their excluded tombstones — the
 * tombstone masks the global entry for this project; the active project entry
 * (if any) appears separately in the project section. The project stack keeps
 * only project-scoped agents: global agents' stack entries live in the global
 * config only.
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
 * Every scalar the inlined snapshot emits, as ONE canonically-ordered sequence.
 * The project's value wins where it carries one, and the global supplies the
 * rest. A global block followed by a project block could not promise this: the
 * first emission writes every global scalar into the project's own file, so on
 * the next re-emit those same keys arrive from the project half instead and two
 * blocks would order them differently for values that never changed.
 */
function mergeInlinedScalarFields(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>
): [string, unknown][] {
  return Object.entries(
    canonicalizeFieldOrder({ ...cleanedGlobal, ...cleaned })
  ).filter(([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name")
}

/**
 * Generates a project config with global skills/agents inlined directly.
 * No `import globalConfig` — the output is a self-contained readable snapshot.
 * Global items appear first with a `// global` comment, followed by project items
 * with a `// project` comment (only when project items exist).
 */
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

/**
 * The two halves of an inlined array, each under the comment naming its scope.
 *
 * The comments are entries rather than lines a caller writes around the printer
 * because they are what holds the array open: a `//` line cannot be folded back
 * onto one line, so an array carrying one stays one entry per line however
 * short it is — which is the whole of what keeps these sections legible when a
 * root holds a single skill.
 */
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

/** True when the assignment asserts something a bare id could not say on its own. */
function carriesFlags(assignment: SkillAssignment): boolean {
  return Boolean(assignment.preloaded || assignment.local || assignment.path)
}

/**
 * Structural check for a SkillAssignment object (`{ id, preloaded? }`).
 * The id's SkillId-ness is structural, not union-checked: assignments flow from
 * runtime sources whose skills may not be in the generated union.
 */
function isSkillAssignment(value: unknown): value is SkillAssignment {
  if (typeof value !== "object" || value === null) return false
  // Boundary cast: probing an unknown object's field inside the guard
  return typeof (value as { id?: unknown }).id === "string"
}

/**
 * Compacts one SkillAssignment down to the smallest form that still carries its information.
 * - { id: "..." } and { id: "...", preloaded: false } → "..." (the id says everything)
 * - anything carrying a flag (preloaded, local, path) keeps the object form, flags intact
 *
 * The surviving object form is the third member of the entry-order class above:
 * `toStackPropertyAssignment` in `seed-to-config.ts` answers a flag-less
 * assignment with `{ ...assignment, preloaded: true }`, which appends the key at
 * the tail, while the loader's `skillAssignmentSchema` rebuilds it before
 * `local` and `path`.
 */
function compactAssignment(assignment: unknown): unknown {
  if (!isSkillAssignment(assignment)) return assignment
  if (!carriesFlags(assignment)) return assignment.id
  return withKeysInSchemaOrder(assignment, CANONICAL_ASSIGNMENT_ORDER)
}

/**
 * The emitted value for one category's assignments.
 *
 * An exclusive category can only ever hold one skill, so its array wrapper carries nothing the
 * reader needs and the bare value IS the assignment. Non-exclusive categories keep their array
 * even at length one — there the wrapper is load-bearing, because a second skill may join.
 *
 * Two skills in an exclusive category means the caller built something the config cannot express.
 * Dropping the extra would write a config that does not match what was selected, and nothing
 * downstream could tell, so it fails here instead.
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

/**
 * Generates a blank global config source (empty arrays, no import preamble).
 */
export function generateBlankGlobalConfigSource(): string {
  return `import type { ProjectConfig } from ${quoteText(CONFIG_TYPES_SPECIFIER)}

export default {
  name: ${quoteText(GLOBAL_CONFIG_NAME)},
  skills: [],
  agents: [],
  selectedDomains: [],
} satisfies ProjectConfig\n`
}
