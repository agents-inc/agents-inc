---
type: anti-pattern
severity: low
affected_files:
  - e2e/commands/plugin-build-versioning.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The instance is deleted and a census finds no other. Nothing ties a known-gap comment to an
  it.fails, so the next one is caught only by a reader.
---

## What Was Wrong

`plugin-build-versioning.e2e.test.ts` carried a docblock on `it("carries a category on every
plugin entry")` saying the category never reaches a plugin manifest and that the spec was
"Expected-fail as the record of the gap". Commit 4885e5ae closed the gap and turned the `it.fails`
into a plain `it` two months earlier, and left the docblock. Commit 753afca8's comment pass then
shortened it instead of deleting it, so a false claim was rewritten as a shorter false claim.

`known-gap-retries.ts` reads `it.fails` from the syntax tree and ignores comments by design, so no
gate sees a known-gap comment that has lost its `it.fails`.

## Fix Applied

Deleted the docblock. Census, run from `packages/cli` after the fix, of comments naming a known
gap, known bug or expected failure whose next code line is a plain `it(` or `test(` under `e2e/` and
`src/`: none. The four left in `e2e/commands/` (`eject.e2e.test.ts` twice, `list.e2e.test.ts`
twice) each sit on an `it.fails`.

## Proposed Standard

`standards/e2e/README.md`, beside the `it.fails` rule: retiring a known gap deletes its comment in
the same change. A comment pass deletes a comment it cannot verify, as `briefing.md` rule 7 already
says for briefs. A gate is cheap: the census above as a spec beside `spec-gates.test.ts`.
