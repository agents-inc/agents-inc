---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/reference/findings-impact-report.md
  - .ai-docs/agent-findings/TEMPLATE.md
  - .ai-docs/agent-findings/README.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  The 2026-07-30 regeneration works around the snapshot gap in prose (it states the
  snapshot caveat and the mid-pass arrival count in the report header) and records the
  three schema defects under Priority Action 16. Neither the snapshot rule nor the
  frontmatter-schema gate is codified yet — both belong in convention-keeper-owned docs
  (`documentation-bible.md` and `TEMPLATE.md`).
---

## What Was Wrong

Two self-governance gaps in the findings system, both hit while performing the
2026-07-30 full regeneration of `findings-impact-report.md`.

### 1. The regeneration procedure has no snapshot rule

`documentation-bible.md` -> "Findings Impact Report Regeneration" step 1 says
"Enumerate every finding under `.ai-docs/agent-findings/*.md` that falls in the target
window." It assumes the directory is static during the pass.

It is not. This regeneration ran inside a concurrent multi-agent documentation sweep.
The directory was enumerated at the start of the pass (115 files) and again before
writing (121 files) — six 2026-07-30 doc-hygiene findings were filed by sibling agents
mid-pass. Every count in the report (status, severity, root cause, category, domain,
per-file churn) is derived from that enumeration, so a rollup built from the first
count and a "Total Findings Catalogued" line written from the second would have been
internally inconsistent, with nothing to detect it: the tables are prose, not a
computed artifact.

The failure mode is silent and self-reinforcing. A future validator recounting the
directory finds a different total than the header claims and cannot tell whether the
report is stale, was built from a partial snapshot, or the directory grew since.

### 2. The directory's frontmatter has drifted from `TEMPLATE.md`

Three defects, all machine-detectable, all present today:

| Defect                                                                                                       | Count | Example                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------- |
| `type:` value outside the `TEMPLATE.md` enum — `enforcement-gap` is a `root_cause` value, not a `type` value | 1     | a spec-hygiene finding, corrected to `type: standard-gap` and since deleted |
| `superseded_by:` present without the paired `status: superseded`                                             | 1     | a dual-scope agent-toggle finding, since deleted                            |
| No `status:` field at all (README default is `open`, so the rollup must infer it)                            | 39    | `2026-04-22-edit-mode-scope-awareness-systemic-audit.md` and 38 others      |

The 39 status-less files matter to every rollup: 30 files carry an explicit
`status: open` and 39 carry none, so "open = 69" is 43% inference. The
`documentation-bible.md` "Agent Findings Frontmatter" section already mandates a
pre-processing pass scanning for "(a) files without frontmatter, (b) `root_cause`
values outside the enum, (c) duplicate `affected_files + root_cause + date` tuples" —
but that list covers neither an out-of-enum `type:` value nor an unpaired
supersession link nor a missing `status:`, which are the three that actually drifted.

`2026-04-21-agent-findings-frontmatter-drift-iter45.md` (status `partial`) covers the
older "body `**Date:**` lines instead of YAML frontmatter" shape; these three are
different defects and are not tracked by it.

## Fix Applied

None to the findings themselves — a codex-keeper reference-doc sweep must not rewrite
other agents' findings, and `TEMPLATE.md` / `documentation-bible.md` are
convention-keeper's domain.

Worked around in the 2026-07-30 regeneration:

- The report header now carries an explicit **snapshot caveat** naming the concurrency,
  stating that the six mid-pass 2026-07-30 findings ARE included, and directing anything
  filed later to "Incremental Updates".
- All rollups were rebuilt from a single final enumeration so the tables are mutually
  consistent, and the "Incremental Updates" window is dated "2026-07-30 (post-snapshot)"
  rather than just "2026-07-30".
- The three schema defects are recorded verbatim as Priority Action 16 of the
  regenerated report, and the unpaired `superseded_by:` is called out inline under
  "By Status" alongside the supersession-chain table.

## Proposed Standard

**A. `documentation-bible.md` -> "Findings Impact Report Regeneration" -> "Regeneration
procedure".** Insert a step 0 and amend step 1:

> 0. **Pin the snapshot.** Enumerate the directory ONCE, record the resulting file count
>    and the newest filing date in the report header, and derive every rollup from that
>    single enumeration. If the directory grows mid-pass (concurrent agents), either
>    re-run the enumeration and rebuild ALL tables, or leave the late arrivals for
>    "Incremental Updates" — never mix. State which choice was made in the header.
> 1. ... (existing text) ... The header MUST carry: total file count, date range, and a
>    one-line snapshot caveat when the pass ran alongside other agents.

Rationale: the rollups are hand-authored prose derived from a directory listing. Without
a pinned snapshot the report has no reproducible basis, and the "Total Findings
Catalogued" line silently becomes the only claim a validator can check.

**B. `documentation-bible.md` -> "Agent Findings Frontmatter".** Widen the mandated
pre-processing scan from three checks to six:

> A pre-processing pass by convention-keeper / codex-keeper scans for (a) files without
> frontmatter, (b) `root_cause` values outside the enum, (c) duplicate
> `affected_files + root_cause + date` tuples, **(d) `type:` values outside the
> `TEMPLATE.md` enum, (e) `superseded_by:` / `supersedes:` without the paired
> `status: superseded`, (f) missing `status:`**.

**C. `TEMPLATE.md`.** Make `status:` a required field rather than an "Optional lifecycle
field", defaulting explicitly to `open`. 39 of 121 files omitting it means every rollup
that reports a status distribution is a third inference; requiring it costs one line per
finding and makes the distribution directly countable.
