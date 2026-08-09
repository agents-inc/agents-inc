---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/features/built-in-catalogue.md
  - packages/cli/src/cli/lib/configuration/default-stacks.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: "CLI-400 — invariant 2 rewritten against the module as evaluated (1552 assignments, none carrying `preloaded`), the stale 157/1571 distribution removed from Trap 4, and `last_validated` bumped to 2026-08-06."
---

## What Was Wrong

`built-in-catalogue.md` invariant 2 read: _"All 1571 `SkillAssignment` entries are objects with an
**explicit** `preloaded` key (157 of them `true`)"_, and Trap 4 restated the distribution as "157 of
1571 true". Both numbers and the shape claim were wrong against the file they describe, before
CLI-400 touched anything:

| Claim                        | Measured on `defaultStacks` as committed |
| ---------------------------- | ---------------------------------------- |
| 1571 assignments             | 1552                                     |
| explicit `preloaded` on each | 135 carried the key; 1417 carried none   |
| 157 `true`                   | 135 `true`, and no entry was `false`     |

The section is written in the document's "stated as facts, each verified by evaluating the module"
voice, which is exactly why it was believed: CLI-400's own brief inherited the 157 figure from here
and asked for "~157 sites" to be stripped. The real count was 135.

The shape half mattered more than the counts. "Explicit `preloaded` key on every entry" is the
opposite of what the file contained — sparse flags, absence meaning lazy — and a reader trusting it
would conclude that the built-ins already stated a load for every pair, which is the precise question
CLI-400 was asked to settle.

## Fix Applied

Invariant 2 and Trap 4 rewritten against the module as evaluated today: 1552 assignments, not one
carrying `preloaded`, all taking `PRELOAD_DEFAULTS`' verdict through `buildStackProperty`. Trap 4
now points at `preload-defaults.ts` for which pairs preload and at the CLI-400 divergence report for
what the change moved, instead of restating a distribution. `last_validated` bumped.

## Proposed Standard

A count or a shape claim written in the "verified by evaluating the module" voice needs the
expression that produced it, so re-validating is re-running rather than re-counting by eye. The
counts here are each one line of `bun -e`. `documentation-bible.md` → "A Count Lives in Exactly One
Document" already owns where a count may live; it should also require that a stated count carry the
one-liner that reproduces it, or a test that pins it — `default-stacks.test.ts` now pins the shape
half (`it.each` over every triple asserting no assignment carries `preloaded`), which is the form
that cannot rot silently.
