---
last_validated: 2026-08-06
---

# Documentation Map

Index of `.ai-docs/`. Load this first, then load only the documents you need.

**Conventions:** `standards/documentation-bible.md`. It carries the governing rule — a document
describes the current state of the app, never the work that produced it — and the staleness rules
below.

**Staleness:** each document's own `last_validated` frontmatter is its staleness signal. It means
the whole document was re-derived from source on that date; a pass that checked only part of a
document leaves it alone. This map does not restate those dates — read them on disk.

---

## Reference

Descriptive: how the CLI works and where its pieces live.

### Architecture

| Doc                                  | Covers                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `reference/architecture-overview.md` | Project identity, directory tree, entry points, data flow, technology stack                                       |
| `reference/dependency-graph.md`      | Import edges: commands -> operations -> lib -> utils, and layer boundaries                                        |
| `reference/boundary-map.md`          | Trust boundaries: CLI input, file parse, file write, shell exec, security                                         |
| `reference/monorepo-layout.md`       | The repository around `packages/cli` — workspaces, hooks, CI, tooling split (paths are repo-root-relative)        |
| `reference/build-and-packaging.md`   | tsup entry contract, publish surface, oclif block, tarball contents                                               |
| `reference/utilities.md`             | `src/cli/utils/**`, `consts.ts`, `lib/exit-codes.ts` — the shared leaf surface                                    |
| `reference/leaf-exports.md`          | Staging area for exported symbols not yet owned by another doc; drains into owning docs and is deleted when empty |

### Commands

| Doc                           | Covers                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| `reference/commands/index.md` | Every CLI command: flags, args, aliases, exit codes, feature gates |
| `reference/commands/edit.md`  | The `edit` command in detail — flow, types, utilities              |

### Wizard and UI

| Doc                                     | Covers                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `reference/features/wizard-flow.md`     | Step sequence, keyboard navigation, hooks, scope diffs, feature-flag gating |
| `reference/wizard/state-transitions.md` | Wizard state machine: transitions, action->state tables, resets, hotkeys    |
| `reference/store-map.md`                | `WizardState` shape, every action, store consumers, hydration entry point   |
| `reference/component-patterns.md`       | Ink component conventions, hooks, `CLI_COLORS`, `UI_SYMBOLS`, layout rules  |

### Concepts

| Doc                                       | Covers                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `reference/concepts/scope-system.md`      | Project vs global scope, path resolution, config splitting       |
| `reference/concepts/tombstone-pattern.md` | Excluded/tombstone lifecycle, `SkillConfig.excluded`, dual scope |
| `reference/concepts/guard-pattern.md`     | Every wizard store guard in one view                             |

### Configuration

| Doc                                   | Covers                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `reference/features/configuration.md` | Config loading, resolution hierarchy, error posture                         |
| `reference/config/config-writer.md`   | Config writer and config-types writer, path normalization, project registry |
| `reference/config/config-merger.md`   | `mergeConfigs` / `mergeGlobalConfigs` merge contract and entry identity     |
| `reference/config/scope-split.md`     | `splitConfigByScope`, `scopeEligibilityKey`, the delta pipeline             |

### Features

| Doc                                            | Covers                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `reference/features/skills-and-matrix.md`      | Skills matrix loading, categories, resolution, install-mode tagging            |
| `reference/skills/skill-primitives.md`         | Function inventory for `src/cli/lib/skills/`                                   |
| `reference/features/built-in-catalogue.md`     | `defaultStacks` / `defaultRules` fallback data and when it is bypassed         |
| `reference/features/source-fetch-and-cache.md` | giget fetch, cache key derivation, ID-targeted read path                       |
| `reference/features/compilation-pipeline.md`   | Liquid templates, agent assembly, output validation                            |
| `reference/features/agent-system.md`           | Agent templates, partials, `metadata.yaml`, Liquid compilation                 |
| `reference/features/model-and-effort.md`       | The model/effort tuning axis end to end, and why it lives on the sub-agent     |
| `reference/features/plugin-system.md`          | Plugin discovery, manifest generation, installation, marketplace               |
| `reference/features/operations-layer.md`       | Composable operations (source, skills, project) and their typed results        |
| `reference/features/seed-contract.md`          | The `init --from` wire contract, imported from `@workspace/matrix/seed`        |
| `reference/features/code-generation.md`        | The three `scripts/` generators, their outputs, and the checks that guard them |

### Types

| Doc                                   | Covers                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `reference/types/core-types.md`       | Generated unions, core data structures, type guards             |
| `reference/types/operations-types.md` | Operations-layer types and edit-command types                   |
| `reference/types/zod-schemas.md`      | Zod schemas in `src/cli/lib/schemas.ts` (owns the schema count) |

### Testing

| Doc                                       | Covers                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `reference/testing/infrastructure.md`     | Vitest config, test projects, directory structure, render patterns               |
| `reference/testing/factories.md`          | Factory, helper and assertion inventories                                        |
| `reference/testing/mock-data.md`          | `SKILLS` registry, `TEST_CATEGORIES`, mock-data constants                        |
| `reference/testing/e2e-infrastructure.md` | E2E config, page objects, matchers, fixtures, timeouts, `STEP_TEXT`              |
| `reference/testing/harness-decisions.md`  | Harness alternatives already rejected, and the CLI behaviour a test must satisfy |

### Pointers

Redirect stubs kept because inbound links still use the path. Each holds a redirect table and no
content; its `last_validated` records link integrity only.

| Pointer                                      | Canonical body                              |
| -------------------------------------------- | ------------------------------------------- |
| `reference/architecture/overview.md`         | `reference/architecture-overview.md`        |
| `reference/architecture/dependency-graph.md` | `reference/dependency-graph.md`             |
| `reference/architecture/boundary-map.md`     | `reference/boundary-map.md`                 |
| `reference/commands.md`                      | `reference/commands/index.md`               |
| `reference/state-transitions.md`             | `reference/wizard/state-transitions.md`     |
| `reference/config/configuration.md`          | `reference/features/configuration.md`       |
| `reference/wizard/flow.md`                   | `reference/features/wizard-flow.md`         |
| `reference/wizard/store-map.md`              | `reference/store-map.md`                    |
| `reference/wizard/component-patterns.md`     | `reference/component-patterns.md`           |
| `reference/type-system.md`                   | `reference/types/*` (owns the union counts) |
| `reference/test-infrastructure.md`           | `reference/testing/*`                       |

**Direction is per-pair, not positional.** `commands.md` and `state-transitions.md` are root-level
pointers whose bodies live in subdirectories. Determine direction by reading both files.

---

## Standards

Prescriptive rules for code, tests and documentation. Owned by convention-keeper.

| Doc                                   | Covers                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `standards/clean-code-standards.md`   | Code-quality rules, numbered by section                                                        |
| `standards/documentation-bible.md`    | How `.ai-docs/` is written and maintained                                                      |
| `standards/e2e-testing-bible.md`      | E2E philosophy and the top-level rules                                                         |
| `standards/e2e/`                      | E2E sub-standards: structure, assertions, page objects, test data, patterns, anti-patterns     |
| `standards/e2e/user-journeys.md`      | The journeys the suite must cover, the four assertion surfaces each owes, per-journey coverage |
| `standards/typescript-types-bible.md` | Type-authoring rules                                                                           |
| `standards/prompt-bible.md`           | Prompt phrasing, XML tags, delegation shape                                                    |
| `standards/loop-prompts-bible.md`     | Loop cadence, iteration discipline, synthesis passes                                           |
| `standards/skill-atomicity-bible.md`  | Skill decomposition rules                                                                      |
| `standards/skill-atomicity-primer.md` | Short form of the above                                                                        |
| `standards/commit-protocol.md`        | Commit message and release conventions                                                         |

---

## Agent Findings and Suggestions

`agent-findings/` holds dated point-in-time evidence — the deliberate exception to the
current-state rule. It is not swept, re-validated or pruned. See `agent-findings/README.md` for the
pipeline and `agent-findings/TEMPLATE.md` for the frontmatter schema.

`agent-suggestions/` holds forward-looking proposals; see its `README.md` for the status enum.

---

## Coverage

This section owns the source and E2E file totals; no other doc restates them. Re-derive with
`find`, never carry forward.

- **`src/cli/`:** 350 TypeScript files — 132 specs (`*.test.ts(x)`), the rest production and test
  support.
- **`e2e/`:** 234 TypeScript files — 195 specs, 39 helpers/fixtures/page objects. The 195 splits
  192 `*.e2e.test.ts` (what `test:e2e` runs) and 3 `*.smoke.test.ts` (run explicitly).

---

## Tooling Gates

Read before running or reporting on a quality gate.

**ESLint runs clean over the whole package.** `npm run lint` is `eslint .`; expect exit `0`. Any
problem you see is yours. The repository-root `lint-staged` runs `eslint --fix --no-warn-ignored`
then `prettier --write` over staged `{apps,packages}` sources, and `prepublishOnly` runs
`format:check && lint && typecheck && generate:schemas:check && generate:types:check && build && test`.
`reference/monorepo-layout.md` carries the two-tier hook split (pre-commit vs pre-push) that
invokes it.

Config is `eslint.config.js` (ESLint 9 flat config via `defineConfig()`), over
`src/**/*.{ts,tsx}`, `e2e/**/*.ts` and `scripts/**/*.ts`. On top of `js.configs.recommended` +
`tseslint.configs.recommended`, with `eslint-config-prettier` last so ESLint never reports
formatting:

| Layer                                                       | Scope                                                      | What it does                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linterOptions.reportUnusedDisableDirectives: "error"`      | Repo-wide                                                  | A disable comment whose rule no longer fires fails the run                                                                                                            |
| `@typescript-eslint/no-unused-vars`                         | All TS sources                                             | Honours the leading-underscore convention                                                                                                                             |
| `eslint-plugin-react-hooks`                                 | `src/cli/**/*.tsx`, `components/**/*.ts`, `stores/**/*.ts` | `rules-of-hooks` + `exhaustive-deps`, both `error` — **exactly those two**, because the v7 recommended set's React-Compiler rules outlaw Ink's measure-on-a-ref idiom |
| `no-restricted-syntax` (task IDs)                           | Test files and fixtures                                    | Bans task IDs in `describe`/`it`/`test` names and `expect` messages; file-level JSDoc is the sanctioned home                                                          |
| `@typescript-eslint/triple-slash-reference: off`            | `**/*.d.ts`                                                | The correct idiom in a declaration file; for `@lydell/node-pty` it is the only reachable one                                                                          |
| `no-restricted-imports` / `no-restricted-syntax` (L2 zones) | Five nested zones                                          | Config-gate enforcement: private-module bans, raw-write bans, pair-renderer bans                                                                                      |

`reference/component-patterns.md` carries the react-hooks carve-out; `reference/boundary-map.md`
carries the config-gate enforcement layers.

**Inline suppressions. Each is justified in place — do not remove one, and do not add another
without the same standard of justification.** The table below is **not** the full inventory: it
carries the suppressions whose reason is a one-off worth stating here. Two rule-level families are
deliberately not enumerated because they repeat verbatim across dozens of sites —
`@typescript-eslint/no-unnecessary-condition` over a `typedEntries`/`Object.entries` walk of a
`Partial<Record>` (the guard reads as dead while still covering an explicitly-undefined slot), and
`@typescript-eslint/unbound-method` on a spy that is restored rather than called. Grep
`eslint-disable` for the live set; absence from this table is not evidence a suppression is
unsanctioned.

| Rule                                | File                                                 | Why it stays                                                                                              |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `no-control-regex`                  | `src/cli/lib/configuration/config.ts`                | The pattern deliberately matches control characters — that IS the validation                              |
| `no-control-regex`                  | `src/cli/utils/exec.ts`                              | Same, for plugin-path control-character rejection                                                         |
| `no-var`                            | `src/cli/lib/__tests__/factories/skill-factories.ts` | `let` would throw — `var` avoids a TDZ error under circular ESM imports                                   |
| `@typescript-eslint/no-unused-vars` | `e2e/matchers/setup.ts`                              | Vitest `Assertion<T>` declaration merging needs the type parameter's name verbatim; `^_` does not compile |
| `react-hooks/exhaustive-deps`       | `src/cli/components/hooks/use-section-scroll.ts`     | Measure-every-render effect                                                                               |
| `react-hooks/exhaustive-deps`       | `src/cli/components/hooks/use-panel-scroll.ts`       | Measure-every-render effect                                                                               |

**Open gap: no generator check runs at pre-commit.** There are three. `generate:schemas:check` runs
in `ci.yml`'s `check-cli` job and in `prepublishOnly`; `generate:matrix:check` runs in `ci.yml`'s
`check-web` job, from `packages/cli`; `generate:types:check` runs in `prepublishOnly` only, because
`generate:types` reads a `skills` checkout and every `ci.yml` job checks out this repository alone —
do not "complete the pair" in `ci.yml`. (`regenerate-catalog.yml` does check the marketplace out and
runs all three generators as writers; that is a different job from checking a committed artefact.) A
stale generated artefact can therefore sit on `main` until the next CI run (schemas, matrix) or the
next publish (types). The three write scripts compose into one, `bun run generate`, in dependency
order. `reference/features/code-generation.md` carries the detail.
