---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/seed/seed-apply.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  withKeptStackRows in src/cli/lib/seed/seed-apply.ts now appends the kept rows through
  withAppendedRows and rowsWhere, the file's existing joiners. Held by the two "joins a kept skill"
  specs in seed-apply.test.ts and e2e/interactive/edit-from-kept-skill-shares-a-category.
---

## What Was Wrong

`withKeptStackRows` put a kept skill's stack rows back with
`carried[agent] = { ...carried[agent], ...rows }`. A sub-agent's stack is a record of arrays keyed by
category, so the spread replaced the payload's array for any category the kept skill shared. A
destructive `edit --from` then left the payload's skill in that category installed and assigned to no
sub-agent, and the plan did not mention it.

The same file already had `appendRows`, which joins per category. The spread looked like a merge, but
for nested arrays it is a per-key overwrite.

Census of two-spread merges in CLI source, run from `packages/cli` (non-test files):

```
grep -rnE '\{ ?\.\.\.[a-zA-Z.]+(\[[a-zA-Z.]+\])?, \.\.\.[a-zA-Z]+ ?\}' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__
```

After the fix it returns three hits: `local-installer.ts` (`loadCuratedStack`), `source-loader.ts` and
`loader.ts`. Each one is a deliberate per-key override, where the second source wins the whole key.
None of them joins arrays.

## Fix Applied

The kept rows now go through `rowsWhere`, which selects the rows naming a kept skill, and
`withAppendedRows`, which appends each row after the rows already under its category. The payload's
rows come first.

## Proposed Standard

`clean-code-standards.md`: when combining two stacks, or any record of arrays, decide whether the
merge overrides or joins per key. Spell a join with the existing joiner (`appendRows` /
`withAppendedRows` in `lib/seed/seed-apply.ts`). An object spread only expresses an override.
