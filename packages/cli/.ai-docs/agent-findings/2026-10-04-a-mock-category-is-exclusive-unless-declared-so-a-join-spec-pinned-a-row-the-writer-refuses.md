---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/seed/seed-apply.test.ts
  - src/cli/lib/__tests__/factories/category-factories.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-04
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-visible
status: open
---

## What Was Wrong

`createMockCategory` in `__tests__/factories/category-factories.ts` returns `exclusive: true` unless
the caller overrides it, and `TEST_CATEGORIES` is built from it. So every category of
`REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX` holds one skill, and nothing at a call site says so.

Two specs in `seed-apply.test.ts`, written for the round-5 fix in
`2026-10-03-a-spread-over-a-record-of-arrays-replaces-a-row-it-meant-to-join.md`, used that matrix.
They asserted a kept skill JOINED to the payload's row as the expected value:
`"web-framework": [sa(REACT), sa(VUE)]` and `"web-client-state": [sa(ZUSTAND), sa(PINIA)]`. Both
categories are exclusive in that matrix. The config writer (`compactCategoryAssignments` in
`packages/compile/src/config-source.ts`) refuses exactly that row. So the specs pinned the defect
`edit --from` then shipped: in an exclusive category the apply failed after the user said yes, with
the removals already made.

Census, run from `packages/cli`, of specs that hold two skills in a category exclusive in the
shipped catalogue:

```
grep -rnE '"(web-framework|web-client-state)": \[sa(Unflagged)?\([^)]*\), sa' src e2e
```

After the change it returns two hits, and both are deliberate. `config-writer.test.ts` asserts the
writer's refusal. `edit-from-kept-skill-shares-a-category.e2e.test.ts` sets up the hand-written
overfull row its refusal leg is about. The grep covers only those two category names, and every
category of a mock matrix is exclusive unless declared otherwise, so the census is a sample.

## Fix Applied

The two join specs now use categories their matrix declares open: `web-styling` in
`CATEGORY_EXCLUSIVITY_MATRIX`, and `HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX`. Each has a sibling spec
on the exclusive form of the same matrix (`CATEGORY_EXCLUSIVITY_MATRIX`'s `web-framework`, and
`HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX`) that expects the configuration's skill alone in the
slot.

## Proposed Standard

A spec whose expected value depends on whether a category holds one skill uses a matrix that
declares it either way, and never a category exclusive only by the factory default. In an exclusive
category, an expected row holds one skill, unless the spec is about the refusal of two. This would
go in CLAUDE.md "Test Data", beside the `createMockMatrix` rules. It does not conflict with any
existing NEVER/ALWAYS rule.
