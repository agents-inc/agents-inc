import { z } from "zod"

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
  // Where the skills below are fetched from, in the form `--marketplace` takes
  // one: `github:acme/skills`, a URL, a local path. The ref alone — the name
  // its manifest gives it is read from the fetched marketplace.json, so
  // carrying that too would let a payload disagree with the repository it
  // names. Absent is the default public catalogue, which is why a payload that
  // installs from it looks exactly as it did before this field existed.
  marketplace: z.string().optional(),
  // Sparse — presence is selection, exactly like the web store. `remembered`
  // is deliberately absent: deselected setup never leaves the browser.
  skills: z.record(z.string(), seedSkillSchema),
  // Skill id → its whole directory, for the ids above that no catalogue can
  // resolve. Keyed by the same id `skills` uses, so a selection reads one map
  // whichever kind of skill it names. Absent is the ordinary case — a payload
  // built from the catalogue alone — which is why one looks exactly as it did
  // before content travelled. Content is the expensive part of a payload, so an
  // added skill nobody selected has no entry here either.
  external: z.record(z.string(), seedExternalSkillSchema).optional(),
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
export type SeedSkillTree = z.infer<typeof seedSkillTreeSchema>
export type SeedExternalSkill = z.infer<typeof seedExternalSkillSchema>
export type SeedPayload = z.infer<typeof seedPayloadSchema>
