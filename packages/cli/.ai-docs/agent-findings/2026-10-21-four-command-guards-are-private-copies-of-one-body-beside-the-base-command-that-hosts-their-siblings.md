---
type: convention-drift
severity: low
affected_files:
  - src/cli/commands/compile.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/commands/share.ts
  - src/cli/commands/update.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

Four command steps exist as private copies of one body, in commands that already share
`BaseCommand`, which hosts their siblings (`ensureConfigReadable`, `refuseSharedConfigBeforeAsking`,
`refuseProjectScopedContentAtHome`). Census, run from `packages/cli`:

```
grep -rn "private async refuseUnofferablePlacements\|private decodeSeedOrFail\|private registerExternalSkillsOrFail\|private async writeCarriedSkills" src/cli/commands
```

On 2026-10-21 it returned 10 hits in 5 files:

- `refuseUnofferablePlacements` in `compile.ts`, `edit.tsx`, `share.ts` and `update.ts`: the same
  two-line body, differing only in each docblock's reason.
- `decodeSeedOrFail`, `registerExternalSkillsOrFail` and `writeCarriedSkills` in `init.tsx` and
  `edit.tsx`: the same bodies, parameter names aside.

A change to one copy, such as the exit code of the placement refusal, reaches only the commands
whoever makes it remembers.

A fifth pair, the skipped-entry warnings `init --from` and `edit --from` each printed inline, was
hoisted to `BaseCommand.warnOfSkippedEntries` by the expressive-ts round that found the rest,
because extracting that step was the round's own work (orchestrators as named steps). The four
above were already named steps, so hoisting them is de-duplication, which that round did not cover.

## Fix Applied

None for the four listed — discovery only.

## Proposed Standard

Hoist each to `BaseCommand` beside `ensureConfigReadable`, moving each command's reason to its call
site as a one-line comment. No check in this package reports a duplicated method body:
`grep -n "jscpd\|duplicat" package.json packages/cli/package.json` returns nothing, so the census
above is the only way to find the next copy.
