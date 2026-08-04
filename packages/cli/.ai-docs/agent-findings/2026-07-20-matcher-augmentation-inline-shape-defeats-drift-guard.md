---
type: convention-drift
severity: medium
affected_files:
  - e2e/matchers/setup.ts
  - e2e/matchers/project-matchers.ts
  - e2e/assertions/uninstall-assertions.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: typescript
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: "The readonly widening landed for every matcher whose shape is an imported type. `toHaveLocalSkills` and its downstream consumer `expectCleanUninstall.preservedSkills` remain mutable because setup.ts declares that one parameter inline; the one-line fix is pending its file owner."
---

## What Was Wrong

`e2e/matchers/setup.ts` carries a comment asserting a drift guarantee:

> Every expectation shape is imported from the matcher that implements it, so a
> change to an implementation's parameters is a compile error here rather than
> silent drift between two declarations.

That guarantee holds for five of the six shapes (`ConfigExpectations`,
`AgentContentExpectations`, `SettingsExpectations`, `AgentFrontmatterExpectations`,
`AgentDynamicSkillsExpectations`) — but **not** for `toHaveLocalSkills`, whose
parameter is written inline as `expectedSkillIds?: string[]` at both `setup.ts:30`
(`Assertion<T>`) and `setup.ts:52` (`AsymmetricMatchersContaining`).

This was proven empirically, not inferred. Widening the implementation in
`project-matchers.ts` from `string[]` to `readonly string[]` produced **no error
in setup.ts** — the augmentation silently kept the old, narrower shape. That is
precisely the drift the comment claims is impossible.

The consequence is not cosmetic. Spec files resolve `expect(x).toHaveLocalSkills(...)`
against the _augmentation_, not the implementation, so the inline `string[]`
is what actually gates call sites. It blocked the readonly widening of
`expectCleanUninstall`'s `preservedSkills` option, which forwards straight into
that matcher — meaning shared readonly fixtures (`E2E_SKILL_IDS`, `E2E_AGENTS.WEB`,
`E2E_AGENTS.API`, all declared `as const satisfies`) still cannot be passed there
without a `[...spread]` at every call site.

## Fix Applied

Partial, and deliberately so — `setup.ts` is owned by another agent this round.

Widened 19 read-only array parameters across the five owned files
(`project-matchers.ts`, `agent-matchers.ts`, `phase-assertions.ts`,
`scope-assertions.ts`, `uninstall-assertions.ts`) from `T[]` to `readonly T[]`.
Every widened parameter was verified non-mutating first: the files contain zero
`sort`/`push`/`splice`/`reverse` calls, and each array is consumed only via
`.find()`, `.includes()`, or `for...of`.

`expectCleanUninstall`'s `preservedSkills` was left as `string[]` with an inline
comment naming the blocker. The alternative — widening it and adding
`toHaveLocalSkills([...options.preservedSkills])` at the call site — was rejected:
it would hide a one-line defect in an unowned file behind a spread in an owned
one, which is the exact noise this workstream exists to remove.

Two `.sort()` sites were audited as potential caller-data mutation hazards and
cleared: `dual-scope-helpers.ts:39` sorts a `.filter()` result and
`expected-values.ts:91` sorts a spread literal — both fresh arrays.

## Proposed Standard

1. **Close the gap (one line, two sites).** In `e2e/matchers/setup.ts`, change
   `toHaveLocalSkills(expectedSkillIds?: string[])` to `readonly string[]` at
   lines 30 and 52, then widen `preservedSkills` in
   `e2e/assertions/uninstall-assertions.ts` and drop the placeholder comment.

2. **Make the guarantee structural rather than aspirational.** Add to
   `.ai-docs/standards/e2e/README.md` (matcher section): _every_ parameter shape
   in the `declare module "vitest"` block must be an imported named type from the
   implementing matcher — never an inline object or array literal. A comment
   claiming compile-time drift protection is worthless if one declaration opts
   out, and the opt-out is invisible at review time because both declarations
   still typecheck independently.

3. **Default shared-fixture consumers to `readonly`.** Assertion and matcher
   parameters that are only read should be declared `readonly T[]` from the
   outset. The e2e fixtures are `as const satisfies` tuples by design; a mutable
   parameter type is what forces defensive spreads at call sites, and each spread
   is a silent allocation that also discards the literal types the `as const` was
   added to preserve.
