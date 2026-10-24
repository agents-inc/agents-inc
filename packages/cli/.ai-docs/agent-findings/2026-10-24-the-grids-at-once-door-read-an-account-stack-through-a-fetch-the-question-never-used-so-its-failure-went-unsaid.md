---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
  - apps/editor/src/features/configure/components/stack-grid.tsx
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-24
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `adoptRemote` reads through `readAccountStack`, which goes through the account store's
  `readPayloads` as the question's Retry does, and answers `failed` to `useChooseStack`, which holds
  it for the grid to word under the stack grid with a Retry. Uncommitted on 2026-10-24.
---

## What Was Wrong

Applying an account's saved stack has two doors in one module, `use-apply-stack-request.ts`: the
switch question (unsaved work) and the grid applying at once (nothing unsaved). The question read
the payload through the account store (`readPayloads`), so a failed read landed in `failedReads`
and was worded ("Couldn't load this stack.", with Retry). The at-once door read it with a bare
`fetchSharedConfig` and wrote `if (result.ok) await adopt(result.payload)` with no other arm. So:

- a failed read said nothing, and the click looked ignored;
- a read that succeeded never reached the store, so the grid (which recognises an account's stack
  only from stored payloads, `appliedConfigIdsOf`) did not light the cell, and the next choice asked
  a false "You have changes that do not come from a stack" question.

The module rule in `editor-and-worker.md` ("An act reachable through two controls is a module, not a
component") was followed: both doors lived in one module. What it does not say is that the doors
must share the READ, which is where the outcome is recorded. Two reads in one module drifted exactly
as two components would.

## Fix Applied

One read for both doors (`readAccountStack`, through the store), an outcome code (`StackLoad`) back
from the apply, and the grid wording it (`STACK_NOT_LOADED` in `stack-grid.tsx`), per "The store
holds the refusal; the surface owns the words". The tester's probes for the cell defect (first read
fails, the click's read loads) went from failing to passing.

Census of the shape, run 2026-10-24 (a census over `apps/editor/src`, not a sample):

```
grep -rnE 'if \((!)?[a-zA-Z]+\.ok\)' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Every other hit returns its failure to a caller that words it, or is a documented degrade
(`readSession`'s `null`). One neighbouring shape is a lead, inferred from source and not reproduced:
`listStacks` in `lib/api/stacks.ts` answers `[]` for any failure, and `owedOldestFirst` in
`account-store.ts` reads an empty account as a first sign-in.

## Proposed Standard

Add one sentence to `editor-and-worker.md` -> "An act reachable through two controls is a module,
not a component": **the doors share the read as well as the module**, because the read is where the
outcome (arrived, failed) is recorded, and a door that reads on its own records nothing the other
door's words or the grid's recognition can see. No conflict with `CLAUDE.md` found.
