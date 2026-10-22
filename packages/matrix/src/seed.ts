import { z } from "zod"

import { DEFAULT_SELECTION_OPTIONS } from "./read-model/selection-defaults"

// The shared-config wire contract: the editor POSTs it, `init --from` reads it.

// Bump on any shape change; only this exact version is accepted.
export const SEED_VERSION = 7

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
  // Sub-agent id → load state; presence is assignment.
  assignments: z.record(z.string(), seedLoadStateSchema),
})

// `on: true` lets an agent with no skills travel; a model alone does not switch it on.
export const seedAgentSchema = z.object({
  on: z.boolean().exactOptional(),
  model: seedModelSchema.exactOptional(),
  // Not an enum: Codex retires ids; consumers drop ones they do not offer.
  codexModel: z.string().min(1).exactOptional(),
  effort: seedEffortSchema.exactOptional(),
  // Absent means `DEFAULT_SELECTION_OPTIONS.scope`.
  scope: seedScopeSchema.exactOptional(),
})

/** UTF-8 bytes: well above real documentation skills, well below code libraries. */
export const MAX_EXTERNAL_SKILL_BYTES = 262_144

const SKILL_MANIFEST = "SKILL.md"

const PATH_SEPARATOR = /[/\\]/

const PARENT_DIRECTORY = ".."

const treeBytes = (files: Record<string, string>) => {
  const encoder = new TextEncoder()
  return Object.values(files).reduce(
    (total, text) => total + encoder.encode(text).length,
    0
  )
}

// Both separators, as for ids. A `..` landing back inside is refused too: no real tree holds one.
const leavesItsDirectory = (key: string) =>
  key.includes("\0") || key.split(PATH_SEPARATOR).includes(PARENT_DIRECTORY)

/** A skill's directory, keyed by relative path (`reference/api.md`). */
export const seedSkillTreeSchema = z
  .record(z.string().min(1), z.string())
  .refine((files) => SKILL_MANIFEST in files, {
    message: `a skill directory must hold ${SKILL_MANIFEST}`,
  })
  .refine((files) => treeBytes(files) <= MAX_EXTERNAL_SKILL_BYTES, {
    message: `a skill directory may not exceed ${String(MAX_EXTERNAL_SKILL_BYTES)} bytes`,
  })
  // On the tree, not the key schema, which would replace the message with "Invalid key in record".
  .superRefine((files, ctx) => {
    for (const key of Object.keys(files).filter(leavesItsDirectory)) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message:
          "a skill directory's files must stay inside it, so no path may step through '..' or hold a null byte",
      })
    }
  })

/** A skill from outside the payload's catalogue; `repo` and `path` are provenance only. */
export const seedExternalSkillSchema = z.object({
  displayName: z.string().min(1),
  description: z.string(),
  // Confirmed by the user at add time, never derived.
  categoryId: z.string().min(1),
  // `owner/name`.
  repo: z.string().min(1),
  // The skill's directory (`skills/docx`), not its SKILL.md.
  path: z.string().min(1),
  files: seedSkillTreeSchema,
})

// Consumers warn and skip unknown ids rather than failing.
export const seedPayloadSchema = z.object({
  v: z.literal(SEED_VERSION),
  // Diagnostics only; a mismatch must not fail the decode.
  matrixVersion: z.string(),
  stackId: z.string().nullable(),
  // Travels instead of a stack id, which would reinstall the stack's whole roster.
  description: z.string().exactOptional(),
  // As `--marketplace` takes it; absent is the public catalogue.
  marketplace: z.string().exactOptional(),
  // Minted inside a project, whose run adds to the global install but changes nothing it holds.
  fromProject: z.literal(true).exactOptional(),
  // Presence is selection.
  skills: z.record(z.string(), seedSkillSchema),
  // For ids no catalogue can resolve.
  external: z.record(z.string(), seedExternalSkillSchema).exactOptional(),
  // Presence is not an install; assignments and `on: true` decide that.
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

/** A project skill cannot reach a global sub-agent, which every project sees. */
export const isSeedScopePairWritable = (
  skillScope: SeedScope,
  agentScope: SeedScope
) => !(skillScope === "project" && agentScope === "global")

export const seedAgentScope = (entry: SeedAgent | undefined): SeedScope =>
  entry?.scope ?? DEFAULT_SELECTION_OPTIONS.scope

export type UnwritableSeedAssignment = { skillId: string; agent: string }

const isUnwritablePair = (
  agents: SeedPayload["agents"],
  skillScope: SeedScope,
  agent: string
): boolean => {
  const entry = agents[agent]
  if (entry?.on === false) return false
  return !isSeedScopePairWritable(skillScope, seedAgentScope(entry))
}

/** Without a catalogue an unknown sub-agent reads as global, so refuse on this only when minting. */
export const unwritableSeedAssignments = (
  payload: SeedPayload
): UnwritableSeedAssignment[] =>
  Object.entries(payload.skills).flatMap(([skillId, skill]) =>
    Object.keys(skill.assignments)
      .filter((agent) => isUnwritablePair(payload.agents, skill.scope, agent))
      .map((agent) => ({ skillId, agent }))
  )

// C0, DEL and C1: a terminal acts on them wherever the directory is named. Read off the code unit,
// since a regex would need control characters in a class (`no-control-regex`).
const isControlCode = (code: number) =>
  code <= 0x1f || (code >= 0x7f && code <= 0x9f)

const holdsAControl = (id: string) =>
  Array.from(id, (character) => character.charCodeAt(0)).some(isControlCode)

// Windows separators too: an id minted on one machine is installed on another.
const namesOneDirectory = (id: string) =>
  id !== "" &&
  id !== "." &&
  id !== ".." &&
  !PATH_SEPARATOR.test(id) &&
  !holdsAControl(id)

/** A carried skill's id is the directory it is written into, so each must name exactly one. */
export const externalIdsNamingNoDirectory = (payload: SeedPayload): string[] =>
  Object.keys(payload.external ?? {}).filter((id) => !namesOneDirectory(id))

/** Minting refuses unwritable pairs; `seedPayloadSchema` stays lenient so the editor can repair old links. */
export const installableSeedPayloadSchema = seedPayloadSchema.superRefine(
  (payload, ctx) => {
    for (const { skillId, agent } of unwritableSeedAssignments(payload)) {
      ctx.addIssue({
        code: "custom",
        path: ["skills", skillId, "assignments", agent],
        message: `a project-scoped skill has nowhere to be written on '${agent}', which rests at global scope`,
      })
    }
    for (const id of externalIdsNamingNoDirectory(payload)) {
      ctx.addIssue({
        code: "custom",
        path: ["external", id],
        message:
          "a carried skill's id is the directory it is written into, so it must name exactly one directory and hold no control character",
      })
    }
  }
)
