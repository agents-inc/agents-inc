# Apply manifest — CLI-389 wave 2 (B5 api-core + B12 shared-meta), verified 2026-08-07

Everything below is settled and does NOT wait on the owner's api-data split decision
(`OWNER-DECISION-api-data-split.md`; B6 still contributes zero rules). Sources: the amended
`B5-api-core.md` and `B12-shared-meta.md` manifest rows, every one sustained (five with
amendments applied) or overturned-and-replaced by `verify-B5-B12.md`. Unlike wave 1, this wave
spans **two repositories**: rules and categories change in this repo
(`packages/cli/src/cli/lib/configuration/`), category _membership_ changes in the skills repo
(`/home/vince/dev/skills` — diffs land in agents-inc/skills). Surfaces: **default-rules.ts**
(5 `requires` additions + 1 `requires` edit), **default-categories.ts** (1 category deletion,
2 category additions, 2 description re-cuts, order renumber), **5 skills-repo
`metadata.yaml` `category:` edits**, **default-stacks.ts** key moves, then the generation
round and the test corrections that must ride it.

Explicitly NOT in this wave: any B6/api-data change (owner decision pending); **deletion of any
conflict group** — `{hono, express, fastify, elysia, nestjs}` (default-rules.ts:35-38),
`{turborepo, nx}` (67-70), `{biome, eslint-prettier}` (71-74), and every other group belong to
decision 2 Phase C — this wave only makes the first three wholly-inside-exclusive so they die
free THEN; the `compatibleWith` deletions (decision 4a owns those, including clerk's parity
entry at 208-211); the `api-api` → `api-framework` rename (recorded as backlog by B5 M9 —
deliberately not now; this wave _vacates_ the target id, which is what makes the future rename
clean); the requires-closure in `packages/matrix` (EDITOR-11); the skills-repo **content**
fixes (nextauth's four over-claim surfaces including the picker-facing `metadata.yaml`
`usageGuidance`, git-hooks' biome lint-staged variant — B12 F5, web-reviewing's neutral-a11y-core
extraction — B12 F3); the B6 split handoff and all other Phase C work.

## Ordering constraints (hard)

1. **Splits and the merge land BEFORE any conflict-group deletion ever happens — across waves.**
   The two B12 splits and the elysia move are exactly what make `{turborepo, nx}`,
   `{biome, eslint-prettier}`, and group #7 `{hono, express, fastify, elysia, nestjs}`
   wholly-inside-exclusive. The groups become redundant only AFTER this wave lands; they are NOT
   deleted now — they die in Phase C cleanup (decision 2 owns the deletions). Deleting any of
   them before its split/move lands would open a fenceless window.
2. **The Elysia merge is one atomic slice**: the skills-repo metadata edit + the
   `default-categories.ts` block deletion + the regen + the five test-file corrections
   (including the two fixtures wrongly mapping _hono_) must ride together — after the schema
   regen, `"api-framework"` is an invalid enum and the stale fixtures fail the build (B5 F2/M4).
3. **The B12 splits are likewise one slice each side of the repo boundary**: the four
   skills-repo `category:` edits, the two new category definitions, the `default-stacks.ts` key
   moves, and the regen must land together — `default-stacks.ts` groups skills under category
   keys, and a moved skill under a stale key is exactly what
   `consumer-stacks-matrix.integration.test.ts` exists to catch.
4. **The six rule changes are window-free** and independent of the category work: five are new
   fences (tightening from nothing) and the better-auth edit tightens an existing rule — they
   may land first or in the same change, in any order. No multi-hop closure hazard: every rule
   names its direct target only (EDITOR-11 unaffected).

## default-rules.ts — 5 additions + 1 edit to the requires block

House shape (matches the existing entries, e.g. `better-auth-drizzle-hono` at default-rules.ts
414-418): multi-line object `{ skill, needs, needsAny?, reason }`. One-line forms below carry
the exact content; reformat to the file's multi-line style. Plain `needs` with multiple members
is AND semantics; `needsAny: true` makes the list an OR.

### B5 — api core (3 additions + 1 edit)

| #   | change (exact content)                                                                                                                                                                                                                                                                                                               | source row                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADD `{ skill: "mercurius", needs: ["fastify"], reason: "Mercurius is a Fastify plugin — registered via app.register on a Fastify instance" }`                                                                                                                                                                                        | B5 mercurius — closes the live bug (hono + mercurius validates today); composes with the `api-api` radio into the decision-2 re-key shape                                                                                                                                                                                                                                                                                                                                    |
| 2   | ADD `{ skill: "nextauth", needs: ["nextjs"], reason: "Skill teaches the next-auth (Next.js) package — auth.ts, handlers, middleware, Server Components" }`                                                                                                                                                                           | B5 nextauth — the reason keys the TAUGHT SURFACE, never "NextAuth is Next.js-only" (false — the library ships four first-party framework packages; B5 Contradicts §1)                                                                                                                                                                                                                                                                                                        |
| 3   | **EDIT** the existing rule at default-rules.ts:414-418: `needs: ["drizzle"]` → `needs: ["drizzle", "hono"]`; reason → `"Skill teaches Better Auth with the Drizzle adapter, mounted via Hono routes and typed Hono middleware"`                                                                                                      | B5 better-auth-drizzle-hono — an EDIT, not a second rule: plain `needs` is AND semantics, so one rule expresses drizzle-AND-hono. The shadcn-ui two-rule precedent B5 cited exists only because shadcn mixes a `needsAny` OR-group with a plain AND; both members here are plain ANDs. **Supersedes the batch's "add a second rule" phrasing.** The reason stays a description, not a quotation — the body never names Hono (verify item 5: identified by API shape + slug). |
| 4   | ADD `{ skill: "bullmq", needs: ["redis", "upstash"], needsAny: true, reason: "BullMQ drives a Redis-compatible server over ioredis/TCP (blocking commands, Lua scripts, streams); Upstash documents BullMQ over its TCP endpoint — its REST client cannot drive BullMQ, and the skill carries its own ioredis connection factory" }` | B5 bullmq — ACCEPTED-handoff form (verify item 6 overturn); the `needs ["redis"]`-only form is superseded. **vercel-kv deliberately excluded** (product sunset Dec 2024; its body steers to `@upstash/redis`). The Upstash Pay-As-You-Go polling-cost caveat is advice/D-306, not fence.                                                                                                                                                                                     |

### B12 — shared + meta (2 additions)

| #   | change (exact content)                                                                                                                                             | source row                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | ADD `{ skill: "composable-components", needs: ["react"], reason: "Composition patterns are React surface — base-ui useRender/mergeProps, forwardRef, JSX parts" }` | B12 composable-components — React-bound by content throughout (verify item 16)                                                               |
| 6   | ADD `{ skill: "web-reviewing", needs: ["react"], reason: "Checklist self-scopes to React diffs — rules of hooks, dependency arrays, React.memo" }`                 | B12 web-reviewing — grounded on self-scope + React-keyed majority, the eas precedent (verify item 17), NOT on "zero other-framework content" |

The `needs` members are slugs exactly as the batch rows use them; verify each against the
generated slug→id map before landing (`packages/cli/src/cli/types/generated/source-types.ts`).
Reasons are drafted here in house style — content is load-bearing, exact wording is not.
Consistency gate (B5 F5 / B12 M7): no rule's target sits in its subject's own category —
fastify/hono/nextjs in exclusive `api-api`/`web-framework`, redis+upstash both in exclusive
`api-kv`, react in `web-framework`; subjects sit in `api-graphql`, `api-auth`, `api-queue`,
`meta-design`, `meta-reviewing`. All hold.

## default-categories.ts — 1 deletion, 2 additions, 2 re-cuts

| category             | edit                                                                                                                                                                                                              | source                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-framework`      | **DELETE** the whole block at 377-386 INCLUDING the NOTE comment ("may be a duplicate of api-api")                                                                                                                | B5 group #7 merge — kills the duplicate "API Framework" header (QA sweep 2026-07-29) and the false required-category advisory for elysia projects |
| `shared-task-runner` | **ADD** — `id: "shared-task-runner"`, displayName "Task Runner" ("Monorepo Orchestrator" acceptable), description naming Turborepo + Nx, `domain: "shared"`, **`exclusive: true`**, `required: false`             | B12 group #15 — membership arrives via the skills-repo edits below                                                                                |
| `shared-lint`        | **ADD** — `id: "shared-lint"`, displayName "Lint & Format", description naming Biome + ESLint/Prettier, `domain: "shared"`, **`exclusive: true`**, `required: false`                                              | B12 group #16                                                                                                                                     |
| `shared-monorepo`    | description re-cut: "Monorepo tooling (Turborepo, Nx)" → "Workspace management (pnpm workspaces)" — the current text names the two members that leave                                                             | B12 M2                                                                                                                                            |
| `shared-tooling`     | description re-cut: "ESLint, Prettier, TypeScript, Vite" → name the residue (TypeScript config, git hooks, changesets, stack detection) — current text names the two leaving members, and Vite was never a member | B12 F4/M2                                                                                                                                         |
| shared domain orders | renumber: currently shared-monorepo 1 / shared-tooling 2 / shared-security 3 (default-categories.ts:585-611); slot the two new exclusive categories into the shared sequence                                      | B12 M2                                                                                                                                            |
| `api-api`            | **NO CHANGE** — stays `exclusive: true, required: true`; elysia joins it via its metadata edit, and post-merge an elysia pick satisfies the required category                                                     | B5 group #7                                                                                                                                       |

## Skills repo — 5 metadata.yaml category edits (land in agents-inc/skills, NOT this repo)

All five are single-line `category:` edits at `/home/vince/dev/skills/src/skills/`. Zero
directory renames, zero skill-id changes (id/category decoupling precedent: `api-framework-*`
skills under `api-api`; the test-pinned stack-detect "id-prefix liar").

| file                                                      | edit                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/skills/api-framework-elysia/metadata.yaml`           | `category: api-framework` → `api-api` — the only skills-repo occurrence of the dying id; zero stacks reference elysia |
| `src/skills/shared-monorepo-turborepo/metadata.yaml`      | `category: shared-monorepo` → `shared-task-runner`                                                                    |
| `src/skills/shared-monorepo-nx/metadata.yaml`             | `category: shared-monorepo` → `shared-task-runner`                                                                    |
| `src/skills/shared-tooling-biome/metadata.yaml`           | `category: shared-tooling` → `shared-lint`                                                                            |
| `src/skills/shared-tooling-eslint-prettier/metadata.yaml` | `category: shared-tooling` → `shared-lint`                                                                            |

## default-stacks.ts — key moves (this repo)

Every stack grouping turborepo or nx under a `"shared-monorepo"` key moves that entry under
`"shared-task-runner"`; every stack grouping biome or eslint-prettier under `"shared-tooling"`
moves that entry under `"shared-lint"`. Measured surface (verified): **11 `"shared-monorepo"`
keys and 48 `"shared-tooling"` keys** — audit every one; skill-id VALUES are unchanged
throughout. Elysia appears in zero stacks — nothing to move for the merge.

## Generation round (this repo, after ALL edits above)

`generate:types` (both matrices — `packages/cli/src/cli/types/generated/matrix.ts` and the
vendored `packages/matrix/src/vendor/generated/matrix.ts` — plus both `source-types.ts` category
unions), the matrix-package regen, and **`generate:schemas`** (`metadata.schema.json`'s category
enum; `generate:schemas:check` gates release — the verify-B6 5.3 lesson B5 M3 and B12 M4 both
absorbed), plus a hand edit to `project-config.schema.json`, which carries the same enum, is
emitted by no generator and is covered by no check. Post-regen `"api-framework"` is an
invalid enum everywhere, which is why the test corrections below ride the same slice.

## Test corrections (same slice as the regen)

From B5 M4 — five files, including the two that wrongly map hono TODAY:

- `e2e/fixtures/project-builder.ts:89` — maps **hono** to `"api-framework"`: factually wrong
  today, schema-invalid post-regen. Correct the fixture to `"api-api"` (F2) — corrected, not
  just re-pointed.
- `local-installer.test.ts:1329/1351/1555/1574/1608` — the same hono-mapping defect among the
  five sites; same correction.
- `marketplace-generator.test.ts:333-358`
- `scripts/generate-source-types.test.ts:517/532`
- `packages/matrix/src/read-model/preload-defaults.test.ts:67` — drop `"api-framework"` from
  the explicit `FRAMEWORK_CATEGORIES` set; **`"api-api"` STAYS** (verify item 1).

From B12 M5/M6 — audit greps for the two moving-member category ids:
`assignment-defaults.test.ts` / `preload-defaults.test.ts` (the stack-detect "id-prefix liar"
tests reference `shared-tooling` semantics — stack-detect stays there, so likely unaffected;
re-read at apply time), plus `test-fixtures.ts`, `mock-matrices.ts`, `skill-factories.ts`,
`default-categories.test.ts`, `consumer-stacks-matrix.integration.test.ts`,
`marketplace-generator.test.ts`, `build-step-logic.test.ts`, `stack-plugin-compiler.test.ts`,
`wizard-store.test.ts` — audit each for whether it names the category of a moving skill.

## Docs + release notes

- `.ai-docs/reference/features/configuration.md:196,213` — category table + the duplicate-flag
  note the merge retires.
- Release-notes line (B5 M5): persisted `domainSelections.api["api-framework"]` becomes
  schema-invalid; pre-1.0, no shim — the fix is re-running the wizard.
- Flagged during synthesis, named by neither batch: persisted `domainSelections.shared`
  selections stay schema-valid after the splits (both old keys survive as categories), but a
  saved turborepo/nx or biome/eslint-prettier pick sits under a key whose category no longer
  contains that skill. Audit wizard-state restore at apply time; if it misbehaves, it is a
  release-notes line of the same shape as M5.

## Backlog / records that ride this wave (no code)

- **B5 M9**: the `api-api` → `api-framework` rename + the `isFrameworkCategory` helper as its
  own backlog item — this wave vacates the target id (98-vs-0 stack-key measurement decided the
  direction).
- **D-306 lines**: Upstash Pay-As-You-Go polling-cost caveat (advice, not fence); the
  steady-state Biome + bare-ESLint hybrid ("unrepresentable while the ESLint skill bundles
  Prettier"; reopen trigger: a bare `eslint` catalog skill); changesets ↔ `nx release` overlap
  (B12 F8); the Upstash-over-TCP vendor nuance now partially encoded in rule 4's reason.
- **Skills-repo content slice** (separate from the five category edits above): nextauth's four
  over-claim surfaces incl. the picker-facing `usageGuidance` (B5 F3); git-hooks' biome
  lint-staged variant (B12 F5); web-reviewing's extractable neutral a11y core (B12 F3); the
  auth coverage gap for express/fastify/nestjs/elysia stacks (B5 F4).
