---
type: standard-gap
severity: low
affected_files:
  - apps/editor/src/stores/account-store.ts
  - apps/editor/src/features/configure/components/stack-grid.tsx
  - apps/editor/src/features/configure/components/stack-switch-dialog.tsx
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-23
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  `failedReads` in `account-store.ts` records a read that failed, `stackSwitchCost` answers `failed`
  for it, and `stack-switch-dialog.tsx` says "Couldn't load this stack." with Retry in Switch's
  place, holding Switch disabled while "loading…" shows (owner answers to `q-e2c-load-fails` and
  `q-e2c-switch-while-loading`). Held by "a read of an account's stack that failed" in
  `account-store.test.ts`, `use-apply-stack-request.test.ts`, and "the question while an account's
  saved stack loads" in `saved-stack-apply.spec.ts`.
---

## What Was Wrong

The editor asks before an account's saved stack replaces changes that came from no stack. Until
that stack's payload has been read, the question says "This stack is built on loading…":
`stackSwitchCost` in `use-apply-stack-request.ts` answers `unread` while the account store holds no
payload under the stack's config id, and `consequenceOf` in `stack-switch-dialog.tsx` draws
`builtOnUnread` for it.

A failed read leaves nothing that could end that state. `readUnheldPayloads` in
`apps/editor/src/stores/account-store.ts` keeps only the reads that succeeded
(`result.ok ? [[configId, result.payload] as const] : []`), so after a failed read the store looks
exactly as it did before the read was answered. The comment on `readPayloads` says a payload the
store cannot serve "is asked for again next time", and next time is the next call. Its only
production caller is the effect in `stack-grid.tsx` that runs when `accountStacks` changes, so
nothing reads it again while the question is open, and "loading…" stays until the dialog closes.

Switch runs `adoptRemote`, which fetches the payload again. If that read succeeds the stack applies.
If it fails, nothing is applied, the dialog closes, and the screen says nothing.
`fetchSharedConfig` in `lib/api/configs.ts` reports a non-404 failure through `reportIssue`
("Share GET failed"), which the visitor is not shown; a 404 is not reported at all.

Census, 2026-10-23:
`grep -rn "readPayloads" apps/editor/src --include='*.ts' --include='*.tsx'` returns 10 lines: the
declaration and definition in `account-store.ts`, 7 calls in `account-store.test.ts`, and the
selector in `stack-grid.tsx` whose effect makes the only production call.

Evidence. Measured on 2026-10-23 in `apps/editor`:
`npx vitest run --maxWorkers=2 src/stores/account-store.test.ts src/features/configure/lib/use-apply-stack-request.test.ts -t "asked for again next time|is still reading an account"`
gives 2 passed. "is left out when the store holds nothing under its id, and asked for again next
time" shows that a failed read records nothing; it uses a 404, and a 503 takes the same
`result.ok` branch. "is still reading an account's stack whose payload has not arrived" shows that
an id with no payload reads as `unread`. Inherited, not re-run here: the lane that built the loading
state reproduced the whole path in a browser, with the payload GET answering 503 after 3 s while the
question was open. The loading sentence stayed after the read failed, and Switch fetched again and
closed the dialog with the selection unchanged. Open card `q-e2c-load-fails` records a later verify
round reproducing it. Neither probe is in the tree.

`2026-10-23-a-null-cost-that-also-meant-not-read-yet-let-the-switch-question-claim-the-costliest-answer`
gave "not read yet" its own variant. This finding is the case that variant cannot tell apart: read
and failed.

## Fix Applied

Built from the owner's answers of 2026-10-23: `q-e2c-switch-while-loading`, "Switch waits until the
stack has loaded", and `q-e2c-load-fails`, "Say it failed".

- `account-store.ts`: `failedReads` holds the config ids whose last read failed. `readPayloads`
  removes an id from it as it reads that id again, and adds it back if that read fails too. A
  sign-out clears it. `readUnheldPayloads` is gone; `readEach`, `arrivedIn` and `failedIn` keep
  both outcomes.
- `use-apply-stack-request.ts`: `stackSwitchCost` reads `AccountReads` (`payloads`, `failedReads`)
  and answers `failed` for an account's stack with no payload and a failed read. A payload that
  arrived wins over a failed read. `adoptRemote` applies the payload the store holds, so Switch
  applies what the question said without reading it again. It fetches only when the store holds
  none, which happens when the grid applies at once because nothing is at stake.
- `stack-switch-dialog.tsx`: Switch is disabled while "loading…" shows. A failed read replaces
  "This stack is built on loading…" with "Couldn't load this stack." and replaces Switch with Retry.
  Retry calls `readPayloads`, so "loading…" and a disabled Switch return until the read answers.
  Keep my setup closes the dialog as before.

Red first, in `apps/editor`. In `account-store.test.ts` › "a read of an account's stack that
failed", 2 of the 4 specs were red. The other 2 were green, because `beforeEach` seeds
`failedReads: []` and the old store never set it. `use-apply-stack-request.test.ts`, run against the
shape before the answers (`costOfAccountStack` reading a payloads map), has 4 of its 7 specs red:
"could not read an account's stack whose read failed", "names the marketplace of a payload that
arrived beside a failed read of it", and two whose calls hand `AccountReads` to that signature. "is
still reading an account's stack when only another stack's read failed" stays green there; it
reddens when any failed read counts. In `saved-stack-apply.spec.ts`, all 6 were red: the 5 in "the
question while an account's saved stack loads", and "leaves the selection alone when its pointer
resolves to nothing", which now presses Retry because Switch is no longer offered.

## Proposed Standard

The nearest sections in `editor-and-worker.md` do not cover the case. "Where a surface shows A in
place of B, the condition that hides B is "A arrived" — never "A was attempted"" holds here, since
only an arrived payload ends `unread`. "The store holds the refusal; the surface owns the words"
says how a store holds a refusal, not that a failed read must be held.

With the card answered, this proposes a corollary for the "A arrived" section of
`editor-and-worker.md`. A store that reads on a surface's behalf holds a failed read as its own
state, because only the store saw the read fail, and "not answered yet" and "answered with a
failure" need different words on screen. Proposal only; the standard is unchanged.
