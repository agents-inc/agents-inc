---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/config-gate/pair-snapshot.ts
  - src/cli/lib/config-gate/index.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  readHalf in pair-snapshot.ts reads an unopenable half as a fresh symbol, so the snapshot never
  throws and the fan-out still visits every project. Pinned by gate-consequences.test.ts ("visits
  every registered project when one's config cannot be opened") and pair-snapshot.test.ts.
---

## What Was Wrong

`fanOut` (`config-gate/index.ts`) called `snapshotProjectPairs` before the fan-out, outside the
per-project `try` in `propagateToRegisteredProject` that degrades each project on its own ("No skip
reason stops the fan-out"). An existing but unopenable `config.ts` (EACCES) made the snapshot throw,
so no registered project was visited. The command blamed `config-types.ts` and printed no
`Registered projects:` line.

## Fix Applied

An unreadable half reads as `Symbol(path)`. A fresh symbol equals nothing, so a pair the fan-out did
update still counts as rewritten, and the comparison needed no new branch. The fan-out itself then
skips the project as `unreadable`.

## Proposed Standard

CLAUDE.md's posture rule ("visit every call site and record its posture") is worded for a function
that changes from returning a sentinel to throwing. It also applies to a new read placed in front of
a loop whose members degrade one at a time. That read takes the loop's posture, or it turns a
per-member skip into an abort of the whole loop. Add one sentence to that rule.
