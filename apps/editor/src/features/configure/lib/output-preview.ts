import { compilesForCodex, pluginRefFor } from "@workspace/compile/agent-source"
import { installedSkillTree } from "@workspace/compile/carried-skill"
import {
  canonicalizeStackOrder,
  generateConfigSource,
} from "@workspace/compile/config-source"
import {
  deriveCategories,
  deriveDomains,
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
} from "@workspace/compile/config-types-source"
import {
  addSessionToGlobal,
  blankGlobalConfig,
} from "@workspace/compile/global-config"
import {
  generateProjectConfigFromSkills,
  isScopePairCompatible,
  scopeEligibilityKey,
  seedToInstallSelection,
  splitConfigByScope,
} from "@workspace/compile/seed-to-config"
import {
  CLAUDE_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  DEFAULT_SOURCE,
  EJECT_SOURCE,
  SKILLS_DIR_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  activeProjectAgentNames,
  bytewise,
  categoryDomain,
  effectivelyExcludedSkillIds,
  isActiveAt,
  seatCatalog,
  sourceDirName,
} from "@workspace/compile"
import type { Provider } from "@workspace/compile"
import { AGENT_DEFINITIONS, AGENT_NAMES } from "@workspace/matrix"
import { ACTIVATION_DESCRIPTIONS } from "@workspace/matrix/activation-descriptions"

import {
  activeMarketplace,
  activeMatrix,
  activeStacks,
} from "@/stores/catalog-store"

import type {
  AgentConfig,
  AgentName,
  AgentScopeConfig,
  CatalogSkill,
  Category,
  CompileCatalog,
  ProjectConfig,
  Skill,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillScope,
  StackAgentConfig,
} from "@workspace/compile"
import type {
  GeneratedAgentDefinition,
  Matrix,
  SeedExternalSkill,
  SeedPayload,
} from "@workspace/matrix"

import { COMPUTED_AT_INSTALL, type PreviewLang } from "./render-tokens"

// What `init --from` would write on a clean machine, rendered with the CLI's
// own renderers; what a browser cannot know is a placeholder. Steps that read
// an existing disk are skipped.

type PreviewMarker = "new" | "plugin" | "eject"

export type PreviewNode = {
  /** Also the header subtitle: a path, where one exists. */
  id: string
  name: string
  depth: number
  marker: PreviewMarker | null
  body: string
  lang: PreviewLang
}

type PreviewRoot = {
  base: PreviewBase
  /** Exposed so a test can re-render the pair. */
  config: ProjectConfig
  nodes: PreviewNode[]
}

export type OutputPreview = {
  roots: PreviewRoot[]
  fileCount: number
  corpusVersion: string
  defaultSelectionId: string | null
}

const GLOBAL_BASE = "~/"
const PROJECT_BASE = "./"

type PreviewBase = typeof GLOBAL_BASE | typeof PROJECT_BASE

const SCOPE_OF: Record<PreviewBase, SkillScope> = {
  [GLOBAL_BASE]: "global",
  [PROJECT_BASE]: "project",
}

export async function buildOutputPreview(
  payload: SeedPayload,
  provider: Provider
): Promise<OutputPreview> {
  // Seated per build: a marketplace or an added skill can change mid-session.
  const catalog = activeMatrix()
  seatCatalog(catalog)

  const corpus = await corpusRenderer()

  const config = buildConfig(payload)
  const { global: globalSplit, project: projectSplit } =
    splitConfigByScope(config)
  const globalConfig = globalConfigOnCleanMachine(globalSplit, catalog)
  const external = payload.external ?? {}
  const [agents, carried] = await Promise.all([
    compileAgents(
      config,
      catalog,
      agentRendererFor(provider, corpus),
      provider
    ),
    carriedAsInstalled(external, catalog),
  ])
  const pairCatalog = catalogueAsInstalled(catalog, Object.keys(external))
  const context: RootContext = { provider, carried, catalog }

  // A project install writes both config pairs regardless.
  const roots = [
    previewRoot(
      GLOBAL_BASE,
      globalConfig,
      globalPair(globalConfig, pairCatalog),
      agents.filter((agent) => agent.scope === "global"),
      context
    ),
    previewRoot(
      PROJECT_BASE,
      projectSplit,
      projectPair(projectSplit, globalConfig, pairCatalog),
      agents.filter((agent) => agent.scope !== "global"),
      context
    ),
  ]

  return {
    roots,
    fileCount: countWrittenFiles(roots),
    corpusVersion: corpus.CORPUS_CLI_VERSION,
    defaultSelectionId: defaultSelection(roots),
  }
}

// The heaviest module; kept off the static graph.
const corpusRenderer = () => import("@workspace/compile/preview")

type AgentRenderer = (name: AgentName, agent: AgentConfig) => Promise<string>

const agentRendererFor = (
  provider: Provider,
  corpus: Awaited<ReturnType<typeof corpusRenderer>>
): AgentRenderer =>
  provider === "claude"
    ? corpus.renderAgentFromCorpus
    : corpus.renderAgentRoleFromCorpus

const countWrittenFiles = (roots: readonly PreviewRoot[]): number =>
  roots.flatMap((root) => root.nodes).filter((entry) => entry.marker === "new")
    .length

const defaultSelection = (roots: readonly PreviewRoot[]): string | null => {
  const configTsOf = (base: PreviewBase) =>
    roots
      .find((root) => root.base === base)
      ?.nodes.find((node) => node.name === STANDARD_FILES.CONFIG_TS)?.id

  return configTsOf(PROJECT_BASE) ?? configTsOf(GLOBAL_BASE) ?? null
}

type RootContext = {
  provider: Provider
  carried: Readonly<Record<string, SeedExternalSkill>>
  catalog: Matrix
}

const previewRoot = (
  base: PreviewBase,
  config: ProjectConfig,
  pair: ConfigPair,
  agents: readonly CompiledAgent[],
  { provider, carried, catalog }: RootContext
): PreviewRoot => ({
  base,
  config,
  nodes: rootNodes(
    base,
    layoutFor(provider, base),
    pair,
    agents,
    config.skills,
    carried,
    catalog
  ),
})

const isPluginSkill = (skill: SkillConfig) => skill.origin !== EJECT_SOURCE

// On a clean machine every compatible pair is newly eligible.
const scopeEligibilityGained = (
  skills: readonly SkillConfig[],
  agents: readonly AgentScopeConfig[]
): ReadonlySet<string> =>
  new Set(
    agents
      .filter((agent) => !agent.excluded)
      .flatMap((agent) =>
        skills
          .filter(
            (skill) =>
              !skill.excluded && isScopePairCompatible(skill.scope, agent.scope)
          )
          .map((skill) => scopeEligibilityKey(agent.name, skill.id))
      )
  )

// Unlike the CLI, an unknown stack falls back rather than throwing.
const resolveDescription = (
  selectedStackId: string | null,
  shared: string | undefined
): string | undefined =>
  shared ??
  activeStacks().find((stack) => stack.id === selectedStackId)?.description

// Another marketplace's name comes from a manifest never fetched here; the
// public one's is recorded only when a plugin registers it.
const recordedMarketplaceName = (
  marketplace: string,
  skills: readonly SkillConfig[]
): string | undefined => {
  if (marketplace !== DEFAULT_SOURCE) return COMPUTED_AT_INSTALL

  const registersAPlugin = skills.some(
    (skill) => !skill.excluded && isPluginSkill(skill)
  )
  return registersAPlugin ? DEFAULT_PUBLIC_SOURCE_NAME : undefined
}

function buildConfig(payload: SeedPayload): ProjectConfig {
  const catalog = activeMatrix()
  const { result } = seedToInstallSelection(payload, catalog)
  const skillIds = [...new Set(result.skills.map((skill) => skill.id))]

  const generated = generateProjectConfigFromSkills(
    COMPUTED_AT_INSTALL,
    skillIds,
    {
      skillConfigs: result.skills,
      agentConfigs: result.agentConfigs,
      existingStack: {},
      newlyAddedSkillIds: skillIds,
      scopeEligibilityGained: scopeEligibilityGained(
        result.skills,
        result.agentConfigs
      ),
      ...(result.selectedAgents.length > 0 && {
        selectedAgents: result.selectedAgents,
      }),
    }
  )

  // The payload's assigned stack replaces the derived one, or a bare sub-agent
  // gets someone else's skills. In the writer's order: the install compiles
  // from the config.ts it wrote, so payload order never reaches a sub-agent.
  const stack =
    generated.stack === undefined
      ? undefined
      : canonicalizeStackOrder(result.assignedStack, catalog)

  const description = resolveDescription(
    result.selectedStackId,
    result.description
  )

  const marketplace = payload.marketplace ?? DEFAULT_SOURCE
  const marketplaceName = recordedMarketplaceName(marketplace, result.skills)

  return {
    ...generated,
    ...(stack && { stack }),
    ...(description !== undefined && { description }),
    ...(result.selectedDomains.length > 0 && {
      selectedDomains: result.selectedDomains,
    }),
    marketplace,
    ...(marketplaceName !== undefined && { marketplaceName }),
  }
}

// Mirrors the CLI's `buildCompileAgents`/`resolveAgents`; `origin` lets
// `pluginRefFor` pick `${id}:${id}` or a bare id.
function agentSkills(
  config: ProjectConfig,
  matrix: Matrix,
  agent: AgentScopeConfig
): Skill[] {
  const agentStack: StackAgentConfig | undefined = config.stack?.[agent.name]
  if (!agentStack) return []

  const reachable = reachableFrom(config, agent)
  const originById = new Map(config.skills.map((s) => [s.id, s.origin]))

  return stackReferences(agentStack, matrix)
    .filter((reference) => reachable(reference.id))
    .flatMap((reference) =>
      resolveSkill(reference, matrix, originById.get(reference.id))
    )
}

type StackReference = { id: SkillId; usage: string; preloaded: boolean }

// Matches the CLI's `statedUsageFor`; blank counts as none, or the template
// draws an empty bullet.
const statedUsageFor = (
  stated: string | undefined,
  category: string
): string =>
  stated !== undefined && stated.trim() !== ""
    ? stated
    : `Use when working with ${category}.`

const stackReferences = (
  agentStack: StackAgentConfig,
  matrix: Matrix
): StackReference[] =>
  Object.entries(agentStack).flatMap(([category, assignments]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries hides a Partial's explicit undefined
    (assignments ?? []).map((assignment: SkillAssignment) => ({
      id: assignment.id,
      usage: statedUsageFor(
        matrix.skills[assignment.id]?.usageGuidance,
        category
      ),
      preloaded: assignment.preloaded ?? false,
    }))
  )

// A global sub-agent sees global skills only, as `buildCompileAgents` enforces.
const reachableFrom = (config: ProjectConfig, agent: AgentScopeConfig) => {
  const excluded = effectivelyExcludedSkillIds(config.skills)
  const globalSkillIds = new Set(
    config.skills
      .filter((skill) => isActiveAt(skill, "global"))
      .map((s) => s.id)
  )

  return (id: SkillId) =>
    !excluded.has(id) && (agent.scope !== "global" || globalSkillIds.has(id))
}

const resolveSkill = (
  reference: StackReference,
  matrix: Matrix,
  origin: string | undefined
): Skill[] => {
  const described = matrix.skills[reference.id]
  if (!described) return []

  const skill: Skill = {
    id: reference.id,
    path: "",
    // The SKILL.md sentence; the short label only as a last resort.
    description:
      described.activationDescription ??
      ACTIVATION_DESCRIPTIONS[reference.id] ??
      described.description,
    usage: reference.usage,
    preloaded: reference.preloaded,
    ...(origin !== undefined && { source: origin }),
  }

  return [{ ...skill, ...pluginRefFor(skill) }]
}

type CompiledAgent = { name: AgentName; scope: SkillScope; body: string }

async function compileAgents(
  config: ProjectConfig,
  matrix: Matrix,
  renderAgent: AgentRenderer,
  provider: Provider
): Promise<CompiledAgent[]> {
  const selected = config.agents.filter((agent) =>
    isCompiledFor(provider, agent)
  )

  return Promise.all(
    selected.map(async (agent) => ({
      name: agent.name,
      scope: agent.scope,
      body: await renderAgent(
        agent.name,
        agentConfigFor(config, matrix, agent)
      ),
    }))
  )
}

// The payload is provider-neutral, so the provider filter happens here.
const isCompiledFor = (provider: Provider, agent: AgentScopeConfig): boolean =>
  !agent.excluded &&
  agent.name in AGENT_DEFINITIONS &&
  (provider === "claude" || compilesForCodex(agent.name))

// As the CLI's `resolveAgents`; `hooks` is absent from the generated definition.
function agentConfigFor(
  config: ProjectConfig,
  matrix: Matrix,
  agent: AgentScopeConfig
): AgentConfig {
  const definition = AGENT_DEFINITIONS[agent.name]
  // Widened: in the literal union, a field one agent never sets is absent.
  const definitionFields: GeneratedAgentDefinition = definition
  const effort = agent.effort ?? definitionFields.effort

  return {
    name: agent.name,
    title: definition.title,
    description: definition.description,
    model: agent.model ?? definition.model,
    ...(agent.codexModel !== undefined && { codexModel: agent.codexModel }),
    ...(effort !== undefined && { effort }),
    tools: [...definition.tools],
    ...(definitionFields.disallowedTools !== undefined && {
      disallowedTools: definitionFields.disallowedTools,
    }),
    ...(definitionFields.permissionMode !== undefined && {
      permissionMode: definitionFields.permissionMode,
    }),
    ...(definitionFields.isolation !== undefined && {
      isolation: definitionFields.isolation,
    }),
    ...(definitionFields.experimental !== undefined && {
      experimental: definitionFields.experimental,
    }),
    skills: agentSkills(config, matrix, agent),
    path: definition.path,
  }
}

type ConfigPair = { configTs: string; configTypesTs: string }

// Every literal the project `config.ts` holds, inlined global rows included;
// same derivation as the CLI's `buildProjectTypesExtras`.
function projectTypesExtras(
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  catalog: CompileCatalog
) {
  const skills = [...globalConfig.skills, ...projectSplit.skills].filter(
    (skill) => !skill.excluded
  )
  const agents = [...globalConfig.agents, ...projectSplit.agents].filter(
    (agent) => !agent.excluded
  )
  const stack = { ...globalConfig.stack, ...projectSplit.stack }
  const selectedDomains = [
    ...(projectSplit.selectedDomains ?? []),
    ...(globalConfig.selectedDomains ?? []),
  ]

  const extraSkillIds = [...new Set(skills.map((skill) => skill.id))]
  const extraCategories = [
    ...new Set([
      ...deriveCategories(extraSkillIds, catalog),
      ...stackCategories(stack),
    ]),
  ]

  return {
    extraSkillIds,
    extraAgentNames: [...new Set(agents.map((agent) => agent.name))],
    extraCategories,
    extraDomains: [
      ...new Set([
        ...deriveDomains(extraCategories, catalog),
        ...selectedDomains,
      ]),
    ],
  }
}

// Object.keys widens the stack's category keys to string.
const stackCategories = (
  stack: NonNullable<ProjectConfig["stack"]>
): Category[] =>
  Object.values(stack).flatMap((agentStack) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.values hides a Partial's explicit undefined
    Object.keys(agentStack ?? {})
  ) as Category[]

const globalPair = (
  config: ProjectConfig,
  catalog: CompileCatalog
): ConfigPair => ({
  configTs: generateConfigSource(config, catalog),
  configTypesTs: generateConfigTypesSource(
    catalog,
    [...AGENT_NAMES],
    [],
    undefined,
    config
  ),
})

// Types take the import form: a global pair always exists first.
const projectPair = (
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  catalog: CompileCatalog
): ConfigPair => {
  const extras = projectTypesExtras(projectSplit, globalConfig, catalog)
  const projectScopedAgentNames = activeProjectAgentNames(projectSplit.agents)

  return {
    configTs: generateConfigSource(projectSplit, catalog, {
      isProjectConfig: true,
      globalConfig,
    }),
    configTypesTs: generateProjectConfigTypesSource({
      globalTypesImportPath: COMPUTED_AT_INSTALL,
      projectSkillIds: extras.extraSkillIds,
      projectAgentNames: extras.extraAgentNames,
      projectDomains: extras.extraDomains,
      projectCategories: extras.extraCategories,
      ...(extras.extraAgentNames.length > 0 && {
        selectedAgentNames: extras.extraAgentNames,
      }),
      ...(projectScopedAgentNames.length > 0 && {
        projectScopedAgentNames,
      }),
    }),
  }
}

// A ref is not a name; only the public catalogue's name is known here.
type SeatedMarketplace =
  | { readonly kind: "public"; readonly name: string }
  | { readonly kind: "ref"; readonly ref: string }

const seatedMarketplace = (): SeatedMarketplace => {
  const seated = activeMarketplace()
  return seated === null
    ? { kind: "public", name: DEFAULT_PUBLIC_SOURCE_NAME }
    : { kind: "ref", ref: seated }
}

const marketplacePhrase = (seated: SeatedMarketplace): string =>
  seated.kind === "public"
    ? `the ${seated.name} marketplace`
    : `the marketplace at ${seated.ref}`

// Only the public name can be a path segment.
const ejectedSourceLine = (skillId: string): string => {
  const seated = seatedMarketplace()
  const path = `${SKILLS_DIR_PATH}/${skillId}`

  return seated.kind === "public"
    ? `Source: ${seated.name}/${path}`
    : `Source: ${path}, in ${marketplacePhrase(seated)}`
}

// `origin` is the `eject` sentinel here, so the source is the seated marketplace.
const ejectedCatalogueNote = (skill: SkillConfig) =>
  [
    `${skill.id}/`,
    ``,
    `Ejected: the CLI copies this directory out of the marketplace at install`,
    `time, verbatim. Nothing in it is generated, so nothing in it is drawn.`,
    ``,
    ejectedSourceLine(skill.id),
    ``,
    `The preview makes no network call, so it cannot list what is inside.`,
  ].join("\n")

const ejectedDirectoryBody = (
  skill: SkillConfig,
  external: SeedExternalSkill | undefined,
  catalog: Matrix
): string => {
  const inSeatedCatalogue = skill.id in catalog.skills
  if (external || !inSeatedCatalogue) return ""

  return ejectedCatalogueNote(skill)
}

const pluginReferenceNote = (
  skill: SkillConfig,
  base: PreviewBase,
  layout: RootLayout
) =>
  [
    skill.id,
    ``,
    `Installed as a plugin, at ${SCOPE_OF[base]} scope. No files are written`,
    `under ${base} for it — ${layout.hostName} owns where a plugin lands, and the`,
    `skill resolves from ${marketplacePhrase(seatedMarketplace())} at run time, as`,
    `${skill.id}:${skill.id}.`,
    ``,
    `Switch it to eject and the CLI writes a copy you own, at`,
    `${layout.skills.path}${skill.id}/.`,
  ].join("\n")

type NodeInput = Omit<PreviewNode, "lang"> & { lang?: PreviewLang }

const node = (input: NodeInput): PreviewNode => ({ lang: "text", ...input })

const structural = (id: string, name: string, depth: number): PreviewNode =>
  node({ id, name, depth, marker: null, body: "" })

type DirRow = {
  path: string
  /** May carry more than one segment. */
  name: string
  depth: number
}

type RootLayout = {
  source: DirRow
  host: DirRow
  hostName: string
  agents: DirRow
  agentFile: (agent: AgentName) => { name: string; lang: PreviewLang }
  skills: DirRow
  skillsUnderHost: boolean
}

const CODEX_DIR = ".codex"

// The CLI's `CODEX_PROJECT_SKILLS_PATH`: a Codex project's skills sit outside
// `.codex/`.
const CODEX_PROJECT_SKILLS = ".agents/skills"

const dir = (path: string, name: string, depth: number): DirRow => ({
  path,
  name,
  depth,
})

const dirUnder = (parent: DirRow, name: string): DirRow =>
  dir(`${parent.path}${name}/`, `${name}/`, parent.depth + 1)

const sourceRow = (provider: Provider, base: PreviewBase): DirRow =>
  dir(`${base}${sourceDirName(provider)}/`, `${sourceDirName(provider)}/`, 1)

const claudeLayout = (base: PreviewBase): RootLayout => {
  const host = dir(`${base}${CLAUDE_DIR}/`, `${CLAUDE_DIR}/`, 1)

  return {
    source: sourceRow("claude", base),
    host,
    hostName: "Claude Code",
    agents: dirUnder(host, STANDARD_DIRS.AGENTS),
    agentFile: (agent) => ({ name: `${agent}.md`, lang: "markdown" }),
    skills: dirUnder(host, STANDARD_DIRS.SKILLS),
    skillsUnderHost: true,
  }
}

const codexLayout = (base: PreviewBase): RootLayout => {
  const host = dir(`${base}${CODEX_DIR}/`, `${CODEX_DIR}/`, 1)
  const committed = base === PROJECT_BASE

  return {
    source: sourceRow("codex", base),
    host,
    hostName: "Codex",
    agents: dirUnder(host, STANDARD_DIRS.AGENTS),
    agentFile: (agent) => ({ name: `${agent}.toml`, lang: "text" }),
    skills: committed
      ? dir(`${base}${CODEX_PROJECT_SKILLS}/`, `${CODEX_PROJECT_SKILLS}/`, 1)
      : dirUnder(host, STANDARD_DIRS.SKILLS),
    skillsUnderHost: !committed,
  }
}

const layoutFor = (provider: Provider, base: PreviewBase): RootLayout =>
  provider === "claude" ? claudeLayout(base) : codexLayout(base)

const directoryNodes = (
  row: DirRow,
  children: readonly PreviewNode[]
): PreviewNode[] =>
  children.length === 0
    ? []
    : [structural(row.path, row.name, row.depth), ...children]

const writtenFile = (
  directory: DirRow,
  name: string,
  body: string,
  lang: PreviewLang = "text"
): PreviewNode =>
  node({
    id: `${directory.path}${name}`,
    name,
    depth: directory.depth + 1,
    marker: "new",
    body,
    lang,
  })

function rootNodes(
  base: PreviewBase,
  layout: RootLayout,
  pair: ConfigPair,
  agents: readonly CompiledAgent[],
  skills: readonly SkillConfig[],
  external: Readonly<Record<string, SeedExternalSkill>>,
  catalog: Matrix
): PreviewNode[] {
  const ejected = skills.filter((skill) => !isPluginSkill(skill))
  const plugins = skills.filter(isPluginSkill)

  const agentsDirectory = directoryNodes(
    layout.agents,
    agents.map((agent) => agentFileNode(layout, agent))
  )
  const skillsDirectory = directoryNodes(
    layout.skills,
    ejected.flatMap((skill) =>
      ejectedSkillNodes(layout.skills, skill, external[skill.id], catalog)
    )
  )

  return [
    structural(base, base, 0),
    ...configPairNodes(layout.source, pair),
    ...directoryNodes(layout.host, [
      ...agentsDirectory,
      ...(layout.skillsUnderHost ? skillsDirectory : []),
    ]),
    ...(layout.skillsUnderHost ? [] : skillsDirectory),
    ...pluginGroupNodes(base, layout, plugins),
  ]
}

const configPairNodes = (source: DirRow, pair: ConfigPair): PreviewNode[] => [
  structural(source.path, source.name, source.depth),
  writtenFile(source, STANDARD_FILES.CONFIG_TS, pair.configTs, "typescript"),
  writtenFile(
    source,
    STANDARD_FILES.CONFIG_TYPES_TS,
    pair.configTypesTs,
    "typescript"
  ),
]

const agentFileNode = (
  layout: RootLayout,
  agent: CompiledAgent
): PreviewNode => {
  const file = layout.agentFile(agent.name)
  return writtenFile(layout.agents, file.name, agent.body, file.lang)
}

const pluginGroupNodes = (
  base: PreviewBase,
  layout: RootLayout,
  plugins: readonly SkillConfig[]
): PreviewNode[] => {
  if (plugins.length === 0) return []

  return [
    structural(`${base}${PLUGIN_GROUP}`, PLUGIN_GROUP, 1),
    ...plugins.map((skill) =>
      node({
        id: skill.id,
        name: skill.id,
        depth: 2,
        marker: "plugin",
        body: pluginReferenceNote(skill, base, layout),
      })
    ),
  ]
}

// A group, not a directory: a plugin has no path.
const PLUGIN_GROUP = "plugin skills"

// Only an external skill's bytes travel, so only it has children.
function ejectedSkillNodes(
  skillsDir: DirRow,
  skill: SkillConfig,
  external: SeedExternalSkill | undefined,
  catalog: Matrix
): PreviewNode[] {
  const skillDir = dirUnder(skillsDir, skill.id)

  const directoryRow = node({
    id: skillDir.path,
    name: skillDir.name,
    depth: skillDir.depth,
    marker: "eject",
    body: ejectedDirectoryBody(skill, external, catalog),
  })

  if (!external) return [directoryRow]

  return [
    directoryRow,
    ...Object.entries(external.files)
      .sort(([a], [b]) => bytewise(a, b))
      .map(([path, text]) => writtenFile(skillDir, path, text)),
  ]
}

const globalConfigOnCleanMachine = (
  globalSplit: ProjectConfig,
  catalog: CompileCatalog
): ProjectConfig =>
  addSessionToGlobal(globalSplit, blankGlobalConfig(), catalog).config

// Carried skills are `custom: true`, as the CLI seats them.
const catalogueAsInstalled = (
  catalog: Matrix,
  carriedIds: readonly string[]
): CompileCatalog => ({
  categories: catalog.categories,
  skills: {
    ...catalog.skills,
    ...Object.fromEntries(
      carriedIds.flatMap((id) => seatedAsCustom(catalog, id))
    ),
  },
})

const seatedAsCustom = (
  catalog: Matrix,
  id: string
): [string, CatalogSkill][] => {
  const seated = catalog.skills[id]
  return seated === undefined ? [] : [[id, { ...seated, custom: true }]]
}

async function carriedAsInstalled(
  external: Readonly<Record<string, SeedExternalSkill>>,
  catalog: Matrix
): Promise<Record<string, SeedExternalSkill>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(external).map(([id, skill]) =>
        carriedSkillAsInstalled(id, skill, catalog)
      )
    )
  )
}

async function carriedSkillAsInstalled(
  id: string,
  skill: SeedExternalSkill,
  catalog: Matrix
): Promise<[string, SeedExternalSkill]> {
  const domain = categoryDomain(catalog, skill.categoryId)

  // Known gap: the install skips a skill whose category has no domain, and the
  // preview still draws it as the payload holds it.
  if (domain === undefined) return [id, skill]

  const files = await installedSkillTree({
    id,
    skill,
    domain,
    usageGuidance: statedUsageFor(undefined, skill.categoryId),
    date: COMPUTED_AT_INSTALL,
  })
  return [id, { ...skill, files }]
}
