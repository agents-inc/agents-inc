---
type: standard-gap
severity: high
affected_files:
  - packages/cli/src/cli/lib/matrix/matrix-provider.ts
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `getSkillDisplayName` returns its answer through `stripTerminalControls`, and edit's added-skill
  line strips the `getSkillById` read it keeps. Held by "getSkillDisplayName" in
  matrix-provider.test.ts and a-link-carrying-terminal-controls.test.ts, each watched red with the
  strip removed.
---

## What Was Wrong

A shared link's carried skill is seated in the matrix with its `displayName` exactly as the payload
sent it, and a marketplace's `metadata.yaml` reaches the matrix the same way. Every place the CLI
prints a skill's display name read it raw: `getSkillDisplayName` (the plan lines through
`skillLabel`, edit's change lines, the Ink summary) and edit's added-skill line, which reads
`getSkillById(id).displayName` directly. A link whose display name held `ESC[2J` and an OSC 0
cleared the screen and retitled the window from a piped `init --from`.

Census of where a skill's display name is printed, from
`grep -rn 'displayName' packages/cli/src/cli --include='*.ts' --include='*.tsx' | grep -v test`
read whole: `getSkillDisplayName` and its six callers, edit's added-skill line, and `search.ts`,
which already stripped. The rest are reads that build entries, not prints.

5.8 names three chokepoints and says nothing renders foreign text past them. None of the three is on
this path: a display name needs no bound, is not an error, and is not a Zod issue.

## Fix Applied

The accessor every caller prints through strips, so a new caller inherits it. The one direct read
strips beside its `getSkillById` assertion, which it keeps. The carried skill's id is refused rather
than stripped (`holdsAControl` in `packages/matrix/src/seed.ts`), because it is also a directory
name. Not checked: the carried `description`, which no command among `init --from`, `doctor` and
`list` printed in the hand-run.

## Proposed Standard

`clean-code-standards.md` 5.8: add the display-name accessor as a fourth place the sanitiser lives,
or reword "three chokepoints" to say an accessor whose every caller prints its answer strips there.
This conflicts with 5.8 as written ("a new site reaches one of those three rather than sanitising for
itself"); `2026-10-21-the-sanitiser-landed-on-a-warning-no-payload-reaches-while-the-skip-warning-printed-payload-keys-raw`
already records that four other files strip for themselves.
