import {
  DEFAULT_SELECTION_OPTIONS,
  SUB_AGENTS_BY_ID,
  isSeedScopePairWritable,
  subAgentById,
} from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"
import { activeCatalog, activeStacks } from "./catalog-store"

// The roster is imported directly and the catalogue is not, and the asymmetry
// is a ruling rather than an oversight: marketplaces do not ship sub-agents
// (owner, 2026-08-09), so `SUB_AGENTS_BY_ID` is the vendored roster whichever
// catalogue is loaded. Skills and stacks are the catalogue's, so they come off
// the seat.

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
  // Where this agent's front-matter is written. Absent means `global` — the
  // shared selection default — rather than anything the catalogue says.
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

// Shared so `isStackCustom` compares against what `applyStack` writes. The
// values are the matrix's one spelling of "what does an untouched pick do?",
// which the CLI's seed decode reads too — a fresh pick means the same thing
// on either surface, and `satisfies` keeps the shared words sayable here.
export const DEFAULT_SKILL_OPTIONS =
  DEFAULT_SELECTION_OPTIONS satisfies SkillOptions

// The web offers four models; an agent's metadata may name one outside them
// (or none), in which case it rests here.
const FALLBACK_MODEL: AgentModel = "sonnet"
// Agent metadata carries no effort level yet, so every agent rests on the same
// middle of the scale until the CLI adds one.
const RESTING_EFFORT: AgentEffort = "medium"
// The shared selection default — a fresh pick installs into the user's own
// ~/.claude — so this one rests on the matrix's spelling rather than on
// anything the agent's own metadata names.
const RESTING_SCOPE: AgentScope = DEFAULT_SELECTION_OPTIONS.scope

const isOfferedModel = (model: string | undefined): model is AgentModel =>
  AGENT_MODELS.some((offered) => offered === model)

// What an agent runs on before anyone touches it. There is no single default:
// each agent rests on the model its own `metadata.yaml` names.
export const restingAgentOptions = (agentId: string): AgentOptions => {
  const catalogModel = subAgentById(agentId)?.model

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

/**
 * Project skills never reach global sub-agents; global skills reach any.
 *
 * A global sub-agent's front-matter is written to `~/.claude`, where every
 * project on the machine sees it, and a project-scoped skill is installed under
 * one project's `.claude` — so a global agent carrying a project skill names
 * something that does not exist from anywhere else.
 *
 * The rule is not this app's to state, and it is no longer stated here: it
 * lives on the wire contract as `isSeedScopePairWritable`, where the CLI's
 * `isScopePairCompatible` reads it too. It used to be a verbatim third copy —
 * so this is not a preference the editor is expressing, and it is no longer a
 * sentence that can drift from the two surfaces that enforce it. A
 * configuration carrying a live pair is one nobody can install, and the editor
 * minted them because it is the one surface that consumes no generated config
 * types (EDITOR-08).
 */
export const isScopePairCompatible = (
  skillScope: SkillOptions["scope"],
  agentScope: AgentScope
) => isSeedScopePairWritable(skillScope, agentScope)

/**
 * The same rule asked of the agents map, which is where an agent's scope comes
 * from. Sparse, so an agent nobody has moved rests at global and the map says
 * nothing about it at all — which is why the question cannot be answered from
 * the assignment alone.
 */
export const reachesAgent = (
  agents: PersistedConfig["agents"],
  skillScope: SkillOptions["scope"],
  agentId: string
) =>
  isScopePairCompatible(skillScope, resolveAgentOptions(agents, agentId).scope)

// The roster's one on/off rule: an explicit pin wins; otherwise an agent is on
// exactly when it holds at least one enabled skill. Selecting a skill enables
// its agents *through* this rule — nothing stores "on".
//
// `reachesAgent` is deliberately NOT asked here, and that is the whole shape of
// the answer to EDITOR-08. An agent holding a project skill while it rests at
// global is not an agent with no skills; it is an agent with a skill and a
// problem, and the problem is only fixable because the row is on screen and the
// agent's own scope word is a live control. Nothing counts differently — what
// the pair costs is Install and Share, which `summarize` gates.
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

// Drops references the LOADED catalog does not know. An added skill IS in the
// loaded catalog — that is the whole of EDITOR-03's ruling — so one arriving in
// a payload survives this, provided its content was seated first; that ordering
// is `adoptSeedPayload`'s job and the reason it exists. What still prunes here
// is a configuration saved against one marketplace and reopened under another,
// for exactly the same reason a regenerated catalogue's drops do.
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

// Pre-release policy: no migrations. Anything but the current version is
// discarded (`undefined`), which `merge` replaces with defaults. When the app
// has real users, migrations start here — the version seam already exists.
//
// The discard is reported for the same reason the unreadable blob next door
// is: someone's afternoon of configuration becomes empty state and nothing on
// screen says so. This one is the wider case — a version bump empties every
// saved configuration at once — and it is the only path `merge` cannot see,
// since a refused blob reaches it as the `undefined` an empty storage does.
// Version numbers only; a persisted configuration is the user's own.
export const migrateConfig = (state: unknown, fromVersion: number): unknown => {
  if (fromVersion === PERSIST_VERSION) return state

  reportIssue("Discarded saved configuration from another version", {
    fromVersion,
    persistVersion: PERSIST_VERSION,
  })

  return undefined
}
