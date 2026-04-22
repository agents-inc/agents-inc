---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/component-patterns.md
  - .ai-docs/DOCUMENTATION_MAP.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
---

## What Was Wrong

`component-patterns.md` (last_validated 2026-04-13) had two drift points relative to current code:

1. **Stale hotkey row.** `HOTKEY_COPY_LINK (C)` listed in the hotkey table, but the symbol was removed in the 0.130.0 orphaned-constants cleanup (see `changelogs/0.130.0.md`). The DOCUMENTATION_MAP.md pass-23 note also incorrectly claimed it "exists in hotkeys.ts."

2. **SkillAgentSummary diff baseline outdated.** The doc described only `prevSourceMap` construction and did not explain the D-230/D-232 slot-occupancy semantics:
   - Baseline (`prevSkillKeySet`, `removedSkills`) is NOT pre-filtered to active entries — tombstones remain first-class occupants of their `(id, scope)` slot.
   - `removedSkills` matches on slot-occupancy (`!currentSkills.some((c) => c.id === s.id && c.scope === s.scope)`), so a current tombstone at the same key keeps the slot occupied and prevents a spurious `-` (D-230) or `+` (D-232).
   - Only `prevSourceMap` filters to `!excluded` baseline entries, because tombstones don't represent a live install source.
   - `uniqueExcludedGlobalSkills` dedups against inherited-global entries by id; no dedup against `removedGlobalSkills` is needed under slot-occupancy.
   - `isInitMode` gates `removedGlobalSkills` / `removedGlobalAgents` to empty arrays.

3. **Missing pattern: CategoryGrid mount-effect focus seeding.** The `mountedRef` + `useEffect(() => {...}, [])` in `category-grid.tsx` that fires `onFocusedSkillChange` with the initial cell's `SkillId` once on mount was undocumented. This seed is the Scenario B race root — consumers must not read `focusedSkillId` synchronously post-transition.

## Fix Applied

- Removed the stale `HOTKEY_COPY_LINK` row.
- Rewrote the SkillAgentSummary section to document the slot-occupancy pattern, tombstone dedup rationale, source-change-only filter, and init-mode gating.
- Added the CategoryGrid mount-effect focus seeding pattern with a cross-reference to `state-transitions.md` Scenario B.
- Added `concepts/tombstone-pattern.md` and `concepts/guard-pattern.md` to the `related:` frontmatter.
- Updated `DOCUMENTATION_MAP.md` staleness-note for component-patterns.md and corrected the HOTKEY_COPY_LINK claim in the pass-23 notes.

## Proposed Standard

When a changelog entry lists "orphaned constants and messages" that were removed, a grep pass over `.ai-docs/` for every removed symbol should be part of the release checklist (adjacent to `standards/commit-protocol.md`). Current TODO item at `docs/reference/commands.md:350` already calls this out; consider promoting it into the commit-protocol standard so it fires on every removal, not just one-off cleanup sweeps.
