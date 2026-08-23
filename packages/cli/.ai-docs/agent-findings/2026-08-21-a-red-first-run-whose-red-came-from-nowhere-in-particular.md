---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/scripts/check-enumeration-drift.test.ts
  - packages/cli/scripts/check-screen-sentinels.test.ts
  - packages/cli/scripts/check-finding-citations.test.ts
  - packages/cli/scripts/check-findings-frontmatter.test.ts
  - packages/cli/scripts/check-spawn-doors.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  scripts/refusal-expectations.ts — expectRefusal(run, refusal, because?) refuses an undefined or
  empty message by name before it reaches toThrow, and vacuousThrowAssertions() parses every suite
  under scripts/ and condemns both shapes that accept any failure. All 37 sites across the five
  check suites converted; clean-code-standards.md 6.25 states the rule and the census that scopes it.
---

## What Was Wrong

`expect(run).toThrow(SOME_CONSTANT)` is how every gate under `scripts/` asserts a refusal. When the
constant is imported from the check module and the module does not export it yet, the imported name
is `undefined` at runtime, and vitest reads `toThrow(undefined)` as **"threw anything at all"**.

That is precisely the state a test is in while it is being written red-first, which is when the
vacuous form is least visible. On 2026-08-19 four of thirteen new refusal tests on
`check-enumeration-drift.ts` were written that way. They ran, they were red, they went green, and
not one of them had ever been shown to test the refusal it names — any error at all would have
satisfied them. `tsc` sees this as TS2305, but `tsc` is not what a red-first step runs.

A second shape belongs to the same class and was live in the same tree:
`expect(() => check({ packageRoot: root })).toThrow()` with no argument, in
`check-spawn-doors.test.ts`, under an `it` named "refuses a tree holding no door at all, rather than
calling it clean" — while its sibling three describes down named `NO_DOORS` for the same refusal.

**Census, measured 2026-08-21:** 37 assertions across the five check suites — 26 in
`check-enumeration-drift.test.ts`, 5 in `check-screen-sentinels.test.ts`, 2 each in
`check-finding-citations.test.ts` and `check-findings-frontmatter.test.ts`, and 2 in
`check-spawn-doors.test.ts` (one of them the no-argument shape).

## Fix Applied

`scripts/refusal-expectations.ts`, two halves for one subject:

- `expectRefusal(run, refusal, because?)` judges the message before it uses it. `undefined` and `""`
  are refused by name (`UNSTATED_REFUSAL`, `NO_MESSAGE`) and everything else goes to `toThrow` as
  before, with the assertion message preserved. The `refusal` parameter is typed `string | undefined`
  deliberately: a `string` annotation would make the one value the function exists to refuse
  unrepresentable in the type system while leaving it perfectly reachable at runtime.
- `vacuousThrowAssertions()` parses every `scripts/**/*.test.ts` and condemns two shapes —
  `toThrow(<a name the file imports>)` and `toThrow()` with no argument. A constant the file
  DECLARES is deliberately left alone: it cannot be the one its module forgot to export. `not.toThrow()`
  is left alone too, because it names the whole of what it asserts.

All 37 sites converted; the gate was watched red on all 37 before the conversion, and each of the
module's own six judgements was mutation-checked singly.

## Proposed Standard

Landed as `clean-code-standards.md` **6.25**. It states the rule, names the helper and the gate, and
**states the scope it does not hold** rather than implying a repository-wide guarantee: the same
census over `src/` and `e2e/` returns over 140 sites, most naming a locally-declared constant or an
error class, and converting those is a scope decision rather than a sweep. The gate covers `scripts/`
because that is the one tree where refusal-by-imported-message-constant is the universal idiom.

The general half is the one worth keeping: **a red-first run is evidence only when the red comes
from the assertion.** An assertion referencing a symbol that does not exist yet cannot supply one,
whatever colour the run prints.
