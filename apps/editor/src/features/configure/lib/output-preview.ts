import { pluginRefFor } from "@workspace/compile/agent-source"
import { generateConfigSource } from "@workspace/compile/config-source"
import {
  deriveCategories,
  deriveDomains,
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
} from "@workspace/compile/config-types-source"
import {
  generateProjectConfigFromSkills,
  isScopePairCompatible,
  scopeEligibilityKey,
  seedToWizardResult,
  splitConfigByScope,
} from "@workspace/compile/seed-to-config"
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  SKILLS_DIR_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  activeProjectAgentNames,
  bytewise,
  effectivelyExcludedSkillIds,
  isActiveAt,
  seatCatalog,
} from "@workspace/compile"
import { AGENT_DEFINITIONS, AGENT_NAMES } from "@workspace/matrix"

import {
  activeMarketplace,
  activeMatrix,
  activeStacks,
} from "@/stores/catalog-store"

import type {
  AgentConfig,
  AgentName,
  AgentScopeConfig,
  Category,
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

/**
 * NOTHING HERE MAY REACH A BROWSER-ONLY MODULE. `e2e/specs/output-preview.spec.ts`
 * imports this file directly, in Node, to hold the rendered pane against the
 * model that produced it — and `@/lib/observability/report.ts` reads
 * `import.meta.env` at module scope, which is a TypeError outside Vite. That
 * rules out `./derive`, whose `parseMarketplaceRef` import reaches it, and it
 * rules out `@/stores/marketplace-store`, which imports `reportIssue` directly
 * — so the seated marketplace is read through `catalog-store`'s
 * `activeMarketplace()`, which reaches neither. `catalog-store` is imported
 * above already and is the seat every other derivation here reads from.
 */
import { COMPUTED_AT_INSTALL, type PreviewLang } from "./render-tokens"

/**
 * WHAT AN INSTALL WOULD WRITE, DRAWN BY THE CODE THAT WRITES IT.
 *
 * Every byte in the tree below comes out of `@workspace/compile` — the same
 * renderers the CLI's write path calls — because a preview is worth building
 * only if it can be diffed against reality and survive it. Nothing here
 * transcribes a template, and the two values a browser genuinely cannot know
 * are named as placeholders rather than guessed at.
 *
 * The pipeline mirrors `init --from` on a machine with nothing installed:
 *
 *   seedToWizardResult            the payload's own decode
 *   generateProjectConfigFromSkills + the assigned stack   (`buildInstallConfig`)
 *   splitConfigByScope            one config, two roots
 *   generateConfigSource          standalone for `~/`, inlining for `./`
 *   generateConfigTypesSource     / generateProjectConfigTypesSource
 *   renderAgentFromCorpus         the real Liquid render, off the vendored corpus
 *
 * The steps it deliberately does NOT mirror are the ones that read a disk:
 * `mergeWithExistingConfig`, `resolveEffectiveGlobalConfig` and the reconcile
 * against a global config already installed. That is what makes this a preview
 * of a CLEAN machine, and the dialog's footer says so rather than hiding it.
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
  /**
   * The configuration this root's config pair is rendered from.
   *
   * Carried rather than kept private so a test can re-render it through
   * `@workspace/compile` directly: the claim worth checking is that the pane
   * shows the renderer's answer for the configuration the preview says it is
   * drawing, and rebuilding the configuration to check that would test two
   * translations against each other instead.
   */
  config: ProjectConfig
  nodes: PreviewNode[]
}

export type OutputPreview = {
  roots: PreviewRoot[]
  /** Files an install actually writes — see {@link countWrittenFiles}. */
  fileCount: number
  /** The release the vendored corpus was generated from, which every agent body is stamped with. */
  corpusVersion: string
  /**
   * What a selection that no longer names a row resolves to: the project root's
   * `config.ts`, then the global root's.
   *
   * Answered here rather than in the dialog because it is a fact about where
   * the files went — the dialog holds a path string and would have to
   * reconstruct `.claude-src/config.ts` to find one, which is the second
   * implementation of a path this module already owns.
   */
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

// `COMPUTED_AT_INSTALL` stands in for the two values the machine the install
// runs on decides, and which the preview therefore refuses to invent: the
// import specifier `path.relative(<project>/.claude-src, $HOME/.claude-src)`
// and the project's name `path.basename(<project>)`. A browser has no disk to
// probe for either, and `../../../.claude-src` is exactly the plausible-looking
// lie the whole phase exists to remove.
//
// It is declared in `./render-tokens` rather than here, because a placeholder
// the ink ramp paints like every other chosen value is only half-refused — that
// module's own note carries the reason the pane has to know the string.

/** A skill installed as a plugin, so nothing is written for it under either root. */
const isPluginSkill = (skill: SkillConfig) => skill.origin !== EJECT_SOURCE

// ── The configuration ────────────────────────────────────────────────────

/**
 * The `(agent, skill)` pairs whose scopes newly agree.
 *
 * On a clean machine there is no prior config, so every compatible pair is one
 * — `computeScopeEligibilityGained` in the CLI's `local-installer.ts` collapses
 * to exactly this when `priorSkills` and `priorAgents` are absent.
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
 * The sentence the written config records about itself — `resolveDescription`
 * in the CLI's `local-installer.ts`, whose rule is that a stack the install
 * LOADED is the authority on its own description and the payload's own sentence
 * is what is left when it loaded none.
 *
 * The stack arm is the live one here and that is why the line was missing
 * altogether: `resolveDescription`'s docblock says the two cases never overlap
 * because `configToSeedPayload` writes `stackId: null` "on purpose", which is
 * true of the CLI's share payload and is exactly what the editor's is not —
 * `toSeedPayload` writes `stackId: config.stackId`. So a preview reading the
 * payload's own `description` alone drew no description line for a
 * configuration whose install writes one.
 *
 * A stack id the seated catalogue does not offer degrades to the payload's
 * sentence rather than throwing as the install does: the CLI is about to write
 * a file and must refuse, where a preview that refused to draw would be a worse
 * answer than one drawn without a sentence.
 */
const resolveDescription = (
  selectedStackId: string | null,
  shared: string | undefined
): string | undefined =>
  activeStacks().find((stack) => stack.id === selectedStackId)?.description ??
  shared

/**
 * The configuration `init --from` would build from this payload, minus every
 * step that reads a disk.
 *
 * `resolveStackProperty`'s rule is the one thing here that is not a straight
 * call: a payload knows what each sub-agent holds and what preloads, so its
 * assigned stack REPLACES the ownership-derived one rather than merging with
 * it — otherwise the ownership rules hand a bare sub-agent someone else's
 * skills, which is the curation a shared configuration exists to carry.
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

  return {
    ...generated,
    ...(stack && { stack }),
    ...(description !== undefined && { description }),
    ...(result.selectedDomains.length > 0 && {
      selectedDomains: result.selectedDomains,
    }),
    // KNOWN GAP, named rather than left as an absence: `setConfigMetadata` also
    // writes `marketplace` and `marketplaceName`. The first is reproducible only
    // when the payload carries one — `init --from` passes `payload.marketplace`
    // straight through as its source flag — and otherwise resolves against the
    // machine's own `CC_MARKETPLACE`, its saved config, or the CLI's default.
    // The second is read out of the fetched marketplace manifest. Neither is
    // guessed here; a fabricated marketplace ref is the same defect as a
    // fabricated import path.
    ...(payload.marketplace !== undefined && {
      marketplace: payload.marketplace,
    }),
  }
}

// ── The compiled sub-agents ──────────────────────────────────────────────

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
 * The one sentence in a compiled sub-agent telling it when to reach for a
 * dynamic skill — `statedUsageFor` in the CLI's `stacks-loader.ts`, sentence
 * for sentence, which is a contract rather than a resemblance: the two draw
 * the same bullet for the same skill or the preview is wrong about a line a
 * reader can diff.
 *
 * The skill's own `usageGuidance` wherever it states one, and the category key
 * where it does not. A BLANK sentence counts as none, and `??` alone does not
 * say that: `usageGuidance` is `z.string().exactOptional()` on
 * `matrix-schema.ts`, so a catalogue stating an empty string is valid, and
 * `agent.liquid` renders whatever this answers as a bullet of its own — an
 * empty one is a row of the activation protocol saying nothing, which is
 * strictly worse than the category sentence it displaced.
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
 * One reference as the template reads it, or nothing when the catalogue does
 * not carry the id — which is what `resolveSkillReferences` does with it too.
 *
 * The description is the one field the skill-activation table needs that
 * `CompileCatalog` does not name, so the lookup goes through the wire catalogue
 * rather than the emission's narrower view of it.
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
    // `SkillDefinition.path` is where the CLI found the skill on disk. The
    // template renders it nowhere, and a browser has no disk — so it is empty
    // rather than reconstructed from the id.
    path: "",
    description: described.description,
    usage: reference.usage,
    preloaded: reference.preloaded,
    ...(origin !== undefined && { source: origin }),
  }

  return [{ ...skill, ...pluginRefFor(skill) }]
}

/** One compiled sub-agent: its markdown, and the root it is written under. */
type CompiledAgent = { name: AgentName; scope: SkillScope; body: string }

/**
 * The vendored corpus and the Liquid engine, reached through `import()` and
 * nowhere else.
 *
 * This is the heaviest thing in the app by a wide margin, and it is the reason
 * `@workspace/compile`'s own barrel refuses to re-export `./preview`: it is the
 * single module holding both the corpus and `liquidjs`. This module is already
 * lazy — the dialog imports it behind a click — and the second hop keeps the
 * corpus out of the model's chunk as well, so the tree can be drawn while the
 * agent bodies are still arriving.
 *
 * `CORPUS_CLI_VERSION` comes off the same import for the same reason: reading
 * it from `@workspace/compile/corpus` would put the corpus back on the static
 * graph to fetch one string.
 */
const corpusRenderer = () => import("@workspace/compile/preview")

/**
 * Every sub-agent the configuration selects, compiled from the vendored corpus.
 *
 * The definition fields are the CLI's own `metadata.yaml`, and the template
 * reads them through the same conditional spreads `resolveAgents` composes
 * its `AgentConfig` with: `disallowedTools`, `permissionMode`, `isolation`
 * and `experimental` are forwarded when the metadata sets them, so a preview
 * agent whose source declares e.g. `permissionMode: plan` renders that rather
 * than the template's own default.
 *
 * `effort` is one of the two fields a CONFIG can override, and it composes the
 * way `resolveAgents` composes it — `agentConfig.effort ?? definition.effort`,
 * that expression and no other. This function forwarded `agent.effort` alone,
 * so a `metadata.yaml` declaring `effort: high` with no override wrote the
 * line into a real install's frontmatter and drew none here. `model` is the
 * other, and stays unconditional below because every shipped definition
 * declares one; `effort` cannot, because none does — which is also why it is
 * read off `definitionFields` rather than `definition`, a field no literal in
 * `AGENT_DEFINITIONS` carries being absent from the indexed union's type
 * rather than present-and-undefined.
 *
 * `hooks` is the one field of that set this cannot forward, and it is a
 * structural gap rather than a choice made here: `GeneratedAgentDefinition`
 * in `@workspace/matrix`'s generated `agents.ts` does not carry it —
 * `scripts/generate-matrix-package.ts`'s `Pick<AgentYamlConfig, …>` never
 * names it, so no shipped `metadata.yaml`'s `hooks` reaches this vendored
 * roster to be read. No built-in agent declares one today, so the gap is
 * inert in practice, but a custom agent authored with its own `Stop` or
 * `PostToolUse` hook would preview without it. The completion gate itself is
 * unaffected either way — `withCompletionGate` composes it onto every
 * writing agent's `hooks` inside `renderAgent` itself, keyed on `tools`
 * rather than on anything this function supplies.
 *
 * `outputFormat` stays dropped, matching `resolveAgents`: it reaches no
 * template field there either, so there is nothing here to forward it into.
 */
async function compileAgents(
  config: ProjectConfig,
  matrix: Matrix,
  renderAgent: (name: AgentName, agent: AgentConfig) => Promise<string>
): Promise<CompiledAgent[]> {
  const selected = config.agents.filter(
    (agent) => !agent.excluded && agent.name in AGENT_DEFINITIONS
  )

  return Promise.all(
    selected.map(async (agent) => {
      const definition = AGENT_DEFINITIONS[agent.name]
      // A second binding to the SAME value, typed as the full interface rather than left on
      // `definition`'s own inferred literal shape. `AGENT_DEFINITIONS` is `as const satisfies
      // Record<AgentName, GeneratedAgentDefinition>`, so indexing it with the widened `AgentName`
      // parameter infers a union of each agent's own literal shape — which is what lets the
      // `model` line below stay unconditional, since every shipped entry's literal type states
      // one, and is exactly what breaks for `effort`, `disallowedTools`, `permissionMode`,
      // `isolation` and `experimental`: a field a given agent's metadata never sets is absent from
      // that literal entirely, which TypeScript does not read as "present and undefined" the way an
      // optional property on `GeneratedAgentDefinition` does. A `Pick` of only those five fields cannot
      // carry the assignment either — every property it would name is optional, and TypeScript's
      // weak-type check refuses a source object sharing none of them by name (`agent-summoner`'s
      // own literal has no `disallowedTools` key at all). The full-interface annotation avoids
      // both: `title`, `tools` and the rest are required, non-optional and genuinely in common,
      // so the assignment is an ordinary widening rather than a weak-type one — and it is kept on
      // a name of its own so the `model` line keeps reading `definition`'s narrow literal type.
      const definitionFields: GeneratedAgentDefinition = definition
      const effort = agent.effort ?? definitionFields.effort
      const compiled: AgentConfig = {
        name: agent.name,
        title: definition.title,
        description: definition.description,
        // The config's choice over the agent's own metadata, which is
        // `resolveAgents`'s rule. Unconditional because every shipped
        // definition declares a model — a future one that does not turns this
        // line into a type error rather than a branch nothing takes.
        model: agent.model ?? definition.model,
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

      return {
        name: agent.name,
        scope: agent.scope,
        body: await renderAgent(agent.name, compiled),
      }
    })
  )
}

// ── The two config files, per root ───────────────────────────────────────

/**
 * The `ConfigTypesExtras` a project's types half is widened by: every literal
 * its sibling `config.ts` holds, since the inlining writer puts the active
 * global rows into the project's own file verbatim. `buildProjectTypesExtras`
 * in the CLI's `config-gate/propagate.ts` is the same derivation.
 */
function projectTypesExtras(
  projectSplit: ProjectConfig,
  globalSplit: ProjectConfig,
  catalog: Matrix
) {
  const skills = [...globalSplit.skills, ...projectSplit.skills].filter(
    (skill) => !skill.excluded
  )
  const agents = [...globalSplit.agents, ...projectSplit.agents].filter(
    (agent) => !agent.excluded
  )
  const stack = { ...globalSplit.stack, ...projectSplit.stack }

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
        ...(globalSplit.selectedDomains ?? []),
      ]),
    ],
  }
}

/**
 * The global root's pair: the standalone writer for both halves, narrowed to
 * the entries this root installs — `writeGlobalPair` in
 * `config-gate/pair-writer.ts`, with the CLI's whole sub-agent roster as the
 * name source and no custom agents, because nothing the CLI ships declares one.
 */
const globalPair = (config: ProjectConfig, catalog: Matrix) => ({
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
 * The project root's pair.
 *
 * `config.ts` always takes the inlining writer — `writeProjectConfigPair` is
 * the only production site that passes `isProjectConfig`, and it always passes
 * a `globalConfig` beside it, empty or not.
 *
 * `config-types.ts` branches on whether a global `config-types.ts` exists on
 * disk, which here is whether the preview drew a global root at all. The import
 * form is where the one unknowable specifier lives; the standalone form has
 * none, so showing a placeholder there would be hedging about something the
 * preview knows.
 *
 * `SelectedAgentName` IS OVER THE INLINED ROWS, GLOBAL FIRST, which is why
 * every agent field below reads `extras` rather than the project split.
 * `regenerateConfigTypes` (`config-types-io.ts`) derives that union by reading
 * back the `config.ts` it has just written, and the inlining writer put the
 * inherited global rows in that file ahead of the project's own — so the CLI's
 * own answer is `buildProjectTypesExtras(inlinedProjectView(split, global))`
 * over `[...global.agents, ...split.agents]`, which is exactly what
 * `projectTypesExtras` above builds. `formatUnion` preserves order, so the
 * global-first sequence is the emitted one. Deriving it from the project split
 * instead — through the scope-blind `activeAgentNames`, whose own docblock says
 * "at either scope" — dropped every inherited name from a union whose sibling
 * `config.ts` still declared those agents.
 *
 * `ProjectAgentName` is the one that really is project-only, and
 * `activeProjectAgentNames` filters to `scope === "project"` to say so.
 */
const projectPair = (
  projectSplit: ProjectConfig,
  globalSplit: ProjectConfig,
  hasGlobalRoot: boolean,
  catalog: Matrix
) => {
  const extras = projectTypesExtras(projectSplit, globalSplit, catalog)
  const projectScopedAgentNames = activeProjectAgentNames(projectSplit.agents)

  return {
    configTs: generateConfigSource(projectSplit, catalog, {
      isProjectConfig: true,
      globalConfig: globalSplit,
    }),
    configTypesTs: hasGlobalRoot
      ? generateProjectConfigTypesSource({
          globalTypesImportPath: COMPUTED_AT_INSTALL,
          projectSkillIds: extras.extraSkillIds,
          projectAgentNames: extras.extraAgentNames,
          projectDomains: extras.extraDomains,
          projectCategories: extras.extraCategories,
          // The SAME extras the fields above take, deliberately: this union is
          // over the inlined file's own rows, and `extras` is the inlined view.
          // See the note on `SelectedAgentName` in this function's docblock.
          ...(extras.extraAgentNames.length > 0 && {
            selectedAgentNames: extras.extraAgentNames,
          }),
          ...(projectScopedAgentNames.length > 0 && {
            projectScopedAgentNames,
          }),
        })
      : generateConfigTypesSource(
          catalog,
          [...AGENT_NAMES],
          [],
          extras,
          projectSplit
        ),
  }
}

// ── The notes, for the rows that are not generated files ─────────────────

/**
 * WHAT MARKETPLACE A SKILL IS FROM, HONESTLY, IN A BROWSER. One answer, because
 * the two notes below both need it and two answers is how the first one drifted.
 *
 * The obvious source is wrong and was used by both notes in turn. `origin` on a
 * `SkillConfig`, and `availableSources` on a `CatalogSkill`, are written by the
 * CLI's multi-source loader and by nothing a browser runs:
 *
 *     grep -c availableSources packages/matrix/src/vendor/generated/matrix.ts
 *     grep -c availableSources packages/api-mocks/src/fixtures.ts
 *
 * both answer 0. So every skill's source collapsed to the public default, and a
 * visitor seated on somebody else's marketplace was told their skill comes from
 * ours — a plausible-looking coordinate that is simply false, which is the class
 * of defect this dialog exists to remove.
 *
 * The SEAT knows better. `catalog-store`'s own note names three marketplaces and
 * this is the first of them: SEATED, "the catalogue loaded in this tab", read
 * through `activeMarketplace()`. Deliberately not `marketplace-store`, which
 * owns the other two (CHOSEN and SAVED) and would answer what this browser
 * prefers rather than what it is looking at — and which imports
 * `@/lib/observability/report`, the module this file's header rules out.
 *
 * A REF IS NOT A NAME, and the two arms are that distinction made unignorable
 * by the type: a caller cannot reach `ref` believing it holds a name.
 *
 *   - `public` is the vendored catalogue, and its name is honestly reachable —
 *     `DEFAULT_PUBLIC_SOURCE_NAME` is the one the CLI records as a plugin
 *     skill's `origin` for it.
 *   - `ref` is `github:acme/skills`, a URL or a path: what `seedPayloadSchema`
 *     calls a ref where it declares the field, adding that "the name its
 *     manifest gives it is read from the fetched marketplace.json". This app
 *     fetches `catalog.json` and never that, so no name exists to print.
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

/**
 * The seated marketplace as prose, for the middle of a sentence. Shared by both
 * notes so they cannot word one fact two ways in a pane a visitor sees whole.
 */
const marketplacePhrase = (seated: SeatedMarketplace): string =>
  seated.kind === "public"
    ? `the ${seated.name} marketplace`
    : `the marketplace at ${seated.ref}`

/**
 * The same fact as a PATH, which is why this is a second rendering rather than
 * the phrase above: `Source:` names a coordinate someone can go and open, and
 * only the public arm has a bare name that can stand as a path segment.
 *
 * A ref is rendered AS a ref, labelled and after the path, rather than dropped
 * into the slot a name belongs in — `github:acme/skills/src/skills/<id>` would
 * be a coordinate that parses and resolves to nothing. Saying less is always
 * available; saying something false is not.
 */
const ejectedSourceLine = (skillId: string): string => {
  const seated = seatedMarketplace()
  const path = `${SKILLS_DIR_PATH}/${skillId}`

  return seated.kind === "public"
    ? `Source: ${seated.name}/${path}`
    : `Source: ${path}, in ${marketplacePhrase(seated)}`
}

/** The phrase for the seat this tab is on. The plugin note's half of the pair. */
const seatedMarketplacePhrase = (): string =>
  marketplacePhrase(seatedMarketplace())

/**
 * An ejected CATALOGUE skill's directory. Deliberately no file bodies: the CLI
 * copies the marketplace's own directory verbatim, so the bytes are not
 * generated and the preview would have to fetch them to know either the file
 * list or the contents. It fetches nothing.
 *
 * The coordinate is the SEATED marketplace, which is the same answer the plugin
 * note beside it gives — because flipping a skill between plugin and eject
 * changes where its bytes LAND, never where they come FROM.
 *
 * It is deliberately NOT the skill's own `origin`. For an ejected skill that
 * field is the `eject` sentinel, so the note read `Source: eject/src/skills/…`,
 * which names no repository that exists. Nor is it the catalogue entry's
 * `availableSources`, which named OURS to everybody — see {@link
 * seatedMarketplace}. A catalogue this browser has never seen is the one case
 * the preview genuinely cannot answer, and it has no row here to be wrong
 * about: the decode drops an id the seated catalogue does not carry.
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
 * The pane behind an ejected directory row.
 *
 * An EXTERNAL skill's children are its own explanation, so its row keeps the
 * empty pane every other directory row has. A catalogue skill has none, so it
 * says where it is copied from instead — and says nothing at all rather than
 * something invented for an id the seated catalogue does not carry, which is
 * the shape {@link resolveSkill} takes for the same lookup.
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
 * A plugin skill's reference. It has no path under either root and that is the
 * point of the row: `installPluginSkills` shells out to `claude plugin install`,
 * so the destination belongs to Claude Code and naming a directory here would
 * name one the install never creates.
 */
const pluginReferenceNote = (skill: SkillConfig, base: PreviewBase) =>
  [
    skill.id,
    ``,
    `Installed as a plugin, at ${SCOPE_OF[base]} scope. No files are written`,
    `under ${base} for it — Claude Code owns where a plugin lands, and the skill`,
    `resolves from ${seatedMarketplacePhrase()} at run time, as`,
    `${skill.id}:${skill.id}.`,
    ``,
    `Switch it to eject and the CLI writes a copy you own, at`,
    `${base}${CLAUDE_DIR}/${STANDARD_DIRS.SKILLS}/${skill.id}/.`,
  ].join("\n")

// ── The tree ─────────────────────────────────────────────────────────────

type NodeInput = Omit<PreviewNode, "lang"> & { lang?: PreviewLang }

const node = (input: NodeInput): PreviewNode => ({ lang: "text", ...input })

/** A root, a directory or the plugin group: a row with no bytes of its own. */
const structural = (id: string, name: string, depth: number): PreviewNode =>
  node({ id, name, depth, marker: null, body: "" })

/**
 * One root's rows, in emission order.
 *
 * A root is two directories, which is the correction that matters most to the
 * shape below: the config pair lives in `.claude-src/` and everything else in
 * `.claude/`. `plugin skills` is neither — it is a group, and it carries no
 * trailing slash for exactly that reason.
 */
function rootNodes(
  base: PreviewBase,
  pair: { configTs: string; configTypesTs: string },
  agents: readonly CompiledAgent[],
  skills: readonly SkillConfig[],
  external: Readonly<Record<string, SeedExternalSkill>>,
  catalog: Matrix
): PreviewNode[] {
  const claudeSrc = `${base}${CLAUDE_SRC_DIR}/`
  const claude = `${base}${CLAUDE_DIR}/`
  const agentsDir = `${claude}${STANDARD_DIRS.AGENTS}/`
  const skillsDir = `${claude}${STANDARD_DIRS.SKILLS}/`

  const ejected = skills.filter((skill) => !isPluginSkill(skill))
  const plugins = skills.filter(isPluginSkill)

  return [
    structural(base, base, 0),

    structural(claudeSrc, `${CLAUDE_SRC_DIR}/`, 1),
    node({
      id: `${claudeSrc}${STANDARD_FILES.CONFIG_TS}`,
      name: STANDARD_FILES.CONFIG_TS,
      depth: 2,
      marker: "new",
      body: pair.configTs,
      lang: "typescript",
    }),
    node({
      id: `${claudeSrc}${STANDARD_FILES.CONFIG_TYPES_TS}`,
      name: STANDARD_FILES.CONFIG_TYPES_TS,
      depth: 2,
      marker: "new",
      body: pair.configTypesTs,
      lang: "typescript",
    }),

    ...(agents.length > 0 || ejected.length > 0
      ? [structural(claude, `${CLAUDE_DIR}/`, 1)]
      : []),

    ...(agents.length > 0
      ? [
          structural(agentsDir, `${STANDARD_DIRS.AGENTS}/`, 2),
          ...agents.map((agent) =>
            node({
              id: `${agentsDir}${agent.name}.md`,
              name: `${agent.name}.md`,
              depth: 3,
              marker: "new",
              body: agent.body,
              lang: "markdown",
            })
          ),
        ]
      : []),

    ...(ejected.length > 0
      ? [
          structural(skillsDir, `${STANDARD_DIRS.SKILLS}/`, 2),
          ...ejected.flatMap((skill) =>
            ejectedSkillNodes(skillsDir, skill, external[skill.id], catalog)
          ),
        ]
      : []),

    ...(plugins.length > 0
      ? [
          structural(`${base}${PLUGIN_GROUP}`, PLUGIN_GROUP, 1),
          ...plugins.map((skill) =>
            node({
              // No base and no directory: a plugin skill's identity is its id,
              // because it has no path under this root to be identified by.
              id: skill.id,
              name: skill.id,
              depth: 2,
              marker: "plugin",
              body: pluginReferenceNote(skill, base),
            })
          ),
        ]
      : []),
  ]
}

/**
 * The group a root's plugin skills hang under, which is deliberately NOT a
 * directory name: plugin scope really is per-root, so grouping them under the
 * root is truthful, and giving them a path would not be.
 */
const PLUGIN_GROUP = "plugin skills"

/**
 * An ejected skill's directory, and its children when the preview honestly has
 * any: an EXTERNAL skill's bytes travel inside the payload and are already
 * seated, so listing them is reporting rather than inventing. A catalogue
 * skill's are in a marketplace nobody has fetched.
 */
function ejectedSkillNodes(
  skillsDir: string,
  skill: SkillConfig,
  external: SeedExternalSkill | undefined,
  catalog: Matrix
): PreviewNode[] {
  const directory = `${skillsDir}${skill.id}/`

  // The amber label is on the directory row and only there; its children,
  // where there are any, read `new` like every other file.
  const directoryRow = node({
    id: directory,
    name: `${skill.id}/`,
    depth: 3,
    marker: "eject",
    body: ejectedDirectoryBody(skill, external, catalog),
  })

  if (!external) return [directoryRow]

  return [
    directoryRow,
    // A directory listing, so the order is the paths' own — through `bytewise`
    // rather than `localeCompare`, which would make the rows a property of the
    // machine reading them.
    ...Object.entries(external.files)
      .sort(([a], [b]) => bytewise(a, b))
      .map(([path, text]) =>
        node({
          id: `${directory}${path}`,
          name: path,
          depth: 4,
          marker: "new",
          // Somebody else's bytes, so no grammar runs over them —
          // `skill-contents-dialog.tsx`'s rendering-safety decision, arriving
          // in a second dialog.
          body: text,
        })
      ),
  ]
}

// ── The whole preview ────────────────────────────────────────────────────

/**
 * Files an install actually writes: the config pair per emitted root, one per
 * compiled sub-agent, and an external ejected skill's real files.
 *
 * `new` is precisely that set and nothing else, which is why the count reads it
 * rather than re-deriving one. A plugin reference writes nothing and is
 * `plugin`; an ejected directory is copied rather than generated and is
 * `eject`; a root, a directory and the plugin group carry no marker at all.
 */
const countWrittenFiles = (roots: readonly PreviewRoot[]): number =>
  roots.flatMap((root) => root.nodes).filter((entry) => entry.marker === "new")
    .length

export async function buildOutputPreview(
  payload: SeedPayload
): Promise<OutputPreview> {
  // The catalogue every renderer is handed, and the one
  // `generateProjectConfigFromSkills` reads off its own seat — the editor is
  // that seat's second writer, after the CLI's `initializeMatrix`. Seated per
  // build rather than once at startup, because a marketplace can be loaded and
  // an external skill added underneath a session.
  const catalog = activeMatrix()
  seatCatalog(catalog)

  const { CORPUS_CLI_VERSION, renderAgentFromCorpus } = await corpusRenderer()

  const config = buildConfig(payload)
  const { global: globalSplit, project: projectSplit } =
    splitConfigByScope(config)
  const agents = await compileAgents(config, catalog, renderAgentFromCorpus)
  const external = payload.external ?? {}

  const holdsSomething = (split: ProjectConfig) =>
    split.agents.length > 0 || split.skills.length > 0

  const hasGlobalRoot = holdsSomething(globalSplit)
  const hasProjectRoot = holdsSomething(projectSplit)

  const roots: PreviewRoot[] = [
    ...(hasGlobalRoot
      ? [
          {
            base: GLOBAL_BASE,
            config: globalSplit,
            nodes: rootNodes(
              GLOBAL_BASE,
              globalPair(globalSplit, catalog),
              agents.filter((agent) => agent.scope === "global"),
              globalSplit.skills,
              external,
              catalog
            ),
          } satisfies PreviewRoot,
        ]
      : []),
    ...(hasProjectRoot
      ? [
          {
            base: PROJECT_BASE,
            config: projectSplit,
            nodes: rootNodes(
              PROJECT_BASE,
              projectPair(projectSplit, globalSplit, hasGlobalRoot, catalog),
              agents.filter((agent) => agent.scope !== "global"),
              projectSplit.skills,
              external,
              catalog
            ),
          } satisfies PreviewRoot,
        ]
      : []),
  ]

  return {
    roots,
    fileCount: countWrittenFiles(roots),
    corpusVersion: CORPUS_CLI_VERSION,
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
