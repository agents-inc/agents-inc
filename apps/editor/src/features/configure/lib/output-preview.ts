import { compilesForCodex, pluginRefFor } from "@workspace/compile/agent-source"
import { installedSkillTree } from "@workspace/compile/carried-skill"
import { generateConfigSource } from "@workspace/compile/config-source"
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
  seedToWizardResult,
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

// Nothing here may reach a browser-only module: `e2e/specs/output-preview.spec.ts`
// imports this file in Node, where `@/lib/observability/report` throws. That
// rules out `./derive` and `@/stores/marketplace-store`.
import { COMPUTED_AT_INSTALL, type PreviewLang } from "./render-tokens"

/**
 * What an install would write, drawn by `@workspace/compile`, the renderers the
 * CLI writes with. What a browser cannot know is a placeholder, never a guess.
 *
 * The pipeline mirrors `init --from` from a project directory on a clean machine:
 *
 *   seedToWizardResult            the payload's own decode
 *   generateProjectConfigFromSkills + the assigned stack   (`buildInstallConfig`)
 *   splitConfigByScope            one config, two roots
 *   addSessionToGlobal            the global half, over the blank pair `ensureBlankPair` writes
 *   generateConfigSource          standalone for `~/`, inlining for `./`
 *   generateConfigTypesSource     / generateProjectConfigTypesSource
 *   renderAgentFromCorpus         the real Liquid render, off the vendored corpus
 *   installedSkillTree            a carried skill's directory, renamed and registered
 *
 * It skips the steps that read an existing disk (`mergeWithExistingConfig`,
 * the global reconcile), which the dialog's footer says.
 */

/** What a row's state label says. Root, directory and group rows carry none. */
export type PreviewMarker = "new" | "plugin" | "eject"

export type PreviewNode = {
  /** The row's identity AND what the header subtitle shows — a path, wherever a path exists. */
  id: string
  /** What the row reads in the tree: a bare filename, or a directory with its trailing slash. */
  name: string
  depth: number
  marker: PreviewMarker | null
  /** The pane's text. Empty for a row that is not a file. */
  body: string
  /** How the pane reads {@link body}. `"text"` runs no grammar at all. */
  lang: PreviewLang
}

export type PreviewRoot = {
  /** The base directory the root is written under, and the row's own name. */
  base: PreviewBase
  /** What this root's config pair is rendered from; exposed so a test can re-render it. */
  config: ProjectConfig
  nodes: PreviewNode[]
}

export type OutputPreview = {
  roots: PreviewRoot[]
  /** Files an install actually writes — see {@link countWrittenFiles}. */
  fileCount: number
  /** The release the vendored corpus was generated from, which every agent body is stamped with. */
  corpusVersion: string
  /** What a selection naming no row resolves to: the project `config.ts`, then the global one. */
  defaultSelectionId: string | null
}

/** Global first, then project — the order an install writes them in. */
const GLOBAL_BASE = "~/"
const PROJECT_BASE = "./"

type PreviewBase = typeof GLOBAL_BASE | typeof PROJECT_BASE

const SCOPE_OF: Record<PreviewBase, SkillScope> = {
  [GLOBAL_BASE]: "global",
  [PROJECT_BASE]: "project",
}

// `COMPUTED_AT_INSTALL` stands in for what only the installing machine knows:
// the global types import specifier, the project's name, and a marketplace's
// manifest name.

/** A skill installed as a plugin, so nothing is written for it under either root. */
const isPluginSkill = (skill: SkillConfig) => skill.origin !== EJECT_SOURCE

/**
 * The `(agent, skill)` pairs whose scopes newly agree: on a clean machine, every
 * compatible pair (`computeScopeEligibilityGained` with no prior config).
 */
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

/**
 * The CLI's `resolveDescription`: a loaded stack's description, else the
 * payload's. The editor's payload carries a `stackId`, so the stack arm is live.
 * An unknown stack falls back rather than throwing as the install does.
 */
const resolveDescription = (
  selectedStackId: string | null,
  shared: string | undefined
): string | undefined =>
  activeStacks().find((stack) => stack.id === selectedStackId)?.description ??
  shared

/**
 * The name `setConfigMetadata` records beside the ref. Another marketplace's
 * comes from a manifest this app never fetches, so it is the placeholder. The
 * public one's is read only when a plugin registers it, so it needs a plugin.
 */
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

/**
 * The configuration `init --from` builds from this payload, minus every disk
 * read. The payload's assigned stack replaces the ownership-derived one
 * (`resolveStackProperty`), or a bare sub-agent gets someone else's skills.
 */
function buildConfig(payload: SeedPayload): ProjectConfig {
  const { result } = seedToWizardResult(payload, activeMatrix())
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

  const stack =
    generated.stack && result.assignedStack
      ? result.assignedStack
      : generated.stack

  const description = resolveDescription(
    result.selectedStackId,
    result.description
  )

  // The payload's own, or `DEFAULT_SOURCE`, where a clean machine resolves.
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

/**
 * The skill rows one sub-agent compiles with, reproducing `buildCompileAgents`
 * and `resolveAgents`: the config's stack for that agent, minus effectively
 * excluded skills, minus — for a global agent — anything that is not itself
 * global, with each skill's `origin` threaded on so `pluginRefFor` can decide
 * per skill between `${id}:${id}` and a bare id.
 */
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

/** One `(skill, sub-agent)` row of the stack, with the usage line the skill states. */
type StackReference = { id: SkillId; usage: string; preloaded: boolean }

/**
 * When a sub-agent reaches for a skill: `statedUsageFor` in the CLI's
 * `stacks-loader.ts`, byte for byte. A blank `usageGuidance` counts as none, or
 * `agent.liquid` would draw an empty bullet.
 */
const statedUsageFor = (
  stated: string | undefined,
  category: string
): string =>
  stated !== undefined && stated.trim() !== ""
    ? stated
    : `Use when working with ${category}.`

/**
 * One sub-agent's stack, flattened into references — `resolveAgentConfigToSkills`
 * in the CLI's `stacks-loader.ts`, including the usage line it reads off the
 * catalogue.
 */
const stackReferences = (
  agentStack: StackAgentConfig,
  matrix: Matrix
): StackReference[] =>
  Object.entries(agentStack).flatMap(([category, assignments]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    (assignments ?? []).map((assignment: SkillAssignment) => ({
      id: assignment.id,
      usage: statedUsageFor(
        matrix.skills[assignment.id]?.usageGuidance,
        category
      ),
      preloaded: assignment.preloaded ?? false,
    }))
  )

/**
 * Which of a sub-agent's stack rows survive to its compiled markdown:
 * effectively excluded skills leave, and a GLOBAL sub-agent sees global skills
 * alone — the cross-scope safety net `buildCompileAgents` applies.
 */
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

/**
 * One reference as the template reads it, or nothing for an id the catalogue
 * does not carry, as `resolveSkillReferences` does.
 */
const resolveSkill = (
  reference: StackReference,
  matrix: Matrix,
  origin: string | undefined
): Skill[] => {
  const described = matrix.skills[reference.id]
  if (!described) return []

  const skill: Skill = {
    id: reference.id,
    // A disk path the template never renders.
    path: "",
    // The SKILL.md sentence, never the wizard's label (CLI-898). The vendored
    // table answers for the public catalogue; an older catalogue keeps the label.
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

/** One compiled sub-agent: its body, and the root it is written under. */
type CompiledAgent = { name: AgentName; scope: SkillScope; body: string }

/**
 * The corpus and the Liquid engine, the app's heaviest module, reached only
 * through `import()`. `CORPUS_CLI_VERSION` comes off it too, so the corpus
 * stays off the static graph.
 */
const corpusRenderer = () => import("@workspace/compile/preview")

/**
 * Every sub-agent the configuration selects for this provider, compiled from the vendored corpus:
 * each one's `AgentConfig` assembled by {@link agentConfigFor}, then rendered.
 */
async function compileAgents(
  config: ProjectConfig,
  matrix: Matrix,
  renderAgent: (name: AgentName, agent: AgentConfig) => Promise<string>,
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

/**
 * Whether this provider's install compiles the sub-agent. Dropped here, as the
 * CLI drops it at install, since the payload is provider-neutral (ruling 3).
 */
const isCompiledFor = (provider: Provider, agent: AgentScopeConfig): boolean =>
  !agent.excluded &&
  agent.name in AGENT_DEFINITIONS &&
  (provider === "claude" || compilesForCodex(agent.name))

/**
 * One selected sub-agent's `AgentConfig`, composed as the CLI's `resolveAgents` composes it: the
 * config's `model` and `effort` over the metadata's, and the metadata-only fields forwarded when
 * set. `hooks` cannot be forwarded, since `GeneratedAgentDefinition` does not carry it, and
 * `outputFormat` reaches no template field.
 */
function agentConfigFor(
  config: ProjectConfig,
  matrix: Matrix,
  agent: AgentScopeConfig
): AgentConfig {
  const definition = AGENT_DEFINITIONS[agent.name]
  // Widened to the interface: `definition` is a union of literal shapes, from which a field one
  // agent never sets is absent rather than optional. `model` keeps the narrow read, since every
  // shipped definition declares one.
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

/**
 * The `ConfigTypesExtras` a project's types half is widened by: every literal
 * its sibling `config.ts` holds, since the inlining writer puts the active
 * global rows into the project's own file verbatim. `buildProjectTypesExtras`
 * in the CLI's `config-gate/propagate.ts` is the same derivation.
 */
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

  const extraSkillIds = [...new Set(skills.map((skill) => skill.id))]
  const stackCategories = Object.values(stack).flatMap((agentStack) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.values launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    Object.keys(agentStack ?? {})
  )
  const extraCategories = [
    ...new Set([
      ...deriveCategories(extraSkillIds, catalog),
      ...stackCategories,
    ]),
  ] as Category[]

  return {
    extraSkillIds,
    extraAgentNames: [...new Set(agents.map((agent) => agent.name))],
    extraCategories,
    extraDomains: [
      ...new Set([
        ...deriveDomains(extraCategories, catalog),
        ...(projectSplit.selectedDomains ?? []),
        ...(globalConfig.selectedDomains ?? []),
      ]),
    ],
  }
}

/** The global root's pair: `writeGlobalPair`, over the CLI's whole roster. */
const globalPair = (config: ProjectConfig, catalog: CompileCatalog) => ({
  configTs: generateConfigSource(config, catalog),
  configTypesTs: generateConfigTypesSource(
    catalog,
    [...AGENT_NAMES],
    [],
    undefined,
    config
  ),
})

/**
 * The project root's pair. `config.ts` takes the inlining writer. `config-types.ts`
 * takes the import form, since `ensureBlankPair` always writes a global pair
 * first. `SelectedAgentName` is over the inlined rows, global first, as
 * `regenerateConfigTypes` reads them back; `ProjectAgentName` is project-only.
 */
const projectPair = (
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  catalog: CompileCatalog
) => {
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

/**
 * The marketplace a skill comes from: the seated one. A browser never fills
 * `origin` or `availableSources`, which would name ours to everybody. A ref is
 * not a name, and only the public catalogue's name is known here.
 */
type SeatedMarketplace =
  | { readonly kind: "public"; readonly name: string }
  | { readonly kind: "ref"; readonly ref: string }

const seatedMarketplace = (): SeatedMarketplace => {
  const seated = activeMarketplace()
  return seated === null
    ? { kind: "public", name: DEFAULT_PUBLIC_SOURCE_NAME }
    : { kind: "ref", ref: seated }
}

/** The seated marketplace as prose, shared so both notes word it alike. */
const marketplacePhrase = (seated: SeatedMarketplace): string =>
  seated.kind === "public"
    ? `the ${seated.name} marketplace`
    : `the marketplace at ${seated.ref}`

/**
 * The same fact as a path. Only the public name can be a path segment; a ref
 * is named after the path, never spliced into a coordinate that resolves to
 * nothing.
 */
const ejectedSourceLine = (skillId: string): string => {
  const seated = seatedMarketplace()
  const path = `${SKILLS_DIR_PATH}/${skillId}`

  return seated.kind === "public"
    ? `Source: ${seated.name}/${path}`
    : `Source: ${path}, in ${marketplacePhrase(seated)}`
}

const seatedMarketplacePhrase = (): string =>
  marketplacePhrase(seatedMarketplace())

/**
 * An ejected catalogue skill's directory, with no file bodies: the CLI copies
 * it verbatim and the preview fetches nothing. Its source is the seated
 * marketplace, never `origin`, which is the `eject` sentinel.
 */
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

/**
 * The pane behind an ejected directory row: empty for an external skill, whose
 * children explain it, and for an id the seated catalogue does not carry.
 */
const ejectedDirectoryBody = (
  skill: SkillConfig,
  external: SeedExternalSkill | undefined,
  catalog: Matrix
): string => {
  const inSeatedCatalogue = skill.id in catalog.skills
  if (external || !inSeatedCatalogue) return ""

  return ejectedCatalogueNote(skill)
}

/**
 * A plugin skill's reference. It has no path: the host's plugin command decides
 * where it lands. The eject destination is the layout's.
 */
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
    `skill resolves from ${seatedMarketplacePhrase()} at run time, as`,
    `${skill.id}:${skill.id}.`,
    ``,
    `Switch it to eject and the CLI writes a copy you own, at`,
    `${layout.skills.path}${skill.id}/.`,
  ].join("\n")

type NodeInput = Omit<PreviewNode, "lang"> & { lang?: PreviewLang }

const node = (input: NodeInput): PreviewNode => ({ lang: "text", ...input })

/** A root, a directory or the plugin group: a row with no bytes of its own. */
const structural = (id: string, name: string, depth: number): PreviewNode =>
  node({ id, name, depth, marker: null, body: "" })

/**
 * Where one root's rows go, per provider. Claude writes under `.claude/`. A Codex project's roles
 * go under `.codex/` but its skills are committed at `.agents/skills/`, outside it, so the skills
 * directory carries its own depth.
 */
type DirRow = {
  /** The row's own path, trailing slash and all — what every child is built from. */
  path: string
  /** What the row reads in the tree, which may carry more than one segment (D10). */
  name: string
  depth: number
}

type RootLayout = {
  source: DirRow
  /** The host's own directory: `.claude/` on Claude, `.codex/` on Codex. */
  host: DirRow
  hostName: string
  agents: DirRow
  /** What one compiled sub-agent is written as, which is not the same FILE on the two providers. */
  agentFile: (agent: AgentName) => { name: string; lang: PreviewLang }
  skills: DirRow
  /** Whether {@link skills} hangs under {@link host} — false is Codex's committed project directory. */
  skillsUnderHost: boolean
}

const CODEX_DIR = ".codex"

// The CLI's `CODEX_PROJECT_SKILLS_PATH`, held equal by `codex-provider.spec.ts`.
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
    // A role file's body is prose in one multi-line string, so no grammar runs.
    agentFile: (agent) => ({ name: `${agent}.toml`, lang: "text" }),
    skills: committed
      ? dir(`${base}${CODEX_PROJECT_SKILLS}/`, `${CODEX_PROJECT_SKILLS}/`, 1)
      : dirUnder(host, STANDARD_DIRS.SKILLS),
    skillsUnderHost: !committed,
  }
}

const layoutFor = (provider: Provider, base: PreviewBase): RootLayout =>
  provider === "claude" ? claudeLayout(base) : codexLayout(base)

/** A directory row and whatever hangs under it, or nothing at all when it holds nothing. */
const directoryNodes = (
  row: DirRow,
  children: readonly PreviewNode[]
): PreviewNode[] =>
  children.length === 0
    ? []
    : [structural(row.path, row.name, row.depth), ...children]

/** A file this install writes, one level under the directory row it is written into. */
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

/**
 * One root's rows, in emission order: the config pair in the source folder (one
 * row, D10), everything else under the host's directory, and `plugin skills` as
 * a group rather than a directory. Every path comes off {@link RootLayout}.
 */
function rootNodes(
  base: PreviewBase,
  layout: RootLayout,
  pair: { configTs: string; configTypesTs: string },
  agents: readonly CompiledAgent[],
  skills: readonly SkillConfig[],
  external: Readonly<Record<string, SeedExternalSkill>>,
  catalog: Matrix
): PreviewNode[] {
  const ejected = skills.filter((skill) => !isPluginSkill(skill))
  const plugins = skills.filter(isPluginSkill)

  const agentNodes = agents.map((agent) => {
    const file = layout.agentFile(agent.name)
    return writtenFile(layout.agents, file.name, agent.body, file.lang)
  })

  const skillNodes = ejected.flatMap((skill) =>
    ejectedSkillNodes(layout.skills, skill, external[skill.id], catalog)
  )

  const underHost = [
    ...directoryNodes(layout.agents, agentNodes),
    ...(layout.skillsUnderHost
      ? directoryNodes(layout.skills, skillNodes)
      : []),
  ]

  return [
    structural(base, base, 0),

    structural(layout.source.path, layout.source.name, layout.source.depth),
    writtenFile(
      layout.source,
      STANDARD_FILES.CONFIG_TS,
      pair.configTs,
      "typescript"
    ),
    writtenFile(
      layout.source,
      STANDARD_FILES.CONFIG_TYPES_TS,
      pair.configTypesTs,
      "typescript"
    ),

    ...directoryNodes(layout.host, underHost),

    ...(layout.skillsUnderHost
      ? []
      : directoryNodes(layout.skills, skillNodes)),

    ...pluginGroupNodes(base, layout, plugins),
  ]
}

/** The plugin group's row and one row per plugin under it, or nothing when there are none. */
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

/** A group, not a directory: plugin scope is per root, but a plugin has no path. */
const PLUGIN_GROUP = "plugin skills"

/**
 * An ejected skill's directory, with children only for an external skill,
 * whose bytes travel in the payload ({@link carriedAsInstalled}).
 */
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
    // `bytewise`, not `localeCompare`, so the order is not the machine's.
    ...Object.entries(external.files)
      .sort(([a], [b]) => bytewise(a, b))
      // Somebody else's bytes, so no grammar runs over them.
      .map(([path, text]) => writtenFile(skillDir, path, text)),
  ]
}

/**
 * The global config a project install writes on a clean machine: the session's
 * global half added to the blank pair (`addSessionToGlobal`), so a stack's
 * description stays in the project's `config.ts`.
 */
const globalConfigOnCleanMachine = (
  globalSplit: ProjectConfig,
  catalog: CompileCatalog
): ProjectConfig =>
  addSessionToGlobal(globalSplit, blankGlobalConfig(), catalog).config

/**
 * The seated catalogue with every carried skill marked `custom: true`, as the
 * CLI's `externalCatalogueEntry` seats it, which files it under `// Custom`.
 */
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

/**
 * Every carried skill's directory as `writeExternalSkills` leaves it: the
 * manifest renamed to the installed id, with a `metadata.yaml` beside it.
 */
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

/** One carried skill's directory as its install leaves it; the date is the install's. */
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

/** Files an install writes, which is exactly the rows marked `new`. */
const countWrittenFiles = (roots: readonly PreviewRoot[]): number =>
  roots.flatMap((root) => root.nodes).filter((entry) => entry.marker === "new")
    .length

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
  // Not destructured, so a Claude render never touches the Codex export and
  // survives a test double that lacks it.
  const agents = await compileAgents(
    config,
    catalog,
    provider === "claude"
      ? corpus.renderAgentFromCorpus
      : corpus.renderAgentRoleFromCorpus,
    provider
  )
  const external = payload.external ?? {}
  const carried = await carriedAsInstalled(external, catalog)
  const pairCatalog = catalogueAsInstalled(catalog, Object.keys(external))

  // Both roots, always: a project install writes both config pairs whatever
  // the configuration holds.
  const roots: PreviewRoot[] = [
    {
      base: GLOBAL_BASE,
      config: globalConfig,
      nodes: rootNodes(
        GLOBAL_BASE,
        layoutFor(provider, GLOBAL_BASE),
        globalPair(globalConfig, pairCatalog),
        agents.filter((agent) => agent.scope === "global"),
        globalConfig.skills,
        carried,
        catalog
      ),
    },
    {
      base: PROJECT_BASE,
      config: projectSplit,
      nodes: rootNodes(
        PROJECT_BASE,
        layoutFor(provider, PROJECT_BASE),
        projectPair(projectSplit, globalConfig, pairCatalog),
        agents.filter((agent) => agent.scope !== "global"),
        projectSplit.skills,
        carried,
        catalog
      ),
    },
  ]

  return {
    roots,
    fileCount: countWrittenFiles(roots),
    corpusVersion: corpus.CORPUS_CLI_VERSION,
    defaultSelectionId: defaultSelection(roots),
  }
}

/** The project root's `config.ts`, then the global root's, then nothing at all. */
const defaultSelection = (roots: readonly PreviewRoot[]): string | null => {
  const configTsOf = (base: PreviewBase) =>
    roots
      .find((root) => root.base === base)
      ?.nodes.find((node) => node.name === STANDARD_FILES.CONFIG_TS)?.id

  return configTsOf(PROJECT_BASE) ?? configTsOf(GLOBAL_BASE) ?? null
}
