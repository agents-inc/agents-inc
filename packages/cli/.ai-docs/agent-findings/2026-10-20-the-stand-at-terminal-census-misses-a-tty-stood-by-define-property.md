---
type: standard-gap
severity: low
affected_files:
  - packages/cli/CLAUDE.md
  - packages/cli/src/cli/components/common/prompt-confirm-holds-the-terminal.test.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: web
root_cause: enforcement-gap
status: partial
partial_note: >-
  The one instance now calls standAtTerminal(). The census line in packages/cli/CLAUDE.md still
  matches only the assignment form.
---

## What Was Wrong

`packages/cli/CLAUDE.md` bans standing a spec at a terminal by hand and gives the census
`grep -rn "stdin.isTTY = true" src e2e scripts --include='*.ts' --include='*.tsx'`, which "should come
back empty". It came back empty while `prompt-confirm-holds-the-terminal.test.tsx` stood stdin at a
terminal through `Object.defineProperty(stdin, "isTTY", { value: true })` plus a hand-made
`setRawMode`, which is the form the rule exists to retire, written so the census cannot match it.

## Fix Applied

The spec now calls `standAtTerminal()`. It reads the input's `isRaw` (raw while the prompt is open,
then the mode it found, for both a cooked and a raw start) instead of a `setRawMode` call log. A
census over both forms is now empty:

```
grep -rnE "stdin.isTTY = true|defineProperty\((process\.)?stdin" src e2e scripts --include='*.ts' --include='*.tsx'
```

## Proposed Standard

Replace the census line in `packages/cli/CLAUDE.md` → Test Data (the `standAtTerminal()` rule) with
the two-form grep above. Checked against `CLAUDE.md`: it widens that rule's own census and conflicts
with nothing.
