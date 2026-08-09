---
type: convention-drift
severity: medium
affected_files:
  - e2e/lifecycle/compile-after-scope-change.e2e.test.ts
  - e2e/lifecycle/dual-scope-edit-source-changes.e2e.test.ts
  - e2e/lifecycle/dual-scope-edit-scope-changes.e2e.test.ts
  - e2e/lifecycle/scope-toggle-combined.e2e.test.ts
  - e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
  - e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
  - e2e/lifecycle/config-scope-integrity.e2e.test.ts
  - plus ~20 more test files (151 D-NNN occurrences across 30 files)
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - CLAUDE.md
date: 2026-04-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: open
status_verified: 2026-04-21
status_note: >-
  Sweep not performed. Re-scanned test files — 160 D-NNN occurrences across 34 files (up from the
  original 151/30). Rule exists in CLAUDE.md but no sweep ticket filed and no lint guard added. Top
  offenders unchanged: dual-scope-edit-scope-changes (24), info-panel-scope-toggle-diff (18),
  scope-toggle-combined (15).
---

## What Was Wrong

CLAUDE.md forbids task IDs (`D-NNN`) in `describe()` / `it()` names, assertion
messages (2nd arg to `expect`), and inline test-body comments. File-level
JSDoc may retain them for historical context. The rule exists but was added
after most tests were written, so drift is widespread: **151 D-NNN
occurrences across 30 test files** (both `e2e/` and `src/cli/**/*.test.{ts,tsx}`).

Worst offenders (by count):

- `e2e/lifecycle/dual-scope-edit-scope-changes.e2e.test.ts` (24)
- `e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts` (18)
- `e2e/lifecycle/scope-toggle-combined.e2e.test.ts` (15)
- `e2e/lifecycle/compile-after-scope-change.e2e.test.ts` (9)
- `e2e/lifecycle/dual-scope-edit-source-changes.e2e.test.ts` (8)
- `e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts` (8)

Impact: test output is unreadable without tribal knowledge of ticket
history; ticket IDs drift out of sync with the behavior they originally
described; new contributors can't tell from a failing test name what was
actually broken.

## Fix Applied

None — discovery only. The current session's scope was limited to the
four files touched in the 0.141.0 bundle (`init-edit-compile-roundtrip`,
`project-tracking-propagation`, `plugin-install-failure-hard-error`,
`step-confirm.test.tsx`). Those four are now clean.

## Proposed Standard

1. **Add a repo-wide sweep ticket** to rename every `describe()` / `it()` /
   assertion message / inline comment that contains `D-\d+` to describe
   behavior instead. File-level JSDoc may retain the reference.

2. **Add the rule to `.ai-docs/standards/e2e/README.md`** under a
   "Test naming" section so E2E-specific contributors see it without
   reading CLAUDE.md cover-to-cover. Suggested wording:

   > Test names and assertion messages describe behavior, not tickets.
   > Never include `D-NNN` in `describe()` / `it()` names, assertion
   > messages (2nd arg to `expect`), or inline test-body comments. The
   > only permitted location is file-level JSDoc at the top of the file,
   > for scenario context.

3. **Add a lint rule / pre-commit grep** that fails when `D-\d+` appears
   inside a `describe(` / `it(` / `expect(` call. Cheap and catches
   regressions immediately. Example ripgrep:
   `rg -n "(describe|it)\([^)]*D-\d+" --glob '*.test.*'`

4. **Sweep guidance**: do it file-by-file, not as one giant rename, and
   re-run each file's test after the rename. Preserve any load-bearing
   rationale in the comment (strip only the `D-NNN` token, not the
   surrounding explanation).

## Docs Landed — 2026-04-21

Item 2 is already landed — `.ai-docs/standards/e2e/README.md` § "File
Naming" carries the rule ("No task IDs (`D-NNN`) in `describe()` /
`it()` names, assertion messages (2nd arg to `expect`), or inline
test-body comments. File-level JSDoc at the top of the file is the
only permitted location."). It mirrors the CLAUDE.md Test Data rule
so E2E contributors see it without reading CLAUDE.md cover-to-cover.

Items 1 (repo-wide sweep ticket), 3 (lint rule / pre-commit grep),
and 4 (sweep guidance) remain — none are docs slices. A sweep ticket
or lint guard is the only way to close the gap; the rule itself is
fully visible in both CLAUDE.md and the e2e standards doc. Finding
status stays `open` until the sweep runs (current: 160 occurrences
across 34 files).
