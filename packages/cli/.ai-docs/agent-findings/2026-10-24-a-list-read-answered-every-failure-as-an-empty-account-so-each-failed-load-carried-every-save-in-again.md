---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/lib/api/stacks.ts
  - apps/editor/src/stores/account-store.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-24
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `listStacks` answers `{ ok: true, stacks }` or `{ ok: false, refusal }`, with a 401 still an
  empty list; `refreshOnce` adopts only on `ok: true`, and records a failed read as `listRefusal`
  without uploading, settling `owed`, or touching `stacks`, `unadopted` or `clashes`. Uncommitted on
  2026-10-24.
---

## What Was Wrong

`listStacks` in `apps/editor/src/lib/api/stacks.ts` answered `[]` for a 500, a network error, a
200 whose body failed `z.array(savedStackSchema)`, a 401, and an account holding nothing.
`owedOldestFirst` in `account-store.ts` reads an empty list as a first sign-in and owes every
browser save to it, so every signed-in load whose list read failed carried every save into an
account that already held them. That is one more copy per failed load. When the writes failed too,
every save was marked owed, and the next good read opened a rename prompt for stacks the account
already listed. Reproduced by the EDITOR-106 research probe, and pinned by specs in `stacks.test.ts`,
`account-store.test.ts` and `accounts.spec.ts`.

**Two earlier findings saw this conflation and left it to its owner**, as a lead rather than a
reproduction: `2026-09-02-a-replacement-that-fails-leaves-the-user-with-neither` (INDEX: "one
pre-existing 401/500 conflation in `listStacks` left for its owner") and
`2026-10-24-the-grids-at-once-door-read-an-account-stack-through-a-fetch-the-question-never-used-so-its-failure-went-unsaid`.

The section that should have caught it, `editor-and-worker.md`: "Where a surface shows A in place
of B, the condition that hides B is 'A arrived' — never 'A was attempted'", speaks of what a
surface DRAWS. The same fact decides a WRITE here, and nothing says so. "Design the consumer for
three answers, not two" (`freshnessOf`: fresh, stale, unknown) is the same shape for a header, and
also does not reach a list.

## Fix Applied

- `listStacks` returns a result value, like `createStack` beside it. `ListRefusal` is
  `Exclude<StackRefusal, "signed-out">`, since a 401 still lists nothing.
- `refreshOnce` adopts only on `ok: true`. On a refusal it sets `session`, `ready` and
  `listRefusal`, and nothing else.
- `adoptLocalSaves` takes `RemoteStack[]`, so the compiler refuses the result at its one call site
  unless the success arm has been taken.

Census, run 2026-10-24 over `apps/editor/src/lib/api` and `apps/editor/src/stores` (a census, not a
sample):

```
grep -rn -E 'return \[\]|return null|: \[\]$|\? parsed\.data : (\[\]|null)' apps/editor/src/lib/api apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

The only other network read that folds a failure is `readSession` in `lib/api/auth.ts` (`null`,
read as signed out). It degrades to the signed-out view and no write follows it. The
`saved-stack-store.ts` hits decode this browser's own slot. The `configs.ts` and `config-store.ts`
hits are helpers, not reads.

**Left open, on purpose:** a 401 on the list right after `readSession` said signed in is still an
empty account. Adoption then runs, every `POST /stacks` is refused 401, and every save is marked
owed under "your session lapsed". Owner ruling owed; see the EDITOR-106 developer report.

## Proposed Standard

Add one sentence to `editor-and-worker.md` -> "Where a surface shows A in place of B…": **the same
holds for a write. An empty read may decide a write only when the read arrived, so a read whose
failure and whose empty answer share one value is the defect. Keep them apart in the type
(`{ ok: true, … } | { ok: false, refusal }`), not in a comment.** The census above is the check. No
conflict with either `CLAUDE.md` found. The CLI's "a field with no reader" rule does bear on
`listRefusal`: it has no reader yet, by the brief's instruction, so that the owner's answer to
q-editor-stack-list-unreadable can drive the grid.
