---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/e2e/commands/init-from-external-skills.e2e.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: premise-expired
status: resolved
resolved_by: >-
  The init-from-external-skills leg now pins the folded name as a panel row
  (`panelRow(ADDED_MARKER, "House Nothing")`), seen red against a build whose `inertLine` keeps line
  feeds.
---

## What Was Wrong

A shared link's carried skill named `House\nNothing removed.\nTool` once printed `Nothing removed.`
on a line of its own, at column 0, inside the plan `init --from` printed. The e2e leg written against
it pinned the plan's line (`    House Nothing removed. Tool (<id>)\n`) and guarded the forged row with
`expect(stdout).not.toContain("\nNothing removed.\n")`.

The summary panel then replaced the plan. Every row of the panel starts with its border (`│`), so an
unfolded line feed in a label now makes a row of its own inside the cell rather than a line at
column 0. The negative guard stopped telling the two cases apart. Measured by building `dist/`,
patching its `inertLine` to keep line feeds, and running the leg: the panel drew

```
│  + E2E React ⏏           + House                │  + web-developer           │
│                            Nothing removed.     │                            │
│                            Tool ⏏               │                            │
```

and `not.toContain("\nNothing removed.\n")` stayed green. The leg went red only because its positive
assertion still pinned the old plan's format, which the panel had retired regardless of the fold.

The guard was sound for output printed at column 0, and a change to where the label is drawn
invalidated it.

## Fix Applied

The leg pins the folded name as a panel row, `panelRow(ADDED_MARKER, "House Nothing")`. The cell
wraps at the 80 columns a piped run draws, so only the first words are pinned, and unfolded,
`House` ends its row. Against the patched build it was red at that line. Against the real build it
is green, headless and at 120 columns. The negative guard stays, for any print site outside the
panel.

Census of negative "no line of its own" guards over the same name or key:
`grep -rn "Nothing removed" packages/cli/e2e packages/cli/src --include='*.ts' --include='*.tsx'`.
Every other hit pairs its negative with a positive that holds the folded text:

- `a-link-carrying-terminal-controls.test.ts` (`FORGED_ROW`, beside ` + House Nothing removed. Tool ⏏ `)
- `e2e/interactive/edit-from.e2e.test.ts` (`not.toMatch(/^\s*Nothing removed\.\s*$/m)`, beside
  `panelRow(OVERWRITTEN_MARKER, "House Nothing removed. Tool")`)
- `init-from-codex-model.e2e.test.ts` (stderr, outside any panel, beside the folded warning)

## Proposed Standard

`clean-code-standards.md` 5.8, with the split `2026-10-22-a-sanitiser-that-keeps-line-breaks-let-a-label-print-a-line-of-its-own`
proposes: "A spec guarding the fold pins the folded text where it is drawn. A 'no line of its own'
negative proves nothing inside a bordered panel, where an unfolded line feed makes a row behind the
border instead." No conflict with a `CLAUDE.md` rule. It is the case the "Prove a negative's channel"
convention in `apps/editor/e2e/README.md` names, applied to the CLI.
