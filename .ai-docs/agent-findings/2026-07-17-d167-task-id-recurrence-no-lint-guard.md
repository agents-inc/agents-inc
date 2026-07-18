---
type: standard-gap
severity: low
affected_files:
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts
  - e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - e2e/interactive/init-wizard-plugin.e2e.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-07-17
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
---

## What Was Wrong

CLAUDE.md already states the rule ("NEVER put TODO/task IDs in test names, assertion messages, or inline test comments") and D-167 was opened once to fix 3 known violations. Investigating D-167, a repo-wide grep found the pattern had reappeared independently at least 5 more times since — task IDs inside `describe()`/`it()` strings and `expect()` assertion messages in `stack-per-agent-curation.e2e.test.ts`, `info-panel-scope-toggle-diff.e2e.test.ts`, `global-agent-propagation-type-consistency.e2e.test.ts`, `agent-scope-toggle-agents-array.e2e.test.ts`, and `init-wizard-plugin.e2e.test.ts`. The rule is documented but has no automated enforcement, so it keeps recurring across otherwise-unrelated PRs.

## Fix Applied

None — discovery only. This finding surfaced as a side effect of a read-only investigation task; the actual cleanup is tracked in `todo/active-bugfixes.md` (D-167 section).

## Proposed Standard

Add an ESLint rule scoped to `e2e/**/*.test.ts` (and `src/**/__tests__/**/*.test.ts` if the same drift exists there) that flags task-ID-shaped substrings in `describe`/`it` string literal arguments and in the message argument of `expect(...)`/`assert` calls — e.g. a `no-restricted-syntax` selector matching `/\b(D-\d+|Gap \d+)\b/` against string literals in those call positions. Document the rule's intent in CLAUDE.md's existing "Test Data" bullet on this topic so the lint error message can point back to it.
