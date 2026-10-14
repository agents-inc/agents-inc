import { z } from "zod"

import { DEFAULT_SELECTION_OPTIONS } from "./read-model/selection-defaults"

// The wire contract for shared configs: the editor POSTs this payload to the
// config store and gets a short id back; `init --from <id>` fetches and
// validates it with this same schema. Every consumer imports it from here.

// Bump when the payload shape changes. Discard-don't-migrate: the schema accepts
// exactly one version, and a consumer's refusal of any other names the fix.
// v6 added a sub-agent's `codexModel`, which a v5 consumer would strip.
export const SEED_VERSION = 6

export const seedModelSchema = z.enum(["opus", "fable", "sonnet", "haiku"])
export const seedEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

export const seedLoadStateSchema = z.enum(["lazy", "preloaded"])

export const seedScopeSchema = z.enum(["project", "global"])

export const seedSkillSchema = z.object({
  install: z.enum(["plugin", "eject"]),
  scope: seedScopeSchema,
  // Sub-agent id → load state; presence is assignment. Per (agent, skill),
  // matching the granularity of the CLI's stack config.
  assignments: z.record(z.string(), seedLoadStateSchema),
})

// Everything one sub-agent has to say, all optional. `on: true` is what lets an
// agent holding no skills travel; an entry naming only a model does not switch
// the agent on.
export const seedAgentSchema = z.object({
  on: z.boolean().exactOptional(),
  model: seedModelSchema.exactOptional(),
  // A string rather than the CLI's enum: Codex retires ids, and an enum would
  // turn each retirement into a version bump. Each consumer drops an id it does
  // not offer.
  codexModel: z.string().min(1).exactOptional(),
  effort: seedEffortSchema.exactOptional(),
  // Absent means `DEFAULT_SELECTION_OPTIONS.scope`, so the resting choice never
  // travels.
  scope: seedScopeSchema.exactOptional(),
})

/**
 * The most one external skill's directory may weigh, in UTF-8 bytes: several
 * times the largest real documentation skill (78 KB), and well under a code
 * library wearing a SKILL.md (`anthropics/skills/skills/docx`, 1.1 MB).
 */
export const MAX_EXTERNAL_SKILL_BYTES = 262_144

const SKILL_MANIFEST = "SKILL.md"

// UTF-8, because that is what lands in KV and on disk.
const treeBytes = (files: Record<string, string>) => {
  const encoder = new TextEncoder()
  return Object.values(files).reduce(
    (total, text) => total + encoder.encode(text).length,
    0
  )
}

/**
 * A skill's whole directory, keyed by path relative to it (`reference/api.md`),
 * so a path cannot appear twice.
 */
export const seedSkillTreeSchema = z
  .record(z.string().min(1), z.string())
  .refine((files) => SKILL_MANIFEST in files, {
    message: `a skill directory must hold ${SKILL_MANIFEST}`,
  })
  .refine((files) => treeBytes(files) <= MAX_EXTERNAL_SKILL_BYTES, {
    message: `a skill directory may not exceed ${String(MAX_EXTERNAL_SKILL_BYTES)} bytes`,
  })

/**
 * One skill added from outside whichever catalogue the payload names, carrying
 * everything a catalogue entry needs. `repo` and `path` are provenance only.
 */
export const seedExternalSkillSchema = z.object({
  displayName: z.string().min(1),
  description: z.string(),
  // The placement the user confirmed at add time, never derived.
  categoryId: z.string().min(1),
  // GitHub's own `owner/name`.
  repo: z.string().min(1),
  // The skill's DIRECTORY within it — `skills/docx`, never the SKILL.md.
  path: z.string().min(1),
  files: seedSkillTreeSchema,
})

// Ids are full catalog slugs, never positional indices, so a payload survives
// catalog churn: consumers warn and skip unknown ids rather than failing.
export const seedPayloadSchema = z.object({
  v: z.literal(SEED_VERSION),
  // Diagnostics only. A mismatch with the consumer's matrix must not fail the
  // decode — it explains why some ids were skipped.
  matrixVersion: z.string(),
  stackId: z.string().nullable(),
  // The sentence the sharer's config records about itself. It travels instead
  // of a stack id, which would bring back the stack's whole roster on install.
  description: z.string().exactOptional(),
  // Where the skills are fetched from, as `--marketplace` takes it. Absent is
  // the default public catalogue.
  marketplace: z.string().exactOptional(),
  // Sparse: presence is selection.
  skills: z.record(z.string(), seedSkillSchema),
  // Skill id → its whole directory, for ids no catalogue can resolve.
  external: z.record(z.string(), seedExternalSkillSchema).exactOptional(),
  // Sparse: an agent with nothing to say has no entry. Presence is not an
  // install — assignments and `on: true` decide that.
  agents: z.record(z.string(), seedAgentSchema),
})

export type SeedModel = z.infer<typeof seedModelSchema>
export type SeedEffort = z.infer<typeof seedEffortSchema>
export type SeedLoadState = z.infer<typeof seedLoadStateSchema>
export type SeedScope = z.infer<typeof seedScopeSchema>
export type SeedSkill = z.infer<typeof seedSkillSchema>
export type SeedAgent = z.infer<typeof seedAgentSchema>
export type SeedSkillTree = z.infer<typeof seedSkillTreeSchema>
export type SeedExternalSkill = z.infer<typeof seedExternalSkillSchema>
export type SeedPayload = z.infer<typeof seedPayloadSchema>

/**
 * Project skills never reach global sub-agents; global skills reach any. A
 * global sub-agent is seen from every project, and a project skill is not.
 * The one definition: the CLI and the editor both read it from here.
 */
export const isSeedScopePairWritable = (
  skillScope: SeedScope,
  agentScope: SeedScope
) => !(skillScope === "project" && agentScope === "global")

export const seedAgentScope = (entry: SeedAgent | undefined): SeedScope =>
  entry?.scope ?? DEFAULT_SELECTION_OPTIONS.scope

export type UnwritableSeedAssignment = { skillId: string; agent: string }

// An assignment naming a sub-agent pinned off installs nothing, as the CLI's
// decode treats it.
const isSwitchedOff = (entry: SeedAgent | undefined) => entry?.on === false

const isUnwritablePair = (
  agents: SeedPayload["agents"],
  skillScope: SeedScope,
  agent: string
): boolean => {
  const entry = agents[agent]
  if (isSwitchedOff(entry)) return false
  return !isSeedScopePairWritable(skillScope, seedAgentScope(entry))
}

/**
 * Every `(skill, sub-agent)` pair in this payload that has nowhere to be
 * written. Without a catalogue an unknown sub-agent reads as one resting at
 * global, so the refusal built on this belongs at the minting end only.
 */
export const unwritableSeedAssignments = (
  payload: SeedPayload
): UnwritableSeedAssignment[] =>
  Object.entries(payload.skills).flatMap(([skillId, skill]) =>
    Object.keys(skill.assignments)
      .filter((agent) => isUnwritablePair(payload.agents, skill.scope, agent))
      .map((agent) => ({ skillId, agent }))
  )

/**
 * The payload as something that can be installed. A second schema rather than
 * a tightening of `seedPayloadSchema`: minting refuses an unwritable pair, while
 * reading stays lenient so the editor can open an existing link and repair it.
 */
export const installableSeedPayloadSchema = seedPayloadSchema.superRefine(
  (payload, ctx) => {
    for (const { skillId, agent } of unwritableSeedAssignments(payload)) {
      ctx.addIssue({
        code: "custom",
        path: ["skills", skillId, "assignments", agent],
        message: `a project-scoped skill has nowhere to be written on '${agent}', which rests at global scope`,
      })
    }
  }
)
