---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/page-objects.md
standards_docs:
  - .ai-docs/standards/e2e-testing-bible.md
  - CLAUDE.md
date: 2026-04-21
reporting_agent: ralph-loop
category: architecture
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: e2e/README.md, assertions.md, anti-patterns.md, page-objects.md all updated with keypress rule (no qualifier), arrayContaining prohibition, parser/extractor ban, broadened task IDs rule, and waitForStableRender reminder
---

## What Was Wrong

CLAUDE.md cites `.ai-docs/standards/e2e/README.md` as required reading before E2E work, but the modular `e2e/` standards directory had drifted behind the iter-56-consolidated `e2e-testing-bible.md`. Four rules codified in the bible and CLAUDE.md were missing or stale in the modular docs:

1. **Keypress rule qualifier (stale).** `README.md` said "before the press if it's the first interaction after a wizard launch or step transition" — the exact qualifier that `2026-04-21-e2e-build-step-keypress-missing-stable-render.md` named as the reason seven BuildStep methods drifted. The bible already dropped the qualifier; the modular doc still carried it.

2. **`expect.arrayContaining` on diff-shape collections (missing).** Bible rule 6.7 and `2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md` both forbid `arrayContaining` for info-panel / config-section / scope-prefix diffs — it silently tolerates extra wrong entries (spurious `- React` row alongside expected `• React`). `assertions.md` and `anti-patterns.md` had no mention.

3. **Parser/extractor helpers in test files (missing).** Bible rule 10.13 and `2026-04-21-complex-helpers-in-component-tests-anti-pattern.md` forbid loops, regex scans, and state-machine `currentScope` variables that pluck data out of `lastFrame()`. CLAUDE.md § Test Assertions has the rule. `assertions.md` and `anti-patterns.md` had no mention.

4. **Task IDs rule too narrow.** `README.md` and `anti-patterns.md` said "No task IDs in `describe()` blocks" — CLAUDE.md and bible 1.3 broaden this to `describe()` + `it()` names, assertion messages (2nd arg to `expect`), and inline test-body comments. `2026-04-21-task-ids-in-test-names-sweep-needed.md` reports 151 occurrences across 30 files pending sweep.

## Fix Applied

1. `.ai-docs/standards/e2e/README.md` § Critical Rules:
   - Rewrote the keypress rule without the "first interaction" qualifier.
   - Added "Diff-shape assertions prove BOTH positive and negative shape" rule with `arrayContaining` prohibition and exhaustive-negation pattern.
   - Added "No parser/extractor helpers in test files" rule.
   - Broadened task IDs rule to cover `it()`, assertion messages, and comments.

2. `.ai-docs/standards/e2e/assertions.md`:
   - Added new `## Diff-Shape Assertions` section with `arrayContaining` prohibition, exhaustive-negation pattern for shared prefixes, and parser-helper prohibition.

3. `.ai-docs/standards/e2e/anti-patterns.md`:
   - New section `## Parser/Extractor Helpers in Test Files` with the three-reason rationale (no tests for the helper, obscures contract, drops bug-shape negative) and cross-ref to two findings.
   - New "Never use `expect.arrayContaining` for diff-shape collections" bullet under Weak Assertions.
   - Broadened the carried-forward "No task IDs" bullet with JSDoc-only scope and cross-ref to the 151-occurrence sweep finding.

4. `.ai-docs/standards/e2e/page-objects.md`:
   - Added one-line reminder to the "Adding a New Wizard Method" section: never call `pressKey`/`pressSpace`/`pressEnter`/`pressEscape`/`pressArrowX`/`session.*` without a preceding `waitForStableRender()` in the same method.

## Proposed Standard

The modular `e2e/` directory needs a regeneration discipline: when `e2e-testing-bible.md` changes, diff it against the modular docs and propagate. Two approaches:

- **Treat the bible as source of truth** and make the modular docs views over it (risk: double-maintenance if someone edits only the view).
- **Retire `e2e-testing-bible.md`** once the modular docs reach parity, and keep CLAUDE.md as the ground-truth entry point citing `e2e/README.md`.

The second is cleaner — the bible was a consolidation artifact from iter 56, and now that the modular structure exists, having two copies invites drift. Recommend adding to `TODO.md` a "retire e2e-testing-bible.md after next sweep" item, with the interim rule: "if you edit one, grep the other for the same rule and update both."
