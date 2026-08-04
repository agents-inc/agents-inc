import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { z } from "zod"

// Bump when the persisted shape changes; older blobs are discarded on load.
export const PERSIST_VERSION = 8

export const loadStateSchema = z.enum(["lazy", "preloaded"])

// One (agent, skill) edge. `enabled: false` keeps the row: switching a skill
// off for one agent in the roster must not erase which load mode it had, and
// the row stays listed — recessed — so it can be switched back on.
export const assignmentSchema = z.object({
  load: loadStateSchema,
  enabled: z.boolean(),
})

// A skill says where it installs and which agents carry it. Model and effort
// were here until v7 and are the sub-agent's now: a skill is a plugin from
// someone else's repo, so a per-skill model never described anything real.
export const skillEntrySchema = z.object({
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  // Sub-agent id → how that agent carries the skill. The single source of
  // truth for assignment; every count and list on screen is derived from it.
  assignments: z.record(z.string(), assignmentSchema),
})

// The cycle orders as well as the value sets: the roster's model word and
// effort meter step through these in exactly this sequence.
export const AGENT_MODELS = ["opus", "fable", "sonnet", "haiku"] as const
export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
// Two values, so the cycle is a toggle — but it steps through the same helper
// the other two do rather than negating, which keeps one rule on the row.
export const AGENT_SCOPES = ["project", "global"] as const

export const agentModelSchema = z.enum(AGENT_MODELS)
export const agentEffortSchema = z.enum(AGENT_EFFORTS)
export const agentScopeSchema = z.enum(AGENT_SCOPES)

// Every decision about one sub-agent, all of it optional. `on` is tri-state on
// purpose: `true` pins it on, `false` pins it off, and *absent* means "ask the
// assignments" — so an entry holding only a model must not pin anything.
export const agentEntrySchema = z.object({
  on: z.boolean().optional(),
  model: agentModelSchema.optional(),
  effort: agentEffortSchema.optional(),
  // Where this agent's front-matter is written. Absent means `project`, which
  // is the CLI's default rather than anything the catalogue says.
  scope: agentScopeSchema.optional(),
})

export const persistedConfigSchema = z.object({
  stackId: z.string().nullable(),
  // Sparse — presence is selection. Ids stay plain strings so one id dropped
  // from a regenerated catalog is pruned rather than failing the whole parse.
  skills: z.record(z.string(), skillEntrySchema),
  // Configuration for skills that are not selected, so deselecting a dozen
  // clicks of setup is not destructive. Only entries worth keeping land here.
  remembered: z.record(z.string(), skillEntrySchema),
  // Sparse too: only agents someone has actually decided something about. An
  // absent agent is on exactly when its assignments say so and runs on its own
  // catalogue model — neither is written into state.
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
  effort: AgentEffort
  scope: AgentScope
}

// Shared so `isStackCustom` compares against what `applyStack` writes.
export const DEFAULT_SKILL_OPTIONS = {
  install: "plugin",
  scope: "project",
} as const satisfies SkillOptions

// The web offers four models; an agent's metadata may name one outside them
// (or none), in which case it rests here.
const FALLBACK_MODEL: AgentModel = "sonnet"
// Agent metadata carries no effort level yet, so every agent rests on the same
// middle of the scale until the CLI adds one.
const RESTING_EFFORT: AgentEffort = "medium"
// The CLI writes sub-agent front-matter into the project unless it is asked
// for the user's own ~/.claude, so this one rests on the installer's default
// rather than on anything the agent's own metadata names.
const RESTING_SCOPE: AgentScope = "project"

const isOfferedModel = (model: string | undefined): model is AgentModel =>
  AGENT_MODELS.some((offered) => offered === model)

// What an agent runs on before anyone touches it. There is no single default:
// each agent rests on the model its own `metadata.yaml` names.
export const restingAgentOptions = (agentId: string): AgentOptions => {
  const catalogModel = SUB_AGENTS_BY_ID[agentId]?.model

  return {
    model: isOfferedModel(catalogModel) ? catalogModel : FALLBACK_MODEL,
    effort: RESTING_EFFORT,
    scope: RESTING_SCOPE,
  }
}

// What an agent runs on now. The store keeps only explicit non-resting
// choices, so the value on screen is a derivation and falls back field by
// field — choosing an effort must not drag the model off its own default.
export const resolveAgentOptions = (
  agents: PersistedConfig["agents"],
  agentId: string
): AgentOptions => {
  const resting = restingAgentOptions(agentId)
  const chosen = agents[agentId]

  return {
    model: chosen?.model ?? resting.model,
    effort: chosen?.effort ?? resting.effort,
    scope: chosen?.scope ?? resting.scope,
  }
}

// The roster's one on/off rule: an explicit pin wins; otherwise an agent is on
// exactly when it holds at least one enabled skill. Selecting a skill enables
// its agents *through* this rule — nothing stores "on".
export const isAgentOn = (
  config: Pick<PersistedConfig, "skills" | "agents">,
  agentId: string
) =>
  config.agents[agentId]?.on ??
  Object.values(config.skills).some(
    (entry) => entry.assignments[agentId]?.enabled
  )

// Does this entry carry any information at all? Not "did the user customise
// it" — a stack-applied skill arrives with assignments and must be kept. Only
// the empty entry is dropped, since restoring one equals creating it fresh.
export const isWorthRemembering = (entry: SkillEntry) =>
  Object.keys(entry.assignments).length > 0 ||
  entry.install !== DEFAULT_SKILL_OPTIONS.install ||
  entry.scope !== DEFAULT_SKILL_OPTIONS.scope

export const persistedUiSchema = z.object({
  // Domain id → collapsed, sparse. Keyed by id rather than position so a
  // reordered catalog cannot collapse the wrong accordion.
  rosterCollapsed: z.record(z.string(), z.boolean()),
})

export type PersistedUi = z.infer<typeof persistedUiSchema>

// Drops references the regenerated catalog no longer knows. Session-added
// skills are never persisted in the first place, so none reach here.
const isKnownSkill = (skillId: string) => skillId in CATALOG.skillsById
const isKnownAgent = (agentId: string) => agentId in SUB_AGENTS_BY_ID
const isKnownStack = (stackId: string | null) =>
  STACKS.some((stack) => stack.id === stackId)

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

// Pre-release policy: no migrations. Anything but the current version is
// discarded (`undefined`), which `merge` replaces with defaults. When the app
// has real users, migrations start here — the version seam already exists.
export const migrateConfig = (state: unknown, fromVersion: number): unknown =>
  fromVersion === PERSIST_VERSION ? state : undefined
