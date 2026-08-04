# D-239 — Web UI: extract a shared matrix/config-types package

> **Premise changed 2026-08-03:** the two repositories merged. The web UI is no longer "a new,
> separate repo" — it is `apps/web` in this monorepo, and the shared package it was to depend on
> already exists as `packages/matrix` (`@workspace/matrix`, private, vendoring the CLI catalog via
> `scripts/generate-from-cli.mjs`). Decision 1 below is therefore obsolete as written, and decision
> 2's cost model is gone with it: a workspace dependency needs no publishing, no versioning and no
> release step, which was the whole reason the boundary was deferred. What survives is the actual
> open work — `AGENT_DEFINITIONS` is still not generated, the config wire-format types are still
> duplicated (`src/cli/lib/seed/seed-schema.ts` vendors `packages/matrix/src/seed.ts` by hand), and
> nothing has re-examined either since the merge. Left open deliberately; the shape of the fix is a
> decision for the author, not a mechanical consequence of the merge.

## Goal

Build a browser-based React web UI (periodic-table-style skill grid) that lets a user select skills, assign them to sub-agents (preloaded per-agent, scope per-agent), and produce a config. A new CLI command (not yet designed) will later consume that config to drive install. This doc only covers the decisions needed to start: what lives where, and what data crosses the repo boundary.

## Decisions made

1. **Web UI lives in a new, separate repo** (not `web/` inside this CLI repo). This repo is scoped to the CLI; a browser app has an unrelated build/deploy story (Vite, hosting). New repo under the existing GitHub org.
2. **A shared package is the boundary**, not duplicated code. Working name: `@<org>/skills-matrix`. Both this CLI repo and the new web repo depend on it.
3. **How the "unique ID" / install command actually resolves a config is explicitly deferred.** Not deciding self-contained-ID vs. hosted backend vs. gist vs. local-file-export yet. Nothing below depends on that choice.

## What goes in the shared package

| Piece                    | Status                          |
| ------------------------ | ------------------------------- |
| `BUILT_IN_MATRIX`        | Ready to move as-is             |
| Generated string unions  | Ready to move as-is             |
| Config wire-format types | Pure types — move as-is         |
| `AGENT_DEFINITIONS`      | Gap — needs new generation step |

**`BUILT_IN_MATRIX`** (skills, categories, relationships, stacks) — `src/cli/types/generated/matrix.ts`, generated via `bun run generate:types`. Already plain serializable data.

**Generated string unions** — `SkillId`, `SkillSlug`, `Category`, `Domain`, `AgentName` in `src/cli/types/generated/source-types.ts`. Already generated, plain data.

**Config wire-format types** — `SkillConfig`, `AgentScopeConfig`, `SkillAssignment`, `ProjectConfig` in `src/cli/types/config.ts`, `skills.ts`, `agents.ts`. Pure types, no CLI logic.

**`AGENT_DEFINITIONS`** (title, description, domain, tools per agent) — not generated today. Built-in agents ship as template files read from disk at runtime (`src/cli/lib/agents/agent-fetcher.ts`). Needs a new generation step, mirroring `BUILT_IN_MATRIX`, so the web UI has agent metadata as data instead of files.

The fields the web UI needs are already modeled, just not exported as a shared contract:

- Per-agent preload: `SkillAssignment.preloaded` — lives per `(agent, skill)` pair inside `StackAgentConfig`, not globally on the skill.
- Ejected vs. plugin: `SkillConfig.source` (`"eject" | <marketplace name>`), currently typed as loose `string`.
- Local vs. global scope: `SkillConfig.scope` / `AgentScopeConfig.scope` (`"project" | "global"`).

## Out of scope for this doc

- The unique-ID/storage mechanism for sharing a generated config.
- The new CLI install command's design.
- Any implementation — this is a data-contract/repo-layout decision record only.

## Next steps

1. Generate `AGENT_DEFINITIONS` the same way `BUILT_IN_MATRIX` is generated (closes the gap above).
2. Carve `@<org>/skills-matrix` out of `src/cli/types/{config,skills,agents,matrix}.ts` and `generated/*` — types + generated data only, zero CLI runtime logic.
3. Publish it; point the new web repo at it.
4. Revisit the ID/storage decision once the web UI has something real to persist.
