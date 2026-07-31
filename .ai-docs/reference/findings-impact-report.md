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
last_validated: 2026-07-30
---

<!--
  2026-07-30 (fifth edit of the day): SINGLE-DIMENSION AMENDMENT — status only. NOT a regeneration.
  The 36 findings that carried no `status:` were backfilled by opening each one and verifying its
  claim against current source, so the status rollup is now measured rather than inferred.

  AMENDED (these four places, and nothing else):
  - "By Status": table rebuilt from the 135 declared statuses; INFERENCE BOUNDARY callout RETIRED
    (kept in place, marked retired, with the before/after delta so the retirement is auditable).
  - "By Severity": the high-severity-by-status sentence only. The severity TABLE (26/78/31) is
    untouched — the backfill moves how high-severity findings are classified, not how many exist.
  - "By Type": `enforcement-gap` retired as a `type` (1 -> 0), `standard-gap` 31 -> 32, after fixing
    the schema violation on `e2e-spec-files-accumulate-unused-imports-unenforced`. A `Δ this
    amendment` column was added so the regeneration's 121-basis deltas stay readable and unedited.
  - Priority Actions: item 16 struck as CLOSED (it tracked that `type: enforcement-gap`).

  NOT REGENERATED — every other rollup below is carried forward verbatim from the 2026-07-30 full
  regeneration and still describes the same 135-file snapshot: root cause, category, domain, the
  severity table itself, By Date, per-reference-doc impact, per-source-file churn, systemic patterns
  A..U, supersession links, and the Original Snapshot. None of them keys on `status:`, so the
  backfill cannot have moved them. Do NOT read this amendment as a fresh basis: the snapshot
  boundary is still 135 files, re-verified on disk at the close of this pass.

  What the backfill found, in one line: the "defaults to open" convention mis-classified 30 of the
  36 files — 21 were `partial` and 9 were already `resolved`. See "By Status".

  2026-07-30 (fourth edit of the day): FULL REGENERATION over 135 findings — the regeneration the
  previous pass recorded as OWED. Both triggers were live: "Incremental Updates" held 12 entries
  (bible threshold is >10) and the 0.145.0 + 0.146.0 release bundle had shipped.

  What changed this pass:
  - Every primary table rebuilt from scratch over all 135 finding files on disk (was pinned at 121).
    Snapshot boundary re-pinned at 135; the 121-basis figures are retired, not carried forward.
  - All 12 Incremental entries promoted into the primary tables; the section is reset to empty.
  - Systemic patterns: A..S carry forward (all classes survived and gained members). E, O, Q and S
    had their STATEMENTS widened by this window's findings — see each pattern's "widened" note.
    T is promoted from the "Candidate Pattern T" stub the previous pass staged for this decision;
    it now has 5 instances, not the 1 it had when staged. U is newly named.
  - Status rollup now qualified with its inference boundary in-table: 36 of 135 findings carry no
    `status:` field. Previous passes reported 39 of 125 — BOTH numbers moved (see the callout).
    [SUPERSEDED by the fifth edit above: the 36 were backfilled and the figure is now 0.]
  - Per-source-file churn deltas are measured against the 121-basis table, which is the only prior
    basis; two files enter the table for the first time.
  - The findings directory's FIRST link-integrity scan over `supersedes:` / `superseded_by:` /
    `blocked_by:` — 7 defects found, 7 fixed, 0 remaining. Two dangling targets traced to findings
    DELETED from disk contrary to README.md's never-move rule (see "Findings removed from disk").
  - Concurrency: the pass ran against 133 files and closed at 135 (a sibling agent filed 2 mid-pass).
    Every table was re-derived over 135 rather than pinning a stale snapshot — see the boundary
    callout. The count moved twice today; re-count at the END of a regeneration, not the start.
  - The 2026-03-28 "Original Snapshot" is preserved verbatim below, per the bible.

  Prior edits this day, preserved for lineage: (1) full regeneration over 121 files, patterns
  lettered A..S, Incremental reset; (2) an in-place correction of one falsified present-tense claim
  in Pattern N (`deregisterProjectPath` "filters with `path.resolve`" — shipped fixed the same day);
  (3) an append-only reconciliation pass that added 8 findings to Incremental, struck Priority
  Actions 3 and 18 as CLOSED after source verification, and recorded this regeneration as owed.
-->

# Agent Findings Impact Report

**Generated:** 2026-03-28 (original); regenerations 2026-04-21 (Ralph iter 92), 2026-07-23 (95 findings), 2026-07-30 (121 findings); **last full regeneration 2026-07-30 (second of the day)** — rebuilt from all 135 finding files on disk.
**Total Findings Catalogued:** 135 (excluding `README.md` and `TEMPLATE.md`; no `audits/` subdirectory exists — every finding lives at the directory root).
**Date Range:** 2026-04-17 to 2026-07-30. Findings from 2026-03-21..2026-04-16 referenced by earlier regenerations are no longer on disk (see "Findings removed from disk" below); the rollups reflect only the 135 files present now.

> **Snapshot boundary (re-pinned 2026-07-30, full regeneration).** Every rollup, table, count and
> percentage below is derived from a snapshot of **135 finding files** (**137 `.md`** including
> `README.md` and `TEMPLATE.md`), counted on disk at the close of this pass.
>
> **This supersedes the 121-file basis.** The previous pass pinned 121 and carried a 12-file delta
> in "Incremental Updates"; all 12 have been promoted into the tables and the section is reset.
> There is now **one basis, not two** — the split-basis reconciliation warning that stood here is
> retired. Arithmetic for the next validator: 121 previously pinned + 4 (doc-hygiene tail) + 8
> (bug-fix + reconciliation tail) + 2 (see below) = **135**, matching disk.
>
> **Concurrency note — the count moved twice during this pass.** The regeneration was run against
> 133 files; a concurrent agent filed 2 more (`eslint-disable-directives-were-never-verified`,
> `no-default-exports-rule-collides-with-oclif`) before it closed. Rather than pin a stale snapshot
> and open an Incremental block on the same day the previous one was cleared, **every table was
> re-derived over 135** and the totals below are the post-arrival figures. Both new findings were
> classified and are members of Patterns E and M/U respectively. This is the third consecutive
> regeneration to race a concurrent sweep, which is the standing hazard
> `findings-rollup-has-no-snapshot-rule-and-schema-drifted` was filed about: **re-count at the end
> of the pass, not the start.**
>
> **Do not partially fold.** If findings accumulate again, log them in "Incremental Updates" and
> regenerate the whole set at the next trigger — never promote a subset, which produces a report
> whose totals match no snapshot at all.

> **Regeneration Policy:** Per `documentation-bible.md` ("Findings Impact Report Regeneration"), the report is fully regenerated when "Incremental Updates" exceeds ~10 entries, when the oldest un-aggregated finding is >30 days old, or when a major release bundle ships. **Two of the three triggers fired here:** 12 un-aggregated entries (>10), and the 0.145.0 + 0.146.0 bundle shipped. Both are now discharged.

---

## Rollups (2026-07-30 regeneration — 135 findings on disk)

Counts are computed directly from the YAML frontmatter of the 135 finding files (`root_cause`, `severity`, `category`, `domain`, `status`, `date`). `README.md` and `TEMPLATE.md` are excluded.

### By Status

> **INFERENCE BOUNDARY — RETIRED 2026-07-30 (status-backfill pass).** This table was, until this
> amendment, 51% inference: 36 of 135 findings carried no `status:` field and were read as `open`
> per `README.md`'s "defaults to open" convention. **All 36 have been backfilled by opening each
> finding and verifying its claim against current source**, so the callout no longer applies and is
> retired rather than reworded. **Every one of the 135 findings now declares a `status:`. The
> `Inferred` column is zero by measurement, not by assumption, and every figure in this table is a
> count.** The column is kept so the retirement stays legible to the next validator; delete it only
> if a future pass confirms the directory has held at zero.

| Status       | Explicit | Inferred (no `status:`) | Total | Share |
| ------------ | -------- | ----------------------- | ----- | ----- |
| `open`       | 39       | 0                       | 39    | 28.9% |
| `partial`    | 50       | 0                       | 50    | 37.0% |
| `resolved`   | 39       | 0                       | 39    | 28.9% |
| `superseded` | 7        | 0                       | 7     | 5.2%  |
| **Total**    | **135**  | **0**                   | 135   | 100%  |

- `partial` = one side landed and the other did not (`partial_note:` present, describing which).
- `resolved` = anti-pattern fixed or standard fully updated (`resolved_by:` present).
- `superseded` = replaced by a later finding covering the same files and root cause (`superseded_by:` present, paired with `status: superseded`).

**Open vs closed:** closed (`resolved` + `superseded`) = **46 (34.1%)**. Not closed (`open` + `partial`) = **89 (65.9%)**. Both figures are now exact; the previous "closed is understated by an unknown amount" caveat is discharged.

**What the backfill moved, and what that says about the old inference:**

| Status       | Before (34 explicit + 36 inferred) | After      | Δ       |
| ------------ | ---------------------------------- | ---------- | ------- |
| `open`       | 70                                 | 39         | **−31** |
| `partial`    | 29                                 | 50         | **+21** |
| `resolved`   | 29                                 | 39         | **+10** |
| `superseded` | 7                                  | 7          | =       |
| **Closed**   | 36 (26.7%)                         | 46 (34.1%) | **+10** |

The "defaults to open" convention was wrong about **30 of the 36** files. Of the status-less set:
**21 were `partial`** (the dominant outcome by a wide margin), **9 were `resolved`**, and only **6
were genuinely `open`**. The convention did not merely under-report closure — it mis-classified
five sixths of the set, because a finding whose fix shipped is indistinguishable from one nobody
touched when neither declares a status. `resolved` also gained a 10th file from a concurrent
sibling pass (`no-default-exports-rule-collides-with-oclif`, flipped `open` -> `resolved` while
this amendment was being written).

**The 21 `partial` files share one shape, and it is the inverse of the enum's definition.**
`README.md` defines `partial` as "docs/standards side landed, code-side fix still pending". Nearly
every backfilled `partial` is the opposite: **the code fix shipped and the Proposed Standard was
never written.** Each carries a `partial_note:` saying so explicitly. The enum has no value for
"fixed but not generalised", so `partial` is being used for both directions and the direction is
recoverable only from the note. Widening the enum (or documenting the second direction in
`TEMPLATE.md`) is a decision for `agent-findings/TEMPLATE.md`'s owner — recorded here, not taken.
The substantive reading: **this codebase fixes its defects and does not codify the lessons**, which
is the mechanism behind Patterns E and M recurring.

**The prior "39 of 125" figure is retired everywhere.** It was already stale twice over (the
directory grew to 135; a link-repair pass had moved the numerator to 36). The backfill makes it
moot: the numerator is now **0**. `TEMPLATE.md` and `standards/documentation-bible.md` were both
corrected in this pass — the latter's "Rollups must declare inference" rule keeps its point but no
longer cites a live gap as its example.

### Supersession links (all verified against disk this pass)

Every `supersedes:` / `superseded_by:` / `blocked_by:` value in the directory was checked for
target existence and mirrored pairing. **7 defects were found and 7 fixed; 0 remain.**

| Superseded (older)                                                 | Superseded by (newer)                                                       | Repair made this pass                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------- |
| `2026-04-21-d233-projects-normalization-asymmetry`                 | `2026-07-25-register-deregister-path-normalization-asymmetry`               | none — was already correct                  |
| `2026-07-17-d227-same-scope-active-tombstone-duplicate`            | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | added missing mirror on the newer file      |
| `2026-07-18-scope-guards-read-stale-hydration-snapshot`            | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | none — was already correct                  |
| `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable` | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | added missing mirror on the newer file      |
| `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse`   | `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code`                 | added missing `status: superseded`          |
| `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code`        | `2026-07-18-d233-agent-collapse-fix-in-toggleagent-action-not-helper`       | added missing mirror + `status: superseded` |
| `2026-07-20-project-builder-derived-slug-hid-wrong-category`       | `2026-07-20-fixture-category-literals-unvalidated-against-categories-union` | added missing mirror + `status: superseded` |

`2026-07-30-d277-...` supersedes **three** findings, so its `supersedes:` key is now a YAML list.
The three `status: superseded` additions are what moved the status-less count from 39 to 36.

### Findings removed from disk (link-integrity casualties)

Two `supersedes:` / `blocked_by:` targets did not exist. **Neither was a typo and neither was a
rename** — both files provably existed and were later deleted, contrary to `README.md`'s "Never move
files" rule ("moving a file breaks every such link silently"). Both dangling keys were removed and
what they asserted is recorded in the referring file's body, so the lineage survives the link.

| Dangling target                                           | Referred to by                                                                              | Proof it existed                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-04-20-new-agent-toggle-defaults-global-scope.md`    | `2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack` (`supersedes:`) | Listed in `changelogs/0.137.0.md` -> Findings; `2026-04-21-agent-findings-frontmatter-drift-iter45` names it in `affected_files:` and records _adding frontmatter to it_ |
| `2026-07-18-propagation-stack-reconcile-gap-reachable.md` | `2026-07-18-propagation-skips-agent-recompile` (`blocked_by:`)                              | Listed in `changelogs/0.141.8.md` -> Findings as `(resolved)`, directly above the referring finding's own entry                                                          |

The 0.141.8 changelog names a **third** removed file,
`2026-07-18-propagation-selected-agents-not-pruned-on-agent-removal.md (resolved)`, which nothing
links to — so this is a **batch deletion of a release's resolved findings**, not two isolated
slips. That also explains the missing 2026-03-21..2026-04-16 range in the Date Range line above.
This is the mechanism behind **Pattern U**.

### By Date (filing day)

| Date       | Count | Theme of the batch                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | 1     | Shared config/stack parser duplication                                                                                                                                                                                                                                                                                                                        |
| 2026-04-18 | 1     | `mergeConfigs` drops `projects` field                                                                                                                                                                                                                                                                                                                         |
| 2026-04-20 | 2     | D-217 installMode dead plumbing; newly-toggled agent defaults to global scope                                                                                                                                                                                                                                                                                 |
| 2026-04-21 | 13    | Dual-scope/tombstone cluster, E2E keypress rule, findings-system self-governance                                                                                                                                                                                                                                                                              |
| 2026-04-22 | 6     | Edit-mode scope-awareness audit, tombstone/checkbox, mode-migrator, plugin-uninstall asymmetry                                                                                                                                                                                                                                                                |
| 2026-07-09 | 1     | Marketplace schema stricter-than-contract                                                                                                                                                                                                                                                                                                                     |
| 2026-07-17 | 4     | D-167 task-ID lint guard, D-227 preselect/tombstone reachability, E2E helper test home                                                                                                                                                                                                                                                                        |
| 2026-07-18 | 10    | Dual-scope collapse doc-vs-code, propagation recompile, scope guards read stale hydration snapshot                                                                                                                                                                                                                                                            |
| 2026-07-19 | 11    | Config-as-text vs structural load, union-sweep type safety, Ink post-mount race, parser dedup                                                                                                                                                                                                                                                                 |
| 2026-07-20 | 46    | Pass-8 shared-infra adoption sweep: fixtures, config normalizers, scope authority, renderer determinism, toast + page-object hygiene                                                                                                                                                                                                                          |
| 2026-07-24 | 6     | D-226 sandbox-HOME default + D-219 launcher sugar; D-271 short-terminal clipping and the source-grid overflow affordance                                                                                                                                                                                                                                      |
| 2026-07-25 | 1     | `registerProjectPath` / `deregisterProjectPath` path-normalization asymmetry                                                                                                                                                                                                                                                                                  |
| 2026-07-29 | 11    | **0.146.0 cluster:** duplicate-implementation drift (sources tab vs confirm step, two config write paths, exclusivity in a keypress handler) + the live-CLI QA sweep + frame-observability findings                                                                                                                                                           |
| 2026-07-30 | 22    | **Largest single day after 07-20.** Five sub-batches: D-277 tombstone provenance + unreachable surfaces; nine doc-hygiene findings on claims whose falsification has no trigger; seven accompanying the day's five bug fixes; four on the findings/doc pipeline's own self-governance; two on the ESLint toolchain, filed concurrently with this regeneration |
| **Total**  | 135   |                                                                                                                                                                                                                                                                                                                                                               |

2026-07-30 is the second-largest filing day on record and the **first** dominated by findings about
the documentation and findings systems themselves rather than about product code — the direct cause
of Patterns S and U below.

### By Root Cause

| Root Cause                  | Count | Δ vs 121-basis | Canonical remedy                                   |
| --------------------------- | ----- | -------------- | -------------------------------------------------- |
| `convention-undocumented`   | 47    | +1             | Add rule to standards doc; cite in CLAUDE.md       |
| `rule-not-specific-enough`  | 40    | +6             | Tighten rule wording with enumerated cases         |
| `enforcement-gap`           | 25    | +5             | Add lint/typecheck/coverage-as-policy requirement  |
| `missing-rule`              | 16    | +2             | Author a new rule from scratch                     |
| `scope-discipline-deferred` | 5     | =              | Knowingly left in-scope; track as TODO             |
| `rule-not-visible`          | 2     | =              | Cross-link rule from other docs; move to prominent |
| **Total**                   | 135   | +14            |                                                    |

`rule-not-specific-enough` grew fastest (+6). Every one of the six is a case where a rule existed
and was followed, and the defect landed anyway because the rule did not say which of two readings
applied — the mechanism behind the widened Pattern E. `enforcement-gap` (+5) is the runner-up and
is dominated by rules that are written down but have no runnable checker (Patterns M and U).

### By Severity

| Severity  | Count | Share |
| --------- | ----- | ----- |
| high      | 26    | 19.3% |
| medium    | 78    | 57.8% |
| low       | 31    | 23.0% |
| **Total** | 135   | 100%  |

**High severity by status (re-measured 2026-07-30, status-backfill pass):** `resolved` 10, `partial` 11, `open` 4, `superseded` 1. **15 of 26 high-severity findings are still not closed**, down from the 18 this section previously reported. The severity totals themselves (26 / 78 / 31) are unchanged and carry forward from the regeneration — only this by-status breakdown moved.

This was flagged as "the single figure in the report most distorted by the missing-`status:` gap", and it was: the old reading was `open` 3 explicit + 10 inferred = 13. Measured, only **4** are open. Of the 10 previously inferred, **6 are `partial`** (the fix shipped, the standard was never written) and **3 are `resolved`**; just 1 was genuinely open. The distortion ran in the direction the callout warned about — inference systematically over-reported `open` at the severity level that matters most.

### By Category

| Category     | Count | Δ   |
| ------------ | ----- | --- |
| testing      | 57    | +3  |
| architecture | 56    | +9  |
| dry          | 11    | +2  |
| typescript   | 9     | =   |
| complexity   | 2     | =   |
| **Total**    | 135   | +14 |

### By Domain

| Domain    | Count | Δ   |
| --------- | ----- | --- |
| cli       | 61    | +6  |
| e2e       | 57    | +3  |
| shared    | 9     | +2  |
| infra     | 5     | +2  |
| web       | 3     | +1  |
| **Total** | 135   | +14 |

`cli` remains ahead of `e2e` and extended its lead: the 0.145.0/0.146.0 cluster is production-code drift found by running the CLI, not test-harness drift. `shared` and `infra` both grew this window for the first time in months — those are the doc-pipeline and tooling findings (Patterns S, U).

### By Type

| Type                  | Count | Δ vs 121-basis | Δ this amendment |
| --------------------- | ----- | -------------- | ---------------- |
| `convention-drift`    | 36    | +4             | =                |
| `anti-pattern`        | 33    | =              | =                |
| `standard-gap`        | 32    | +8             | **+1**           |
| `missing-standard`    | 18    | +2             | =                |
| `architectural-drift` | 11    | =              | =                |
| `audit`               | 5     | =              | =                |
| ~~`enforcement-gap`~~ | 0     | =              | **−1 (retired)** |
| **Total**             | 135   | +14            | =                |

> **Schema defect — FIXED 2026-07-30 (status-backfill pass).** `enforcement-gap` appeared as BOTH a
> `type` value (1 file) and a `root_cause` value (25 files), which `TEMPLATE.md` rule 2 makes
> explicitly invalid since the two enums are disjoint. The single offender,
> `2026-07-20-e2e-spec-files-accumulate-unused-imports-unenforced.md`, is reclassified to
> `type: standard-gap`; its `root_cause: enforcement-gap` is correct and unchanged.
>
> **Why this was mechanical after all, not a judgement about what the author observed.** The corpus
> already answers it. Both sibling findings in the identical class — a hygiene rule with no runnable
> checker, `root_cause: enforcement-gap` — use `type: standard-gap`:
> `2026-07-17-d167-task-id-recurrence-no-lint-guard` and, filed the same day as this amendment and
> about ESLint specifically, `2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run`. The
> author's own diagnosis is preserved intact in `root_cause:`; what was repaired is that they wrote
> it into the WHAT field as well as the WHY field. No `type` value is now used in both enums, and
> `Δ this amendment` is the only column that moves — the 121-basis deltas are carried forward from
> the regeneration untouched.

---

## Per-Reference-Doc Impact (2026-07-30)

Reference docs named in the `affected_files:` / `standards_docs:` / `related:` frontmatter of the 135 findings. This is the report's core cross-reference: a reference doc appearing here has at least one finding touching the behavior it documents and should be re-validated per `documentation-bible.md` "Re-Validation Triggers."

> **Basis change from the 121-file table:** counts are now **distinct findings**, not raw frontmatter
> references. A finding naming the same doc in both `affected_files:` and `standards_docs:` (common —
> the tombstone and guard docs are usually named twice) previously counted twice. Deltas against the
> old column would therefore be meaningless and are deliberately omitted from this table.

| Reference Doc                             | Findings | Priority          | Why                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference/concepts/tombstone-pattern.md` | 11       | HIGH              | D-277 removed most tombstone producers; D-279 added derived masks (Pattern K/O)                                                                                                                                                                                     |
| `reference/testing/e2e-infrastructure.md` | 7        | HIGH              | Scope-and-HOME model, frame observability, and **three verified count/name drifts still open** (Patterns N, Q, S)                                                                                                                                                   |
| `reference/config/config-writer.md`       | 6        | HIGH              | Three negative exhaustiveness claims went stale (Pattern S); path normalization now a code guarantee                                                                                                                                                                |
| `reference/concepts/scope-system.md`      | 6        | HIGH              | Global immutability from project scope is now absolute (Pattern A)                                                                                                                                                                                                  |
| `reference/features/plugin-system.md`     | 3        | ~~HIGH~~ RESOLVED | Was "not validated since v0.144.1 while `local-installer.ts` changed the most". **Rewritten and re-stamped `last_validated: 2026-07-30`** (Cross-Scope Reconciliation, v2 plugin registry, Settings Integration, `ScopedConfigWriteResult`). No longer a drift risk |
| `reference/features/operations-layer.md`  | 3        | MED               | New `recompile-project-agents` operation; `ConfigWriteResult` dead field removed                                                                                                                                                                                    |
| `reference/commands/index.md` (CANONICAL) | 3        | HIGH              | **New to this table.** `uninstall` corrupt-project-config path (`loadUninstallConfig`) undocumented; the doc advertised a removed `--all` flag across two releases                                                                                                  |
| `reference/wizard/store-map.md`           | 2        | HIGH              | `setSkillSource` removed; `skillSlotKey` added; removal semantics inverted                                                                                                                                                                                          |
| `reference/concepts/guard-pattern.md`     | 2        | MED               | The `s`-only dual-scope contract and the init-mode bypass removal                                                                                                                                                                                                   |
| `reference/features/skills-and-matrix.md` | 2        | MED               | Known Limitation #6 falsified by the 38-category fix (Pattern S)                                                                                                                                                                                                    |
| `reference/component-patterns.md`         | 2        | MED               | `ScrollAffordance` is a new shared component (Pattern P); column-geometry assertions (Pattern Q)                                                                                                                                                                    |
| `reference/commands.md` (pointer)         | 2        | LOW               | Pointer to `commands/index.md`; measured on link integrity only, not content                                                                                                                                                                                        |
| `reference/config/config-merger.md`       | 1        | HIGH              | Source-identity contract still unlanded (Pattern B)                                                                                                                                                                                                                 |
| `reference/commands/edit.md`              | 1        | HIGH              | Scope-authority gate (Pattern A)                                                                                                                                                                                                                                    |
| `reference/types/operations-types.md`     | 1        | LOW               | `ConfigWriteResult.globalConfigPath` — closed, deletion now stated positively                                                                                                                                                                                       |
| `reference/types/zod-schemas.md`          | 1        | LOW               | Owns the schema count that the index doc pinned stale (Pattern O/S)                                                                                                                                                                                                 |
| `reference/type-system.md`                | 1        | LOW               | Union-sweep carve-outs (Pattern I)                                                                                                                                                                                                                                  |
| `reference/testing/infrastructure.md`     | 1        | LOW               |                                                                                                                                                                                                                                                                     |
| `reference/wizard/state-transitions.md`   | 1        | LOW               | Known-bug note for `toggleAgent` scope defaulting                                                                                                                                                                                                                   |
| `reference/store-map.md` (pointer)        | 1        | LOW               | Pointer; link integrity only                                                                                                                                                                                                                                        |
| `reference/findings-impact-report.md`     | 1        | —                 | This file; named by the snapshot-rule finding                                                                                                                                                                                                                       |

> **Scope note:** most of these 135 findings name `.ai-docs/standards/**` docs (convention-keeper's domain), not reference docs. Top standards targets, for prioritization only: `standards/e2e/anti-patterns.md` (37), `standards/e2e/README.md` (25), `CLAUDE.md` (15), `standards/clean-code-standards.md` (11), `standards/documentation-bible.md` (10 — **doubled this window**, see Patterns S and U), `standards/e2e/page-objects.md` (9), `DOCUMENTATION_MAP.md` (6), `standards/e2e/test-data.md` (4), `standards/e2e/assertions.md` (4), `agent-findings/TEMPLATE.md` (4), `agent-findings/README.md` (4), `standards/commit-protocol.md` (3). Out of scope for this reference-doc report, but they drive the same underlying patterns.

## Per-Source-File Churn (2026-07-30)

Source / E2E files most frequently named in `affected_files:` (>= 5 findings). High churn signals which reference doc needs the tightest validation cadence. **Deltas are against the 121-file basis** (the immediately preceding table), so they measure this window's 12 findings only.

| Source File                                                    | Findings | Δ vs 121-basis | Reference doc(s) to re-validate                                                        |
| -------------------------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------------- |
| `src/cli/lib/installation/local-installer.ts`                  | 23       | +1             | `features/plugin-system.md`, `config/config-writer.md`, `features/operations-layer.md` |
| `src/cli/stores/wizard-store.ts`                               | 23       | +1             | `wizard/store-map.md`, `concepts/tombstone-pattern.md`, `concepts/guard-pattern.md`    |
| `src/cli/commands/edit.tsx`                                    | 10       | =              | `commands/edit.md`                                                                     |
| `e2e/pages/steps/build-step.ts`                                | 9        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/helpers/test-utils.ts`                                    | 9        | +1             | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/wizards/edit-wizard.ts`                             | 7        | +1             | `testing/e2e-infrastructure.md`                                                        |
| `src/cli/lib/configuration/config-merger.ts`                   | 6        | +1             | `config/config-merger.md`                                                              |
| `src/cli/lib/configuration/config-writer.ts`                   | 6        | =              | `config/config-writer.md`                                                              |
| `src/cli/commands/init.tsx`                                    | 6        | =              | `commands/index.md`                                                                    |
| `e2e/fixtures/dual-scope-helpers.ts`                           | 6        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/fixtures/expected-values.ts`                              | 6        | =              | `testing/e2e-infrastructure.md`                                                        |
| `src/cli/commands/uninstall.tsx`                               | 5        | **new**        | `commands/index.md`                                                                    |
| `src/cli/components/wizard/source-grid.tsx`                    | 5        | **new**        | `component-patterns.md`                                                                |
| `src/cli/lib/installation/mode-migrator.ts`                    | 5        | =              | `features/plugin-system.md`                                                            |
| `e2e/pages/base-step.ts`                                       | 5        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/steps/agents-step.ts`                               | 5        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/steps/confirm-step.ts`                              | 5        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/helpers/terminal-session.ts`                              | 5        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts` | 5        | =              | `testing/e2e-infrastructure.md`                                                        |

**`local-installer.ts` and `wizard-store.ts` remain tied at the top (23 each).** The installer absorbed the D-279 reconciliation, the D-274 global-uninstall pruning and the D-240 propagation return channel; it is the mechanical reason `documentation-bible.md` gained an `installation/**` hook row this window. Every reference doc mapped to either file is a HIGH-priority revalidation target.

**Two files enter the table for the first time**, and both are this window's bug-fix work rather than long-running churn: `uninstall.tsx` (corrupt-config posture, `--all` removal, cwd/symlink resolution) and `source-grid.tsx` (the D-271/overflow-affordance cluster, Pattern P). Neither has a dedicated reference doc; they are covered by `commands/index.md` and `component-patterns.md` respectively.

**Near-threshold watch list (4 findings each, one short of the table):** `e2e/pages/steps/sources-step.ts`, `e2e/pages/wizards/init-wizard.ts`, `e2e/fixtures/project-builder.ts`, `src/cli/lib/wizard/scope-diff.ts`, `src/cli/lib/__tests__/content-generators.ts`, and four `e2e/lifecycle/` specs. `scope-diff.ts` is the one to watch — it is the home of `skillSlotKey`, the extracted primitive at the centre of Pattern O.

## Systemic Patterns (2026-07-30 regeneration)

Consolidated from all **135** on-disk findings. **A..S carry forward with their letters intact** — every class survived this window and none merged away. **T** is promoted from the "Candidate Pattern T" stub the previous pass staged explicitly for this decision. **U** is newly named. The pre-2026-07-23 numbered patterns are preserved in the Original Snapshot below.

Each pattern lists representative finding slugs (date prefixes omitted for brevity), the shared root cause, and the remedy plus the reference doc that should absorb it. A finding may appear under more than one pattern; that is deliberate and long-standing (e.g. `empty-union-string-fallback` sits under B, I and T), because the patterns classify _mechanisms_, not files.

### What this window changed, and what it did not

The 2026-07-30 batch was the largest ever filed about the **documentation and findings systems themselves**. Two judgements had to be made about it, and both are recorded here rather than left implicit:

**1. The doc-hygiene findings STRENGTHEN Pattern O rather than warranting a new pattern.** Pattern O ("one rule, two implementations that drift, and only one enforces") was named from product code in the 0.146.0 cluster. Two of this window's findings — `doc-index-pins-counts-that-only-the-indexed-doc-revalidates` and `e2e-doc-inventories-pin-counts-and-names-nothing-verifies` — have the identical mechanism expressed in prose: a value written in two places, with a revalidation trigger on only one of them. The first states it outright: _"The count is duplicated with no back-link in either direction."_

The decisive evidence is the **remedy that actually landed**. `documentation-bible.md` did not gain a doc-specific rule; it gained _"A Count Lives in Exactly One Document"_ plus an ownership registry — which is Pattern O's remedy verbatim (extract the value to a single owner, reference it from everywhere else). A pattern whose fix is another pattern's fix is not a separate pattern. **Pattern O's statement is therefore widened to drop the implicit "in code" qualifier**, and the two findings are added as members. Splitting them into a new letter would have produced two patterns with one shared remedy and guaranteed that a future reader fixed only one of them.

**2. Two classes DID warrant lettering, for opposite reasons.**

- **Pattern T** was already staged. The previous pass wrote: _"Do not letter this until the regeneration; it currently has one instance."_ This is that regeneration, and re-reading the corpus against its definition found **5** instances, not 1. The staging instruction is discharged.
- **Pattern U** is genuinely new and could not have been seen before this pass, because it took a link-integrity scan to surface it. Its distinguishing mechanism is not "the findings system drifts" (that is the historical numbered Pattern 11) but the sharper and more troubling **"the self-audit is structurally incapable of detecting the defect class it is aimed at"** — an arithmetic check that passes on a mis-enumerated set, a duplicate key that cannot fire across dates, and a link check nobody ever ran.

**What was NOT done:** no pattern was merged, renamed or retired, and no letter was reused. Patterns E, O, Q and S had their _statements_ widened by new members without changing their identity; each carries a "**Widened 2026-07-30**" note naming what moved and why.

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

### Pattern E — Two rules both apply and point opposite ways; nothing states which wins

_**Widened 2026-07-30.** Was "shared-fixture/constant DRY adoption boundary unclear". Three new members showed the mechanism is not specific to fixtures — it is **rule collision without a precedence rule**, and it now reaches export rules and even the findings pipeline's own prescriptions. The fixture cases remain the largest cluster; the name now describes the mechanism they share._

- Findings: `e2e-shared-fixture-literals-scope-boundary`, `shared-fixture-const-vs-file-local-const-adoption-boundary`, `e2e-skill-constant-adoption-boundary`, `fixture-inlining-trades-one-local-helper-for-ten-copies`, `readonly-const-fixtures-unadoptable-at-mutable-matcher-options`, `shared-mutable-constants-and-false-dry`, `matcher-augmentation-inline-shape-defeats-drift-guard`, `step-text-constants-must-mirror-asserted-string-not-rendered-string`, `shared-config-stack-parser`, **`e2e-helper-extraction-threshold-unstated-for-file-writers`** (new), **`shared-identity-key-helpers-conflict-with-the-no-single-file-export-rule`** (new), **`finding-proposed-standard-contradicted-a-never-rule`** (new), **`no-default-exports-rule-collides-with-oclif`** (new).
- Root cause: two rules are each individually correct, both apply to the same code, and they prescribe opposite actions — with nothing stating which takes precedence. An agent following either one in good faith produces a defect, and review cannot fault it. Instances:

  | Collision                                                          | The two rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Shared fixture vs file-local const                                 | "Always use shared fixtures" vs "keep a file-local const when it is file-scoped"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | Extraction threshold for a file writer                             | Three thresholds bear on `writeCorruptConfig` (2+ for assertions, 3+ for `ProjectBuilder` setup, none for `test-utils.ts`) and **none decides**; the literal reading permits a second local copy                                                                                                                                                                                                                                                                                                                                                                                          |
  | Export the shared invariant vs never export a single-file constant | `agentSlotKey` has exactly one consumer — its own file — so CLAUDE.md's "NEVER export constants only used within the same file" would strip the export and **restore the D-278 precondition Pattern O's fix removed**                                                                                                                                                                                                                                                                                                                                                                     |
  | A finding's prescription vs a NEVER rule                           | A Proposed Standard prescribed a two-tier resolution fallback, which CLAUDE.md bans. Implementing it verbatim would have put the banned pattern **inside the helper written to unify the rule** — and looked justified in review, citing an approved finding                                                                                                                                                                                                                                                                                                                              |
  | A project rule vs a framework contract _(new)_                     | `CLAUDE.md` and `clean-code-standards.md` § 13.2 both state "Named exports only (no default exports)" without qualification. oclif discovers commands by importing the module's **default** export, and resolves `hooks.init` the same way; Vitest's config and `globalSetup` are default-export contracts too. Measured: **19 default exports, every one mandatory, zero discretionary.** The rule is 100% obeyed wherever the author has a choice and 0% obeyable where they do not — so as written it is simply false, and an agent reading it literally would break command discovery |

- The last row is the sharpest: **diagnosis and prescription inside a finding carry equal apparent weight, but only the diagnosis is grounded in observed code.** A Proposed Standard is an untested suggestion; it must be checked against the NEVER rules before adoption, exactly like new code.
- Also in this class, unchanged: `as const` readonly tuples don't fit mutable matcher option bags; `STEP_TEXT` ambiguity (asserted vs rendered string).
- Remedy: state precedence explicitly wherever two rules can both apply — fixtures/test-data rules in `standards/e2e/README.md`, an export-rule carve-out for extracted invariants in `standards/clean-code-standards.md`, and a "check the Proposed Standard against the NEVER list before adopting" step in `agent-findings/README.md`. Widen matcher option element types to `readonly string[]`. Reference: `testing/e2e-infrastructure.md`.

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

- Findings: `d167-task-id-recurrence-no-lint-guard`, `task-ids-in-test-names-sweep-needed`, `agent-findings-frontmatter-drift-iter45`, `todo-id-collisions-in-completed`, `changelog-0.42.1-orphan-release-file`, `ralph76-memory-md-stale-phase-entries`, `r73-atomicity-bible-drift`, `e2e-helper-tests-have-no-runnable-home`, `e2e-spec-files-accumulate-unused-imports-unenforced`, `command-delegation-must-carry-caller-intent`, `migration-path-missing-marketplace-precondition`, `plugin-uninstall-bare-id-asymmetry-with-install`, `mode-migrator-single-scope-uninstall-cwd-ambiguity`, `marketplace-schema-name-laxer-than-claude-code`, `parsefrontmatter-crlf-and-invalid-yaml-null`, **`eslint-precommit-gate-has-no-config-and-cannot-run`** (new), **`eslint-disable-directives-were-never-verified`** (new).
- Root cause: rules exist only in prose (task-IDs in test names, findings frontmatter, unused imports, delegation caller-intent, marketplace precondition before `claudePluginInstall`), so drift recurs; two parsers diverge on the same on-disk shape.
- **The new member inverts the pattern and is worse than it looks.** Here the gate is not merely absent from prose — it is _written down as enforced_ and cannot run. `CLAUDE.md`'s Pre-Commit Checklist gates on "No ESLint errors", but the repo has no `eslint.config.*`, no `eslint` dependency, no `node_modules/.bin/eslint` and no `lint` script; `lint-staged` runs `prettier --write` only. **An unrunnable gate is always reported as passed**, so every commit has recorded a clean lint result that was never computed. Several other remedies in this very pattern ("add an ESLint rule for task-IDs in test names") were prescribed against infrastructure that does not exist — so those remedies were never actionable either.
- **The second new member is the proof, and it arrived while this regeneration was being written.** Standing ESLint up for the first time read the four `// eslint-disable-next-line` directives in `src/` — and **two of the four do not do what their author believed**: one `no-var` directive is misplaced and suppresses nothing, and one names `react-hooks/exhaustive-deps`, a rule that is not installed. A suppression comment is a claim about a checker's behaviour; when the checker never runs, the claim is never tested, and the codebase accumulates directives that are _load-bearing in the author's mind and inert in fact_. **This generalises beyond ESLint: any suppression, ignore-file or waiver is unverified until the tool that honours it actually runs.**
- Remedy: add ESLint/typecheck gates (`e2e/tsconfig.json`, task-ID lint rule, `typecheck:scripts`) — **but establish the ESLint installation first**, since three of this pattern's proposed remedies presuppose it; one extractor per on-disk concern; document plugin/migration marketplace preconditions and bare-id/qualified-id symmetry. Standing rule: **a checklist item that names a tool must be runnable, or the checklist is recording an outcome nobody measured.**

### Pattern N — E2E launcher must match the scope the test edits

_Promoted from the 2026-07-24 incremental block._

- Findings: `d226-stepA-breaks-43-miscategorized-tests`, `d226-phase1-launcher-sugar-and-multiphase-home`, `d226-phase2-wave1-source-switch-lock-and-global-stack`, `d226-phase2-wave2-uninstall-cwd-only-launcher`.
- Root cause: once the sandbox HOME stopped collapsing onto the project, a default (all-global) install lands under `wizard.globalHome`, not `projectDir`. Assertions, source toggles, and cwd-resolving follow-ups (`cc uninstall`, `claude plugin install`) that assumed the collapse silently diverge — locked read-only rows, scope-split config files and no-op follow-ups rather than loud ENOENTs.
- Remedy: choose `launchInProject` (assert-only) vs `launchInGlobal` (mutates global content or runs a cwd-resolving follow-up) by what the test does. Landed as "Choosing the Wizard Launcher by Scope" in `standards/e2e/anti-patterns.md`. Reference: `testing/e2e-infrastructure.md`.
- Reinforces Patterns A and K.

### Pattern O — One rule, two implementations: the copies drift and only one enforces

**The defining pattern of the 0.146.0 release.** Every defect in that release lived in the gap between two implementations of the same idea, and the suite was green throughout — because each implementation was individually correct and separately tested.

_**Widened 2026-07-30 — the pattern is not code-specific.** Two doc-hygiene findings from this window have the identical mechanism expressed in prose, and the remedy that landed for them (`documentation-bible.md` -> "A Count Lives in Exactly One Document" + an ownership registry) is this pattern's remedy verbatim. The "in code" qualifier is dropped. See "What this window changed" above for the full reasoning._

- Findings: `sources-tab-session-diff-diverged-from-computescopediff`, `project-config-written-by-two-paths-only-one-reconciled`, `category-exclusivity-enforced-only-in-a-keypress-handler`, `derived-mask-and-user-tombstone-are-indistinguishable` (superseded by `d277-global-immutability-collapses-tombstone-provenance`), `register-deregister-path-normalization-asymmetry`, `d233-agent-collapse-fix-in-toggleagent-action-not-helper`, `two-config-normalisers-sorted-vs-order-preserving`, `config-merge-functions-disagree-on-source-identity`, `empty-union-string-fallback-disables-generated-type-safety`, **`doc-index-pins-counts-that-only-the-indexed-doc-revalidates`** (new, prose), **`e2e-doc-inventories-pin-counts-and-names-nothing-verifies`** (new, prose).
- **The prose instances, stated in the pattern's own terms:**

  | Element              | In code                                                           | In documentation                                                         |
  | -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
  | The duplicated thing | A rule / invariant / normalization                                | A count or a symbol-name inventory                                       |
  | The copies           | Two functions, two call sites                                     | The index doc and the doc it indexes                                     |
  | Only one enforces    | One call site reconciles; the other writes raw                    | Only the owning doc re-derives the count during validation               |
  | Why it survives      | Each implementation is individually correct and separately tested | Each doc individually passes its own validation pass                     |
  | The landed fix       | Extract the primitive; call it from every site                    | One owner per count + an ownership registry; everyone else references it |

  The `zod-schemas` count is the worked example: the true value (35) sat corrected in `zod-schemas.md` from 2026-07-23 while `documentation-bible.md` said 39 — surviving a full documentation sweep and two targeted syncs, because validation is organised per document and nothing told the agent that a second file quoted the same number. **The index is read _before_ the doc it describes, so the stale copy is the authoritative one for every agent that never opens the owning doc.**

- Four shapes it takes:

  | Shape                                                  | Instance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **Two implementations, divergent keys**                | `computeScopeDiff` keyed on the `(id, scope)` slot; the Sources-tab collectors keyed on the id alone, with an extra `isEditingFromGlobalScope` gate on the removal half. The same session change read differently on two screens the user sees back to back.                                                                                                                                                                                                                                          |
  | **N enforcement points, 1 enforced**                   | Two call sites write a project `config.ts` with the global inlined; only `propagateGlobalChangesToProjects` reconciled. The project's own save path handed `splitConfigByScope` output straight to the writer.                                                                                                                                                                                                                                                                                        |
  | **Invariant enforced at the UI layer only**            | `CategoryDefinition.exclusive` was enforced solely in `toggleTechnology`, a keypress handler. Every non-keypress write path bypassed it, so a config could hold two live skills in an exclusive category while `doctor` reported clean and `validate` exited 0.                                                                                                                                                                                                                                       |
  | **A value pinned in two documents** _(new 2026-07-30)_ | The Zod schema count lived in both `documentation-bible.md` (index annotation) and `zod-schemas.md` (owning doc). Only the owning doc re-derives it during validation, so the index annotation was stale for a week across three passes. Same shape for the E2E doc set: per-directory spec totals, `STEP_TEXT` membership and three page-object method tables drifted together, including two **inverted** `HOME=cwd` claims that would have instructed an agent to reintroduce the bug D-226 fixed. |

- Root cause: no rule requires that a duplicated invariant be extracted, and no rule requires enumerating a rule's enforcement points before declaring it enforced. A **paired asymmetry** variant was `registerProjectPath` storing `fs.realpathSync` while `deregisterProjectPath` filtered with `path.resolve` — agreeing on Linux, silently diverging where a symlink sits above the project root. **Closed 2026-07-30** by the same remedy shape: the rule was extracted into one module-private `normalizeProjectPath` helper called by both ends and by the current-project skip in `propagateGlobalChangesToProjects`. See `config/config-writer.md` ("Path normalization").
- Remedy (as landed in 0.146.0): extract the shared primitive (`skillSlotKey` for the diff key; `reconcileProjectSplitAgainstGlobal` + `buildProjectCollisionTest` for the write-time invariant) and call it from every site. Standing rule to codify: **a data invariant belongs at the write boundary, not in an input handler** — the handler may additionally enforce it for UX, but must not be the only enforcer.
- Remedy for the prose instances (landed 2026-07-30 in `documentation-bible.md`): **"A Count Lives in Exactly One Document"** plus an ownership registry naming the single owner of each frequently-duplicated count. Every other doc references the owner by name instead of restating the number. The generalised rule across both halves of the pattern is one sentence: **name one owner for the value, and make every other site reference the owner rather than hold a copy.**
- **Caution for anyone applying the remedy:** extracting the shared primitive can collide with `CLAUDE.md`'s "NEVER export constants only used within the same file" — see Pattern E, where `agentSlotKey` has exactly one consumer and the literal reading of the export rule would restore the precondition this pattern's fix removed. Also live: SLOT keys (`scope-diff.ts`, keyed `(id, scope)`) and MERGE keys (`config-merger.ts`, keyed `(id, scope, excluded)`) look identical and **must not be unified** — a false application of this pattern.
- Reference docs: `architecture-overview.md` (sections 12, 16), `boundary-map.md` (section 3.8), `config/config-writer.md`, `concepts/tombstone-pattern.md`, `wizard/store-map.md`, `types/zod-schemas.md` (owns the count), `testing/e2e-infrastructure.md`.

### Pattern P — Content clipped with no affordance and no way to reach it

- Findings: `source-grid-clips-without-affordance-or-scroll-access`, `d271-edit-wizard-unnavigable-at-short-terminal`.
- Root cause: the Sources grid diverged from the two established overflow patterns (`info-panel.tsx`, `step-confirm.tsx`) in three compounding ways — no `ScrollAffordance` sibling, viewport scroll welded to focus (so an inert trailing row was permanently unreachable, including the D-257 pending-removal row), and a missing `overflow: "hidden"` on the outer clip box. At short terminal heights the launcher's own sentinel was overdrawn, so even the E2E harness could not enter the step.
- Remedy: `ScrollAffordance` (`components/wizard/scroll-affordance.tsx`) is now the shared, sibling-rendered hint; `useSectionScroll` measures the content box and separates focus scrolling from overscroll via `scrollBy`. Standing rule to codify: **a clipping viewport must render an affordance as a SIBLING (never inside itself) and must expose a focus-independent scroll channel.** Reference: `component-patterns.md`, `architecture-overview.md` (directory structure).

### Pattern Q — The assertion cannot see the property under test: the frame does not carry it, or the assertion vocabulary cannot express it

_**Widened 2026-07-30.** Was "The rendered frame does not carry the signal the assertion needs". `component-tests-assert-text-presence-never-column-position` is the mirror-image case: the frame **does** carry the signal, and the assertion vocabulary in use has no way to name it. Both produce the same outcome — a suite that cannot fail on the property it was written to protect — so they belong together._

- Findings: `e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk`, `e2e-getoutput-is-not-a-frame-accumulator`, `ink-component-colour-assertions-need-forced-chalk-level`, `toast-assertions-must-use-cursor-anchored-raw-waits`, `transient-toast-assertions-need-append-only-raw-surface`, **`component-tests-assert-text-presence-never-column-position`** (new).
- **The vocabulary half (new).** A 56-test suite covering the exact component and layout branch could not see an 11-column header misalignment, because every assertion is presence (`toContain`) or relative order. In a fixed-width terminal layout the contract is **where** each string starts, and no assertion in the suite could express a column. `clean-code-standards.md` rule 6.17 offers `toContain` and snapshotting as interchangeable options — so the cheaper one wins by default, and the cheaper one is the one that is blind to geometry. Two inline snapshots landed; the proposed rule 6.17a is **unadopted**.
- Root cause: the harness's observation surface silently lacks the property the test reasons about. Grid cell focus is expressed only via `borderColor`, which `NO_COLOR=1` strips — the frame is byte-identical before and after an arrow key. `getOutput()` reads xterm's processed buffer, and Ink repaints in place, so a frame that fits the viewport **overwrites** its predecessor rather than scrolling into scrollback; it is not a frame accumulator. Ink colourises through `chalk`, which auto-disables on vitest's non-TTY stdout, making colour assertions not merely hard but unobservable.
- Consequence: an agent that writes the naive assertion sees it fail and is one step from silently weakening it — which is how Pattern G (vacuous assertions) gets seeded.
- Remedy: dead reckoning over a grid is banned; walk closed-loop against a signal that IS observable (the focused category header Tabs observably). Document which helper accumulates frames and which does not. Force the chalk level explicitly for colour assertions. Standards: `standards/e2e/assertions.md`, `standards/e2e/anti-patterns.md`. Reference: `testing/e2e-infrastructure.md`.

### Pattern R — The scenario has no reachable surface, or the fixture cannot establish the state its name claims

_**Widened 2026-07-30** with a third failure mode: the layer under test cannot observe the input the spec varies._

- Findings: `domain-deselect-has-no-reachable-ui-surface-in-edit`, `dual-scope-collapse-unreachable-for-eject-pairs`, `per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row`, `sourceById-collapse-unreachable-in-production`, `d227-preselect-fix-not-e2e-reachable`, `init-dashboard-plugin-test-vacuous-project-scope`, `d228-e2e-vacuous-pass-via-home-edit`, **`symlinked-project-path-bugs-are-unreachable-from-e2e`** (new).
- Three failure modes, one root cause — **nobody traced the surfaces before writing the spec**:
  1. **Unreachable scenario.** `toggleDomain` has only two callers, and `cc edit` hydrates at the build step with `history: []`, so the DOMAINS step cannot be reached from an edit session. A requested "toggle a domain off during a project edit" spec would have had to invent a flow no user can perform. Similarly, `ProjectBuilder.editable({ skills, globalSkills })` pins both halves of a pair to `source: "eject"`, and the overwrite guard refuses the scope press for an eject-over-eject pair with no tombstone — so the dual-scope collapse spec fails on a swallowed keystroke, not on the assertion under test.
  2. **Fixture establishes a different state than the name claims.** A unit spec named "project-scoped skill, previously installed as project" built its live state with `toggleTechnology` (which defaults `scope: "global"`) against a `buildSkillConfigs` snapshot (which defaults `scope: "project"`) — a project→global migration. Its incidental row-count assertion had been pinning id-keyed behaviour for a shape nobody listed.
  3. **The layer under test cannot observe the varied input** _(new 2026-07-30)_. `uninstall.tsx` takes its directory from `process.cwd()` = `getcwd(2)`, which returns the kernel's canonical path with symlinks **already resolved**, and ignores `$PWD`. A symlinked-sandbox E2E spec therefore **cannot fail** — it passes identically against bug and fix. The coverage was correctly written one layer down, in `local-installer.test.ts`. This generalises to any input the OS canonicalizes before the process observes it, and is the most dangerous of the three because the spec looks precisely targeted at the bug.
- Remedy: trace the caller graph and the fixture's emitted shape **before** writing the spec; when a scenario is unreachable, record it as invariant hardening rather than inventing a flow. For mode 3, ask which layer first _observes_ the varied input and test there. Standards: `standards/e2e/README.md`, `standards/e2e/test-data.md`, `standards/e2e/anti-patterns.md`. Reference: `testing/e2e-infrastructure.md`.

### Pattern S — Reference-doc claims whose falsification has no trigger

_Named in the 121-basis regeneration with six members; **widened 2026-07-30 to eight**. Every member was filed on 2026-07-30 — this is the youngest and fastest-growing pattern in the report, and the only one whose members are exclusively about documentation._

- Findings: `negative-exhaustiveness-claims-in-reference-docs-go-stale-silently`, `known-limitations-not-revisited-when-a-fix-narrows-them`, `flag-removal-not-covered-by-doc-touching-hook-table`, `doc-index-pins-counts-that-only-the-indexed-doc-revalidates`, `doc-hook-table-has-no-row-for-the-installer`, `configwriteresult-globalconfigpath-declared-never-populated`, **`docs-recorded-a-deletion-that-was-later-reverted`** (new), **`e2e-doc-inventories-pin-counts-and-names-nothing-verifies`** (new).
- **Boundary against Pattern O.** Two members (`doc-index-pins-counts...`, `e2e-doc-inventories...`) are cross-listed under O. They belong in both: O explains **why the claim went stale** (the value is duplicated and only one copy is revalidated), S explains **why nobody noticed** (no trigger fires on falsification). Fixing only one half leaves the other live.
- Root cause: the documentation-bible's "Doc-Touching Changes" hook table enumerates change shapes (command added/deleted/renamed, component added/deleted/renamed, new trust-boundary op) but **not** the shapes that actually caused this window's drift:

  | Change shape that went uncaught                         | Example                                                                                                                                                                                                                                                 |
  | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Flag removed from a surviving command                   | `uninstall --all` deleted in 0.145.0; `boundary-map.md` kept listing it                                                                                                                                                                                 |
  | A fix that NARROWS a Known Limitation                   | The 38-category fix falsified Limitation #6 in `skills-and-matrix.md` ("drift is masked instead of failing loudly")                                                                                                                                     |
  | A negative exhaustiveness claim                         | Three "nothing else in the codebase does X" claims in `config-writer.md`; a positive claim about a named function survives a refactor, a negative one about the whole codebase does not                                                                 |
  | A count pinned in an INDEX doc                          | `documentation-bible.md` says "39 Zod schemas"; the real count has been 35 since 2026-07-23 — only `zod-schemas.md` revalidates it                                                                                                                      |
  | Heavy source churn with no doc row                      | `plugin-system.md` unvalidated since v0.144.1 while `local-installer.ts` gained the whole reconciliation layer                                                                                                                                          |
  | Declared-but-never-populated field                      | `ConfigWriteResult.globalConfigPath` — optional, so `tsc` is happy and a future reader silently gets `undefined`                                                                                                                                        |
  | A recorded deletion that was later **reverted** _(new)_ | A doc recorded a deletion; a later commit restored the thing. The doc now describes an absence that no longer holds — a negative claim that decays silently, exactly like a stale Known Limitation                                                      |
  | An inventory of names, not just counts _(new)_          | The E2E doc set pinned per-directory spec totals, `STEP_TEXT` membership and three page-object method tables. All drifted together, including two **inverted** `HOME=cwd` claims that would have instructed an agent to reintroduce the bug D-226 fixed |

- Remedy: widen the hook table with rows for flag changes, Known-Limitation narrowing, and high-churn source files; ban unqualified negative exhaustiveness claims (scope them to a named function or add a grep the validator can re-run); make an index doc's numeric annotations point at the indexed doc rather than restating them. Standards: `standards/documentation-bible.md` (convention-keeper's domain). Reference docs to re-validate first: `config/config-writer.md`, `features/plugin-system.md`, `features/skills-and-matrix.md`, `types/operations-types.md`.

### Pattern T — The type system cannot police this change, so nothing enumerates the sites that need auditing

_**Promoted 2026-07-30.** The previous pass staged this as "Candidate Pattern T" with the explicit instruction: "Do not letter this until the regeneration; it currently has one instance." This is that regeneration. Re-reading the corpus against the definition found **five** instances, three of which were previously filed under Pattern I. The staging instruction is discharged._

- Findings: `configloaderror-call-sites-lack-a-declared-posture`, `configwriteresult-globalconfigpath-declared-never-populated`, `empty-union-string-fallback-disables-generated-type-safety`, `untypechecked-scripts-hid-phantom-tags-and-invalid-skillids` (also I), `as-const-satisfies-on-object-with-getter-widens-return` (also I).
- Root cause: a change alters a **contract** without altering any **type** that `tsc` checks. The compiler stays green, so the usual "let the type error find the call sites" strategy produces an empty list — and nothing else enumerates them either. The defect surfaces only at runtime, in the one path nobody thought about.

  | Blind spot                              | Instance                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
  | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Sentinel-returning -> throwing          | D-273 changed `loadProjectConfigFromDir` from returning a sentinel to throwing, so each of ~15 call sites had to choose abort-or-degrade. One was missed: `detectUninstallTarget` used `.then()` inside `Promise.all` with no `.catch`, so `uninstall` died exactly when the config was corrupt — contradicting a comment two functions away in the same file. **An awaited `.then()` chain inside `Promise.all` hides a throw as effectively as a missing `try`.** |
  | Optional field, never populated         | `ConfigWriteResult.globalConfigPath` was declared `?: string` and never assigned. Optional means `tsc` is happy, a reader reasonably assumes the operation reports the path, and a future caller gets `undefined` with no error. Precedent: `InstallationInfo.version`, removed in 0.145.0 after rendering as `agents-inc vplugin`.                                                                                                                                 |
  | Absorbing element in a union            | `formatUnion` emitted the literal `"string"` for an empty install where `never` was correct. `string` is the **absorbing** element of a union, not the identity: `SkillId = GlobalSkillId \| "web-framework-react"` collapsed back to `string`, silently disabling the entire purpose of the generated types. Fires on an ordinary project-scope install.                                                                                                           |
  | Directory outside the typecheck project | `scripts/` was never type-checked, hiding phantom tags and invalid `SkillId`s.                                                                                                                                                                                                                                                                                                                                                                                      |
  | Inference widened by a getter           | `as const satisfies` on an object containing a getter widens the inferred return type, defeating the narrowing the annotation was added to obtain.                                                                                                                                                                                                                                                                                                                  |

- **The contrast that makes the remedy obvious:** D-240 added `propagatedProjects: string[]` as a **required** field on the same result type, precisely so every branch of `writeScopedConfigs` has to answer for it — and both branches do. Required fields recruit the compiler as the enumerator; optional fields decline it.
- Remedy: when a contract changes in a way `tsc` cannot see, **enumerate the call sites by hand and record the posture chosen at each** — the enumeration is the deliverable, not the fix. Prefer required fields over optional ones on result types. Prefer `never` over `string` as a union identity. Keep every directory inside a typecheck project. Standards: `CLAUDE.md`, `standards/clean-code-standards.md`. Reference: `commands/index.md`, `types/operations-types.md`, `type-system.md`.

### Pattern U — The self-audit is structurally incapable of detecting the defect class it is aimed at

_**New 2026-07-30.** Distinct from the historical numbered Pattern 11 ("findings-system self-governance drift"), which observed **that** the pipeline drifts. This pattern names **why the checks do not catch it**: each check is individually well-formed and passes, while being the wrong shape to detect the defect it targets. Surfaced by this pass's link-integrity scan, which had never been run._

- Findings: `index-audit-arithmetic-passed-while-pointer-set-was-misnamed`, `sibling-finding-left-open-when-its-duplicate-was-resolved`, `findings-rollup-has-no-snapshot-rule-and-schema-drifted`, `finding-proposed-standard-contradicted-a-never-rule` (also E), plus the two dangling links and three one-sided supersession pairs this pass repaired (see "Supersession links" and "Findings removed from disk" above).

  | The check                                                            | Why it cannot fire                                                                                                                                                                                                                                                                                                                                                                         |
  | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Map Invariant 4: `41 == 32 + 9`                                      | Tests a **cardinality**, not a **membership**. Two pointer pairs are flipped (the root file is the stub), so swapping a member for its partner preserves the total. Four consecutive audits recorded PASS on a mis-enumerated set, and `commands/index.md` — the canonical commands reference — was never staleness-tracked, drifting two releases while advertising a flag oclif rejects. |
  | Duplicate detection keyed on `affected_files + root_cause + date`    | Includes `date` in the key, so **findings filed on different days can never collide by construction**. The pair it was meant to catch was three months apart _and_ differed on `root_cause` — it would have missed on two of three components.                                                                                                                                             |
  | Frontmatter pre-processing scan                                      | Ran three checks (missing frontmatter, out-of-enum `root_cause`, duplicate tuple). The three defects that actually drifted — out-of-enum `type:`, unpaired `superseded_by:`, missing `status:` — were covered by **none** of them. Widened to six checks 2026-07-30.                                                                                                                       |
  | Link integrity over `supersedes:` / `superseded_by:` / `blocked_by:` | **Did not exist.** It is a one-line existence check. Running it for the first time this pass found 2 dangling targets and 5 one-sided or unpaired links — 7 defects in a directory that had passed four self-audits.                                                                                                                                                                       |
  | Reviewing a finding's Proposed Standard                              | Nothing checks a prescription against the NEVER rules. A finding prescribed a banned two-tier fallback; implementing it verbatim would have looked justified in review, _citing an approved finding_.                                                                                                                                                                                      |

- Root cause: self-audits are written to confirm the invariant the author had in mind, and a passing check is then read as evidence the whole class is sound. **The audit's own output is not evidence** — the documentation-bible already says "Re-derive, never carry forward" for counts, and this pattern is that rule generalised from values to _checks_.
- Aggravating factor, and the reason two of this pass's defects existed at all: **findings have been deleted from disk despite `README.md`'s explicit "Never move files" rule.** `changelogs/0.137.0.md` and `changelogs/0.141.8.md` each name findings that are gone, and the 0.141.8 batch removed at least three resolved findings at once. Every cross-link into a deleted file breaks silently, which is precisely what the rule predicts.
- Remedy: (a) add link integrity as a **seventh** pre-processing defect class — target existence plus mirrored pairing for `supersedes:` / `superseded_by:`, target existence for `blocked_by:`; (b) make Map Invariant 4 verify pointer membership **by name**, not by cardinality; (c) drop `date` from the duplicate-detection key, or add a second date-independent key on `affected_files + a normalized title`; (d) require a Proposed Standard to be checked against the NEVER lists before adoption; (e) enforce the never-delete rule, and when a finding must leave the working set, keep the file and set `status:` rather than removing it. Standards: `standards/documentation-bible.md`, `agent-findings/README.md`, `agent-findings/TEMPLATE.md` (all convention-keeper's domain except `TEMPLATE.md`). Reference: this file.

## Cross-surface defects reported, not fixed

Defects found while regenerating this report that live in files **outside this pass's ownership**. Per `documentation-bible.md` -> "A Count Lives in Exactly One Document": _"If the other file is outside your ownership, record the mismatch in a file you do own — naming the stale file, its stale value, and its owner — and report it. Never leave two surfaces disagreeing unremarked."_ That is what this section is for.

| Stale surface                                                          | Stale claim                                    | State                                                                     | Owner             |
| ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| `standards/documentation-bible.md` -> "Rollups must declare inference" | "As of 2026-07-30, 39 of 125 findings omit it" | **FIXED 2026-07-30 (status-backfill pass)** — the true figure is now zero | convention-keeper |

**Both figures in that claim were stale, for different reasons** — the denominator because the directory grew (125 -> 135), the numerator because a link-repair pass added `status: superseded` to three files (39 -> 36). A validator checking only one would have concluded the other was still good. **The status backfill made the whole claim moot rather than merely outdated:** the numerator is 0, so there is no live inference to declare.

The rule the sentence carries is still correct and was kept — a rollup quoting a status distribution must state how many files were inferred. Only its example was rewritten, from a live gap to a discharged one, so the rule no longer teaches by pointing at a defect that no longer exists.

The report's earlier entry claimed this figure appeared in **two** places in `documentation-bible.md`. Re-grepped this pass: it appears in **one**. The second occurrence had already been removed when the bible gained "A Count Lives in Exactly One Document" — the count was dropped from the tree annotation at the same time the Zod-schema count was. `agent-findings/TEMPLATE.md` carried the same figure and was corrected in this pass too.

**This was itself a Pattern O instance**, which is the point: "39 of 125" was written into three files at once, only one of which was re-derived when the findings directory changed. The count-ownership registry in `documentation-bible.md` still does not list the status-distribution figure — adding a row for it (owner: `reference/findings-impact-report.md`) is the remaining preventive step, and is now the only way a future pass avoids re-scattering it.

## Priority Actions (2026-07-30 regeneration)

26 findings are `high` severity: **10 `resolved`, 1 `superseded`, 15 still open or partial** (4 `open`, 11 `partial`) — re-measured 2026-07-30 after the status backfill, down from the 18 this section previously reported. The not-closed high-severity set splits into the long-running `cli`/`architecture` scope-authority and config-merge backlog (Patterns A, B, J) and the duplicate-implementation cluster (Pattern O), of which the code side largely landed in 0.146.0 while the _standard_ remains unwritten.

> **Inference warning DISCHARGED 2026-07-30.** This section previously warned that 10 of the 13 high-severity findings counted `open` carried no `status:` and were inferred, making "18 not closed" a ceiling rather than a measurement. The backfill landed (Action 16), and the ceiling was loose: measured, **15** are not closed and only **4** are open. **This figure is now a valid burn-down baseline.** Note what the numbers say about the remaining work — 11 of the 15 are `partial`, and nearly all of those are "the code fix shipped, the standard was never written", so the high-severity backlog is now predominantly a documentation debt rather than a defect backlog.

### HIGH priority

1. **Pattern O standardisation** — the 0.146.0 code fixes landed but three findings sit `partial` awaiting the rule (`category-exclusivity-enforced-only-in-a-keypress-handler`, `project-config-written-by-two-paths-only-one-reconciled`, `sources-tab-session-diff-diverged-from-computescopediff`). Write the standing rule: **a data invariant is enforced at the write boundary; an input handler may mirror it but never own it. Before declaring a rule enforced, enumerate its enforcement points.** Then re-validate `config/config-writer.md`, `concepts/tombstone-pattern.md`, `wizard/store-map.md`.
2. **Pattern A closure (scope authority)** — **re-scoped 2026-07-30 by the status backfill: 4 findings, not 6.** `excluded-agent-tombstone-vs-selected-agents-mismatch` and `agent-toggle-checkbox-ignores-excluded-tombstone` are **`resolved`** — D-277 did not merely close "the deselect half", it removed the precondition both depended on, so neither describes a reachable state. Verified against `wizard-store.ts` and `config-generator.ts`, not inferred from the changelog. The four that remain are `edit-mode-scope-awareness-systemic-audit` (`open`; gaps 1, 2, 4, 5 and 6 all still verifiable in `edit.tsx`, `write-project-config.ts` and `stack-installer.ts`) plus three `partial` — `scope-authority-must-follow-work-performed`, `project-context-edit-lacked-scope-authority-gate` (its named "remaining half", the ungated `setSourceSelection` / `setAllSources*` setters, is still ungated) and `single-scope-path-reported-for-scope-split-artifacts`. All three partials have the same shape: **the code landed, the CLAUDE.md rule did not.** Re-validate `concepts/scope-system.md`, `commands/edit.md`.
3. ~~**`features/plugin-system.md` revalidation**~~ — **DONE 2026-07-30, superseded by the tree.** This item was written against the pinned snapshot, when the doc was still at v0.144.1 and was correctly the highest doc-drift risk. A sibling agent in the _same_ sweep rewrote the file: it now carries `last_validated: 2026-07-30` and a full Cross-Scope Reconciliation section, the claude CLI v2 registry layout, Settings Integration, `ScopedConfigWriteResult`, and a D-276 Known Limitations row. The residual work is the **standards** half of `doc-hook-table-has-no-row-for-the-installer` (status `partial`), i.e. the missing `src/cli/lib/installation/**` and `src/cli/lib/plugins/**` rows in the `documentation-bible.md` hook table — tracked at MEDIUM item 9, not here.
4. **Pattern J / migration preconditions** — **re-scoped 2026-07-30.** `plugin-uninstall-bare-id-asymmetry-with-install` is **`resolved`**: all four call sites pass a `buildMarketplacePluginRef`-qualified ref, the `claudePluginUninstallBestEffort` helper is extracted, and the proposed rule landed as `plugin-system.md` -> "Plugin Reference Formats". `migration-path-missing-marketplace-precondition` is **`partial`** — both defects are fixed and the marketplace precondition IS documented in `operations-layer.md`; what remains is its second rule, that a test asserting config state after a plugin operation must also assert the operation happened (`edit-wizard-plugin-migration.e2e.test.ts` still asserts config only). `error-swallowing-systemic-gap` remains the open one. Refresh `features/plugin-system.md`, `features/operations-layer.md`.
5. **Pattern B closure (config merge contract)** — `config-merge-functions-disagree-on-source-identity` (high, partial). A Pattern O instance predating the name. Land the source-identity contract; refresh `config/config-merger.md` + `config/config-writer.md`.
6. **QA-sweep pick-up** — `qa-sweep-working-tree-v0144` (high, open) is a 23-agent live-CLI sweep filed as a pick-up document. Most of its majors shipped in 0.145.0/0.146.0; walk the remainder and close or re-file.
7. **Pattern D sentinel** — `waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive` (high, partial). Complete the enumerated keypress coverage list; refresh `testing/e2e-infrastructure.md`.
8. **`command-delegation-must-carry-caller-intent`** — **`partial`, not open (re-measured 2026-07-30).** The mechanism shipped: `EDIT_PROJECT_SETUP_FLAG`, `DashboardOrigin`, `dashboardCommandArgv()` and the `flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)` gate are all in the tree, `commands/edit.md` documents the flag and states outright that the intent is passed rather than re-derived, and the finding's four blocked guard tests were rewritten to snapshot-and-compare exactly as it recommended. What is left is only the general rule in `standards/clean-code-standards.md` — so this is a writing task, not an engineering one.

### MEDIUM priority

9. **Pattern S hook-table widening** — six 2026-07-30 findings all name `standards/documentation-bible.md`. Add hook rows for flag changes, Known-Limitation narrowing and high-churn files; ban unqualified negative exhaustiveness claims. Highest leverage item for doc accuracy overall.
10. **Pattern K (tombstone doc-layer)** — `concepts/tombstone-pattern.md` is the most-referenced reference doc (11 references) AND its subject changed the most: D-277 removed most producers, D-279 added derived masks. Re-validate against `architecture-overview.md` section 12.
11. **Pattern Q (frame observability)** — document which E2E helpers accumulate frames, that grid focus is text-unobservable under `NO_COLOR`, and the forced-chalk-level recipe for colour assertions.
12. **Pattern R (reachability)** — add "trace the caller graph and the fixture's emitted shape before writing the spec" to `standards/e2e/README.md`; record unreachable scenarios as invariant hardening.
13. **Patterns C / E / G (E2E hygiene)** — 24 partial findings await code-side landing; re-validate `testing/e2e-infrastructure.md` once the shared-infra adoption sweep settles.
14. **Pattern L (Ink hydration race)** — add the guard-authoring rule to `concepts/guard-pattern.md`.
15. **Pattern P (overflow affordance)** — document `ScrollAffordance` and the sibling-not-child rule in `component-patterns.md`.

### LOW priority

16. ~~**Findings-system self-audit**~~ — **CLOSED 2026-07-30 (status-backfill pass), except one structural item that belongs to Pattern U.** Both schema defects that stood open after the link-repair pass are fixed: the `status:` backfill (f) and the `type: enforcement-gap` reclassification (g). Only (e) survives, and it is a checker-design problem rather than a data defect. Full re-scan on disk 2026-07-30 over all 135 findings:

    | #   | Defect                                                                                            | State                                                                                                                                                                                                |
    | --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | a   | `dual-scope-agent-s-toggle-guarded-noop-not-collapse` had `superseded_by:` and no `status:`       | **FIXED** — `status: superseded` added; its target was verified to exist                                                                                                                             |
    | b   | Dangling `supersedes:` target on `newly-toggled-agent-defaults-global-breaks-project-scope-stack` | **FIXED** — investigated, not merely deleted. The target existed and was removed from disk; the key was dropped and its full assertion recorded in the file's body. See "Findings removed from disk" |
    | c   | Dangling `blocked_by:` target on `propagation-skips-agent-recompile`                              | **FIXED — not previously known.** Found by this pass's first-ever link scan. Same cause; also doubly stale, since the changelog marks the blocker resolved                                           |
    | d   | Three one-sided supersession pairs                                                                | **FIXED** — mirrors and `status: superseded` added; `d277-...` now carries a three-element `supersedes:` list                                                                                        |
    | e   | Duplicate-detection key cannot fire across dates                                                  | **OPEN** — `date` is part of the key by construction. Pattern U, remedy (c)                                                                                                                          |
    | f   | ~~**36** files carry no `status:` field~~                                                         | **FIXED 2026-07-30** — all 36 backfilled by opening each finding and verifying its claim against current source, not by defaulting them. Every one of the 135 findings now declares a `status:`      |
    | g   | ~~`enforcement-gap` used as both a `type` and a `root_cause`~~                                    | **FIXED 2026-07-30** — reclassified to `type: standard-gap`, matching the two sibling findings in the identical class; `root_cause: enforcement-gap` kept. See the By Type callout for the reasoning |

    **Status distribution, re-derived on disk over all 135 findings:** `open` 39, `partial` 50, `resolved` 39, `superseded` 7 = **135 explicit, 0 inferred**. The documentation-bible's "declare your inference" requirement is satisfied trivially — there is none. This is the same basis as the primary rollup table above.

    **What the backfill changed about this section's own premise:** it was listed at LOW priority and described as the highest-value item in the section, and both were right for different reasons than expected. It did not just convert a 52%-inferred rollup into a measurement — it showed the inference was **wrong for 30 of the 36 files**, not merely unproven. Nine findings that every rollup counted as `open` had in fact been fully resolved, three of them `high` severity. A convention that reads an absent field as "not done" does not fail gracefully; it manufactures a backlog.

    **Remaining work:** only (e), the duplicate-detection key, plus the other structural checker fixes in Pattern U's remedy list. Newly observed while backfilling, and **not** repaired here because it is outside this pass's brief: seven further lifecycle-field pairing defects exist among files that already had a `status:` — three `status: resolved` with no `resolved_by:` (`ink-prompt-closure-lets-hang-anti-pattern`, `post-construction-conditional-mutation-on-serialized-objects`, `shared-mutable-constants-and-false-dry`), one `status: open` carrying a `resolved_by:` (`ralph76-memory-md-stale-phase-entries`), and three `status: superseded` files carrying an extra `resolved_by:` — one of them also a `partial_note:` — alongside their correct `superseded_by:` (`d227-same-scope-active-tombstone-duplicate`, `scope-guards-read-stale-hydration-snapshot`, `derived-mask-and-user-tombstone-are-indistinguishable`). The last three are arguably informative rather than defective and the question is whether `TEMPLATE.md` should sanction recording both the replacement and the underlying fix; the first four are unambiguous defects. **A pairing check is a four-line script and has never been run** — the same shape as Pattern U's link-integrity finding, which is exactly how these survived a full regeneration.

17. **`scripts/` typecheck gate** — `untypechecked-scripts-hid-phantom-tags-and-invalid-skillids` (Pattern I); add `typecheck:scripts`.
18. ~~**Dead result field** — remove `ConfigWriteResult.globalConfigPath` (`configwriteresult-globalconfigpath-declared-never-populated`); refresh `types/operations-types.md`.~~ — **CLOSED 2026-07-30, both halves verified on disk.** The field is gone from the `ConfigWriteResult` type in `src/cli/lib/operations/project/write-project-config.ts` (remaining members: `config`, `configPath`, `wasMerged`, `existingConfigPath?`, `filesWritten`, `propagatedProjects`). Every surviving `globalConfigPath` identifier in `src/` is an unrelated **local variable** inside `local-installer.ts` (`getProjectConfigPath(homeDir)`), not a result field. Three reference docs were refreshed and now state the deletion positively rather than silently dropping the row — `types/operations-types.md`, `features/operations-layer.md` and `features/configuration.md` each record that it was declared optional, never populated, never read, and was removed rather than left as dead surface a future reader could reach for.

### Added by the 2026-07-30 regeneration

Both are pipeline-integrity items rather than product work, which is why they sit outside the HIGH/MEDIUM/LOW product ranking above. **Item 19 should be treated as HIGH** — it is the mechanism that produced two of the seven link defects this pass repaired.

19. **Enforce the never-delete rule on `agent-findings/`** — **HIGH for pipeline integrity.** At least three findings named in `changelogs/0.137.0.md` and `changelogs/0.141.8.md` are absent from disk, and 0.141.8 removed a batch of that release's resolved findings at once. This is the direct cause of both dangling links repaired this pass, and it silently truncates the Date Range this report can cover — the 2026-03-21..2026-04-16 window is simply gone, which is why this report's own header can no longer account for findings its predecessors rolled up. Resolution is a frontmatter edit, never a deletion; `README.md` already says so. Add the link-integrity scan (Pattern U, remedy (a)) so the next removal is caught in the same session rather than three months later.

20. **Install ESLint or strike the gate.** `CLAUDE.md`'s Pre-Commit Checklist gates on "No ESLint errors" and nothing can run it — no config, no dependency, no binary, no script. Every commit has recorded a lint result that was never computed. This also blocks three remedies elsewhere in this report that presuppose an ESLint installation (task-ID lint rule, unused-import enforcement, the Pattern M gates), so it is a prerequisite, not a parallel task. Either land the toolchain or strike the checklist item; leaving it as-is is strictly worse than both. _An `eslint.config.js` / `package.json` change was in flight elsewhere at the time of this regeneration — verify current state before acting._

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
3. ~~**Pattern 6 closure** — surface `skipped` + sweep results in `config-writer.md` contract; document `registerProjectPath` / `deregisterProjectPath` normalization symmetry.~~ — **CLOSED 2026-07-30.** Both halves landed, and the second is now a code guarantee rather than a doc note.
   - _Normalization symmetry (the part this action named):_ closed in **code**, not just documented. `normalizeProjectPath()` — module-private in `src/cli/lib/installation/local-installer.ts`, wrapping `fs.realpathSync` — is called by `registerProjectPath`, `deregisterProjectPath` **and** the current-project skip in `propagateGlobalChangesToProjects`, so there is one implementation of the rule and no second one to drift against. Deliberately no `path.resolve` fallback tier (that would be the multi-tier resolution chain CLAUDE.md bans); the helper throws and the one caller that must survive it already warns and continues.
   - _Documentation:_ `reference/config/config-writer.md` -> `projects` Field Lifecycle gained a **"Path normalization — `normalizeProjectPath`"** section carrying the three call sites, the no-fallback rationale, and a where-the-throw-lands table. The adjacent "Normalization asymmetry" callout was rewritten from `(open)` to **CLOSED — Do not reintroduce it**, kept deliberately because the constraint is invisible in the fixed code.
   - _`skipped` + sweep observability (the other half):_ documented in the same file under "Propagation observability — caller-dependent since D-274" and "Registration observability". Note this half is documented, **not fixed** — `skipped` still stops at the function boundary on both `writeScopedConfigs` paths and is user-visible only on a global uninstall. The two observability findings (`2026-04-21-propagation-skipped-observability-gap.md`, `2026-04-21-registerProjectPath-sweep-observability-gap.md`) remain open on their code side.
   - _Findings lifecycle:_ `2026-07-25-register-deregister-path-normalization-asymmetry.md` is `resolved`; its three-months-earlier duplicate `2026-04-21-d233-projects-normalization-asymmetry.md` is now `superseded` and the pair is linked in both directions (it had been left at `partial` asserting a live bug — see `2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved.md`).

   Caveat kept deliberately: **Pattern 6 as a whole is not closed** — only this action is. The pattern named three findings; the two observability ones still lack a code-side signal.

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

_**Reset 2026-07-30** (full regeneration — all **135** findings rebuilt into the primary tables above). Both of the previous window's blocks were promoted: the 4-finding doc-hygiene tail and the 8-finding bug-fix + reconciliation tail. Patterns A..S carried forward with widened statements for E, O, Q and S; Pattern T promoted from candidate; Pattern U newly named. Next regeneration trigger: >10 entries accumulated here, OR the oldest un-aggregated finding exceeds 30 days, OR a major release bundle ships._

**This section is empty. Window opens: 2026-07-30 (post-regeneration).** Findings filed after the 135-file snapshot go here, not into the primary tables.

**Snapshot boundary for the next validator:** the primary tables are pinned at **135 findings** (**137 `.md`** including `README.md` and `TEMPLATE.md`). A recount that returns a different number means findings were filed (log them here) or deleted (a rule violation — see Priority Action 19). There is a single basis in this report; do not introduce a second by folding entries in piecemeal.

<!--
  The previous window's two Incremental blocks (the 4-finding doc-hygiene tail and the 8-finding
  bug-fix + reconciliation tail) stood here. Both have been PROMOTED into the primary tables and
  DELETED from this section per the bible's step 8 ("Reset the Incremental Updates section to
  empty"). They are deleted rather than retained-and-annotated on purpose: the regeneration trigger
  counts entries in this section, so leaving 12 promoted entries in place would re-fire the >10
  threshold immediately and every subsequent pass would inherit a false signal.

  Where the blocks carried content that was NOT merely a restatement of the findings themselves,
  that content was carried up rather than dropped:
  - The 12 findings -> By Date (2026-07-30 row), all rollups, and Patterns E/M/O/Q/R/S/T/U.
  - "Candidate Pattern T" -> lettered as Pattern T (its staging note said to decide at regeneration).
  - The three verified e2e-infrastructure count/name drifts -> Per-Reference-Doc Impact, which now
    marks that doc HIGH and names the drift; they also carry NEEDS-VALIDATION in DOCUMENTATION_MAP.md.
  - The two unadopted proposals in `.ai-docs/agent-suggestions/` are unchanged and still awaiting
    the user's decision: `2026-07-30-identity-key-helper-export-exception.md` (cross-referenced from
    Pattern E) and `2026-07-30-column-geometry-snapshot-rule-6-17a.md` (from Pattern Q).
-->
