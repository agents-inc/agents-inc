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

| Doc                                     | Covers                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `reference/features/wizard-flow.md`     | Step sequence, keyboard navigation, hooks, scope diffs, cancellation semantics                                      |
| `reference/wizard/state-transitions.md` | Wizard state machine: transitions, action->state tables, resets, hotkey-to-step mapping, per-screen structural keys |
| `reference/store-map.md`                | `WizardState` shape, every action, store consumers, hydration entry point                                           |
| `reference/component-patterns.md`       | Ink component conventions, hooks, `CLI_COLORS`, `UI_SYMBOLS`, layout rules; owns the `hotkeys.ts` export list       |

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

| Doc                                            | Covers                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `reference/features/skills-and-matrix.md`      | Skills matrix loading, categories, resolution, install-mode tagging                                                   |
| `reference/skills/skill-primitives.md`         | Function inventory for `src/cli/lib/skills/`                                                                          |
| `reference/features/built-in-catalogue.md`     | `defaultStacks` / `defaultRules` fallback data and when it is bypassed                                                |
| `reference/features/source-fetch-and-cache.md` | giget fetch, cache key derivation, ID-targeted read path                                                              |
| `reference/features/compilation-pipeline.md`   | Liquid templates, agent assembly, output validation                                                                   |
| `reference/features/agent-system.md`           | Agent templates, partials, `metadata.yaml`, Liquid compilation                                                        |
| `reference/features/model-and-effort.md`       | The model/effort tuning axis end to end, and why it lives on the sub-agent                                            |
| `reference/features/plugin-system.md`          | Plugin discovery, manifest generation, installation, marketplace                                                      |
| `reference/features/operations-layer.md`       | Composable operations (source, skills, project) and their typed results, including compiled-agent removal and pruning |
| `reference/features/seed-contract.md`          | The `init --from` wire contract, imported from `@workspace/matrix/seed`                                               |
| `reference/features/code-generation.md`        | The three `scripts/` generators, their outputs, and the checks that guard them                                        |

### Types

| Doc                                   | Covers                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `reference/types/core-types.md`       | Generated unions, core data structures, type guards                                                    |
| `reference/types/operations-types.md` | Operations-layer types and edit-command types                                                          |
| `reference/types/zod-schemas.md`      | Zod schemas in `src/cli/lib/schemas.ts` (owns the schema count)                                        |
| `reference/type-system.md`            | Owns the five union member counts and the `AGENT_NAMES` roster; redirects everything else to `types/*` |

### Testing

| Doc                                       | Covers                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `reference/testing/infrastructure.md`     | Vitest config, test projects, directory structure, render patterns               |
| `reference/testing/factories.md`          | Factory, helper and assertion inventories                                        |
| `reference/testing/mock-data.md`          | `SKILLS` registry, `TEST_CATEGORIES`, mock-data constants                        |
| `reference/testing/e2e-infrastructure.md` | E2E config, page objects, matchers, fixtures, timeouts, `STEP_TEXT`              |
| `reference/testing/harness-decisions.md`  | Harness alternatives already rejected, and the CLI behaviour a test must satisfy |

---

## Pointers

Redirect stubs across the whole of `.ai-docs/`, kept because inbound links still use the path. Each
holds a redirect table and no content; its `last_validated` records link integrity only. A stub that
starts stating a fact its destination does not own has stopped being a stub — file it with the
bodies instead, which is why `reference/type-system.md` is listed under Types.

| Pointer                                      | Canonical body                          |
| -------------------------------------------- | --------------------------------------- |
| `reference/architecture/overview.md`         | `reference/architecture-overview.md`    |
| `reference/architecture/dependency-graph.md` | `reference/dependency-graph.md`         |
| `reference/architecture/boundary-map.md`     | `reference/boundary-map.md`             |
| `reference/commands.md`                      | `reference/commands/index.md`           |
| `reference/state-transitions.md`             | `reference/wizard/state-transitions.md` |
| `reference/config/configuration.md`          | `reference/features/configuration.md`   |
| `reference/wizard/flow.md`                   | `reference/features/wizard-flow.md`     |
| `reference/wizard/store-map.md`              | `reference/store-map.md`                |
| `reference/wizard/component-patterns.md`     | `reference/component-patterns.md`       |
| `reference/test-infrastructure.md`           | `reference/testing/*`                   |
| `standards/e2e-testing-bible.md`             | `standards/e2e/`                        |

**Direction is per-pair, not positional.** `commands.md` and `state-transitions.md` are root-level
pointers whose bodies live in subdirectories. Determine direction by reading both files.

---

## Standards

Prescriptive rules for code, tests and documentation. Owned by convention-keeper. Every row is
scoped to `packages/cli` except `editor-and-worker.md`, which is the one standard written for the
workspaces on the other side of the repository.

| Doc                                   | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `standards/clean-code-standards.md`   | Code-quality rules, numbered by section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `standards/editor-and-worker.md`      | `apps/editor`, `apps/server` and the packages they share: what a published catalogue must carry for a consumer to refuse an entry, the route paths and `hc` coverage the RPC client imposes, `exposeHeaders`, bounding a request's fan-out, when a workspace is consumed as source rather than as an emitted declaration, what `persist` stores owe — hydration order, writes, foreign state, and credential keying — what a discard may report, whether reporting a loss to observability discharges the duty to tell the user, and why an act reachable through two controls belongs in a module both call |
| `standards/documentation-bible.md`    | How `.ai-docs/` is written and maintained                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `standards/e2e/`                      | E2E sub-standards: structure, assertions, page objects, test data, patterns, anti-patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `standards/e2e/user-journeys.md`      | The journeys the suite must cover, the four assertion surfaces each owes, per-journey coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `standards/typescript-types-bible.md` | Type-authoring rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `standards/prompt-bible.md`           | Prompt phrasing, XML tags, delegation shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `standards/loop-prompts-bible.md`     | Loop cadence, iteration discipline, synthesis passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `standards/skill-atomicity-bible.md`  | Skill decomposition rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `standards/skill-atomicity-primer.md` | Short form of the above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `standards/commit-protocol.md`        | Commit message and release conventions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## Agent Findings and Suggestions

`agent-findings/` holds dated point-in-time evidence — the deliberate exception to the
current-state rule. It is not swept, re-validated or pruned. See `agent-findings/README.md` for the
pipeline and `agent-findings/TEMPLATE.md` for the frontmatter schema.

`agent-suggestions/` holds forward-looking proposals; see its `README.md` for the status enum.

---

## Coverage

This section owns the source and E2E file totals; no other doc restates them. Re-derive with
`find`, never carry forward — and re-derive with the invocations below rather than one of your own,
because what a total counts is the half that drifts silently. "TypeScript files" is `.ts` **and**
`.tsx` here, `.d.ts` included; `src/cli/` has both extensions and `e2e/` has none of the second, so
a reader who guesses wrong is right about one of them and cannot tell which.

- **`src/cli/`:** 398 TypeScript files — 165 specs (`*.test.ts(x)`), the rest production and test
  support.

  ```
  find src/cli -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
  find src/cli -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l
  ```

- **`e2e/`:** TypeScript files — specs, plus helpers, fixtures and page objects. The specs split
  into `*.e2e.test.ts` (the `e2e` project, what `test:e2e` runs) and `*.smoke.test.ts` (the
  `smoke` project, run explicitly by `test:smoke`). The two `include` globs in
  `e2e/vitest.config.ts` are the only thing that separates them.

  ```
  find e2e -type f -name '*.ts' | wc -l
  find e2e -type f -name '*.e2e.test.ts' | wc -l
  find e2e -type f -name '*.smoke.test.ts' | wc -l
  ```

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
`src/**/*.{ts,tsx}`, `e2e/**/*.ts` and `scripts/**/*.ts`. It does not compose the recommended sets
itself — it extends `baseConfig` and `typeCheckedConfig(import.meta.dirname)` from
`@workspace/eslint-config/base`, which between them bring `js.configs.recommended`,
`tseslint.configs.recommended` and `tseslint.configs.recommendedTypeChecked`, with
`eslint-config-prettier` last so ESLint never reports formatting. `typeCheckedConfig` is a function
because `tsconfigRootDir` has to be the consuming workspace's own directory.

**Three rules the shared config adds beyond those recommended sets**, so anything it adds next
arrives here on its own: `no-self-compare` (core ESLint, in `baseConfig`; it lives in the shared
base rather than in this package so every workspace refuses `x === x`, and
`src/cli/lib/__tests__/spec-gates.test.ts` lints the shared base ALONE to prove the base rather than
this package carries it), and `@typescript-eslint/no-unnecessary-condition` plus
`@typescript-eslint/consistent-type-assertions` (`assertionStyle: "as"`,
`objectLiteralTypeAssertions: "never"`) in `typeCheckedConfig`. `baseConfig` also sets the
`no-unused-vars` leading-underscore options; this package restates them because a rule's options do
not merge across config blocks, adding only `caughtErrorsIgnorePattern`.

| Layer                                                       | Scope                                                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linterOptions.reportUnusedDisableDirectives: "error"`      | Repo-wide                                                  | A disable comment whose rule no longer fires fails the run                                                                                                                                                                                                                                                                                                                                                             |
| `@typescript-eslint/no-unused-vars`                         | All TS sources                                             | Honours the leading-underscore convention                                                                                                                                                                                                                                                                                                                                                                              |
| `eslint-plugin-react-hooks`                                 | `src/cli/**/*.tsx`, `components/**/*.ts`, `stores/**/*.ts` | `rules-of-hooks` + `exhaustive-deps`, both `error` — **exactly those two**, because the v7 recommended set's React-Compiler rules outlaw Ink's measure-on-a-ref idiom                                                                                                                                                                                                                                                  |
| `no-restricted-syntax` (task IDs)                           | Test files and fixtures                                    | Bans task IDs in `describe`/`it`/`test` names and `expect` messages; file-level JSDoc is the sanctioned home                                                                                                                                                                                                                                                                                                           |
| `@typescript-eslint/triple-slash-reference: off`            | `**/*.d.ts`                                                | The correct idiom in a declaration file; for `@lydell/node-pty` it is the only reachable one                                                                                                                                                                                                                                                                                                                           |
| `no-restricted-imports` / `no-restricted-syntax` (L2 zones) | Five nested zones                                          | Config-gate enforcement: private-module bans, raw-write bans, pair-renderer bans. Every block above excludes `src/cli/lib/config-gate/**`, so that zone inherits nothing from them and restates the vacuous-comparison selectors itself. `src/cli/lib/__tests__/spec-gates.test.ts` is the mutation proof for the selector family: per zone it asserts the vacuous shape IS reported and the discriminating one is not |

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
order.

**All three checks are now runnable by a sub-agent.** Each compares emitted bytes against the bytes
on disk and names every drifted path; none reads git state. Two of them used to be
`<generator> && git diff --exit-code <path>`, which no agent could run under the no-write-git rule
and which answered a different question anyway on a curated working tree.
`standards/commit-protocol.md` carries the rule and
`reference/features/code-generation.md` the detail.

**The generator checks are not the only gates under `scripts/`.** A set of `scripts/check-*.ts` sits
beside them, and they split by whether anything but a spec can invoke them. Re-derive the split
rather than carrying it — and do not filter with `grep -v test`, because
`check-shared-vitest-config` contains the word:

```
ls scripts/check-*.ts | grep -v '\.test\.ts$'   # every checker
ls scripts/run-check-*.ts                        # the ones something else can invoke
```

The three with a `run-*` entry point walk every workspace in the monorepo —
`check-shared-tsconfig`, `check-shared-vitest-config`, `check-shared-eslint-config` — and the
REPOSITORY-root manifest invokes all three from its `deps:check` script; `packages/cli`'s own
manifest names none of them. `reference/monorepo-layout.md` carries them, their opt-out comments and
who is bound. None of the rest has a runner or a manifest entry anywhere, so **the suite beside each
one is the only way it runs**:

| Checker                      | Judges                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-enumeration-drift`    | A document's list of names against the membership of the symbol, module or directory it claims to enumerate — and, where a row asks for pairs, the VALUE each named member holds                                                                                                            |
| `check-finding-citations`    | Every finding cited by basename from `todo/` (all citations) or `changelogs/` (bracketed links only) still exists in `agent-findings/` or `agent-suggestions/`. `.ai-docs/` is deliberately out of scope, because `agent-findings/INDEX.md` names deleted findings on purpose               |
| `check-findings-frontmatter` | Every `agent-findings/` block parses, declares a `root_cause` read out of `TEMPLATE.md`'s own frontmatter, and is not an uncross-linked duplicate                                                                                                                                           |
| `check-screen-sentinels`     | An `e2e/pages/constants.ts` literal a page object WAITS on against the string the product paints — drift there times out rather than asserting                                                                                                                                              |
| `check-spawn-doors`          | Every site that starts the built binary hands it `NO_BACKGROUND_VERSION_CHECK`. Judged per DOOR, following a spawn's env expression through the local declarations it names, and recognising a door by the binary path it hands the spawn rather than by the constant it reaches it through |

**A documentation edit can turn that suite red, and that is the point.** After changing any document
that states a list, run `npx vitest run --project unit scripts/` from `packages/cli`. Which document
sections are bound is stated in the documents themselves, not restated here.
