import { z } from "zod"

// The wire contract for shared configs: the web app POSTs this payload to the
// config store (Cloudflare Worker + KV) and gets a short id back; `agents-inc
// init --from <id>` fetches and validates it with this same schema. Canonical home is
// the CLI's shared package once that exists (D-239); until then this file is
// the source of truth and the CLI vendors it.

// Bump when the payload shape changes. Pre-release policy is discard-don't-
// migrate, so the schema accepts exactly one version: an id minted before a
// bump fails to decode loudly rather than being guessed at.
//
// v2 moved model and effort off the skill and onto the sub-agent, which is
// where they were always a property of — a skill is a plugin from someone
// else's repo and has no business naming a model.
//
// v3 gave the sub-agent its scope. The CLI has carried one on every agent all
// along; the web had no surface for it, so `--from` wrote `project` for
// everyone. The field is additive-optional, which a version could not normally
// be needed for — but the CLI's vendored copy of this object strips what it
// does not know, so the version is what says the field is really there.
export const SEED_VERSION = 3

// The model and effort a sub-agent runs on. Both scales are the CLI's, since
// the CLI is what writes them into the agent's frontmatter.
export const seedModelSchema = z.enum(["opus", "fable", "sonnet", "haiku"])
// Claude Code's subagent and skill frontmatter accept exactly these. `ultra` was
// carried here by mistake: "ultracode" exists but is a session-only Claude Code
// setting that sends `xhigh`, not a model effort level, so a config naming it
// would have been invalid wherever it landed.
export const seedEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

export const seedLoadStateSchema = z.enum(["lazy", "preloaded"])

// A skill says where it installs and which agents carry it, and nothing about
// how they think.
export const seedSkillSchema = z.object({
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  // Sub-agent id → load state; presence is assignment. Per (agent, skill),
  // matching the granularity of the CLI's stack config.
  assignments: z.record(z.string(), seedLoadStateSchema),
})

// Everything one sub-agent has to say, all of it optional so the map can be as
// sparse as the skill map is. `on: true` is what lets a bare base agent travel
// at all: v1 could only infer agents from assignments, so an agent holding no
// skills was unshareable. An entry naming only a model does *not* switch the
// agent on — absent means "the assignments decide".
export const seedAgentSchema = z.object({
  on: z.boolean().optional(),
  model: seedModelSchema.optional(),
  effort: seedEffortSchema.optional(),
  // Where this agent's front-matter is written: the project, or the user's own
  // ~/.claude. Absent means the shared selection default — `global`, spelled
  // once in `DEFAULT_SELECTION_OPTIONS` — so the resting choice never travels,
  // exactly as a resting model does not.
  scope: z.enum(["project", "global"]).optional(),
})

// Ids are full catalog slugs, never positional indices, so a payload survives
// catalog churn: consumers warn and skip unknown ids rather than failing.
export const seedPayloadSchema = z.object({
  v: z.literal(SEED_VERSION),
  // Diagnostics only. A mismatch with the consumer's matrix must not fail the
  // decode — it explains why some ids were skipped.
  matrixVersion: z.string(),
  stackId: z.string().nullable(),
  // Sparse — presence is selection, exactly like the web store. `remembered`
  // is deliberately absent: deselected setup never leaves the browser.
  skills: z.record(z.string(), seedSkillSchema),
  // Sparse for the same reason: an agent resting on its own catalogue model
  // with no pin has nothing to say, so it has no entry. Presence is a
  // statement, not an install: what installs is decided by assignments and
  // `on: true` alone, so a derived-off agent can still travel its overrides.
  // Only an agent pinned *off* is omitted outright — with the assignment rows
  // naming it, since the sharer's own counts exclude them.
  agents: z.record(z.string(), seedAgentSchema),
})

export type SeedModel = z.infer<typeof seedModelSchema>
export type SeedEffort = z.infer<typeof seedEffortSchema>
export type SeedLoadState = z.infer<typeof seedLoadStateSchema>
export type SeedSkill = z.infer<typeof seedSkillSchema>
export type SeedAgent = z.infer<typeof seedAgentSchema>
export type SeedPayload = z.infer<typeof seedPayloadSchema>
