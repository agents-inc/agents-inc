import { z } from "zod"

import { DEFAULT_SELECTION_OPTIONS } from "./read-model/selection-defaults"

// The wire contract for shared configs: the web app POSTs this payload to the
// config store (Cloudflare Worker + KV) and gets a short id back; `agents-inc
// init --from <id>` fetches and validates it with this same schema. This file is
// the source of truth, and every consumer IMPORTS it — the CLI through
// `@workspace/matrix/seed`, which tsup inlines at build time, plus the editor,
// the worker and the API mocks. There is no vendored copy of this schema: the
// `generate:matrix` script that vendors into `packages/matrix/src/vendor/` runs
// the other way, copying the CLI's own types here, and does not emit this file.

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
// be needed for — but a consumer parsing with an older build of this schema
// strips what it does not know, so the version is what says the field is
// really there.
//
// v4 gave the payload the marketplace its skills are fetched from. An id
// already says whose skill it is — a marketplace's name is the author-time
// prefix on every id it ships — but no id can say WHERE that marketplace
// lives, and a payload silent about it has the receiver install its own
// `acme-web-frontend` rather than acme's. One ref at the top covers it,
// because an install reads one marketplace. Absent still means the default
// public catalogue, which is every payload the web app mints.
//
// v5 made the payload carry CONTENT. Every id above it is resolved by the
// receiver against a catalogue it already has; a skill added from outside
// answers to no catalogue, so its whole directory travels inline (owner ruling,
// 2026-08-16). That is what makes a shared id self-contained: `--from` reaches
// into no third-party repository at install time, and two people installing one
// id get identical bytes.
//
// The bump is what stops that being a silent change. `external` is additive-
// optional, so a consumer built against v4 would STRIP it and install a
// configuration quietly missing the skills the sharer picked — the same defect
// the field exists to fix, moved one step later. The literal below refuses
// instead. Pre-release policy is discard-don't-migrate, so ids minted under v4
// stop decoding; that is deliberate, and the message a consumer prints for it
// is what has to name the fix.
export const SEED_VERSION = 5

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

// Where a thing is written: under one project's `.claude`, or the user's own
// `~/.claude`. Named once because a skill and a sub-agent each carry one and
// the rule below compares the two — three spellings of one vocabulary is what
// let the surfaces disagree about it.
export const seedScopeSchema = z.enum(["project", "global"])

// A skill says where it installs and which agents carry it, and nothing about
// how they think.
export const seedSkillSchema = z.object({
  install: z.enum(["plugin", "eject"]),
  scope: seedScopeSchema,
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
  on: z.boolean().exactOptional(),
  model: seedModelSchema.exactOptional(),
  effort: seedEffortSchema.exactOptional(),
  // Where this agent's front-matter is written: the project, or the user's own
  // ~/.claude. Absent means the shared selection default — `global`, spelled
  // once in `DEFAULT_SELECTION_OPTIONS` — so the resting choice never travels,
  // exactly as a resting model does not.
  scope: seedScopeSchema.exactOptional(),
})

// ── External skills ──────────────────────────────────────────────────────

/**
 * The most one external skill's directory may weigh, in UTF-8 bytes.
 *
 * Measured rather than guessed. The largest real documentation skill on the
 * allowlisted repositories is `obra/superpowers/skills/brainstorming` at 78 KB
 * across 8 files; our own run 60-75 KB across 3-7. Three of them in one payload
 * is 161 KB raw and 48 KB gzipped, against 1.9 KB for the same selection before
 * content travelled — so a cap several times the largest real skill still holds
 * a realistic configuration many times over.
 *
 * What it refuses is the other shape entirely: `anthropics/skills/skills/docx`
 * is 1.1 MB across 61 files, almost all of it XML schemas for a Python library
 * that happens to sit under a SKILL.md. Inlining one of those into a link
 * somebody pastes into a terminal is what this number exists to prevent.
 */
export const MAX_EXTERNAL_SKILL_BYTES = 262_144

/** The file Claude Code reads to learn a skill exists at all. */
const SKILL_MANIFEST = "SKILL.md"

// UTF-8, because that is what lands in KV and on disk. A tree of multi-byte
// characters weighs more than its length says, and the cap is about weight.
const treeBytes = (files: Record<string, string>) => {
  const encoder = new TextEncoder()
  return Object.values(files).reduce(
    (total, text) => total + encoder.encode(text).length,
    0
  )
}

/**
 * A skill's whole directory, keyed by path relative to it.
 *
 * The whole directory and not SKILL.md alone (owner, 2026-08-16): a skill is
 * `SKILL.md`, the `metadata.yaml` beside it, and every `reference/` or
 * `examples-*.md` file under it. Carrying the manifest alone would install
 * something that loads and then cannot do what it says.
 *
 * A record rather than a list, so a path cannot appear twice by construction.
 * Nesting lives in the key — `reference/api.md` — which keeps the shape flat
 * while the tree it describes is not.
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
 * One skill added from outside whichever catalogue the payload names.
 *
 * It is a real catalogue entry on the sending side and has to become one on the
 * receiving side, so everything a catalogue entry needs travels: the name, the
 * description, and the category the user CONFIRMED at add time (CLI-412 — the
 * category is a decision, never derived from the repository). `repo` and `path`
 * are provenance rather than a resolution step: the bytes are already here, and
 * these are what let a reader go and look at where they came from.
 */
export const seedExternalSkillSchema = z.object({
  displayName: z.string().min(1),
  description: z.string(),
  // A category of the catalogue this payload names — the placement the user
  // confirmed. Without it the skill has nowhere to render and no sub-agent
  // reach, which is the whole difference between a catalogue entry and an
  // orphan section.
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
  // The sentence the sharer's config records about itself, which on the CLI
  // side is the description of whatever stack was applied. It travels because
  // `stackId` deliberately does not: a saved config records a stack's
  // EXPANSION and never the id it came from, so the receiver has no id to
  // resolve one out of and the line is simply lost.
  //
  // Carrying the id instead would be worse rather than equivalent. A resolvable
  // stack id does exactly two things on the way in — it supplies this
  // description, and it overlays the stack YAML's own `preloaded` flags — and
  // the assignments above already carry per-(skill, sub-agent) load state in
  // full, so the second is redundant. What the id would ADD is the stack's
  // whole roster: the receiving install spreads the loaded stack first and lets
  // the saved stack win per agent, so a stack sub-agent the sharer REMOVED
  // comes back wholesale. Absent means a config that describes itself with
  // nothing, which is every payload the web app mints.
  description: z.string().exactOptional(),
  // Where the skills below are fetched from, in the form `--marketplace` takes
  // one: `github:acme/skills`, a URL, a local path. The ref alone — the name
  // its manifest gives it is read from the fetched marketplace.json, so
  // carrying that too would let a payload disagree with the repository it
  // names. Absent is the default public catalogue, which is why a payload that
  // installs from it looks exactly as it did before this field existed.
  marketplace: z.string().exactOptional(),
  // Sparse — presence is selection, exactly like the web store. `remembered`
  // is deliberately absent: deselected setup never leaves the browser.
  skills: z.record(z.string(), seedSkillSchema),
  // Skill id → its whole directory, for the ids above that no catalogue can
  // resolve. Keyed by the same id `skills` uses, so a selection reads one map
  // whichever kind of skill it names. Absent is the ordinary case — a payload
  // built from the catalogue alone — which is why one looks exactly as it did
  // before content travelled. Content is the expensive part of a payload, so an
  // added skill nobody selected has no entry here either.
  external: z.record(z.string(), seedExternalSkillSchema).exactOptional(),
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
export type SeedScope = z.infer<typeof seedScopeSchema>
export type SeedSkill = z.infer<typeof seedSkillSchema>
export type SeedAgent = z.infer<typeof seedAgentSchema>
export type SeedSkillTree = z.infer<typeof seedSkillTreeSchema>
export type SeedExternalSkill = z.infer<typeof seedExternalSkillSchema>
export type SeedPayload = z.infer<typeof seedPayloadSchema>

/**
 * Project skills never reach global sub-agents; global skills reach any.
 *
 * A global sub-agent's front-matter is written to `~/.claude`, where every
 * project on the machine sees it, while a project-scoped skill is installed
 * under one project's `.claude` — so a global sub-agent carrying a project
 * skill names something that does not exist from anywhere else.
 *
 * This is the ONE definition. The CLI's `isScopePairCompatible` and the
 * editor's roster marker both read it from here rather than restating it: the
 * rule lived as three verbatim copies across three workspaces, which is exactly
 * the drift a shared contract exists to prevent.
 */
export const isSeedScopePairWritable = (
  skillScope: SeedScope,
  agentScope: SeedScope
) => !(skillScope === "project" && agentScope === "global")

/**
 * Where a sub-agent's front-matter is written, for an entry that may not exist.
 *
 * The `agents` map is sparse, so an absent entry — and an entry that names no
 * scope — rests on the shared selection default. Read from
 * `DEFAULT_SELECTION_OPTIONS` rather than written out, because a default the
 * wire and the consumer spell differently is the same defect as two copies of
 * the rule above.
 */
export const seedAgentScope = (entry: SeedAgent | undefined): SeedScope =>
  entry?.scope ?? DEFAULT_SELECTION_OPTIONS.scope

/** A `(skill, sub-agent)` assignment the config model has nowhere to write. */
export type UnwritableSeedAssignment = { skillId: string; agent: string }

// An assignment naming a sub-agent the sharer pinned OFF installs nothing, so
// it is not a pair at all and cannot be an unwritable one. It leaves before the
// scope question is asked, exactly as the CLI's decode drops it — a wire
// stricter than the consumer it protects is its own kind of drift.
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
 * written. Both halves of each are named because neither alone says what to
 * change: the skill can move to global scope, or the sub-agent can be pinned to
 * the project, and only the sharer knows which they meant.
 *
 * **What this cannot see, and why the refusal built on it belongs at the
 * MINTING end rather than at every read.** An assignment naming a sub-agent the
 * RECEIVER does not know is the same bytes on the wire as one naming a
 * sub-agent resting at global. Only a catalogue tells the two apart, and a wire
 * schema has none — so a consumer that refused on this alone would turn a
 * sub-agent rename into a retroactive break of every link minted before it,
 * which is the leniency `seedToWizardResult` documents at length. The CLI keeps
 * its own catalogue-aware check for that reason; what it no longer keeps is its
 * own copy of the RULE.
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
 * The payload as something that can be INSTALLED, which is a stronger claim
 * than being well-formed.
 *
 * A SECOND schema rather than a tightening of `seedPayloadSchema`, and the
 * split is the whole design. Minting and reading want different answers to the
 * same question:
 *
 *   - **Minting** (the worker's POST, and any client that assembles a payload)
 *     should refuse the pair outright, so a link that cannot be installed is
 *     never created and never pasted anywhere.
 *   - **Reading** must stay lenient. Links holding the pair are already out in
 *     the world; the editor opens one, marks the offending row and fixes it in
 *     a single click (EDITOR-08), and `GET /configs/:id` re-validates what it
 *     serves — so a base schema that refused would turn every such id into a
 *     500 with no way back, and delete the repair flow that exists to rescue
 *     them.
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
