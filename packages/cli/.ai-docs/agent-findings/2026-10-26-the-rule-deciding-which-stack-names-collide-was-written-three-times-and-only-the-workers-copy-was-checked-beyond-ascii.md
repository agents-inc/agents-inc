---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/features/configure/lib/save-name.ts
  - apps/server/src/stacks.ts
  - packages/api-mocks/src/handlers.ts
  - packages/matrix/src/stack-name.ts
  - packages/matrix/src/index.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: web-developer
category: dry
domain: shared
root_cause: missing-rule
status: partial
partial_note: >-
  The code half landed (REPO-47): `sameStackName` in packages/matrix/src/stack-name.ts is the one
  definition, imported by the editor's save-name.ts, the worker's stacks.ts and the api-mocks
  handlers; apps/editor/e2e/support/auth.ts keeps its deliberate mirror. The proposed
  editor-and-worker.md rule is not written, and five comments outside the lane still name the
  editor's `sameName` as where the rule lives.
---

## What Was Wrong

Which two stack names an account cannot both hold (owner ruling 2026-10-24: trimmed, in any case)
was one line, `a.trim().toLowerCase() === b.trim().toLowerCase()`, declared three times: `sameName`
in `apps/editor/src/features/configure/lib/save-name.ts`, `sameName` in `apps/server/src/stacks.ts`
and `sameName` in `packages/api-mocks/src/handlers.ts`. Each copy's comment pointed at another copy
("As the editor's Save compares", "As the worker compares, and the editor's `sameName`"), so the
comments recorded the intent to agree and nothing enforced it.

Each copy was pinned only by its own workspace's specs, and the cases differed. Census of the specs
covering name comparison, by non-ASCII lines (`grep -cP '[^\x00-\x7F]'`), before this change:
`save-name.test.ts` 0, `account-store.test.ts` 0, `handlers.test.ts` 0, `stacks.test.ts` 7 (the
`Équipe` / `ÉQUIPE` cases), and `save-stack.spec.ts` 1, which is a curly quote in the message text.
So only the worker's copy was ever checked against the case where a plausible rewrite goes wrong:
SQLite's `lower()` and `NOCASE` fold ASCII letters only. A copy rewritten that way in the editor or
the mocks would have passed every spec in its own workspace, and the editor would have offered a
name the worker then refused (or the reverse).

The editor e2e stub (`apps/editor/e2e/support/auth.ts`) holds a fourth copy, and it is right to:
its comment says it mirrors rather than imports so it cannot agree with a change it is meant to
catch. That copy is a test oracle, not a definition.

## Fix Applied

`sameStackName` in `packages/matrix/src/stack-name.ts`, exported from the barrel. The worker and the
mocks already loaded the barrel (`compose.ts` and `fixtures.ts` import `CATALOG` from it), so the
import adds nothing to either module graph. `save-name.ts` re-exports it as `sameName` for its two
importers outside the lane (`account-store.ts`, `save-name.test.ts`). `stacks.ts` keeps its
comment on why names are compared in code rather than SQL. `packages/matrix/src/stack-name.test.ts`
(written red by the tester first) checks the shared definition, accented and Cyrillic letters
included.

## Proposed Standard

A rule in `.ai-docs/standards/editor-and-worker.md`, beside "A published contract carries what its
consumers need in order to REFUSE an entry": **a decision both the editor and the worker make, where
the editor anticipates a refusal the worker enforces, has one definition in `packages/matrix`. The
only other copy allowed is an e2e stub's deliberate mirror, and its comment says so.** That page
already makes the same rule for schemas. This finding extends it to a predicate, because a
predicate is the shape a type check cannot hold: two copies with the same signature and different
bodies typecheck and agree on every ASCII case.

Hardening verdict: no honest gate exists. A text scan for `.trim().toLowerCase() ===` is satisfied
by a copy written with `toLocaleLowerCase`, `localeCompare` or a SQL `lower()`, which are the copies
that would be wrong. Each workspace's specs catch their own copy diverging, only on the cases they
check. The rule is a review prompt. Checked against `packages/cli/CLAUDE.md` and the standard: no
conflict.

Five comments outside this lane still name the editor's `sameName` as the rule's home:
`packages/api-mocks/src/fixtures.ts` (above `STACK_NAME_TAKEN_BODY`),
`apps/server/src/stacks.test.ts` (above `describe("a name the account already holds")`, and the
"differs inside" case), `packages/api-mocks/src/handlers.test.ts` (above "is refused a save under a
name its stacks already hold"), and `apps/editor/e2e/support/auth.ts` ("mirrored rather than
imported from the editor's Save"). These are the pointer class in
`2026-08-26-a-partially-emptied-module-keeps-its-copy-where-the-emptied-module-guard-cannot-look`:
a sentence naming where a centralised rule lives stays readable after the rule moves.
