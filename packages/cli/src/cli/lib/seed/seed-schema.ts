import { z } from "zod";

/**
 * VENDORED from `packages/matrix/src/seed.ts` — keep in sync.
 *
 * The wire contract for configs shared from agentsinc.sh. The web app POSTs a payload to the
 * config store and gets a short id back; `npx agents-inc init --from <id>` fetches that id and
 * validates it with this same schema.
 *
 * The reason for copying rather than depending has expired. It was that a shared package spanning
 * two repositories would need publishing and a release step for forty lines of Zod that no consumer
 * had exercised. The repositories merged on 2026-08-03, so `packages/matrix` is now a workspace
 * sibling: `@workspace/matrix` could be depended on directly, with no publish and no versioning.
 *
 * What keeps the copy is inertia, not that argument — nothing has re-examined it since the merge,
 * and this package deliberately ships to npm while `@workspace/matrix` is private, so a dependency
 * would have to be bundled rather than declared. De-duplicating is D-239's job, and D-239's premise
 * changed with the merge too.
 */

/**
 * Bump when the payload shape changes. Only the current version is accepted: pre-1.0 policy is to
 * fail a stale id loudly rather than migrate it, so what installs is always what was shared.
 *
 * v3 gave the sub-agent its own scope. An additive-optional field would not normally need a
 * version, but this schema strips what it does not declare — so the version is what tells a
 * sharing app the field actually survives the trip.
 */
export const SEED_VERSION = 3;

export const seedModelSchema = z.enum(["opus", "fable", "sonnet", "haiku"]);
export const seedEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
export const seedLoadStateSchema = z.enum(["lazy", "preloaded"]);

export const seedSkillSchema = z.object({
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  /** Sub-agent id -> load state; presence is assignment. */
  assignments: z.record(z.string(), seedLoadStateSchema),
});

/**
 * What a shared configuration says about one sub-agent. Every field is optional because each says
 * something different on its own: `on: true` is the only way a sub-agent with no skills of its own
 * can travel, while model/effort are overrides for an agent an assignment already selects.
 */
export const seedAgentSchema = z.object({
  /** Explicitly switched on (bare) or off. Absent means "whatever the assignments imply". */
  on: z.boolean().optional(),
  model: seedModelSchema.optional(),
  effort: seedEffortSchema.optional(),
  /**
   * Which `.claude/agents` directory this sub-agent's front-matter is written to. Absent means
   * `project` — the CLI's own default, so a resting choice never has to travel.
   */
  scope: z.enum(["project", "global"]).optional(),
});

/**
 * Ids are full catalog slugs, never positional indices, so a payload survives catalog churn:
 * consumers warn and skip unknown ids rather than failing the whole decode.
 */
export const seedPayloadSchema = z.object({
  v: z.literal(SEED_VERSION),
  /**
   * Diagnostics only. A mismatch with this CLI's matrix must never fail a decode — it explains
   * why some ids were skipped, it does not decide whether to try.
   */
  matrixVersion: z.string(),
  stackId: z.string().nullable(),
  /** Sparse — presence is selection. `remembered` never leaves the browser. */
  skills: z.record(z.string(), seedSkillSchema),
  /** Sparse — an agent with nothing to say has no entry. */
  agents: z.record(z.string(), seedAgentSchema),
});

export type SeedModel = z.infer<typeof seedModelSchema>;
export type SeedEffort = z.infer<typeof seedEffortSchema>;
export type SeedLoadState = z.infer<typeof seedLoadStateSchema>;
export type SeedSkill = z.infer<typeof seedSkillSchema>;
export type SeedAgent = z.infer<typeof seedAgentSchema>;
export type SeedPayload = z.infer<typeof seedPayloadSchema>;
