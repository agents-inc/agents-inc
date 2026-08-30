import { EFFORT_NAMES, MODEL_NAMES } from "@workspace/matrix"
import { groupBy, unique } from "remeda"

import { isExclusiveCategory, type CompileCatalog } from "./catalog.js"
import {
  INDENT_STEP,
  brokenUnionLayout,
  flatUnion,
  quoteText,
  renderKey,
  renderTypeImportLine,
  renderUnionBody,
  spaces,
  unionLayout,
} from "./installed-format.js"
import { LOCAL_PSEUDO_CATEGORY } from "./paths.js"
import {
  activeAgentNames,
  activeProjectAgentNames,
} from "./scope-predicates.js"
import { bytewise } from "./string.js"
import { typedEntries, typedKeys } from "./typed-object.js"
import type {
  AgentName,
  Category,
  CategoryPath,
  ProjectConfig,
  SkillId,
} from "./types.js"

/**
 * Renders `config-types.ts`; writes nothing. The disk-probing half — deciding
 * whether a project extends a global types file, and computing the relative
 * specifier to it — stayed in the CLI's `config-types-writer.ts`, because a
 * browser has no disk to probe and `path.relative(<project>/.claude-src,
 * $HOME/.claude-src)` is a fact about one machine.
 */

/**
 * Emitted for a union with no members. `never` is the identity element for a
 * union: an empty install must accept NO member, and `never | "web-framework-react"`
 * reduces to `"web-framework-react"`, so a project types file that extends an empty
 * global union still narrows. Emitting `string` here would instead absorb every
 * literal and silently disable type checking of the generated config.ts.
 */
const EMPTY_UNION_TYPE = "never"

/**
 * Extra just-created skill IDs / agent names / domains / categories to fold into
 * a regenerated config-types.ts (entities that exist in config but not yet in the
 * loaded matrix). buildProjectTypesExtras returns Required<ConfigTypesExtras>.
 */
export type ConfigTypesExtras = {
  extraSkillIds?: string[]
  extraAgentNames?: string[]
  extraDomains?: string[]
  extraCategories?: string[]
}

/**
 * A vocabulary constant as a single-line TypeScript literal union, inside an
 * emitted property where a break would need a layout of its own.
 *
 * That it stays on one line is an assumption about the lists — both are
 * generated from the matrix and both are short — rather than something this
 * function arranges. Nothing guards it here; what does is the fixed-point
 * assertion in `contract/emission-scenarios.test.ts`, which renders both of
 * these lines in every scenario and reddens the moment either grows past the
 * print width, because prettier would then break what this does not.
 */
function formatLiteralUnion(members: readonly string[]): string {
  return flatUnion(members.map(quoteText))
}

/**
 * Types emitted before the dynamically-generated StackAgentConfig.
 * Includes InstallMode, SkillConfig, AgentScopeConfig, and the generic SkillAssignment.
 */
export const PROJECT_CONFIG_TYPES_BEFORE = `export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: ${formatLiteralUnion(MODEL_NAMES)}
  effort?: ${formatLiteralUnion(EFFORT_NAMES)}
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }
`

/**
 * The ProjectConfig interface, emitted after StackAgentConfig.
 */
export const PROJECT_CONFIG_INTERFACE_AFTER = `export interface ProjectConfig {
  /** Project/plugin name (kebab-case) */
  name: string

  /** Project description */
  description?: string

  /** Per-agent configuration with scope */
  agents: AgentScopeConfig[]

  /** Per-skill configuration with scope and provenance */
  skills: SkillConfig[]

  /** Author handle (e.g., "@vince") */
  author?: string

  /** Stack configuration: agent -> category -> skill assignment */
  stack?: Partial<Record<ProjectAgentName, StackAgentConfig>>

  /** The marketplace this install reads skills from, as a path or URL */
  marketplace?: string

  /** The name that marketplace's manifest gives it, which plugins are registered under */
  marketplaceName?: string

  /** Agents source path or URL (when agents come from a different source than skills) */
  agentsSource?: string

  /** Selected domains from the wizard */
  selectedDomains?: Domain[]

  /** Tracked project installation paths (global config only) */
  projects?: string[]
}
`

/**
 * Loose StackAgentConfig line emitted when no per-category skill constraint applies. Admits a
 * single assignment as well as an array: project configs always get this line, and they carry the
 * bare (unwrapped) form for exclusive categories.
 */
export const STACK_AGENT_CONFIG_LOOSE_LINE =
  "export type StackAgentConfig = Partial<Record<Category, SkillAssignment | SkillAssignment[]>>"

/**
 * Assembles a config-types.ts source from its per-alias union lines — the single
 * template shared by generateConfigTypesSource, generateProjectConfigTypesSource,
 * and generateBlankGlobalConfigTypesSource. Their emitted text is identical apart
 * from the alias contents, the StackAgentConfig line, and the optional
 * (project-only) import block.
 *
 * The emitted ProjectConfig interface (PROJECT_CONFIG_INTERFACE_AFTER) deliberately
 * diverges from types/config.ts: it uses the narrowed generated aliases
 * (SelectedAgentName, ProjectAgentName, per-category StackAgentConfig) so a user's
 * config.ts is type-checked against only the installed skills/agents rather than
 * the full runtime union.
 */
export function assembleConfigTypesSource(parts: {
  importBlock?: string
  skillId: AliasRhs
  agentName: AliasRhs
  selectedAgentName: AliasRhs
  projectAgentName: AliasRhs
  domain: AliasRhs
  category: AliasRhs
  stackAgentConfig: string
}): string {
  const importSection = parts.importBlock ? `${parts.importBlock}\n\n` : ""
  return `// AUTO-GENERATED by agents-inc — DO NOT EDIT

${importSection}${renderAlias("SkillId", parts.skillId)}

${renderAlias("AgentName", parts.agentName)}

${renderAlias("SelectedAgentName", parts.selectedAgentName)}

${renderAlias("ProjectAgentName", parts.projectAgentName)}

${renderAlias("Domain", parts.domain)}

${renderAlias("Category", parts.category)}

${PROJECT_CONFIG_TYPES_BEFORE}
${parts.stackAgentConfig}

${PROJECT_CONFIG_INTERFACE_AFTER}`
}

/**
 * What one emitted type alias is assigned.
 *
 * Members rather than the finished text, because whether they sit on the
 * declaration's own line, on an indented line below it, or one per line under a
 * leading `|` is decided by how wide they are once the alias NAME is in front
 * of them — which only the assembler knows.
 */
export type AliasRhs =
  | { kind: "plain"; members: readonly string[] }
  | {
      kind: "sectioned"
      custom: readonly string[]
      marketplace: readonly string[]
    }

/** A union over quoted string literals, or `never` when it has no members. */
function literalUnion(members: readonly string[]): AliasRhs {
  return members.length === 0
    ? typeReference(EMPTY_UNION_TYPE)
    : { kind: "plain", members: members.map(quoteText) }
}

/** A bare type name as an alias's whole right-hand side. */
function typeReference(name: string): AliasRhs {
  return { kind: "plain", members: [name] }
}

/** `export type <name> = <rhs>`, laid out the way prettier lays a union out. */
function renderAlias(name: string, rhs: AliasRhs): string {
  const head = `export type ${name} =`
  if (rhs.kind === "sectioned") {
    return `${head}\n${renderSectionedUnion(rhs.custom, rhs.marketplace)}`
  }

  const layout = unionLayout(rhs.members, {
    headWidth: head.length + " ".length,
    tailWidth: 0,
    bodyIndent: INDENT_STEP,
  })

  return layout === "inline"
    ? `${head} ${flatUnion(rhs.members)}`
    : `${head}\n${renderUnionBody(rhs.members, layout, INDENT_STEP)}`
}

/**
 * A union under its `// Custom` and `// Marketplace` headings.
 *
 * `custom` is non-empty by construction — {@link formatMaybeSectionedUnion} is
 * the only producer of a sectioned right-hand side and it answers with a plain
 * one when nothing is custom. Both headings present puts a comment BETWEEN two
 * members, which prettier cannot fold away, so that union stays one member per
 * line however short it is; a single heading only pushes the members off the
 * declaration's line, and they rejoin below it when they fit.
 */
function renderSectionedUnion(
  custom: readonly string[],
  marketplace: readonly string[]
): string {
  if (marketplace.length > 0) {
    return [
      sectionHeading("Custom"),
      renderUnionBody(custom, "stacked", INDENT_STEP),
      sectionHeading("Marketplace"),
      renderUnionBody(marketplace, "stacked", INDENT_STEP),
    ].join("\n")
  }

  return [
    sectionHeading("Custom"),
    renderUnionBody(
      custom,
      brokenUnionLayout(custom, INDENT_STEP),
      INDENT_STEP
    ),
  ].join("\n")
}

/** A `// Custom` or `// Marketplace` line above the members it introduces. */
function sectionHeading(text: string): string {
  return `${spaces(INDENT_STEP)}// ${text}`
}

/**
 * Generates a per-category constrained StackAgentConfig type from skill-by-category groupings.
 * Falls back to the loose line when no categories have skills.
 *
 * The union is over WHICH skill may be assigned; exclusivity is about HOW MANY, so an exclusive
 * category emits a bare `SkillAssignment<...>` (no array) however long its candidate list is. A
 * category the catalogue does not declare is not treated as exclusive, on the same reasoning
 * `isExclusiveCategory` takes: a constraint must fire on a flag the data actually carries.
 */
function generateStackAgentConfig(
  skillsByCategory: Map<Category, SkillId[]>,
  catalog: CompileCatalog
): string {
  if (skillsByCategory.size === 0) {
    return STACK_AGENT_CONFIG_LOOSE_LINE
  }

  const properties = [...skillsByCategory.entries()]
    // A project commits its config-types.ts, so the key order has to be the comparator's rather
    // than the collation of whichever machine last ran the CLI.
    .sort(([a], [b]) => bytewise(a, b))
    .map(([category, skills]) => renderStackProperty(category, skills, catalog))

  return ["export type StackAgentConfig = {", ...properties, "}"].join("\n")
}

/**
 * One category's property, with its candidate skills laid out where they sit.
 *
 * The union is inside a type ARGUMENT rather than on a declaration's own line,
 * so its indented and one-per-line forms carry the closing `>` down with them —
 * but the widths that choose between the three are the same ones everywhere
 * else, which is why the decision comes from the shared layout rather than from
 * a count of members.
 */
function renderStackProperty(
  category: Category,
  skills: SkillId[],
  catalog: CompileCatalog
): string {
  const members = [...skills].sort().map(quoteText)
  const tail = `>${isExclusiveCategory(catalog, category) ? "" : "[]"}`
  const head = `${spaces(INDENT_STEP)}${renderKey(category)}?: SkillAssignment<`
  const bodyIndent = INDENT_STEP * 2

  const layout = unionLayout(members, {
    headWidth: head.length,
    tailWidth: tail.length,
    bodyIndent,
  })
  if (layout === "inline") return `${head}${flatUnion(members)}${tail}`

  return [
    head,
    renderUnionBody(members, layout, bodyIndent),
    `${spaces(INDENT_STEP)}${tail}`,
  ].join("\n")
}

/**
 * Builds a Map of Category -> SkillId[] from the catalogue, filtered to only include
 * categories and skills that are in the provided arrays.
 */
function buildSkillsByCategory(
  skillIds: SkillId[],
  categories: Category[],
  catalog: CompileCatalog
): Map<Category, SkillId[]> {
  const categorySet = new Set(categories)
  const eligible = [...new Set(skillIds)]
    .map((id) => ({ id, category: catalog.skills[id]?.category }))
    .filter(
      (entry): entry is { id: SkillId; category: Category } =>
        entry.category !== undefined &&
        entry.category !== LOCAL_PSEUDO_CATEGORY &&
        // Boundary cast: a catalogue skill's `category` is a Category, typed `string` on the
        // narrow catalogue shape so the wire `Matrix` satisfies it too. The `has` below IS the
        // runtime check the predicate rests on, so the cast only lets the probe be written.
        categorySet.has(entry.category as Category)
    )

  return new Map(
    typedEntries(groupBy(eligible, (entry) => entry.category)).map(
      ([category, entries]) => [category, entries.map((entry) => entry.id)]
    )
  )
}

/**
 * A category no loaded catalogue declares, which is the whole of what makes one custom.
 *
 * Deliberately not "a category a custom skill is in": a custom skill is PLACED in a category that
 * already exists rather than bringing one, so the skills that REFERENCE a category say nothing
 * about who declared it — and reading them that way labelled a category the public catalogue
 * ships as the user's own. The same holds for a category arriving as an extra: an extra is every
 * literal a just-written config.ts holds, most of them the catalogue's.
 */
function isUndeclaredCategory(
  category: Category,
  catalog: CompileCatalog
): boolean {
  return catalog.categories[category] === undefined
}

/**
 * A skill the loaded catalogue does not declare, or declares as the user's own.
 *
 * The same rule the category axis takes, plus the one signal skills carry that categories do not:
 * `custom: true` is written into a skill's own metadata, so a skill the catalogue holds AND flags
 * is the user's however it got there. What is NOT read is which argument the id arrived in — an
 * extra is a literal the just-written config.ts holds, and on the project standalone path that is
 * the whole configuration, most of it the catalogue's.
 *
 * `local: true` is deliberately not a second signal: an ejected catalogue skill is copied into
 * `.claude/skills/` and rediscovered as local, so it would label the catalogue's own work custom.
 */
function isCustomSkill(skillId: SkillId, catalog: CompileCatalog): boolean {
  const declared = catalog.skills[skillId]
  return declared === undefined || declared.custom === true
}

/**
 * An agent the loaded source does not declare, or declares as the user's own.
 *
 * `agentNames` is every agent that source ships and `customAgentNames` the ones it marks custom,
 * so the pair is the agent axis's equivalent of the catalogue: anything outside the first is
 * nobody's declaration, anything inside the second is declared as the user's.
 */
function isCustomAgent(
  agentName: AgentName,
  declared: ReadonlySet<AgentName>,
  flaggedCustom: ReadonlySet<AgentName>
): boolean {
  return !declared.has(agentName) || flaggedCustom.has(agentName)
}

/**
 * A domain no category the loaded catalogue declares carries.
 */
function isCustomDomain(
  domain: string,
  declared: ReadonlySet<string>
): boolean {
  return !declared.has(domain)
}

/**
 * Generates a config-types.ts source from catalogue data.
 * The generated file provides type safety for config.ts via `import type` + `satisfies`.
 *
 * @param customAgentNames Agent names that are custom (from sources with `custom: true`)
 * @param extras Optional extra skill IDs or agent names to include (for just-created entities)
 * @param config Optional ProjectConfig to narrow unions to only installed items.
 *               When provided, SkillId/AgentName/Category/Domain are derived from
 *               the config's skills[] and agents[] rather than the full catalogue.
 */
export function generateConfigTypesSource(
  catalog: CompileCatalog,
  agentNames: AgentName[],
  customAgentNames: AgentName[] = [],
  extras?: ConfigTypesExtras,
  config?: ProjectConfig
): string {
  // Boundary cast: extra IDs from CLI args may not match strict union patterns
  const extraSkillIds = (extras?.extraSkillIds ?? []) as SkillId[]
  const extraAgentNamesArr = (extras?.extraAgentNames ?? []) as AgentName[]
  const extraDomainsArr = extras?.extraDomains ?? []
  const extraCategoriesArr = (extras?.extraCategories ?? []) as Category[]

  let skillIds: SkillId[]
  let sortedAgents: AgentName[]
  let domains: string[]
  let categories: Category[]

  if (config) {
    // Narrow to only installed/configured items
    const configSkillIds = config.skills.map((s) => s.id)
    skillIds = unique([...configSkillIds, ...extraSkillIds]).sort()

    const configAgentNames = config.agents.map((a) => a.name)
    sortedAgents = unique([...configAgentNames, ...extraAgentNamesArr]).sort()

    const configCategories = deriveCategories(configSkillIds, catalog)
    categories = unique([...configCategories, ...extraCategoriesArr]).sort()

    // Also include config.selectedDomains (user-selected) that may not have skills in this scope
    const configDomains = deriveDomains(categories, catalog)
    domains = unique([
      ...configDomains,
      ...(config.selectedDomains ?? []),
      ...extraDomainsArr,
    ]).sort()
  } else {
    // Fall back to the full catalogue (e.g., blank global config)
    skillIds = unique([
      ...typedKeys<SkillId>(catalog.skills),
      ...extraSkillIds,
    ]).sort()
    sortedAgents = unique([...agentNames, ...extraAgentNamesArr]).sort()
    domains = unique([...extractDomains(catalog), ...extraDomainsArr]).sort()
    categories = unique([
      ...typedKeys<Category>(catalog.categories),
      ...extraCategoriesArr,
    ]).sort()
  }

  const declaredAgents = new Set<AgentName>(agentNames)
  const flaggedCustomAgents = new Set<AgentName>(customAgentNames)
  const declaredDomains = new Set<string>(extractDomains(catalog))

  const skillIdLine = formatMaybeSectionedUnion(skillIds, (id) =>
    isCustomSkill(id, catalog)
  )
  const agentNameLine = formatMaybeSectionedUnion(sortedAgents, (name) =>
    isCustomAgent(name, declaredAgents, flaggedCustomAgents)
  )
  const domainLine = formatMaybeSectionedUnion(domains, (domain) =>
    isCustomDomain(domain, declaredDomains)
  )
  const categoryLine = formatMaybeSectionedUnion(categories, (category) =>
    isUndeclaredCategory(category, catalog)
  )

  const selectedAgents = config?.agents ? activeAgentNames(config.agents) : []
  const selectedAgentNameLine =
    selectedAgents.length > 0
      ? literalUnion(selectedAgents)
      : typeReference("AgentName")

  const projectScopedAgents = config?.agents
    ? activeProjectAgentNames(config.agents)
    : []
  const projectAgentNameLine =
    projectScopedAgents.length > 0
      ? literalUnion(projectScopedAgents)
      : typeReference("SelectedAgentName")

  const skillsByCategory = buildSkillsByCategory(skillIds, categories, catalog)
  const stackAgentConfigType = generateStackAgentConfig(
    skillsByCategory,
    catalog
  )

  return assembleConfigTypesSource({
    skillId: skillIdLine,
    agentName: agentNameLine,
    selectedAgentName: selectedAgentNameLine,
    projectAgentName: projectAgentNameLine,
    domain: domainLine,
    category: categoryLine,
    stackAgentConfig: stackAgentConfigType,
  })
}

// Sorted deriveDomains over every category — kept separate: this is the full-catalogue domain
// union for the standalone types file, not a per-selection derivation.
function extractDomains(catalog: CompileCatalog): string[] {
  return deriveDomains(typedKeys<Category>(catalog.categories), catalog).sort()
}

/** Category present and not the "local" pseudo-category. */
const isNonLocalCategory = (
  category: CategoryPath | undefined
): category is Category =>
  Boolean(category) && category !== LOCAL_PSEUDO_CATEGORY

/**
 * Derives the set of categories that the given skill IDs belong to,
 * by looking up each skill's category in the catalogue.
 */
export function deriveCategories(
  skillIds: SkillId[],
  catalog: CompileCatalog
): Category[] {
  return unique(
    skillIds
      // Boundary cast: CategoryPath to Category for catalogue key lookup
      .map((id) => catalog.skills[id]?.category as CategoryPath | undefined)
      .filter(isNonLocalCategory)
  )
}

/**
 * Derives the set of domains that the given categories belong to,
 * by looking up each category's domain in the catalogue.
 */
export function deriveDomains(
  categories: Category[],
  catalog: CompileCatalog
): string[] {
  return unique(
    categories
      .map((cat) => catalog.categories[cat]?.domain)
      .filter((domain): domain is string => domain !== undefined)
  )
}

/**
 * A union split into its `// Custom` and `// Marketplace` sections when it has
 * custom members, and a plain one when it has none.
 */
function formatMaybeSectionedUnion<T extends string>(
  members: T[],
  isCustom: (member: T) => boolean
): AliasRhs {
  if (members.length === 0) {
    return typeReference(EMPTY_UNION_TYPE)
  }

  const custom = members.filter(isCustom)
  const marketplace = members.filter((m) => !isCustom(m))

  // No custom members: no headings to draw, so the union is an ordinary one.
  if (custom.length === 0) {
    return literalUnion(members)
  }

  return {
    kind: "sectioned",
    custom: custom.map(quoteText),
    marketplace: marketplace.map(quoteText),
  }
}

export type ProjectConfigTypesOptions = {
  /**
   * Absolute path to the global .claude-src directory.
   * When set, generates import statements that extend global types.
   */
  globalTypesImportPath: string
  /** Project-only skill IDs (not including global) */
  projectSkillIds: string[]
  /** Project-only agent names (not including global) */
  projectAgentNames: string[]
  /** Project-only domains (not including global) */
  projectDomains: string[]
  /** Project-only categories (not including global) */
  projectCategories?: string[]
  /** Selected agent names from config (narrows SelectedAgentName) */
  selectedAgentNames?: string[]
  /** Project-scoped agent names (narrows ProjectAgentName for stack keys) */
  projectScopedAgentNames?: string[]
}

/**
 * Generates a project config-types.ts source that imports global types and extends them.
 * Each type union is `GlobalType | "project-item-1" | "project-item-2"`.
 * When projectCategories are provided, Category extends GlobalCategory instead of being `string`.
 */
export function generateProjectConfigTypesSource(
  options: ProjectConfigTypesOptions
): string {
  const importPath = `${options.globalTypesImportPath}/config-types`

  const skillIdUnion = formatExtendedUnion(
    "GlobalSkillId",
    options.projectSkillIds
  )
  const agentNameUnion = formatExtendedUnion(
    "GlobalAgentName",
    options.projectAgentNames
  )
  const domainUnion = formatExtendedUnion(
    "GlobalDomain",
    options.projectDomains
  )

  const projectCategories = options.projectCategories ?? []
  const categoryUnion = formatExtendedUnion("GlobalCategory", projectCategories)

  const selectedAgentNameUnion = options.selectedAgentNames?.length
    ? literalUnion(options.selectedAgentNames)
    : typeReference("AgentName")

  const projectAgentNameUnion = options.projectScopedAgentNames?.length
    ? literalUnion(options.projectScopedAgentNames)
    : typeReference("SelectedAgentName")

  // Category comes across as GlobalCategory whether or not this project adds
  // any of its own, because the alias is re-exported either way.
  const importBlock = renderTypeImportLine(
    [
      "SkillId as GlobalSkillId",
      "AgentName as GlobalAgentName",
      "Domain as GlobalDomain",
      "Category as GlobalCategory",
    ],
    importPath
  )

  return assembleConfigTypesSource({
    importBlock,
    skillId: skillIdUnion,
    agentName: agentNameUnion,
    selectedAgentName: selectedAgentNameUnion,
    projectAgentName: projectAgentNameUnion,
    domain: domainUnion,
    category: categoryUnion,
    stackAgentConfig: STACK_AGENT_CONFIG_LOOSE_LINE,
  })
}

/**
 * Generates blank global config-types source (all types are `never`).
 */
export function generateBlankGlobalConfigTypesSource(): string {
  return assembleConfigTypesSource({
    skillId: typeReference(EMPTY_UNION_TYPE),
    agentName: typeReference(EMPTY_UNION_TYPE),
    selectedAgentName: typeReference(EMPTY_UNION_TYPE),
    projectAgentName: typeReference("SelectedAgentName"),
    domain: typeReference(EMPTY_UNION_TYPE),
    category: typeReference(EMPTY_UNION_TYPE),
    stackAgentConfig: STACK_AGENT_CONFIG_LOOSE_LINE,
  })
}

/**
 * A union that extends a global type alias: `GlobalType` on its own when this
 * project adds nothing, and `GlobalType | "a" | "b"` when it does.
 */
function formatExtendedUnion(
  globalTypeName: string,
  projectMembers: readonly string[]
): AliasRhs {
  if (projectMembers.length === 0) {
    return typeReference(globalTypeName)
  }

  return {
    kind: "plain",
    members: [globalTypeName, ...[...projectMembers].sort().map(quoteText)],
  }
}
