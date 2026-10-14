import {
  CODEX_MODEL_NAMES,
  DEFAULT_SELECTION_OPTIONS,
  SUB_AGENTS_BY_ID,
  isSeedScopePairWritable,
  subAgentById,
  type CodexModelName,
} from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"
import { activeCatalog, activeStacks } from "./catalog-store"

import type { Provider } from "@workspace/compile"

// The roster is the vendored one whichever catalogue is seated: marketplaces
// do not ship sub-agents (owner, 2026-08-09).

// Bump when the persisted shape changes; older blobs are discarded on load.
export const PERSIST_VERSION = 8

export const loadStateSchema = z.enum(["lazy", "preloaded"])

// `enabled: false` keeps the row, so switching it back on restores its load.
export const assignmentSchema = z.object({
  load: loadStateSchema,
  enabled: z.boolean(),
})

// In the order the cells draw them.
export const SKILL_INSTALL_MODES = ["plugin", "eject"] as const
export const SKILL_SCOPES = ["project", "global"] as const

export const skillEntrySchema = z.object({
  install: z.enum(SKILL_INSTALL_MODES),
  scope: z.enum(SKILL_SCOPES),
  // Sub-agent id → how it carries the skill: the one source of assignment.
  assignments: z.record(z.string(), assignmentSchema),
})

export const AGENT_MODELS = ["opus", "fable", "sonnet", "haiku"] as const
export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
export const AGENT_SCOPES = ["project", "global"] as const

export const agentModelSchema = z.enum(AGENT_MODELS)
export const agentEffortSchema = z.enum(AGENT_EFFORTS)
export const agentScopeSchema = z.enum(AGENT_SCOPES)

// The session's own model, which a Codex role runs on unless pinned.
const INHERIT = "inherit"
const codexModelChoiceSchema = z.enum([INHERIT, ...CODEX_MODEL_NAMES])
type CodexModelChoice = z.infer<typeof codexModelChoiceSchema>

const CODEX_MODEL_LABELS = {
  "gpt-6-astra": "astra",
  "gpt-5.6-sol": "sol",
  "gpt-5.6-terra": "terra",
  "gpt-5.6-luna": "luna",
} as const satisfies Record<CodexModelName, string>

export const ROSTER_GROUP_BYS = ["domain", "scope"] as const
export const rosterGroupBySchema = z.enum(ROSTER_GROUP_BYS)
export type RosterGroupBy = z.infer<typeof rosterGroupBySchema>

// `system` keeps following the machine, which a stored light/dark cannot.
export const THEME_PREFERENCES = ["system", "light", "dark"] as const
export const themePreferenceSchema = z.enum(THEME_PREFERENCES)
export type ThemePreference = z.infer<typeof themePreferenceSchema>

const isCodexModelName = (value: unknown): value is CodexModelName =>
  CODEX_MODEL_NAMES.some((offered) => offered === value)

const holdsUnofferedCodexModel = (
  entry: unknown
): entry is { codexModel: unknown } =>
  typeof entry === "object" &&
  entry !== null &&
  "codexModel" in entry &&
  !isCodexModelName(entry.codexModel)

// Codex retires ids, so an unoffered one drops alone rather than failing the
// whole blob the way an unoffered `model` does. `inherit` rests, so it is
// never stored either.
const withOfferedCodexModel = (entry: unknown) => {
  if (!holdsUnofferedCodexModel(entry)) return entry

  const { codexModel: _unoffered, ...rest } = entry
  return rest
}

// Every decision about one sub-agent. `on` is tri-state: absent means "ask the
// assignments", so an entry holding only a model pins nothing.
export const agentEntrySchema = z.preprocess(
  withOfferedCodexModel,
  z.object({
    on: z.boolean().optional(),
    model: agentModelSchema.optional(),
    // Typed as the choice so an `AgentOptions` patch composes onto an entry;
    // `inherit` never survives the preprocess.
    codexModel: codexModelChoiceSchema.optional(),
    effort: agentEffortSchema.optional(),
    // Absent means `global`, the shared selection default.
    scope: agentScopeSchema.optional(),
  })
)

export const persistedConfigSchema = z.object({
  stackId: z.string().nullable(),
  // Sparse: presence is selection. Plain-string ids, so one a regenerated
  // catalogue dropped is pruned rather than failing the parse.
  skills: z.record(z.string(), skillEntrySchema),
  // Setup for deselected skills, so deselecting is not destructive.
  remembered: z.record(z.string(), skillEntrySchema),
  // Sparse: only agents someone decided something about.
  agents: z.record(z.string(), agentEntrySchema),
})

export type LoadState = z.infer<typeof loadStateSchema>
export type Assignment = z.infer<typeof assignmentSchema>
export type SkillEntry = z.infer<typeof skillEntrySchema>
export type AgentModel = z.infer<typeof agentModelSchema>
export type AgentEffort = z.infer<typeof agentEffortSchema>
export type AgentScope = z.infer<typeof agentScopeSchema>
export type AgentEntry = z.infer<typeof agentEntrySchema>
export type PersistedConfig = z.infer<typeof persistedConfigSchema>
export type SkillOptions = Omit<SkillEntry, "assignments">
export type AgentOptions = {
  model: AgentModel
  codexModel: CodexModelChoice
  effort: AgentEffort
  scope: AgentScope
}

// The matrix's spelling of an untouched pick, which the CLI's decode reads too.
export const DEFAULT_SKILL_OPTIONS =
  DEFAULT_SELECTION_OPTIONS satisfies SkillOptions

// For an agent whose metadata names no offered model.
const FALLBACK_MODEL: AgentModel = "sonnet"
// Agent metadata carries no effort yet.
const RESTING_EFFORT: AgentEffort = "medium"
const RESTING_SCOPE: AgentScope = DEFAULT_SELECTION_OPTIONS.scope

const isOfferedModel = (model: string | undefined): model is AgentModel =>
  AGENT_MODELS.some((offered) => offered === model)

// Each agent rests on the model its own `metadata.yaml` names.
export const restingAgentOptions = (agentId: string): AgentOptions => {
  const catalogModel = subAgentById(agentId)?.model

  return {
    model: isOfferedModel(catalogModel) ? catalogModel : FALLBACK_MODEL,
    codexModel: INHERIT,
    effort: RESTING_EFFORT,
    scope: RESTING_SCOPE,
  }
}

// The store keeps only non-resting choices, so each field falls back alone.
export const resolveAgentOptions = (
  agents: PersistedConfig["agents"],
  agentId: string
): AgentOptions => {
  const resting = restingAgentOptions(agentId)
  const chosen = agents[agentId]

  return {
    model: chosen?.model ?? resting.model,
    codexModel: chosen?.codexModel ?? resting.codexModel,
    effort: chosen?.effort ?? resting.effort,
    scope: chosen?.scope ?? resting.scope,
  }
}

type ModelChoice = { value: AgentModel | CodexModelName; label: string }

// No `inherit` on Codex (Q5): nothing pressed is the session's own model.
const MODEL_CHOICES = {
  claude: AGENT_MODELS.map((model) => ({ value: model, label: model })),
  codex: CODEX_MODEL_NAMES.map((model) => ({
    value: model,
    label: CODEX_MODEL_LABELS[model],
  })),
} satisfies Record<Provider, readonly ModelChoice[]>

// Both pins live on one entry and each provider reads its own (ruling 3).
export const modelChoicesFor = (provider: Provider): readonly ModelChoice[] =>
  MODEL_CHOICES[provider]

export const chosenModelFor = (provider: Provider, options: AgentOptions) =>
  provider === "codex" ? options.codexModel : options.model

// Parsed, so a value from the other provider's row throws rather than storing.
export const modelPatchFor = (
  provider: Provider,
  value: string
): Partial<AgentOptions> =>
  provider === "codex"
    ? { codexModel: codexModelChoiceSchema.parse(value) }
    : { model: agentModelSchema.parse(value) }

// Project skills never reach global sub-agents. The rule is the wire
// contract's, which the CLI reads too (EDITOR-08).
export const isScopePairCompatible = (
  skillScope: SkillOptions["scope"],
  agentScope: AgentScope
) => isSeedScopePairWritable(skillScope, agentScope)

// The same rule asked of the sparse agents map, where an unmoved agent rests
// at global.
export const reachesAgent = (
  agents: PersistedConfig["agents"],
  skillScope: SkillOptions["scope"],
  agentId: string
) =>
  isScopePairCompatible(skillScope, resolveAgentOptions(agents, agentId).scope)

// An explicit pin wins; otherwise an agent is on when it holds an enabled
// skill. `reachesAgent` is not asked (EDITOR-08): the agent stays on so its
// card can fix the pair, and `summarize` gates Install and Share instead.
export const isAgentOn = (
  config: Pick<PersistedConfig, "skills" | "agents">,
  agentId: string
) =>
  config.agents[agentId]?.on ??
  Object.values(config.skills).some(
    (entry) => entry.assignments[agentId]?.enabled
  )

// Only the empty entry is dropped: restoring it equals creating it fresh, and
// a stack-applied one carries assignments.
export const isWorthRemembering = (entry: SkillEntry) =>
  Object.keys(entry.assignments).length > 0 ||
  entry.install !== DEFAULT_SKILL_OPTIONS.install ||
  entry.scope !== DEFAULT_SKILL_OPTIONS.scope

export const persistedUiSchema = z.object({
  // Group key → collapsed, sparse. Domain mode writes the bare id, scope mode
  // `scope:<scope>`, so the two never collide.
  rosterCollapsed: z.record(z.string(), z.boolean()),
  // `.catch()`-ed, not required: `ui-store`'s `merge` silently drops a blob that
  // fails, and `.catch()` also fills a missing key. Its version is not bumped
  // for the same reason.
  rosterGroupBy: rosterGroupBySchema.catch("domain"),
  providerCollapsed: z.boolean().catch(false),
  stackCollapsed: z.boolean().catch(false),
  agentsCollapsed: z.boolean().catch(false),
  theme: themePreferenceSchema.catch("system"),
})

export type PersistedUi = z.infer<typeof persistedUiSchema>

// Drops references the seated catalogue does not know. An added skill is in
// it once its content is seated, which `adoptSeedPayload` orders (EDITOR-03).
const isKnownSkill = (skillId: string) => skillId in activeCatalog().skillsById
const isKnownAgent = (agentId: string) => agentId in SUB_AGENTS_BY_ID
const isKnownStack = (stackId: string | null) =>
  activeStacks().some((stack) => stack.id === stackId)

const pruneAssignments = (assignments: SkillEntry["assignments"]) =>
  Object.fromEntries(
    Object.entries(assignments).filter(([agentId]) => isKnownAgent(agentId))
  )

const pruneEntry = (entry: SkillEntry): SkillEntry => ({
  ...entry,
  assignments: pruneAssignments(entry.assignments),
})

const pruneSkillMap = (skills: PersistedConfig["skills"]) =>
  Object.fromEntries(
    Object.entries(skills)
      .filter(([skillId]) => isKnownSkill(skillId))
      .map(([skillId, entry]) => [skillId, pruneEntry(entry)])
  )

export const pruneUnknownIds = (config: PersistedConfig): PersistedConfig => ({
  stackId: isKnownStack(config.stackId) ? config.stackId : null,
  skills: pruneSkillMap(config.skills),
  remembered: pruneSkillMap(config.remembered),
  agents: Object.fromEntries(
    Object.entries(config.agents).filter(([agentId]) => isKnownAgent(agentId))
  ),
})

// No migrations: any other version is discarded, and reported, since `merge`
// sees it only as the `undefined` an empty storage gives. Version numbers
// only; the configuration is the user's own.
export const migrateConfig = (state: unknown, fromVersion: number): unknown => {
  if (fromVersion === PERSIST_VERSION) return state

  reportIssue("Discarded saved configuration from another version", {
    fromVersion,
    persistVersion: PERSIST_VERSION,
  })

  return undefined
}
