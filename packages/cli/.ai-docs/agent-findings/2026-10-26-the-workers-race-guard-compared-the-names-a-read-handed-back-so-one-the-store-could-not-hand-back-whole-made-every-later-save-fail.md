---
type: anti-pattern
severity: medium
affected_files:
  - apps/server/src/stacks.ts
  - apps/server/src/stacks.test.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: api-developer
category: typescript
domain: api
root_cause: missing-rule
status: resolved
resolved_by: >-
  stacks.ts refuses a name holding half of a surrogate pair (400, nameSchema) and its race guard
  compares hex(name), the bytes the store holds, rather than the text a read hands back. Specs in
  stacks.test.ts hold each half.
---

## What Was Wrong

The worker's stack save and rename read the account's names, compare them in JavaScript, then
write under a condition inside the same statement: no row of the account holds a name the read
did not return (`noNewNameSince` in `stacks.ts`, `name not in (json_each(names read))`). A lost
condition is retried from a fresh read, five times, then the request fails with 500.

`nameSchema` accepted half of a surrogate pair (`"x\ud800y"`, sent as JSON's own escape). D1
keeps its bytes (`hex(name)` = `78EDA08079`, measured in the Workers test pool) and hands them back
as `"x���y"`. The guard compared the stored name against that read-back text, so the
row never matched: every later save of a free name and every rename of another of the account's
stacks lost all five attempts and answered 500, logging "Still racing this account's writes" with
no race. Only renaming or deleting that stack cleared it. Found by the SERVER-10 review on a real
`wrangler dev` and in the test pool.

## Fix Applied

- `nameSchema` refuses `\p{Cs}` (a lone surrogate) with a 400, so no new such name is stored.
- The read selects `hex(name)` and the guard compares `hex(other.name)` against it, so a row stored
  before the refusal still matches its own read.
- Specs in `apps/server/src/stacks.test.ts`: "refuses a name holding half of a surrogate pair, to a
  save and a rename" with its whole-pair control, and "an account holding a name with half of a
  surrogate pair" (save and rename), which stores the row past the routes. Each reddens on a copy
  missing its half of the fix.

## Proposed Standard

In `standards/editor-and-worker.md`: "A condition the worker evaluates in SQL against values it
read compares what the store holds (`hex(column)`), never the text a read handed back, and a text
field the worker stores refuses ill-formed UTF-16 at its schema."
