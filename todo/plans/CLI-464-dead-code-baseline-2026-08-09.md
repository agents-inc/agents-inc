# CLI-464 — dead-code baseline — 2026-08-09

The first run of `bun run deps:dead` (knip 6.32.0) across all eleven workspaces, with every finding
spot-checked by grep before it was written down. **Nothing was deleted and no tracker row was
touched.** This document is the input to a future deletion round, not the round itself.

**Bottom line: 325 findings survive tuning.** 197 of them are one shape — a barrel `index.ts`
re-exporting a symbol that every caller imports from the source module instead. 35 are symbols with
no reference anywhere at all, and those are the deletion candidates worth opening a task for.

## How this was produced

| Element      | Value                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| Tool         | knip 6.32.0 (current major; `npm view knip dist-tags` → `latest: 6.32.0`)          |
| Where        | root devDependency, config at `knip.jsonc`, script `bun run deps:dead`             |
| Scope        | all eleven workspaces — `apps/*` and `packages/*` from the root `workspaces` field |
| Issue types  | knip's defaults: files, dependencies, unlisted, unresolved, exports, types, dupes  |
| Verification | every category sampled by `grep -rn` across all workspace sources before believing |

`deps:dead` is deliberately **not** part of `deps:check` and not a gate anywhere — owner's ruling,
recorded in the `//deps:dead` note beside it in the root `package.json`. It exits 1 whenever it finds
anything, so a gate would fail every commit from the first one.

### What the tuning had to do

Zero-config knip reported an outright load error plus fourteen "unused" files that are all reached,
and it missed the whole oclif command tree. Each line of `knip.jsonc` carries its reason; the
entry-point strategy per workspace is:

| Workspace                                                                                                                          | Entry strategy                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` (root)                                                                                                                         | `vitest.config.mjs` — a file that exists to throw and is imported by nothing. `eslint` added to `ignoreBinaries`: lint-staged invokes it from a root that declares no eslint, deliberately (see the `//lint-staged` note there).                                                                                                                                                                                 |
| `packages/cli`                                                                                                                     | `src/cli/commands/**` and `src/cli/hooks/**` — oclif loads both by convention and knip's oclif plugin looks for `{,src/}commands/**`, which this layout does not match. `bin/*.js` — `bin/run.js` is what every E2E spec spawns through a path string. `e2e/global-setup.ts` — vitest resolves `globalSetup` from the project root, knip from the config file's directory. `src/cli/types/generated/**` ignored. |
| `packages/matrix`                                                                                                                  | `src/**/*.test.ts` — the suite's include lives in `@workspace/vitest-config/node`, one module hop past the config file knip reads. `src/vendor/**` ignored (written by the CLI's `generate:matrix`).                                                                                                                                                                                                             |
| `packages/ui`                                                                                                                      | `src/**/*.stories.tsx` — the story glob is declared in `.storybook/main.ts`, which the vitest projects reference indirectly.                                                                                                                                                                                                                                                                                     |
| `apps/editor`                                                                                                                      | `vite` plugin **off**, `vite.config.ts` named as an entry instead. knip evaluates a function config at `mode: "production"`, and this one validates the environment before returning — with no `VITE_API_URL` set it throws and the run reports an error instead of findings.                                                                                                                                    |
| `apps/server`                                                                                                                      | `scripts/*.ts` — `build:skill-index` is deliberately outside `build` and `deploy`. `cloudflare` added to `ignoreDependencies`: `cloudflare:test` is a virtual module from `@cloudflare/vitest-pool-workers`, and knip reads the first segment as a package name.                                                                                                                                                 |
| `apps/www`                                                                                                                         | nothing — the astro/starlight/mdx plugins reach everything. Verified: `AGENT_COUNT` in `src/lib/catalog-counts.ts` is imported from a `.mdx` file only, and knip does not flag it.                                                                                                                                                                                                                               |
| `packages/api-mocks`, `packages/eslint-config`, `packages/prettier-config`, `packages/typescript-config`, `packages/vitest-config` | nothing — `exports` fields cover them.                                                                                                                                                                                                                                                                                                                                                                           |

Four config lines were **removed** during iteration because knip's own configuration hints called
them redundant: `src/schemas/**` (JSON only, outside knip's project globs), `packages/matrix/src/generated/**`
(the read model reaches all of it), and explicit entries for `src/cli/index.ts`, `src/cli/config-exports.ts`,
`apps/editor/src/main.tsx` and `apps/server/src/index.ts` (already found via `exports`/`main`/`index.html`).
One hint remains and it is a real finding, not a config gap — see [Other](#other-findings).

### Verdict vocabulary

- **CONFIRMED-DEAD** — grep agrees. Zero references outside the declaration, or references only from
  inside the declaring file, or a re-export line no importer names.
- **NEEDS-READING** — plausible, but a convention, a build step or a resolution rule may reach it.
  Do not delete without a decision.
- **CONFIG-GAP** — knip was wrong. The config was adjusted and the finding is gone from the final run.
  Listed here for the record only.

A caveat on method: reference counting is grep over identifiers, so a name that exists in two files
(`CLI_ROOT` is declared separately in `e2e/helpers/test-utils.ts` and `__tests__/helpers/cli-runner.ts`)
inflates the count. Every verdict below that turns on a count was re-checked by reading the hits.
`packages/matrix/src/vendor/` is excluded from counting — it is a vendored copy of the CLI's own
types, not a caller, and leaving it in wrongly rescued six symbols.

---

## The two CLI-461 finds

Both were left for this baseline. **knip finds neither, and cannot.** Its issue types are files,
exports, types, dependencies and enum/namespace members — not the members of an object type, and not
function parameters. Both verdicts below are grep's, mechanically reproducible.

### `CompileConfig.stack` has no reader — **CONFIRMED-DEAD**

Declared at `packages/cli/src/cli/types/config.ts:61` as `stack?: string`, commented
"Stack reference - resolves stack skills for agents".

- Two producers construct a `CompileConfig` — `lib/agents/agent-recompiler.ts:200` and
  `lib/installation/local-installer.ts:444`. Neither sets `stack`.
- The test factory `createMockCompileConfig` (`__tests__/factories/plugin-factories.ts:20`) does not
  set it, and no call site passes it through `overrides` — checked across all three
  `mock-matrices.ts` constants and all six `resolver.test.ts` uses.
- One consumer exists: `resolveAgents` (`lib/resolver.ts:106`), which reads `compileConfig.agents`
  and nothing else.
- `grep -rn "\.stack\b"` over `src/`, `e2e/` and `scripts/` returns 40 hits. Every one is
  `ProjectConfig.stack` (a `Record<AgentName, StackAgentConfig>` — a different field on a different
  type) or `error.stack`. Zero touch `CompileConfig`.

The field is written by nobody and read by nobody.

### `resolveAgents`' `_projectRoot` is reserved-unused — **CONFIRMED-DEAD**

`grep -rn "_projectRoot"` over `src/` and `e2e/` returns exactly two hits, both in
`packages/cli/src/cli/lib/resolver.ts`:

- `:93` — the JSDoc line, which says so itself: "Project root directory (currently unused, reserved
  for future use)".
- `:107` — the parameter declaration.

Zero reads in the body. Note this is a **signature** change rather than a line deletion: callers
still pass a fourth positional argument (`sourcePath` from `agent-recompiler.ts`, `projectDir` from
`local-installer.ts`), plus ten call sites in `resolver.test.ts`. CLI-461 already pruned this
function from five arguments to four; this is the same cut one step further.

---

## Findings by workspace

### packages/cli

#### Unused files (1)

| Finding                           | Verdict            | Evidence                                                                                                                                                                                                                       |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/lib/operations/types.ts` | **CONFIRMED-DEAD** | A 16-line type-only re-export barrel. `grep -rn "operations/types"` over `src/`, `e2e/` and `scripts/` returns zero importers. Every type it forwards is re-exported again by `operations/index.ts`, which is itself imported. |

#### Unused dependencies (1) and devDependencies (1)

| Finding                       | Verdict            | Evidence                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gray-matter` (dependency)    | **CONFIRMED-DEAD** | Zero occurrences of the string anywhere under `src/`, `scripts/`, `e2e/`, `tsup.config.ts` or `vitest.config.ts`. Frontmatter parsing goes through `parseFrontmatter()` in `lib/loading/loader.ts`, which does not use it. A published `dependency`, so this ships in the tarball.                 |
| `@oclif/test` (devDependency) | **CONFIRMED-DEAD** | Six occurrences, none of them code: four in `src/agents/tester/cli-tester/*.md` (prompt text telling users to use it), one comment in `vitest.config.ts`, one comment in `__tests__/helpers/cli-runner.ts` explaining why the suite does **not** use it. Command tests go through `runCliCommand`. |

#### Unlisted dependencies (4)

| Finding                                                                                                                  | Verdict                             | Evidence                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chalk` — `src/cli/base-command.ts:3`, `src/cli/commands/edit.tsx:3`, `src/cli/components/wizard/source-grid.test.tsx:1` | **CONFIRMED-DEAD** (as an omission) | All three are real `import chalk from "chalk"` statements. `chalk` appears nowhere in `packages/cli/package.json`. It resolves today only because a transitive dependency hoisted chalk 5.6.2 to the root `node_modules`. **`base-command.ts` is production code in the published bundle** — this is the highest-consequence finding in the run. |
| `ansis` — `src/cli/lib/__tests__/helpers/cli-runner.ts:4`                                                                | **CONFIRMED-DEAD** (as an omission) | Real import, undeclared, resolving off a hoisted 3.17.0. Test-only, so the blast radius is a suite that breaks on someone else's dependency bump.                                                                                                                                                                                                |

#### Unused exports (210) and exported types (78)

288 findings in one workspace. They fall into three shapes, and the shape decides what a deletion
round would actually do.

**Shape 1 — dead re-export lines in barrels (197).** The symbol is alive and imported; the barrel
line forwarding it is what has no reader.

| Barrel                                      | Findings | Verdict            |
| ------------------------------------------- | -------: | ------------------ |
| `src/cli/lib/__tests__/factories/index.ts`  |       37 | **CONFIRMED-DEAD** |
| `src/cli/lib/__tests__/helpers/index.ts`    |       25 | **CONFIRMED-DEAD** |
| `src/cli/lib/configuration/index.ts`        |       21 | **CONFIRMED-DEAD** |
| `src/cli/lib/plugins/index.ts`              |       18 | **CONFIRMED-DEAD** |
| `src/cli/lib/operations/index.ts`           |       18 | **CONFIRMED-DEAD** |
| `src/cli/lib/matrix/index.ts`               |       13 | **CONFIRMED-DEAD** |
| `src/cli/lib/skills/index.ts`               |       13 | **CONFIRMED-DEAD** |
| `src/cli/lib/installation/index.ts`         |       12 | **CONFIRMED-DEAD** |
| `src/cli/lib/__tests__/assertions/index.ts` |        9 | **CONFIRMED-DEAD** |
| `src/cli/lib/agents/index.ts`               |        8 | **CONFIRMED-DEAD** |
| `src/cli/lib/operations/source/index.ts`    |        6 | **CONFIRMED-DEAD** |
| `src/cli/lib/operations/skills/index.ts`    |        6 | **CONFIRMED-DEAD** |
| `src/cli/lib/operations/project/index.ts`   |        6 | **CONFIRMED-DEAD** |
| `src/cli/lib/loading/index.ts`              |        5 | **CONFIRMED-DEAD** |

Spot-checked by reading rather than counting:

- `getSkillById` is re-exported at `lib/matrix/index.ts:31`. All ten importers name
  `lib/matrix/matrix-provider` directly — which is exactly what `CLAUDE.md` instructs ("use
  `getSkillById(id)` from `matrix/matrix-provider.ts`"). The barrel line has never been used.
- `createMockSkill` and 36 siblings are re-exported at `__tests__/factories/index.ts`. Every test
  imports from `factories/skill-factories`, `factories/agent-factories`, `factories/config-factories`
  etc. One file in the whole suite imports through the barrel
  (`operations/skills/copy-local-skills.test.ts` → `factories/index.js`), and it names
  `createMockCopiedSkill`, which is not in this list.
- `DOMAINS` / `SKILL_MAP` / `SKILL_IDS` / `SKILL_SLUGS` are re-exported at `types/matrix.ts:5` and
  `types/skills.ts:5`. Every consumer — `utils/type-guards.ts`, `lib/schemas.ts` — imports them from
  `types/generated/source-types` directly.

The 19 non-barrel members of this shape are re-export or alias lines in `types/matrix.ts`,
`types/skills.ts`, `types/config.ts`, `types/agents.ts`, `types/stacks.ts`,
`__tests__/fixtures/create-test-source.ts`, `__tests__/test-constants.ts`,
`e2e/helpers/test-utils.ts` and `e2e/fixtures/dual-scope-helpers.ts`, plus `stackAgentConfigSchema`
in `lib/schemas.ts`.

**Shape 2 — the `export` keyword is the dead part (48 in this workspace).** The symbol is used, but
only inside the file that declares it. This is the exact pattern `CLAUDE.md` already forbids:
"NEVER export constants only used within the same file — run grep before adding `export`."

| File                                                         | Symbols                                                                                                                                                                                                                         | Verdict                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/schemas.ts`                                     | `modelNameSchema`, `effortLevelSchema`, `permissionModeSchema`, `skillSlugSchema`, `agentHookActionSchema`, `agentHookDefinitionSchema`, `hooksRecordSchema`, `skillAssignmentSchema`, `pluginAuthorSchema`, `isCustomMetadata` | **CONFIRMED-DEAD** — composition pieces consumed by the composite schemas below them in the same file. `config-exports.ts` exports none of them, so no published surface is at stake.                                  |
| `src/cli/utils/type-guards.ts`                               | `isCategory`                                                                                                                                                                                                                    | **CONFIRMED-DEAD** — one reference, from `isCategoryPath` on line 40 of the same file. Named in a `CLAUDE.md` ALWAYS rule; `isAgentName`, `isDomain` and `isSkillId` are the ones actually used.                       |
| `src/cli/lib/config-gate/pair-writer.ts`                     | `globalPairPaths`, `typesPathFor`, `GlobalPairPaths`                                                                                                                                                                            | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/lib/config-gate/gate-token.ts`                      | `hasGateToken`                                                                                                                                                                                                                  | **CONFIRMED-DEAD** — one reference, line 40 of the same file.                                                                                                                                                          |
| `src/cli/lib/seed/fetch-seed.ts`                             | `SEED_API_URL`, `SEED_USER_AGENT`                                                                                                                                                                                               | **NEEDS-READING** — `SEED_API_URL` reads `process.env.AGENTS_INC_API_URL`; check whether an E2E spec asserts against the constant by name before dropping the export.                                                  |
| `src/cli/lib/skills/skill-copier.ts`                         | `copySkillFromSource`                                                                                                                                                                                                           | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/lib/skills/skill-metadata.ts`                       | `writeMetadataYaml`                                                                                                                                                                                                             | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/lib/operations/skills/discover-skills.ts`           | `discoverLocalProjectSkills`, `mergeSkills`                                                                                                                                                                                     | **NEEDS-READING** — reached only via `operations/index.ts`, whose forwarding line is itself in shape 1. Both are one call away from being fully dead; settle the barrel first.                                         |
| `src/cli/lib/operations/project/recompile-project-agents.ts` | `recompileRegisteredProjectAgents`                                                                                                                                                                                              | **NEEDS-READING** — same situation.                                                                                                                                                                                    |
| `src/cli/lib/configuration/config.ts`                        | `loadGlobalSourceConfig`                                                                                                                                                                                                        | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/lib/configuration/skill-audit.ts`                   | `AuditVerdict`, `SkillClass`, `BatchId`                                                                                                                                                                                         | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/lib/installation/mode-migrator.ts`                  | `SkillMigration`                                                                                                                                                                                                                | **CONFIRMED-DEAD**                                                                                                                                                                                                     |
| `src/cli/types/matrix.ts`                                    | `SKILL_SOURCE_TYPES`, `SkillGroupRule`, `SkillCore`                                                                                                                                                                             | **NEEDS-READING** — all three are used inside `types/matrix.ts` and are duplicated verbatim into `packages/matrix/src/vendor/matrix.ts` by the generator. Dropping an export here changes what the vendored copy says. |
| `src/cli/types/agents.ts`                                    | `BaseAgentFields`                                                                                                                                                                                                               | **NEEDS-READING** — same vendoring caveat.                                                                                                                                                                             |
| test-side files                                              | `stripAnsi` (`e2e/helpers/test-utils.ts:217`), `expectFullConfig`, `ExpectedConfig`, `TestMatrix`, `extractSkillIdsFromAssignment`, `VITEST_SKILL`, `SkillContentOverride`, `SeedConfigRequest`, `FindingVerdict`               | **CONFIRMED-DEAD**                                                                                                                                                                                                     |

**Shape 3 — nothing references the symbol at all (31 in this workspace).** See
[Top candidates](#top-candidates-for-a-future-deletion-round).

#### Duplicate exports (1)

| Finding                                                                           | Verdict           | Evidence                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_PLUGIN_NAME` / `DEFAULT_PUBLIC_SOURCE_NAME` — `src/cli/consts.ts:29,295` | **NEEDS-READING** | knip is factually right — two exported names, one value. The code already answers it at `consts.ts:292-294`: "Same value as `DEFAULT_PLUGIN_NAME` but a distinct concept". Deliberate; leave. |

---

### apps/editor

| Category               | Finding                                                                                                                                                                       | Verdict            | Evidence                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused devDependencies | `@workspace/prettier-config`                                                                                                                                                  | **NEEDS-READING**  | See the shared note under [Cross-workspace](#cross-workspace-findings).                                                                                                                                                                                             |
| Unused exports         | `envSchema` (`src/env.schema.ts:8`)                                                                                                                                           | **CONFIRMED-DEAD** | Two references, both in the same file (`z.infer` on line 42, `safeParse` on line 55). `parseEnv` is the exported surface.                                                                                                                                           |
| Unused exports         | `loadStateSchema`, `assignmentSchema`, `skillEntrySchema`, `agentModelSchema`, `agentEffortSchema`, `agentScopeSchema`, `agentEntrySchema` (`src/stores/persisted-schema.ts`) | **CONFIRMED-DEAD** | Same shape — each is composed into the schema below it in the same file.                                                                                                                                                                                            |
| Unused exports         | `UNCATEGORIZED_ID` (`features/configure/lib/derive.ts:200`), `BAR_STUCK_ATTRIBUTE` (`lib/use-pinned.ts:56`)                                                                   | **CONFIRMED-DEAD** | Self-referenced only.                                                                                                                                                                                                                                               |
| Unused types           | `GridSkill`, `CategoryView` (`lib/derive.ts`), `InstallCommand` (`lib/use-install-command.ts:22`)                                                                             | **CONFIRMED-DEAD** | Self-referenced only. Return-type annotations, not a consumed contract.                                                                                                                                                                                             |
| Unused types           | `AnalyticsEventName` (`lib/analytics/events.ts:36`), `PersistedUi` (`stores/persisted-schema.ts:165`)                                                                         | **CONFIRMED-DEAD** | Zero references anywhere.                                                                                                                                                                                                                                           |
| Unused types           | `SkillId` (`stores/config-store.ts:559`)                                                                                                                                      | **NEEDS-READING**  | The name collides with the CLI's own `SkillId` (968 hits repo-wide). knip's claim is that _this_ declaration has no importer, which reading the file supports — but confirm no editor module imports `SkillId` from the store rather than from `@workspace/matrix`. |

### apps/server

| Category               | Finding                      | Verdict           | Evidence                                          |
| ---------------------- | ---------------------------- | ----------------- | ------------------------------------------------- |
| Unused devDependencies | `@workspace/prettier-config` | **NEEDS-READING** | See [Cross-workspace](#cross-workspace-findings). |

### apps/www

| Category               | Finding                      | Verdict           | Evidence                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused devDependencies | `tailwindcss`                | **NEEDS-READING** | www imports `@tailwindcss/vite` in `astro.config.ts` (declared) and reaches Tailwind itself only through `src/styles/site.css` → `@workspace/ui/globals.css` → `@import "tailwindcss"`. That resolution happens from `packages/ui`, which declares `tailwindcss` itself. Looks redundant; prove it with a build before removing. |
| Unused devDependencies | `@workspace/prettier-config` | **NEEDS-READING** | See [Cross-workspace](#cross-workspace-findings).                                                                                                                                                                                                                                                                                |

Coverage note: no export or file findings here is a real result, not a blind spot. knip's
astro/starlight/mdx handling resolves `AGENT_COUNT` in `src/lib/catalog-counts.ts`, whose only
importer is a `.mdx` file.

### packages/ui

| Category               | Finding                      | Verdict            | Evidence                                                                                                                                                                                     |
| ---------------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused dependencies    | `zod`                        | **CONFIRMED-DEAD** | Zero `zod` imports under `src/` or `.storybook/`. The design system holds no schemas.                                                                                                        |
| Unused devDependencies | `@turbo/gen`                 | **CONFIRMED-DEAD** | No `turbo/generators` directory exists in this workspace and no file references `@turbo/gen`. Leftover from the Turborepo starter this package was scaffolded from.                          |
| Unused devDependencies | `@vitejs/plugin-react`       | **NEEDS-READING**  | Never imported directly — `.storybook/main.ts` sets `framework: "@storybook/react-vite"`, which brings its own React plugin. Likely satisfying a peer expectation rather than a direct need. |
| Unused devDependencies | `@workspace/prettier-config` | **NEEDS-READING**  | See [Cross-workspace](#cross-workspace-findings).                                                                                                                                            |

### packages/matrix and packages/api-mocks

| Category               | Finding                      | Verdict           | Evidence                                          |
| ---------------------- | ---------------------------- | ----------------- | ------------------------------------------------- |
| Unused devDependencies | `@workspace/prettier-config` | **NEEDS-READING** | See [Cross-workspace](#cross-workspace-findings). |

### packages/vitest-config

| Category          | Finding                                                    | Verdict           | Evidence                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate exports | `nodeConfig` / `default` in both `node.js` and `node.d.ts` | **NEEDS-READING** | Deliberate: `packages/matrix/vitest.config.ts` uses the default (`export { nodeConfig as default } from …`), `apps/editor` and `apps/server` use the name. Both are load-bearing. |

### root

| Category               | Finding                       | Verdict           | Evidence                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused devDependencies | `prettier-plugin-tailwindcss` | **NEEDS-READING** | The root's `prettier` field points at `@workspace/prettier-config`, whose `prettier.config.mjs` lists the plugin and declares it as its own dependency. The root copy looks redundant, but prettier plugin resolution is relative to the config that names it — check before removing. |

---

## Cross-workspace findings

**`@workspace/prettier-config` declared as a devDependency by six workspaces that never load it**
(`apps/editor`, `apps/server`, `apps/www`, `packages/api-mocks`, `packages/matrix`, `packages/ui`).
**NEEDS-READING.** Prettier resolves the config from the
root `package.json`'s `prettier: "@workspace/prettier-config"` field, which the root's own
devDependency satisfies; no workspace names it in a config of its own, and `packages/cli` — the one
workspace with its own formatting — does not declare it at all. This reads as decorative, but it is
one decision across six manifests and belongs to the owner, not to a deletion round.

## Config gaps found and closed

These were in the zero-config output and are gone from the final run. Recorded so the next person
does not re-derive them.

| What knip said                                                          | Why it was wrong                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ERROR: Error loading apps/editor/vite.config.ts (Invalid environment)` | knip calls a function config at `mode: "production"`; the config validates the env before returning. Vite plugin disabled for that workspace.                                                          |
| 12 `packages/matrix/src/**/*.test.ts` unused                            | The suite's `include` lives one module hop away in `@workspace/vitest-config/node`.                                                                                                                    |
| `packages/matrix/src/vendor/config.ts`, `vendor/stacks.ts` unused       | Vendored by the CLI's generator; the CLI is their only writer.                                                                                                                                         |
| `packages/cli/bin/run.js`, `bin/dev.js` unused                          | `bin/run.js` is spawned by every E2E spec as a path string (`BIN_RUN` in `e2e/helpers/test-utils.ts:63`); both are documented development entry points in `.ai-docs/reference/build-and-packaging.md`. |
| `packages/cli/e2e/global-setup.ts` unused + unresolved import           | vitest resolves `globalSetup` from the project root, knip from the config file's directory.                                                                                                            |
| `vitest.config.mjs` (root) unused                                       | Correct in the import sense and deliberate — the file exists to throw.                                                                                                                                 |
| Unlisted binary `eslint` at the root                                    | Deliberate and documented in the root `//lint-staged` note: ESLint 10 resolves per-file, every workspace declares `eslint ^10`, one hoisted copy serves all.                                           |
| Unlisted dependency `cloudflare` (server tests)                         | `cloudflare:test` is a virtual module; knip read the first path segment as a package name.                                                                                                             |
| Every oclif command and hook "unused"                                   | knip's oclif plugin looks for `{,src/}commands/**`; this tree is `src/cli/commands/**`.                                                                                                                |

## Other findings

One knip configuration hint survives, and it is a finding rather than a gap:

| Finding                                                                                                         | Verdict            | Evidence                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `packages/ui/package.json` declares `"./hooks/*": "./src/hooks/*.ts"` and `src/hooks/` contains only `.gitkeep` | **CONFIRMED-DEAD** | An `exports` subpath resolving to nothing. Any consumer writing `@workspace/ui/hooks/x` fails at resolve time. |

## Summary table

Counts per category per workspace, from the final `bun run deps:dead`.

| Workspace                                                                          | Unused files | Unused deps | Unused devDeps | Unlisted deps | Unused exports | Unused types | Duplicates | **Total** |
| ---------------------------------------------------------------------------------- | -----------: | ----------: | -------------: | ------------: | -------------: | -----------: | ---------: | --------: |
| `packages/cli`                                                                     |            1 |           1 |              1 |             4 |            210 |           78 |          1 |   **296** |
| `apps/editor`                                                                      |            0 |           0 |              1 |             0 |             10 |            6 |          0 |    **17** |
| `packages/ui`                                                                      |            0 |           1 |              3 |             0 |              0 |            0 |          0 |     **4** |
| `apps/www`                                                                         |            0 |           0 |              2 |             0 |              0 |            0 |          0 |     **2** |
| `packages/vitest-config`                                                           |            0 |           0 |              0 |             0 |              0 |            0 |          2 |     **2** |
| `apps/server`                                                                      |            0 |           0 |              1 |             0 |              0 |            0 |          0 |     **1** |
| `packages/matrix`                                                                  |            0 |           0 |              1 |             0 |              0 |            0 |          0 |     **1** |
| `packages/api-mocks`                                                               |            0 |           0 |              1 |             0 |              0 |            0 |          0 |     **1** |
| `.` (root)                                                                         |            0 |           0 |              1 |             0 |              0 |            0 |          0 |     **1** |
| `packages/eslint-config`, `packages/prettier-config`, `packages/typescript-config` |            0 |           0 |              0 |             0 |              0 |            0 |          0 |     **0** |
| **TOTAL**                                                                          |        **1** |       **2** |         **11** |         **4** |        **220** |       **84** |      **3** |   **325** |

The 304 export and type findings split by what a deletion would actually remove:

| Shape                                              | Count | What deletion removes                        |
| -------------------------------------------------- | ----: | -------------------------------------------- |
| Re-export line in a barrel that no importer names  |   197 | one line in an `index.ts`; symbol unaffected |
| Other re-export/alias lines with no importer       |    19 | one line; symbol unaffected                  |
| `export` keyword on a symbol used only in its file |    53 | the keyword; symbol unaffected               |
| Symbol with no reference anywhere                  |    35 | the declaration, and its tests               |

## Top candidates for a future deletion round

In the order they are worth doing.

**1. `chalk` and `ansis` are imported but undeclared.** Not a deletion — the opposite. Three files
import `chalk`, one of them `src/cli/base-command.ts`, which is production code in the published
bundle, and it resolves today only because something else hoisted chalk to the root. `ansis` is the
same defect in the test helpers. This is the one finding in the run that can break a published
release, and it is a two-line fix to `packages/cli/package.json`.

**2. Eleven symbols in `packages/cli` production code that nothing references.**

| Symbol                        | Location                                      |
| ----------------------------- | --------------------------------------------- |
| `copySkill`                   | `src/cli/lib/skills/skill-copier.ts:85`       |
| `printPluginValidationResult` | `src/cli/lib/plugins/plugin-validator.ts:411` |
| `loadAndMergeSkillsMatrix`    | `src/cli/lib/matrix/matrix-loader.ts:158`     |
| `getCustomSkillIds`           | `src/cli/lib/matrix/matrix-provider.ts:51`    |
| `resolveAuthor`               | `src/cli/lib/configuration/config.ts:134`     |
| `isCategoryPath`              | `src/cli/utils/type-guards.ts:39`             |
| `isSkillSlug`                 | `src/cli/utils/type-guards.ts:49`             |
| `KEY_LABEL_DEL`               | `src/cli/components/wizard/hotkeys.ts:42`     |
| `KEY_LABEL_ARROWS_VERT`       | `src/cli/components/wizard/hotkeys.ts:43`     |
| `SkillAlias`                  | `src/cli/types/matrix.ts:229`                 |
| `ResolvedCategorySkills`      | `src/cli/types/skills.ts:28`                  |

Each is reachable only through a barrel line that is itself in this report, so the cascade CLI-459
and CLI-461 followed applies again: delete the symbol, then the barrel line, then check what its
own imports were keeping alive. `isCategoryPath` and `isSkillSlug` sit beside `isCategory`, which
`CLAUDE.md` names in an ALWAYS rule while nothing calls it — that rule wants re-reading either way.

**3. The two CLI-461 finds.** `CompileConfig.stack` is a field deletion in `types/config.ts` with no
call-site work. `resolveAgents`' `_projectRoot` is a signature change across two production callers
and ten spec call sites.

**4. Fourteen unused test fixtures and helpers.** `ALL_SKILLS_*_MATRIX` (five constants in
`mock-matrices.ts`), `REACT_SHARED_SECURITY_MATRIX`, `LOCAL_SKILL_*` (three in `mock-skills.ts`),
`ALL_TEST_SKILLS`, `COMPILE_LOCAL_SKILL`, plus `simulateSkillSelections`,
`buildWizardResultFromStore`, `renderCategoriesTs`, `writeTestYaml`, `expectCompiledAgents`,
`expectConfigOnDisk`, `assertConfigIntegrity`, `seedDefaultSourceCache`, `expectFullInstallation`,
`initProjectWithProjectScopedAgent`, `OPERATION_DELAY_MS`. `CLAUDE.md` requires tests to use
factories rather than inline data; a factory nothing calls is either a gap in coverage or a fixture
that outlived its spec, and which one it is has to be read per symbol.

**5. The barrels, as one decision rather than 197.** The question is not "delete these lines" but
"what are `lib/*/index.ts` for, given that essentially nothing imports through them". Answering it
once removes the largest block of findings in this report and stops it regenerating.

**6. Four dependency removals.** `gray-matter` (a published `dependency` of the CLI with zero
references), `@oclif/test`, `packages/ui`'s `zod` and `@turbo/gen`. Low risk, small win, and it
shrinks the published tarball by one package.

## Reproducing this

```
bun run deps:dead                  # every workspace, the full report
bunx knip --workspace packages/cli # one workspace
bunx knip --reporter json          # machine-readable, for grouping
```

Not enabled: `--include enumMembers,namespaceMembers` (member-level analysis, off by default and
untuned — expect noise before signal), and `--production`, which would scope the run to the shipped
graph and drop every test-side finding above.

## Gates run for this task

| Gate                                | Result                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run deps:dead` end to end      | Runs clean — no load errors, one configuration hint, and that hint is a real finding       |
| `bun run deps:check`                | Green, untouched: syncpack clean, 7/7/7 workspaces bound on the three config axes          |
| `prettier --check` on touched files | `knip.jsonc` and `package.json` both clean                                                 |
| Full `bun run test` in packages/cli | 135 files, 6238 passed, 3 expected fail, 0 unexpected — the knip config touches no runtime |
