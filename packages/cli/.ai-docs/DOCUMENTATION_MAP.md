---
last_validated: 2026-08-01
---

# Documentation Map

**Last Updated:** 2026-08-04 (**`2026-08-04` — planning-doc absorption.** Five scattered planning documents outside `.ai-docs/` were retired and what was durable in them absorbed here: `docs/monorepo-merge.md`, `docs/web/proposals.md`, `docs/web/progress-model-effort-and-config-cleanup.md`, `docs/web/editor-spec.md` and `packages/cli/e2e/FINDINGS.md`. **Two new tracked areas** — `reference/monorepo-layout.md` and `reference/testing/harness-decisions.md` — both created on a genuine FULL basis. **Three existing docs received ADDITIVE sections whose content was verified this session; none had its `last_validated` advanced**, because no pass re-derived the rest of those files: `features/model-and-effort.md` (why the axis is on the sub-agent, Claude Code's own model-resolution order, array-order observability), `config/config-writer.md` (exclusive-category stack emission and its throw) and `testing/e2e-infrastructure.md` (two dangling `FINDINGS.md` references repaired, the permission-notice explanation absorbed inline). Product 0.147.1 → **0.149.0**; source counts 350 → **367** and E2E 204 → **219**, both re-derived with `find` this session and both previously stale. **Three claims carried by `FINDINGS.md` were found FALSE against current source and are recorded as corrections in `harness-decisions.md` § 2 rather than absorbed.** No existing row re-derived. Prior — 2026-08-02 (third pass appended: **`2026-08-02 (c)` — coverage expansion**, eight NEW reference docs integrated. This is the first pass in this window that ADDS tracked areas rather than re-checking existing ones: `Seed Contract` moves `[NOT-STARTED]` -> `[DONE]` and seven previously-undocumented areas are opened and closed in the same pass. Eight dashboard rows added at 0 days stale on a genuine FULL basis; **no existing row re-derived and no existing `last_validated` advanced**. Eight contradictions between the new docs and existing ones were resolved in favour of the code. A fourth pass is appended above it: **`2026-08-02 (d)` — standards coverage**, additive over `standards/clean-code-standards.md` only. Four enforced-but-unwritten conventions written as `clean-code-standards.md` rules 4.7 / 5.7 / 6.19 / 15.8-15.10, and the cite-by-symbol rule into `documentation-bible.md`; one stale rule and six rotten line citations corrected; **no reference doc touched and no `last_validated` advanced**. A fifth pass is appended above both: **`2026-08-02 (e)` — cite-by-symbol enforcement**, which brings the three (c)-pass docs that shipped with source line citations into compliance with the rule (d) had just written. 545 line-number tokens converted to symbol citations across `features/source-fetch-and-cache.md`, `skills/skill-primitives.md` and `leaf-exports.md`; `grep -rEc '\.tsx?:[0-9]+' .ai-docs/reference/` now returns zero tree-wide. Two claims found WRONG while locating the cited symbols were corrected. **Citation form only — no content re-validated, so no `last_validated` advanced**)
**Product Version:** 0.149.0
**Total Areas:** 42 (18 original + 14 from restructure + 8 from the 2026-08-02 (c) coverage expansion + 2 from the 2026-08-04 planning-doc absorption)
**Documented:** 42 (100%)
**In Progress:** 0
**Needs Validation:** 1 (`testing/e2e-infrastructure.md` — **narrowed, not cleared** on 2026-08-01. `commands/index.md`'s flag was **DISCHARGED**. See both rows below.)
**Last Validated:** 2026-08-01 (**index rebuild** closing the 0.146.1 + 0.147.0 + 0.147.1 release bundle and the four-keeper reference/standards sweep that followed it. **The staleness dashboard was rebuilt from the `last_validated` frontmatter actually on disk** — all 41 `reference/**/*.md` files re-read this session, no date carried forward from the previous table and none inferred from a prose annotation. Changes: product 0.146.0 → 0.147.1; five files newly stamped `2026-08-01` and ten carrying dated PARTIAL annotations that deliberately did NOT move their dates; `commands/index.md`'s `NEEDS-VALIDATION` discharged; `testing/e2e-infrastructure.md`'s narrowed; **the "Known Tooling Gaps" ESLint baseline corrected from 150 problems to ZERO** — verified by running the tool, not by reading the release notes; source counts 347 → 350 and E2E 197 → 204, both re-counted with `find`; 5-invariant audit re-run with Invariant 4 verified **by name**. Prior — 2026-07-30 reconciliation pass: E2E counts 196 → 197; the agent-findings total removed from this map and delegated to `reference/findings-impact-report.md` per the count-ownership registry; two rows flagged `NEEDS-VALIDATION`; "Known Tooling Gaps" added.)

> **Disk is authoritative.** Every date in this map is derived from the `last_validated` frontmatter of the file it describes. If they disagree, the file wins and the map is wrong. Re-derive; never copy a number forward from a previous audit.

> **A PARTIAL pass must not move `last_validated`.** The dashboard reads frontmatter. Stamping a
> partially-checked file current reports its **unverified** sections as freshly checked — the file
> then looks validated to every agent that reads this map, and the sections nobody looked at are the
> ones most likely to be wrong. Ten files below carry a dated `PARTIAL re-validation 2026-08-01`
> annotation in their body while their frontmatter correctly stays at `2026-07-30`. That gap is the
> **intended** state, not drift. Two files were caught stamping themselves current on a partial pass
> during this sweep and had their dates restored; **this pass re-checked every file's frontmatter
> date against the newest dated annotation in its own body and found no remaining case.**

## Status Legend

- [DONE] Complete and validated
- [NEEDS-VALIDATION] Documented but needs validation
- [IN-PROGRESS] In progress
- [PLANNED] Planned
- [NOT-STARTED] Not started

## Staleness Dashboard

Machine-readable staleness tracker. Thresholds from `standards/documentation-bible.md`.

**Date basis: 2026-08-01.** `Days Stale` = date basis minus the file's own `last_validated` frontmatter **on disk**. **Every one of the 41 `reference/**/\*.md` frontmatter blocks was re-read this session\*\*; nothing carried forward from the previous table, and no date was inferred from a prose annotation.

**`Days Stale` measures the date stamp, not the content.** A file that received a PARTIAL pass on
2026-08-01 and correctly kept its 2026-07-30 stamp reads **2 days stale** — which is right: 2 days
is the age of the last WHOLE-FILE validation, and the partial pass does not change that. Read the
row annotation for what the partial pass actually checked.

**Pointer rows.** Rows marked `(POINTER)` track a redirect file, not content. Per the Pointer Freshness Rule in `standards/documentation-bible.md`, a pointer carries a **30-day link-integrity threshold** and is `OK` while its targets resolve, regardless of how much newer those targets are. A pointer lagging its targets is the expected steady state, **not** drift — do not re-stamp a pointer you did not open, and do not churn it to the current date.

### Original Files (preserved, authoritative until cleanup)

| Doc | Days Stale | Threshold | Status |
| ----------------------------- | ---------- | --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-overview.md | 2 | 30 | OK | <!-- PARTIAL 2026-08-01 · ✓ project identity, directory tree, §1 BaseCommand, §18, lib/wizard + operations/skills exports · ✗ §4-17, still on the 2026-07-30 basis --> |
| commands/index.md (CANONICAL) | 2 | 14 | OK — **FLAG CLEARED** | <!-- PARTIAL 2026-08-01, NEEDS-VALIDATION discharged · ✓ 2 command sections, the 16-file command inventory, every static flags/baseFlags/args/aliases table diffed against source · ✗ the other 14 command sections · Trap for the next flag diff: `edit`'s computed `[EDIT_PROJECT_SETUP_FLAG]` key IS documented, in prose under the flag table rather than in it, so a naive extractor reports it missing --> |
| type-system.md (POINTER) | 2 | 30 | OK (pointer) | <!-- POINTER, targets confirmed to resolve 2026-07-30 · owns the union counts per the count-ownership registry (SkillId 222, SkillSlug 222, Category 89, Domain 9, AgentName 23); no other doc may restate them --> |
| store-map.md | **0** | 7 | OK — FULL 2026-08-01 | <!-- FULL 2026-08-01 · wizard-store.ts read end to end, consumer list re-derived by grep · the 7-day threshold is deliberate: it is the most-cited source file in the findings corpus --> |
| compilation-pipeline.md | 2 | 14 | OK |

| configuration.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 · ✓ ConfigLoadError posture only (the who-handles-the-throw table and its exhaustiveness note) · ✗ defaultCategories counts, resolution hierarchy, D-279 reconciliation summary, barrel exports · Cross-surface gap: this doc holds the authoritative defaultCategories write-up that the count-ownership registry assigns to features/skills-and-matrix.md — convention-keeper's to fix -->
| wizard-flow.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 (second partial pass in two days) · ✓ `I`-hotkey gating and helpers, wizard hooks table, component tree, WizardProps/WizardResultV2/HydrateOptions, scope-diff tables, feature-flag defaults · ✗ step progression, guards, scope toggles, store actions, edit-mode flow, settings overlay, domain order -->
| skills-and-matrix.md | 2 | 14 | OK |

| plugin-system.md | 2 | 14 | OK |
| component-patterns.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 (second partial pass in two days) · ✓ StepAgents dual-scope badges, SourceGrid row states, hotkey registry · ✗ directory-tree file counts, CLI_COLORS, SkillAgentSummary · highest finding density in reference/ (2 -> 10 this window); a FULL pass is scheduled next -->
| utilities.md | **0** | 14 | OK — FULL 2026-08-01 | <!-- FULL 2026-08-01 · every exhaustive list re-derived from source this session · Deliberate: the `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` entry is kept as an explicit DELETED callout rather than dropped — do not remove it as noise -->

| test-infrastructure.md (POINTER) | 9 | 30 | OK (pointer) | <!-- POINTER, deliberately NOT re-stamped: targets were confirmed to resolve but neither sweep made a content judgement, so the date stays 2026-07-23. Do not churn it to the current date. -->
| operations-layer.md | 2 | 14 | OK |
| agent-system.md | 2 | 14 | OK |

| dependency-graph.md | **0** | 14 | OK — FULL 2026-08-01 | <!-- FULL 2026-08-01 · every edge re-derived by grepping every import in src/cli · Method constraint: validate this doc by DIFFING edges against source, never by checking the rows it already lists — see the promoted note under the dashboard -->

| boundary-map.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01, `last_validated` deliberately left at 2026-07-30 · ✓ Key Files table, §1 including the new 1.4 terminal-geometry gate, §7 helper table, source-validator parse-cause claims · ✗ §2-6 and §8 · the Zod schema count is deliberately absent here — types/zod-schemas.md owns it, do not restate it -->

| wizard/state-transitions.md (CANONICAL) | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 · ✓ global-hotkey `I` gate, overlay open/close asymmetry, diff-projection rules, nine-HOTKEY sentinel, getStepProgress, Initial State table, both hydration sequences · ✗ step-sequence diagram, forward/backward transition tables, action->state tables, tombstone lifecycle, guard behaviour, focus seeding -->
| findings-impact-report.md | **0** | 30 | OK — **REGEN DISCHARGED** | <!-- FULL REGENERATION 2026-08-01 · every primary table rebuilt over all findings on disk; the 135-file basis is RETIRED, so there is one basis and no reconciliation is intended · No findings count is restated in this row — the report owns those totals per the count-ownership registry; re-derive from its snapshot-boundary callout -->

### New Files (from Phases 2+3 restructure)

| Doc | Days Stale | Threshold | Status |
| ------------------------- | ---------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| testing/infrastructure.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 · ✓ wizard-layout.test.tsx mount pattern, source-grid width constants, zero snapshot use under e2e/ · ✗ test-project/config tables, directory structure, all other code patterns, test-constants tables, error handling · the "a regenerated snapshot is a proposal" extension to clean-code-standards 6.17a is PROPOSED, not applied — convention-keeper's to adopt --> |

| testing/factories.md | 2 | 14 | OK |
| testing/mock-data.md | 2 | 14 | OK |
| testing/e2e-infrastructure.md | 2 | 14 | **NEEDS-VALIDATION (NARROWED)** | <!-- PARTIAL 2026-08-01 — NEEDS-VALIDATION NARROWED, NOT CLEARED · ✓ STEP_TEXT re-derived in full, per-directory spec counts, writeCorruptConfig, TerminalSession.getScreen() viewport claim, TERMINAL_SIZE and the resize helpers, MIN_TERMINAL_SIZE · ✗ POM inventories for InitWizard / EditWizard / DashboardSession / TerminalScreen / BuildStep, every TIMEOUTS / INTERNAL_DELAYS / INTERNAL_RETRIES / EXIT_CODES / SOURCE_PATHS / DIRS / FILES value, custom matchers, E2E fixtures — all still on the 2026-07-30 basis · one sentence is still owed, see the promoted note under the dashboard -->
| types/core-types.md | 2 | 14 | OK |
| types/operations-types.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01, nothing changed — recorded because a clean result is only evidence if the check that produced it is named · ✓ heading diff (22 `export type` under lib/operations in source, 22 in the doc, sets identical), ConfigWriteOptions/ConfigWriteResult field-by-field, the installMode absence claim · ✗ field-level shapes of the other 20 types -->
| types/zod-schemas.md | **0** | 14 | OK — FULL 2026-08-01 | <!-- FULL 2026-08-01 · every countable claim re-derived from src/cli/lib/schemas.ts · this doc OWNS the exported-schema count per the count-ownership registry; no other doc may restate it -->
| concepts/scope-system.md | 2 | 14 | OK |
| concepts/tombstone-pattern.md | 2 | 14 | OK |
| concepts/guard-pattern.md | 2 | 14 | OK |
| commands/edit.md | 2 | 14 | OK |
| config/config-writer.md | 2 | 14 | OK | <!-- PARTIAL 2026-08-01 · ✓ normalizeProjectPath (module-private, body is fs.realpathSync, exactly 3 call sites) and the path-normalization / registerProjectPath / deregisterProjectPath sections · ✗ everything else in the file · Two deliberate constraints: the CLOSED "normalization asymmetry — do not reintroduce it" callout is kept on purpose, and call sites must name the helper, never raw fs.realpathSync -->
| config/config-merger.md | 2 | 14 | OK |
| config/scope-split.md | 2 | 14 | OK |

### New Files (2026-08-02 (c) coverage expansion)

All eight created 2026-08-02 on a **FULL** basis — every claim in each was derived from source in the
session that wrote it, so `0` days stale is genuine here and is not a partial pass stamping itself
current. **Date basis for this block is 2026-08-02**, one day later than the block above; do not
recompute the older rows from it.

| Doc | Days Stale | Threshold | Status |
| ---------------------------------- | ---------- | --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| features/seed-contract.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. Owns: the 13-spec/3-file unit count (verified by RUNNING vitest) and the 27-spec per-file e2e count for the init-from family (safe to count by `it(` ONLY because that family contains no it.each — verified). Does NOT restate the e2e/commands file count. **Non-calendar trigger: re-validate whenever `packages/matrix/src/seed.ts` in the web monorepo changes.** Nothing automated links the two copies of the vendored schema — a 14-day timer will not catch a same-day web-side edit --> |
| features/model-and-effort.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. Liquid emission rows verified by RENDERING the template, not by reading engine docs. Tracks resolver.ts + compiler.ts + agent.liquid. Deliberately declines the exported-schema count (types/zod-schemas.md) and the AgentName union size (type-system.md) --> |
| features/code-generation.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. **Owns two counts: SCHEMA_ENTRIES = 10 and files in src/schemas/ = 12.** Their DISAGREEMENT is the invariant (10 generated + 2 hand-written), so a doc that declines to state the numbers cannot state the invariant. Neither generator was executed — both write into the tracked tree --> |
| features/built-in-catalogue.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. **Owns the built-in stack count (17) and the per-relationship-kind rule counts.** All quantities derived by EVALUATING the modules, never by counting source lines. Headline operational fact: for the default source these files are not executed at runtime at all — `BUILT_IN_MATRIX` short-circuits them --> |
| features/source-fetch-and-cache.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. **Non-calendar trigger: a `giget` version change invalidates it regardless of date** — it replicates a private algorithm of that dependency, and the only tests touching the remote branch mock giget entirely, so the suite cannot catch a layout change. Carries its own drift checklist · **2026-08-02 (e): all 78 source line citations converted to symbol citations; content NOT re-validated, so this row's basis is still the (c) FULL pass.** One claim corrected in passing: the `fetchMarketplace` call-site table named `tagPublicFallback`, which does not exist — the function is `tagPublicSourceSkills`. The `giget dist :NNN` citations are DELIBERATELY left as line numbers: they point into a content-hashed `node_modules` chunk, not into our source, and the doc already carries its own re-location instruction --> |
| skills/skill-primitives.md | **0** | 14 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document; first member of the new `skills/` directory. Function-level inventory for the five undocumented lib/skills modules. Cheapest re-validation: diff `grep -c "^export" src/cli/lib/skills/*.ts` against the Reachability table row count, then re-run `vitest run src/cli/lib/skills/` to re-derive the 118 · **2026-08-02 (e): all 94 source line citations converted to symbol citations; content NOT re-validated, so this row's basis is still the (c) FULL pass.** One citation corrected in passing: the mocking-style note cited `skill-copier.test.ts:11` for `initializeMatrix`, which is the `consts` import — the claim held, the pointer was one line off, and converting it to the symbol removed the class of error --> |
| build-and-packaging.md | **0** | 30 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. **Owns the packaging counts** (tarball entries/sizes, shipped test-file count, entry-glob count); re-derive with `npm pack --dry-run --ignore-scripts --json`, always with `--ignore-scripts` so the `prepare`/husky lifecycle cannot run. 30-day threshold is deliberate: inputs are tsup.config.ts and package.json, both stable. Its §6 tarball figures move with the working tree and are annotated with the command that re-derives them --> |
| leaf-exports.md | **0** | 30 | OK — FULL 2026-08-02 | <!-- FULL 2026-08-02 · new document. **STAGING AREA with a defined end state** — entries move to their owning doc on that doc's next FULL pass, and the file is DELETED when empty. Do not add new exports here. 30-day threshold reflects low churn (it documents dormant/leaf surface). Its own census caught the map's stale corpus arithmetic · **2026-08-02 (e): all 62 source line citations converted to symbol citations; content NOT re-validated, so this row's basis is still the (c) FULL pass.** Its five doc-to-doc line refs INTO the two docs reflowed by the same pass were converted to section references — those, and only those, would have been silently invalidated by the reflow. Doc-to-doc line refs into UNMODIFIED docs are left as found and remain a known rot surface --> |

### New Files (2026-08-04 planning-doc absorption)

Both created 2026-08-04 on a **FULL** basis — every claim in each was derived from source in the
session that wrote it. **Date basis for this block is 2026-08-04**; do not recompute the older
blocks from it.

| Doc | Days Stale | Threshold | Status |
| ---------------------------- | ---------- | --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| monorepo-layout.md | **0** | 30 | OK — FULL 2026-08-04 | <!-- FULL 2026-08-04 · new document; the ONLY doc in this corpus whose subject is the repository AROUND packages/cli, and the only one whose paths are repository-root-relative — that exception is stated in its own body and must not be "normalised" to the src/cli/ form. Absorbs docs/monorepo-merge.md. **The two-major tool split and its three workarounds are DELIBERATELY not documented as design** — they are scheduled scaffolding attached to a todo item; a future pass must not promote them into this file. 30-day threshold: its inputs are root package.json, turbo.json, .gitignore, .husky/pre-commit and ci.yml, all low-churn --> |
| testing/harness-decisions.md | **0** | 30 | OK — FULL 2026-08-04 | <!-- FULL 2026-08-04 · new document. Absorbs what survived e2e/FINDINGS.md, which is retired. Owns NO API surface — page objects, constants, matchers and timeouts stay with testing/e2e-infrastructure.md. Its § 2 records three FINDINGS claims verified FALSE this session (required categories do NOT gate build-step advancement; neither does a styling skill; `search` rejects rather than ignores `--source`); do not re-import them from any older copy of that file. § 3 is an alternatives-rejected register — its purpose is to stop re-litigation, so entries are removed only when the choice actually changes --> |

**Status values:** `OK` = within threshold, `DUE` = at or past threshold, `OVERDUE` = at or past 2x threshold, `OK (pointer)` = redirect targets resolve (see Pointer Freshness Rule).

**Date basis:** 2026-08-01. Every row re-derived from disk frontmatter this session.

**Two constraints that a later pass would otherwise undo.** Both previously lived only inside row
comments. A hidden warning protects nothing, so they are stated here in the body.

1. **`dependency-graph.md` must be validated by DIFFING edges against source, never by checking the
   rows it already lists.** A doc whose entire content is edges cannot be validated from its own
   rows — that method is structurally blind to a missing edge, which is how thirteen of seventeen
   `Operations -> Lib` rows stayed wrong until the map was rebuilt from source. See
   `agent-findings/2026-08-01-import-graph-docs-validate-rows-instead-of-diffing-edges.md`.
2. **`testing/e2e-infrastructure.md` still owes one sentence** under its "Scope & HOME model"
   section: `process.cwd()` is `getcwd(2)` and returns the kernel-canonical path, so the harness can
   choose WHICH directory a command runs in but never BY WHICH PATH it is reached. Without it an
   agent can still ship a symlink E2E spec that cannot fail. See
   `agent-findings/2026-07-30-symlinked-project-path-bugs-are-unreachable-from-e2e.md`.

**Derivation (all 41 `reference/**/\*.md` files, frontmatter re-read on disk 2026-08-01):\*\*

- **6 files** carry `last_validated: 2026-08-01`. **31 files** carry `2026-07-30`. **4 files** carry `2026-07-23`. (Re-derived at the CLOSE of this pass: the sixth is `findings-impact-report.md`, re-stamped by this pass's own full regeneration. A count taken at the start of an index pass omits whatever that pass itself changes.)
- **The 6 newly stamped files each received a genuine whole-file or link-integrity judgement, verified by reading the file's own annotation:** `store-map.md`, `utilities.md`, `types/zod-schemas.md` and `dependency-graph.md` all carry an explicit **FULL** re-validation note; `findings-impact-report.md` was fully regenerated over every finding on disk by this pass; and `config/configuration.md` is a **pointer** re-stamped on link-integrity basis only, which is exactly what the Pointer Freshness Rule prescribes (its note says so outright: "this file's date records link integrity, not source validation, so it is re-stamped on that basis and that basis only").
- **Ten files received a PARTIAL pass on 2026-08-01 and correctly did NOT move their dates**, so they read 2 days stale: `component-patterns.md`, `features/wizard-flow.md`, `wizard/state-transitions.md`, `architecture-overview.md`, `boundary-map.md`, `commands/index.md`, `config/config-writer.md`, `features/configuration.md`, `types/operations-types.md`, `testing/infrastructure.md`, plus `testing/e2e-infrastructure.md`. **This is the intended state.** Each states the reason in its own body; `boundary-map.md` puts it most plainly: _"a partial pass must not move it. The staleness dashboard reads frontmatter, not this comment, so stamping the file current would report every unverified section below as freshly checked."_
- The 4 files at `2026-07-23` are all **pointers**: `test-infrastructure.md` (tracked, row above), `wizard/component-patterns.md`, `wizard/flow.md`, `wizard/store-map.md` (untracked). Agents deliberately declined to re-stamp them because they made **no content judgement** on them.
- **Result across the 32 tracked rows: 5 read 0 days stale, 26 read 2 days, 1 reads 9 days** (`test-infrastructure.md`, inside its 30-day pointer threshold). **No row is `DUE` or `OVERDUE`.** The sixth 2026-08-01 file, `config/configuration.md`, is an untracked pointer and has no dashboard row — which is why 6 files carry the date but only 5 rows read 0.
- **Frontmatter-vs-annotation cross-check, run over all 41 reference files and all 16 standards files this session:** for each file, the newest date appearing in any HTML comment in its body was compared against its frontmatter `last_validated`. **Zero files carry a frontmatter date newer than their own annotation admits, and zero files are stamped current on the strength of a PARTIAL annotation.** Two files were caught doing exactly that earlier in this sweep and had their dates restored; this check confirms no third case survives.

> **`NEEDS-VALIDATION` is orthogonal to `Days Stale` — read both columns.** One row
> (`testing/e2e-infrastructure.md`) is flagged `NEEDS-VALIDATION` while sitting comfortably inside
> its threshold, and that is not a contradiction. `Days Stale` measures the age of the file's
> `last_validated` stamp; the flag records that source has changed _since_ that stamp, or that a
> named subset of the file was never checked. A doc validated at 09:00 and invalidated by a 17:00
> code change is simultaneously 0 days stale and wrong. **A pass that consults only the staleness
> dashboard will miss every same-day drift**, which is exactly the class the 2026-07-30 bug-fix
> batch produced.
>
> **A narrowed flag is not a cleared flag.** `testing/e2e-infrastructure.md`'s 2026-08-01 pass closed
> five of its recorded gaps and left a **named** remainder — the POM method inventories for five page
> objects, and every `TIMEOUTS` / `INTERNAL_DELAYS` / `INTERNAL_RETRIES` / `EXIT_CODES` /
> `SOURCE_PATHS` / `DIRS` / `FILES` value. Its row reads `NEEDS-VALIDATION (NARROWED)` for that
> reason and must not be read as resolved. `commands/index.md`'s flag, by contrast, is **DISCHARGED**
> — its gap is closed in the doc and the pass additionally re-derived the full command inventory and
> every flag/arg table from source with zero mismatches.

**Tracked vs untracked (Invariant 4):** **51 on disk = 42 tracked + 9 untracked pointers.** Re-derived from disk 2026-08-04 with `find .ai-docs/reference -name '*.md' | wc -l`, not by incrementing the previous total. There are **11 pointer files** in total; 2 of them (`type-system.md`, `test-infrastructure.md`) are tracked because they are the surviving row for a split area, so 11 − 2 = 9 untracked. The pointer set is unchanged by the 2026-08-02 (c) and 2026-08-04 passes — all ten of their new files are substantial bodies, none is a redirect.

> **The 41 = 32 + 9 arithmetic above was correct until 2026-08-02 (c) and is now superseded.** It is
> recorded here rather than silently overwritten because the failure mode it invites is specific:
> the (c) pass found a keeper computing an "absent from all 41 reference docs" census against the
> stale corpus, which reported five already-covered symbols as uncovered and produced one flatly
> wrong claim before it was caught. **Enumerate the corpus with `find` at the start of any census;
> never take the total from this map.**

The 9 untracked pointers, **verified BY NAME this session by opening each file and confirming its
body is a redirect table** — never inferred from path depth, and never carried forward from the
previous audit:

| Untracked pointer                  | Redirects to                  | Lines | Disk `last_validated` |
| ---------------------------------- | ----------------------------- | ----- | --------------------- |
| `architecture/overview.md`         | `architecture-overview.md`    | 34    | 2026-07-30            |
| `architecture/dependency-graph.md` | `dependency-graph.md`         | 23    | 2026-07-30            |
| `architecture/boundary-map.md`     | `boundary-map.md`             | 23    | 2026-07-30            |
| `commands.md`                      | `commands/index.md`           | 30    | 2026-07-30            |
| `state-transitions.md`             | `wizard/state-transitions.md` | 28    | 2026-07-30            |
| `config/configuration.md`          | `features/configuration.md`   | 72    | **2026-08-01**        |
| `wizard/flow.md`                   | `features/wizard-flow.md`     | 35    | 2026-07-23            |
| `wizard/store-map.md`              | `store-map.md`                | 16    | 2026-07-23            |
| `wizard/component-patterns.md`     | `component-patterns.md`       | 33    | 2026-07-23            |

**The `Lines` column is the evidence, not decoration.** Every pointer above is 16–72 lines of
redirect table, against 342 (`store-map.md`), 485 (`dependency-graph.md`), 551
(`wizard/state-transitions.md`) and 696 (`commands/index.md`) for the canonical bodies. A file that
long is not a pointer, and a file that short is not canonical — which is the cheap check that would
have caught the four consecutive audits that mis-enumerated this set while their arithmetic summed
correctly.

**`config/configuration.md` is the only pointer newly stamped 2026-08-01**, and correctly so: a
keeper opened it, confirmed all nine of its redirect destinations resolve on disk, and re-stamped on
that basis alone. It also **removed a restated count** from its `defaultCategories` redirect row — a
redirect row must carry a TOPIC, never a QUANTITY, because a pure pointer has no mechanism to
re-derive anything and a number in it can only rot. The value happened to be correct, which is
precisely why it would have survived unnoticed.

**The remaining 8 pointers were NOT re-stamped and must not be churned to the current date.** Per
the Pointer Freshness Rule, a pointer lagging its targets is the expected steady state.

> **Direction is not implied by path depth.** `commands.md` and `state-transitions.md` are **root-level pointers** whose canonical bodies live in subdirectories, because those two pairs were flipped after the original split. Two prior audits assumed the opposite and listed `commands/index.md` and `wizard/state-transitions.md` as the pointers. The arithmetic still summed to 9, so the error survived — which is why Invariant 4 now requires verifying the pointer set **by name**, not only by count.

New Files count is 14 (12 from Pass 20 + `config-merger.md` and `scope-split.md` added iter 4-5).

## Reference Documentation

Descriptive docs -- "how things work". Validated aggressively (7-30 day cadence).

### New Directory Structure (Phase 2+3)

```
reference/
  architecture/
    overview.md              # -> architecture-overview.md (pointer)
    dependency-graph.md      # -> dependency-graph.md (pointer)
    boundary-map.md          # -> boundary-map.md (pointer)
  concepts/                  # NEW: Cross-cutting concerns
    scope-system.md          # Consolidates scope docs from 5 files
    tombstone-pattern.md     # Consolidates excluded/tombstone lifecycle
    guard-pattern.md         # Unified view of all store guards
  commands/
    index.md                 # CANONICAL (root commands.md is the pointer) -- corrected 2026-07-30
    edit.md                  # Detailed edit command (new content)
  wizard/
    flow.md                  # -> features/wizard-flow.md (pointer)
    state-transitions.md     # CANONICAL (flipped iter 102; root state-transitions.md is now a pointer)
    store-map.md             # -> store-map.md (pointer)
    component-patterns.md    # -> component-patterns.md (pointer)
  types/
    core-types.md            # Split from type-system.md (full content)
    operations-types.md      # Split from type-system.md (full content)
    zod-schemas.md           # Split from type-system.md (full content)
  config/
    configuration.md         # -> features/configuration.md (pointer)
    config-writer.md         # Split from configuration.md (full content)
    config-merger.md         # Merge contract: mergeConfigs + mergeGlobalConfigs (new, 2026-04-21)
    scope-split.md           # splitConfigByScope + scopeEligibilityKey + D-220 delta pipeline (new, 2026-04-21)
  testing/
    infrastructure.md        # Split from test-infrastructure.md (full content)
    factories.md             # Split from test-infrastructure.md (full content)
    mock-data.md             # Split from test-infrastructure.md (full content)
    e2e-infrastructure.md    # Split from test-infrastructure.md (full content)
    harness-decisions.md     # NEW 2026-08-04: harness alternatives already rejected + CLI behaviour a test must satisfy
  skills/                    # NEW 2026-08-02 (c)
    skill-primitives.md      # Function inventory for the five undocumented lib/skills modules
  features/
    compilation-pipeline.md  # Stays (unchanged)
    configuration.md         # Stays (unchanged, pointed to by config/configuration.md)
    skills-and-matrix.md     # Stays (unchanged)
    plugin-system.md         # Stays (unchanged)
    agent-system.md          # Stays (unchanged)
    operations-layer.md      # Stays (unchanged)
    wizard-flow.md           # Stays (unchanged, pointed to by wizard/flow.md)
    seed-contract.md         # NEW 2026-08-02 (c): the init --from wire contract
    model-and-effort.md      # NEW 2026-08-02 (c): the model/effort tuning axis, end to end
    code-generation.md       # NEW 2026-08-02 (c): the two scripts/ generators and their output
    built-in-catalogue.md    # NEW 2026-08-02 (c): defaultStacks / defaultRules fallback data
    source-fetch-and-cache.md # NEW 2026-08-02 (c): giget fetch, cache key, ID-targeted read path
  build-and-packaging.md     # NEW 2026-08-02 (c): tsup entry contract, publish surface, oclif block
  monorepo-layout.md         # NEW 2026-08-04: the repository AROUND packages/cli — workspaces, hooks, CI, Prettier/gitignore split
  leaf-exports.md            # NEW 2026-08-02 (c): STAGING AREA — drains into owning docs, then deleted
  findings-impact-report.md  # Stays (unchanged)
```

**Note:** Original files are preserved alongside the new structure. "Full content" files contain the actual split content. Once user confirms cleanup, the redundant side of each pair can be removed.

> **Pointer direction is per-pair, not positional (corrected 2026-07-30).** Most pointers are the subdirectory file redirecting to a preserved root original. **Two pairs are flipped** — the root file is the pointer and the subdirectory file is canonical:
>
> | Canonical (body)                        | Pointer (redirect)               |
> | --------------------------------------- | -------------------------------- |
> | `reference/commands/index.md`           | `reference/commands.md`          |
> | `reference/wizard/state-transitions.md` | `reference/state-transitions.md` |
>
> Determine direction by **reading both files**; never infer it from the directory layout. Getting this backwards is not cosmetic — it excluded `commands/index.md` from staleness tracking, and the doc then drifted through two releases documenting `uninstall --all`, a flag oclif now rejects.

### Original Files (preserved, authoritative)

| Area                  | Status | File                                                                                                   | Last Updated | Last Validated | Next Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture Overview | [DONE] | `reference/architecture-overview.md`                                                                   | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 (sections 1, 18, tree, exports). Sections 4-17 stand on 2026-07-30. Validate in 30 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Commands Reference    | [DONE] | `reference/commands/index.md` (canonical; `reference/commands.md` is now a pointer)                    | 2026-08-01   | **2026-07-30** | **NEEDS-VALIDATION DISCHARGED 2026-08-01.** PARTIAL pass: 2 command sections re-verified, 16-command inventory + all flag/arg tables re-derived with zero mismatches. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Type System           | [DONE] | `reference/type-system.md` (POINTER -> `types/*`)                                                      | 2026-07-30   | 2026-07-30     | POINTER — 30-day link-integrity threshold. Union counts owned here. Do not churn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| State Management      | [DONE] | `reference/store-map.md`                                                                               | 2026-08-01   | **2026-08-01** | **FULL re-validation 2026-08-01** — `wizard-store.ts` read end to end; null-branch removal + dead-subscription corrections. Most-cited source file in the findings corpus (25). Validate in 7 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compilation Pipeline  | [DONE] | `reference/features/compilation-pipeline.md`                                                           | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep; no 0.146.1/0.147.x diff under `lib/agents/**` or `compiler.ts`. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Configuration System  | [DONE] | `reference/features/configuration.md`                                                                  | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 (ConfigLoadError scope only). Carries the authoritative `defaultCategories` write-up the count-ownership registry assigns elsewhere — reported to convention-keeper. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Wizard Flow           | [DONE] | `reference/features/wizard-flow.md`                                                                    | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 x2 (`I`-hotkey gate, hook table, component tree). Step progression / guards / scope toggles NOT re-checked. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Skills & Matrix       | [DONE] | `reference/features/skills-and-matrix.md`                                                              | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Named by the count-ownership finding — the registry assigns it the `defaultCategories` figure it does not carry. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Plugin System         | [DONE] | `reference/features/plugin-system.md`                                                                  | 2026-07-30   | 2026-07-30     | `local-installer.ts` took ZERO findings this window — no re-drift. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Component Patterns    | [DONE] | `reference/component-patterns.md`                                                                      | 2026-08-01   | **2026-07-30** | **HIGHEST-PRIORITY DOC IN THE REPO.** 2 -> 10 findings this window, the largest jump on record. Two PARTIAL passes (07-31, 08-01) and still not re-stamped. **Schedule a FULL pass next**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Utilities Reference   | [DONE] | `reference/utilities.md`                                                                               | 2026-08-01   | **2026-08-01** | **FULL re-validation 2026-08-01** — every exhaustive list re-derived; two consts.ts exports found by heading diff that had no heading at all. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Test Infrastructure   | [DONE] | `reference/test-infrastructure.md` (POINTER -> `testing/*`)                                            | 2026-07-23   | 2026-07-23     | POINTER — intentionally not re-stamped by the 2026-07-30 OR the 2026-08-01 sweep; neither made a content judgement on it. **9 days / 30-day link-integrity threshold. Do not churn.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Operations Layer      | [DONE] | `reference/features/operations-layer.md`                                                               | 2026-07-30   | 2026-07-30     | Heading diff via `types/operations-types.md` found ZERO drift across all three releases (22 exported types, sets identical). Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Agent System          | [DONE] | `reference/features/agent-system.md`                                                                   | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep; no diff under `lib/agents/**`. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Dependency Graph      | [DONE] | `reference/dependency-graph.md`                                                                        | 2026-08-01   | **2026-08-01** | **FULL re-validation 2026-08-01 — every EDGE re-derived by grep.** Subject of the window's only `high` finding; 13 of 17 Operations->Lib rows were wrong. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Boundary Map          | [DONE] | `reference/boundary-map.md`                                                                            | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 (Key Files, section 1 + new 1.4, section 7). Sections 2-6 and 8 stand on 2026-07-30. Restated Zod count removed. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| State Transitions     | [DONE] | `reference/wizard/state-transitions.md` (canonical; `reference/state-transitions.md` is now a pointer) | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 (`I`-gate, overlay-blocking asymmetry, null-baseline diff projection). Transition tables NOT re-checked. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Findings Impact       | [DONE] | `reference/findings-impact-report.md`                                                                  | 2026-08-01   | **2026-08-01** | **FULL REGENERATION DONE 2026-08-01 — both triggers discharged** (23 findings past the 135-file snapshot, and the 0.146.1+0.147.0+0.147.1 bundle shipped). Every primary table rebuilt over ALL findings on disk; the 135-file basis is RETIRED, so there is one basis and no reconciliation is intended. Patterns A..U carried forward with widened statements for G, M, Q, R, S and T; **Pattern V newly named** (the artefact that looks like verification and cannot fail — the defining shape of all three releases). Incremental Updates is genuinely empty. **Finding counts are NOT restated in this map** — that file owns them per the count-ownership registry; read its snapshot-boundary callout, which also records that the basis moved DURING the pass and was re-derived at the close |

### New Files (Phase 2+3 restructure, 2026-04-13)

| Area                    | Status | File                                      | Last Updated | Last Validated | Next Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------ | ----------------------------------------- | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test Infrastructure     | [DONE] | `reference/testing/infrastructure.md`     | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01 (two new subsections + what they assert). Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Test Factories          | [DONE] | `reference/testing/factories.md`          | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Test Mock Data          | [DONE] | `reference/testing/mock-data.md`          | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| E2E Infrastructure      | [DONE] | `reference/testing/e2e-infrastructure.md` | 2026-08-04   | **2026-07-30** | **NEEDS-VALIDATION NARROWED, NOT CLEARED.** `STEP_TEXT` 64 -> **74** and all per-directory spec counts re-derived; POM inventories + all TIMEOUTS/paths still unchecked. **ADDITIVE 2026-08-04, date deliberately NOT moved:** the two references to `e2e/FINDINGS.md` were repaired (the file is retired) — the directory-tree line removed, and the `createPermissionsFile` row now states the reason inline (a static Ink element with no input handler) and points at `testing/harness-decisions.md` § 1.1. **Its per-directory spec counts are stale against the 2026-08-04 re-derivation** in Coverage Metrics; owned there, correct here on the next pass. **This file also carries TWO stacked validation annotations, which the bible's one-annotation rule forbids** — left as found, to be collapsed by the next FULL pass rather than by an additive one |
| Core Types              | [DONE] | `reference/types/core-types.md`           | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Operations Types        | [DONE] | `reference/types/operations-types.md`     | 2026-08-01   | **2026-07-30** | PARTIAL 2026-08-01: heading diff (22 exported types, sets identical) + 2 field-level checks. **Nothing changed** — recorded because a clean result is only evidence if the check is named                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Zod Schemas             | [DONE] | `reference/types/zod-schemas.md`          | 2026-08-01   | **2026-08-01** | **FULL re-validation 2026-08-01**; owns the schema count, re-derived and unchanged. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Scope System            | [DONE] | `reference/concepts/scope-system.md`      | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep; 7 findings reference it. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tombstone Pattern       | [DONE] | `reference/concepts/tombstone-pattern.md` | 2026-07-30   | 2026-07-30     | **MOST-REFERENCED REFERENCE DOC (11 findings) AND UNTOUCHED BY THE 2026-08-01 SWEEP.** Maps to `wizard-store.ts`, the most-cited source file. **Schedule alongside `component-patterns.md`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Guard Pattern           | [DONE] | `reference/concepts/guard-pattern.md`     | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Edit Command (Detailed) | [DONE] | `reference/commands/edit.md`              | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep; cross-checked as accurate from `commands/index.md`'s pass. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Config Writer (Detail)  | [DONE] | `reference/config/config-writer.md`       | 2026-08-04   | **2026-07-30** | PARTIAL 2026-08-01 (`normalizeProjectPath` scope only) — all three sections verified accurate; two spots naming the raw primitive instead of the helper corrected. **ADDITIVE 2026-08-04, date deliberately NOT moved:** new section "Stack emission — an exclusive category loses its array wrapper", derived this session from `compactCategoryAssignments` / `compactAssignment` / `isExclusiveCategory` in `config-writer.ts`, `normalizeAgentConfig` in `stacks-loader.ts` and the `arraySuffix` line in `config-types-writer.ts`. It records the throw (`Category '<c>' is exclusive but holds N skills`), which had no coverage anywhere                                                                                                                                                                                                                      |
| Config Merger Contract  | [DONE] | `reference/config/config-merger.md`       | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Source-identity contract still unlanded (findings Pattern B). Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Config Scope Split      | [DONE] | `reference/config/scope-split.md`         | 2026-07-30   | 2026-07-30     | Untouched by the 2026-08-01 sweep. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### New Files (2026-08-02 (c) coverage expansion)

Eight areas opened and closed in one pass. Each row's `Last Validated` is a genuine FULL basis —
these are new documents whose every claim was derived from source in the session that wrote them, so
the "a PARTIAL pass must not move the date" rule does not bite here.

| Area                   | Status | File                                           | Last Updated | Last Validated | Next Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------ | ---------------------------------------------- | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed Contract          | [DONE] | `reference/features/seed-contract.md`          | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02** — every file under `lib/seed/` read end to end plus BOTH copies of the vendored schema. Closes the `[NOT-STARTED]` area opened by the (b) pass. Validate in 14 days. **Priority trigger, not just cadence: re-validate whenever `packages/matrix/src/seed.ts` in the web monorepo changes** — nothing automated links the two copies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Model & Effort Axis    | [DONE] | `reference/features/model-and-effort.md`       | 2026-08-04   | **2026-08-02** | **NEW, FULL 2026-08-02** — Liquid emission verified by rendering the template. Tracks `resolver.ts`, `compiler.ts` and `agent.liquid`. Corrected four live drift claims in sibling docs (see `crossRefs` in the (c) history entry). Validate in 14 days. **ADDITIVE 2026-08-04, date deliberately NOT moved:** two new sections absorbed from the retired `docs/web/proposals.md` — **"Why the axis is on the sub-agent and not the skill"** (the plugin-mode `SKILL.md` ownership asymmetry, and why not on `assignments`), Claude Code's own model-resolution order, and why `ultra` is not an effort level; plus an array-order-is-observable note verified against `types/matrix.ts` and `src/schemas/agent.schema.json`. **The Claude Code resolution-order bullets are external documentation read on 2026-08-01 — not verifiable from this repository and pinned by no test. Their provenance is stated in the body; do not silently promote them to verified.** |
| Code Generation        | [DONE] | `reference/features/code-generation.md`        | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02.** Owns the `SCHEMA_ENTRIES` count (10) and the `src/schemas/` file count (12) per the count-ownership registry — the 10-vs-12 gap IS the invariant. Records that `injectSubcategoryPropertyNames` is currently **inert** (findings Pattern V). Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Built-in Catalogue     | [DONE] | `reference/features/built-in-catalogue.md`     | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02.** Owns the built-in stack count and per-relationship-kind rule counts. Quantities derived by EVALUATING the modules. Headline: for the default source these files are not executed at runtime — `BUILT_IN_MATRIX` short-circuits them, so an edit here is invisible until `generate:types` re-runs. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Source Fetch & Cache   | [DONE] | `reference/features/source-fetch-and-cache.md` | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02.** Closes the 6-export gap under `lib/loading` (`sanitizeSourceForCache`, `getGigetCacheDir`, `FetchOptions`, `FetchResult`, `loadSkillsByIds`, `LoadSkillsFromDirOptions`). Validate in 14 days **AND on any `giget` version change** — it replicates a private algorithm of that dependency and the suite mocks giget entirely                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Skill Primitives       | [DONE] | `reference/skills/skill-primitives.md`         | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02.** First member of the new `skills/` directory; the two remaining `lib/skills` splits (`source-switcher.ts`, `generators.ts`) belong beside it. Corrected `skills-and-matrix.md`'s `computeSkillFolderHash` claim. Validate in 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Build & Packaging      | [DONE] | `reference/build-and-packaging.md`             | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02.** Owns the packaging counts; re-derive with `npm pack --dry-run --ignore-scripts --json` (the `--ignore-scripts` is load-bearing — `prepare` runs husky, which sets `core.hooksPath` via git). Two live gaps recorded: the built `config-loader` jiti alias resolves outside the installed package, and zero `.d.ts` ship. **Validate in 30 days** (inputs are stable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Leaf Exports (staging) | [DONE] | `reference/leaf-exports.md`                    | 2026-08-02   | **2026-08-02** | **NEW, FULL 2026-08-02. STAGING AREA — this file has an end state.** Entries migrate to their owning doc on that doc's next FULL pass; the file is DELETED once empty. Do not add new exports to it. Validate in 30 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### New Areas (2026-08-04 planning-doc absorption)

Two areas opened and closed in one pass. Both `Last Validated` values are a genuine FULL basis —
every claim in each was derived from source in the session that wrote it.

| Area              | Status | File                                     | Last Updated | Last Validated | Next Action                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------ | ---------------------------------------- | ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo Layout   | [DONE] | `reference/monorepo-layout.md`           | 2026-08-04   | **2026-08-04** | **NEW, FULL 2026-08-04.** Absorbs `docs/monorepo-merge.md`. The only doc here whose paths are repository-root-relative — stated in its body, do not normalise. **The two-major tool split and its three workarounds are deliberately excluded as scheduled scaffolding**; a later pass must not promote them into it. Validate in 30 days, or immediately on a change to the root `package.json`, `.husky/pre-commit` or `ci.yml` |
| Harness Decisions | [DONE] | `reference/testing/harness-decisions.md` | 2026-08-04   | **2026-08-04** | **NEW, FULL 2026-08-04.** Absorbs what survived the retired `e2e/FINDINGS.md`. Owns no API surface. Its § 2 records three claims that file carried and that are FALSE against current source; its § 3 is an alternatives-rejected register. Validate in 30 days, or immediately on a change to `e2e/helpers/terminal-session.ts` or `lib/permission-checker.tsx`                                                                  |

## Standards Documentation

Prescriptive rules for code quality, testing, and content authoring. Lighter validation cadence -- validate when convention-keeper proposes updates, or quarterly.

| Area                          | File                                  | Last Moved | Last Audited | Scope disambiguator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean Code Standards          | `standards/clean-code-standards.md`   | 2026-03-25 | 2026-04-21   | COVERAGE PASS 2026-08-02 (d), deliberately NOT re-stamped — additive only. New: **4.7** (`CLI_INVOKE_COMMAND` instruction form), **5.7** (writes funnel through `utils/fs.ts`), **6.19** (flag-gated suites use `describe.skipIf`), **15.8-15.10** (config-gate exclusive write privilege, corrected `config-types.ts` writer selection, propagate-and-recompile contract). **15.8 previously named `writeStandaloneConfigTypes`, which no longer exists in `src/`**                                                           |
| E2E Testing Bible             | `standards/e2e-testing-bible.md`      | 2026-03-25 | 2026-07-30   | PARTIAL 2026-08-01, deliberately NOT re-stamped. Prior: rewritten 2026-07-30 (inverted `HOME=cwd` claims removed)                                                                                                                                                                                                                                                                                                                                                                                                              |
| E2E Sub-Standards             | `standards/e2e/` (7 files)            | 2026-03-25 | 2026-07-30   | All 7 still at 2026-07-30. **Five received dated PARTIAL passes 2026-08-01 and correctly did NOT re-stamp** (README, anti-patterns, assertions, page-objects, test-data); `patterns.md` and `test-structure.md` were untouched. `README.md`'s `STEP_TEXT` count is corrected to **74** and now agrees with `reference/testing/e2e-infrastructure.md`                                                                                                                                                                           |
| Prompt Engineering (phrasing) | `standards/prompt-bible.md`           | 2026-03-25 | 2026-04-21   | XML tags, delegation prompt shape, per-delegation boilerplate — **what to say**                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Loop Prompts (cadence)        | `standards/loop-prompts-bible.md`     | 2026-03-25 | 2026-04-21   | Ralph-loop iter discipline, completion promise, synthesis passes — **when/how often**                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Skill Atomicity               | `standards/skill-atomicity-bible.md`  | 2026-03-25 | 2026-04-02   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Skill Atomicity Primer        | `standards/skill-atomicity-primer.md` | 2026-03-25 | 2026-04-02   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| TypeScript Types              | `standards/typescript-types-bible.md` | 2026-03-25 | 2026-04-02   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Documentation Standards       | `standards/documentation-bible.md`    | 2026-03-25 | 2026-07-30   | Count-ownership rule, Pointer Freshness Rule, Heading Diff rule, rebuilt hook table, Known-Limitations clause. **FOUR open cross-surface defects reported against it** by the 2026-08-01 findings regeneration — see that report's "Cross-surface defects reported, not fixed" table. Convention-keeper's domain. PARTIAL 2026-08-02 (d), deliberately NOT re-stamped: the **"No Source Line Numbers — Cite by Symbol"** rule is now stated here, and every other place in the file that instructed the opposite was corrected |
| Commit Protocol               | `standards/commit-protocol.md`        | 2026-03-25 | 2026-04-02   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Known Tooling Gaps

> Read this before running or reporting on any quality gate. CLAUDE.md rule 4 requires every agent
> to open this map before working on any area of the codebase, which is why the gap is recorded
> here as well as in `agent-findings/` — you will see it **before** you reach the checklist that
> depends on it.

### ESLint: gate closed and baseline at ZERO (verified 2026-08-01)

> **CORRECTED 2026-08-01. This section previously recorded a non-zero baseline of 150 problems and
> told agents to lint only the files they touched. Both instructions are now wrong.** The baseline
> was burned down to **zero** in 0.147.1 with no rule disabled. Verified this session by **running
> the tool**, not by reading the release notes: `npx eslint .` produces no output and exits `0`.
>
> **This is now a NORMAL gate, not a gap.** The section is kept under "Known Tooling Gaps" only
> because the residual items below are genuine gaps — the gate itself is no longer one.

**Lineage, so the correction is auditable.** ESLint was adopted 2026-07-30 at the user's explicit
request, into a repo that carried an `eslint` dependency and a `lint-staged` entry but **no config
file** — so `CLAUDE.md`'s "No ESLint errors" checklist item had been reporting a result nobody ever
computed. Its first execution reported **148 problems**; five of those marked real defects that were
invisible precisely because the binding recording them was unused. This is the canonical instance of
findings **Pattern V** (the artefact that looks like verification and cannot fail) and the reason
that pattern was lettered.

| Probe            | Result                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Config           | `eslint.config.js` — ESLint 9 flat config via `defineConfig()`        |
| Dependencies     | `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier` |
| Script           | `npm run lint` -> `eslint .`                                          |
| `lint-staged`    | `"*.{ts,tsx}": "eslint --no-warn-ignored"` — check-only, no `--fix`   |
| `prepublishOnly` | `format:check && lint && typecheck && build && test`                  |

Scope: `src/**/*.{ts,tsx}`, `e2e/**/*.ts`, `scripts/**/*.ts`. Ignored: `dist/`, `node_modules/`,
`coverage/`, `.cache/`, `.claude_backup/` and `src/cli/types/generated/`. Rules are the stock
`js.configs.recommended` + `tseslint.configs.recommended` presets — 65 active rules, no bespoke
list. The one override is `@typescript-eslint/no-unused-vars`, configured to honour the
leading-underscore convention `standards/clean-code-standards.md` § 9.6 already documents.
`eslint-config-prettier` is applied last, so ESLint never reports formatting.

One further scoped override landed in 0.147.1: `@typescript-eslint/triple-slash-reference` is off for
`**/*.d.ts`. The idiom is correct in a declaration file, and for `@lydell/node-pty` it is the only
option — that package ships `"exports": "./index.js"` with no `types` condition, so its declarations
are unreachable through module resolution. Scoped in the config rather than suppressed at the call
site, because it is true of every declaration file.

**What to do:**

- **Run `npm run lint` over the whole repo and expect a clean exit.** Any problem you see is yours.
  The previous "lint only the files you touched" instruction is **retired** — it existed to keep the
  148-problem baseline from drowning new signal, and there is no baseline left to drown it.
- **Report the result honestly.** "No ESLint errors" is now a claim you can actually make, and it
  now means something, because the gate runs.
- **Four inline suppressions remain, and each is justified in place. Do not remove them and do not
  add a fifth without the same standard of justification:**

  | Suppression                         | File                                                 | Why it must stay                                                                                                                                             |
  | ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `no-control-regex`                  | `src/cli/lib/configuration/config.ts`                | The pattern deliberately matches control characters — that IS the validation                                                                                 |
  | `no-control-regex`                  | `src/cli/utils/exec.ts`                              | Same; plugin-path control-character rejection                                                                                                                |
  | `no-var`                            | `src/cli/lib/__tests__/factories/skill-factories.ts` | `let` would **throw** — `var` avoids a TDZ error in circular ESM imports. The reason is written on the directive line                                        |
  | `@typescript-eslint/no-unused-vars` | `e2e/matchers/setup.ts`                              | Vitest `Assertion<T>` declaration merging requires the type parameter's **name** to match verbatim (`TS2428`); the rule's `^_` escape hatch does not compile |

- **`eslint --fix` across the repo is no longer forbidden** (the two wrong auto-fixes it would have
  applied were in the burned-down baseline), but there is nothing for it to fix.

**Residual gaps — these are the real entries in this section now:**

- **`eslint-plugin-react-hooks` is NOT installed.** This is an Ink/React codebase with **no hooks
  linting at all**. Two effects in `src/cli/components/hooks/use-measured-height.ts` would be
  flagged if it were added; the correct response there is `useCallback` on `measure`, not widening
  dependency arrays.
- **`reportUnusedDisableDirectives` is not enabled.** It was blocked on a clean baseline and is now
  actionable. It would have caught both 2026-07-30 dead-directive defects by itself.
- **No `no-restricted-syntax` rule for task-IDs in test names.** Deliberately left out to keep the
  initial rule set stock, so `agent-findings/2026-07-17-d167-task-id-recurrence-no-lint-guard.md`
  remains unclosed.
- **`prettier --check .` passes — this is no longer a gap (corrected 2026-08-03).** The entry has
  been wrong twice over. It first named `.ai-docs/**/*.md` as the blocker; the 2026-08-02 (c) pass
  disproved that and named **`src/cli/lib/seed/fetch-seed.ts`** as the single remaining offender,
  leaving it unfixed because `src/` was outside that pass's write scope. Both halves are false now.
  Verified this session **by running the tool** from `packages/cli`, not by reading a release note:
  `bun run format:check` (`prettier --check .`) exits `0` with "All matched files use Prettier code
  style!", and `prettier --check src/cli/lib/seed/fetch-seed.ts` exits `0` on its own — the package
  was reformatted. The consequence recorded here is discharged with it: `prepublishOnly` runs
  `format:check` **first**, and it no longer stops there. Kept in this section as lineage only; an
  agent sent to go fix `fetch-seed.ts` will find nothing to fix.
- **Neither code generator runs in any gate.** `generate:types`, `generate:schemas` and
  `generate:schemas:check` appear in `prepublishOnly`, `.husky/pre-commit` and the workflows
  **zero** times. Corrected 2026-08-03: this bullet used to continue "the only
  `.github/workflows/` file is a cross-repo dispatch, so there is no CI build or test gate at all",
  and that is no longer true. `.github/workflows/ci.yml` is the repository's only workflow and it
  is not a dispatch — its `check-cli` job runs `typecheck`, `lint`, `test` and `test:e2e` for this
  package. CI exists; it simply never invokes either generator. (`check-web`'s `bun run generate`
  is `packages/matrix`'s vendored-catalog generator, a different script.) `typecheck:scripts` is
  likewise in no composite gate, which is how `scripts/` stayed untypechecked long enough to hide a
  phantom field and two fabricated SkillIds. Checked-in generated output can therefore drift from
  its source silently. See `reference/features/code-generation.md`.
  Adoption write-up and the option chosen:
  `agent-findings/2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run.md` (`status:
resolved`). The burndown to zero is written up across three 2026-08-01 findings:
  `unused-catch-binding-hid-a-discarded-validator-cause`,
  `as-any-on-valid-union-members-is-noise-that-hides-two-fabrications`,
  `unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written`, plus
  `e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing` and
  `eslint-flags-two-typescript-mandated-constructs-it-cannot-express`.
  `2026-07-20-e2e-spec-files-accumulate-unused-imports-unenforced.md` is now covered
  (`no-unused-vars` runs over `e2e/`).

## Agent Findings Pipeline

Sub-agent feedback loop for standards improvement. See [`agent-findings/README.md`](agent-findings/README.md) for pipeline details.

## Agent Suggestions

Forward-looking proposals (may or may not land). See [`agent-suggestions/README.md`](agent-suggestions/README.md) for the status enum (`proposal` / `approved` / `in-progress` / `mostly-completed` / `absorbed-informally` / `absorbed` / `rejected` / `superseded`) and resolution fields.

### Decided — both 2026-07-30 proposals adopted (decision recorded 2026-07-30)

Two standards proposals arising from the 2026-07-30 bug-fix batch were **approved by the user and
adopted the same day**. Nothing in this section is awaiting a decision. Each proposal file carries a
terminal `status:` plus `resolution_date` / `resolution_note`; the rules themselves live in the
standards files named below, which are the authoritative text.

| Proposal                                             | Status     | Rule now lives in                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-07-30-identity-key-helper-export-exception.md` | `absorbed` | `CLAUDE.md` -> "NEVER do this" -> "Code Style" — the export exception is appended to the "NEVER export constants only used within the same file" bullet itself. Identity/lookup-key helpers may be exported before a second caller exists; `skillSlotKey` and `agentSlotKey` in `src/cli/lib/wizard/scope-diff.ts` are the cited examples. |
| `2026-07-30-column-geometry-snapshot-rule-6-17a.md`  | `absorbed` | `standards/clean-code-standards.md` -> "6. Testing" — new rule **6.17a**, between 6.17 and 6.18. A component laying content out in fixed-width columns must carry at least one `toMatchInlineSnapshot()` per layout branch.                                                                                                                |

**Residual from the first proposal — closed 2026-07-30.** Its second half — a key-families rule for
`clean-code-standards.md` — was scoped out of the first adoption pass and landed later the same day
as rule **8.7** under "8. DRY", so that proposal file now carries `status: absorbed`. What 8.7 preserves: the wizard has
**two `` `${a}:${b}` `` key families** that look identical and must never be unified — SLOT keys
(`skillSlotKey` / `agentSlotKey`, `(id, scope)`, session diffs) and MERGE keys (`skillKey` /
`agentKey` in `lib/configuration/config-merger.ts`, `(id, scope, excluded)`, D-221 entry identity).
Routing one through the other silently changes merge behaviour around tombstones.

## Coverage Metrics

**Source Files:** **367** TypeScript files in `src/cli/` — **193** production (excludes `*.test.*`, `__tests__/`, `__mocks__/`) + **136** test specs (`*.test.*`) + **36** non-spec `__tests__/` support files + **2** `__mocks__/`. (The `__tests__/` directories hold 85 files total: 49 specs + 36 support.) **Re-derived with `find` on disk 2026-08-04** (was 350 / 184 / 129 / 35 / 2 on 2026-08-01, which had gone stale across 0.148.0 and 0.149.0 — the config-gate, per-agent tuning and `init --from` work). **Paths are now `packages/cli/src/cli/`**; the bare `src/cli/` form is kept here because every other doc in this corpus uses it — see `reference/monorepo-layout.md`, which is the one deliberate exception.
**E2E Suite:** **219** TypeScript files in `e2e/` (**181** `*.test.ts(x)` + **38** helpers/fixtures/pages) — **re-derived with `find` on disk 2026-08-04** (was 204 / 167 / 37 on 2026-08-01). Of the 181: **178** `*.e2e.test.ts` + **3** `*.smoke.test.ts`. Per directory: `commands` 39, `interactive` 56, `lifecycle` 78, `integration` 3, `matchers` 1, `smoke` 1 e2e + 3 smoke. **`matchers/` holds one spec and is easy to miss** — a per-directory sum that omits it lands one short of the total, which is how a previous basis reconciled while being wrong.
**Agent Findings:** count NOT restated here — owned by `reference/findings-impact-report.md` per the count-ownership registry in `standards/documentation-bible.md`. That file's snapshot-boundary callout carries the basis and is the only place the number is written. **Re-derive from it, never from this map, and note that its callout records the basis moving DURING the 2026-08-01 regeneration — a count quoted from anywhere else is a count nobody re-derived.**
**Agent Suggestions:** no proposals awaiting a decision. The two added 2026-07-30 were both adopted the same day — `2026-07-30-identity-key-helper-export-exception.md` (`absorbed`; export exception in `CLAUDE.md`, key-families rule landed as **8.7**) and `2026-07-30-column-geometry-snapshot-rule-6-17a.md` (`absorbed`; rule 6.17a in `standards/clean-code-standards.md`). Named rather than counted, so this line cannot drift. **Note on 6.17a:** it was adopted, its two required snapshots were written, and both were then regenerated with `vitest -u` to agree with a wrong change — an adopted rule is not an enforcing one.
**Product Version:** 0.149.0 (`packages/cli/package.json`, verified 2026-08-04)
**All major systems documented:** Yes

> **This section owns the source/E2E file counts.** Per the count-ownership registry in `standards/documentation-bible.md`, no other doc restates them — they reference this section instead. Re-derive with `find`, never carry forward.

**Technical Areas:**

- Architecture: [DONE] (`architecture/overview.md` + `architecture-overview.md`)
- Commands: [DONE] (`commands/index.md` CANONICAL + `commands/edit.md` + `commands.md` POINTER)
- Type System: [DONE] (`types/core-types.md` + `types/operations-types.md` + `types/zod-schemas.md` + `type-system.md`)
- State Management: [DONE] (`wizard/store-map.md` + `store-map.md`)
- Compilation Pipeline: [DONE]
- Configuration: [DONE] (`config/configuration.md` + `config/config-writer.md` + `config/config-merger.md` + `features/configuration.md`)
- Wizard Flow: [DONE] (`wizard/flow.md` + `features/wizard-flow.md`)
- Skills & Matrix: [DONE]
- Plugin System: [DONE]
- Component Patterns: [DONE] (`wizard/component-patterns.md` + `component-patterns.md`)
- Utilities: [DONE]
- Test Infrastructure: [DONE] (`testing/infrastructure.md` + `testing/factories.md` + `testing/mock-data.md` + `testing/e2e-infrastructure.md` + `testing/harness-decisions.md` + `test-infrastructure.md`)
- Monorepo Layout: [DONE] (`monorepo-layout.md` — the repository around `packages/cli`)
- Operations Layer: [DONE]
- Agent System: [DONE]
- Dependency Graph: [DONE] (`architecture/dependency-graph.md` + `dependency-graph.md`)
- Boundary Map: [DONE] (`architecture/boundary-map.md` + `boundary-map.md`)
- State Transitions: [DONE] (`wizard/state-transitions.md` CANONICAL + `state-transitions.md` POINTER)
- Findings Impact Report: [DONE]
- **Seed Contract: [DONE]** (`features/seed-contract.md`) — closed 2026-08-02 (c). Opened as `[NOT-STARTED]` by the (b) pass, which found it by diffing `commands/init.tsx`'s imports against `dependency-graph.md`. **`types/zod-schemas.md` deliberately does not cover it** — that doc scopes itself to `src/cli/lib/schemas.ts` by its own first line, so its count is not wrong, merely narrower than "every Zod schema in the CLI"; a reader who assumes otherwise misses `seed-schema.ts` entirely. That scope note is now written into `zod-schemas.md` itself rather than living only here.
- Model & Effort Axis: [DONE] (`features/model-and-effort.md`)
- Code Generation: [DONE] (`features/code-generation.md`)
- Built-in Catalogue: [DONE] (`features/built-in-catalogue.md`)
- Source Fetch & Cache: [DONE] (`features/source-fetch-and-cache.md`)
- Skill Primitives: [DONE] (`skills/skill-primitives.md`)
- Build & Packaging: [DONE] (`build-and-packaging.md`)
- Leaf Exports: [DONE] (`leaf-exports.md`) — **staging area, not a permanent home.** Drains into owning docs and is deleted when empty

**Deferred gaps opened by the 2026-08-02 (c) pass (not closed):**

- **`lib/skills/source-switcher.ts` + `generators.ts`: [NOT-STARTED]** — the two remaining `lib/skills` modules. They exist today only as prose inside `features/skills-and-matrix.md`; `skills/skill-primitives.md` deliberately scoped them out and is the directory they belong in. `source-switcher.ts` has 8 unit specs (derived by subtraction from the 118 in that directory), `generators.ts` emits `skill-categories.ts` / `skill-rules.ts` content for a source repo.
- **`agent.liquid`'s camelCase frontmatter fields: [NOT-STARTED]** — a rendering probe run during the (c) pass proved `agent.permission_mode` and `agent.disallowed_tools` in the template never resolve the camelCase `permissionMode` / `disallowedTools` on `AgentConfig`, so `permissionMode` always emits `default` and `disallowedTools` never emits at all. Recorded as a contrast in `features/model-and-effort.md` (establishing that single-token `model`/`effort` are unaffected) but **NOT traced to its callers**. This looks like a live defect, not a doc gap; it belongs to whoever owns `features/compilation-pipeline.md`, and the warning attached to it is: do not "normalise" `model`/`effort` into the same shape while fixing it.
- **`generate-json-schemas.ts` has zero tests: [NOT-STARTED]** — and cannot currently have one, because `generate()` is invoked unconditionally at module scope with a hardcoded output directory. Recorded in `features/code-generation.md` § Known gaps. Its sibling generator has 34.

**Cross-Cutting Concepts (NEW):**

- Scope System: [DONE] (`concepts/scope-system.md`)
- Tombstone Pattern: [DONE] (`concepts/tombstone-pattern.md`)
- Guard Pattern: [DONE] (`concepts/guard-pattern.md`)

## Validation History

> **Read every entry below as a point-in-time record, not a current claim.** Counts, line numbers and version strings inside a dated entry were true on that entry's date and have NOT been re-verified since. **Never quote a number out of the Validation History.** Current verified counts live only in their owning documents — see the count-ownership registry in `standards/documentation-bible.md`. Entries predating 2026-07-30 also contain source line numbers, which project convention now bans in documentation; they are left in place as historical record and must not be copied forward.

### 2026-08-05 -- tool-version unification absorption (ADDITIVE, no dates advanced)

Absorption pass, not a validation pass. The repository unified four tool versions on 2026-08-05
(React 18 → 19.2.8, Ink 5 → 7.1.1, TypeScript 5.7 → 6, ESLint 9 → 10, Vitest 3 → 4, Node floor
`>=20`/`>=18` → `>=22`). The reasoning lived in `todo/repo.md` under REPO-06, which that tracker
deletes on landing by its own rule, so the durable parts were moved into `reference/` before it goes.

**Scope: six reference docs across two passes, (a) and (b). No `src/`, `e2e/`, `todo/`,
`standards/` or package file touched, no dependency or config changed, and no git command of any
kind run.** Nothing here re-derived a whole file, so **no `last_validated` was advanced**; five of
the six carry a dated `PARTIAL 2026-08-05` annotation naming exactly what was checked.
`build-and-packaging.md` carries two, (a) and (b), with (a) marked superseded and kept as the
record of why (b) exists.

| Doc                         | Change                                                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `monorepo-layout.md`        | "Dependency versions" rewritten from a placeholder that said the split was deliberate and refused to explain it. Now carries the version table, why unification was held back from the merge, the `node_modules`-root mechanism, the two-React-copies rule, and two verification rules |
| `testing/infrastructure.md` | Two sections added — why `ink-testing-library` is safe despite looking abandoned, and the write-the-key-and-print-what-arrives technique                                                                                                                                               |
| `boundary-map.md`           | One paragraph in §3.4a — enforcement layer (2) is the only config-gate layer with no test behind it, and how to prove it still fires across an ESLint major                                                                                                                            |
| `build-and-packaging.md`    | §3 corrected: it asserted `engines.node` was `>=18.0.0`, which is false. New subsection on the three separate declarations of the runtime floor and the CI Node pin; new trap 9. **Revised later the same day — see the (b) pass below**                                               |
| `architecture-overview.md`  | Two cells corrected: tech stack said `ink v5`; Project Identity's Runtime row now carries the `>=22` floor                                                                                                                                                                             |

**Two stale claims were found and corrected rather than absorbed**, both created by the landing
itself: `build-and-packaging.md`'s `engines.node (>=18.0.0)` and `architecture-overview.md`'s
`ink v5`. Neither would have been caught by a link check or a count audit — they are version strings
inside prose, and the only thing that finds them is reading the manifest.

#### 2026-08-05 (b) -- the floor drift this pass documented was fixed hours later

The (a) pass recorded that the runtime floor was declared three ways that disagreed: both
`engines.node` fields at `>=22` while `tsup.config.ts` still said `target: "node18"`. **Flagging it
is what got it fixed** — `tsup.config.ts` now says `node22`, with a comment naming `engines.node` as
the thing it must stay in step with. So `build-and-packaging.md` was describing a state that no
longer existed, roughly a day after being written.

Revised, not deleted. The subsection's premise was false but its substance was not: the floor
genuinely is stated in three files, nothing checks that they agree, and they genuinely did drift
once. It is now titled **"The runtime floor is declared in three places, and they must be changed
together"** and says they agree today, lists all three, and names the drift as the precedent. Two
things were added: that correcting `target` changed the built output by **zero bytes** (measured —
407 files, no hash mismatch across 262 compared, chunk names unchanged — while the setting was
separately proved live, so the null result means the source contains no syntax in that band, not
that the setting is inert), and that `tsconfig.json`'s `target: "ES2022"` is the **language** target,
a separate undecided question, explicitly kept out of the floor table so nobody "aligns" it.

Also corrected in this pass, and unrelated to any of today's work:
`features/code-generation.md` said `engines` "names only `node >=18`". It says `>=22`. That claim
was true when written on 2026-08-02 and was not updated when the floor moved.

**The lesson worth keeping is about sequencing, not about the fact.** A documentation pass that
reports drift can cause the drift to be fixed, which makes the report wrong. Neither writing it nor
fixing it was a mistake. What matters is that the doc was revised around what survived rather than
reverted — the mechanism (three declarations, nothing enforcing agreement) outlives whether they
happen to agree on any given day.

**Judged situational and deliberately NOT preserved:** the four split-only workarounds as a
four-item list (all deleted; the two mechanisms behind them are kept, the enumeration is not), the
eight `preserve-caught-error` fixes ESLint 10 surfaced, the two React type-signature changes in
`use-panel-scroll.ts` and `edit.test.ts`, the `@inkjs/ui` / `react-devtools-core` compatibility
notes, and the Ink 7 `interactive` / `waitUntilRenderFlush()` opportunity — that last one is
outstanding work with its own tracker row, not reference material.

### 2026-08-02 (e) -- cite-by-symbol enforcement: the three docs that shipped with line numbers

Citation-form pass over `reference/` only. Scope: **`reference/features/source-fetch-and-cache.md`,
`reference/skills/skill-primitives.md`, `reference/leaf-exports.md` and this map. No `src/`, `e2e/`,
`docs/`, `todo/`, `standards/` or package file touched. No git command of any kind run.
`generate:schemas:check` never invoked.** No `last_validated` advanced — the pass changed how claims
point at code, not whether they hold; each of the three rows carries a dated annotation saying so.

**The breach.** The (d) pass wrote the cite-by-symbol rule into `documentation-bible.md` after
finding that all six line citations in `clean-code-standards.md` § 7.2 had rotted, one onto a path
that no longer exists. The (c) pass, run the same day, had already shipped eight new reference docs —
three of which carried source line citations. All 41 older reference docs carry zero. The three were
the entire remaining population.

| Doc                                  | `.ts:NN` citation sites (pre-pass) | Line-number tokens converted |
| ------------------------------------ | ---------------------------------- | ---------------------------- |
| `skills/skill-primitives.md`         | 94                                 | 210                          |
| `features/source-fetch-and-cache.md` | 78                                 | 197                          |
| `leaf-exports.md`                    | 62                                 | 138 (+ 8 doc-to-doc)         |

Token count exceeds site count because a single citation frequently carried a continuation list
(`` `types/matrix.ts:214`, `:220` ``) or a bare `` `:NN` `` back-reference inside the same paragraph.

**Every citation was converted by reading the code at the cited location**, not by stripping `:NN`.
Where a citation pointed at a declaration, it became the declaration's name; where it pointed inside
a function, it became the enclosing function plus, when the paragraph needed the precision, the local
binding (`categoryUnion`, `agentsDirRelPath`, `alreadyInPlace`, `gigetCacheRoot`, `displayPath`).
Where it pointed at a test, it became the spec or `describe` title. Where the enclosing symbol added
nothing over a column that already named it — an inventory table's `Line` column beside its `Export`
column — the column was dropped rather than reworded, per the bible's "prefer the symbol column".

**Two claims were WRONG and are corrected**, both found only because verifying a line number forces
you to open the file:

1. `source-fetch-and-cache.md`'s `fetchMarketplace` call-site table named the caller
   **`tagPublicFallback`**. No such symbol exists anywhere in `src/` or `e2e/`; the function at that
   location is `tagPublicSourceSkills`. A grep for the documented name returned only the doc itself.
2. `skill-primitives.md` cited `skill-copier.test.ts:11` for "seeds the matrix singleton with
   `initializeMatrix`". Line 11 is the `consts` import; `initializeMatrix` is imported on line 12.
   The claim held, the pointer did not — which is exactly the failure mode the rule exists to remove.

**Two citation classes were deliberately left alone**, and a later pass should decide about them
rather than assume this one missed them:

- **Doc-to-doc line refs** (`` [other-doc.md](...) `:399-402` ``). Out of the stated scope, and
  converting them means choosing section anchors in files this pass was not asked to open. **The
  five that pointed into the two docs this pass reflowed were converted** — those the reflow would
  have silently invalidated. The rest are unchanged and remain a rot surface.
- **`giget dist :NNN` refs** in `source-fetch-and-cache.md`. They point into
  `node_modules/giget/dist/shared/giget.<hash>.mjs`, a content-hashed third-party bundle, not into
  our source. The doc already states the chunk name changes on reinstall and gives the grep that
  re-locates it, and it names the giget symbols (`cacheDirectory`, `sourceProtoRe`, `inputRegex`)
  alongside every line number.

**Verification.** `grep -rEc '\.tsx?:[0-9]+' .ai-docs/reference/` returns zero across all 48 files.
The other five (c)-pass docs (`seed-contract.md`, `model-and-effort.md`, `code-generation.md`,
`build-and-packaging.md`, `built-in-catalogue.md`) were checked for stragglers in every form —
`.ts:NN`, bare `` `:NN` ``, and prose "lines N-M" — and carry none. `prettier --check` passes on all
four touched files. Thirty-four named symbols were re-located in source by grep after conversion.

### 2026-08-02 (d) -- standards coverage pass: four conventions in force, none written down

Additive pass over `standards/` only. Scope: **`standards/clean-code-standards.md`,
`standards/documentation-bible.md` and this map. No `src/`, `e2e/`, `docs/`, `todo/`, package file or
`reference/` doc touched. No git command of any kind run. `generate:schemas:check` never invoked.**
Neither file's `last_validated` advanced — the pass added rules, it did not re-verify either file;
both carry a dated PARTIAL annotation saying so.

**Four conventions were enforced in code and absent from `standards/`.** Each was verified against
the mechanism that enforces it before being written:

| New rule   | Convention                                                           | Enforced by                                                                                                                       |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 4.7        | User-facing instructions read `${CLI_INVOKE_COMMAND} <cmd>`          | `consts.ts` — the constant's own JSDoc states the convention; `bin` in `package.json` registers both `agents-inc` and `agentsinc` |
| 5.7        | Every write funnels through `writeFile()` in `utils/fs.ts`           | `eslint.config.js` `FS_WRITE_PATHS` over `src/**`, with `utils/fs.ts` the single exemption                                        |
| 6.19       | A flag-gated suite uses `describe.skipIf(!FEATURE_FLAGS.X)`          | `lib/feature-flags.ts` + the three `WIZARD_SETTINGS_OVERLAY` E2E suites                                                           |
| 15.8-15.10 | The global config pair is `config-gate/`'s exclusive write privilege | four layers: barrel privacy, `eslint.config.js`, the tripwire in `utils/fs.ts`, `__tests__/config-gate-enforcement.test.ts`       |

**One rule was wrong, not merely missing.** Old 15.8 told callers to write a GLOBAL `config-types.ts`
via `writeStandaloneConfigTypes`. That function **does not exist in `src/`** (`grep`: only two `e2e/`
JSDoc mentions survive), and the write it described is now exactly what the gate refuses. Rewritten
as 15.8-15.9 against `config-gate/index.ts` and `configuration/config-types-writer.ts`.

**Two claims handed to this pass were checked and did not hold.** Both are recorded rather than
written down, because a standards doc that overstates is worse than one that is silent:

1. **"Flag-gated tests use `skipIf`, as done for the marketplace/new-agent commands."** They do not:
   all six `new skill` / `new agent` / `new marketplace` suites are `describe.skip`, as are the two
   `FILTER_INCOMPATIBLE` E2E suites. `skipIf` on a flag has exactly three sites, all
   `WIZARD_SETTINGS_OVERLAY`. 6.19 states the ratio (3 vs 8) rather than implying a settled practice.
2. **"Documentation carries no source line numbers."** The claim holds and the rule is now written —
   but the counter-evidence had to be counted before that could be said. `reference/` carries **223**
   `file.ts:NN` citations, and they are **not** spread across the corpus: **all 41 pre-(c) reference
   docs carry zero**, and all 223 sit in three of the eight docs the (c) pass just landed
   (`features/source-fetch-and-cache.md` 68, `skills/skill-primitives.md` 62, `leaf-exports.md` 57).
   So the convention was in force and three new docs breached it — the opposite of the "not really a
   rule" reading a bare corpus-wide count invites. **Those three are `reference/`, out of this pass's
   write scope; whoever next takes a FULL pass on them owns the conversion.**

**The rule is now stated, and its counter-examples were the proof.** `standards/documentation-bible.md`
gains **"No Source Line Numbers — Cite by Symbol"** (replacing "Line Numbers and Staleness", whose
per-document staleness guidance is kept), plus corrections everywhere else in that file that
instructed the opposite: Core Principle 3, validation step 1, the claim-verification table (`Line
number` row -> `Symbol name`), the "Current" doc-health bullet, the self-correction trigger table
(one row corrected, one added), and the critical reminders. `grep "line number"` on that file now
returns only the new rule and its grounding.

Grounding, re-derived this session: **all six line citations in `clean-code-standards.md` § 7.2
pointed at the wrong construct.** `project-config.ts:39` landed on a JSDoc line (the cast is in
`loadProjectConfigFromDir`); `loader.ts:33` on a blank line; `wizard-store.ts:146` on a `/**`;
`metadata-keys.ts:21` on a comment for the cast one line below; `base-command.ts:23` on **a path that
does not exist** (the file is `src/cli/base-command.ts`); and `loader.ts:155` described a
directory-name -> `SkillId` cast that **loader.ts no longer contains at all** — that cast now lives in
`classifyLocalSkill` in `skills/skill-metadata.ts`. All six rewritten as symbol citations. Note the
last one: it is not a stale line, it is a stale EXAMPLE that a line number made unfalsifiable.

**Already covered, changed nothing.** The count-ownership rule (a countable fact is owned by exactly
one doc, others link) is fully stated in `standards/documentation-bible.md` under "A Count Lives in
Exactly One Document", including the ownership registry and the 39-vs-35 Zod incident that grounds it.

**Left for the map's owner.** This entry's own preamble says line numbers are banned "in
documentation" and that pre-2026-07-30 history entries keep them as historical record. That is now
consistent with `standards/`, so no edit was made — but the preamble is the only place the ban was
written before today, and it is in a section explicitly labelled non-authoritative.

### 2026-08-02 (c) -- coverage expansion: eight new reference docs integrated

The first pass in this window that **adds** tracked areas rather than re-checking existing ones.
Eight documents were written against source by separate keepers and integrated here. Scope:
**`.ai-docs/` only. No source, test, `todo/`, `e2e/` or `docs/` file touched. No git command of any
kind run. `generate:schemas:check` never invoked.**

**Tracked areas 32 -> 40. Reference files on disk 41 -> 49.** Both re-derived with `find`, not
incremented — see the superseded-arithmetic callout under Invariant 4, which records why.

**Eight new docs, all `[DONE]` on a genuine FULL basis:** `features/seed-contract.md`,
`features/model-and-effort.md`, `features/code-generation.md`, `features/built-in-catalogue.md`,
`features/source-fetch-and-cache.md`, `skills/skill-primitives.md`, `build-and-packaging.md`,
`leaf-exports.md`. Each is 435–634 lines, none is a pointer, and `skills/` is a new directory.
**The `[NOT-STARTED]` Seed Contract area opened by the (b) pass is closed by the first of these.**

**Verification performed by this integration pass, not taken on trust.** All eight files confirmed
present on disk, and **one claim per doc was independently re-checked against source**:

| Doc                    | Claim spot-checked                                                            | Result                                                                           |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| seed-contract          | `SEED_VERSION = 3`, consumed as `z.literal(SEED_VERSION)`                     | Confirmed in `lib/seed/seed-schema.ts`                                           |
| model-and-effort       | `MODEL_NAMES` has five members including `fable`                              | Confirmed in `types/matrix.ts`                                                   |
| code-generation        | `SCHEMA_ENTRIES` = 10 entries against 12 files in `src/schemas/`              | Confirmed — the 11th `filename:` hit is the type declaration, not an entry       |
| built-in-catalogue     | 17 stacks, pinned by `EXPECTED_STACK_COUNT`                                   | Confirmed in `default-stacks.ts` + its spec                                      |
| source-fetch-and-cache | `MAX_MARKETPLACE_PLUGINS` is **enforced**, not merely available               | Confirmed — `source-fetcher.ts` throws above the limit                           |
| skill-primitives       | `computeFileHash(SKILL.md)`, not `computeSkillFolderHash`, feeds `forkedFrom` | Confirmed — `generateSkillHash` in `skill-copier.ts`                             |
| build-and-packaging    | `config-exports.ts` exports 9 symbols across 7 statements                     | Confirmed (4 values + 5 types)                                                   |
| leaf-exports           | `METADATA_KEYS` has exactly one importer and one referenced key               | Confirmed — `matrix-loader.ts`, and the use is message text, not a property read |

**Eight contradictions found between the new docs and existing ones. All resolved in favour of the
code**, each verified against source before editing:

| Existing doc                           | Was                                                                                               | Now                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `boundary-map.md`                      | `MAX_MARKETPLACE_PLUGINS` "(available for marketplace size validation)"                           | `source-fetcher.ts` (`fetchMarketplace`) — it throws; the constant is live                       |
| `types/core-types.md`                  | `MODEL_NAMES` listed with four members                                                            | Five, `fable` added; an `EffortLevel` section added (the doc had none)                           |
| `types/core-types.md`                  | "Only `SkillSlug`, `ModelName`, `PermissionMode` have `z.enum` bridges"                           | `EffortLevel` added — it is a fourth                                                             |
| `types/core-types.md` + `store-map.md` | `AgentScopeConfig` as `{ name, scope, excluded? }` (three places)                                 | `model?` / `effort?` added — they are declared on the type                                       |
| `types/zod-schemas.md`                 | 35 exported schemas, Bridge table of 4                                                            | **36**, Bridge table of **5** (`effortLevelSchema`) — moved together so the breakdown still sums |
| `features/agent-system.md`             | `ModelName` as four members (two places); `agent.schema.json` paired with `agentYamlConfigSchema` | Five members; the JSON Schema is **generated** from `agentYamlGenerationSchema`                  |
| `features/skills-and-matrix.md`        | `computeSkillFolderHash` "used for `forkedFrom.contentHash`"                                      | It feeds plugin versioning; both sides of that comparison use `computeFileHash(SKILL.md)`        |
| `commands/index.md`                    | `init` flag table lacked `--from`; guard was `skills.length === 0` with `"No skills selected"`    | `--from` documented; guard is skills **AND** agents empty, message from `selection.emptyMessage` |

The last of these was the most consequential: an agent-only payload with zero skills installs
successfully today, and the doc said it errored.

**One stale claim in this map corrected by running the tool:** the "Known Tooling Gaps" entry
naming `.ai-docs/**/*.md` as the `prettier --check .` blocker. `.ai-docs` is clean (exit `0`, all 49
reference files); the offender is `src/cli/lib/seed/fetch-seed.ts`, left unfixed because `src/` was
outside this pass's write scope. A second gap entry was added: **neither generator, nor
`generate:schemas:check`, nor `typecheck:scripts`, runs in any gate** — there is no CI build or test
workflow at all.

**Cross-references added into 20 existing docs** (link-style only, no rewrites): `boundary-map.md`
(incl. a new §6.5 recording the seed fetch as an input boundary), `dependency-graph.md` (note 14b's
"no reference doc yet describes the seed contract" repointed — it was the single place a reader was
told the doc did not exist), `commands/index.md`, `types/core-types.md`, `types/zod-schemas.md`,
`type-system.md`, `store-map.md`, `architecture-overview.md`, `component-patterns.md`,
`utilities.md`, `concepts/scope-system.md`, `config/config-writer.md`, `config/config-merger.md`,
`features/{configuration,skills-and-matrix,agent-system,compilation-pipeline,plugin-system,operations-layer,wizard-flow}.md`,
`testing/infrastructure.md`, `testing/e2e-infrastructure.md` (which gained the missing
`seed-config-store.ts` fixture row — a real loopback HTTP server, the only socket-binding fixture in
that directory).

**Three deferred gaps opened, not closed** — recorded under Technical Areas: the two remaining
`lib/skills` modules; `generate-json-schemas.ts`'s complete absence of tests; and the
`agent.permission_mode` / `agent.disallowed_tools` template fields that never resolve their
camelCase sources, which is a probable live defect rather than a doc gap and is handed to whoever
owns `compilation-pipeline.md`.

**Two non-calendar validation triggers now exist**, and neither is expressible as a staleness
threshold. `features/seed-contract.md` depends on a file in a **different repository**
(`agents-inc-web-monorepo/packages/matrix/src/seed.ts`) with no shared package, sync script or test
linking the two copies. `features/source-fetch-and-cache.md` replicates a **private** algorithm of
`giget`, and every test touching that branch mocks giget entirely, so the suite cannot detect a
layout change. A 14-day timer catches neither; both rows say so.

**Method note carried forward.** Three of the eight writers independently reported catching
themselves mid-pass: one attributed a behaviour to `matrix-resolver.ts` on the strength of a grep
hit that turned out to be an unrelated exclusivity check; one wrote a claim about a `?? false`
coalesce that a doc it had not read already refuted; one counted e2e specs by `it(` and had to
verify the absence of `it.each` before the number was safe. All three were caught by opening the
file rather than trusting the grep. **This is the same failure the `dependency-graph.md` rule
exists for: validate by diffing against source, never by checking the rows you already have.**

### 2026-08-02 (b) -- post-landing reconciliation (PARTIAL passes, no dates advanced)

Ran after the 2026-08-02 (a) sweep below, against the code as it stood at the END of the day —
the token-mint move (D-309), the `writeProjectPartial` normalization (D-308), the
`WIZARD_SETTINGS_OVERLAY` withdrawal (D-307), `update`'s registered-project refresh and the dual
`bin` mapping all landed after (a) had already annotated several files. Scope: **`.ai-docs/` only.
No source, test, `todo/`, `e2e/` or `docs/` file touched. No git command run.**

**No `last_validated` frontmatter was advanced.** All eight files received PARTIAL passes and each
carries a dated `PARTIAL 2026-08-02 (b)` annotation above the prior one, which is preserved.
Days Stale in the dashboard is unchanged and still correct; do not recompute it from this entry.

**Statements corrected from FALSE to true (5):**

| Was                                                                                  | Now                                                                               | Verified against                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Guard test is **17 specs** (in BOTH `boundary-map.md` and `config/config-writer.md`) | **23** — and the quantity now exists in ONE doc                                   | Ran the file: `vitest run src/cli/lib/__tests__/config-gate-enforcement.test.ts` → `23 passed`         |
| Settings overlay "opened from the sources step via HOTKEY_SETTINGS"                  | Withdrawn: both call sites gated on `FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY`       | `feature-flags.ts` (`false`) + the two gated branches in `components/wizard/wizard.tsx`                |
| `store-map.md` described `showSettings` / `toggleSettings` as live                   | Both annotated dormant, matching the `filterIncompatible` pair's existing wording | Same; `toggleSettings` has no reachable production caller                                              |
| Binary is `agents-inc` (single registered bin)                                       | `bin` maps **both** `agents-inc` and `agentsinc`; `oclif.bin` stays the one name  | `package.json` `bin` block; the convention comment beside `CLI_INVOKE_COMMAND` in `consts.ts`          |
| `dependency-graph.md` rows for `init`, `update`, `eject`                             | Missing edges added (see below)                                                   | Enumerated every `commands/**` lib import from source and DIFFED against the rows, per its own note 16 |

**The spec count was fixed by ownership, not just by arithmetic.** Two reference docs restated it
and BOTH read 17, so correcting both would have rebuilt the same trap. `config/config-writer.md` is
now declared the owner; `boundary-map.md`'s row names the file instead of the number. The count is
23 **executable specs**, not 23 `it(` calls — two `it.each` blocks contribute two cases each, which
is why counting by grep gives 21 and is wrong. That distinction is recorded in the owning doc.

**Missing import edges recorded (`dependency-graph.md`).** The (a) pass states in its own ✗ that it
covered `edit / compile / eject / uninstall / new *` — **`init` and `update` were never checked,
and both were wrong**:

- `init` → `lib/config-gate/` (`GateReport` type) and → **`lib/seed/`** (`fetchSeedConfig`,
  `seedToWizardResult`). The entire `lib/seed/` module was absent from the file.
- `update` → `recompilePropagatedProjectAgents` (operations), → `lib/config-gate/`
  (`normalizeProjectPath`), → `lib/configuration/project-config` (`loadProjectConfigFromDir`).
- `eject` → `lib/loading/` (`SourceLoadResult` type) — pre-existing, found by the same diff.
- Notes **14a** (update is now a CONTENT fan-out; it writes no pair and deliberately does not go
  through the gate, which is why `normalizeProjectPath` is exported as a pure matcher) and **14b**
  (init is the sole consumer of `lib/seed/`) added. `lib/exit-codes` remains correctly excluded by
  the table's own scope note.

**New coverage added (not corrections):** the `AUTO-GENERATED by agents-inc — DO NOT EDIT` stamp
emitted by `assembleConfigTypesSource`, including the asymmetry that the CONFIG half carries no
stamp because it is the hand-editable one (`generateBlankGlobalConfigSource` confirmed stamp-free);
the `npx agents-inc <cmd>` phrasing convention, which lived only in `consts.ts`; and
`toHavePluginInRegistry`'s content assertions, which were described as a bare registry lookup.

**Checked and found already correct — recorded because a clean result is only evidence if the check
is named.** The D-309 mint move is stated accurately in `config/config-writer.md` (§L3 and the
entry list — seven minting entries, matching the seven `withGateToken` sites in `index.ts`) and in
`boundary-map.md`'s Data OUT chain; **no doc anywhere still claims `pair-writer` mints its own
token**, which was the specific risk this pass was asked to sweep for. D-308's
`writeProjectPartial` normalization, `buildProjectTypesExtras`'s widening, D-304's settings.json
warn removal, and `update`'s `refreshRegisteredProjects` write-up in `commands/index.md` were all
already accurate and unchanged.

**One coverage gap opened, not closed:** `src/cli/lib/seed/` has no reference doc. Recorded as
`[NOT-STARTED]` under Technical Areas with the reason it is worth documenting. Deliberately NOT
folded into `types/zod-schemas.md`, which scopes itself to `lib/schemas.ts` by its own first line.

**Files touched (8):** `reference/config/config-writer.md`, `reference/boundary-map.md`,
`reference/architecture-overview.md`, `reference/store-map.md`, `reference/dependency-graph.md`,
`reference/utilities.md`, `reference/testing/e2e-infrastructure.md`, `DOCUMENTATION_MAP.md`.
All pass `prettier --check`; the four that failed after editing were re-formatted. **Every one of
the 41 files under `reference/` is now prettier-clean**, and this map was clean before this pass
edited it — its only formatting failure was in the block above, which was then fixed. That narrows
the "prettier fails on `.ai-docs`" entry under Known Tooling Gaps to `standards/`, which this pass
did not check and does not own.

### 2026-08-02 -- config-gate landing: doc sweep (PARTIAL passes, no dates advanced)

Ran after `src/cli/lib/config-gate/` landed and made a set of previously-true statements false.
Scope: **documentation and `todo/` only. No source or test file touched. No git command run.**

**No `last_validated` frontmatter was advanced.** Every file below received a PARTIAL pass — the
config-write surface was re-derived from source, nothing else was — so per the rule at the top of
this map each carries a dated `PARTIAL 2026-08-02` annotation in its body while its stamp stays
where it was. Days Stale in the dashboard is therefore unchanged and still correct; do not
recompute it from this entry.

**Files given a `PARTIAL 2026-08-02` body annotation (4):** `reference/config/config-writer.md`,
`reference/architecture-overview.md`, `reference/boundary-map.md`,
`reference/features/operations-layer.md`, plus `reference/dependency-graph.md` (its 2026-08-01 FULL
basis is preserved beneath the new annotation).

**Files corrected without an annotation (targeted dead-name / behaviour fixes only):**
`reference/features/configuration.md`, `reference/features/plugin-system.md`,
`reference/features/agent-system.md`, `reference/features/compilation-pipeline.md`,
`reference/concepts/scope-system.md`, `reference/concepts/tombstone-pattern.md`,
`reference/config/config-merger.md`, `reference/config/scope-split.md`,
`reference/config/configuration.md`, `reference/commands/index.md`, `reference/commands/edit.md`,
`reference/types/operations-types.md`, `reference/findings-impact-report.md`,
`reference/testing/infrastructure.md`, `reference/testing/e2e-infrastructure.md`,
`standards/e2e/README.md`, `standards/e2e-testing-bible.md`, `docs/reference/architecture.md`.

**Dead names swept from live docs.** `writeScopedConfigs`, `regenerateScopeConfigTypes`,
`writePartialProjectConfig`, `ensureBlankGlobalConfig`, `saveSourceToProjectConfig`,
`writeStandaloneConfigTypes`, `ScopedConfigWriteResult` and `config-saver.ts` no longer name live
code. Remaining occurrences are deliberate: historical records (`agent-findings/`, `changelogs/`,
`todo/TODO-completed.md`, this Validation History) and explicit "the former X" phrasings that
exist so a reader searching the old name lands on the replacement.

**STEP_TEXT count corrected: 75 -> 77**, re-derived from `e2e/pages/constants.ts` (not carried
forward). `PROPAGATED_RECOMPILE` and `SOURCE_ADDED` were added by the config-gate work. Both
owning documents were updated in the same session per the count-ownership rule:
`reference/testing/e2e-infrastructure.md` and `standards/e2e/README.md`.

**Two behaviour changes recorded in the command docs** (there is no unreleased-changelog
convention in `changelogs/`, so none was invented): `eject` at `~` now writes the `config-types.ts`
sibling alongside `config.ts`, and `new marketplace` at `$HOME` is refused by the gate rather than
merged (that command is behind an off compile-time flag, so no user is affected today).

**The D-240 contract is rewritten, not deprecated.** "A write that propagates RECOMPILES the
propagated projects' agents itself and returns a `GateReport`; callers render the report." The
previous caller-owned contract was honoured by `init` and `edit` only, which is why `edit`'s
project-context source migration and the global `uninstall` both left stale compiled agents.

### 2026-08-01 -- Index rebuild (0.146.1 + 0.147.0 + 0.147.1 bundle, post four-keeper sweep)

Ran after three releases shipped and four keepers swept `reference/` and `standards/`. Scope:
**`reference/findings-impact-report.md` and `DOCUMENTATION_MAP.md` only.** No other doc's body was
edited — where another keeper's work needed recording, the row was annotated, not the doc rewritten.
**No source or test file touched. No git command run.** One new finding filed.

**The staleness dashboard was REBUILT from frontmatter, not edited.** All 41 `reference/**/*.md`
files had their `last_validated` re-read this session. No date was carried forward from the previous
table and none was inferred from a prose annotation — which matters, because ten files this window
carry a dated `2026-08-01` annotation while correctly holding a `2026-07-30` stamp.

**Row status changes (10):**

| Row                                           | Was                  | Now                               | Why                                                                                                            |
| --------------------------------------------- | -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `commands/index.md`                           | **NEEDS-VALIDATION** | OK — **FLAG CLEARED**             | Corrupt-project-config gap documented; 16-command inventory + all flag/arg tables re-derived, zero mismatches  |
| `testing/e2e-infrastructure.md`               | **NEEDS-VALIDATION** | **NEEDS-VALIDATION (NARROWED)**   | Five gaps closed (incl. `STEP_TEXT` 64 -> 74); POM inventories and all TIMEOUTS/path constants still unchecked |
| `store-map.md`                                | OK, 0 days           | OK — **FULL 2026-08-01**, 0 days  | Whole file re-validated; re-stamped correctly                                                                  |
| `utilities.md`                                | OK, 0 days           | OK — **FULL 2026-08-01**, 0 days  | Whole file re-validated; re-stamped correctly                                                                  |
| `types/zod-schemas.md`                        | OK, 0 days           | OK — **FULL 2026-08-01**, 0 days  | Whole file re-validated; re-stamped correctly                                                                  |
| `dependency-graph.md`                         | OK, 0 days           | OK — **FULL 2026-08-01**, 0 days  | Every edge re-derived by grep; 13 of 17 Operations->Lib rows were wrong                                        |
| `findings-impact-report.md`                   | OK — **REGEN OWED**  | OK — **REGEN DISCHARGED**, 0 days | Full regeneration done; both triggers discharged; Pattern V newly named                                        |
| `test-infrastructure.md`                      | 7 days               | 9 days                            | Date basis moved 07-30 -> 08-01; pointer correctly not re-stamped by either sweep                              |
| 26 further rows                               | 0 days               | 2 days                            | Date basis moved; **none of these files was re-stamped, and none should have been**                            |
| `config/configuration.md` (untracked pointer) | 2026-07-30           | **2026-08-01**                    | Opened, all nine redirect destinations confirmed to resolve; re-stamped on link-integrity basis only           |

**ESLint baseline corrected — the substantive change in this pass.** "Known Tooling Gaps" recorded
`npm run lint` exiting 1 with **150 problems** and instructed agents to lint only the files they
touched and never report a repo-wide clean result. **All three instructions were wrong.** Verified by
running the tool: `npx eslint .` produces no output and exits `0`. The baseline reached zero in
0.147.1 with **no rule disabled**. The section is rewritten: the four remaining inline suppressions
are tabulated with the reason each must stay, and the residual gaps are now the genuine entries
(`eslint-plugin-react-hooks` not installed at all, `reportUnusedDisableDirectives` not enabled, no
task-ID `no-restricted-syntax` rule, `prettier --check` still failing on `.ai-docs/**/*.md`).

**Counts re-derived with `find`, none carried forward:**

| Claim                      | OLD     | NEW         | Verified against                                                       |
| -------------------------- | ------- | ----------- | ---------------------------------------------------------------------- |
| `src/cli` TypeScript files | 347     | **350**     | `find src/cli -name '*.ts' -o -name '*.tsx'`                           |
| — production               | 183     | **184**     | same, excluding `*.test.*`, `__tests__/`, `__mocks__/`                 |
| — specs                    | 127     | **129**     | `*.test.ts` / `*.test.tsx`                                             |
| — `__tests__/` support     | 35      | 35          | unchanged, so both new specs are co-located                            |
| `e2e/` TypeScript files    | 197     | **204**     | `find e2e -name '*.ts' -o -name '*.tsx'`                               |
| — specs                    | 160     | **167**     | 164 `*.e2e.test.ts` + 3 `*.smoke.test.ts`, per-directory totals diffed |
| — support                  | 37      | 37          | unchanged; the 7 new specs reused existing helpers                     |
| `reference/**/*.md`        | 41      | 41          | unchanged                                                              |
| Product version            | 0.146.0 | **0.147.1** | `package.json`                                                         |
| ESLint baseline            | 150     | **0**       | `npx eslint .` — no output, exit 0                                     |

**Frontmatter-vs-annotation cross-check (new check this pass).** Every `reference/` and `standards/`
file's frontmatter `last_validated` was compared against the newest date appearing in any HTML
comment in its own body, and the comment classified FULL / PARTIAL / plain. **Zero files carry a
frontmatter date newer than their own annotation admits. Zero files are stamped current on the
strength of a PARTIAL annotation.** Two files were caught doing exactly that earlier in this sweep
and had their dates restored; this check confirms no third case survives. It is a mechanical check
and belongs in every future index pass — it is the only thing that catches a partial pass
mis-stamping itself, and the dashboard is structurally blind to it.

**Findings-level work:** `reference/findings-impact-report.md` fully regenerated. Both triggers were
live (23 findings past the 135-file snapshot, three releases shipped). One new finding filed —
`2026-08-01-link-integrity-scan-scope-excludes-the-keys-that-dangle.md` — after extending the
directory's link scan to `related:` and `standards_docs:` found **4 dangling targets** the
bible-mandated three-key scan cannot see. **Filing it moved the basis mid-pass from 157 to 158, and
every table was re-derived at the close rather than pinned at the opening count.**

**5-invariant Map Self-Consistency Audit (re-run 2026-08-01 — every value recomputed from disk; nothing copied from the audit below):**

- **Invariant 1 (header counts == table rows):** **PASS.** `Total Areas` 32 = 18 original + 14 new. Staleness dashboard 18 + 14 = 32 rows. Reference tables 18 + 14 = 32. `Documented` 32 == `Total Areas` 32. `Needs Validation` moved 2 → 1 (one discharged, one narrowed but still flagged); that field counts flags, not rows, and does not enter this invariant.
- **Invariant 2 (row uniqueness):** **PASS.** All 32 dashboard row names distinct; no file appears in two rows. The two same-stem pairs (`commands/index.md` vs `commands.md`, `wizard/state-transitions.md` vs `state-transitions.md`) remain correctly distinguished.
- **Invariant 3 (cross-surface sync):** **PASS.** All 32 Reference-table `Last Validated` values match the corresponding file's disk frontmatter, re-extracted this session across all 41 files. Note the deliberate asymmetry introduced this pass: for the ten PARTIAL-pass files, `Last Updated` reads **2026-08-01** (work was done) while `Last Validated` reads **2026-07-30** (the work was not whole-file). That is the correct encoding of a partial pass and is not an Invariant 3 violation — the invariant binds `Last Validated` to frontmatter, and it does.
- **Invariant 4 (disk vs map, verified BY NAME):** **PASS.** `find reference -name '*.md'` = **41**. Built the expected 41-member set explicitly (32 tracked + 9 untracked pointers) and diffed it against the disk listing: **exact membership match, zero differences** — not merely equal cardinality. **All 11 pointer files were re-opened and read this session**, and the untracked-pointer table now carries a `Lines` column as the evidence: every pointer is 16–72 lines of redirect table, against 342 / 485 / 551 / 696 for the four canonical bodies in flipped or same-stem pairs. The pointer set by name is: `architecture/overview.md`, `architecture/dependency-graph.md`, `architecture/boundary-map.md`, `commands.md`, `state-transitions.md`, `config/configuration.md`, `wizard/flow.md`, `wizard/store-map.md`, `wizard/component-patterns.md` (untracked), plus `type-system.md` and `test-infrastructure.md` (tracked). **This is the invariant that silently passed on a mis-enumerated set through four prior audits, and the arithmetic-only form of it would pass again today** — the membership diff is what makes it real.
- **Invariant 5 (header date freshness):** **PASS.** `Last Updated` = `Last Validated` = frontmatter `last_validated` = `Date basis` = 2026-08-01 = today. Newest row annotation 2026-08-01; lag 0 days.

**Cross-keeper inconsistency found: ONE, and it is a correct disagreement rather than drift.**
`reference/findings-impact-report.md`'s Per-Reference-Doc table had the `store-map.md` pointer pair
**inverted** — it labelled `reference/wizard/store-map.md` (16 lines) as the canonical doc at HIGH
priority and `reference/store-map.md` (342 lines) as "(pointer)" at LOW. Corrected this pass by
reading both files. **This is the same defect Map Invariant 4 exists to catch, replicated inside the
report that tracks it** — which is why Invariant 4's by-name requirement now needs to apply to every
surface that names a pointer, not just to this map's own table.

**Everything else the four keepers left is mutually consistent**, including the two surfaces that
had drifted apart most: `standards/e2e/README.md` and `reference/testing/e2e-infrastructure.md` now
**both** state `STEP_TEXT` at **74**, both re-derived from `e2e/pages/constants.ts` on 2026-08-01,
and each carries an explicit cross-reference telling the next validator to grep the other in the
same session. Verified against source this pass: disk has 74.

### 2026-07-30 -- Reconciliation pass (post-bug-fix residuals)

Ran after five bug fixes and their test coverage landed on product **0.146.0**, later the same day
as the index-consistency pass below. Scope: **index-level and findings-level residuals only** —
`DOCUMENTATION_MAP.md`, `reference/findings-impact-report.md`, `reference/config/config-writer.md`
(one cross-reference), two `agent-findings/` files, two new `agent-suggestions/` files, one new
finding. **No source or test file touched. No git command run.** No other `reference/` doc's body
was edited; where content drift was found, the row was flagged rather than the doc rewritten.

**The five fixes, each verified against source before anything was documented:**

| #   | Fix                                          | Verified how                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `uninstall` survives an unreadable config    | `loadUninstallConfig` in `src/cli/commands/uninstall.tsx` catches `ConfigLoadError` only (`if (!(error instanceof ConfigLoadError)) throw error`), warns via callback, returns `null`                                                                                                 |
| 2   | Shared path normalization                    | module-private `normalizeProjectPath` in `local-installer.ts` -> `fs.realpathSync`; three call sites confirmed (`registerProjectPath`, `deregisterProjectPath`, the current-project skip in `propagateGlobalChangesToProjects`); **no fallback tier**, deliberately                   |
| 3   | `Scope` header alignment                     | `source-grid.tsx` — header moved inside the `SCOPE_COL_WIDTH` box; `SKILL_NAME_WIDTH` box is an empty width reservation. **Superseded 2026-07-31:** the caption was dropped entirely (the box is now an uncaptioned spacer); the gutter and its `Global`/`Project` row headers remain |
| 4   | `agentSlotKey` added + exported              | defined and used in `lib/wizard/scope-diff.ts`, re-exported from `lib/wizard/index.ts`; **no consumer outside its own file** — the export is pre-emptive by design                                                                                                                    |
| 5   | `ConfigWriteResult.globalConfigPath` deleted | type in `operations/project/write-project-config.ts` now has `config`, `configPath`, `wasMerged`, `existingConfigPath?`, `filesWritten`, `propagatedProjects`; every remaining `globalConfigPath` in `src/` is an unrelated local variable                                            |

**Counts corrected (OLD → NEW), each re-counted on disk this session, none carried forward:**

| Claim                       | OLD             | NEW                       | Verified against                                                                                          |
| --------------------------- | --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `e2e/` TypeScript files     | 196             | **197**                   | `find e2e -name '*.ts' -o -name '*.tsx'`                                                                  |
| — E2E specs                 | 159             | **160**                   | new `e2e/commands/uninstall-corrupt-config.e2e.test.ts` (5 tests)                                         |
| — E2E support               | 37              | 37 (unchanged)            | `writeCorruptConfig` / `UNINSTALL_CONFIG_UNREADABLE` went into EXISTING files                             |
| Agent findings (map's copy) | 125 / 127 `.md` | **removed from this map** | count-ownership rule — `findings-impact-report.md` owns it; the map now points there instead of restating |

**Counts re-verified and UNCHANGED:** `src/cli` 347 total / 183 production / 127 specs / 35
`__tests__` support / 2 `__mocks__`; `reference/**/*.md` = 41; product version 0.146.0. The day's
source fixes edited existing files and added no new production module.

**Count-ownership correction.** The map was restating the agent-findings total in three places
(header, dashboard annotation, reference-table row) while `findings-impact-report.md` owns it per
the registry in `standards/documentation-bible.md`. All three now reference the owner rather than
quote a number — which is the rule's whole point, since the two surfaces had already drifted (the
dashboard annotation still read "99 findings on disk", two passes stale). The Agent Suggestions
entry is listed **by name rather than by count** for the same reason.

**Rows flagged `NEEDS-VALIDATION` (2).** Both docs carry a legitimately current `last_validated`,
so the staleness dashboard is structurally blind to them — the flag is the only signal:

1. `testing/e2e-infrastructure.md` — `STEP_TEXT` enumerated exhaustively as "All 64 members", disk
   has **65** (`UNINSTALL_CONFIG_UNREADABLE` missing); `e2e/commands` claimed **30** specs, disk has
   **31**; test-utils table omits `writeCorruptConfig`. (`e2e/interactive` 47 and `e2e/lifecycle` 75
   re-counted and CORRECT.) Also owes one sentence on `process.cwd()` canonicalization.
2. `commands/index.md` — documents the corrupt-**global**-config warn on deregistration but not the
   corrupt-**project**-config path added by fix 1.

**Findings-level residuals closed:**

- `2026-04-21-d233-projects-normalization-asymmetry.md` moved `partial` → **`superseded`**, paired
  with `superseded_by:` per `TEMPLATE.md` rule 3. Its `partial_note` was **false** — it asserted the
  code fix was still pending and pinned two line numbers (`L622`/`L651`) that had both moved — so it
  was removed rather than rewritten, `partial_note:` being a claim about what is pending _now_. A
  Closure Note records the supersession and the deliberately-omitted fallback tier.
- `2026-07-25-register-deregister-path-normalization-asymmetry.md` gained the mirror `supersedes:`
  key, and its "Docs still to update (keeper pass)" section — itself now stale — was rewritten to
  DONE after both named passages in `config-writer.md` were verified rewritten.
- `config/config-writer.md`: the one sentence describing the 2026-04-21 finding as "still marked
  `partial` on disk" was corrected, since this pass falsified it.

**5-invariant Map Self-Consistency Audit (re-run 2026-07-30, reconciliation pass — every value recomputed from disk; nothing copied from the audit below):**

- **Invariant 1 (header counts == table rows):** **PASS.** `Total Areas` 32 = 18 original + 14 new. Staleness dashboard 18 + 14 = 32 rows (extracted programmatically from the row cells, not counted by eye). Reference tables 18 + 14 = 32. `Documented` 32 == `Total Areas` 32. Note `Needs Validation` moved 0 → 2; that field counts flags, not rows, and does not enter this invariant.
- **Invariant 2 (row uniqueness):** **PASS.** All 32 dashboard row names distinct; no file appears in two rows. The two previously-collided labels (`commands/index.md`, `wizard/state-transitions.md`) remain correctly distinguished from their same-stem root pointers.
- **Invariant 3 (cross-surface sync):** **PASS.** All 32 Reference-table `Last Updated`/`Last Validated` values match the corresponding file's disk frontmatter, re-extracted this session across all 41 files. 31 rows read 0 days stale; `test-infrastructure.md` reads 7, matching its `2026-07-23` frontmatter exactly. **No doc was re-stamped by this pass** — the two docs with content drift were flagged, not re-dated, because re-stamping a file this pass did not content-validate would destroy the signal (Pointer Freshness Rule, consequence 1, applied to a non-pointer). The 4 un-restamped pointers stay at 2026-07-23.
- **Invariant 4 (disk vs map, verified BY NAME):** **PASS.** `find reference -name '*.md'` = **41**. Built the expected 41-member set explicitly (32 tracked + 9 untracked pointers) and diffed it against the disk listing: **exact membership match, zero differences**, not merely equal cardinality. Pointer direction re-confirmed by reading all 11 pointer files — every one is 16–60 lines of redirect table, against 631 lines (`commands/index.md`) and 547 (`wizard/state-transitions.md`) for the two flipped-pair canonicals. This is the invariant that silently passed on a mis-enumerated set through four prior audits.
- **Invariant 5 (header date freshness):** **PASS.** `Last Updated` = `Last Validated` = frontmatter `last_validated` = `Date basis` = 2026-07-30 = today. Newest row annotation 2026-07-30; lag 0 days.

**Findings filed:** `.ai-docs/agent-findings/2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run.md`.

**Stale counts in files outside this agent's ownership — recorded, not edited.** Per the
count-ownership rule ("if the other file is outside your ownership, record the mismatch in a file
you _do_ own — naming the stale file, its stale value, and its owner"). Both quote a
**denominator** of 125 findings that this session's recount moved. The numerator (**39** files with
no `status:`) was re-verified on disk this session and is **still correct** — only the total is
stale, so the substantive claim in each stands:

| Stale file                         | Stale text                                                                               | Owner             | Correct action                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `standards/documentation-bible.md` | "As of 2026-07-30, 39 of **125** findings omit it"                                       | convention-keeper | Re-derive the denominator, or better: drop it and cite the owning doc, per its own count-ownership rule |
| `agent-findings/TEMPLATE.md`       | three occurrences of "**125** findings" in the schema-rules and KNOWN-GAP comment blocks | convention-keeper | Same — the "39" is right, the "of 125" is not                                                           |

Not edited here for two reasons: `standards/` is explicitly outside codex-keeper's scope, and
`TEMPLATE.md`'s schema commentary was authored by the same pass that owns the bible. Flagging beats
a cross-boundary edit that the owner would have to re-verify anyway.

**Residual defects recorded but NOT fixed (out of this pass's scope, all in `findings-impact-report.md` Priority Action 16):** a **dangling `supersedes:` target** (`2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md` points at `2026-04-20-new-agent-toggle-defaults-global-scope.md`, which does not exist on disk); the long-known unpaired `superseded_by:` on `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse.md`, which in fact carries **no `status:` at all**; and 39 findings still lacking `status:`. A link-integrity scan over `supersedes:` / `superseded_by:` / `blocked_by:` targets is proposed as a seventh pre-processing defect class — it is a one-line existence check and nothing currently performs it.

### 2026-07-30 -- Index-consistency pass (final pass of the nine-agent sweep)

Closes the nine-agent reference + e2e-standards sweep on product **0.146.0**. Scope was the **index layer only**: `DOCUMENTATION_MAP.md`, `standards/documentation-bible.md`, `agent-findings/TEMPLATE.md`, plus one narrow correction to `reference/findings-impact-report.md`. No source or test file touched; no other `reference/` doc touched (the nine agents' work is final).

**Counts corrected (OLD → NEW), each re-derived from disk this session:**

| Claim                            | OLD                 | NEW                                                                | Verified against                                   |
| -------------------------------- | ------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Exported Zod schemas             | 39                  | **35**                                                             | `export const *Schema` in `src/cli/lib/schemas.ts` |
| `defaultCategories` size         | 51 (implied)        | **89** (27 exclusive, 6 required)                                  | `src/cli/lib/configuration/default-categories.ts`  |
| `src/cli` TypeScript files       | 344                 | **347**                                                            | `find src/cli -name '*.ts' -o -name '*.tsx'`       |
| — production                     | 181                 | **183**                                                            | excl. `*.test.*`, `__tests__/`, `__mocks__/`       |
| — test specs (`*.test.*`)        | 126                 | **127**                                                            | all `*.test.ts(x)`                                 |
| `e2e/` TypeScript files          | 174                 | **196**                                                            | `find e2e -name '*.ts' -o -name '*.tsx'`           |
| — E2E specs                      | 138                 | **159**                                                            | all `*.test.ts(x)` under `e2e/`                    |
| — E2E support                    | 36                  | **37**                                                             | helpers / fixtures / pages                         |
| Agent findings on disk           | 99 / 121 (snapshot) | **125** findings (**127** `.md` incl. `README.md` + `TEMPLATE.md`) | `find agent-findings -name '*.md'`                 |
| Pointer files under `reference/` | 9                   | **11** (9 untracked + 2 tracked)                                   | read all 41 files                                  |

**Counts re-verified and UNCHANGED:** `SkillId` 222, `SkillSlug` 222, `Category` 89, `Domain` 9, `AgentName` 23 (all from `src/cli/types/generated/source-types.ts`). The type-system row's historical note "claimed 161 SkillIds / 51 Categories — actually 222 / 89" is still accurate on the 222/89 half; what changed is that `defaultCategories` now **defines** all 89 rather than 51.

**Structural fixes:**

1. **Commands canonical/pointer misclassification (root cause of a two-release drift).** `reference/commands/index.md` (631 lines) is CANONICAL; root `reference/commands.md` (30 lines) is the pointer. Verified by reading both. Three surfaces disagreed: the dashboard row was labelled `commands.md`, the directory diagram annotated `index.md # -> commands.md (pointer)`, and **both** prior invariant audits (iter 43, iter 50) counted `commands/index` among the pointers "intentionally not tracked in the staleness dashboard". Net effect: the canonical commands reference was excluded from staleness tracking and drifted through 0.145.0 and 0.146.0 still documenting `uninstall --all`, a flag oclif rejects. All surfaces corrected; the two historical audit entries annotated in place rather than rewritten.
2. **Pointer rule codified.** The 4 files still at `2026-07-23` are all pointers that two agents deliberately declined to re-stamp, having made no content judgement on them. Rather than churning their dates, the behaviour is now the rule (Pointer Freshness Rule, `documentation-bible.md`): pointers carry a 30-day link-integrity threshold, are `OK` while their targets resolve, and MUST NOT be bumped by a sweep that did not open them. All 11 pointers' redirect targets verified to resolve.
3. **Stale index-level counts purged at source.** Per the new "A Count Lives in Exactly One Document" rule, counts were **removed** from index annotations rather than corrected: `documentation-bible.md`'s `# All 39 Zod schemas` and `# (34 factories)` now describe scope only, and a count-ownership registry names the single owning doc for each frequently-duplicated count.
4. **Doc-Touching Changes hook table rebuilt.** It had **no row** for `src/cli/lib/installation/**` or `src/cli/lib/plugins/**` — the mechanical reason two targeted sync passes both skipped `features/plugin-system.md` while `local-installer.ts` (**1584 lines**, joint most-cited file in the findings at 22 citations) absorbed the entire D-279 masking layer. Audited every `src/cli/` directory for an owning doc; added 11 rows so the table is now total. Also widened the command row from command-level to **signature-level** (flags/args/aliases), which is the gap that let `--all` survive.
5. **New rules added** to `documentation-bible.md`: heading-list-vs-exported-surface diff (a pass that only checks existing claims cannot detect a section that was never written — how a 349-line feature shipped undocumented); Known-Limitations re-validation covering both narrowed and **closed** limitations (D-240 shipped in 0.145.0 yet was documented as OPEN in three docs); agent-findings pre-processing scan widened 3 checks → 6.
6. **`TEMPLATE.md` schema tightened.** `status:` is now required and enumerated; the `type:` vs `root_cause:` enums are documented as disjoint (`enforcement-gap` is `root_cause`-only); `superseded_by:` ⇒ `status: superseded` pairing documented. Backfill recorded as a known gap — **39 of 125** findings carry no `status:`, 1 carries an out-of-enum `type:`, 1 has an unpaired `superseded_by:`. Existing findings deliberately NOT bulk-edited.
7. **`findings-impact-report.md`** (one narrow correction): its priority list flagged `features/plugin-system.md` as the highest doc-drift risk "unvalidated since v0.144.1". A sibling agent rewrote that file in this same sweep (now `last_validated: 2026-07-30`, with a full cross-scope-reconciliation section), so the item was marked DONE/superseded and the per-doc row downgraded. Snapshot boundary stated explicitly: rollups are pinned at 121 files, disk now holds 125 (127 `.md` incl. `README.md` + `TEMPLATE.md`), and the 4-file delta is logged in Incremental Updates.

**5-invariant Map Self-Consistency Audit (re-run 2026-07-30 — every value recomputed, none carried forward):**

- **Invariant 1 (header counts == table rows):** **PASS.** Total Areas 32 = 18 original + 14 new. Staleness dashboard 18 + 14 = 32 rows. Reference tables 18 + 14 = 32 rows. `Documented` 32 == `Total Areas` 32.
- **Invariant 2 (row uniqueness):** **PASS.** No file appears in more than one dashboard row. Two prior label collisions resolved: the row formerly labelled `commands.md` now names `commands/index.md`, and the row formerly labelled `state-transitions.md` now names `wizard/state-transitions.md`, so neither collides with the untracked root pointer of the same stem.
- **Invariant 3 (cross-surface sync):** **PASS.** All 32 Reference-table `Last Updated`/`Last Validated` values match the corresponding file's disk frontmatter. 31 dashboard rows read 0 days stale; `test-infrastructure.md` reads 7, matching its `2026-07-23` frontmatter exactly. Pointer/target date gaps are exempt per the Pointer Freshness Rule and are not counted as violations.
- **Invariant 4 (disk vs map):** **PASS, after a naming fix.** `find .ai-docs/reference -name "*.md" | wc -l` = **41** = 32 tracked + 9 untracked pointers. The arithmetic matched before this pass too — but the pointer set was **mis-enumerated by name** (`commands/index` and `wizard/state-transitions` listed as pointers instead of `commands.md` and `state-transitions.md`). Same total, wrong members, canonical doc left untracked. Invariant 4 now requires name-level verification.
- **Invariant 5 (header date freshness):** **PASS.** `Last Updated` = `Last Validated` = frontmatter `last_validated` = `Date basis` = 2026-07-30 = today. Newest row annotation is also 2026-07-30; lag is 0 days.

**Finding filed:** `.ai-docs/agent-findings/2026-07-30-index-audit-arithmetic-passed-while-pointer-set-was-misnamed.md`.

### 2026-07-24 -- Scoped D-226 + D-219-launcher E2E-harness doc sync (2 docs)

Documentation-only follow-up to the E2E harness change that stopped the sandbox `HOME` from collapsing onto `cwd`/`projectDir` and added the scope-explicit wizard launchers. Verified every claim against `e2e/` source (`helpers/terminal-session.ts`, `helpers/test-utils.ts` `runCLI`, `pages/wizards/init-wizard.ts`, `pages/wizards/edit-wizard.ts`, `pages/wizard-result.ts`, `fixtures/cli.ts`). No `src/` or `e2e/` code changed.

**Docs touched (2 of 32 — deliberately scoped, NOT a full-repo sweep):**

1. `reference/testing/e2e-infrastructure.md` — `InitWizard`/`EditWizard` inventories now list `launchInProject`, `launchInGlobal`, the asserting `globalHome` getter, and the `globalHome?` reuse option; `runCLI` + `CLI.run` HOME behaviour corrected (sibling `ai-e2e-home-*` default, precedence `env.HOME > globalHome > dir`); `WizardResult` row notes `ProjectHandle.globalHome`; new "Scope & HOME model" section cross-links the standards "Choosing the Wizard Launcher by Scope" rules; stale `HOME: cwd` claim removed. Frontmatter already 2026-07-24; Reference-table + dashboard rows synced 2026-07-23 → 2026-07-24.
2. `reference/findings-impact-report.md` — appended a 2026-07-24 H3 to "Incremental Updates" (4 D-226/D-219 findings: finding→impacts table, actions, new Pattern N "launcher-must-match-scope"). Primary A..M tables unchanged per the append flow. `last_validated` 2026-07-23 → 2026-07-24; header notes 99 findings on disk (95 in primary tables).

**Findings flipped `partial → resolved`** (the anti-patterns.md "Choosing the Wizard Launcher by Scope" section, their pending doc/code part, now exists): `2026-07-24-d226-phase1-launcher-sugar-and-multiphase-home.md`, `2026-07-24-d226-phase2-wave1-source-switch-lock-and-global-stack.md`, `2026-07-24-d226-phase2-wave2-uninstall-cwd-only-launcher.md`. Used the findings-schema enum value `resolved` + `resolved_by:` (not the non-enum `complete`). `2026-07-24-d226-stepA-breaks-43-miscategorized-tests.md` left `partial` (its pending part is the deferred 43-test port, not a doc edit).

**Scope note (Invariant 3 deferred):** only the 2 touched rows were dated 2026-07-24; the other 30 reference rows remain 2026-07-23. Each touched row still matches its own disk frontmatter (Invariant 4 preserved per-row). A future full sweep reconciles the remaining rows + `Date basis` note.

### 2026-07-23 -- Full reference re-validation (two-pass sweep) + gap-fill + findings regeneration

Product version 0.144.1. Whole `reference/` set re-validated and re-stamped `2026-07-23`.

**Pass 1+2 (per-area codex-keeper validation):** 227 stale claims corrected across the reference docs (file paths, exported symbol names, type shapes, counts) and every touched doc re-stamped. All 41 disk frontmatter now read `last_validated: 2026-07-23`.

**Gap-fill pass (new source-of-truth modules the now-accurate docs still omitted):** folded coverage for the following verified modules into the existing doc structure (no new reference files created):

- `src/cli/lib/wizard/scope-diff.ts`
- `src/cli/lib/installation/install-base-dir.ts`
- `src/cli/lib/configuration/scope-predicates.ts`
- `src/cli/components/wizard/run-wizard-session.tsx`
- `src/cli/components/wizard/step-settings.tsx`
- `src/cli/lib/stacks/stack-plugin-compiler.ts`
- `src/cli/lib/plugins/plugin-ref.ts`
- `src/cli/lib/agents/list-compiled-agents.ts`
- `src/cli/lib/operations/project/compile-agents-all-scopes.ts`
- The full 16-command surface, including `import/skill`, `new/agent`, `list`, `uninstall`, `update` (leaf files under `src/cli/commands/`: build/marketplace, build/plugins, compile, doctor, edit, eject, import/skill, init, list, new/agent, new/marketplace, new/skill, search, uninstall, update, validate).
- Refreshed agent inventory (agent-system.md).

**Findings-impact-report regeneration:** `reference/findings-impact-report.md` fully regenerated over the 95 findings on disk (72 filed in July 2026); window 2026-04-17..2026-07-23; systemic patterns re-lettered A..M; Incremental Updates reset to empty. Map's dashboard annotation and Findings Impact table row updated to match.

**Map reconciliation applied this session:**

1. Header `Last Updated` / `Last Validated` / frontmatter `last_validated` → 2026-07-23; header narrative rewritten for the two-pass sweep.
2. Staleness dashboard: every reference row's Days Stale confirmed `0` (thresholds unchanged); `Date basis` note → 2026-07-23.
3. Reference Documentation tables (Original 18 + New 14 = 32 rows): every row's `Last Updated` and `Last Validated` → 2026-07-23.
4. Coverage Metrics recomputed and independently re-verified with `find`: `src/cli` totals 344 `.ts(x)` files = 181 production (excl. `*.test.*`, `__tests__/`, `__mocks__/`) + 126 co-located test specs + 35 non-spec `__tests__/` support + 2 `__mocks__/` (the `__tests__/` dirs hold 79 files: 44 specs + 35 support); `e2e/` 174 files = 138 specs + 36 support. Prior headline was 203 production / 140 e2e.
5. Findings row/date/count synced to the 2026-07-23 regeneration (95 findings).

**5-invariant Map Self-Consistency Audit (re-run):**

- **Invariant 1 (header counts == table rows):** PASS. Total Areas 32 = 18 original + 14 new; staleness dashboard 18 + 14 = 32 rows; Reference tables 18 + 14 = 32 rows.
- **Invariant 2 (no duplicate rows):** PASS. No doc name appears in more than one dashboard row.
- **Invariant 3 (cross-surface sync):** PASS. All 32 Reference-table `Last Updated`/`Last Validated` = 2026-07-23; all 32 dashboard Days Stale = 0; all 41 disk frontmatter `last_validated: 2026-07-23`.
- **Invariant 4 (disk vs map):** PASS. `find .ai-docs/reference -name "*.md" | wc -l` = 41 = 32 tracked + 9 pointers. Unchanged this session — gap-fill edited existing files only; no reference `.md` added or removed.
- **Invariant 5 (header date freshness):** PASS. Date basis = 2026-07-23 = today.

No structural fixes required beyond the date/count reconciliation above.

### 2026-04-21 Ralph iter 50 -- first formal Map Self-Consistency Audit

Applied the 5-invariant audit codified in `standards/documentation-bible.md` (iter 49, rule 10).

**Invariant 1 (header counts match table rows):** PASS. Total Areas 32 = 18 original + 14 new; staleness dashboard 18 + 14 = 32 rows; Reference tables 18 + 14 = 32 rows.

**Invariant 2 (no duplicate rows):** PASS. No duplicate doc names in staleness dashboard.

**Invariant 3 (cross-surface sync):** 8 violations fixed. Reference-table `Last Validated` drifted to `2026-04-13` on 8 rows while staleness dashboard showed `0 days` and frontmatter `last_validated: 2026-04-21`. Bumped all 8 to `2026-04-21`:

1. Architecture Overview (`reference/architecture-overview.md`)
2. Commands Reference (`reference/commands.md`)
3. Type System (`reference/type-system.md`)
4. Component Patterns (`reference/component-patterns.md`)
5. Test Infrastructure (`reference/test-infrastructure.md`)
6. Test Infrastructure New (`reference/testing/infrastructure.md`)
7. Operations Types (`reference/types/operations-types.md`)
8. Zod Schemas (`reference/types/zod-schemas.md`)

**Invariant 4 (disk-vs-map):** PASS. 41 `.md` files on disk under `reference/` = 32 tracked + 9 pointer files documented in directory diagram (architecture/{overview,dependency-graph,boundary-map}, commands/index, wizard/{flow,state-transitions,store-map,component-patterns}, config/configuration). No orphans.

> **Correction (2026-07-30):** this enumeration named the wrong members. `commands/index.md` and `wizard/state-transitions.md` are **canonical**, not pointers; the pointers in those two pairs are root `commands.md` and root `state-transitions.md`. The total of 9 was right, so the arithmetic passed and the error survived two audits — leaving the canonical commands reference outside staleness tracking. Corrected pointer set: `architecture/{overview,dependency-graph,boundary-map}`, **`commands.md`**, **`state-transitions.md`**, `wizard/{flow,store-map,component-patterns}`, `config/configuration.md`.

**Invariant 5 (header date freshness):** PASS. Date basis = 2026-04-21 = today.

**Root-cause enum audit (separate task, flag only):** Grepped `root_cause:` across `.ai-docs/agent-findings/*.md`. Found 1 violation outside widened enum: `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` uses `root_cause: scope-boundary-preserved` (not in `missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred`). Not fixed — flagged for convention-keeper disposition (widen enum vs. reclassify finding). `TEMPLATE.md`'s verbatim enum-list root_cause is expected (it's the template).

**No finding filed** — this iter is the codified audit procedure running for the first time; drift it caught (Reference-table dates) is the same class the procedure exists to detect.

### 2026-04-21 Ralph iter 49 -- documentation-bible.md rule incorporation

Cross-referenced 15 proposed rules from iter 11/12/13/16/25/26/32/33/37/39/40/41/42/43/45 findings against `standards/documentation-bible.md`. Rules 10-11 (findings-impact-report append-only + >10 regeneration trigger) already present from iter 40. Thirteen rules incorporated this iter, grouped to minimize surface area:

1. **Re-Validation Triggers (Beyond Calendar Cadence)** — covers iter 11, 12, 13 (finding/task-ID/concept-class triggers override cadence).
2. **Doc-Touching Changes table** — covers iter 32, 33 (dependency-graph + boundary-map revalidation on command/component/D-feature touches, with `NEEDS-VALIDATION` fallback).
3. **Command Reference Docs** — covers iter 25 (verify `static flags` / `baseFlags`, glob-diff, `Feature flag:` line).
4. **Known Limitations Rule** — covers iter 26 (TODO.md cross-ref for hardening-gap systems).
5. **Hydration-vs-Props / Hook Table / Hotkey Registry** — covers iter 16 (props-vs-hydrate, hook existence check, hotkey registry sentinel).
6. **Store Map Completeness** — covers store-map hydration finding (non-exported helpers, decision-probe consumers, hydration entry point).
7. **Guard / Silent-Guard Rules** — covers iter 12 (user-visible outcomes, silent-guard race-risk table).
8. **Exhaustive Enumeration over Glob Shorthand** — covers iter 37 (no `etc.` shorthand, exhaustive name lists).
9. **Splits & Pointers** — covers iter 41, 42 (original MUST become pointer same session, drift-candidate heuristic).
10. **Map Self-Consistency Audit** — covers iter 43 (5 invariants, decennial cadence).
11. **Agent Findings Frontmatter** section — covers iter 45 (require frontmatter, widen enum, `superseded_by` / `supersedes` keys, audits/ subdir).

No drift found during bible read-through. `Standards Documentation` table row for `standards/documentation-bible.md` bumped to `Last Validated 2026-04-21`.

### 2026-04-21 Ralph iter 43 -- DOCUMENTATION_MAP self-consistency audit

Audited the map itself for drift after ~42 iterations of row-level validation and date bumps. Fixes applied:

1. **Header count:** `Total Areas: 30 (18 original + 12 new)` → `32 (18 original + 14 new)`. New Files section grew to 14 when `config-merger.md` (iter4) and `scope-split.md` (iter5) were added 2026-04-21; header was never bumped.
2. **Duplicate row removed:** `| type-system.md (pointer) | 0 | - | OK |` deleted — the row above it (`type-system.md`) already carries the CONVERTED TO POINTER annotation. Single row suffices.
3. **Stale 11-day rows synced:** `compilation-pipeline.md`, `operations-layer.md`, `agent-system.md` showed `Days Stale: 11` while the Reference table showed `Last Validated: 2026-04-21`. All three bumped to `0` with annotation.
4. **Reference table stale dates synced:** `Dependency Graph` row said `2026-04-02` / `2026-04-02`; staleness dashboard showed `0` from iter32 today. Bumped to `2026-04-21` / `2026-04-21`.
5. **Date basis note:** updated 2026-04-13 → 2026-04-21, clarified pointer-row semantics.
6. **Notes for Next Session:** replaced 2026-04-02 context with iter43 summary + forward validation dates.

**Disk vs map audit:** 41 `.md` files under `reference/` on disk. Reference tables track 32 (18 original + 14 new). 9 pointer files (architecture/overview, architecture/dependency-graph, architecture/boundary-map, commands/index, wizard/{flow,state-transitions,store-map,component-patterns}, config/configuration) are intentionally not tracked in staleness dashboard — they redirect to originals. Directory-structure diagram documents all 41.

> **Correction (2026-07-30):** same mis-enumeration as iter 50 above — this is where it originated. `commands/index.md` and `wizard/state-transitions.md` are canonical; the pointers are root `commands.md` and root `state-transitions.md`. Because the count (9) was correct, every subsequent audit that checked only the arithmetic reproduced the error. See the 2026-07-30 entry at the top of this section.

**Validation History chronology:** Entries are in reverse-chronological order (newest first) by date, but iter numbers interleave (iter 30 before iter 29 before iter 10 before iter 43 at top). Iter numbers are a logical ordering, not the primary sort key — acceptable.

**Finding filed:** `.ai-docs/agent-findings/2026-04-21-documentation-map-drift-iter43.md` — documenting map-self-drift as a new drift class distinct from content-vs-code drift.

### 2026-04-21 Ralph iter 30 -- Link-Integrity Audit: remaining reference/ dirs + root files

Audited link integrity across 30 files: subdirs `architecture/` (3), `commands/` (2), `wizard/` (4), `testing/` (4), `features/` (7); root-level `reference/` files (11): `architecture-overview.md`, `boundary-map.md`, `commands.md`, `component-patterns.md`, `dependency-graph.md`, `findings-impact-report.md`, `state-transitions.md`, `store-map.md`, `test-infrastructure.md`, `type-system.md`, `utilities.md`. Verified `related:` YAML frontmatter, explicit `[text](path)` markdown links, and backtick-wrapped `reference/...` path references.

**Link count:** ~95 link units total (58 frontmatter `related:` entries + 26 relative markdown body links `./` and `../` + 11 backtick-wrapped `reference/...` refs, plus 1 `../../agent-findings/` finding ref).

**Broken links:** 0.

**Pre-restructure path check:** Root-level files (e.g., `reference/architecture-overview.md`, `reference/commands.md`, `reference/component-patterns.md`, `reference/state-transitions.md`, `reference/test-infrastructure.md`, `reference/type-system.md`) are still referenced as "authoritative source until cleanup" by the subdir stubs. All originals exist on disk; stubs correctly point to them. No Phase 2+3 migration drift detected.

**Agent-findings reference:** `.ai-docs/agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md` (referenced from `testing/e2e-infrastructure.md:425`) resolves.

**No finding filed** -- link integrity clean across all remaining reference/ dirs and root-level files.

### 2026-04-21 Ralph iter 29 -- Link-Integrity Audit: concepts/ + types/ + config/

Audited link integrity across 10 files in `.ai-docs/reference/concepts/` (3), `.ai-docs/reference/types/` (3), `.ai-docs/reference/config/` (4). Verified `related:` YAML frontmatter lists AND markdown-body links (explicit `[text](path)` links + backtick-wrapped path references).

**Scope:**

- `concepts/guard-pattern.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`
- `types/core-types.md`, `types/operations-types.md`, `types/zod-schemas.md`
- `config/config-merger.md`, `config/config-writer.md`, `config/configuration.md`, `config/scope-split.md`

**Link count:** 76 link units total (37 frontmatter `related:` + 24 markdown body links + 15 backtick-wrapped path refs, including finding references and `todo/`, `changelogs/` references).

**Broken links:** 0.

**Pre-restructure path check:** The three `types/*.md` files reference `reference/type-system.md` in their "Split from:" headers; `type-system.md` still exists on disk (Phase 2+3 preserves originals alongside new structure), so these resolve correctly.

**Agent-findings references:** All 16 distinct findings referenced across the 10 files resolve in `.ai-docs/agent-findings/`.

**No finding filed** -- link integrity was already clean; this iter confirms no drift.

### 2026-04-21 Ralph iter 10 -- BaseStep Primitives Contract

Added new section "BaseStep Primitives Contract" to `reference/testing/e2e-infrastructure.md`, placed immediately before the existing "Page-Object Keypress Rule" so primitives are defined before the rule cites them.

**Content:**

- Enumerated all BaseStep members by type: 8 key-press primitives (`pressEnter`, `pressSpace`, `pressKey`, `pressEscape`, `pressArrowDown/Up/Right`, `pressCtrlC`), 6 wait primitives (`waitForStep`, `waitForStepAfter`, `waitForWizardFooter`, `waitForWizardFooterAfter`, `waitForItemVisible`, `navigateCursorToItem`), 4 cursor/screen queries (`getOutput`, `getScreen`, `getRawCursor`, `getSummaryDiffEntries`), 4 composition helpers (`pressEnterAndWaitFor`, `abort`, `navigateDown/Up/Right`).
- Documented each primitive's contract as tables: PTY write, post-press delay (`INTERNAL_DELAYS.KEYSTROKE` 150ms or `STEP_TRANSITION` 500ms), whether it pre-waits for stable render (all NO except `getSummaryDiffEntries`).
- Captured invariants: callers must ensure prior frame stability; `pressEnterAndWaitFor` sentinel must be unique to next step's first frame; `waitForItemVisible` is visibility-only while `navigateCursorToItem` is cursor-position.
- Added a "Design Question" subsection presenting three options (A internalize wait in primitives, B status quo, C hybrid `pressAfterStable` helper) with trade-offs and a back-of-envelope cost estimate (~30-60s added suite time under contention if Option A is adopted, with `search-modal.type` as outlier needing exemption). Recommendation is Option C, flagged as doc-only observation.
- Noted the one primitive that already waits: `getSummaryDiffEntries` calls `waitForWizardFooter` internally before scraping.

**No finding filed** — iter 9's finding (`2026-04-21-e2e-build-step-keypress-missing-stable-render.md`) already documents the underlying drift; this iter is groundwork, not a new discovery.

**Files touched:** `reference/testing/e2e-infrastructure.md` (+~90 lines, new section only; no existing content changed).

### 2026-04-13 Pass 24 -- Final Sweep: Cross-Reference Verification + DOCUMENTATION_MAP Consistency

Complete cross-reference and consistency audit across all 39 reference documentation files.

**Part 1: Cross-reference verification (0 broken references):**

- Verified all `related:` YAML frontmatter paths across 50 files (all 39 reference files have frontmatter). Every path resolves to an existing file under `.ai-docs/`.
- Verified all markdown `[text](path)` links in reference doc bodies. All resolve to existing files.
- Verified all `> **See also:**` and `> **Detailed documentation:**` inline links (16 occurrences). All resolve correctly.
- Verified all 9 pointer file redirect targets (architecture/overview.md, architecture/dependency-graph.md, architecture/boundary-map.md, commands/index.md, wizard/flow.md, wizard/state-transitions.md, wizard/store-map.md, wizard/component-patterns.md, config/configuration.md). All point to existing files.

**Part 2: DOCUMENTATION_MAP consistency (1 issue found, fixed):**

- All 30 staleness dashboard entries (18 original + 12 new) verified to exist on disk.
- 9 pointer files exist on disk and are documented in the directory structure diagram (not tracked in staleness dashboard, which is correct since they just redirect).
- Directory structure diagram was missing `features/configuration.md` and `features/wizard-flow.md` from the `features/` listing. **Fixed:** added both with "(pointed to by ...)" annotations.
- File counts verified: 39 total reference files = 11 root + 7 features + 21 in subdirectories (3 architecture + 3 concepts + 2 commands + 4 wizard + 3 types + 2 config + 4 testing).

**Part 3: documentation-bible.md structure diagram update:**

- The directory structure diagram in `standards/documentation-bible.md` only showed the original flat structure. **Fixed:** updated to include all Phase 2+3 subdirectories (architecture/, concepts/, commands/, wizard/, types/, config/, testing/) with their files and annotations.

**Fixes applied (3 edits in 2 files):**

1. `DOCUMENTATION_MAP.md`: Added `features/configuration.md` and `features/wizard-flow.md` to directory structure diagram
2. `DOCUMENTATION_MAP.md`: Updated "Last Validated" header to pass 24, added pass 24 validation history entry
3. `standards/documentation-bible.md`: Updated directory structure diagram to reflect Phase 2+3 restructure

### 2026-04-13 Pass 21 -- Deep Validation of Wizard + Architecture + Component Patterns

Verified 8 documentation files against source code with 200+ individual claim checks:

**Files validated:**

- `state-transitions.md` (434 lines) -- every line reference, action table, reset matrix, initial state table, hotkey mapping
- `store-map.md` (255 lines) -- WizardState shape, all action signatures, computed getters, usage patterns
- `features/wizard-flow.md` (326 lines) -- WizardProps, WizardResultV2, hooks table, feature flags, domain descriptions, stack grouping
- `architecture-overview.md` (sections 11-13) -- scope system paths, tombstone types, stack grouping line references
- `component-patterns.md` (388 lines) -- CategoryOption type, SkillTag, StepAgents dual-scope, StackSelection grouping, hotkey registry
- `wizard/flow.md`, `wizard/state-transitions.md`, `wizard/store-map.md`, `wizard/component-patterns.md` -- pointer file targets verified

**Inaccuracies found and fixed (2):**

1. `state-transitions.md:196` -- `preselectAgentsFromDomains()` described as "Replaces (not merges)" but actual implementation merges with existing agentConfigs and preserves excluded entries. Fixed to accurate description.
2. `features/wizard-flow.md:239-248` -- Domain descriptions table missing `desktop` domain. Added `desktop: "Desktop applications"` matching `domain-selection.tsx:16`.

**Verified correct (sample of critical claims):**

- WizardStep union at wizard-store.ts:262-268
- WIZARD_STEPS at wizard-tabs.tsx:41-48
- createInitialState() at wizard-store.ts:633 (all 27 initial values match)
- selectStack() reset at wizard-store.ts:676
- goBack() at wizard-store.ts:1056-1064
- getStepProgress() at wizard-store.ts:1222 (all 7 step cases verified)
- DOMAIN_AGENTS at wizard-store.ts:185-196
- WizardProps at wizard.tsx:47-61, WizardResultV2 at wizard.tsx:32-45
- Forward navigation: stack-selection.tsx:178-207, :210-243; domain-selection.tsx:54; use-build-step-props.ts:36-37; wizard.tsx:143-144, :246-251; step-agents.tsx:211
- CategoryOption/CategoryRow at category-grid.tsx:12-36
- SkillTag at category-grid.tsx:80-179, lock icon at :169, scope badges at :146-155
- StepAgents at step-agents.tsx:165-329, secondaryScope at :264-268
- StackSection at stack-selection.tsx:69-103, GROUP_ORDER at :17, groupStacks at :21-62
- CLI_COLORS at consts.ts:181-198, UI_SYMBOLS at :99-115
- Feature flags: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true
- toggleTechnology guard at wizard-store.ts:836-841, exclusive guard at :857-866
- toggleAgent guard at wizard-store.ts:1068-1074
- toggleSkillScope at wizard-store.ts:952-1001
- resolveInstallPaths at local-installer.ts:104-116, writeScopedConfigs at :577
- Stack.group at matrix.ts:137, ResolvedStack.group at matrix.ts:251
- SkillConfig.excluded at config.ts:27, AgentScopeConfig.excluded at :34
- 24 source files / 15 test files in wizard/, 16 hooks / 3 test files in hooks/

### 2026-04-13 Pass 20 -- Phases 2+3 Directory Restructure and File Splits

Created new directory structure under `reference/` with 7 subdirectories and 19 new files:

**Phase 2 -- Directory Reorganization (7 new directories, 7 pointer files):**

- `architecture/overview.md`, `architecture/dependency-graph.md`, `architecture/boundary-map.md` -- pointer files to originals
- `commands/index.md` -- pointer to `commands.md`
- `wizard/flow.md`, `wizard/state-transitions.md`, `wizard/store-map.md`, `wizard/component-patterns.md` -- pointers to originals
- `config/configuration.md` -- pointer to `features/configuration.md`

**Phase 3 -- File Splits (12 new content files):**

1. `test-infrastructure.md` (774 lines) split into 4 files:
   - `testing/infrastructure.md` -- Vitest config, test projects, directory structure, error handling patterns
   - `testing/factories.md` -- All factory/helper/assertion tables (34 factories, 15 helpers, 12 assertions)
   - `testing/mock-data.md` -- SKILLS registry, TEST_CATEGORIES, mock-data module constants
   - `testing/e2e-infrastructure.md` -- E2E config, directory structure, POM, matchers, fixtures, timeout infrastructure

2. `type-system.md` (449 lines) split into 3 files:
   - `types/core-types.md` -- Type module structure, generated unions, core data structures, named aliases, type narrowing, type guards, typed helpers
   - `types/operations-types.md` -- Operations layer types, edit command types (ConfigChanges, detectConfigChanges, etc.)
   - `types/zod-schemas.md` -- All 39 schemas (bridge, loader, structural, strict)

3. New cross-cutting concept docs (3 files):
   - `concepts/scope-system.md` -- Consolidated from 5 source files
   - `concepts/tombstone-pattern.md` -- Consolidated from 4 source files
   - `concepts/guard-pattern.md` -- Consolidated from 2 source files

4. New detail docs (2 files):
   - `commands/edit.md` -- Detailed edit command (flow, types, exported utilities)
   - `config/config-writer.md` -- Config writer and config types writer detail

**Cross-references added to 4 original files:**

- `architecture-overview.md`: Notes on sections 11 (scope) and 12 (tombstone) pointing to concepts/
- `state-transitions.md`: Note on Global-Installed Guard Behavior pointing to concepts/
- `features/wizard-flow.md`: Note on Global-Item Guards pointing to concepts/
- `features/configuration.md`: Note on Scope-Aware Config Splitting pointing to concepts/

**Original files preserved:** All 18 original files remain untouched (except added cross-reference notes). User will handle cleanup.

### 2026-04-13 Pass 19 -- Phase 1 Frontmatter Addition

Added YAML frontmatter to all 18 reference docs (11 root + 7 features/). Each frontmatter block contains:

- `scope: reference` (all files)
- `area:` one of architecture, commands, wizard, types, config, testing, features
- `keywords:` searchable terms for AI agent discovery
- `related:` cross-references to related docs (relative paths from `.ai-docs/` root)
- `last_validated:` date matching the file's "Last Updated" header

**Area distribution:** architecture (5), wizard (4), features (4), commands (1), types (1), config (1), testing (1), features (1)

**Files updated (18):**

- `reference/architecture-overview.md`, `reference/boundary-map.md`, `reference/commands.md`
- `reference/component-patterns.md`, `reference/dependency-graph.md`, `reference/findings-impact-report.md`
- `reference/state-transitions.md`, `reference/store-map.md`, `reference/test-infrastructure.md`
- `reference/type-system.md`, `reference/utilities.md`
- `reference/features/agent-system.md`, `reference/features/compilation-pipeline.md`
- `reference/features/configuration.md`, `reference/features/operations-layer.md`
- `reference/features/plugin-system.md`, `reference/features/skills-and-matrix.md`
- `reference/features/wizard-flow.md`

**No content changes** -- only frontmatter blocks prepended before `# Title` headings.

### 2026-04-13 Pass 15 -- Update Pass 3 (0.122.0/0.123.0 changes)

Updated 2 reference docs to reflect changes shipped in releases 0.122.0 and 0.123.0:

1. **configuration.md**: Documented `generateProjectConfigWithInlinedGlobal()` no-dedup snapshot behavior (global + project entries preserved with `// global` / `// project` comments, excluded-entry tombstone mechanism). Added `buildSkillConfigForId()` project-over-global preference from `wizard-store.ts:153`.
2. **commands.md**: Updated `edit` command: `logChangeSummary()` now takes `newSkills`/`oldSkills` params, uses display names and scope labels `[G]`/`[P]`, G-to-P renders as green `+`. Documented exported-for-testing utilities: `ConfigChanges` type, `detectConfigChanges()`, `migratePluginSkillScopes()`, `PluginScopeMigrationResult` type.

### 2026-04-02 Pass 14 -- Behavioral Claims Verification (10 claims vs source code)

Verified 10 behavioral claims by reading actual implementation code. Focus: does the documentation accurately describe what the code DOES?

1. **architecture-overview.md source resolution precedence**: PASS -- doc says `--source flag > CC_SOURCE env var > project config > global config > default`. Code at `config.ts:83-131` confirms exact order: flag (line 91) > env (line 102) > effectiveConfig.source (project via `??` global, line 121) > DEFAULT_SOURCE (line 131).
2. **configuration.md isLocalSource()**: PASS -- doc says "Returns true for paths starting with `/` or `.`, false for remote protocols. Rejects `..` and `~` in non-remote sources." Code at `config.ts:431-447` confirms exact behavior.
3. **plugin-system.md deriveInstallMode()**: PASS -- doc says "Empty skills array = eject mode." Code at `installation.ts:27` confirms `if (skills.length === 0) return "eject"`.
4. **compilation-pipeline.md sanitizeCompiledAgentData()**: PASS -- doc lists all fields. Code at `compiler.ts:77-111` matches exactly.
5. **wizard-flow.md INFO_PANEL feature flag**: PASS -- doc says flag gates info panel visibility and footer label. Code confirms it gates three things: panel visibility (`wizard-layout.tsx:167`), footer label (`wizard-layout.tsx:218`), and hotkey handling (`wizard.tsx:116`).
6. **state-transitions.md goBack() from domains**: PASS -- doc correctly states side effects: `setApproach(null)`, `selectStack(null)` before `goBack()`. Code at `domain-selection.tsx:41-44` confirms.
7. **compilation-pipeline.md compileAgents() "thin facade"**: FAIL -- doc called it "thin facade" / "thin wrapper" but code at `compile-agents.ts:32-72` has 20+ lines of scope-filtering logic. **Fixed**: replaced with "scope-filtering orchestrator" / "scope-filtering + delegation."
8. **skills-and-matrix.md getAvailableSkills()**: PASS -- doc says "Get skills for a category with state annotations." Code confirms it annotates but does NOT filter.
9. **store-map.md reset()**: PASS -- doc says "Restore all state to createInitialState() defaults." Code at `wizard-store.ts:958` confirms.
10. **boundary-map.md private IP blocking**: FAIL -- doc omitted `172.16-31.x.x` and `0.0.0.0` from IP ranges. **Fixed**: added both.

**Fixes applied (3 edits in 2 files):**

- `boundary-map.md`: Added `172.16-31.x.x` and `0.0.0.0` to private IP blocking list
- `compilation-pipeline.md`: Replaced "thin facade" (line 16) and "Thin wrapper" (line 269) with accurate descriptions

### 2026-04-02 Pass 13 -- Code Example Verification (4 standards files)

Verified every code example in `clean-code-standards.md`, `typescript-types-bible.md`, `e2e-testing-bible.md`, and `commit-protocol.md` against actual source files.

**clean-code-standards.md (S3, S5, S6, S7, S8):**

- S3 `getErrorMessage()`: PASS -- signature `(error: unknown): string` matches `utils/errors.ts:2`
- S3.2 `handleError()`: PASS -- exists in `base-command.ts:26`, calls `getErrorMessage()` + `this.error(message, { exit: EXIT_CODES.ERROR })`
- S5.4 `sanitizeLiquidSyntax()`: PASS -- `compiler.ts:41`, signature `<T extends string>(value: T, fieldName: string): T`
- S6.4 SKILLS registry keys: PASS -- all 10 keys verified in `test-fixtures.ts` (react, vue, zustand, pinia, scss, tailwind, vitest, hono, drizzle, antiOverEng)
- S6.9 `createMockSkill()` signature: PASS -- `(id: SkillId, overrides?: Partial<ResolvedSkill>): ResolvedSkill` matches `helpers.ts:439`
- S7.1 `typedEntries` usage: PASS -- call syntax correct (actual function accepts wider `Partial<Record>` type)
- S7.3 Zod canonical pattern: PASS -- `schema.safeParse()` used in `schema-validator.ts:200`
- S7.4 `formatZodErrors` two variants: PASS -- `schemas.ts:776` takes `ZodIssue[]`, `schema-validator.ts:156` takes `ZodError`
- S8.4 Remeda production list: PASS -- all 13 functions (`unique`, `uniqueBy`, `sortBy`, `groupBy`, `mapValues`, `pipe`, `flatMap`, `filter`, `countBy`, `sumBy`, `difference`, `indexBy`, `zip`) confirmed in production files

**typescript-types-bible.md:**

- Section 6 `typedEntries`/`typedKeys` code example: FAIL -- showed `Record<K, V>` parameter but actual signature is `Partial<Record<K, V>>`. **Fixed.**
- All other TypeScript examples: PASS -- correct syntax, correct patterns
- Type guard examples (`isCategory`, `isDomain`, `isAgentName`): PASS -- match `type-guards.ts`
- Boundary cast taxonomy: PASS -- references to clean-code-standards.md Section 7.2 valid

**e2e-testing-bible.md:**

- Section 3.1 `runCLI` example: PASS -- destructured fields `{ exitCode, stdout, stderr, combined }` match actual return type
- Section 3.5 `InitWizard.launch({ source })`: PASS -- matches actual static method signature
- Section 4.6 page object methods table: PASS -- `completeWithDefaults`, `passThrough`, `passThroughAllDomains`, `waitForRawText` all verified
- Section 5.5 `ProjectBuilder` factories: PASS -- all 8 static methods + `createLocalSkill` + `writeProjectConfig` verified
- Section 5.6 `createE2ESource`/`createE2EPluginSource`: PASS -- both exist and are re-exported
- Section 7.1 TIMEOUTS values: PASS -- all 10 constants match `e2e/pages/constants.ts`
- Section 9.1 dual-scope helpers: PASS -- `initGlobal`, `initProject`, `createTestEnvironment`, `createDualScopeEnv` all exist
- Section 11 exports table: PASS -- all listed exports verified in `test-utils.ts`

**commit-protocol.md:**

- Conventional commits format: PASS -- matches actual git log (e.g., `chore(release): 0.100.0 -- ...`, `feat(wizard): ...`)
- Release commit format `chore(release): {version} -- brief summary`: PASS -- matches actual releases

**Fixes applied (1 edit):**

- `typescript-types-bible.md` Section 6: Updated `typedEntries` and `typedKeys` parameter types from `Record<K, V>` to `Partial<Record<K, V>>` to match actual `utils/typed-object.ts` signatures

### 2026-04-02 Round 10 Deep Verification (pass 9 fix verification + 10-item random deep check)

**Task 1: Verified pass 9 fixes (5 checks):**

1. **typescript-types-bible.md PermissionMode**: PASS -- 6 members including "delegate" match `src/cli/types/matrix.ts:14-20`
2. **e2e-testing-bible.md skill count**: PASS -- no "10-skill" or "10 skills" occurrences remain
3. **findings-impact-report.md deepMergeStacks**: FAIL -- lines 305/315 still said `deepMergeStacks()`. Fixed to `mergeConfigs()` (confirmed function exists in `config-merger.ts`). Agent file names (identity.md, playbook.md, output.md, metadata.yaml) verified against `src/agents/developer/cli-developer/`
4. **Agent findings (3 files)**: PASS -- all 3 findings properly documented with correct details

**Task 2: 10-item random deep verification:**

1. **architecture-overview.md Install Modes table**: FAIL -- missing `mixed` mode. Source `installation.ts:15` defines `InstallMode = "eject" | "plugin" | "mixed"`. Added `mixed` row to table. Line numbers for `detectInstallation()` (84) and `detectProjectInstallation()` (35) confirmed.
2. **commands.md doctor command**: PASS -- flags (`--source`/-s string, `--verbose`/-v boolean) match source. "Defined directly, not via BaseCommand.baseFlags" confirmed. All 5 checks exist (Config Valid, Skills Resolved, Agents Compiled, No Orphans, Source Reachable).
3. **commands.md eject command**: PASS -- args (type, not required, 4 options) and flags (--force/-f, --output/-o, --refresh, --source/-s) all match source. Key deps confirmed.
4. **type-system.md Zod Schemas**: PASS at the time -- schema count confirmed, 5 random schemas spot-checked (`domainSchema`, `boundSkillSchema`, `metadataValidationSchema`, `hooksRecordSchema`, `skillFrontmatterLoaderSchema`). <!-- Count deliberately not restated here; reference/types/zod-schemas.md owns it. Per-schema line numbers removed — line numbers in docs are banned by project convention. -->
5. **plugin-system.md Plugin Settings**: PASS -- all 3 functions (`getEnabledPluginKeys`, `resolvePluginInstallPaths`, `getVerifiedPluginInstallPaths`) and 2 types (`PluginKey`, `ResolvedPlugin`) confirmed in `plugin-settings.ts`.
6. **configuration.md Source Manager**: PASS -- all 3 functions (`addSource`, `removeSource`, `getSourceSummary`) confirmed in `source-manager.ts`.
7. **operations-layer.md functions**: PASS -- 3 random functions verified: `copyLocalSkills(skills, projectDir, sourceResult)`, `compileAgents(options)`, `findSkillMatch(skillName, results)` all match source signatures.
8. **dependency-graph.md wizard-store imports**: PASS -- all 4 lib imports confirmed: `deriveInstallMode` from installation, `resolveAlias` from matrix, `matrix/getSkillById/getCategoryDomain` from matrix-provider, `isCompatibleWithSelectedFrameworks` from wizard.
9. **clean-code-standards.md S12 Exit Codes**: PASS -- all 5 exit codes match: SUCCESS(0), ERROR(1), INVALID_ARGS(2), NETWORK_ERROR(3), CANCELLED(4).
10. **skill-atomicity-bible.md directory structure**: PASS -- verified against `web-framework-react` in skills repo. Directory has SKILL.md (with name/description frontmatter), metadata.yaml (category/slug/domain/author/displayName/cliDescription/usageGuidance), reference.md, examples/ (with core.md + topic files).

**Fixes applied (3 edits):**

- `findings-impact-report.md`: Replaced 2 stale `deepMergeStacks()` references with `mergeConfigs()` at lines 305 and 315
- `architecture-overview.md`: Added `mixed` install mode row to Install Modes table

### 2026-04-02 Round 9 Deep Verification (e2e-testing-bible.md, commit-protocol.md, e2e/ sub-standards)

Complete line-by-line verification of the most-edited standards docs. Verified every code example, constant reference, page object method, helper function, and anti-pattern against actual source files.

**e2e-testing-bible.md (4 fixes):**

1. Section 4.6: `BuildStep.passThroughAllDomains()` description said "Web -> API -> Shared" but actual code does "Web -> API -> Methodology". Fixed.
2. Section 8.1: Claimed "10 skills" but source has 9. Claimed "6 methodology skills (`meta-methodology-*`)" but actual breakdown is 5 web, 1 api, 3 meta. Updated skill count and domain table to match `create-e2e-source.ts`.
3. Section 3.4: Claimed both `CLI.run()` and `runCLI()` set `AGENTSINC_SOURCE: undefined` by default. Only `CLI.run()` does. Fixed.
4. Section 10.5: Referenced production constants (`CLAUDE_DIR`, `STANDARD_FILES.CONFIG_TS`) instead of E2E constants (`DIRS.CLAUDE`, `FILES.CONFIG_TS`). Fixed to match section 10.1's rule about using `e2e/pages/constants.ts`.

**commit-protocol.md (0 fixes):** All claims verified: conventional commits format, changelog files exist, `changelogs/` directory structure matches, pre-commit hook exists in `.husky/`.

**e2e/ sub-standards (0 fixes across 7 files):**

- README.md: Directory structure, file counts, config values all match filesystem and `vitest.config.ts`.
- assertions.md: All 12 matchers match `project-matchers.ts` and `setup.ts` type augmentation.
- patterns.md: All code examples use current page object APIs (`selectSkill`, `advanceToSources`, `setAllLocal`, `toggleAgent`).
- test-data.md: Fixture references correct (9 skills, correct `runCLI` vs `CLI.run()` difference documented).
- test-structure.md: Directory layout, naming conventions, cleanup patterns all accurate.
- page-objects.md: All page object methods verified against source (StackStep, DomainStep, BuildStep, SourcesStep, AgentsStep, ConfirmStep, SearchModal, BaseStep, TerminalScreen, WizardResult, DashboardSession, InteractivePrompt).
- anti-patterns.md: All anti-patterns still relevant, no banned references found.

### 2026-04-02 Round 8 Standards Audit (5 previously-unaudited standards docs)

Audited all 5 standards documents that had never been audited (Last Audited = `--`). Verified every technical claim, file path, function name, cross-reference, and code example against actual source.

**prompt-bible.md (2 fixes):**

1. Line 9: Removed dead cross-reference to `claude-architecture-bible.md` (file does not exist anywhere in the repository). Simplified the note to remove the link.
2. Line 1768: Removed reference to `claude-architecture-bible.md` in version history entry.

**skill-atomicity-bible.md (6 fixes across 3 sections):**

1. Line 47: Directory structure comment claimed metadata.yaml has `category, tags, version`. Fixed to `category, author, slug, displayName, etc.` -- per MEMORY.md "metadata.yaml must NOT have version or tags fields" and actual `metadataValidationSchema` in schemas.ts.
2. Lines 617-621: Quality Gate Checklist claimed required fields `category, author, version, cli_name, cli_description, usage_guidance` with snake_case names. Fixed to actual camelCase field names from schema: `category, author, slug, displayName, cliDescription, usageGuidance`. Removed `version` (does not exist). Removed `tags` checklist item (field does not exist). Removed `Version is an integer` checklist item.
3. Line 620: Changed `claude-architecture-bible.md` category enum reference to `src/cli/types/generated/source-types.ts CATEGORIES` (actual location).
4. Lines 622, 678: Changed `bun cc:validate` to `agents-inc validate` (no `cc:validate` script exists in package.json; actual CLI binary is `agents-inc`).

**documentation-bible.md (0 fixes):** All file paths verified correct. Staleness thresholds match DOCUMENTATION_MAP.md implementation. Cross-references to other standards docs valid. Code examples syntactically correct.

**loop-prompts-bible.md (0 fixes):** All 10 agent names verified present in AGENT_NAMES (23 agents). No codebase-specific file paths or function names to verify. Process documentation is accurate.

**skill-atomicity-primer.md (0 fixes):** No codebase-specific technical claims. References to skill-atomicity-bible.md and prompt-bible.md are valid.

**Result: 8 factual errors fixed across 2 files. 3 files had zero errors. All 5 standards docs now audited.**

### 2026-04-02 Round 7 Standards Fixes + DOCUMENTATION_MAP Audit + Final Grep Sweep

**Task 1: Fixed 3 stale `installLocal()` references in standards docs:**

- `standards/e2e-testing-bible.md:404` -- `installLocal()` -> `installEject()` (anti-pattern example)
- `standards/e2e-testing-bible.md:473` -- `installLocal()` -> `installEject()` (E2E definition)
- `standards/e2e/test-structure.md:206` -- `installLocal()` -> `installEject()` (E2E definition)

**Task 2: DOCUMENTATION_MAP.md self-audit (1 fix):**

- Staleness Dashboard was missing `findings-impact-report.md` entry (17 rows for 18 docs). Added with 5 days stale, 30-day threshold, OK status.
- Header metadata verified correct: Total Areas 18, Documented 18.
- Reference Documentation table verified: all 18 entries present, 17 show 2026-04-02, findings-impact-report.md shows 2026-03-28.
- Standards Documentation table verified: 10 entries, dates correct.
- Coverage Metrics verified: 317 TypeScript files, all areas [DONE].
- Validation history entries in chronological order (newest first), no duplicates.

**Task 3: Final grep sweep of all `.ai-docs/` (0 active issues found):**

- `installLocal` -- 0 hits in reference/, 0 hits in standards/ (all fixed). Remaining hits are validation history only.
- `setAllSourcesLocal` -- 0 hits in reference/ or standards/. Remaining hits are validation history only.
- `view-title.tsx` -- 0 hits in reference/ or standards/. Remaining hits are findings + validation history only.
- `stats-panel.tsx` -- 0 hits in reference/ or standards/. Remaining hits are findings + validation history only.
- `safeLoadYamlFile` -- 0 active references. Hits in reference/ are deletion notes ("was removed as dead code"). Remaining hits are findings + validation history.
- `0.94.0` / `0.74.10` -- 0 hits in active docs. All hits are validation history entries documenting past version bumps.
- `"local"` in reference/ -- all 5 hits are legitimate (CategoryPath type, SkillSourceType, categoryPathSchema). 0 install-mode context.
- `"local"` in standards/ -- 0 hits.

**Result: 0 active documentation issues remaining across all `.ai-docs/` files.**

### 2026-04-02 Round 6 Final Cross-Document Consistency Sweep

Full consistency audit across all 18 reference docs + standards docs + DOCUMENTATION_MAP.md. All 5 check axes passed.

**Check 1: Stale terminology grep (0 errors in reference/):**

- `installLocal` -- 0 hits in reference/ (all cleaned in prior rounds)
- `setAllSourcesLocal` -- 0 hits in reference/ (renamed to `setAllSourcesEject` in round 4)
- `LocalInstall` -- 0 hits in reference/
- `view-title.tsx` -- 0 hits in reference/
- `stats-panel.tsx` -- 0 hits in reference/
- `yaml.ts` as existing util -- 0 hits in reference/ (all correctly marked DELETED)
- `config/show.ts`, `config/path.ts` -- 0 hits in reference/
- `diff.ts`, `outdated.ts` -- 0 hits in reference/
- `safeLoadYamlFile` -- 0 active reference hits (only historical notes about deletion)
- **Standards note (out of scope):** `installLocal()` appears 3 times in `standards/e2e-testing-bible.md` and `standards/e2e/test-structure.md` as an anti-pattern example. Convention-keeper should update to `installEject()`.

**Check 2: Count consistency (0 errors):**

| Value | Expected | Verified Against | Docs Referencing |
| ---------------- | -------- | ------------------------------------------- | ---------------------------------------- | -------------------- |
| Skills | 161 | source-types.ts SKILL_MAP (lines 7-167) | type-system.md, skills-and-matrix.md |
| Categories | 51 | source-types.ts CATEGORIES (lines 506-556) | type-system.md, skills-and-matrix.md |
| Domains | 9 | source-types.ts DOMAINS (lines 563-573) | type-system.md, skills-and-matrix.md |
| AgentNames | 23 | source-types.ts AGENT_NAMES (lines 579-603) | type-system.md, agent-system.md |
| TypeScript files | 317 | `find src/cli -name '_.ts' -o -name '_.tsx' | wc -l` | DOCUMENTATION_MAP.md |
| Zod schemas | 39 | `grep -c` on schemas.ts | architecture-overview.md, type-system.md |
| Version | 0.100.0 | package.json | architecture-overview.md |

**Check 3: Store line numbers (0 errors):**

All wizard-store.ts references consistent across store-map.md, state-transitions.md, wizard-flow.md:

| Reference          | Actual   | store-map.md | state-transitions.md | wizard-flow.md   |
| ------------------ | -------- | ------------ | -------------------- | ---------------- |
| useWizardStore     | :560     | :560         | (not referenced)     | (not referenced) |
| createInitialState | :530     | :530-558     | :530                 | (not referenced) |
| WizardState        | :190-497 | :190-497     | (refs store-map.md)  | (not referenced) |
| DOMAIN_AGENTS      | :93-104  | :93-104      | :93-104              | (not referenced) |
| goBack             | :898-906 | (no line)    | :898-906             | (not referenced) |
| getStepProgress    | :1001    | (no line)    | :1001                | (not referenced) |

**Check 4: Compiler line numbers (0 errors):**

All compiler.ts references consistent across compilation-pipeline.md, agent-system.md, architecture-overview.md, boundary-map.md:

| Function                  | Actual   | All docs agree |
| ------------------------- | -------- | -------------- |
| compileAllAgents          | :216     | :216           |
| compileAgent              | :190     | :190           |
| createLiquidEngine        | :394-419 | :394-419       |
| sanitizeCompiledAgentData | :77-111  | :77-111        |

**Check 5: Consts.ts line numbers (0 errors):**

All consts.ts references consistent across utilities.md, component-patterns.md, boundary-map.md, architecture-overview.md:

| Constant                  | Actual   | All docs agree |
| ------------------------- | -------- | -------------- |
| MAX_MARKETPLACE_FILE_SIZE | :150     | :150           |
| MAX_PLUGIN_FILE_SIZE      | :151     | :151           |
| MAX_CONFIG_FILE_SIZE      | :152     | :152           |
| MAX_JSON_NESTING_DEPTH    | :154     | :154           |
| MAX_MARKETPLACE_PLUGINS   | :155     | :155           |
| CLI_COLORS                | :185-196 | :185-196       |
| UI_SYMBOLS                | :99-115  | :99-115        |
| DEFAULT_BRANDING          | :170-173 | :170-173       |
| SCROLL_VIEWPORT           | :157-168 | :157-168       |
| UI_LAYOUT                 | :117     | :117           |
| UI_MESSAGES               | :124     | :124           |
| CLI_BIN_NAME              | :27      | :27            |

**Result: 0 errors in reference documentation. 3 stale `installLocal()` references in standards/ (convention-keeper scope).**

### 2026-04-02 Round 5 Final Exhaustive Verification (boundary-map.md)

Exhaustive line-by-line verification of EVERY claim in boundary-map.md -- the most error-prone document (4 errors round 1, 5 round 2, 3 cross-doc round 4). Checked all exec.ts, consts.ts, schemas.ts, command flags, plugin-\*, config.ts, compiler.ts, and skill-copier.ts references.

**16 errors fixed:**

1. `doctor` command flags line: `:325-335` -> `:372-382`
2. `import skill` flags: added `--subdir`, `--force`, `--refresh`; line range `:65-80` -> `:65-95`
3. `new skill` flags: added `--output`; line range `:47-67` -> `:47-73`
4. `search` flags: added `--json`; line range `:58-73` -> `:58-78`
5. `build plugins` flags: added `--skill`, `--verbose`; line range `:30-45` -> `:30-53`
6. `build stack` flags: added `--verbose`; line range `:52-67` -> `:52-74`
7. `build marketplace` flags: added `--version`, `--description`; line range `:39-54` -> `:39-62`
8. `config-loader.ts loadConfig()` range: `:26-58` -> `:26-65`
9. `MAX_CONFIG_FILE_SIZE` Used By: `safeLoadYamlFile` (dead) -> `permission-checker.tsx`
10. Skill copier function name: `copySkills()` -> `copySkillsToPluginFromSource()` / `copySkillsToLocalFlattened()` at `:131` / `:199`
11. `injectForkedFromMetadata()` line: `:~305+` -> `:299`
12. `readPluginManifest()` in plugin-finder.ts: `:57-69` -> `:49-71`
13. Plugin validation function name: `validatePlugin()` -> `validatePluginManifest()` with line range `:~115-149` -> `:114-183`
14. `validateSkillFrontmatter()` range: `:~184-219` -> `:185-219`
15. `validateAgentFrontmatter()` range: `:~221-254` -> `:221-264`
16. `plugin-validator.ts:335` description: "(test helper)" -> "(`loadManifestForValidation()`)"
17. `source-validator.ts` metadata schema line: `:184` -> `:189`; added `customMetadataValidationSchema` alternative
18. Init hook location range: `:24-34` -> `:24-40` (was missing `-s` short flag extraction at :37-40)

**All verified correct (no additional errors):**

- All exec.ts function line numbers: validatePluginPath(:20-41), validateMarketplaceSource(:43-64), validatePluginName(:66-87), execCommand(:95-130), claudePluginInstall(:137-152), isClaudeCLIAvailable(:154-161), claudePluginMarketplaceList(:170-195), claudePluginMarketplaceAdd(:202-220), claudePluginMarketplaceRemove(:222-240), claudePluginMarketplaceUpdate(:242-257), claudePluginUninstall(:259-278)
- JSON.parse at :180, Array cast at :191 -- both correct
- All consts.ts file size constants: MAX_MARKETPLACE_FILE_SIZE(:150), MAX_PLUGIN_FILE_SIZE(:151), MAX_CONFIG_FILE_SIZE(:152), MAX_JSON_NESTING_DEPTH(:154), MAX_MARKETPLACE_PLUGINS(:155)
- All SAFE patterns: SAFE_PLUGIN_PATH_PATTERN and SAFE_NAME_PATTERN char classes match actual regexes
- All command flag ranges for init(:162-168), edit(:81-90), compile(:31-41), list(:64-66), info(:85-92), eject(:79-94), update(:69-80), uninstall(:96-107), validate(:60-77), new agent(:80-97), new marketplace(:137-148)
- All schemas.ts line numbers (30+ schemas, 3 helpers) -- every single one verified
- pluginSettingsSchema(:34-38), installedPluginsSchema(:50-55) in plugin-settings.ts
- getEnabledPluginKeys(:63-98), resolvePluginInstallPaths(:103-173), getVerifiedPluginInstallPaths(:179-198)
- All config.ts security validation lines: NULL_BYTE(:293), LENGTH(:303), PATH_TRAVERSAL(:336), UNC(:418), CONTROL_CHAR(:406), validateHttpUrl(:357-387), PRIVATE_IP(:377), validateGitShorthand(:389-399), isLocalSource(:431-447)
- compiler.ts: LIQUID_SYNTAX_PATTERN(:31), sanitizeCompiledAgentData(:77-111), createLiquidEngine(:394-419), removeCompiledOutputDirs(:422-426)
- config-writer.ts: generateConfigSource(:35), ensureBlankGlobalConfig(:525), generateBlankGlobalConfigSource(:489), generateBlankGlobalConfigTypesSource(:503), JSON.parse(JSON.stringify) at :40-41,:59
- skill-copier.ts: validateSkillPath(:25-45), null byte(:30), path.resolve(:34-35), startsWith(:37-39)
- readFileSafe at utils/fs.ts:13-21
- All JSON parse boundary line numbers in Section 2.4
- All write boundary line numbers in Section 3
- Trust boundary diagram and data flow descriptions accurate
- No remaining yaml.ts references (correctly noted as removed in Section 2.1)
- No config command references
- No incorrect "local" references (all are legitimate local-skills/local-installer usage)

### 2026-04-02 Round 4 Deep Pass (wizard-flow.md, store-map.md)

Complete line-by-line reverification of 2 docs with substantial round-1 edits (7 and 8 errors respectively). Focus on areas not covered in round 3.

**wizard-flow.md (4 errors fixed):**

- Fixed WizardResultV2 line range: `:32-45` -> `:31-44` (off by 1)
- Fixed WizardProps line range: `:47-63` -> `:46-62` (off by 1)
- Fixed StepSettings feature-flag claim in component tree: was "(S hotkey on sources step; feature-flagged: SOURCE_SEARCH)" but the S hotkey in wizard.tsx:170 is NOT gated by SOURCE_SEARCH. Only the footer label visibility (wizard-layout.tsx:212) is gated. Updated to "always functional, footer label gated by SOURCE_SEARCH"
- Fixed S hotkey on sources step description: same issue, updated from "(feature-flagged: SOURCE_SEARCH)" to "(always functional; footer label gated by SOURCE_SEARCH)"

**All verified correct in wizard-flow.md (0 additional errors):**

- WizardStep type at wizard-store.ts:172-178 (6 steps, all correct)
- Step progression: stack -> domains -> build -> sources -> agents -> confirm (matches WIZARD_STEPS at wizard-tabs.tsx:41-48)
- All component tree entries exist: wizard.tsx, wizard-layout.tsx, wizard-tabs.tsx, info-panel.tsx, step-stack.tsx, stack-selection.tsx, domain-selection.tsx, step-build.tsx, category-grid.tsx, checkbox-grid.tsx, section-progress.tsx, step-sources.tsx, selection-card.tsx, source-grid.tsx, search-modal.tsx, step-agents.tsx, step-confirm.tsx, skill-agent-summary.tsx, step-settings.tsx
- Additional components verified: menu-item.tsx, selection-card.tsx, step-refine.tsx, toast.tsx all exist
- Feature flags verified: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true (feature-flags.ts:1-8)
- All 16 hooks verified to exist in src/cli/components/hooks/
- Build step logic functions verified: validateBuildStep, isCompatibleWithSelectedFrameworks, buildCategoriesForDomain (build-step-logic.ts:16, :38, :48)
- All hotkeys in hotkeys.ts verified: HOTKEY_INFO(I), HOTKEY_ACCEPT_DEFAULTS(A), HOTKEY_SCOPE(S), HOTKEY_SETTINGS(S), HOTKEY_TOGGLE_LABELS(D), HOTKEY_FILTER_INCOMPATIBLE(F), HOTKEY_SET_ALL_LOCAL(L), HOTKEY_SET_ALL_PLUGIN(P), HOTKEY_ADD_SOURCE(A)
- HOTKEY_COPY_LINK was removed in 0.130.0 cleanup (no longer in hotkeys.ts) — component-patterns.md iter15 removed its table row
- Key labels verified: KEY_LABEL_ENTER, KEY_LABEL_ESC, KEY_LABEL_SPACE, KEY_LABEL_TAB, KEY_LABEL_DEL, KEY_LABEL_ARROWS, KEY_LABEL_ARROWS_VERT, KEY_LABEL_VIM, KEY_LABEL_VIM_VERT (hotkeys.ts:48-56)
- isHotkey helper at hotkeys.ts:63 verified
- Hotkey contexts verified in wizard.tsx: I toggles info (116-128), A on build+stack jumps to confirm (142-149), S on build toggles skill scope (152-158), S on agents toggles agent scope (161-168), S on sources toggles settings (170-173, NOT gated by flag)
- Settings step hotkeys verified in step-settings.tsx: A (HOTKEY_ADD_SOURCE, :134), DEL/Backspace (:120), ESC via useKeyboardNavigation(:77)
- BUILT_IN_DOMAIN_ORDER at consts.ts:199 verified (8 domains in correct order)
- DEFAULT_SCRATCH_DOMAINS at consts.ts:211 verified (["web", "api", "mobile"])
- Domain descriptions table verified against BUILT_IN_DOMAIN_DESCRIPTIONS in domain-selection.tsx:10-19 (all 8 match exactly)
- Edit mode flow verified: useWizardInitialization walks steps via setStep() building history (use-wizard-initialization.ts:43-51)
- Framework-first filtering verified: use-framework-filtering.ts hook + build-step-logic.ts functions

**store-map.md (0 errors found, 0 fixes needed):**

- useWizardStore at :560 verified
- WizardState range :190-497 verified (starts at 190, `buildSourceRows` return type ends at 497)
- All 26 state fields verified present in WizardState type and createInitialState (lines 530-558)
- All 26 initial values verified correct against createInitialState output
- All 29 actions verified to exist with correct signatures (checked every one against wizard-store.ts)
- All 8 computed getters verified with correct return types
- DOMAIN_AGENTS at :93-104 verified (web:6, api:3, cli:3)
- Source sort tiers verified (4 tiers at :113-116, getSourceSortTier at :118-123)
- createInitialState at :530-558, reset at :958 -- both verified
- selectStack reset fields verified (9 fields at :571-583)
- All 10 production file consumers verified via grep for useWizardStore:
  - wizard.tsx, wizard-layout.tsx, step-build.tsx, step-sources.tsx, step-agents.tsx, stack-selection.tsx, domain-selection.tsx, info-panel.tsx, skill-agent-summary.tsx, use-wizard-initialization.ts
  - Correctly excludes: step-confirm.tsx, step-settings.tsx, source-grid.tsx (receive data via props)
  - Correctly excludes: use-build-step-props.ts (receives store as parameter, doesn't import useWizardStore)

### 2026-04-02 Cross-Document Consistency Audit (all 18 reference docs)

21 fixes across 7 files. Verified 6 consistency axes: local->eject rename, count consistency, version consistency, line number cross-references, deleted file references, command list consistency.

**Axis 1: local -> eject rename (12 fixes across 5 files):**

- **state-transitions.md (5):** Sources step "local" -> "eject". `setAllSourcesLocal()` -> `setAllSourcesEject()`. `source: "local"` -> `source: "eject"`. `non-local` -> `non-eject`. `InstallMode ("local"` -> `("eject"`. Hotkey description "local" -> "eject".
- **architecture-overview.md (2):** Install mode table "local" -> "eject". eject.ts comment "Eject to local mode" -> "Eject skills/templates to local filesystem".
- **commands.md (3):** `local/plugin/mixed` -> `eject/plugin/mixed`. `local/mixed` -> `eject/mixed`. `local-to-plugin and plugin-to-local` -> `eject-to-plugin and plugin-to-eject`.
- **configuration.md (1):** `source: "local"` comment -> `source: "eject"`.
- **plugin-system.md (1):** All three `"local"` mode references -> `"eject"` in deriveInstallMode section.

**Axis 2: Count consistency -- ALL CORRECT (0 fixes):**
Verified: Skills=161, Categories=51, Domains=9, AgentNames=23, Source files=317, Zod schemas=39.

**Axis 3: Version consistency -- ALL CORRECT (0 fixes):**
Only version reference: architecture-overview.md says 0.100.0 (correct).

**Axis 4: Line number cross-references (3 fixes in boundary-map.md):**

- `MAX_CONFIG_FILE_SIZE` line: `consts.ts:144` -> `consts.ts:152`
- `writeScopedConfigs()` range: `:~395-425` -> `:369-425`
- `MAX_JSON_NESTING_DEPTH` line: `consts.ts:146` -> `consts.ts:154`

All other cross-references verified consistent: `resolveSource` at config.ts:84, `detectInstallation` at installation.ts:84, `compileAllAgents` at compiler.ts:216, `createLiquidEngine` at compiler.ts:394, WizardState at :190-497, useWizardStore at :560.

**Axis 5: Deleted file references (6 fixes across 3 files):**

- **architecture-overview.md (2):** Removed `yaml.ts` from file tree. Updated `safeLoadYamlFile` reference to note deletion.
- **boundary-map.md (2):** Removed `yaml.ts` from boundary file list. Rewrote section 2.1 to note deletion and document inline parse pattern.
- **dependency-graph.md (2):** Marked `yaml.ts` section as DELETED. Updated observation from "is dead code" to "has been removed".

No other deleted file references found (config/, diff.ts, outdated.ts, view-title.tsx, stats-panel.tsx already cleaned in prior audits).

**Axis 6: Command list consistency -- ALL CORRECT (0 fixes):**
All 4 docs (architecture-overview, commands, dependency-graph, boundary-map) agree on same 11 commands + 7 subcommands. None reference deleted config/diff/outdated.

**Intentionally NOT changed (legitimate "local" usages):**

- `CategoryPath = Category | "local"` (type-system.md, boundary-map.md) -- "local" means local skills directory, not install mode
- `SkillSourceType = "public" | "private" | "local"` (type-system.md) -- "local" means skill source type, not install mode
- `copyLocalSkills`, `deleteLocalSkill`, `migrateLocalSkillScope` -- actual function names
- `local-installer.ts` -- actual file name
- "local skills" in component descriptions -- refers to skills on local disk

### 2026-04-02 Adversarial Audit (8 docs: operations-layer, configuration, plugin-system, agent-system, boundary-map, dependency-graph, state-transitions, compilation-pipeline)

14 errors fixed across 6 of the 8 files. 2 files (operations-layer.md, compilation-pipeline.md) had zero errors -- only date stamps updated.

**boundary-map.md (4 errors):**

- Fixed `list` command file path: `commands/list.tsx:64-66` (was `commands/list.ts:17-19`)
- Fixed `init` flags line: `commands/init.tsx:162-168` (was `:170-176`)
- Fixed `edit` flags line: `commands/edit.tsx:81-90` (was `:75-84`)
- Fixed file size constant lines in consts.ts: MAX_MARKETPLACE_FILE_SIZE `:150` (was `:142`), MAX_PLUGIN_FILE_SIZE `:151` (was `:143`), MAX_CONFIG_FILE_SIZE `:152` (was `:144`), MAX_JSON_NESTING_DEPTH `:154` (was `:146`), MAX_MARKETPLACE_PLUGINS `:155` (was `:147`)
- Fixed `writeStandaloneConfigTypes` file: `installation/local-installer.ts:344` (was `configuration/config-types-writer.ts`)

**dependency-graph.md (3 errors):**

- Removed `config` command row (commands/config/ directory deleted)
- Fixed `list` file path: `commands/list.tsx` (was `commands/list.ts`)
- Updated `list` direct lib imports: added `lib/installation/` (detectInstallation), `lib/configuration/project-config` (loadProjectConfig) -- the rewrite added these
- Added `list` to Command -> Component Imports table: imports `SkillAgentSummary` from wizard

**agent-system.md (3 errors):**

- Updated AGENT_NAMES: now 23 entries at `:579-605` (was 18 entries at `:550-571`). All 5 previously missing agents (ai-developer, ai-reviewer, api-pm, api-tester, infra-reviewer) are now in the generated union.
- Removed entire "Agents NOT in Generated Union" section (no longer accurate)
- Fixed AgentName type line: `:605` (was `:571`)

**plugin-system.md (2 errors):**

- Removed `installLocal()` function (no longer exists). Replaced with `installEject()`.
- Fixed barrel exports: `LocalInstallOptions`/`LocalInstallResult`/`installLocal`/`buildLocalSkillsMap` -> `EjectInstallOptions`/`EjectInstallResult`/`installEject`/`buildEjectSkillsMap`
- Fixed `Both installLocal() and installPluginConfig()` -> just `installPluginConfig()`

**state-transitions.md (4 errors):**

- Fixed `goBack()` line: `wizard-store.ts:898-906` (was `:890-898`)
- Fixed `getStepProgress()` line: `wizard-store.ts:1001` (was `:993-1021`)
- Fixed `createInitialState()` line: `wizard-store.ts:530` (was `:524-550`)
- Fixed `selectStack()` line: `wizard-store.ts:571` (was `:563-575`)
- Fixed `DEFAULT_SCRATCH_DOMAINS` line: `consts.ts:211` (was `:202`)

**configuration.md (1 error):**

- Fixed `DEFAULT_BRANDING` line: `consts.ts:170-173` (was `:162-165`)

**All verified correct (no changes needed):**

- operations-layer.md: All 20 file structure entries, all type/function tables, all command consumer mappings, all data flow diagrams verified
- compilation-pipeline.md: All compiler.ts line numbers (sanitizeLiquidSyntax :41, sanitizeCompiledAgentData :77, readAgentFiles :118, buildAgentTemplateContext :151, compileAgent :190, compileAllAgents :216, compileAllSkills :263, copyClaudeMdToOutput :332, compileAllCommands :350, createLiquidEngine :394, removeCompiledOutputDirs :422), output-validator.ts lines, recompileAgents :157, discoverInstalledSkills :112
- boundary-map.md: exec.ts validation functions (:20, :43, :66), shell commands (:137, :154, :170, :202, :222, :242, :259), schemas.ts helper functions (:776, :784, :803), all schema line numbers verified, source validation chain (:84, :142, :291, :431) all correct
- configuration.md: ProjectConfig :66-146, SkillConfig :23-27, AgentScopeConfig :30-33, ResolvedConfig :18-22, resolveSource :84, validateSourceFormat :291, resolveAgentsSource :142, all config I/O function lines, all config-generator.ts lines (:47, :146, :169), all config-merger.ts lines (:25, :89), writeProjectConfig operation :43
- agent-system.md: All agent type lines in agents.ts (:9, :17, :27, :41, :55, :62, :71, :89, :108), compiler.ts function lines (:77, :118, :151, :190, :216, :394), STANDARD_FILES :50-60, agentYamlConfigSchema :215-227, DOMAIN_AGENTS :93-104, loadAllAgents :38, getAgentDefinitions :13
- plugin-system.md: All plugin-validator.ts lines (:64, :114, :185, :221, :351, :381, :459), all local-installer.ts lines (:96, :251, :282, :300, :309, :336, :369, :492), detection functions (:26, :35, :59, :84, :95), all exec.ts function lines

### 2026-04-02 Adversarial Audit (architecture-overview.md)

4 errors fixed, 0 additions. Version bump, command removal, file rename, and line drift since 2026-03-28 (version 0.94.0 -> 0.100.0).

**Errors fixed:**

- Fixed version: 0.100.0 (was 0.94.0)
- Removed `config/` subdirectory from directory structure (commands `config show`, `config path` deleted)
- Fixed `list.ts` -> `list.tsx` and updated description: "Show installation information (Ink component)" (was "List installed skills")
- Fixed file size limits line: `consts.ts:150-152` (was :143-145, shifted by new constants EJECT, BULLET, LABEL_BG)

**Source file count updated in DOCUMENTATION_MAP.md:** 317 (was 327, -10 from removed commands and related files)

**All verified correct (no changes needed):**

- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- resolveSource at config.ts:84-132, validateSourceFormat at config.ts:291 with helpers through :447
- sanitizeCompiledAgentData at compiler.ts:77-111, createLiquidEngine at compiler.ts:394-419
- detectInstallation at :84, detectProjectInstallation at :35, writeScopedConfigs at :369
- generateConfigSource at config-writer.ts:35, resolveRelationships at skill-resolution.ts:150
- exec.ts validation at :7-87
- Technology stack versions: ink v5, Zustand v5, Zod v4.3.6, Remeda v2.33.6
- Zod schema count: verified against `schemas.ts` on this entry's date <!-- Count deliberately not restated here; reference/types/zod-schemas.md owns it. -->
- Feature flags: SOURCE_SEARCH, SOURCE_CHOICE, INFO_PANEL (all confirmed)
- Data flow, wizard steps, security measures, install modes -- all verified unchanged

### 2026-04-02 Adversarial Audit (commands.md)

7 errors fixed. Removed deleted `config` command (row from Commands Index + Operations Layer table). Fixed `list` command: file path `list.ts` -> `list.tsx`, type `ts` -> `tsx`, rewrote detailed section from old plain-TS description to Ink-based implementation (ListView component, SkillAgentSummary, detectInstallation, loadProjectConfig, TTY/non-TTY branching), updated Operations Layer description. Fixed `edit` summary: "Edit installed skills via wizard" -> "Edit skills in the plugin" (matches actual `static summary`), added styled output description (chalk-colored change summary, simplified completion message). Verified `config/`, `diff`, `outdated` commands all deleted from filesystem. Verified message counts unchanged (ERROR=10, SUCCESS=5, STATUS=12, INFO=6). Version 0.100.0 confirmed.

### 2026-04-02 Adversarial Audit (skills-and-matrix.md)

5 count errors fixed, 0 line number errors, 0 structural errors. All 18 matrix-resolver.ts line numbers verified correct. All 8 matrix-provider.ts line numbers verified correct. All 3 skill-resolution.ts line numbers verified correct. All 7 stacks-loader.ts line numbers verified correct. SourceLoadResult line range (62-69) verified correct. rawMetadataSchema line range (26-36) verified correct. Barrel exports from matrix/index.ts verified (14 from matrix-resolver, validateConflicts/Requirements/Exclusivity/Recommendations correctly documented as non-barrel). default-rules.ts verified against documented relationship types.

**Count drift (5 errors):**

- Fixed SKILL_MAP count: 161 (was 155, +6 skills added)
- Fixed Categories count: 51 (was 50, +1 category added)
- Fixed Domains count: 9 (was 8, "desktop" domain added)
- Fixed Domains list: added "desktop" (was missing from enumeration)
- Fixed AgentNames count: 23 (was 18, +5 agents added)

**All verified correct (no changes needed):**

- All 18 matrix-resolver.ts function line numbers
- All 8 matrix-provider.ts exports and line numbers
- All 3 skill-resolution.ts exports and line numbers
- All 7 stacks-loader.ts function line numbers
- SourceLoadResult type at source-loader.ts:62-69
- rawMetadataSchema at matrix-loader.ts:26-36
- Barrel export documentation (matrix/index.ts)
- Relationship system table (6 types)
- Data flow pipeline (7 steps)
- All file structure tables (matrix, skills, loading, stacks)
- Operations layer integration table

### 2026-04-02 Adversarial Audit (wizard-flow.md, component-patterns.md)

19 errors fixed across 2 files. 1 finding written.

**wizard-flow.md (7 errors):** INFO_PANEL default false→true. BUILT_IN_DOMAIN_ORDER line 190→199. Default scratch domains line 202→211. Removed deleted view-title.tsx and stats-panel.tsx entries. Added SkillAgentSummary to StepConfirm component tree. Rewrote InfoPanel section (old groupSkillsByBucket/groupAgentsByScope helpers replaced with marketplace/stack header + SkillAgentSummary delegation).

**component-patterns.md (12 errors):** Added missing skill-agent-summary.tsx and toast.tsx to directory listing. Removed deleted view-title.tsx and stats-panel.tsx. CLI_COLORS range 177-187→185-196, added LABEL_BG. UI_SYMBOLS range 99-112→99-115, added LOCK, EJECT, BULLET. CategoryOption type: added locked field. HOTKEY_ACCEPT_DEFAULTS context fixed. Rewrote InfoPanel section, replaced StatsPanel with SkillAgentSummary documentation. SCROLL_VIEWPORT range 149-160→157-168.

**Finding:** `agent-findings/2026-04-02-documentation-references-deleted-files.md`

### 2026-04-02 Verification Pass (post-edit validation of utilities.md, component-patterns.md, type-system.md, store-map.md)

Second-pass verification of recently edited docs (sorted by edit count: utilities 18, component-patterns 12, type-system 10, store-map 8). Purpose: catch errors introduced by the editing process itself.

**1 error fixed:**

- component-patterns.md: Inline `CLI_COLORS` reference at line 103 still said `177-187` (stale from before the +8 shift), while the Color Constants section header already said `185-196`. Fixed inline reference to `185-196`.

**All other edits verified correct:**

- **utilities.md (18 edits):** All line numbers verified via `sed -n`: UI_LAYOUT :117, CLI_COLORS :185, SCROLL_VIEWPORT :157, DEFAULT_BRANDING :170, 5 Limits :150-155, GITHUB_SOURCE :129, DEFAULT_SKILLS_SUBDIR :135, KEBAB_CASE_PATTERN :138, BUILT_IN_DOMAIN_ORDER :199, DEFAULT_SCRATCH_DOMAINS :211. UI_SYMBOLS has exactly 15 members (counted). UI_MESSAGES at :124. SOURCE_DISPLAY_NAMES has "eject" not "local". yaml.ts confirmed deleted. All exec.ts line numbers verified: ExecResult :89, execCommand :95, claudePluginInstall :137, isClaudeCLIAvailable :154, MarketplaceInfo :163, claudePluginMarketplaceList :170, claudePluginMarketplaceExists :197, claudePluginMarketplaceAdd :202, claudePluginMarketplaceRemove :222, claudePluginMarketplaceUpdate :242, claudePluginUninstall :259. WarnOptions at :66. Message counts: ERROR=10, SUCCESS=5, STATUS=12, INFO=6.
- **component-patterns.md (12 edits):** skill-agent-summary.tsx and toast.tsx exist in wizard/. view-title.tsx and stats-panel.tsx confirmed deleted. CLI_COLORS range 185-196, UI_SYMBOLS range 99-115, SCROLL_VIEWPORT range 157-168 all verified. LOCK/EJECT/BULLET in UI_SYMBOLS table. CategoryOption has `locked` field at category-grid.tsx:20. InfoPanel: no props, reads skillConfigs/agentConfigs/selectedStackId/enabledSources from store. SkillAgentSummary: exports SkillAgentSummaryProps, SkillAgentSummary, TableHeader, ScopeLabel, EjectIcon -- all confirmed.
- **type-system.md (10 edits):** SKILL_MAP at source-types.ts:6. SkillSlug at :170. SkillId at :171. AgentName at :579 with 23 entries (counted). Domain at :563 with 9 entries (counted). Category at :505 with 51 entries (counted). "desktop" is in domain list. SKILL_MAP has 161 entries (counted).
- **store-map.md (8 edits):** useWizardStore at :560. WizardState :190-497. installedSkillConfigs and installedAgentConfigs both in store. setAllSourcesEject exists, setAllSourcesLocal does not. createInitialState at :530-558. reset at :958. skill-agent-summary.tsx imports useWizardStore (confirmed). canGoToNextDomain/canGoToPreviousDomain are `() => boolean` getter functions.

### 2026-04-02 Adversarial Audit (utilities.md, store-map.md, type-system.md)

36 errors fixed across 3 files. 1 finding written.

**utilities.md (18 errors):** yaml.ts updated to DELETED status. All line numbers shifted +8 due to new UI_SYMBOLS entries (EJECT, BULLET, SCROLL_UP, SCROLL_DOWN): UI_LAYOUT 114→117, CLI_COLORS 177→185, SCROLL_VIEWPORT 149→157, SOURCE_DISPLAY_NAMES 171→179, DEFAULT_BRANDING 162→170, DEFAULT_PUBLIC_SOURCE_NAME 168→176, HASH_PREFIX_LENGTH 132→140, CACHE_HASH_LENGTH 135→143, CACHE_READABLE_PREFIX_LENGTH 138→146, all 5 Limits 142-147→150-155, GITHUB_SOURCE 121→129, DEFAULT_SKILLS_SUBDIR 127→135, KEBAB_CASE_PATTERN 130→138, BUILT_IN_DOMAIN_ORDER 190→199, DEFAULT_SCRATCH_DOMAINS 202→211. Added missing UI_MESSAGES constant. Added EJECT, BULLET, SCROLL_UP, SCROLL_DOWN to UI_SYMBOLS (full 15 members). SOURCE_DISPLAY_NAMES value fixed: "local"→"eject".

**store-map.md (8 errors):** useWizardStore line 552→560. WizardState shape range 190-493→190-497. Added missing installedSkillConfigs and installedAgentConfigs fields. setAllSourcesLocal→setAllSourcesEject rename. Source sort tier "local/installed"→"eject/global (installed on disk)". reset() line 524-550→createInitialState at 530-558, reset at 958. Added skill-agent-summary.tsx consumer. canGoToNextDomain/canGoToPreviousDomain return types boolean→() => boolean (getter functions).

**type-system.md (10 errors):** SKILL_MAP line 165→6. SkillId/SkillSlug count 155→161. SkillSlug line 164→170. AgentName line 571→579, count 18→23 (added ai-developer, ai-reviewer, api-pm, api-tester, infra-reviewer). Domain line 546→563, count 8→9 (added desktop). Category line 540→505, count 50→51 (added desktop-framework). Domain list: added desktop.

**Finding:** `agent-findings/2026-04-02-local-to-eject-rename.md`

### 2026-04-02 Deep Second Pass (agent-system.md, compilation-pipeline.md)

Exhaustive line-by-line verification of 2 docs that received only light coverage in the remaining-docs audit. Every line number, type definition, function signature, and pattern claim checked against actual source files.

**agent-system.md (1 fix):**

- Fixed re-export chain: clarified that `AGENT_NAMES` value is NOT barrel-exported through `types/index.ts` (which uses `export type *`). Consumers import from `agents.ts` or `source-types.ts` directly. Also fixed line reference `:3-6` -> `:5-6` (lines 3-4 are import, 5-6 are re-exports).

**All verified correct in agent-system.md (0 additional errors):**

- All 10 agent type definitions in agents.ts verified: AgentHookAction :9-14, AgentHookDefinition :17-20, BaseAgentFields :27-38, AgentDefinition :41-52, AgentConfig :55-59, AgentYamlConfig :62-68, AgentFrontmatter :71-86, CompiledAgentData :89-105, AgentSourcePaths :108-112
- AgentName at source-types.ts:605 (23 entries at :579-603 verified)
- agentYamlConfigSchema at schemas.ts:215-227 verified
- ModelName at matrix.ts:11, PermissionMode at matrix.ts:14-20 verified
- STANDARD_FILES at consts.ts:43-61 (agent constants at 50, 56-60) verified
- All 10 Key Functions: loadAllAgents :38, readAgentFiles :118, buildAgentTemplateContext :151, sanitizeCompiledAgentData :77, compileAgent :190, compileAllAgents :216, createLiquidEngine :394, sanitizeLiquidSyntax :41, getAgentDefinitions :13, loadAgentDefs :21
- DOMAIN_AGENTS at wizard-store.ts:93-104 verified (web:6, api:3, cli:3 agents)
- 11 unmapped agents verified (4 meta, 2 pattern, 1 planning, 2 reviewer, 1 tester, 1 developer)
- Agent inventory: 23 agents, 20 opus / 3 sonnet verified via metadata.yaml grep
- skill-summoner tools (WebSearch, WebFetch, no Bash) verified
- Template variables table verified against agent.liquid (snake_case property names match template)
- Methodology partials: 5 rendered + 1 unrendered (improvement-protocol.liquid) verified
- createLiquidEngine template roots (3 paths) verified
- Engine config (extname, strictVariables, strictFilters) verified

**compilation-pipeline.md (0 errors found, 0 fixes):**

- All 11 compiler.ts function line numbers verified: sanitizeLiquidSyntax :41, sanitizeCompiledAgentData :77, readAgentFiles :118-149, buildAgentTemplateContext :151-172, compileAgent :190, compileAllAgents :216, compileAllSkills :263-321, copyClaudeMdToOutput :332-339, compileAllCommands :350-381, createLiquidEngine :394-419, removeCompiledOutputDirs :422-426
- LIQUID_SYNTAX_PATTERN at :31 verified
- Skill split logic at :156-158 verified
- All 6 output-validator.ts line numbers verified: checkXmlTagBalance :5, checkTemplateArtifacts :37, checkRequiredPatterns :53, validateFrontmatter :76, validateCompiledAgent :108, printOutputValidationResult :140
- All 9 compiler.ts function signatures verified against actual code
- All 6 output-validator.ts function signatures verified
- recompileAgents at agent-recompiler.ts:157 verified, all 9 flow steps match actual code
- compileAgents at compile-agents.ts:32 verified
- discoverInstalledSkills at discover-skills.ts:112 verified
- resolveAgents at resolver.ts:153 verified
- All 4 plugin-mode compilers verified: compileSkillPlugin :99, compileAgentPlugin :44, compileStackPlugin :191, compileAgentForPlugin :72
- compileAgentForPlugin 3 differences from standard compileAgent verified (pluginRef format, preloaded IDs, direct file reading)
- resolveClaudeMd at resolver.ts:22 verified
- validateCompiledAgent 4 checks verified (frontmatter, XML, artifacts, patterns)
- checkRequiredPatterns 4 checks verified (frontmatter start, role, principles, min length)
- Template root resolution hierarchy (3 paths) verified against createLiquidEngine code

### 2026-04-02 Round 4 Deep Pass (operations-layer.md, dependency-graph.md)

Complete line-by-line verification of 2 docs that received only date-stamp updates in round 1. Every operation function, type definition, function signature, dependency table, command-to-operation mapping, data flow diagram, and consumer count verified against actual source files.

**operations-layer.md (2 errors fixed):**

- Fixed test file count: 10 co-located test files (was 9 -- missed detect-project.test.ts)
- Fixed discover-skills.ts Lower-Level Lib Dependencies: added `utils/logger.js` (verbose, warn) and `utils/typed-object.js` (typedEntries, typedKeys) that were omitted while other entries in the same table included their utils imports

**All verified correct in operations-layer.md (0 additional errors):**

- All 19 file structure entries match filesystem (2 root + 3 barrels + 14 operations)
- All 3 source types: LoadSourceOptions (4 fields), LoadedSource (2 fields), MarketplaceResult (2 fields)
- All 8 skills types: DiscoveredSkills (6 fields), ScopedSkillDir (3 fields), ScopedSkillDirsResult (5 fields), SkillCopyResult (3 fields), SkillComparisonResults (3 fields), SkillMatchResult (2 fields), PluginInstallResult (2 fields), PluginUninstallResult (2 fields)
- All 7 project types: DetectedProject (3 fields), BothInstallations (3 fields), CompileAgentsOptions (9 fields), CompilationResult (3 fields), ConfigWriteOptions (5 fields), ConfigWriteResult (6 fields), AgentDefs (3 fields)
- All 15+ function signatures verified: loadSource, ensureMarketplace, discoverInstalledSkills, loadSkillsFromDir, discoverLocalProjectSkills, mergeSkills, collectScopedSkillDirs, copyLocalSkills, compareSkillsWithSource, buildSourceSkillsMap, findSkillMatch, installPluginSkills, uninstallPluginSkills, detectProject, detectBothInstallations, compileAgents, loadAgentDefs, writeProjectConfig
- All 7 command consumer rows verified: init (8 ops), edit (10 ops), compile (4 ops), update (6 ops), doctor (2 ops), search (1 op), eject (1 op)
- All 3 data flow diagrams verified: init flow (6 steps), compile flow (dual-pass), edit flow (10 steps)
- All 14 Lower-Level Lib Dependencies entries verified against actual imports

**dependency-graph.md (3 errors fixed):**

- Fixed Key Observations: utils/fs.ts consumer count 54 -> 52 (table body already said 52, summary was inconsistent)
- Fixed utils/errors.ts: added base-command.ts to Commands layer, updated count 10 -> 11, total 32 -> 33
- Fixed utils/typed-object.ts: Lib count 17 -> 16 (was counting test helper **tests**/helpers.ts), total 24 -> 23

**All verified correct in dependency-graph.md (0 additional errors):**

- All 18 Command -> Operations Map rows verified: 8 commands with operations match actual imports, 10 commands with "(none)" confirmed via grep
- All Command -> Direct Lib Imports verified for: init (6 modules), edit (4 modules), compile (2 modules), doctor (4 modules), eject (3 modules), search (2 modules), list (3 modules)
- Command -> Component Imports table verified: init, edit, list, update, uninstall, search, new/agent, build/stack
- All Operations -> Lib Map entries verified (2 source, 5 project, 8 skills)
- Store -> Lib Dependencies verified (4 lib modules: installation.ts, matrix/, matrix-provider.ts, wizard/)
- All 13 Component -> Lib Dependencies verified via grep
- Shared utility consumer counts verified: exec.ts=8, fs.ts=52, logger.ts=57, errors.ts=33, messages.ts=9, typed-object.ts=23, string.ts=3, type-guards.ts=2, frontmatter.ts=4
- Layer diagram and allowed dependency directions table unchanged and correct

### 2026-04-02 Round 5 Final Verification (state-transitions.md)

Exhaustive verification of all line references, state transition diagrams, eject terminology, feature-flag gating, and consts.ts references. Every wizard-store.ts function/action/getter line number verified.

**7 errors fixed:**

- Fixed `step-agents.tsx:207` -> `:216` (setStep("confirm") is at line 216)
- Fixed `wizard.tsx:148-149` -> `:147-148` (setStackAction at 147, setStep at 148)
- Fixed `wizard.tsx:243-246` -> `:240-245` (onContinue callback spans 240-245)
- Fixed `wizard.tsx:144-147` -> `:142-146` (accept-defaults condition check)
- Added missing `installedSkillConfigs` and `installedAgentConfigs` to Initial State table (both `null`)
- Fixed step sequence diagram: added missing `setStackAction("customize")` and `setApproach("stack")` for stack item path
- Fixed Derived State table: escaped pipe characters in union types (`Domain | null`, `"eject" | "plugin" | "mixed"`) that were breaking markdown table columns

**All verified correct (0 additional errors):**

- WizardStep type at :172-178 (6 variants)
- WIZARD_STEPS at wizard-tabs.tsx:41-48 (6 steps, labels match)
- createInitialState at :530 (26 fields, order matches doc)
- selectStack at :571 (9 fields reset)
- goBack at :898-906 (pops history, falls back to "stack")
- getStepProgress at :1001 (all 7 rows in logic table traced through code)
- nextDomain at :780-789, prevDomain at :791-800
- DOMAIN_AGENTS at :93-104 (web:6, api:3, cli:3 agents)
- DEFAULT_SCRATCH_DOMAINS at consts.ts:211 (web, api, mobile)
- BUILT_IN_DOMAIN_ORDER at consts.ts:199 (8 domains)
- Feature flags: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true
- stack-selection.tsx: scratch at :160, stack at :169 (both setStep("domains"))
- domain-selection.tsx: onContinue at :53 (setStep("build"))
- use-build-step-props.ts: nextDomain at :36, setStep("sources") at :37
- All hotkey registrations verified against hotkeys.ts constants
- Overlay blocking logic verified (showSettings blocks all except S, showInfo blocks all except ESC/I)
- No remaining "local" references in install-mode contexts
- All 3 cross-referenced docs exist (store-map.md, wizard-flow.md, component-patterns.md)

### 2026-03-28 Adversarial Audit (utilities.md)

0 errors found, 0 fixes needed. Full adversarial verification of all 10 utility files, all function signatures and line numbers, all message counts (ERROR=10, SUCCESS=5, STATUS=12, INFO=6), all 8 exec.ts exported functions + 4 internal helpers, all 11 fs.ts functions, all 4 logger functions + WarnOptions + buffering API, all 4 type-guard functions, all consts.ts constants (paths, DIRS, STANDARD_FILES x17, STANDARD_DIRS x3, branding, versioning, hashing, limits, YAML formatting, UI constants, schema paths, source resolution, domain config). string.ts already documented with correct signature and 3 importers. yaml.ts dead code confirmed (zero production importers, only yaml.test.ts). All mock files verified. Documentation was already fully current from prior update session.

### 2026-03-28 Adversarial Audit (wizard-flow.md)

15 errors fixed, 8 additions. Step progression missing "domains" step. Phantom HelpModal and ? hotkey removed (file does not exist). WizardResultV2 line range fixed (32-45 not 30-43). BUILT_IN_DOMAIN_ORDER expanded from 5 to 8 domains (ai, infra, meta added) at line 190 (not 191). Phantom computeOptionState() removed, isCompatibleWithSelectedFrameworks() added. WizardProps: removed phantom marketplaceLabel, added isEditingFromGlobalScope. Added Feature Flags section, Info Panel section, F/I hotkeys, Settings hotkeys, domain descriptions table.

### 2026-03-28 Adversarial Audit (architecture-overview.md)

Deep adversarial verification after 14 days stale, 204 file changes, version 0.74.10 -> 0.94.0.

**architecture-overview.md -- 11 errors fixed, 5 omissions added:**

- Fixed version: 0.94.0 (was 0.74.10)
- Fixed `detectInstallation()` line: 84 (was 103)
- Fixed `writeScopedConfigs()` line: 369 (was 422)
- Fixed `generateConfigSource()` line: 35 (was 29)
- Fixed `resolveRelationships()` line: 150 (was 147)
- Fixed template root resolution: `createLiquidEngine()` at 394-419 (was 400-434)
- Fixed `sanitizeCompiledAgentData()` range: 77-111 (was 77-112)
- Fixed wizard steps: added missing "domains" step (stack -> domains -> build -> sources -> agents -> confirm)
- Updated Zod schema count: 39 (was "30+")
- Updated feature flags: added SOURCE_CHOICE and INFO_PANEL (was only SOURCE_SEARCH)
- Added `operations/` directory with 3 subdirectories (source, skills, project) to directory structure
- Added `string.ts` utility to utils listing
- Added operations layer to data flow section
- Updated configuration directory comment to include config-generator
- Updated data flow Installation section to reference operations layer

**All verified correct (no changes needed):**

- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- baseFlags: only `--source` (confirmed)
- resolveSource at config.ts:84-132
- validateSourceFormat at config.ts:291-320 with helpers through :447
- File size limits at consts.ts:143-145
- exec.ts validation at :7-87
- Source file count: 327 TypeScript files
- Technology stack versions: ink v5, Zustand v5, Zod v4.3.6, Remeda v2.33.6
- Vitest config: 3 projects (unit, integration, commands)
- Config subcommands: show, path (+ index.ts alias)
- All directory structure entries verified

### 2026-03-28 Adversarial Audit (skills-and-matrix.md)

28 errors fixed, 4 sections added. 15 function line numbers drifted in matrix-resolver.ts: resolveAlias 20->33, getDependentSkills 48->61, isDiscouraged 94->139, getDiscourageReason 153->253, isRecommended 234->403, getRecommendReason 266->435, getAvailableSkills 454->645, getSkillsByCategory 485->673, validateSelection 424->593, validateConflicts 282->451, validateRequirements 305->474, validateExclusivity 341->510, validateRecommendations 372->541. Also: resolveRelationships 147->150, mergeMatrixWithSkills 97->100 (skill-resolution.ts). SourceLoadResult 61-67->62-69 with missing marketplaceDisplayName field. rawMetadataSchema 26-37->26-36. Removed phantom tags from metadata.yaml example. Counts: SKILL_MAP 86->155, Categories 34->50, Domains 5->8, AgentNames 17->18. Added 5 undocumented matrix-resolver exports (getUnmetRequiredBy, isIncompatible, hasUnmetRequirements, getIncompatibleReason, getUnmetRequirementsReason). Added hasSkill to matrix-provider with barrel note. New sections: Current Counts, Skill Generators, Operations Layer Integration, expanded stacks-loader.

### 2026-03-28 Adversarial Audit (plugin-system.md)

17 line errors fixed, 4 sections added. See inline comments in plugin-system.md for full details. Key corrections: installLocal :584, installPluginConfig :492, writeScopedConfigs :369, detectInstallation :84, detectGlobalInstallation :59, getInstallationOrThrow :95, validatePlugin :351. Added mode-migrator.ts section, operations layer plugin ops, 3 missing exec.ts functions, installation barrel exports.

### 2026-03-28 Adversarial Audit (configuration.md)

9 line-number errors fixed, 1 phantom function removed, 1 section added. Prior 2026-03-14 audit marked several stale values as "verified correct" but those had already drifted. Fixed: `generateConfigSource` :29->:35, `buildStackProperty` :142->:146, `splitConfigByScope` :199->:169, removed phantom `compactStackForYaml`, `mergeWithExistingConfig` :83->:89, `mergeConfigs` :24->:25, `writeScopedConfigs` :422->:369, `DEFAULT_BRANDING` :163-166->:162-165, `SCHEMA_PATHS` :79-86->:78-85. Added Operations Layer section for `writeProjectConfig()` at operations/project/write-project-config.ts:43.

### 2026-03-28 Adversarial Audit (store-map.md)

Deep validation of every line number, state field, action, getter, and consumer against `src/cli/stores/wizard-store.ts` (1105 lines). 17 errors found and fixed:

**Line number drift (4 errors):**

- Fixed `useWizardStore` line: 552 (was 494)
- Fixed `WizardState` shape range: 190-493 (was 149-439)
- Fixed `createInitialState()` range: 524-550 (was 468-492)
- Fixed `DOMAIN_AGENTS` range: 93-104 (was 54-65)

**Missing "domains" step (2 errors):**

- Added `"domains"` to WizardStep union (was missing entirely)
- Fixed step progression: `stack -> domains -> build -> sources -> agents -> confirm` (was missing `domains`)

**Phantom state field (1 error):**

- Removed `showHelp` (does not exist in code -- was renamed to `showInfo`)

**Missing state fields (3 errors):**

- Added `filterIncompatible: boolean` (filter incompatible skills in build step)
- Added `showInfo: boolean` (info overlay visible -- replaced `showHelp`)
- Added `isEditingFromGlobalScope: boolean` (disables scope toggling when editing from ~/.claude/)

**Phantom action (1 error):**

- Removed `toggleHelp` (does not exist -- was renamed to `toggleInfo`)

**Missing actions (3 errors):**

- Added `toggleFilterIncompatible` (toggle filtering + removes incompatible web skills on enable)
- Added `toggleInfo` (toggle info overlay)
- Added `setCurrentDomainIndex` (set domain index directly, no-op if out of range)

**Consumer list drift (2 errors):**

- Removed `step-stack.tsx` (no longer imports useWizardStore directly)
- Added `info-panel.tsx` (new consumer: info overlay showing selected skills/agents)

**Initial state values (1 error):**

- Updated initial state: replaced `showHelp: false` with `filterIncompatible: false`, `showInfo: false`, `isEditingFromGlobalScope: false`

**All verified correct (no changes needed):**

- Zustand v5 library, single store pattern
- All 10 Selection State fields
- All 2 Source State fields
- All 3 Approach State fields
- All 5 Scope/Source Per-Skill actions and signatures
- All 5 Source Management actions and signatures
- All 3 Population actions and signatures
- All 8 Computed Getters and return types
- `deriveInstallMode` signature and behavior
- `selectStack()` reset behavior (9 fields reset)
- DOMAIN_AGENTS content (web=6, api=3, cli=3 agents)
- Source sort tiers (4 tiers)
- Usage pattern code examples

### 2026-03-28 Adversarial Audit (commands.md)

Complete rewrite after 14 days stale. Every command file (23 total) read in full. Every flag verified against actual `static flags` definitions. Operations layer usage mapped per command.

**commands.md -- FULL REWRITE. Major drift found:**

- Prior doc had ZERO mention of operations layer -- 10 commands using operations now documented with specific operation calls
- Prior `init` flow outdated: now uses 8 operations (loadSource, ensureMarketplace, installPluginSkills, copyLocalSkills, writeProjectConfig, compileAgents, discoverInstalledSkills, loadAgentDefs)
- Prior `edit` flow missed: detectProject, uninstallPluginSkills, scope migration, agent scope changes, migration handling
- Prior `compile` flow missed: detectBothInstallations, scopeFilter on passes, buildCompilePasses logic
- Prior `list` summary wrong: was "List installed skills", actual: "Show installation information" (alias: ls)
- Prior doc had NO flags/details for 17 of 23 commands
- doctor defines source flag directly (not via BaseCommand.baseFlags) -- now documented
- Added complete flags/args tables for all 23 commands
- Added Operations Layer Usage by Command cross-reference table
- Added exported utilities from init: formatDashboardText, showDashboard, getDashboardData

### 2026-03-28 Adversarial Audit (utilities.md)

10 errors/omissions fixed: Added `string.ts` module (truncateText, 3 importers), 2 missing exec.ts wrappers (Remove/Update, total now 8), ExecResult/MarketplaceInfo types, warn() WarnOptions param, MAX_CONFIG_FILE_SIZE line (:144 was :145), 9 missing STANDARD_FILES entries, DIRS/Branding/Schema/Source/Domain sections. Flagged yaml.ts as dead code.

**Verified correct (unchanged):** Exit codes (5), message counts (ERROR=10, SUCCESS=5, STATUS=12, INFO=6), BaseCommand flag (--source), all 23 file paths, config subcommands (show, path only)

### 2026-03-14 Second-Pass Audit (architecture-overview.md, type-system.md)

Deep adversarial verification of every line number, count, function signature, directory structure, and data flow claim against actual source code.

**architecture-overview.md -- 3 errors fixed:**

- Fixed config subcommands: was "(get, set-project, show, path, unset-project)" but only `show.ts`, `path.ts`, and `index.ts` (alias for show) exist. Changed to "(show, path)"
- Fixed Data Flow: `render(<Wizard matrix={matrix} />)` was wrong -- Wizard does not receive matrix as a prop. Changed to `render(<Wizard projectDir={...} marketplaceLabel={...} />)` and added note that wizard imports matrix from matrix-provider.ts directly
- Fixed Data Flow: `loadSkillsMatrixFromSource() -> MergedSkillsMatrix` was imprecise -- returns `SourceLoadResult` (which contains matrix + sourceConfig). Changed to `-> SourceLoadResult (matrix + sourceConfig)`

**type-system.md -- 1 error fixed:**

- Fixed `projectConfigLoaderSchema` validates column: was `.claude-src/config.yaml`, changed to `.claude-src/config.ts` (config files are now TypeScript loaded via jiti)

**All verified correct (no changes needed):**

- Version 0.74.10 matches package.json
- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- resolveSource at config.ts:84, sanitizeCompiledAgentData at compiler.ts:77-112
- validateSourceFormat at config.ts:291-320 with helpers through :447
- File size limits at consts.ts:143-145, exec.ts validation at :7-87
- generateConfigSource at config-writer.ts:29, writeScopedConfigs at local-installer.ts:422
- resolveRelationships at skill-resolution.ts:147, template root at compiler.ts:400-434
- 293 TypeScript files, 86 SKILL_MAP entries, 17 AgentNames, 5 Domains, 34 Categories
- All union type line numbers (SkillId :96, SkillSlug :95, AgentName :347, Domain :323, Category :317)
- All Named Aliases line numbers, all Core Data Structure line ranges
- All 10 Wizard/UI type line ranges, all type guard and typed object helper signatures
- All 26 Zod schema names exist, all 3 utility functions exist
- Directory structure matches actual filesystem, WizardStep union confirmed

### 2026-03-14 Second-Pass Audit (test-infrastructure.md)

Adversarial audit of first-pass validation results for test-infrastructure.md. Errors found and fixed:

- Added missing co-located test: `src/cli/lib/source-validator.test.ts`
- Added 2 missing component tests: `hotkeys.test.ts`, `utils.test.ts`
- Added 2 missing factory functions to table: `createMockRawStacksConfigWithArrays()`, `createMockRawStacksConfigWithObjects()`
- Added new "Test Utilities" section documenting 9 helper functions omitted from factory table: `runCliCommand`, `readTestYaml`, `readTestTsConfig`, `writeTestTsConfig`, `parseTestFrontmatter`, `createTestDirs`, `cleanupTestDirs`, `createTempDir`, `cleanupTempDir`
- Fixed unit test project include pattern: added `scripts/**/*.test.ts` (was missing)
- Added note that smoke tests use `*.smoke.test.ts` pattern, not matched by E2E vitest config

Verified correct (no changes needed):

- E2E file counts: commands=24, interactive=24, lifecycle=11, integration=3, smoke=3, total=65
- SKILLS registry: 10 entries
- TEST_CATEGORIES: 15 entries
- All keyboard/timing constants match source
- All 5 content generator functions match source
- All 6 mock-data files match source
- E2E helper files match source
- Fixture directory structure matches source (no `configs/` or `matrix/` subdirectories)

### 2026-03-14 Second-Pass Audit (configuration.md, plugin-system.md)

Deep adversarial verification of every claim in configuration.md and plugin-system.md against actual source code. All line numbers, type definitions, function signatures, and file paths verified correct. No hallucinated content found from the prior agent pass. Omissions found and fixed:

**features/configuration.md -- 0 errors, 5 additions:**

- All 14 documented line numbers verified correct against source code
- All 3 type definitions (ProjectConfig, SkillConfig, AgentScopeConfig, ResolvedConfig) verified exact match
- All 5 source resolution precedence steps verified against `resolveSource()` implementation
- Added 4 undocumented exported functions to Config I/O table: `getProjectConfigPath()` (:24), `resolveAllSources()` (:224), `resolveAuthor()` (:204), `formatOrigin()` (:172)
- Added `isLocalSource()` documentation with behavior description (:431)
- Added `SplitConfigResult` return type to `splitConfigByScope()` description

**features/plugin-system.md -- 0 errors, 4 additions:**

- All 16 documented line numbers verified correct against source code
- All type definitions (PluginManifest, Marketplace) verified exact match
- All 5 exec.ts shell command strings verified against actual `execCommand()` calls
- Fixed `deriveInstallMode()` to document empty-skills-array case (returns `"local"`)
- Added Plugin Manifest Finder section documenting `findPluginManifest()` (walks up dirs)
- Added Plugin Info section documenting 4 exported functions and 2 types from `plugin-info.ts`
- Added exported frontmatter validators `validateSkillFrontmatter()` (:184) and `validateAgentFrontmatter()` (:220)

**Cross-reference checks passed:**

- architecture-overview.md agrees on `resolveSource()` at config.ts:84, `validateSourceFormat()` at :291
- type-system.md agrees on `ProjectConfig` at types/config.ts:66-146
- installation/index.ts barrel exports match all documented re-exports

### 2026-03-14 Second-Pass Adversarial Audit (commands.md, utilities.md)

Deep verification of every claim in commands.md and utilities.md against actual source code. Major hallucination errors found and fixed from prior agent pass:

**commands.md -- 8 errors fixed:**

- Removed phantom `--dry-run` base flag (does not exist in BaseCommand; only `--source` is a base flag)
- Removed 3 phantom config subcommands: `config get` (get.ts does not exist), `config set-project` (set-project.ts does not exist), `config unset-project` (unset-project.ts does not exist). Only `config` exists (show/path subcommands later removed).
- Removed phantom `--dry-run` from init flags (init only has `--refresh`, `--source`)
- Removed phantom `--dry-run` from edit flags (edit only has `--refresh`, `--agent-source`, `--source`)
- Removed phantom `--output` and `--dry-run` from compile flags (compile only has `--verbose`, `--agent-source`, `--source`)
- Removed phantom "Custom output" compile mode description (no `--output` flag exists)
- Fixed config section: `.claude-src/config.yaml` changed to `.claude-src/config.ts` (TypeScript format)
- Updated compile flow description: now describes dual-pass global+project compilation with `detectGlobalInstallation()` and `detectProjectInstallation()`

**utilities.md -- 3 additions, no errors:**

- Added `GLOBAL_INSTALL_ROOT`, `SKILL_CATEGORIES_PATH`, `SKILL_RULES_PATH` to paths table
- Added `STANDARD_FILES.CONFIG_TS` and `STANDARD_FILES.CONFIG_TYPES_TS` to standard files table
- Added Startup Message Buffering subsection documenting `enableBuffering()`, `drainBuffer()`, `disableBuffering()`, `pushBufferMessage()` and `StartupMessage` type

**All verified correct (no changes needed):**

- Exit codes (5 entries in exit-codes.ts)
- Message counts: ERROR_MESSAGES=10, SUCCESS_MESSAGES=5, STATUS_MESSAGES=12, INFO_MESSAGES=6
- Line numbers: getErrorMessage :2, execCommand :95, extractFrontmatter :3, safeLoadYamlFile :13, MAX_CONFIG_FILE_SIZE :145
- All 6 Claude CLI wrapper functions in exec.ts
- All 4 type guard functions in type-guards.ts
- All 11 fs.ts function signatures
- All 4 logger functions plus style guide
- typedEntries/typedKeys signatures
- All consts.ts constant values and limits

### 2026-03-14 Targeted Validation (commands.md, utilities.md, test-infrastructure.md)

Validated against source code after significant test infrastructure and command changes (Feb 25 - Mar 14).

**commands.md:**

- Updated `init` flow: documented Dashboard shown when project CLI config exists (`detectInstallation()`)
- Added marketplace registration step before plugin installation (`claudePluginMarketplaceExists()` + `claudePluginMarketplaceAdd()`)
- Added `edit` cwd fix note (commit 093e18b)
- Updated key dependencies: added `detectInstallation`, `deriveInstallMode`
- Fixed SUCCESS_MESSAGES count: 5 (was 6)
- Fixed INFO_MESSAGES count: 6 (was 7)
- Removed DRY_RUN_MESSAGES (object deleted from messages.ts)

**utilities.md:**

- Added `type-guards.ts` module with 4 functions: `isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`
- Fixed `execCommand` line reference: 95 (was 94)
- Fixed `MAX_CONFIG_FILE_SIZE` line reference: 145 (was 140)
- Removed `SKILLS_MATRIX_PATH` from consts paths (deleted from consts.ts)
- Fixed SUCCESS_MESSAGES count: 5 (was 6)
- Fixed INFO_MESSAGES count: 6 (was 7)
- Removed DRY_RUN_MESSAGES (object deleted from messages.ts)

**test-infrastructure.md:**

- Added `content-generators.ts` to directory structure (5 renderer functions)
- Added `test-fs-utils.ts` to directory structure
- Added `mock-data/` directory with 6 files: mock-agents, mock-categories, mock-matrices, mock-skills, mock-sources, mock-stacks
- Removed phantom `configs/` and `matrix/` from fixtures subdirectories (do not exist)
- Added `compile.test.ts` to command tests listing
- Added `install-mode.integration.test.ts` to integration tests
- Added 22 new co-located test files: configuration/**tests**/ (8 files), mode-migrator, matrix-provider, skill-resolution, config-generator, config-merger, versioning, local-installer, use-section-scroll, etc.
- Expanded factory functions table: 6 -> 35 factories documented
- Added Content Generators section
- Added Canonical Test Fixtures section (SKILLS registry table, TEST_CATEGORIES table)
- Added Mock Data Module section documenting all 6 mock-data files
- Removed `OUTPUT_STRINGS` section (deleted from helpers.ts)
- Removed `TEST_AVAILABLE_SKILLS` reference (deleted)
- Added complete E2E test infrastructure section: config, directory structure (65 E2E files across 5 directories), helpers, E2E file split history
- Added `setupFiles: ["./vitest.setup.ts"]` to config section
- Updated `buildSourceResult` signature: now takes 3 params (matrix, sourcePath, overrides)

### 2026-03-14 Architecture Overview Validation

Validated `architecture-overview.md` against current source code. Significant drift found and fixed:

- Fixed version: 0.74.10 (was 0.47.0)
- Fixed CLI_BIN_NAME line: consts.ts:27 (was :24)
- Fixed BaseCommand line: base-command.ts:12 (was :11)
- Fixed baseFlags: only `--source` (was `--dry-run, --source` -- dry-run does not exist)
- Fixed source resolution: config.ts:84-132 (was :100-148)
- Fixed source precedence: `.claude-src/config.ts` (was `config.yaml`), added global step
- Fixed install mode detection: installation.ts detectInstallation():103, detectProjectInstallation():35 (was :23-60)
- Fixed template root resolution: compiler.ts:400-434 (was :412-437)
- Fixed sanitize line range: compiler.ts:77-112 (was :77-115)
- Fixed validateSourceFormat: config.ts:291-320 with helpers to 447 (was :307-445)
- Fixed file size limits: consts.ts:143-145 (was :137-140)
- Fixed exec.ts validation: :7-87 (was :19-86)
- Added `config-exports.ts` to directory structure
- Added `types/generated/` directory (source-types.ts, matrix.ts)
- Added `utils/type-guards.ts` (isCategory, isDomain, isAgentName, isCategoryPath)
- Added `lib/feature-flags.ts`
- Added `select-list.tsx` to common components
- Added jiti to technology stack (config loader)
- Added new sections: Generated Types (7), Matrix Provider and Skill Resolution (8), Config Writer (10)
- Updated Data Flow to include generateConfigSource() and writeScopedConfigs()
- Updated source file count: 293 (was 253)

### 2026-03-14 Configuration + Plugin System Validation

Validated `features/configuration.md` and `features/plugin-system.md` against source code after significant changes (R-11 config writer consolidation, scope-aware config splitting, global defaults).

**features/configuration.md:**

- Config files changed from `.yaml` to `.ts` (TypeScript loaded via jiti)
- Removed `ProjectSourceConfig` type (consolidated into unified `ProjectConfig` at `types/config.ts`)
- Removed `saveProjectConfig()` (replaced by `generateConfigSource()` + `writeFile()`)
- Added 7 new files: `config-writer.ts`, `config-types-writer.ts`, `config-loader.ts`, `define-config.ts`, `default-categories.ts`, `default-rules.ts`, `default-stacks.ts`
- Added scope-aware config splitting section (`splitConfigByScope`, `writeScopedConfigs`)
- Added config-types writer section (narrowed unions, global/project split)
- Added `loadGlobalSourceConfig()` function
- Updated source resolution to 5-tier precedence (flag > env > project > global > default)
- Updated all line references: `resolveSource()` :84, `resolveAgentsSource()` :142, `resolveBranding()` :216, `validateSourceFormat()` :291, `loadProjectSourceConfig()` :28, `ResolvedConfig` :18-22
- Updated branding example from YAML to TypeScript
- Added `SkillConfig` and `AgentScopeConfig` type sections
- Updated schema table (removed `projectSourceConfigValidationSchema`)

**features/plugin-system.md:**

- Updated `installLocal()` line: :634 (was :511)
- Updated `installPluginConfig()` line: :542 (was :435)
- Added scope-aware installation section with `writeScopedConfigs` and helper functions table
- Updated detection section: now uses `detectProjectInstallation()` :35 + `detectGlobalInstallation()` :68 fallback
- Added `deriveInstallMode()` documentation
- Added `getInstallationOrThrow()` reference
- Updated marketplace command descriptions (scope param is `"project" | "user"`)
- Added `readPluginManifest()` and `getPluginSkillIds()` to plugin-finder table
- Added `validateAllPlugins()` and `printPluginValidationResult()` to validation section
- Added `getPluginDir()` to manifest generation table
- `validatePlugin()` line verified correct at :350

### 2026-03-14 Targeted Validation (skills-and-matrix.md, wizard-flow.md)

Validated against source code after significant matrix and wizard changes (Feb 25 - Mar 14).

**features/skills-and-matrix.md:**

- Replaced `skills-matrix.yaml` references with `skill-categories.ts` + `skill-rules.ts` (YAML config replaced by TS config)
- Removed phantom `SkillsMatrixConfig` type and `skillAliases` field (no longer exist)
- Removed phantom `displayNameToId` references -- alias resolution now uses `slugMap`
- Added new `matrix-provider.ts` to file structure table with all 6 exported functions
- Added new `skill-resolution.ts` to file structure table with `mergeMatrixWithSkills` and `synthesizeCategory`
- Documented R-08 unified `resolveRelationships()` -- 5 separate resolve functions consolidated into single internal function
- Moved `mergeMatrixWithSkills()` from matrix-loader.ts to skill-resolution.ts (line 97)
- Updated `validateSelection()` line: 424 (was 512)
- Added line numbers for all matrix-resolver.ts functions with current values
- Added 4 new exported validation helpers: `validateConflicts` (282), `validateRequirements` (305), `validateExclusivity` (341), `validateRecommendations` (372)
- Updated `resolveAlias()` description -- no longer does display name lookup, just validates ID exists in matrix
- Updated data flow: step 3 now loads categories + rules separately (was single matrix YAML)
- Updated data flow: step 5 now documents slug-based resolution and auto-synthesized categories
- Updated data flow: step 7 now documents BUILT_IN_MATRIX optimization for default source
- Updated SourceLoadResult line range: 61-67 (was 59-65)
- Fixed metadata.yaml example: removed `compatibleWith`, `requires`, `conflictsWith` (now in skill-rules.ts); added `slug`, `displayName` fields
- Added `rawMetadataSchema` reference (was `skillMetadataLoaderSchema`)
- Added `migrateLocalSkillScope()` to source-switcher.ts documentation
- Added `compatibleWith` relationship type to table
- Updated `source-switcher.ts` description to include scope migration
- Added full Matrix Provider section with all functions
- Added full Skill Resolution section with merge logic description

**features/wizard-flow.md:**

- Updated `WizardResultV2` type: `selectedSkills` renamed to `skills: SkillConfig[]`, removed `sourceSelections` and `installMode`, added `agentConfigs: AgentScopeConfig[]`
- Updated `WizardResultV2` line range: 30-43 (was 27-42)
- Updated `WizardProps`: removed `matrix` prop (uses matrix-provider), removed `initialInstallMode`, added `installedSkillConfigs`, `installedAgentConfigs`, `lockedSkillIds`, `lockedAgentNames`, `startupMessages`
- Added note that wizard does NOT receive matrix prop
- Added 2 new hooks: `useRowScroll`, `useSectionScroll`
- Updated build step logic functions: removed `getSkillDisplayLabel()`, added `computeOptionState()` and `buildCategoriesForDomain()`
- Added new wizard components: `menu-item.tsx`, `selection-card.tsx`, `step-refine.tsx`, `stack-selection.tsx`
- Updated component tree: added `StackSelection` and `DomainSelection` under StepStack
- Fixed `BUILT_IN_DOMAIN_ORDER`: now includes "shared" -- `["web", "api", "mobile", "cli", "shared"]` at line 191 (was 179)
- Fixed default scratch domains: `["web", "api", "mobile"]` (all except CLI and shared)
- Updated keyboard navigation section: centralized hotkeys in `hotkeys.ts`, documented per-step hotkeys (S for scope, D for labels, L/P for sources)
- Updated edit mode flow: added steps for `installedSkillConfigs`, `installedAgentConfigs`, `lockedSkillIds`/`lockedAgentNames`
- Updated `populateFromSkillIds()` signature in edit mode flow (now takes optional `savedConfigs`)
- Updated framework-first filtering: `compatibleWith` now resolved from `skill-rules.ts` not per-skill metadata

### 2026-03-14 Targeted Validation (store-map.md, component-patterns.md)

Validated against source code after wizard store and component changes (Feb 25 - Mar 14).

**store-map.md:**

- Fixed useWizardStore line: 494 (was 431)
- Fixed WizardState shape range: 149-439 (was 157-408)
- Removed deleted state fields: `installMode`, `sourceSelections`
- Added 7 new state fields: `_stackDomainSelections`, `skillConfigs`, `focusedSkillId`, `agentConfigs`, `focusedAgentId`, `lockedSkillIds`, `lockedAgentNames`
- Removed deleted actions: `toggleExpertMode`, `toggleInstallMode`
- Added 8 new actions: `deriveInstallMode`, `toggleSkillScope`, `setSkillSource`, `setFocusedSkillId`, `toggleAgentScope`, `setFocusedAgentId`, `setAllSourcesLocal`, `setAllSourcesPlugin`
- Fixed `populateFromSkillIds` signature (now takes `savedConfigs?` instead of `skills, categories`)
- Fixed `populateFromStack` signature (no `categories` param -- uses matrix internally)
- Documented `selectStack()` reset behavior (resets all selections on stack change)
- Fixed `buildSourceRows` return type: `() => { skillId, options }[]` (was `(matrix) => SourceRow[]`)
- Fixed `createInitialState()` line range: 468-492 (was 410-429)
- Fixed DOMAIN_AGENTS line range: 54-65 (was 37-48)
- Updated store consumer list: removed 4 files that no longer import store directly (step-confirm, step-settings, wizard-tabs, use-build-step-props); added 2 new consumers (stack-selection, domain-selection)
- Updated initial state to include all 17 fields

**component-patterns.md:**

- Fixed hooks count: 16 (was 14). Added `use-row-scroll.ts`, `use-section-scroll.ts`
- Fixed wizard files count: 23 (was 22). Added `hotkeys.ts`
- Added new `select-list.tsx` in common/ with type signatures
- Added `CHEVRON_SPACER` to UI_SYMBOLS table
- Fixed `CLI_COLORS` line range: 178-188 (was 166-176)
- Fixed `UI_SYMBOLS` line range: 100-113 (was 95-108)
- Fixed `SCROLL_VIEWPORT` line range: 150-161 (was 145-156)
- Fixed CategoryOption type: removed phantom `label` field, added `scope?: "project" | "global"`
- Added `use-framework-filtering.ts` to CategoryOption/CategoryRow consumers list
- Fixed `build-step-logic.ts` path: `src/cli/lib/wizard/build-step-logic.ts`
- Added Hotkeys Registry section documenting `hotkeys.ts`
- Added Section Scroll and Row Scroll subsections

### 2026-02-25 Adversarial Audit

Full validation of all 12 documentation files against actual source code. Errors found and fixed:

**type-system.md:**

- Fixed Category count: 38 (was 46)
- Fixed SkillDisplayName count: 82 (was 118)
- Removed phantom "SkillRef" alias (does not exist; actual type is PluginSkillRef)
- Added missing types: CompileConfig, CompileContext, ValidationResult, ExtractedSkillMetadata
- Added wizard/UI types table from matrix.ts
- Added metadataValidationSchema to Zod schemas table

**utilities.md:**

- Fixed ERROR_MESSAGES count: 10 (was 8)
- Fixed STATUS_MESSAGES count: 12 (was 10)
- Fixed INFO_MESSAGES count: 7 (was 6)
- Added STANDARD_FILES and STANDARD_DIRS reference section

**features/plugin-system.md:**

- Fixed installLocal() location: local-installer.ts:511 (was installation.ts)
- Fixed installPluginConfig() location: local-installer.ts:435 (was installation.ts)
- Added re-export note from index.ts
- Added validatePlugin line reference (:359)
- Added dual getPluginManifestPath note

**test-infrastructure.md:**

- Added note that test/fixtures/ directory does NOT exist at project root
- Added KEY_Y and KEY_N to keyboard constants table
- Added delay() utility
- Added missing co-located test files (installation, plugin tests)

**component-patterns.md:**

- Fixed hooks count: 14 (was 15)
- Fixed wizard files count: 22 (was 20)
- Added DISABLED symbol to UI_SYMBOLS table
- Fixed CategoryOption type: uses `state: OptionState` pattern (not individual booleans)
- Added OptionState and CategoryRow types
- Updated consumers list (added build-step-logic.ts)

**commands.md:**

- Fixed installIndividualPlugins reference (private method on Init class, not from installation module)
- Fixed key dependencies (installation/index.ts, not installation.ts)
- Added message count references

**store-map.md:**

- Added 14 missing actions: setApproach, selectStack, setStackAction, nextDomain, prevDomain, toggleShowLabels, toggleExpertMode, toggleInstallMode, setSourceSelection, setCustomizeSources, toggleSettings, toggleHelp, setEnabledSources
- Reorganized actions into clear categories (Navigation, Approach/Stack, Selection, UI Toggles, Source Management, Population, Reset)

**features/skills-and-matrix.md:**

- Added missing `sourcePath: string` field to SourceLoadResult type
- Added line references to SourceLoadResult type definition
- Added line numbers for all matrix-resolver.ts functions
- Added undocumented utility functions: getAvailableSkills, getSkillsByCategory

## Notes for Next Session

- Iter 87 re-audit (final sweep of 100-iter Ralph run): all 5 invariants still PASS, no drift introduced by iters 51-86. Dashboard 0-stale across all 32 rows, Reference-table dates uniformly 2026-04-21, disk frontmatter 41/41 at 2026-04-21.
- Iter 50 Map Self-Consistency Audit: 8 Reference-table `Last Validated` dates bumped 2026-04-13→2026-04-21 (cross-surface sync with dashboard + frontmatter). All 5 invariants now clean.
- Root-cause enum violation flagged (unfixed): `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` uses `scope-boundary-preserved` — convention-keeper must either widen the enum in `TEMPLATE.md` or reclassify the finding.
- All 41 reference files on disk accounted for. 32 tracked in Reference tables; 9 pointer files tracked only in directory diagram.
- Next full regeneration of `findings-impact-report.md` triggered when Incremental Updates accumulate >10 entries (per documentation-bible rule). Reset iter 40.
- Next map self-consistency audit: per bible cadence (decennial iteration cadence, i.e., every ~10 iters) — target iter 60.
- store-map.md next validation due 2026-04-28 (7-day cadence). All other docs due 2026-05-05 (14-day cadence).

## Ralph Docs Sweep (Apr 2026)

Canonical loop-postmortem: [`agent-findings/2026-04-21-iter99-ralph-docs-sweep-summary.md`](./agent-findings/2026-04-21-iter99-ralph-docs-sweep-summary.md) — 100-iter Ralph run across `.ai-docs/` + docs/guides + CLAUDE.md.

### Agent Routing Pattern

- **codex-keeper**: default for `.ai-docs/reference/` descriptive docs.
- **general-purpose**: `standards/` normative docs + `CLAUDE.md` + `MEMORY.md`.
- **cli-tester**: when a docs change requires verifying code claims against source.

### Residual Drifts (for next maintainer)

- Sweep totals (2026-04-21 window, post residual-cleanup + d224 close-out + micro-sync + file-path-canon close-out + 0.42.1 orphan-release filing + eject-success-log filing + pre-impl-design-docs-historical filing): 90 resolved / 7 partial / 10 open / 2 superseded (total 109 on disk). `state-transitions.md` and `commands.md` dual-home splits both RESOLVED (canonical is now the subdir file in each case, root is the pointer). `agent-suggestions/` status model codified in `agent-suggestions/README.md` (iter 98 follow-up) — RESOLVED. `file-path-canonicalization-mixed-forms` closed out by new `documentation-bible.md § File-Path Conventions in Docs`.
- Residual-cleanup 2026-04-21: 8 findings lacking explicit `status:` classified (4 resolved, 1 superseded, 3 open). See `reference/findings-impact-report.md` "By Status" block for the list. Most recent close-out: `d217-test-prereq-already-satisfied` → `standards/e2e/test-data.md § Before Extending Fixtures`.
- 17 non-closed findings tracked in `agent-findings/` (7 partial + 10 open) — triage + close-out pass needed.
