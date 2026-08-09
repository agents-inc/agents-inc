---
type: convention-drift
severity: medium
affected_files:
  - e2e/assertions/config-assertions.ts
  - e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts
  - src/cli/lib/__tests__/helpers/config-comparison.ts
  - e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The order-preserving normaliser is now shared from e2e/assertions/config-assertions.ts and named
  for its load-bearing property. Pending: it has no test file of its own, and the two normalisers
  are still separate functions in separate modules (unification needs ownership of
  src/cli/lib/__tests__/helpers/config-comparison.ts).
---

## What Was Wrong

Two near-identical `config.ts` normalisers existed with a silent, load-bearing
semantic difference:

- `normalizeGlobalConfig` (`src/cli/lib/__tests__/helpers/config-comparison.ts`,
  re-exported from `e2e/helpers/test-utils.ts`, 4 e2e consumers) — strips the
  `"projects"` line **and sorts the lines**, so it is order-INSENSITIVE.
- A local `normalizeConfig` declared inline in
  `e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts` — strips the `"projects"`
  line and **preserves line order**, so it is order-SENSITIVE.

Both are named "normalize<something>Config", both take a config string, both
return a config string, and both back a `toStrictEqual` comparison. Nothing in
either name signals that one detects reordering and the other does not.

The trap: the obvious dedup move — deleting the local helper and importing the
already-shared `normalizeGlobalConfig` — compiles, passes, reads like a pure
cleanup, and **silently weakens** the round-trip assertion in
`scope-toggle-roundtrip.e2e.test.ts` from "the passthrough edit rewrote the
config byte-for-byte" to "the passthrough edit kept the same set of lines in
any order". Reordering is exactly the regression class that test guards, so the
weakening removes the test's reason to exist while leaving it green.

Secondary issue: the local helper violated the CLAUDE.md rule against inline
parser/extractor helpers in test files ("if a helper is genuinely reusable
across tests, live it in `e2e/helpers/` or `src/cli/lib/__tests__/helpers/`
WITH its own tests"). The sorted sibling has tests
(`config-comparison.test.ts`); the inline order-preserving one had none.

## Fix Applied

Promoted the order-preserving helper out of the spec file into
`e2e/assertions/config-assertions.ts` as `normalizeConfigPreservingOrder`,
byte-identical in behaviour (only the lambda parameter was renamed `l` ->
`line`). Updated the single call site and removed the local declaration.

Named it for the property that must not be lost rather than for the generic
action, and documented the contrast with `normalizeGlobalConfig` in its JSDoc,
including why sorting must not be added.

Did NOT add a `{ sort?: boolean }` option. The genuine second caller that would
need `sort: true` is `normalizeGlobalConfig`, which lives in a file outside this
agent's ownership; adding the branch now would have shipped a dead code path.

Not fixed: `normalizeConfigPreservingOrder` still has no test file of its own,
which CLAUDE.md requires for shared test helpers. Writing test files was outside
this assignment's file ownership.

## Proposed Standard

1. `.ai-docs/standards/e2e/anti-patterns.md` — add a rule: **normalisers used
   under an equality assertion must encode their comparison strength in the
   name.** `normalizeX` is not an acceptable name when a stricter or looser
   sibling exists; use `normalizeXPreservingOrder` / `normalizeXOrderInsensitive`
   (or equivalent). A reviewer must be able to tell from the call site whether
   reordering would fail the test.

2. Same doc — add: **swapping one normaliser for another under an existing
   assertion is an assertion change, not a refactor.** It requires the same
   scrutiny as editing the `expect` call, because it can only ever loosen or
   tighten what the test detects.

3. Follow-up work item (needs ownership of
   `src/cli/lib/__tests__/helpers/config-comparison.ts`): unify the two into one
   function with an explicit `{ sort }` option defaulting to `false`
   (order-preserving), then route `normalizeGlobalConfig`'s 4 e2e consumers to
   `{ sort: true }` and delete the duplicate. Defaulting to the STRICTER
   behaviour means a caller who forgets the option gets a test that is too
   strict (fails loudly) rather than one that is too weak (passes silently).

4. Follow-up work item: add `e2e/assertions/config-assertions.test.ts` covering
   `normalizeConfigPreservingOrder` — mirroring
   `src/cli/lib/__tests__/helpers/config-comparison.test.ts`, plus the case that
   sibling cannot have: **reordered lines must NOT compare equal**. Note that
   `expectNoDuplicates` in the same module is also currently untested.
