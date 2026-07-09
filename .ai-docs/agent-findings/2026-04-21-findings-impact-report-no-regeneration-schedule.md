---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/reference/findings-impact-report.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolution_note: Append-only regeneration policy codified in documentation-bible.md under "Findings Impact Report Regeneration" (append flow, full-regeneration triggers, regeneration procedure, cadence). reference/findings-impact-report.md already carries Incremental Updates section and last_validated bump; DOCUMENTATION_MAP.md entry refreshed earlier. Pattern 11 in the report references this codification (iter 49).
---

## What Was Wrong

`reference/findings-impact-report.md` framed itself as a one-shot snapshot ("Generated: 2026-03-28, Total Findings Analyzed: 75") with no schema for appending new findings. Between 2026-03-28 and 2026-04-21 roughly two dozen new findings were filed — including the entire D-217/D-228/D-229/D-230/D-232/D-233 cluster and nine same-day reference-doc drift findings on 2026-04-21 — none of which appeared in the report. DOCUMENTATION_MAP.md listed its staleness threshold as 30 days with `Next Action: Regenerate as needed`, so the report technically stayed "OK" on the dashboard while being materially incomplete.

## Fix Applied

- Reframed the report header: `last_validated` bumped to 2026-04-21, counts updated, explicit note that post-snapshot batches live in an "Incremental Updates" section at the bottom and are NOT folded back into the original summary tables without a full regeneration.
- Added two batch sections (2026-04-20 and 2026-04-21) mapping each new finding to the reference doc it impacts, plus an "Actions" list per batch.
- Added Systemic Patterns 6–8 (observability gaps in `local-installer.ts`; E2E keypress rule under-enforced; reference-doc drift sweep) to extend the original pattern numbering.
- Updated DOCUMENTATION_MAP.md entry + Staleness Dashboard comment.

## Proposed Standard

Codify an explicit policy in `documentation-bible.md` (or as a header convention in the report itself):

1. `findings-impact-report.md` is append-only between full regenerations. Each batch gets a dated H3 under "Incremental Updates" with (a) a finding → impacts table, (b) an actions list, (c) any new systemic patterns.
2. A full regeneration is triggered when either (a) an incremental batch would add more than ~15 entries, or (b) the oldest un-aggregated finding is more than 30 days old. Whichever comes first.
3. When a full regeneration occurs, the original snapshot table is replaced wholesale; the "Incremental Updates" section resets to empty.
4. DOCUMENTATION_MAP.md should track the date of the LAST incremental append, not only the last full regeneration, so staleness is visible.
