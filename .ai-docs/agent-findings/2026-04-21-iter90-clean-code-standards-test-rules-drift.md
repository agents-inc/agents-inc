---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/clean-code-standards.md
  - CLAUDE.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: ralph-loop
category: testing
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: §6.2 factory paths corrected; §6.11 (no TODO IDs in test names) and §6.12 (toStrictEqual) added to clean-code-standards.md in iter 90.
---

## What Was Wrong

Two categories of drift between `CLAUDE.md` and `.ai-docs/standards/clean-code-standards.md`:

1. **Test rules lived only in CLAUDE.md.** Two project-specific testing conventions were enforced in CLAUDE.md but missing from the reviewer-checkable standards doc:
   - "NEVER put TODO/task IDs in test `describe()` blocks" — names outlive the tickets they reference, leaving meaningless ID noise scattered across the test suite.
   - "ALWAYS use `toStrictEqual` (not `toEqual`) for object and array comparisons" — `toEqual` silently tolerates extra keys with `undefined` values, so return-shape drift slips through.

   Sub-agents reading only `clean-code-standards.md` (common during review tasks) would not see these rules.

2. **§6.2 factory paths were stale.** The table still pointed at a single `__tests__/helpers.ts` file. The actual structure, confirmed by directory listing, is:
   - `__tests__/factories/` (skill/matrix/category/agent/plugin/stack/config factories)
   - `__tests__/helpers/` (cli-runner, disk-writers, test-dir-setup, config-io, isolated-home, wizard-simulation)
   - `__tests__/mock-data/` (mock-skills, mock-matrices, mock-agents, mock-sources, mock-categories, mock-stacks, mock-source-files)
   - `__tests__/fixtures/create-test-source.ts`

   The consolidation happened earlier but §6.2 never tracked the move, so the standards doc pointed readers at a non-existent location.

## Fix Applied

- Rewrote §6.2 table to reference the real directories.
- Added §6.11 (no task IDs in test names/messages/comments) with BAD/GOOD examples.
- Added §6.12 (`toStrictEqual` for object/array equality) with BAD/GOOD examples.

## Proposed Standard

Introduce a **periodic CLAUDE.md ↔ `clean-code-standards.md` bidirectional sync check** as a Ralph-loop sweep:

- For each NEVER/ALWAYS bullet in CLAUDE.md under "Test Data", "Type Safety", "Code Style", "Data Integrity", verify the same rule has a numbered entry in the corresponding standards section.
- For each §N.M rule in `clean-code-standards.md`, verify it does not contradict CLAUDE.md.
- Treat any path/filename reference in `clean-code-standards.md` tables as a drift candidate — re-verify against the filesystem on each consolidation.

Both documents are authoritative; neither can be the single source without losing their distinct purposes (CLAUDE.md = behavioral rules for Claude, standards doc = reviewer-checkable rules for humans). A periodic sync is the cheapest way to prevent silent divergence.
