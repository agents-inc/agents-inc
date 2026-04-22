---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/DOCUMENTATION_MAP.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
---

## What Was Wrong

Iter 43 audit of DOCUMENTATION_MAP.md against itself (not against source code) surfaced a drift class distinct from content-vs-code drift: **the map drifted from its own schema** across ~42 iterations of row-level validations and date bumps. Specific instances:

1. **Header `Total Areas: 30` stale** after New Files grew to 14 (config-merger.md iter4, scope-split.md iter5 added 2026-04-21). No iteration bumped the header count.
2. **Duplicate dashboard row** — `type-system.md (pointer)` appeared as a second row after the real `type-system.md` row was annotated CONVERTED TO POINTER in iter41. Two rows describing one file.
3. **Staleness-dashboard vs Reference-table mismatches** — three rows (`compilation-pipeline.md`, `operations-layer.md`, `agent-system.md`) showed `Days Stale: 11` while the Reference table showed `Last Validated: 2026-04-21`. `dependency-graph.md` inverted: dashboard `0` (iter32 today), Reference table `2026-04-02`. Neither surface was authoritative — drift accumulated in whichever one a given iter forgot.
4. **`Date basis: 2026-04-13`** stale — effectively the map's self-reported "as of" date had not been updated in 8 days despite dozens of row updates.
5. **`Notes for Next Session`** still referenced 2026-04-02 audit context.

None of these were caught by link-integrity audits (iter29, iter30) because they are internal-consistency issues, not cross-file link issues.

## Fix Applied

Applied surgical edits in iter 43:

- Header count 30→32 (18 original + 14 new).
- Removed duplicate `type-system.md (pointer)` row.
- Bumped the three `11 → 0` dashboard rows with corrective annotations.
- Bumped `Dependency Graph` Reference-table row `2026-04-02 → 2026-04-21`.
- Rewrote `Date basis` note and `Notes for Next Session` to reflect iter 43 state.
- Added iter 43 Validation History entry documenting the audit.

All 41 `reference/*.md` files on disk verified to be accounted for (32 tracked in Reference tables, 9 pointer files tracked only in the directory-structure diagram by prior convention — consistent with iter 20 Phase 2+3 decision).

## Proposed Standard

Add a **Map Self-Consistency Audit** section to `.ai-docs/standards/documentation-bible.md` specifying that every Nth iteration (recommend N=10), agents must run the following checklist against the map itself, not just its rows:

1. **Count invariants:** `Total Areas` header == (count of Reference-table rows). `Documented` == `Total Areas`.
2. **Row uniqueness:** no file appears in more than one staleness-dashboard row.
3. **Cross-surface sync:** for each tracked doc, `Days Stale` in the dashboard must be consistent with `Last Validated` in the Reference table (same date basis, ±0).
4. **Disk vs map:** `find reference -name '*.md' | wc -l` equals tracked-row count + pointer-row count (9 by current convention).
5. **Header date fields:** `Last Updated`, `Last Validated`, and `Date basis` must not lag behind the newest annotation in any row by more than 1 day.

When a map self-audit runs, the iter number and fixes should be recorded in the Validation History in the same format as content-validation iters.

Rationale: content-validation iters read the map to decide what to touch next, but never look at the map as a whole. Over 40+ iterations, silent row-level drift accumulates even while individual rows are kept current. A periodic self-audit catches this class of drift at near-zero cost.
