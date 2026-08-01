---
scope: reference
area: architecture
keywords: [findings, agent-findings, impact, cross-reference]
related:
  - reference/architecture-overview.md
  - reference/concepts/tombstone-pattern.md
  - reference/component-patterns.md
  - reference/config/config-writer.md
  - reference/testing/e2e-infrastructure.md
  - reference/testing/infrastructure.md
  - reference/dependency-graph.md
  - reference/store-map.md
last_validated: 2026-08-01
---

<!-- VALIDATED 2026-08-01 · FULL — every primary table regenerated over all 158 findings; the
     135-file basis is retired, so there is one basis and nothing is carried forward. -->

# Agent Findings Impact Report

**Generated:** 2026-03-28 (original); regenerations 2026-04-21 (Ralph iter 92), 2026-07-23 (95 findings), 2026-07-30 (121 findings), 2026-07-30 (135 findings); **last full regeneration 2026-08-01** — rebuilt from all 158 finding files on disk.
**Total Findings Catalogued:** 158 (excluding `README.md` and `TEMPLATE.md`; no `audits/` subdirectory exists — every finding lives at the directory root).
**Date Range:** 2026-04-17 to 2026-08-01. Findings from 2026-03-21..2026-04-16 referenced by earlier regenerations are no longer on disk (see "Findings removed from disk" below); the rollups reflect only the 158 files present now.
**Product at regeneration:** 0.147.1.

> **Snapshot boundary (re-pinned 2026-08-01, full regeneration).** Every rollup, table, count and
> percentage below is derived from a snapshot of **158 finding files** (**160 `.md`** including
> `README.md` and `TEMPLATE.md`), counted on disk **at the close of this pass**.
>
> **This supersedes the 135-file basis.** There is **one basis, not two** — the 135-file figures are
> retired, not carried forward, and no reconciliation between them is intended or possible.
> Arithmetic for the next validator: 135 previously pinned + 13 filed 2026-07-31 + 10 filed
> 2026-08-01 = **158**, matching disk.
>
> **`README.md` is not a finding — and the 158 here is not the 158 you may have been handed.** The
> corpus at the START of this pass was **157**. A brief given to this regeneration quoted "158
> excluding TEMPLATE.md", which counted `README.md`; the pass then filed one finding of its own
> (`link-integrity-scan-scope-excludes-the-keys-that-dangle`), taking the true corpus from 157 to 158. **The two numbers agree by coincidence and disagree in composition.** The bible defines the
> corpus as every `*.md` "other than `README.md` and `TEMPLATE.md`"; a recount must apply that
> definition rather than match a figure. Re-derive; never corroborate a count against another count.
>
> **Re-count at the END of the pass, not the start.** This is the fourth consecutive regeneration
> whose basis moved while it was being written — twice from concurrent sibling agents, twice from
> the regenerating pass itself. Every table below is derived from the closing count.
>
> **This report OWNS the agent-findings totals** per the count-ownership registry in
> `standards/documentation-bible.md`. `DOCUMENTATION_MAP.md` references this callout rather than
> restating any of these numbers. Re-derive from disk here; never quote a findings total from the
> map, the changelogs or the Validation History.
>
> **Do not partially fold.** If findings accumulate again, log them in "Incremental Updates" and
> regenerate the whole set at the next trigger — never promote a subset, which produces a report
> whose totals match no snapshot at all.

> **Regeneration Policy:** Per `documentation-bible.md` ("Findings Impact Report Regeneration"), the report is fully regenerated when "Incremental Updates" exceeds ~10 entries, when the oldest un-aggregated finding is >30 days old, or when a major release bundle ships. **Two of the three triggers fired here:** 23 findings accumulated past the 135-file snapshot (>10), and the 0.146.1 + 0.147.0 + 0.147.1 bundle shipped. Both are now discharged.

---

## Rollups (2026-08-01 regeneration — 158 findings on disk)

Counts are computed directly from the YAML frontmatter of the 158 finding files (`root_cause`, `severity`, `category`, `domain`, `status`, `date`). `README.md` and `TEMPLATE.md` are excluded. **Δ columns are against the 135-file basis** and therefore measure this window's 23 findings only; each Δ column sums to +23.

### By Status

> **Inference declared: ZERO.** Per `documentation-bible.md` ("Rollups must declare inference"), a
> report quoting a status distribution must state how many files had no `status:` and were inferred.
> **All 158 findings declare a `status:` explicitly** — re-verified this pass with
> `grep -L '^status:'` over the whole corpus, which returned nothing. Every figure below is a count,
> not an inference. The 2026-07-30 backfill closed this gap and the directory has now held at zero
> across a 23-file growth window, which is the first evidence the convention is self-sustaining
> rather than a one-off cleanup.

| Status       | Count   | Share | Δ vs 135-basis |
| ------------ | ------- | ----- | -------------- |
| `partial`    | 67      | 42.4% | **+17**        |
| `open`       | 42      | 26.6% | +3             |
| `resolved`   | 41      | 25.9% | +2             |
| `superseded` | 8       | 5.1%  | +1             |
| **Total**    | **158** | 100%  | **+23**        |

- `partial` = one side landed and the other did not (`partial_note:` present, describing which).
- `resolved` = anti-pattern fixed or standard fully updated (`resolved_by:` present).
- `superseded` = replaced by a later finding covering the same files and root cause (`superseded_by:` present, paired with `status: superseded`).

**Open vs closed:** closed (`resolved` + `superseded`) = **49 (31.0%)**. Not closed (`open` + `partial`) = **109 (69.0%)**. Both figures are exact.

**`partial` is now the plurality status, and that is the single most informative number in this
report.** It overtook `open` in the 2026-07-30 backfill and extended its lead sharply this window:
**17 of the 23 new findings landed `partial`**, against 3 `open`, 2 `resolved` and 1 `superseded`.
Closure fell from 34.1% to 31.0% not because anything regressed but because the window produced
almost nothing but half-closed work.

**The shape is the same one the backfill identified, and it is the inverse of the enum's
definition.** `README.md` defines `partial` as "docs/standards side landed, code-side fix still
pending". Nearly every `partial` in this corpus is the opposite: **the code fix shipped and the
Proposed Standard was never written.** The 0.147.0 and 0.147.1 changelogs make this explicit rather
than leaving it to be inferred — each closes with a "Proposed standards / Not yet written into the
standards docs" section listing nine rules between them, none adopted. Those unwritten rules ARE
the `partial` backlog.

The enum still has no value for "fixed but not generalised", so `partial` carries both directions
and only the `partial_note:` distinguishes them. `TEMPLATE.md` records this as an OPEN QUESTION for
its owner; it is now a question about 67 of 158 files rather than 21, which raises it from a
labelling nicety to the main obstacle to reading this report's status column at a glance.

**The substantive reading is unchanged and now better evidenced: this codebase fixes its defects and
does not codify the lessons.** That is the mechanism behind Patterns E, M and V recurring, and it is
why the high-severity backlog below is predominantly documentation debt rather than defects.

### Schema and link-integrity scan (re-run over all 158 files, 2026-08-01)

The six pre-processing defect classes mandated by `documentation-bible.md` were re-run mechanically
over all 158 files. **Five of six are clean.**

| #   | Defect class                                                  | Result                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | File without frontmatter                                      | **0** — every one of the 158 opens with a `---` block                                                                                                                                                                                        |
| b   | `root_cause:` outside the enum                                | **0** — all 158 values are enum members                                                                                                                                                                                                      |
| c   | Duplicate `affected_files + root_cause + date` tuple          | **1 pair, benign** — `propagation-skipped-observability-gap` and `registerProjectPath-sweep-observability-gap` (both 2026-04-21, `enforcement-gap`). Genuinely distinct findings about two different `local-installer.ts` sweeps; not merged |
| d   | `type:` outside the enum                                      | **0** — the `enforcement-gap`-as-a-`type` violation repaired 2026-07-30 has not recurred                                                                                                                                                     |
| e   | `superseded_by:` / `supersedes:` without `status: superseded` | **0** — all 8 supersession relationships are correctly paired in both directions                                                                                                                                                             |
| f   | Missing `status:`                                             | **0** — see the inference callout above                                                                                                                                                                                                      |

### Supersession links (all verified against disk this pass)

Every `supersedes:` / `superseded_by:` / `blocked_by:` value was re-checked for target existence and
mirrored pairing. **0 dangling targets, 0 one-sided pairs.** The 7 defects the 2026-07-30 pass
repaired have stayed repaired through a 23-file growth window, and the window's one new supersession
was filed correctly paired on both ends from the start.

| Superseded (older)                                                                   | Superseded by (newer)                                                       | State this pass                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| `2026-04-21-d233-projects-normalization-asymmetry`                                   | `2026-07-25-register-deregister-path-normalization-asymmetry`               | correct                                      |
| `2026-07-17-d227-same-scope-active-tombstone-duplicate`                              | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | correct (mirror added 2026-07-30)            |
| `2026-07-18-scope-guards-read-stale-hydration-snapshot`                              | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | correct                                      |
| `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable`                   | `2026-07-30-d277-global-immutability-collapses-tombstone-provenance`        | correct (mirror added 2026-07-30)            |
| `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse`                     | `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code`                 | correct (`status:` added 2026-07-30)         |
| `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code`                          | `2026-07-18-d233-agent-collapse-fix-in-toggleagent-action-not-helper`       | correct (repaired 2026-07-30)                |
| `2026-07-20-project-builder-derived-slug-hid-wrong-category`                         | `2026-07-20-fixture-category-literals-unvalidated-against-categories-union` | correct (repaired 2026-07-30)                |
| `2026-07-31-confirm-step-viewport-is-zero-rows-at-short-so-overflow-spec-is-vacuous` | `2026-07-31-negative-render-assertion-needs-a-positive-subject-guard`       | **NEW this window** — filed correctly paired |

`2026-07-30-d277-...` supersedes **three** findings, so its `supersedes:` key is a YAML list.

**The new pair is worth reading, because it is a finding superseding itself on a geometry change.**
`confirm-step-viewport-is-zero-rows-at-short` measured the confirm viewport at **zero rows** when
`TERMINAL_SIZE.SHORT` was 16. 0.147.0 raised that constant to 20, the viewport became **five** rows,
and the original finding's central measurement stopped being true — while its conclusion (the
overflow spec is vacuous) remained true for an entirely different reason. The successor re-measured
at the new geometry rather than re-dating the old claim. That is the correct handling of a finding
whose evidence a later release invalidates, and it is the only instance of it in the corpus.

### Link-integrity scope gap — NEW defect class found this pass

The link scan the bible mandates covers three keys: `supersedes:`, `superseded_by:`, `blocked_by:`.
Extending it to `related:` and `standards_docs:` for the first time — which name finding files just
as often — surfaced **4 dangling targets the mandated scan cannot see**:

| Dangling target                                        | Named by                                                  | Key              |
| ------------------------------------------------------ | --------------------------------------------------------- | ---------------- |
| `2026-04-20-new-agent-toggle-defaults-global-scope.md` | `2026-04-21-agent-findings-frontmatter-drift-iter45`      | `standards_docs` |
| `2026-04-13-e2e-anti-pattern-audit-d168.md`            | `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps` | `related`        |
| `2026-04-14-missing-home-isolation-in-unit-tests.md`   | `2026-07-17-e2e-helper-tests-have-no-runnable-home`       | `related`        |
| `2026-04-14-unit-test-home-isolation.md`               | `2026-07-17-e2e-helper-tests-have-no-runnable-home`       | `related`        |

All four are casualties of the same never-delete violation documented below — three of them from the
2026-03-21..2026-04-16 window this report can no longer account for. **This is a Pattern U instance
about the Pattern U remedy itself**: remedy (a) specified three keys, the three the author had in
mind, and a check scoped to three keys cannot report on the two it was not given. Filed as
`2026-08-01-link-integrity-scan-scope-excludes-the-keys-that-dangle.md`.

Two further path defects, recorded but not repaired (they live in findings, not in files this pass
owns): `scratchpad/d226-porting-recipe.md` is named in two findings' `standards_docs:` and does not
exist, and three findings carry machine-specific absolute paths beginning `/home/vince/`, which
CLAUDE.md forbids in any git-tracked file.

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

| Date       | Count | Theme of the batch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | 1     | Shared config/stack parser duplication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-04-18 | 1     | `mergeConfigs` drops `projects` field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-04-20 | 2     | D-217 installMode dead plumbing; newly-toggled agent defaults to global scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-04-21 | 13    | Dual-scope/tombstone cluster, E2E keypress rule, findings-system self-governance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-04-22 | 6     | Edit-mode scope-awareness audit, tombstone/checkbox, mode-migrator, plugin-uninstall asymmetry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-09 | 1     | Marketplace schema stricter-than-contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-17 | 4     | D-167 task-ID lint guard, D-227 preselect/tombstone reachability, E2E helper test home                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-07-18 | 10    | Dual-scope collapse doc-vs-code, propagation recompile, scope guards read stale hydration snapshot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-19 | 11    | Config-as-text vs structural load, union-sweep type safety, Ink post-mount race, parser dedup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-20 | 46    | Pass-8 shared-infra adoption sweep: fixtures, config normalizers, scope authority, renderer determinism, toast + page-object hygiene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-24 | 6     | D-226 sandbox-HOME default + D-219 launcher sugar; D-271 short-terminal clipping and the source-grid overflow affordance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-25 | 1     | `registerProjectPath` / `deregisterProjectPath` path-normalization asymmetry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-29 | 11    | **0.146.0 cluster:** duplicate-implementation drift (sources tab vs confirm step, two config write paths, exclusivity in a keypress handler) + the live-CLI QA sweep + frame-observability findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-30 | 22    | **Second-largest day.** Five sub-batches: D-277 tombstone provenance + unreachable surfaces; nine doc-hygiene findings on claims whose falsification has no trigger; seven accompanying that day's five bug fixes; four on the findings/doc pipeline's own self-governance; two on the ESLint toolchain                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-31 | 13    | **0.147.0 cluster — the live-CLI rendering sweep.** Every defect reproduced against the real binary through a PTY before and after its fix. Terminal-size gating (two disagreeing declarations; a precondition checked once before render), Ink layout under clipping (`flexShrink` defaults, vertical padding, fixed-height blocks), Sources-grid vocabulary drift, and five findings on tests and snapshots that concealed the defect they covered                                                                                                                                                                                                                                                                                                                         |
| 2026-08-01 | 10    | **0.146.1 + 0.147.1 cluster — the ESLint baseline burndown, plus a doc-index audit.** Five arise from standing up a lint gate that had never executed (unused catch bindings hiding discarded causes; `as any` masking two fabrications; unused test bindings marking unwritten assertions; specs asserting nothing; two constructs TypeScript mandates that ESLint cannot express). Five are doc/findings-pipeline defects: a count-ownership registry naming the wrong owner, an exhaustive enumeration extended instead of re-derived, an import graph validating rows instead of diffing edges, reference docs naming identifiers that no longer exist, and (filed by this regeneration) a link-integrity scan whose key list excludes the two keys that actually dangle |
| **Total**  | 158   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**The last three days are the densest window in the corpus after the 2026-07-20 sweep: 44 findings
in 72 hours, 28% of everything ever filed.** They are also the most homogeneous. 2026-07-30 was the
first day dominated by findings about the documentation and findings systems themselves; 2026-07-31
and 2026-08-01 extended that to the _test_ and _tooling_ systems, and all three converge on a single
mechanism — an artefact that exists to catch a defect, runs, reports success, and could not have
reported anything else. That is **Pattern V**, newly named below, and it is the reason both the
0.146.1 and 0.147.0 changelogs open by naming the same shape in their own words.

### By Root Cause

| Root Cause                  | Count | Δ vs 135-basis | Canonical remedy                                   |
| --------------------------- | ----- | -------------- | -------------------------------------------------- |
| `convention-undocumented`   | 51    | +4             | Add rule to standards doc; cite in CLAUDE.md       |
| `rule-not-specific-enough`  | 52    | **+12**        | Tighten rule wording with enumerated cases         |
| `enforcement-gap`           | 31    | +6             | Add lint/typecheck/coverage-as-policy requirement  |
| `missing-rule`              | 17    | +1             | Author a new rule from scratch                     |
| `scope-discipline-deferred` | 5     | =              | Knowingly left in-scope; track as TODO             |
| `rule-not-visible`          | 2     | =              | Cross-link rule from other docs; move to prominent |
| **Total**                   | 158   | **+23**        |                                                    |

**`rule-not-specific-enough` has overtaken `convention-undocumented` (52 vs 51), and the crossover is
the story of this window.** It grew +12 against the other's +4 — over half the window's findings.
Every one of the twelve is a case where a rule existed, was followed in good faith, and the defect
landed anyway because the rule did not say which of two readings applied: rule 6.17a required a snapshot
but not that a regenerated one be read; the cast rule named `as SkillId` but not `as any`; the
count-ownership registry named an owner topically without checking which doc carries the figure.

**A codebase whose dominant root cause is `convention-undocumented` has a writing problem. One whose
dominant root cause is `rule-not-specific-enough` has a precision problem, and that is the harder
one** — it cannot be fixed by writing more rules, only by making existing rules say which of two
readings binds. That is Pattern E's remedy, and Pattern E is now the pattern to watch.

`enforcement-gap` (+6) is the runner-up and is almost entirely the ESLint burndown: rules that were
written down, believed enforced, and had no runnable checker (Patterns M and V).

### By Severity

| Severity  | Count   | Share | Δ vs 135-basis |
| --------- | ------- | ----- | -------------- |
| high      | 27      | 17.1% | +1             |
| medium    | 98      | 62.0% | **+20**        |
| low       | 33      | 20.9% | +2             |
| **Total** | **158** | 100%  | **+23**        |

**High severity by status:** `partial` 12, `resolved` 10, `open` 4, `superseded` 1. **16 of 27
high-severity findings are still not closed** (4 `open`, 12 `partial`) — up by one from the 15 the
previous basis reported, entirely from the window's single new high-severity finding.

The window added **one** high-severity finding against 20 medium and 2 low, which is why `high`'s
share fell from 19.3% to 17.1% without any high-severity work closing. The one addition is
`2026-08-01-import-graph-docs-validate-rows-instead-of-diffing-edges` (`partial`) — a documentation
finding, not a product one, and it is high because `dependency-graph.md`'s entire content is the
class of claim it falsifies.

**12 of the 16 not-closed high-severity findings are `partial`, and nearly all of those are "the
code fix shipped, the standard was never written."** The high-severity backlog is now predominantly
a writing task, not an engineering one — see Priority Actions.

### By Category

| Category     | Count   | Δ vs 135-basis |
| ------------ | ------- | -------------- |
| testing      | 66      | +9             |
| architecture | 66      | **+10**        |
| dry          | 12      | +1             |
| typescript   | 12      | +3             |
| complexity   | 2       | =              |
| **Total**    | **158** | **+23**        |

**`architecture` has drawn level with `testing` at 66 apiece** (+10 and +9 respectively) — the two
have between them accounted for 84% of every finding ever filed, and neither has led by more than a
few for three bases running. `typescript` (+3) had been flat for two windows; all three additions
are ESLint-burndown findings, which is the first evidence that standing up the lint gate surfaces a
class nothing else was reporting.

### By Domain

| Domain    | Count   | Δ vs 135-basis |
| --------- | ------- | -------------- |
| cli       | 67      | +6             |
| e2e       | 63      | +6             |
| shared    | 12      | +3             |
| web       | 9       | **+6**         |
| infra     | 7       | +2             |
| **Total** | **158** | **+23**        |

**`web` tripled (3 → 9) and is the only domain that moved by more than its own prior size.** That is
the 0.147.0 rendering cluster: Ink layout under a clipping viewport, `flexShrink` defaults, column
geometry, display-lookup fallbacks. `web` in this project means terminal rendering, and it had been
the smallest domain in the corpus by a wide margin precisely because nothing was looking at it —
these nine arrived the moment someone ran the CLI at a non-default terminal size.

`cli` keeps a narrow lead over `e2e`. `infra` (+2) is the ESLint toolchain.

### By Type

| Type                  | Count   | Δ vs 135-basis |
| --------------------- | ------- | -------------- |
| `anti-pattern`        | 43      | **+10**        |
| `convention-drift`    | 38      | +2             |
| `standard-gap`        | 39      | +7             |
| `missing-standard`    | 21      | +3             |
| `architectural-drift` | 12      | +1             |
| `audit`               | 5       | =              |
| **Total**             | **158** | **+23**        |

**`anti-pattern` retook the lead from `convention-drift` (+10 in one window)** after two bases in
second place. The ten are concrete, reproduced-against-the-binary defects rather than doc drift —
the 0.147.0 sweep's defining characteristic is that every one of its findings was verified through a
PTY before and after its fix, so they were filed as observed anti-patterns rather than as suspected
convention drift.

> **`enforcement-gap` remains retired as a `type` and has not recurred.** It is a `root_cause` value
> only (31 files); the two enums are disjoint per `TEMPLATE.md` rule 2. The single 2026-07-20
> offender was reclassified 2026-07-30 and the class-(d) scan over all 158 files this pass returns
> zero. No `type` value appears in both enums.

---

## Per-Reference-Doc Impact (2026-08-01)

Reference docs named in the `affected_files:` / `standards_docs:` / `related:` frontmatter of the 158 findings. This is the report's core cross-reference: a reference doc appearing here has at least one finding touching the behavior it documents and should be re-validated per `documentation-bible.md` "Re-Validation Triggers."

> **Counts are distinct findings, not raw frontmatter references.** A finding naming the same doc in
> both `affected_files:` and `standards_docs:` (common — the tombstone, component-patterns and guard
> docs are usually named twice) counts once. Δ is against the 135-file basis, which used the same
> distinct-finding measure.

| Reference Doc                                       | Findings | Priority           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference/concepts/tombstone-pattern.md`           | 11       | **HIGH**           | =. D-277 removed most tombstone producers; D-279 added derived masks (Patterns K/O). **Untouched by the 2026-08-01 sweep** — the most-referenced reference doc in the corpus has now gone a full release bundle without validation                                                                                                                                                                                                                                     |
| `reference/testing/e2e-infrastructure.md`           | 8        | HIGH               | +1. Frame observability, `getScreen()` unsoundness, fixture cardinality. Its `STEP_TEXT` enumeration claimed **64 against a true 74** — corrected 2026-08-01. `NEEDS-VALIDATION` **narrowed, not cleared** (Patterns Q, R, S, V)                                                                                                                                                                                                                                       |
| `reference/config/config-writer.md`                 | 6        | MED                | =. Path normalization is now a code guarantee and the doc records it. The 2026-08-01 PARTIAL pass re-verified that section specifically and found every claim accurate — hence the drop from HIGH                                                                                                                                                                                                                                                                      |
| `reference/concepts/scope-system.md`                | 7        | HIGH               | +1. Global immutability from project scope is now absolute (Pattern A); the Sources-tab vocabulary divergence added this window. Not re-validated since 2026-07-30                                                                                                                                                                                                                                                                                                     |
| `reference/features/plugin-system.md`               | 3        | LOW                | =. Rewritten and re-stamped `last_validated: 2026-07-30` (Cross-Scope Reconciliation, v2 plugin registry, Settings Integration, `ScopedConfigWriteResult`). **`local-installer.ts` gained zero findings this window** — the 0.147.x work was rendering and tooling, not installation — so the doc has not re-drifted                                                                                                                                                   |
| `reference/features/operations-layer.md`            | 3        | LOW                | =. `types/operations-types.md`'s 2026-08-01 heading diff globbed every `export type` under `lib/operations/` and found **22 in source, 22 in the doc, sets identical** — zero operations-layer drift across all three releases                                                                                                                                                                                                                                         |
| `reference/commands/index.md` (CANONICAL)           | 3        | **LOW (was HIGH)** | =. **`NEEDS-VALIDATION` DISCHARGED 2026-08-01.** The corrupt-project-config path (`loadUninstallConfig`) is now documented in full, and the pass additionally re-derived the whole 16-command file inventory and every `static flags` / `baseFlags` / `args` / `aliases` table from source with **zero mismatches**. The `--all` removal callout is intact                                                                                                             |
| `reference/wizard/store-map.md` (POINTER)           | 2        | LOW                | =. **Label corrected this pass — this is the POINTER (16 lines), not the canonical doc.** The previous table had this pair inverted, which is the same defect Map Invariant 4 exists to catch. Its target `store-map.md` received a FULL re-validation 2026-08-01, so link integrity is all that is measured here                                                                                                                                                      |
| `reference/concepts/guard-pattern.md`               | 2        | MED                | The `s`-only dual-scope contract and the init-mode bypass removal                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reference/features/skills-and-matrix.md`           | 3        | MED                | +1. Known Limitation #6 falsified by the 38-category fix (Pattern S). **New this window:** the count-ownership registry assigns it the `defaultCategories` figure, but the doc carries that number only inside an HTML validation comment — the authoritative write-up lives in `features/configuration.md`                                                                                                                                                            |
| `reference/component-patterns.md`                   | **10**   | **HIGH**           | **+8 — the biggest mover in the corpus, and the doc to validate next.** The entire 0.147.0 rendering cluster names it: Ink `flexShrink` defaults, fixed-height blocks in a clipped viewport, vertical padding blanking a viewport, display-lookup fallbacks, Sources-grid vocabulary, `SummaryPanel` extraction, terminal-size gates, column geometry (Patterns P, Q, V). Two PARTIAL passes landed (2026-07-31, 2026-08-01) and it is still **not re-stamped**        |
| `reference/commands.md` (POINTER)                   | 1        | LOW                | −1. Pointer to `commands/index.md`; measured on link integrity only, not content                                                                                                                                                                                                                                                                                                                                                                                       |
| `reference/config/config-merger.md`                 | 1        | HIGH               | Source-identity contract still unlanded (Pattern B)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `reference/commands/edit.md`                        | 1        | MED                | =. Scope-authority gate (Pattern A). The `command-delegation-must-carry-caller-intent` mechanism it documents is confirmed shipped; only the general rule is outstanding                                                                                                                                                                                                                                                                                               |
| `reference/types/operations-types.md`               | 1        | LOW                | `ConfigWriteResult.globalConfigPath` — closed, deletion now stated positively                                                                                                                                                                                                                                                                                                                                                                                          |
| `reference/types/zod-schemas.md`                    | 1        | LOW                | =. Owns the schema count that the index doc had pinned stale (Patterns O/S). FULL re-validation 2026-08-01 re-derived it from `lib/schemas.ts` and it is unchanged; `boundary-map.md` dropped its duplicate copy the same day                                                                                                                                                                                                                                          |
| `reference/type-system.md`                          | 1        | LOW                | Union-sweep carve-outs (Pattern I)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `reference/testing/infrastructure.md`               | 1        | LOW                | =. Gained "`render()` returns before effects flush" and "A regenerated snapshot is a proposal, not a result" 2026-08-01 (Pattern V). PARTIAL pass, not re-stamped                                                                                                                                                                                                                                                                                                      |
| `reference/wizard/state-transitions.md` (CANONICAL) | 1        | MED                | =. Known-bug note for `toggleAgent` scope defaulting. PARTIAL pass 2026-08-01 corrected the `I`-hotkey gate and the null-baseline diff projection; not re-stamped                                                                                                                                                                                                                                                                                                      |
| `reference/store-map.md` (CANONICAL)                | 1        | LOW                | =. **Label corrected this pass — this is the CANONICAL doc (342 lines), previously mislabelled "(pointer)".** FULL re-validation 2026-08-01 read `wizard-store.ts` end to end; `wizard-store.ts` is now the single most-cited file in the corpus, so this pairing is correct                                                                                                                                                                                           |
| `reference/findings-impact-report.md`               | 1        | —                  | =. This file; named by the snapshot-rule finding                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `reference/dependency-graph.md`                     | 1        | **HIGH**           | **NEW. The window's only high-severity finding.** Its entire content is an import graph, and it was validating existing rows instead of diffing edges — it carried a `wizard.tsx -> lib/feature-flags` edge deleted in 0.147.1 and had never recorded the real `hotkeys.ts -> lib/feature-flags` edge. FULL re-validation landed 2026-08-01: 13 of 17 Operations→Lib rows were wrong, and Observation 12 ("composition exists in exactly one place") was wrong by four |
| `reference/features/wizard-flow.md`                 | 1        | MED                | **NEW.** The `I`-hotkey gate is `isInfoPanelAvailable(step)` (flag AND `step !== "confirm"`), not the flag alone, and `usePanelScroll` was missing from the hook table. Two PARTIAL passes; **not re-stamped**                                                                                                                                                                                                                                                         |
| `reference/features/configuration.md`               | 1        | MED                | **NEW.** Carries the authoritative `defaultCategories` write-up that the count-ownership registry assigns to `skills-and-matrix.md`. PARTIAL pass 2026-08-01 split the `ConfigLoadError` "who handles the throw" table for the corrupt-PROJECT-config path                                                                                                                                                                                                             |
| `reference/architecture-overview.md`                | 1        | MED                | **NEW.** Quotes the `defaultCategories` count a third time (same finding). PARTIAL pass 2026-08-01 added the terminal-size gate as section 18 and corrected two `operations/skills/` symbol names that are not exports                                                                                                                                                                                                                                                 |
| `reference/boundary-map.md`                         | 1        | MED                | **NEW.** Same import-graph mechanism as `dependency-graph.md`. PARTIAL pass 2026-08-01 removed its restated Zod count and added section 1.4 (terminal geometry as a pre-command gate); sections 2–6 and 8 remain on the 2026-07-30 basis                                                                                                                                                                                                                               |
| `reference/utilities.md`                            | 1        | LOW                | **NEW.** `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` had zero importers while the live gate hardcoded its own copy — two declarations of one minimum, neither agreeing. FULL re-validation 2026-08-01 re-derived every exhaustive list in the file                                                                                                                                                                                                                           |
| `reference/config/configuration.md` (POINTER)       | 1        | LOW                | **NEW.** Its redirect row restated the `defaultCategories` count; a redirect row must carry a topic, never a quantity. Removed 2026-08-01 and the pointer re-stamped on link-integrity basis only                                                                                                                                                                                                                                                                      |

**Read the Priority column against the 2026-08-01 sweep, not against the counts.** Eight docs that
would rank HIGH on reference count alone were validated in that sweep and drop to LOW/MED. The two
that stay HIGH on count — `tombstone-pattern.md` and `component-patterns.md` — are precisely the two
the sweep did not close. **`tombstone-pattern.md` is the more urgent of the pair:** it is the
most-referenced reference doc in the corpus and the sweep did not touch it at all.

**Two pointer/canonical labels in this table were inverted and are corrected above.**
`reference/store-map.md` is CANONICAL (342 lines) and `reference/wizard/store-map.md` is the POINTER
(16 lines) — the previous table had them the other way round, and priced the pointer HIGH while
marking the canonical doc LOW. This is the same defect Map Invariant 4 exists to catch, replicated
inside this report; it is now verified by reading both files rather than inferred from path depth.

**One finding names a path that does not resolve as written:** `docs/reference/commands.md`. That
file exists — it is a user-facing guide — but the reference doc intended is
`.ai-docs/reference/commands/index.md`. It is counted under neither row above.

> **Scope note:** most of these 158 findings name `.ai-docs/standards/**` docs (convention-keeper's domain), not reference docs. Top standards targets, for prioritization only: `standards/e2e/anti-patterns.md` (43), `standards/e2e/README.md` (28), `CLAUDE.md` (20), `standards/clean-code-standards.md` (14), `standards/documentation-bible.md` (15), `standards/e2e/page-objects.md` (9), `standards/e2e/assertions.md` (7), `DOCUMENTATION_MAP.md` (6), `standards/e2e/test-data.md` (5), `agent-findings/TEMPLATE.md` (5), `agent-findings/README.md` (4), `standards/commit-protocol.md` (3), `standards/e2e-testing-bible.md` (2). **`CLAUDE.md` (+5) and `clean-code-standards.md` (+3) grew fastest** — both are where this window's nine unwritten Proposed Standards are addressed, which is the same debt the `partial` plurality measures. Out of scope for this reference-doc report, but they drive the same underlying patterns.

## Per-Source-File Churn (2026-08-01)

Source / E2E files most frequently named in `affected_files:` (>= 5 findings). High churn signals which reference doc needs the tightest validation cadence. **Deltas are against the 135-file basis**, so they measure this window's 23 findings only. Corpus-wide: **271 distinct files, 561 citations.**

| Source File                                                    | Findings | Δ vs 135-basis | Reference doc(s) to re-validate                                                        |
| -------------------------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------------- |
| `src/cli/stores/wizard-store.ts`                               | **25**   | **+2**         | `store-map.md`, `concepts/tombstone-pattern.md`, `concepts/guard-pattern.md`           |
| `src/cli/lib/installation/local-installer.ts`                  | 23       | =              | `features/plugin-system.md`, `config/config-writer.md`, `features/operations-layer.md` |
| `src/cli/commands/edit.tsx`                                    | 10       | =              | `commands/edit.md`                                                                     |
| `src/cli/components/wizard/source-grid.tsx`                    | **9**    | **+4**         | `component-patterns.md`                                                                |
| `e2e/pages/steps/build-step.ts`                                | 9        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/helpers/test-utils.ts`                                    | 9        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/wizards/edit-wizard.ts`                             | 7        | =              | `testing/e2e-infrastructure.md`                                                        |
| `src/cli/lib/configuration/config-merger.ts`                   | 6        | =              | `config/config-merger.md`                                                              |
| `src/cli/lib/configuration/config-writer.ts`                   | 6        | =              | `config/config-writer.md`                                                              |
| `src/cli/commands/init.tsx`                                    | 6        | =              | `commands/index.md`                                                                    |
| `e2e/fixtures/dual-scope-helpers.ts`                           | 6        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/fixtures/expected-values.ts`                              | 6        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/base-step.ts`                                       | 6        | +1             | `testing/e2e-infrastructure.md`                                                        |
| `e2e/pages/steps/confirm-step.ts`                              | 6        | +1             | `testing/e2e-infrastructure.md`                                                        |
| `e2e/helpers/terminal-session.ts`                              | 6        | +1             | `testing/e2e-infrastructure.md`                                                        |
| `src/cli/components/wizard/summary-panel.tsx`                  | **5**    | **new**        | `component-patterns.md`                                                                |
| `e2e/pages/constants.ts`                                       | **5**    | **new**        | `testing/e2e-infrastructure.md`, `standards/e2e/README.md`                             |
| `src/cli/commands/uninstall.tsx`                               | 5        | =              | `commands/index.md`                                                                    |
| `src/cli/lib/installation/mode-migrator.ts`                    | 5        | =              | `features/plugin-system.md`                                                            |
| `e2e/pages/steps/agents-step.ts`                               | 5        | =              | `testing/e2e-infrastructure.md`                                                        |
| `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts` | 5        | =              | `testing/e2e-infrastructure.md`                                                        |

**`wizard-store.ts` has broken the two-way tie and is now the single most-cited file in the corpus (25).** `local-installer.ts` took **zero** findings this window — the 0.147.x work was rendering and tooling, not installation — so the store pulled ahead on the Sources-tab null-baseline divergence and the dead `step-agents.tsx` subscription. `store-map.md` received a FULL re-validation on 2026-08-01, which is the correct response; `concepts/tombstone-pattern.md` and `concepts/guard-pattern.md`, the other two docs this file maps to, did not.

**`source-grid.tsx` nearly doubled (5 → 9) and is now the third-most-cited production file.** One component absorbed four findings in a single release: marker-column geometry, focused-row padding, the stray `✓` on locked and pending-removal rows, and the vocabulary divergence from the info panel. **`component-patterns.md` is the reference doc for all four and is still not re-stamped** — that pairing is the sharpest churn-to-doc signal in this table.

**Two files enter the table**, both from the 0.147.0 rendering cluster. `summary-panel.tsx` is the component extracted so the confirm step and the `I` overlay stop being two implementations of one summary — a Pattern O remedy that generated five findings on its way in, which is worth noting: **extracting the shared primitive is the right fix and is not free.** `e2e/pages/constants.ts` holds `STEP_TEXT`, `TERMINAL_SIZE` and the second of the two disagreeing minimum-height declarations; it is also the file whose exhaustive enumeration was documented as 64 against a true 74.

**Near-threshold watch list (4 findings each, one short of the table):** `src/cli/lib/wizard/scope-diff.ts`, `src/cli/consts.ts`, `e2e/pages/steps/sources-step.ts`, `e2e/pages/wizards/init-wizard.ts`, `e2e/fixtures/project-builder.ts`, `src/cli/lib/__tests__/content-generators.ts`, and six `e2e/lifecycle/` specs. **`consts.ts` is new to this list** — it holds `MIN_TERMINAL_SIZE`, `LOGO_MIN_TERMINAL_ROWS` and the deleted `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT`, and is where the two-disagreeing-declarations finding landed. `scope-diff.ts` remains the one to watch: it is the home of `skillSlotKey` / `agentSlotKey`, the extracted primitives at the centre of Pattern O and the cited examples in CLAUDE.md's export carve-out.

## Systemic Patterns (2026-08-01 regeneration)

Consolidated from all **158** on-disk findings. **A..U carry forward with their letters intact** — every class survived this window, none merged away, and no letter was reused. **V is newly named.** The pre-2026-07-23 numbered patterns are preserved in the Original Snapshot below.

Each pattern lists representative finding slugs (date prefixes omitted for brevity), the shared root cause, and the remedy plus the reference doc that should absorb it. A finding may appear under more than one pattern; that is deliberate and long-standing (e.g. `empty-union-string-fallback` sits under B, I and T), because the patterns classify _mechanisms_, not files.

### What this window changed, and what it did not

**The 0.146.1 / 0.147.0 / 0.147.1 window produced one dominant shape, and both of the first two changelogs name it in their own opening lines before any pattern analysis was done.** 0.146.1: _"an artefact that looks like verification but cannot fail."_ 0.147.0: _"five of the defects were being actively concealed by the tests and docs meant to catch them."_ When the release notes and the finding corpus converge independently on the same sentence, the class is real.

**That class is lettered V.** The decision to give it a letter rather than distribute its members across existing patterns is the main judgement of this regeneration, and the reasoning is recorded rather than left implicit:

- It is **not Pattern M** (_rules live in prose with no enforcement_). M's defect is an **absent** checker. V's defect is a checker that **exists, executes, and reports PASS** — which is strictly worse, because M leaves a visible hole and V manufactures false assurance. The two ESLint findings sit in both, and that overlap is the seam: the gate was absent (M) _and_ the checklist reported it passing (V).
- It is **not Pattern Q** (_the assertion cannot see the property under test_). Q is about the **observation surface** lacking a signal. V includes cases where the signal is perfectly observable and the artefact still cannot fail — a snapshot regenerated with `-u`, a spec that captures a value and asserts nothing, a test exercising an input the type system forbids.
- It is **not Pattern G** (_assertions pin state the test's own action did not produce_). G's assertion is real and mis-targeted. V's assertion is frequently **absent altogether**, or present but unreachable.
- It is **not Pattern U** (_the self-audit cannot detect its target class_). U is V's special case, restricted to the findings/doc pipeline auditing itself. U keeps its letter because its remedies are pipeline-specific; V is the general statement and now carries the product-code and test-suite instances U never covered.

**Six pattern statements were widened rather than split** — G, M, Q, R, S and T. Each carries a "**Widened 2026-08-01**" note naming what moved and why. Where a finding is a member of both V and an older pattern, it is listed under both: the older pattern says what kind of thing went wrong, V says why nothing caught it.

**What was NOT done:** no pattern was merged, renamed or retired. Pattern O was **not** widened this window — its two prose members from 2026-07-30 already carry it, and the count-ownership findings filed this window (`count-ownership-registry-names-a-doc-that-does-not-carry-the-count`, `exhaustive-enumeration-extended-not-rederived-stayed-short`) are recorded under S and V because their mechanism is a claim nothing re-derives, not a value implemented twice.

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

_**Widened 2026-08-01.** The 2026-08-01 unused-binding sweep supplied the pattern's purest instance and its sharpest evidence. `scope-toggle-config-snapshot.e2e.test.ts` — named "should compile agent at project scope and preserve global" — snapshotted **both** configs under a comment reading `// BEFORE: Snapshot both configs` and compared **neither**. Its two live assertions were `toContain("web-developer")` on each config, and the fixture writes `web-developer` into both files **before** the toggle runs. Both assertions were already true of the pre-state, so the spec would have passed with the toggle keystroke silently swallowed — a documented failure mode of this harness. That is Pattern G exactly: every assertion in the file pinned setup-owned state._

- Findings: `setup-owned-state-pinned-by-action-scoped-assertions`, `live-in-session-selected-state-uncovered-badge-only-assertions`, `toggle-selection-array-diverges-from-reconciled-active-state`, `init-dashboard-plugin-test-vacuous-project-scope`, `d228-e2e-vacuous-pass-via-home-edit`, `d227-preselect-fix-not-e2e-reachable`, **`e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing`** (new, also V), **`unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written`** (new, also V).
- Root cause: absolute assertions on setup-owned state; badge-only assertions miss live selection; "project scope" tests sharing `HOME=projectDir` pass vacuously. **The new members add a mechanical detector the pattern never had:** an unused binding in a test file marks the exact spot where an assertion was planned and not written, and `@typescript-eslint/no-unused-vars` finds them for free. 53 in `src/` tests and 15 in `e2e/` on first run.
- **The detector is the deliverable, not the fix.** In production code a dead variable is usually just dead; in a test it is very often the value the author meant to assert on. Deleting it silently discards the signal. Triage before deletion.
- Remedy: "Assert on what your action changed" in `standards/e2e/anti-patterns.md` (convention-keeper), plus a standing rule that an unused binding in a test file is triaged as a missing assertion before it is removed. Reference: `testing/e2e-infrastructure.md`.

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

_**Widened 2026-08-01 — the prerequisite is discharged, and the payoff is measured.**_ The ESLint
installation this pattern named as a hard prerequisite landed in 0.146.1 and its baseline reached
**zero** in 0.147.1 with no rule disabled. That closes the pattern's blocking item and lets the rest
of its remedy list become actionable for the first time. Two consequences worth recording:

1. **Running the checker for the first time is itself a finding generator.** Of 148 problems, five
   marked real defects invisible precisely because the binding recording them was unused — two
   discarded `catch` causes in `source-validator.ts` (the command whose entire job is reporting
   causes), and `as any` casts that made two impossible test scenarios compile. **A gate's first
   execution is a source of information, not a chore**, and this is the corpus's evidence for it.
2. **The remedy list is still not fully actionable.** `d167-task-id-recurrence-no-lint-guard` needs
   a `no-restricted-syntax` rule that was deliberately left out to keep the initial rule set stock,
   and `eslint-plugin-react-hooks` is not installed at all — so this Ink/React codebase has **no
   hooks linting**, and two effects in `use-measured-height.ts` would be flagged if it were added.

New members: **`unused-catch-binding-hid-a-discarded-validator-cause`**, **`eslint-flags-two-typescript-mandated-constructs-it-cannot-express`** (the counter-case: two constructs TypeScript _requires_ in the shape the rule objects to, where the rule's own `_` escape hatch fails to compile — `TS2428` merged declarations match on the parameter's _name_).

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

_**Widened 2026-08-01 with a third failure mode: the surface reads MORE than it claims.**_ The first
two modes are a surface that carries **too little** — a stripped colour, an overwritten frame. The
new member is the inverse and is more dangerous, because it makes **absence** assertions unsound.

- New members: **`getscreen-is-not-viewport-only-so-absence-assertions-are-unsound`**, **`negative-render-assertion-needs-a-positive-subject-guard`**, **`confirm-step-viewport-is-zero-rows-at-short-so-overflow-spec-is-vacuous`** (superseded by the former).
- `TerminalSession.getScreen()` documents itself as viewport-only and **reads from buffer line 0**, so every `not.toContain(...)` through it is scrollback-sensitive. A resize pushes the whole pre-shrink frame into scrollback and paints twice — Ink's own `resized()` re-render, then the app's reaction — so a cursor-anchored raw wait does not rescue it either. **Flagged, not changed: every page object depends on `getScreen()`.**
- The paired rule, and the cheapest fix in this pattern: **a negative rendering assertion needs a positive guard proving its subject is on screen.** A counter is not its content — `toContain("2 more below")` proves an affordance rendered, not that the rows it counts exist. And never assert a rendering invariant at a geometry where the subject does not render.
- Both new members are also Pattern V members: the assertion runs, reports PASS, and could not have reported otherwise.

### Pattern R — The scenario has no reachable surface, or the fixture cannot establish the state its name claims

_**Widened 2026-07-30** with a third failure mode: the layer under test cannot observe the input the spec varies._

- Findings: `domain-deselect-has-no-reachable-ui-surface-in-edit`, `dual-scope-collapse-unreachable-for-eject-pairs`, `per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row`, `sourceById-collapse-unreachable-in-production`, `d227-preselect-fix-not-e2e-reachable`, `init-dashboard-plugin-test-vacuous-project-scope`, `d228-e2e-vacuous-pass-via-home-edit`, **`symlinked-project-path-bugs-are-unreachable-from-e2e`** (new).
- Three failure modes, one root cause — **nobody traced the surfaces before writing the spec**:
  1. **Unreachable scenario.** `toggleDomain` has only two callers, and `cc edit` hydrates at the build step with `history: []`, so the DOMAINS step cannot be reached from an edit session. A requested "toggle a domain off during a project edit" spec would have had to invent a flow no user can perform. Similarly, `ProjectBuilder.editable({ skills, globalSkills })` pins both halves of a pair to `source: "eject"`, and the overwrite guard refuses the scope press for an eject-over-eject pair with no tombstone — so the dual-scope collapse spec fails on a swallowed keystroke, not on the assertion under test.
  2. **Fixture establishes a different state than the name claims.** A unit spec named "project-scoped skill, previously installed as project" built its live state with `toggleTechnology` (which defaults `scope: "global"`) against a `buildSkillConfigs` snapshot (which defaults `scope: "project"`) — a project→global migration. Its incidental row-count assertion had been pinning id-keyed behaviour for a shape nobody listed.
  3. **The layer under test cannot observe the varied input** _(new 2026-07-30)_. `uninstall.tsx` takes its directory from `process.cwd()` = `getcwd(2)`, which returns the kernel's canonical path with symlinks **already resolved**, and ignores `$PWD`. A symlinked-sandbox E2E spec therefore **cannot fail** — it passes identically against bug and fix. The coverage was correctly written one layer down, in `local-installer.test.ts`. This generalises to any input the OS canonicalizes before the process observes it, and is the most dangerous of the three because the spec looks precisely targeted at the bug.
- Remedy: trace the caller graph and the fixture's emitted shape **before** writing the spec; when a scenario is unreachable, record it as invariant hardening rather than inventing a flow. For mode 3, ask which layer first _observes_ the varied input and test there. Standards: `standards/e2e/README.md`, `standards/e2e/test-data.md`, `standards/e2e/anti-patterns.md`. Reference: `testing/e2e-infrastructure.md`.

_**Widened 2026-08-01 with a fourth failure mode: the fixture is a valid state that cannot express the bug.**_ Modes 1–3 are about a scenario nothing can reach. Mode 4 is about a scenario reached correctly against a fixture too small to produce the symptom.

4. **The fixture is smaller than production, so the bug has a different signature in it.** The stack step bled at the advertised minimum height because a six-row ASCII logo starved the list's viewport past `MIN_VIEWPORT_ROWS`. `create-e2e-source.ts` builds **one** stack where the real marketplace has a dozen — with one row there is nothing to overflow, so `useRowScroll` never stops clipping and the overpaint never reaches the assertion. The spec was correctly written, correctly targeted, and structurally incapable of failing. **Cardinality is part of a fixture's contract**: any fixture backing a spec about overflow, scrolling, clipping or pagination must exceed the viewport it is testing.

- New members: **`e2e-fixture-smaller-than-production-changes-the-bug-signature`**, **`as-any-on-valid-union-members-is-noise-that-hides-two-fabrications`** (mode 1, in a unit spec: `{ id: "web-framework-nonexistent" as any }` in a test named "filters out invalid skill IDs not in skillIdSet" — the cast was the _sole_ reason it compiled, so the spec asserted correct behaviour for a scenario no type-checked path can produce. The scenario that **can** occur is the inverse: a valid `SkillId` absent from the set, which happens whenever `defaultStacks` — type-checked against the previous generation's union — names a skill the current source no longer provides).
- **A cast is how an unreachable scenario gets written.** That is the generalisable half: when a test needs `as any` to compile, the type system is reporting that the scenario cannot occur, and the cast overrides the report rather than answering it. Renaming `VALID_IDS` to `KNOWN_SKILL_IDS` was the corresponding fix — calling the set "valid" is what invites the next person to fabricate an invalid member.

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

- Remedy: widen the hook table with rows for flag changes, Known-Limitation narrowing, and high-churn source files; ban unqualified negative exhaustiveness claims (scope them to a named function or add a grep the validator can re-run); make an index doc's numeric annotations point at the indexed doc rather than restating them. Standards: `standards/documentation-bible.md` (convention-keeper's domain). Reference docs to re-validate first: `concepts/tombstone-pattern.md`, `component-patterns.md`, `concepts/scope-system.md`.

_**Widened 2026-08-01 to eleven members, and the widening is a rebuke to the previous window's own remedy.**_ 2026-07-30 landed "A Count Lives in Exactly One Document" plus an ownership registry. This window found **three defects in that remedy's execution**, all the same shape — the fix was applied by assignment rather than by re-derivation:

| New change shape that went uncaught                              | Example                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An ownership registry row naming the wrong owner                 | The registry assigns the `defaultCategories` figure to `skills-and-matrix.md`, which carries it only inside an HTML validation comment. The authoritative write-up is in `features/configuration.md`, and `architecture-overview.md` quotes it a third time. All three agree with disk today — **so there is no live drift, and that is exactly why it would have survived** |
| An exhaustive enumeration **extended** rather than re-derived    | `STEP_TEXT` was documented as 64 in one doc and 72 in another against a true **74**. The 72 was itself recorded one day earlier and was short by two. Extending a list by the members you happen to notice preserves every member you do not                                                                                                                                 |
| An import-graph doc validating **rows** instead of diffing edges | `dependency-graph.md`'s entire content is edges. It carried a `wizard.tsx -> lib/feature-flags` edge deleted in 0.147.1 and had never recorded the real `hotkeys.ts -> lib/feature-flags` edge. A claim-by-claim pass checks the rows present; only a diff finds the rows absent                                                                                             |
| A doc naming an identifier that no longer exists                 | `component-patterns.md` named `rowStatusGlyph`, which has no declaration anywhere in source (the function is `rowStatusMarker`). A renamed module-internal symbol breaks no build and fails no test                                                                                                                                                                          |

- New members: **`count-ownership-registry-names-a-doc-that-does-not-carry-the-count`**, **`exhaustive-enumeration-extended-not-rederived-stayed-short`**, **`import-graph-docs-validate-rows-instead-of-diffing-edges`** (the window's only `high`), **`reference-docs-name-identifiers-that-no-longer-exist`**.
- **The unifying lesson, and this pattern's strongest statement to date: a documentation claim is only as good as the mechanism that re-derives it.** Assigning an owner, extending a list, or validating the rows you can see are all forms of _not re-deriving_, and each produces a doc that passes its own validation pass while being wrong. This is why the bible already says "Re-derive, never carry forward" — the rule existed and was followed in spirit by four separate passes that still shipped these four defects, which puts the finding class squarely under `rule-not-specific-enough`.

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

_**Widened 2026-08-01 with a sixth blind spot: a constant nothing imports.**_

| Blind spot                                    | Instance                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declared constant with zero importers _(new)_ | `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` had **zero importers in all of `src/`** while the live gate hardcoded its own copy. `tsc` has nothing to say about an exported constant nobody reads, so the documented value and the enforced value drifted apart in silence, and **changing the documented constant did nothing at all**. Fixed by collapsing to one `MIN_TERMINAL_SIZE` read by both gates |

- New members: **`two-minimum-terminal-height-declarations-neither-agreeing`**, **`a-precondition-checked-once-before-render-is-not-a-gate`** (a gate installed in `init()` that removes its own resize listener the moment the size becomes valid — no type says a gate must stay armed), **`display-lookup-fallbacks-hide-invariants-in-ink-render-paths`** (`findStack(id)?.name ?? id` collapses "no stack selected", a real renderable state, with "a stack is selected but the matrix does not hold it", which is not a state at all — the `??` makes both compile).
- **The cheap mechanical check this window supplies, and it belongs in every validation pass: grep the importers of any constant a doc calls authoritative.** Zero importers means the doc is describing a value the running code does not read. It is a one-line check and it would have caught the terminal-height pair immediately.

### Pattern U — The self-audit is structurally incapable of detecting the defect class it is aimed at

_**New 2026-07-30.** Distinct from the historical numbered Pattern 11 ("findings-system self-governance drift"), which observed **that** the pipeline drifts. This pattern names **why the checks do not catch it**: each check is individually well-formed and passes, while being the wrong shape to detect the defect it targets. Surfaced by this pass's link-integrity scan, which had never been run._

- Findings: `index-audit-arithmetic-passed-while-pointer-set-was-misnamed`, `sibling-finding-left-open-when-its-duplicate-was-resolved`, `findings-rollup-has-no-snapshot-rule-and-schema-drifted`, `finding-proposed-standard-contradicted-a-never-rule` (also E), **`link-integrity-scan-scope-excludes-the-keys-that-dangle`** (new 2026-08-01), **`import-graph-docs-validate-rows-instead-of-diffing-edges`** (new, also S and V), plus the two dangling links and three one-sided supersession pairs the 2026-07-30 pass repaired (see "Supersession links" and "Findings removed from disk" above).

  | The check                                                            | Why it cannot fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Map Invariant 4: `41 == 32 + 9`                                      | Tests a **cardinality**, not a **membership**. Two pointer pairs are flipped (the root file is the stub), so swapping a member for its partner preserves the total. Four consecutive audits recorded PASS on a mis-enumerated set, and `commands/index.md` — the canonical commands reference — was never staleness-tracked, drifting two releases while advertising a flag oclif rejects.                                                                                                                                                                                             |
  | Duplicate detection keyed on `affected_files + root_cause + date`    | Includes `date` in the key, so **findings filed on different days can never collide by construction**. The pair it was meant to catch was three months apart _and_ differed on `root_cause` — it would have missed on two of three components.                                                                                                                                                                                                                                                                                                                                         |
  | Frontmatter pre-processing scan                                      | Ran three checks (missing frontmatter, out-of-enum `root_cause`, duplicate tuple). The three defects that actually drifted — out-of-enum `type:`, unpaired `superseded_by:`, missing `status:` — were covered by **none** of them. Widened to six checks 2026-07-30.                                                                                                                                                                                                                                                                                                                   |
  | Link integrity over `supersedes:` / `superseded_by:` / `blocked_by:` | **Did not exist until 2026-07-30.** It is a one-line existence check. Running it for the first time found 2 dangling targets and 5 one-sided or unpaired links — 7 defects in a directory that had passed four self-audits.                                                                                                                                                                                                                                                                                                                                                            |
  | **The scope of that link check** _(new 2026-08-01)_                  | **The 2026-07-30 remedy named three keys — the three its author had in mind.** `related:` and `standards_docs:` name finding files just as often and were not on the list, so the check reported PASS over a set it was never given. Extending the identical one-line check to them found **4 more dangling targets**, three pointing into the same deleted window. **The fix for a Pattern U defect was itself a Pattern U defect**, one regeneration later. Remedy (a) is restated by property rather than by enumeration: any frontmatter value that is a path must resolve on disk |
  | Reviewing a finding's Proposed Standard                              | Nothing checks a prescription against the NEVER rules. A finding prescribed a banned two-tier fallback; implementing it verbatim would have looked justified in review, _citing an approved finding_.                                                                                                                                                                                                                                                                                                                                                                                  |

- Root cause: self-audits are written to confirm the invariant the author had in mind, and a passing check is then read as evidence the whole class is sound. **The audit's own output is not evidence** — the documentation-bible already says "Re-derive, never carry forward" for counts, and this pattern is that rule generalised from values to _checks_.
- Aggravating factor, and the reason two of this pass's defects existed at all: **findings have been deleted from disk despite `README.md`'s explicit "Never move files" rule.** `changelogs/0.137.0.md` and `changelogs/0.141.8.md` each name findings that are gone, and the 0.141.8 batch removed at least three resolved findings at once. Every cross-link into a deleted file breaks silently, which is precisely what the rule predicts.
- Remedy: (a) add link integrity as a **seventh** pre-processing defect class — target existence plus mirrored pairing for `supersedes:` / `superseded_by:`, target existence for `blocked_by:`; (b) make Map Invariant 4 verify pointer membership **by name**, not by cardinality; (c) drop `date` from the duplicate-detection key, or add a second date-independent key on `affected_files + a normalized title`; (d) require a Proposed Standard to be checked against the NEVER lists before adoption; (e) enforce the never-delete rule, and when a finding must leave the working set, keep the file and set `status:` rather than removing it. Standards: `standards/documentation-bible.md`, `agent-findings/README.md`, `agent-findings/TEMPLATE.md` (all convention-keeper's domain except `TEMPLATE.md`). Reference: this file.

### Pattern V — The artefact looks like verification and cannot fail

_**New 2026-08-01.** The defining pattern of the 0.146.1 + 0.147.0 + 0.147.1 bundle, and the only pattern in this report that both changelogs named independently before any analysis was run: "an artefact that looks like verification but cannot fail" (0.146.1) and "five of the defects were being actively concealed by the tests and docs meant to catch them" (0.147.0)._

- Findings: `eslint-precommit-gate-has-no-config-and-cannot-run`, `eslint-disable-directives-were-never-verified`, `column-geometry-snapshots-regenerated-never-verified`, `a-precondition-checked-once-before-render-is-not-a-gate`, `e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing`, `unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written`, `as-any-on-valid-union-members-is-noise-that-hides-two-fabrications`, `exhaustive-enumeration-extended-not-rederived-stayed-short`, `e2e-doc-inventories-pin-counts-and-names-nothing-verifies`, `getscreen-is-not-viewport-only-so-absence-assertions-are-unsound`, `negative-render-assertion-needs-a-positive-subject-guard`, `e2e-fixture-smaller-than-production-changes-the-bug-signature`, `confirm-step-viewport-is-zero-rows-at-short-so-overflow-spec-is-vacuous`, `focused-row-padding-defect-codified-as-a-test-rule`, `import-graph-docs-validate-rows-instead-of-diffing-edges`, `unused-catch-binding-hid-a-discarded-validator-cause`, `d167-task-id-recurrence-no-lint-guard`, `e2e-spec-files-accumulate-unused-imports-unenforced`.

- **Root cause:** an artefact whose purpose is to catch a defect is _present_, is _believed to be enforcing_, and is structurally unable to report failure. It is not a missing check (Pattern M) and not a blind observation surface (Pattern Q). **It reports PASS, and PASS is the only thing it could have reported.** The three releases produced eight distinct mechanisms for this:

  | Mechanism                                          | Instance                                                                                                                                                                                                                                                                                                                                                                              |
  | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **The gate has no config**                         | `CLAUDE.md`'s Pre-Commit Checklist gated on "No ESLint errors". There was an `eslint` dependency and a `lint-staged` entry — and no config file, no script, no binary. **Every commit recorded a clean lint result that was never computed.** When the gate was finally stood up it reported **148 problems on first execution**                                                      |
  | **The suppression suppresses nothing**             | Two of four `eslint-disable-next-line` directives did not do what their author believed: one `no-var` was separated from its statement by a comment line and applied to the comment; one named `react-hooks/exhaustive-deps`, a rule **not installed**. A suppression is a claim about a checker's behaviour, and an unrun checker never tests the claim                              |
  | **The snapshot was regenerated, not read**         | Rule 6.17a requires a whole-frame `toMatchInlineSnapshot()` per layout branch precisely so a caption drifting off its column fails loudly. Both required snapshots were present. Both were regenerated with `vitest -u` when the scope gutter changed and both came back green — **encoding the wrong layout as the expectation.** A regenerated snapshot is a proposal, not a result |
  | **The gate runs once and disarms itself**          | `BaseCommand.ensureTerminalSize()` ran in `init()`, before Ink mounts, and removed its own resize listener the moment the size became valid. It stopped you _launching_ small but not _becoming_ small — the wizard painted card borders through its own footer on any mid-session shrink                                                                                             |
  | **The spec captures and asserts nothing**          | Config snapshots taken under a comment reading `// BEFORE: Snapshot both configs` and compared against nothing; exit codes captured from two `doctor` runs with no assertion on either, one with the missing assertion **stated in English in its own comment**; an imported-but-never-called `expectCleanUninstall`                                                                  |
  | **The test exercises a forbidden input**           | `{ id: "web-framework-nonexistent" as any }` could not reach `resolveStack` through any type-checked path — `as any` was the sole reason it compiled. The spec asserted correct behaviour for a scenario that cannot occur, while the scenario that _can_ occur is its inverse                                                                                                        |
  | **The fixture cannot produce the symptom**         | One stack in the E2E source where production has a dozen: with one row there is nothing to overflow, so the overpaint under test never reaches the assertion                                                                                                                                                                                                                          |
  | **Prose claims exhaustiveness nothing re-derives** | `STEP_TEXT` enumerated "All 64 members" against a true 74, in two docs, one of which had recorded 72 a day earlier. **An exhaustive list that is short is worse than a glob, because it reads as authoritative** and no reader has cause to re-count                                                                                                                                  |

- **The aggravating shape, and the one to watch for in review: the artefact does not merely fail to catch the defect — it argues that the defect is intended.** Three instances:
  - The Sources-grid focused-row padding bug was the **worked example in a standards doc**, and two specs carried JSDoc explaining how they dodged it. The defect had been promoted to a rule.
  - The snapshots did not just miss the wrong layout; they **recorded it as the expectation**, so the next correct change would have failed against them.
  - A `catch` binding renamed to `_error` to satisfy a linter converts a discarded cause — a real bug in the command whose job is reporting causes — into documented intent.

  **A JSDoc explaining a workaround is a defect report unless some spec pins the un-worked-around form.**

- **Boundaries.** Pattern U is V restricted to the findings/doc pipeline auditing itself and keeps its letter because its remedies are pipeline-specific. Pattern M is V's _absent_-checker sibling; the two ESLint findings sit in both, and that overlap is the seam — the gate was absent (M) _and_ the checklist reported it passing (V). Q is about a surface that cannot carry the signal; V includes cases where the signal is perfectly visible.

- **Remedy — the general form: an artefact that has never reported a failure has not been shown to be capable of one.** Concretely, five checks, each cheap:
  1. **Run the gate before trusting the checklist item that names it.** A tool's first execution is a source of information, not a formality — this one returned 148 problems, five of which marked real defects.
  2. **A suppression must cite the compiler error or the mechanism that makes the rule inexpressible**, and be verified against a checker that actually runs. Prefer a scoped config override when the exemption is true of a whole file class (as `triple-slash-reference` is for `**/*.d.ts`).
  3. **A regenerated snapshot must be read, not accepted.** `-u` is a proposal.
  4. **A negative assertion needs a positive guard proving its subject is on screen**, and no rendering invariant should be asserted at a geometry where the subject does not render.
  5. **An exhaustive enumeration must be re-derived from source in the session that records it**, never extended. Grep the other surfaces for both the old and the new value before finishing.
- **Mechanical detectors that now exist and did not before:** `@typescript-eslint/no-unused-vars` over test files (finds unwritten assertions), `reportUnusedDisableDirectives` (blocked on a clean baseline, now unblocked — the 0.147.1 changelog records it as actionable), and grepping the importers of any constant a doc calls authoritative (finds gates reading a private copy).
- Standards: `CLAUDE.md`, `standards/clean-code-standards.md` (rules 6.17a and the `catch`-discards-cause rule), `standards/e2e/anti-patterns.md`, `standards/e2e/assertions.md`, `standards/documentation-bible.md`. Reference: `testing/infrastructure.md` (which gained "A regenerated snapshot is a proposal, not a result" 2026-08-01), `testing/e2e-infrastructure.md`, `component-patterns.md`.

## Cross-surface defects reported, not fixed

Defects found while regenerating this report that live in files **outside this pass's ownership**. Per `documentation-bible.md` -> "A Count Lives in Exactly One Document": _"If the other file is outside your ownership, record the mismatch in a file you do own — naming the stale file, its stale value, and its owner — and report it. Never leave two surfaces disagreeing unremarked."_ That is what this section is for.

| Stale surface                                                          | Stale claim                                                                                      | State                                                                                                                                                                                                                                                                                                                       | Owner             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `standards/documentation-bible.md` -> "Rollups must declare inference" | "As of 2026-07-30, 39 of 125 findings omit it"                                                   | **FIXED 2026-07-30 (status-backfill pass)** — the true figure is now zero                                                                                                                                                                                                                                                   | convention-keeper |
| `standards/documentation-bible.md` -> count-ownership registry         | Assigns "`defaultCategories` size + exclusive/required split" to `features/skills-and-matrix.md` | **OPEN.** That doc carries the figure only inside an HTML validation comment; the authoritative write-up is in `features/configuration.md`, and `architecture-overview.md` quotes it a third time. All three agree with disk **today** — so there is no live drift, which is precisely why it would have survived unnoticed | convention-keeper |
| `standards/documentation-bible.md` -> count-ownership registry         | Has no row for the status-distribution figure                                                    | **OPEN, carried forward.** This report owns it (see the snapshot-boundary callout); adding the registry row is the remaining preventive step against re-scattering it                                                                                                                                                       | convention-keeper |
| `standards/documentation-bible.md` -> Pattern U remedy (a)             | Specifies link integrity over `supersedes:` / `superseded_by:` / `blocked_by:`                   | **OPEN.** The scope excludes `related:` and `standards_docs:`, which name finding files just as often. Extending it found **4 dangling targets** the mandated scan cannot see — see "Link-integrity scope gap" above                                                                                                        | convention-keeper |
| `agent-findings/TEMPLATE.md` -> lifecycle-field pairing                | Records 7 pairing defects as STILL OPEN                                                          | **STILL OPEN, and still exactly 7** — re-scanned this pass, unchanged. Named individually under Priority Action 16                                                                                                                                                                                                          | convention-keeper |
| `agent-findings/TEMPLATE.md` -> `partial` OPEN QUESTION                | "`partial` has only one documented direction"                                                    | **OPEN and now materially larger.** `partial` is the plurality status at 67 of 158 (was 50 of 135). The question is no longer a labelling nicety — it makes a third of the directory's status column unreadable at a glance                                                                                                 | convention-keeper |

**Three of these six are the same defect as the finding class in Pattern S: a rule applied by
assignment rather than by re-derivation.** The count-ownership registry named owners topically; the
link-integrity remedy named the three keys its author had in mind. Both are correct rules whose
_execution_ skipped the step that would have made them true.

**Both figures in that claim were stale, for different reasons** — the denominator because the directory grew (125 -> 135), the numerator because a link-repair pass added `status: superseded` to three files (39 -> 36). A validator checking only one would have concluded the other was still good. **The status backfill made the whole claim moot rather than merely outdated:** the numerator is 0, so there is no live inference to declare.

The rule the sentence carries is still correct and was kept — a rollup quoting a status distribution must state how many files were inferred. Only its example was rewritten, from a live gap to a discharged one, so the rule no longer teaches by pointing at a defect that no longer exists.

The report's earlier entry claimed this figure appeared in **two** places in `documentation-bible.md`. Re-grepped this pass: it appears in **one**. The second occurrence had already been removed when the bible gained "A Count Lives in Exactly One Document" — the count was dropped from the tree annotation at the same time the Zod-schema count was. `agent-findings/TEMPLATE.md` carried the same figure and was corrected in this pass too.

**This was itself a Pattern O instance**, which is the point: "39 of 125" was written into three files at once, only one of which was re-derived when the findings directory changed. The count-ownership registry in `documentation-bible.md` still does not list the status-distribution figure — adding a row for it (owner: `reference/findings-impact-report.md`) is the remaining preventive step, and is now the only way a future pass avoids re-scattering it.

## Priority Actions (2026-08-01 regeneration)

27 findings are `high` severity: **10 `resolved`, 1 `superseded`, 16 still open or partial** (4 `open`, 12 `partial`). The window added one high-severity finding and closed none, so the not-closed figure moved 15 → 16.

**The composition matters more than the count. 12 of the 16 are `partial`, and nearly all of those are "the code fix shipped, the standard was never written."** The high-severity backlog is predominantly a _writing_ task. That is corroborated outside this report: the 0.147.0 and 0.147.1 changelogs each close with a "Proposed standards — not yet written into the standards docs" section, nine rules between them, none adopted.

**The single highest-leverage action in this report is therefore not on the list below.** It is: **adopt the nine unwritten Proposed Standards.** Doing so would close a large share of the 67 `partial` findings without touching a line of product code, and it is the direct remedy for the `rule-not-specific-enough` root cause overtaking `convention-undocumented` this window.

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

    **RE-SCANNED 2026-08-01 over all 158 findings. Defect classes (a), (b), (d), (e) and (f) all return ZERO — the repairs have held through a 23-file growth window, which is the first evidence they are self-sustaining rather than a one-off cleanup.** Class (c) reports one benign pair (two genuinely distinct `local-installer.ts` sweep findings filed the same day with the same `root_cause`); it is not merged. **Class (e) — the duplicate-detection key that cannot fire across dates — is STILL OPEN** and remains a checker-design problem, Pattern U remedy (c).

    **Status distribution, re-derived on disk over all 158 findings:** `partial` 67, `open` 42, `resolved` 41, `superseded` 8 = **158 explicit, 0 inferred**. The documentation-bible's "declare your inference" requirement is satisfied trivially — there is none. This is the same basis as the primary rollup table above.

    **The seven lifecycle-field pairing defects are STILL OPEN and still exactly seven** — re-scanned this pass, none repaired, none added. Named individually so the next pass need not re-derive the list: three `status: resolved` with no `resolved_by:` (`2026-07-19-ink-prompt-closure-lets-hang-anti-pattern`, `2026-07-19-post-construction-conditional-mutation-on-serialized-objects`, `2026-07-20-shared-mutable-constants-and-false-dry`); one `status: open` carrying a `resolved_by:` (`2026-04-21-ralph76-memory-md-stale-phase-entries`); three `status: superseded` carrying an extra `resolved_by:` beside a correct `superseded_by:` (`2026-07-17-d227-same-scope-active-tombstone-duplicate`, `2026-07-18-scope-guards-read-stale-hydration-snapshot`, `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable` — the last also carries a `partial_note:`). The first four are unambiguous defects; the last three may be legitimate and `TEMPLATE.md` should decide whether recording both the replacement and the underlying fix is sanctioned. **The pairing check is a four-line script, has now been run twice, and has repaired nothing on either occasion** — which makes it a Pattern V instance in its own right: a check that runs, reports, and changes nothing is not enforcement.

    **What the backfill changed about this section's own premise:** it was listed at LOW priority and described as the highest-value item in the section, and both were right for different reasons than expected. It did not just convert a 52%-inferred rollup into a measurement — it showed the inference was **wrong for 30 of the 36 files**, not merely unproven. Nine findings that every rollup counted as `open` had in fact been fully resolved, three of them `high` severity. A convention that reads an absent field as "not done" does not fail gracefully; it manufactures a backlog.

    **Remaining work:** only (e), the duplicate-detection key, plus the other structural checker fixes in Pattern U's remedy list. Newly observed while backfilling, and **not** repaired here because it is outside this pass's brief: seven further lifecycle-field pairing defects exist among files that already had a `status:` — three `status: resolved` with no `resolved_by:` (`ink-prompt-closure-lets-hang-anti-pattern`, `post-construction-conditional-mutation-on-serialized-objects`, `shared-mutable-constants-and-false-dry`), one `status: open` carrying a `resolved_by:` (`ralph76-memory-md-stale-phase-entries`), and three `status: superseded` files carrying an extra `resolved_by:` — one of them also a `partial_note:` — alongside their correct `superseded_by:` (`d227-same-scope-active-tombstone-duplicate`, `scope-guards-read-stale-hydration-snapshot`, `derived-mask-and-user-tombstone-are-indistinguishable`). The last three are arguably informative rather than defective and the question is whether `TEMPLATE.md` should sanction recording both the replacement and the underlying fix; the first four are unambiguous defects. **A pairing check is a four-line script and has never been run** — the same shape as Pattern U's link-integrity finding, which is exactly how these survived a full regeneration.

17. **`scripts/` typecheck gate** — `untypechecked-scripts-hid-phantom-tags-and-invalid-skillids` (Pattern I); add `typecheck:scripts`.
18. ~~**Dead result field** — remove `ConfigWriteResult.globalConfigPath` (`configwriteresult-globalconfigpath-declared-never-populated`); refresh `types/operations-types.md`.~~ — **CLOSED 2026-07-30, both halves verified on disk.** The field is gone from the `ConfigWriteResult` type in `src/cli/lib/operations/project/write-project-config.ts` (remaining members: `config`, `configPath`, `wasMerged`, `existingConfigPath?`, `filesWritten`, `propagatedProjects`). Every surviving `globalConfigPath` identifier in `src/` is an unrelated **local variable** inside `local-installer.ts` (`getProjectConfigPath(homeDir)`), not a result field. Three reference docs were refreshed and now state the deletion positively rather than silently dropping the row — `types/operations-types.md`, `features/operations-layer.md` and `features/configuration.md` each record that it was declared optional, never populated, never read, and was removed rather than left as dead surface a future reader could reach for.

### Added by the 2026-07-30 regeneration

Both are pipeline-integrity items rather than product work, which is why they sit outside the HIGH/MEDIUM/LOW product ranking above. **Item 19 should be treated as HIGH** — it is the mechanism that produced two of the seven link defects this pass repaired.

19. **Enforce the never-delete rule on `agent-findings/`** — **HIGH for pipeline integrity, and NOW WORSE THAN RECORDED.** At least three findings named in `changelogs/0.137.0.md` and `changelogs/0.141.8.md` are absent from disk, and 0.141.8 removed a batch of that release's resolved findings at once. It silently truncates the Date Range this report can cover — the 2026-03-21..2026-04-16 window is simply gone. **2026-08-01 update: the blast radius is larger than the 2026-07-30 pass could see.** That pass found 2 dangling `supersedes:` / `blocked_by:` targets; extending the scan to `related:` and `standards_docs:` this pass found **4 more**, all pointing into the same deleted window. **No finding has been deleted since 2026-07-30** — the rule is holding — but the historical damage keeps surfacing as each new scan widens. Resolution is a frontmatter edit, never a deletion; `README.md` already says so.

20. ~~**Install ESLint or strike the gate.**~~ — **CLOSED 2026-08-01, both halves verified by running the tool.** The toolchain landed in 0.146.1 (flat config, `npm run lint`, wired into `lint-staged` and `prepublishOnly`) and the baseline reached **zero** in 0.147.1 with **no rule disabled**. Verified this pass: `npx eslint .` exits **0** with no output. Exactly **four** inline suppressions remain, each justified in place — two pre-existing `no-control-regex` for ANSI/control-character patterns (`lib/configuration/config.ts`, `utils/exec.ts`), one `no-var` that must stay (`let` would throw a TDZ error in circular ESM imports, `__tests__/factories/skill-factories.ts`), and one `@typescript-eslint/no-unused-vars` on a Vitest `Assertion<T>` interface augmentation where the rule's `^_` escape hatch fails to compile (`TS2428`: merged declarations match on the parameter's _name_). The three remedies this item blocked are now unblocked. **Residual, tracked as item 22.**

### Added by the 2026-08-01 regeneration

21. **Adopt the nine unwritten Proposed Standards** — **HIGHEST LEVERAGE ITEM IN THIS REPORT.** Listed in the 0.147.0 and 0.147.1 changelogs and reproduced across Patterns Q, R, S, T and V: a negative rendering assertion needs a positive subject guard; never assert a rendering invariant at a geometry where the subject does not render; a JSDoc explaining a workaround is a defect report unless some spec pins the un-worked-around form; a regenerated geometry snapshot must be read, not accepted; widen CLAUDE.md's cast rule to name `as any` explicitly; a `catch` that discards its cause in a user-facing path is a bug, not a lint nuisance to be renamed `_error`; an unused binding in a test file is triaged as a missing assertion before deletion; a bar for `eslint-disable` (cite the compiler error or the mechanism, prefer a scoped config override); fixture cardinality must exceed the viewport a spec tests. **These nine are the code-shipped-standard-unwritten half of a large share of the 67 `partial` findings.** Standards: `CLAUDE.md`, `standards/clean-code-standards.md`, `standards/e2e/anti-patterns.md`, `standards/e2e/assertions.md`, `standards/e2e/test-data.md` (all convention-keeper's domain).

22. **Finish the ESLint rule set now that the baseline is zero** — MED. Three items were deliberately deferred to keep the initial config stock, and all three are now actionable for the first time: (a) `reportUnusedDisableDirectives`, which was blocked on a clean baseline and would have caught both of this window's dead-directive defects; (b) a `no-restricted-syntax` rule for task-IDs in test names, which `d167-task-id-recurrence-no-lint-guard` has needed since 2026-07-17 and which Pattern M has listed as un-actionable for two regenerations; (c) **`eslint-plugin-react-hooks` is not installed at all**, so this Ink/React codebase has no hooks linting — two effects in `use-measured-height.ts` would be flagged if it were, and the correct response there is `useCallback` on `measure`, not widening dependency arrays.

23. **Re-validate `concepts/tombstone-pattern.md` and `component-patterns.md`** — HIGH, and the only two reference docs the 2026-08-01 sweep left materially exposed. `tombstone-pattern.md` is the most-referenced reference doc in the corpus (11 findings), maps to the corpus's most-cited source file, and **the sweep did not touch it at all**. `component-patterns.md` took the largest single-window jump in this report's history (2 → 10), owns all four `source-grid.tsx` findings and the whole Ink-layout cluster, and after two PARTIAL passes is still not re-stamped.

24. **Extend the findings link-integrity scan to `related:` and `standards_docs:`** — MED, one line of scope. The mandated scan covers three keys; extending it to the two that also name finding files found **4 dangling targets** on first run, three of them from the deleted 2026-03-21..2026-04-16 window. Also repair the two path defects this pass recorded but does not own: `scratchpad/d226-porting-recipe.md` is named in two findings and does not exist, and three findings carry machine-specific absolute paths beginning `/home/vince/`, which CLAUDE.md forbids in any git-tracked file. Standards: `standards/documentation-bible.md` (Pattern U remedy (a)).

25. **Resolve `TEMPLATE.md`'s `partial` direction question** — MED, and no longer cosmetic. `partial` is now the plurality status at **67 of 158**, and it carries two opposite meanings distinguished only by prose in `partial_note:`. Either widen the enum (e.g. `partial-code` / `partial-standard`) or state in `TEMPLATE.md` that `partial` covers both directions and the note MUST name which. Until then the status column is unreadable at a glance for 43% of the directory. Owner: `agent-findings/TEMPLATE.md`.

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
- Agent compilation: config.ts entry, `agents-inc compile`, scope routing
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

_**Reset 2026-08-01** (full regeneration — all **158** findings rebuilt into the primary tables above). This section was **already empty** when the regeneration began: the 23 new findings were never logged here, because the 0.146.1 / 0.147.0 / 0.147.1 releases shipped before the >10 entry threshold was reached, and the release-bundle trigger fired first. Patterns A..U carried forward with widened statements for G, M, Q, R, S and T; **Pattern V newly named**. Next regeneration trigger: >10 entries accumulated here, OR the oldest un-aggregated finding exceeds 30 days, OR a major release bundle ships._

**This section is empty. Window opens: 2026-08-01 (post-regeneration).** Findings filed after the 158-file snapshot go here, not into the primary tables.

**Snapshot boundary for the next validator:** the primary tables are pinned at **158 findings** (**160 `.md`** including `README.md` and `TEMPLATE.md`). A recount that returns a different number means findings were filed (log them here) or deleted (a rule violation — see Priority Action 19).

> **If your recount says 158, you have counted `README.md`.** It is not a finding. This is not
> hypothetical — the brief handed to the 2026-08-01 regeneration carried 158, and the pass had to
> re-derive the basis to catch it. The corpus is defined in `documentation-bible.md` as every
> `*.md` "other than `README.md` and `TEMPLATE.md`", and every regeneration in this file's lineage
> has used that definition. **Subtract one; do not reconcile two bases.**

There is a single basis in this report; do not introduce a second by folding entries in piecemeal.

Nothing in `.ai-docs/agent-suggestions/` is awaiting a decision — both proposals cross-referenced from Patterns E and Q carry a terminal `status:` in their own frontmatter, which is the authoritative record.
