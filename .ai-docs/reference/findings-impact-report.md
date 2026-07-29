---
scope: reference
area: architecture
keywords: [findings, agent-findings, impact, cross-reference]
related:
  - reference/architecture-overview.md
  - reference/test-infrastructure.md
  - reference/concepts/tombstone-pattern.md
  - reference/config/config-writer.md
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-07-24
---

# Agent Findings Impact Report

**Generated:** 2026-03-28 (original); prior full regeneration 2026-04-21 (Ralph iter 92); **last full regeneration 2026-07-23** (rebuilt from the 95 finding files then on disk); **2026-07-24 incremental append** — 4 D-226/D-219 E2E-harness findings added under "Incremental Updates" (primary tables intentionally unchanged per the append flow).
**Total Findings Catalogued:** 99 on disk (excluding `README.md` and `TEMPLATE.md`; no `audits/` subdirectory exists — every finding lives at the directory root). The primary rollup tables below reflect the 95-finding 2026-07-23 regeneration snapshot; the 4 findings filed 2026-07-24 live in "Incremental Updates" until the next full regeneration.
**Date Range:** 2026-04-17 to 2026-07-23 (latest finding filed 2026-07-20; window closed at the 2026-07-23 regeneration). The 2026-03-21..2026-04-16 findings referenced by earlier regenerations have since been moved, superseded, or archived off-disk; the rollups below reflect only the 95 files present now.

> **Regeneration Policy:** Per `documentation-bible.md` ("Findings Impact Report Regeneration"), the report is fully regenerated when "Incremental Updates" exceeds ~10 entries, when the oldest un-aggregated finding is >30 days old, or when a major release bundle ships. This 2026-07-23 regeneration rebuilds every primary table from scratch against on-disk frontmatter, consolidates systemic patterns (re-lettered A..M), preserves the 2026-03-28 "Original Snapshot" verbatim for history, and resets "Incremental Updates" to empty.

---

## Rollups (2026-07-23 regeneration — 95 findings on disk)

Counts are computed directly from the YAML frontmatter of the 95 finding files (`root_cause`, `severity`, `category`, `domain`, `status`, `date`). `README.md` and `TEMPLATE.md` are excluded.

### By Status

| Status     | Count | Share |
| ---------- | ----- | ----- |
| `open`     | 60    | 63.2% |
| `partial`  | 17    | 17.9% |
| `resolved` | 18    | 18.9% |
| **Total**  | 95    | 100%  |

- `open` = 26 files with explicit `status: open` + 34 files with no `status:` field (README default is `open`).
- `partial` = docs/standards side landed, load-bearing code-side fix still pending (`partial_note:` present).
- `resolved` = anti-pattern fixed or standard fully updated (`resolved_by:` present).
- No file carries `status: superseded`. One file (`2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse.md`) has a `superseded_by:` link without the paired `status: superseded`, so it counts as `open` here — a minor frontmatter inconsistency, not a separate bucket.

**Open vs closed:** closed (`resolved`) = 18 (18.9%). Not closed (`open` + `partial`) = 77 (81.1%).

### By Date (filing day)

| Date       | Count | Theme of the batch                                                                                                                   |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | 1     | Shared config/stack parser duplication                                                                                               |
| 2026-04-18 | 1     | `mergeConfigs` drops `projects` field                                                                                                |
| 2026-04-20 | 2     | D-217 installMode dead plumbing; newly-toggled agent defaults to global scope                                                        |
| 2026-04-21 | 13    | Dual-scope/tombstone cluster, E2E keypress rule, findings-system self-governance                                                     |
| 2026-04-22 | 6     | Edit-mode scope-awareness audit, tombstone/checkbox, mode-migrator, plugin-uninstall asymmetry                                       |
| 2026-07-09 | 1     | Marketplace schema stricter-than-contract                                                                                            |
| 2026-07-17 | 4     | D-167 task-ID lint guard, D-227 preselect/tombstone reachability, E2E helper test home                                               |
| 2026-07-18 | 10    | Dual-scope collapse doc-vs-code, propagation recompile, scope guards read stale hydration snapshot                                   |
| 2026-07-19 | 11    | Config-as-text vs structural load, union-sweep type safety, Ink post-mount race, parser dedup                                        |
| 2026-07-20 | 46    | Pass-8 shared-infra adoption sweep: fixtures, config normalizers, scope authority, renderer determinism, toast + page-object hygiene |
| **Total**  | 95    |                                                                                                                                      |

### By Root Cause

| Root Cause                  | Count | Canonical remedy                                   |
| --------------------------- | ----- | -------------------------------------------------- |
| `convention-undocumented`   | 37    | Add rule to standards doc; cite in CLAUDE.md       |
| `rule-not-specific-enough`  | 29    | Tighten rule wording with enumerated cases         |
| `enforcement-gap`           | 15    | Add lint/typecheck/coverage-as-policy requirement  |
| `missing-rule`              | 9     | Author a new rule from scratch                     |
| `scope-discipline-deferred` | 3     | Knowingly left in-scope; track as TODO             |
| `rule-not-visible`          | 2     | Cross-link rule from other docs; move to prominent |
| **Total**                   | 95    |                                                    |

### By Severity

| Severity  | Count | Share |
| --------- | ----- | ----- |
| high      | 19    | 20.0% |
| medium    | 50    | 52.6% |
| low       | 26    | 27.4% |
| **Total** | 95    | 100%  |

### By Category

| Category     | Count |
| ------------ | ----- |
| testing      | 42    |
| architecture | 34    |
| dry          | 9     |
| typescript   | 8     |
| complexity   | 2     |
| **Total**    | 95    |

### By Domain

| Domain    | Count |
| --------- | ----- |
| e2e       | 46    |
| cli       | 40    |
| shared    | 6     |
| infra     | 3     |
| **Total** | 95    |

---

## Per-Reference-Doc Impact (2026-07-23)

Reference docs named in the `affected_files:` / `standards_docs:` frontmatter of the 95 findings. This is the report's core cross-reference: a reference doc appearing here has at least one finding touching the behavior it documents and should be re-validated per `documentation-bible.md` "Re-Validation Triggers." Counts are frontmatter references, not distinct findings.

| Reference Doc                             | References | Priority |
| ----------------------------------------- | ---------- | -------- |
| `reference/concepts/tombstone-pattern.md` | 6          | HIGH     |
| `reference/testing/e2e-infrastructure.md` | 4          | MED      |
| `reference/config/config-writer.md`       | 3          | HIGH     |
| `reference/concepts/scope-system.md`      | 2          | HIGH     |
| `reference/config/config-merger.md`       | 2          | HIGH     |
| `reference/features/operations-layer.md`  | 2          | MED      |
| `reference/features/plugin-system.md`     | 1          | MED      |
| `reference/wizard/store-map.md`           | 1          | MED      |
| `reference/concepts/guard-pattern.md`     | 1          | MED      |
| `reference/features/skills-and-matrix.md` | 1          | LOW      |
| `reference/commands/edit.md`              | 1          | HIGH     |

> **Scope note:** most of these 95 findings name `.ai-docs/standards/**` docs (convention-keeper's domain), not reference docs. Top standards targets, for prioritization only: `standards/e2e/anti-patterns.md` (27), `standards/e2e/README.md` (23), `standards/e2e/page-objects.md` (6), `standards/clean-code-standards.md` (5), `standards/e2e/assertions.md` (4). Those are out of scope for this reference-doc report but drive the same underlying patterns below.

## Per-Source-File Churn (2026-07-23)

Source / E2E files most frequently named in `affected_files:` (>= 5 findings). High churn signals which reference doc needs the tightest validation cadence.

| Source File                                   | Findings | Reference doc(s) to re-validate                                                     |
| --------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `src/cli/stores/wizard-store.ts`              | 16       | `wizard/store-map.md`, `concepts/tombstone-pattern.md`, `concepts/guard-pattern.md` |
| `src/cli/lib/installation/local-installer.ts` | 15       | `features/plugin-system.md`, `config/config-writer.md`                              |
| `src/cli/commands/edit.tsx`                   | 9        | `commands/edit.md`                                                                  |
| `e2e/pages/steps/build-step.ts`               | 7        | `testing/e2e-infrastructure.md`                                                     |
| `e2e/fixtures/dual-scope-helpers.ts`          | 6        | `testing/e2e-infrastructure.md`                                                     |
| `e2e/fixtures/expected-values.ts`             | 6        | `testing/e2e-infrastructure.md`                                                     |
| `src/cli/lib/configuration/config-merger.ts`  | 5        | `config/config-merger.md`                                                           |
| `src/cli/lib/installation/mode-migrator.ts`   | 5        | `features/plugin-system.md`                                                         |
| `src/cli/commands/init.tsx`                   | 5        | `commands/index.md`                                                                 |
| `e2e/pages/steps/agents-step.ts`              | 5        | `testing/e2e-infrastructure.md`                                                     |
| `e2e/pages/steps/confirm-step.ts`             | 5        | `testing/e2e-infrastructure.md`                                                     |
| `e2e/helpers/test-utils.ts`                   | 5        | `testing/e2e-infrastructure.md`                                                     |

## Systemic Patterns (2026-07-23 regeneration)

Consolidated from the 95 on-disk findings, re-lettered A..M (the pre-2026-07-23 numbered patterns are preserved in the Original Snapshot below; they described the 2026-03/04 finding set, most of which is now archived off-disk). Each pattern lists representative finding slugs (date prefixes omitted for brevity), the shared root cause, and the remedy plus the reference doc that should absorb it.

### Pattern A — Scope authority decided in several disagreeing places (project vs global)

- Findings: `scope-authority-must-follow-work-performed`, `project-context-edit-lacked-scope-authority-gate`, `project-materialisation-rode-on-stale-global-config-diff`, `edit-hasanychanges-gate-blocks-project-materialisation`, `single-scope-path-reported-for-scope-split-artifacts`, `edit-mode-scope-awareness-systemic-audit`, `newly-toggled-agent-defaults-global-breaks-project-scope-stack`.
- Root cause: "who may write global state / which scope owns this artifact" is decided independently in `edit.tsx`, `wizard-store.ts` guards, and installer paths, and the copies disagree — a project-context run could perform a destructive global change or report a single path for scope-split artifacts.
- Remedy: centralize the scope-authority gate; CLAUDE.md "Scope Awareness (project vs global)" rules (several already added). Reference docs: `concepts/scope-system.md`, `commands/edit.md`.

### Pattern B — Multiple functions produce/normalize the same config with divergent contracts

- Findings: `config-merge-functions-disagree-on-source-identity`, `two-config-normalisers-sorted-vs-order-preserving`, `near-duplicate-config-normalizers-block-shared-adoption`, `empty-union-string-fallback-disables-generated-type-safety`, `mergeConfigs-drops-projects-field`, `mergeconfigs-projects-drop-fixed-docs-stale`, `d233-projects-normalization-asymmetry`.
- Root cause: `config-merger.ts` / `config-writer.ts` / `config-generator.ts` each treat source-identity metadata, the `projects` field, sort order, and empty-install state differently; no single documented contract.
- Remedy: document the merge/normalize contract and source-identity handling. Reference docs: `config/config-merger.md`, `config/config-writer.md`.

### Pattern C — E2E reads config.ts as raw text or softens a null load instead of structural load + strict assert

- Findings: `config-text-regex-extraction-vs-structural-load`, `config-text-line-scanner-survives-behaviour-preserving-sweep`, `e2e-regex-config-extractors-block-structural-load-adoption`, `structural-config-load-erases-writer-compaction`, `e2e-unretirable-extractors-and-package-json-author-double-cast`, `config-load-null-fallback-hides-vacuous-assertions`, `e2e-config-load-null-check-silent-fallbacks`.
- Root cause: specs `.match()` / `split('\n')` over raw `config.ts` text, or `?? {}` a `LoadedProjectConfig | null`, producing vacuous passes that survive behaviour-preserving sweeps.
- Remedy: "Never soften a config load" + structural `loadProjectConfigFromDir`. Standards: `standards/e2e/anti-patterns.md` (convention-keeper). Reference: `testing/e2e-infrastructure.md`.

### Pattern D — Page-object keypress-before-render rule + footer-specific sentinel under-enforced

- Findings: `waitforstablerender-renamed-to-waitforwizardfooter`, `waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive`, `e2e-keypress-guard-sweep-landed-sync-abort-carveout`, `e2e-build-step-keypress-missing-stable-render`, `e2e-keypress-rule-coverage-gap-sibling-steps`, `page-object-adoption-must-not-silently-change-sentinel-or-budget`, `confirmstep-hardcoded-sentinel-and-timeout-blocks-migration`, `page-object-speculative-api-and-misleading-method-names`.
- Root cause: keypress methods must call `waitForWizardFooter()` first, but coverage-as-policy is incomplete and the sentinel is wizard-footer-specific (hangs on footer-less screens); sentinel/timeout hard-coded in page objects blocks reuse.
- Remedy: enumerated coverage list in `standards/e2e/page-objects.md` (convention-keeper). Reference: `testing/e2e-infrastructure.md`.

### Pattern E — Shared-fixture/constant DRY adoption boundary unclear; readonly-const friction at mutable option sites

- Findings: `e2e-shared-fixture-literals-scope-boundary`, `shared-fixture-const-vs-file-local-const-adoption-boundary`, `e2e-skill-constant-adoption-boundary`, `fixture-inlining-trades-one-local-helper-for-ten-copies`, `readonly-const-fixtures-unadoptable-at-mutable-matcher-options`, `shared-mutable-constants-and-false-dry`, `matcher-augmentation-inline-shape-defeats-drift-guard`, `step-text-constants-must-mirror-asserted-string-not-rendered-string`, `shared-config-stack-parser`.
- Root cause: "always use shared fixtures" collides with "keep a file-local const when file-scoped"; `as const` readonly tuples don't fit mutable matcher option bags; `STEP_TEXT` ambiguity (asserted vs rendered string).
- Remedy: fixtures/test-data rules in `standards/e2e/README.md`; widen matcher option element types to `readonly string[]`. Reference: `testing/e2e-infrastructure.md`.

### Pattern F — Deterministic renderer can't express the fixture shape → inline-template carve-outs

- Findings: `rendermetadatayaml-cannot-omit-contenthash`, `rendermetadatayaml-fixed-field-order-changes-emitted-bytes`, `invalid-by-design-metadata-fixture-is-permanent-renderer-carveout`, `writetestpackagejson-override-type-inferred-from-fixture-value`.
- Root cause: `renderMetadataYaml()` (`content-generators.ts`) can't omit `contentHash` or vary field order, forcing byte-exact tests to hand-write template strings CLAUDE.md bans.
- Remedy: renderer-adoption rule + carve-out note in `standards/e2e/test-data.md` (convention-keeper). Reference: `testing/e2e-infrastructure.md`.

### Pattern G — Assertions pin state the test's own action did not produce (coverage / vacuous)

- Findings: `setup-owned-state-pinned-by-action-scoped-assertions`, `live-in-session-selected-state-uncovered-badge-only-assertions`, `toggle-selection-array-diverges-from-reconciled-active-state`, `init-dashboard-plugin-test-vacuous-project-scope`, `d228-e2e-vacuous-pass-via-home-edit`, `d227-preselect-fix-not-e2e-reachable`.
- Root cause: absolute assertions on setup-owned state; badge-only assertions miss live selection; "project scope" tests sharing `HOME=projectDir` pass vacuously.
- Remedy: "Assert on what your action changed" in `standards/e2e/anti-patterns.md` (convention-keeper). Reference: `testing/e2e-infrastructure.md`.

### Pattern H — Field name ≠ field contents; derived slug/category/display hides the wrong value

- Findings: `field-name-meaning-mismatch-marketplace-display-name`, `filesystem-listings-must-print-on-disk-names`, `project-builder-derived-slug-hid-wrong-category`, `fixture-category-literals-unvalidated-against-categories-union`, `e2e-agent-name-vs-display-constant-gap`.
- Root cause: a field named for one concept is populated from another and rendered as a third; test fixtures derive `category`/`slug` by string-splitting IDs, yielding categories absent from the `CATEGORIES` union.
- Remedy: "Field Names Must Match Field Contents" in `standards/clean-code-standards.md`; validate fixture literals against the union. Reference: `features/skills-and-matrix.md`.

### Pattern I — Mechanical union/const refactor sweeps lack carve-outs; `scripts/` untypechecked

- Findings: `type-position-vs-emitted-code-string-in-union-sweeps`, `untypechecked-scripts-hid-phantom-tags-and-invalid-skillids`, `as-const-satisfies-on-object-with-getter-widens-return`, `empty-union-string-fallback-disables-generated-type-safety`, `aggressive-regex-corrupts-structured-test-fixtures`.
- Root cause: "replace every inline union / add `as const satisfies`" ledgers applied blindly corrupt template strings, widen getter return types, and disable generated type safety; `scripts/` is never type-checked.
- Remedy: type-narrowing carve-outs ("TYPE-position only; skip template strings"); add `typecheck:scripts`; ban greedy multi-line regex on structured fixtures. Reference: `type-system.md` (in `related:` chain).

### Pattern J — `local-installer.ts` grows return channels / swallows errors without a caller contract

- Findings: `propagation-skipped-observability-gap`, `registerProjectPath-sweep-observability-gap`, `propagation-skips-agent-recompile`, `error-swallowing-systemic-gap`, `d233-projects-normalization-asymmetry`, `installer-consuming-operations-layer-cycle`.
- Root cause: new `skipped` / sweep return values that no production caller inspects; disk-write/registry failures logged via `warn()`/`verbose()` and swallowed; a lib module statically importing the operations layer inverts dependency direction.
- Remedy: caller-inspection contract in `config/config-writer.md`; dependency-direction rule in `features/operations-layer.md`.

### Pattern K — Tombstone / dual-scope collapse behavior documented at the wrong layer or incompletely

- Findings: `dual-scope-agent-s-toggle-guarded-noop-not-collapse`, `dual-scope-s-toggle-persisted-pair-doc-vs-code`, `d233-agent-collapse-fix-in-toggleagent-action-not-helper`, `sourceById-collapse-unreachable-in-production`, `agent-toggle-checkbox-ignores-excluded-tombstone`, `excluded-agent-tombstone-vs-selected-agents-mismatch`, `d227-same-scope-active-tombstone-duplicate`.
- Root cause: tombstone/collapse semantics live in the store action, but docs point at a private helper (`applyAgentToggle`) → repeated "wrong-layer" misdiagnosis; guarded no-op vs collapse distinction not called out.
- Remedy: name the authoritative layer and the guarded-no-op case in `concepts/tombstone-pattern.md` and `wizard/store-map.md` Internal Helpers.

### Pattern L — A synchronous Ink input handler reads async-seeded / stale-hydration state

- Findings: `async-post-mount-seed-read-by-sync-input-handler`, `scope-guards-read-stale-hydration-snapshot`, `module-load-time-homedir-capture-latent-mock-bug`, `ink-prompt-closure-lets-hang-anti-pattern`.
- Root cause: a synchronous `useInput` handler reads state seeded asynchronously post-mount (or a stale immutable hydration snapshot); `os.homedir()` captured at module-load defeats test mocks.
- Remedy: seed sync-read state synchronously in the store; guard-authoring rule in `concepts/guard-pattern.md`; resolve scope base dirs at call time.

### Pattern M — Rules live in prose with no lint/typecheck enforcement; migration/plugin preconditions unstated

- Findings: `d167-task-id-recurrence-no-lint-guard`, `task-ids-in-test-names-sweep-needed`, `agent-findings-frontmatter-drift-iter45`, `todo-id-collisions-in-completed`, `changelog-0.42.1-orphan-release-file`, `ralph76-memory-md-stale-phase-entries`, `r73-atomicity-bible-drift`, `e2e-helper-tests-have-no-runnable-home`, `e2e-spec-files-accumulate-unused-imports-unenforced`, `command-delegation-must-carry-caller-intent`, `migration-path-missing-marketplace-precondition`, `plugin-uninstall-bare-id-asymmetry-with-install`, `mode-migrator-single-scope-uninstall-cwd-ambiguity`, `marketplace-schema-name-laxer-than-claude-code`, `parsefrontmatter-crlf-and-invalid-yaml-null`.
- Root cause: rules exist only in prose (task-IDs in test names, findings frontmatter, unused imports, delegation caller-intent, marketplace precondition before `claudePluginInstall`), so drift recurs; two parsers diverge on the same on-disk shape.
- Remedy: add ESLint/typecheck gates (`e2e/tsconfig.json`, task-ID lint rule, `typecheck:scripts`); one extractor per on-disk concern; document plugin/migration marketplace preconditions and bare-id/qualified-id symmetry.

## Priority Actions (2026-07-23 regeneration)

19 findings are `high` severity: 5 `resolved`, 14 still open/partial. The open high-severity set is dominated by `cli`/`architecture` scope-authority and config-merge work (Patterns A, B, J) plus one high `e2e` toast-assertion finding (Pattern G).

### HIGH priority

1. **Pattern A closure (scope authority)** — 6 open high-severity findings (`scope-authority-must-follow-work-performed`, `project-context-edit-lacked-scope-authority-gate`, `single-scope-path-reported-for-scope-split-artifacts`, `edit-mode-scope-awareness-systemic-audit`, `excluded-agent-tombstone-vs-selected-agents-mismatch`, `agent-toggle-checkbox-ignores-excluded-tombstone`). Centralize the project→global authority gate; then re-validate `concepts/scope-system.md`, `commands/edit.md`.
2. **Pattern B closure (config merge contract)** — `config-merge-functions-disagree-on-source-identity` (high, partial). Land the source-identity contract; refresh `config/config-merger.md` + `config/config-writer.md`.
3. **Pattern J / migration preconditions** — `migration-path-missing-marketplace-precondition`, `plugin-uninstall-bare-id-asymmetry-with-install`, `error-swallowing-systemic-gap` (all high, open). Establish marketplace precondition + caller-inspection contract; refresh `features/plugin-system.md`, `features/operations-layer.md`.
4. **Pattern D sentinel** — `waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive` (high, partial). Complete the enumerated keypress coverage list; refresh `testing/e2e-infrastructure.md`.
5. **`command-delegation-must-carry-caller-intent`** (high, open) — `init.tsx` delegates with no argv/context; codify caller-intent plumbing, cross-ref `commands/edit.md`.

### MEDIUM priority

6. **Pattern K (tombstone doc-layer)** — refresh `concepts/tombstone-pattern.md` (6 references, most-referenced reference doc) and `wizard/store-map.md` Internal Helpers to name the authoritative collapse layer.
7. **Patterns C / E / G (E2E hygiene)** — 17 partial findings await code-side landing; re-validate `testing/e2e-infrastructure.md` after the shared-infra adoption sweep settles.
8. **Pattern L (Ink hydration race)** — add the guard-authoring rule to `concepts/guard-pattern.md`.

### LOW priority

9. **Findings-system self-audit** — run the ~10-iter findings-directory self-audit (frontmatter completeness, the one `superseded_by:`-without-`status:` inconsistency noted under By Status).
10. **`scripts/` typecheck gate** — `untypechecked-scripts-hid-phantom-tags-and-invalid-skillids` (Pattern I); add `typecheck:scripts`.

---

## Original Snapshot (2026-03-21..2026-03-28, 75 findings)

## Summary Table

| Reference Doc                   | Findings Count | Stale Info | Missing Info | Priority |
| ------------------------------- | -------------- | ---------- | ------------ | -------- |
| test-infrastructure.md          | 9              | 2          | 3            | HIGH     |
| commands.md                     | 2              | 1          | 1            | MED      |
| component-patterns.md           | 1              | 0          | 1            | LOW      |
| store-map.md                    | 1              | 0          | 0            | LOW      |
| configuration.md                | 5              | 1          | 2            | HIGH     |
| skills-and-matrix.md            | 1              | 0          | 1            | LOW      |
| plugin-system.md                | 1              | 0          | 0            | LOW      |
| utilities.md                    | 0              | 0          | 0            | --       |
| type-system.md                  | 0              | 0          | 0            | --       |
| compilation-pipeline.md         | 0              | 0          | 0            | --       |
| wizard-flow.md                  | 0              | 0          | 0            | --       |
| architecture-overview.md        | 1              | 0          | 1            | LOW      |
| operations-layer.md             | 1              | 0          | 1            | LOW      |
| **agent-system.md (MISSING)**   | 14             | --         | 14           | **HIGH** |
| **skills-content.md (MISSING)** | 38             | --         | 38           | **HIGH** |
| Uncategorized                   | 3              | --         | --           | LOW      |

---

## Detailed Impact per Reference Doc

### 1. test-infrastructure.md -- 9 findings (HIGH)

| Finding                                                  | Summary                                                                             | Impact Type                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `2026-03-21-claudemd-violations-in-framework.md`         | E2E framework code had double casts, unnecessary union casts, backward-compat shims | Missing: E2E framework patterns not documented                  |
| `2026-03-21-duplicated-e2e-constants.md`                 | Path/timeout constants duplicated locally in 10+ E2E files instead of centralized   | Missing: `SOURCE_PATHS` and new `TIMEOUTS.*` entries not in doc |
| `2026-03-21-duplicated-e2e-helpers.md`                   | Helper functions duplicated in 8+ E2E files instead of shared                       | Missing: new shared helpers not catalogued                      |
| `2026-03-21-missing-test-cleanup.md`                     | Missing `afterAll` cleanup, unused variables, `as any` casts in E2E tests           | Stale: cleanup patterns section may need reinforcement          |
| `2026-03-21-toequal-vs-tostrictequal.md`                 | `toEqual` used where `toStrictEqual` required for objects                           | Missing: `toStrictEqual` rule not documented in test-infra doc  |
| `2026-03-23-e2e-undefined-assertion-and-raw-readfile.md` | 34 `undefined!` assertions and 6 raw `readFile` calls in E2E                        | Stale: anti-patterns not in documented patterns                 |
| `2026-03-25-inline-test-data-in-build-step-logic.md`     | Inline mock skill construction instead of using `SKILLS.*` constants                | Missing: mock data discipline not cross-referenced              |
| `2026-03-25-unnecessary-internal-mocks.md`               | 12+ test files mock pure functions unnecessarily                                    | Missing: mocking guidelines not documented                      |
| `2026-03-25-unnecessary-matrix-provider-mocks.md`        | `getErrorMessage` and `consts` mocked to identical values                           | Missing: "what to mock" decision tree not documented            |

**Actions needed:**

- Add `SOURCE_PATHS` and new `TIMEOUTS.*` constants to E2E constants section
- Add shared helper catalog (new helpers from `test-utils.ts`, `dual-scope-helpers.ts`)
- Add "Mocking Guidelines" section: what to mock (I/O, env-dependent paths), what NOT to mock (pure functions, identical-value consts)
- Add `toStrictEqual` rule to assertion patterns section
- Document `readTestFile()` as canonical file reading helper
- Remove `undefined!` cleanup pattern from any examples

---

### 2. configuration.md -- 5 findings (HIGH)

| Finding                                                      | Summary                                                                                                      | Impact Type                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `2026-03-24-inlined-global-stack-not-merged.md`              | `generateProjectConfigWithInlinedGlobal` ignored global stack entirely                                       | Stale: config-writer merge behavior not accurately documented                                            |
| `2026-03-24-object-fromEntries-overwrites-duplicate-keys.md` | `Object.fromEntries()` silently dropped skills sharing same category                                         | Missing: config-generator duplicate-key pitfall not documented                                           |
| `2026-03-24-shallow-stack-merge-loses-categories.md`         | Shallow spread lost nested categories in stack merge; config-types imports wrong for self-contained config   | Missing: `mergeConfigs()` deep-merge-at-category-level and `writeStandaloneConfigTypes()` not documented |
| `2026-03-25-dead-code-and-type-cast-cleanup.md`              | Dead functions (`writeProjectConfigTypes`, `compactStackForYaml`), type inconsistency in blank global config | Stale: dead code removal not reflected in doc                                                            |
| `matrix-loading-performance.md`                              | Matrix loading performance characteristics and anti-patterns in source-loader.ts shallow spreads             | Missing: performance characteristics and loading strategy not documented                                 |

**Actions needed:**

- Update config-writer section to document `mergeConfigs()` (in `config-merger.ts`) and its deep-merge-at-category-level pattern for stacks
- Update config-types-writer section to document `writeStandaloneConfigTypes()`
- Remove references to dead functions (`writeProjectConfigTypes`, `compactStackForYaml`, `compactAssignment`)
- Add note about `Object.fromEntries()` duplicate-key risk in config-generator
- Consider adding matrix loading performance characteristics (or create separate doc)

---

### 3. commands.md -- 2 findings (MED)

> **Post-migration note (2026-04-21):** `reference/commands.md` is now a pointer stub. Canonical content lives in [`commands/index.md`](./commands/index.md). Action items below apply to the canonical doc.

| Finding                                                 | Summary                                                                                | Impact Type                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | Init marketplace fallback path was incomplete -- skills not copied locally on fallback | Stale: init command flow missing fallback documentation  |
| `init-missing-global-compile.md`                        | `cc init` does single-pass compilation, missing global agents                          | Missing: init multi-scope compilation gap not documented |

**Actions needed:**

- Update init command flow to document marketplace fallback behavior (copy skills locally when marketplace unavailable)
- Document the multi-scope compilation gap: init only compiles to project dir, not global
- Reference compile.ts `buildCompilePasses()` pattern as the correct multi-scope approach

---

### 4. component-patterns.md -- 1 finding (LOW)

| Finding                                            | Summary                                                                                                              | Impact Type                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `2026-03-26-missing-scroll-indicator-rendering.md` | `UI_SYMBOLS.SCROLL_UP/DOWN` defined but never rendered; scroll hooks compute hidden counts but nothing displays them | Missing: scroll indicator rendering pattern not documented |

**Actions needed:**

- Add "Scroll Indicators" subsection under Virtual Scrolling documenting the gap between defined symbols/hooks and actual rendering
- Document recommended scroll indicator implementation pattern

---

### 5. skills-and-matrix.md -- 1 finding (LOW)

| Finding                         | Summary                                                                                             | Impact Type                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `matrix-loading-performance.md` | Matrix loading flow from build-time to per-command; BUILT_IN_MATRIX optimization for default source | Missing: performance-oriented loading flow not documented |

**Actions needed:**

- Consider adding a "Performance" subsection documenting BUILT_IN_MATRIX optimization, eager vs lazy loading boundary, and per-command loading costs

---

### 6. plugin-system.md -- 1 finding (LOW)

| Finding                                                 | Summary                                                                 | Impact Type                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | Marketplace fallback in init should copy skills locally but was missing | Stale: fallback behavior in installation flow |

**Actions needed:**

- Verify marketplace fallback documentation in plugin installation section

---

### 7. architecture-overview.md -- 1 finding (LOW)

| Finding                          | Summary                                                              | Impact Type                                                                           |
| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `init-missing-global-compile.md` | Init lacks multi-scope compilation pattern that compile command uses | Missing: data flow section may not document init vs compile scope handling difference |

**Actions needed:**

- Note the init/compile asymmetry in data flow or compilation section

---

### 8. operations-layer.md -- 1 finding (LOW)

| Finding                          | Summary                                                                         | Impact Type                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `init-missing-global-compile.md` | `compile-agents.ts` operations module has `scopeFilter` but init doesn't use it | Missing: operations layer doc should reference the multi-scope pattern |

**Actions needed:**

- Verify `compile-agents.ts` `scopeFilter` parameter is documented

---

### 9. store-map.md -- 1 finding (LOW)

| Finding                                                 | Summary                                                                                                      | Impact Type                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | `createDefaultSkillConfig()` sets `source: primarySource` causing `deriveInstallMode()` to return `"plugin"` | Missing: store behavior context for install mode derivation |

**Actions needed:**

- Verify `createDefaultSkillConfig()` source-setting behavior is documented

---

## Missing Reference Docs

### agent-system.md (NEW DOC NEEDED) -- 14 findings

These findings affect `src/agents/` files -- a directory with no dedicated reference documentation.

| Finding                                                              | Summary                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `2026-03-23-skill-summoner-stale-metadata-format.md`                 | Skill-summoner agent templates used stale metadata.yaml format                        |
| `2026-03-27-ai-developer-deprecated-grep-pattern.md`                 | ai-developer used deprecated OpenAI v3 grep pattern                                   |
| `2026-03-27-ai-developer-missing-config-and-stale-refs.md`           | ai-developer missing from config, stale file references, missing findings instruction |
| `2026-03-27-api-pm-missing-findings-instruction.md`                  | api-pm and web-pm missing findings capture propagation                                |
| `2026-03-27-api-tester-rate-limit-loop-off-by-one.md`                | api-tester had off-by-one in rate limit test example                                  |
| `2026-03-27-api-tester-template-duplication-and-missing-findings.md` | api-tester had template-injected content duplicated in source files                   |
| `2026-03-27-infra-reviewer-core-principles-conflict.md`              | infra-reviewer had custom `<core_principles>` conflicting with template               |
| `2026-03-27-infra-reviewer-github-actions-latest-tag-inaccuracy.md`  | infra-reviewer used `@latest` instead of `@main` for Actions tags                     |
| `2026-03-27-reviewer-agents-missing-findings-capture-instruction.md` | cli-reviewer and infra-reviewer missing findings capture instruction                  |
| `2026-03-27-planning-agents-arrow-inconsistency.md`                  | api-pm used ASCII arrows where Unicode convention applies                             |
| `2026-03-27-self-correction-arrow-convention-drift.md`               | 5 new agents used wrong arrow conventions                                             |
| `2026-03-27-core-md-pattern-numbering-disorder.md`                   | Skill examples had disordered pattern numbering                                       |
| `2026-03-27-deprecated-model-references-in-skills.md`                | AI provider skills referenced deprecated model names                                  |
| `2026-03-27-skill-metadata-missing-version-tags.md`                  | Multiple skills missing version/tags in metadata.yaml                                 |

**What this doc should cover:**

- Agent directory structure (`src/agents/{category}/{agent-name}/`)
- Agent file roles: `identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md`, `output.md`, `metadata.yaml`
- Template injection rules: what the `agent.liquid` template injects vs what source files provide
- Agent compilation: config.ts entry, `agentsinc compile`, scope routing
- Convention rules: arrow types, findings capture, no template duplication, no custom `<core_principles>`
- Relationship to skills repo: agents reference skills, metadata schema alignment

---

### skills-content.md (NEW DOC NEEDED) -- 38 findings

These findings affect skill content files in the `/home/vince/dev/skills/` sibling repo. While this is a separate repository, the CLI compiles and installs these skills. A reference doc would help agents working on skill content.

**Note:** This doc may belong in the skills repo rather than the CLI repo. Listing here for completeness since the findings were filed in the CLI repo's agent-findings pipeline.

| Category                  | Count | Key Findings                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fabricated/Wrong APIs** | 12    | Appwrite `Realtime` class, Pinecone `fetchByMetadata`, Weaviate `.use()`, Clack `p.progress`, oclif `usePaste`, Resend idempotency, OpenAI `Float64Array`, Vercel Postgres wrapper claim, PostHog defaults, Eden Treaty bracket syntax, Wrangler `--secrets-file`, Promptfoo `--fail-on-error` |
| **Cross-domain coupling** | 8     | Firebase React context, Vitest Playwright coupling, mobile Expo/RN overlap, GraphQL `@/` imports, VeeValidate React reference, Hono Server Actions, data-fetching `"use client"`, MSW React imports                                                                                            |
| **Content duplication**   | 8     | Prisma, Sanity, Payload, Drizzle, Turso SKILL.md full implementations duplicating examples; reviewing skill rationale duplication; auth-security red flags duplication; turborepo philosophy duplication                                                                                       |
| **Atomicity violations**  | 6     | UI skills naming competitors, mobile cross-contamination, SCSS module coupling in file-upload, SCSS fences for CSS, CLAUDE.md template contamination, auth library coupling                                                                                                                    |
| **Stale/wrong metadata**  | 4     | Deprecated model names, missing version/tags, NestJS SWC claim, Auth.js env var naming                                                                                                                                                                                                         |

---

## Uncategorized Findings (3)

These findings don't map cleanly to any existing or proposed reference doc:

| Finding                                                    | Summary                                                                    | Why Uncategorized                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `2026-03-27-anthropic-sdk-skill-incorrect-model-specs.md`  | Incorrect model specs in Anthropic SDK skill                               | Affects skills repo content, not CLI codebase         |
| `2026-03-27-forms-skills-magic-numbers-and-console-log.md` | Magic numbers and console.log in VeeValidate/Zod skills                    | Affects skills repo content, not CLI codebase         |
| `2026-03-27-skill-good-example-contradicts-red-flag.md`    | TypeORM good example used pattern the skill's own red flags warned against | Affects skills repo content, internal coherence issue |

---

## Systemic Patterns Detected

### Pattern 1: Agent Template Contamination (7 findings)

Multiple agent findings reveal the same root cause: agent source files duplicate content that the `agent.liquid` template injects automatically.

**Affected findings:**

- `api-tester-template-duplication-and-missing-findings.md` -- `<core_principles>` and `<write_verification_protocol>` duplicated
- `infra-reviewer-core-principles-conflict.md` -- custom `<core_principles>` conflicts with template
- `skill-metadata-and-template-contamination.md` -- CLAUDE.md references in marketplace skills

**Root cause:** No documented list of what the agent template injects, so agents created by agent-summoner include sections that end up double-rendered.

**Recommendation:** Document template-injected sections in agent-system.md. Add a post-creation validation step to agent-summoner.

---

### Pattern 2: Missing Findings Capture Instruction (5 findings)

Five separate findings discovered the same gap: agents lacking the CLAUDE.md-mandated findings capture instruction.

**Affected findings:**

- `ai-developer-missing-config-and-stale-refs.md`
- `api-pm-missing-findings-instruction.md`
- `api-tester-template-duplication-and-missing-findings.md`
- `reviewer-agents-missing-findings-capture-instruction.md`
- `self-correction-arrow-convention-drift.md` (tangentially)

**Root cause:** The findings capture instruction is in CLAUDE.md but not propagated to agent templates. Each agent must be individually patched.

**Recommendation:** Add findings capture to the agent template (`agent.liquid`) so all compiled agents get it automatically.

---

### Pattern 3: AI-Fabricated APIs in Skills (12 findings)

The largest category of skill findings involves AI-generated code that references APIs, methods, classes, CLI flags, or callback signatures that do not exist. This is a hallucination pattern.

**Examples:**

- Appwrite `Realtime` class and `Channel` helper (completely fabricated)
- Pinecone `fetchByMetadata()` (does not exist)
- Weaviate `.use()` instead of `.get()` (wrong method name)
- Promptfoo `--fail-on-error` (fabricated CLI flag)
- Resend idempotency key in wrong position (wrong API shape)
- Vercel Postgres claimed to wrap `@neondatabase/serverless` (wraps `pg`)

**Root cause:** AI models generate plausible-looking APIs that don't match real SDKs. The skill-atomicity-primer already warns about this but enforcement is inconsistent.

**Recommendation:** Strengthen the quality gate checklist in skill-atomicity-bible.md with a mandatory "verify every import and method call against official docs" step.

---

### Pattern 4: SKILL.md Content Duplication (8 findings)

Skills consistently duplicate full code implementations between SKILL.md and their example files, despite the atomicity bible requiring "brief 3-10 line snippet + link."

**Affected skills:** Prisma, Sanity, Payload, Drizzle, Turso, auth-security, turborepo, reviewing

**Root cause:** AI-generated skills create full implementations in SKILL.md and again in example files. The atomicity bible rule exists but is frequently violated in initial generation.

**Recommendation:** Add a more prominent callout in skill-atomicity-bible.md and a specific skill-summoner validation check.

---

### Pattern 5: Config Writer / Generator Bugs (4 findings)

Four findings uncovered bugs in the configuration generation pipeline, all involving merge semantics:

- Global stack not merged (shallow spread lost data)
- `Object.fromEntries()` dropped duplicate categories
- Config-types used wrong import pattern for self-contained config
- Dead code from YAML-to-TS migration not cleaned up

**Root cause:** The configuration system underwent a YAML-to-TypeScript migration and a global/project scope split. Both transitions introduced merge edge cases that weren't covered by tests.

**Recommendation:** Update configuration.md to document merge semantics, especially `mergeConfigs()` (in `config-merger.ts`) and the global-inlined vs global-imported patterns.

---

### Pattern 6: Observability gaps around `projects` + propagation in `local-installer.ts` (3 findings, 2026-04-21)

Three findings in two days (`d233-projects-normalization-asymmetry`, `propagation-skipped-observability-gap`, `registerProjectPath-sweep-observability-gap`) all point at the same module. Root cause: the module grew new return channels (`skipped`, sweep results) without a contract in `config-writer.md` requiring callers to inspect them.

### Pattern 7: E2E page-object keypress rule under-enforced (2 findings, 2026-04-21)

Two findings same day (`e2e-build-step-keypress-missing-stable-render`, `e2e-keypress-rule-coverage-gap-sibling-steps`). Rule exists in `standards/e2e/page-objects.md`, but coverage-as-policy is missing — nothing requires ALL step page-objects to comply.

### Pattern 8: Reference-doc drift sweep (iter 25–33 of Ralph loop) (9+ findings, 2026-04-21)

`dependency-graph`, `boundary-map`, `wizard/state-transitions` (canonical; `reference/state-transitions.md` is now a pointer stub post dual-home cleanup), `component-patterns` (guard + tombstone + skill-agent-summary), `store-map`, `commands/index` (×2; canonical; `reference/commands.md` is now a pointer stub post subdirectory migration), `features/wizard-flow`, `features/skills-and-matrix`, `testing/mock-data`. Root cause: no revalidation schedule during the D-2xx feature sprint. Remedy: single full-reference sweep after each D-2xx release, not per-finding patching.

---

## Priority Actions

### HIGH Priority

1. **`agent-system.md`** — DONE (created, last_validated 2026-04-21 per DOCUMENTATION_MAP).
2. **Pattern 9 closure** — run a convention-keeper iter doing a bidirectional diff between CLAUDE.md and `clean-code-standards.md`; promote missed rules.
3. **Pattern 6 closure** — surface `skipped` + sweep results in `config-writer.md` contract; document `registerProjectPath` / `deregisterProjectPath` normalization symmetry.
4. **Pattern 7 closure** — add enumerated coverage-as-policy list to `page-objects.md` for step page-objects that must call `waitForWizardFooter()` before every keypress (`BaseStep` subclasses only — the wait is a wizard-footer sentinel, not a generic stability primitive).
5. **Skills-content.md decision** — 38 skill-content findings: decide whether to create in CLI repo or migrate to `/home/vince/dev/skills/`.

### MEDIUM Priority

6. **Pattern 8 doc-drift sweep** — `commands/index.md` (canonical; `commands.md` is a pointer stub), `component-patterns.md`, `store-map.md`, `wizard/state-transitions.md` (canonical; `state-transitions.md` is a pointer stub), `features/wizard-flow.md`, `features/skills-and-matrix.md`, `features/configuration.md`, `testing/mock-data.md` — all flagged 2026-04-21. Several have been stamp-bumped without content-check (`commands-doc-stamp-without-content-check.md`).
7. **Pattern 10 closure** — complete delegation / ralph-loop / skill-content-tags sections in respective bibles (partially done per iter 68/70/74 fixes).
8. **`test-infrastructure.md`** — 9 original findings + `iter42-test-infrastructure-drifted-original.md` + `complex-helpers-in-component-tests-anti-pattern.md`. Mocking guidelines, `toStrictEqual` rule, helper catalog.

### LOW Priority

9. ~~**Backfill frontmatter** on `2026-04-13-e2e-anti-pattern-audit-d168.md` (unset `root_cause`/`severity`/`category`).~~ — DONE 2026-04-21 (`type: audit`, `severity: medium`, `category: testing`, `domain: e2e`, `root_cause: enforcement-gap`).
10. **Pattern 11 maintenance** — every ~10 iters, run a findings-directory self-audit iter.
11. **`D-NNN` task-ID sweep** — `task-ids-in-test-names-sweep-needed.md` identified ~151 instances across ~30 E2E files.

---

### Patterns 9-11 (new post-iter-40 — iter 92 regeneration)

**Pattern 9: Standards docs ↔ CLAUDE.md bidirectional drift** (4 findings, iter 67/71/90/91)

- `r73-atomicity-bible-drift.md` — bible quality-gate contradicts newer primer; stale `examples.md` references.
- ~~`iter71-bible-cross-ref-disambiguator.md`~~ — RESOLVED 2026-04-21: DOCUMENTATION_MAP.md carries `Scope disambiguator` column for both bibles; prompt-bible §8.3 now canonicalizes to `250-300 words` and cross-refs loop-prompts-bible §8.4 as SOT.
- `iter90-clean-code-standards-test-rules-drift.md` — test rules (`toStrictEqual`, no TODO IDs in names) enforced in CLAUDE.md but absent from reviewer-checkable `clean-code-standards.md`.
- `claude-md-standards-drift-iter-91.md` — bidirectional sweep found scope-awareness, fine-grained factory rules, and repo-hygiene rules in CLAUDE.md with no counterpart in standards doc.

Root cause: rules accumulate in CLAUDE.md when added in response to a slip but aren't promoted into the reviewer-checkable doc. Remedy: automated bidirectional diff in a convention-keeper iter.

**Pattern 10: Domain-bible section gaps** (3 findings, iter 68/70/74)

- `iter68-prompt-bible-missing-delegation-section.md` — prompt-bible had zero project-specific multi-agent delegation guidance.
- `iter70-loop-prompts-bible-missing-ralph-section.md` — loop-prompts-bible had zero ralph-loop mechanism coverage (completion-promise rule, single-focus, findings-as-product, report length caps, self-correction triggers).
- `iter74-prompt-bible-missing-skill-content-tags.md` — bible XML tag list missing skill-content layer (`<philosophy>`, `<patterns>`, `<red_flags>`, `<decision_framework>`, `<integration>`, `<performance>`, `<migration_notice>`).

Root cause: bibles were seeded with generic prompt-engineering content and never caught up to project-specific mechanisms (ralph-loop, skill content XML, delegation roster). Remedy: per-bible "domain completeness" audit.

**Pattern 11: Findings-system self-governance drift** (4 findings, iter 40/45/83/85)

- `findings-impact-report-no-regeneration-schedule.md` (iter 40) — this very report lacked a regeneration trigger. Fixed + codified in documentation-bible iter 49.
- `agent-findings-frontmatter-drift-iter45.md` — findings filed with `**Date:**` body lines instead of YAML frontmatter.
- `iter83-findings-status-model-codification.md` — two conflicting resolution models (directory-as-status vs frontmatter-as-status); 45 findings used frontmatter, 0 used `done/`. Frontmatter model codified; `done/` demoted to optional cold archive.
- `iter85-supersedes-asymmetry-one-way-link.md` — `supersedes:`/`superseded_by:` pair had one-way link.

Root cause: the findings directory grew past ~50 entries before anyone audited its own conventions. Remedy: every ~10 iters, run a findings-directory self-audit iter.

---

## Incremental Updates

_Reset 2026-07-23 (full regeneration — 95 findings rebuilt into the primary tables above). Next regeneration trigger: >10 entries accumulated here, OR the oldest un-aggregated finding exceeds 30 days, OR a major release bundle ships._

### 2026-07-24 — D-226 sandbox-HOME default + D-219 launcher sugar (4 findings)

A single E2E-harness bundle. The sandbox stopped collapsing `HOME` onto `cwd`/`projectDir` (both `TerminalSession` and `runCLI` now default HOME to a sibling `ai-e2e-home-*` temp dir), and scope-explicit wizard launchers (`launchInProject`/`launchInGlobal`) plus a `globalHome` echo/reuse channel were added so tests target the scope they actually edit. All four findings are `domain: e2e`, `category: testing`, filed by `cli-tester`.

**Findings → impacts:**

| Finding                                                 | Sev / root_cause / status                      | Docs touched                                                                      | Impact                                                                                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d226-stepA-breaks-43-miscategorized-tests`             | high / scope-discipline-deferred / **partial** | `testing/e2e-infrastructure.md`; `standards/e2e/anti-patterns.md`; `todo/D-226-…` | Corrected the plan's "~0-5 breakers" estimate to ~43 tests / 21 files; `runCLI` sibling-HOME default landed; the 43-test port deferred to the D-219 launcher sugar.   |
| `d226-phase1-launcher-sugar-and-multiphase-home`        | medium / scope-discipline-deferred / resolved  | `testing/e2e-infrastructure.md`                                                   | Added `launchInProject`/`launchInGlobal` + asserting `globalHome` getter, `ProjectHandle.globalHome` stamp, and `CLI.run` HOME precedence (`env > globalHome > dir`). |
| `d226-phase2-wave1-source-switch-lock-and-global-stack` | medium / rule-not-specific-enough / resolved   | `standards/e2e/anti-patterns.md`; `testing/e2e-infrastructure.md`                 | Added the `globalHome?` reuse param; codified "a source-toggle edit needs `launchInGlobal`" and "a global agent's stack lives in the global config".                  |
| `d226-phase2-wave2-uninstall-cwd-only-launcher`         | medium / rule-not-specific-enough / resolved   | `standards/e2e/anti-patterns.md`                                                  | Codified "a cwd-resolving follow-up (`cc uninstall`, `claude plugin install`) needs `launchInGlobal`, not `launchInProject` + redirect".                              |

**Actions taken (this doc round):**

- Updated `reference/testing/e2e-infrastructure.md`: `InitWizard`/`EditWizard` inventories now list `launchInProject`, `launchInGlobal`, the `globalHome` getter, and the `globalHome?` reuse option; `runCLI` and `CLI.run` HOME behaviour corrected; new "Scope & HOME model" section cross-links the anti-patterns launcher-selection rules.
- The four launcher-selection rules landed as the "Choosing the Wizard Launcher by Scope" section of `standards/e2e/anti-patterns.md` (convention-keeper's domain), so `phase1`/`phase2-wave1`/`phase2-wave2` were flipped `partial → resolved`.

**New systemic pattern (incremental, not yet promoted to the A..M table):**

- **Pattern N — E2E launcher must match the scope the test edits.** When the sandbox HOME no longer collapses onto the project, a default (all-global) install lands under `wizard.globalHome`, not `projectDir`. Assertions, source toggles, and cwd-resolving follow-ups (`cc uninstall`, `claude plugin install`) that assume the old collapse silently diverge — locked read-only rows, scope-split config files, and no-op follow-ups rather than loud ENOENTs. Remedy: choose `launchInProject` (assert-only) vs `launchInGlobal` (mutates global content or runs a cwd-resolving follow-up) by what the test does. Reinforces Pattern A (scope authority decided in disagreeing places) and Pattern K (dual-scope collapse documented at the wrong layer).
