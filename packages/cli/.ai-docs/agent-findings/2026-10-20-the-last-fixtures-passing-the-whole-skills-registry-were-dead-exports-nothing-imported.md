---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/__tests__/mock-data/mock-matrices.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The five violating fixtures were deleted on 2026-10-20 and the census below returns nothing. No
  check holds it there: the CLAUDE.md rule is prose only, and knip's export sections, which named
  the five as unused, are read by hand.
---

## What Was Wrong

CLAUDE.md, Test Data: "NEVER pass the entire `SKILLS` registry to `createMockMatrix`". Five
exported fixtures in `mock-data/mock-matrices.ts` did exactly that:
`ALL_SKILLS_WEB_FRAMEWORK_MATRIX`, `ALL_SKILLS_WEB_PAIR_CATEGORIES_MATRIX`,
`ALL_SKILLS_METHODOLOGY_MATRIX`, `ALL_SKILLS_METHODOLOGY_BARE_MATRIX` and
`ALL_SKILLS_MULTI_DOMAIN_MATRIX`, each `createMockMatrix(...Object.values(SKILLS), { … })`.

None of them had a reader. knip's 2026-10-20 run listed all five under "Unused exports", and
`grep -rlw <name> apps packages docs todo` found each only in its own file. So the last violations
of the rule lived in dead code, where no review of a spec that uses a fixture ever looks.

Census, whole package, after the deletion (empty):

```
grep -rn 'Object.values(SKILLS)\|createMockMatrix(SKILLS)\|createMockMatrix(\.\.\.SKILLS\|typedValues(SKILLS)' src e2e scripts --include='*.ts' --include='*.tsx'
```

## Fix Applied

Deleted the five, with the rest of the lane's knip "Unused exports" entries (C1-lib-test-infra,
REPO-44 step 5).

## Proposed Standard

A `no-restricted-syntax` selector in `eslint.config.js` for the spec and `__tests__` zones would
hold the rule: a `createMockMatrix` call with a spread whose argument is `Object.values` or
`typedValues` of `SKILLS`. It is cheap and has no current violation. It would not catch the
registry reached through a local alias, and the rule's other half (dead fixtures nobody reviews) is
the knip export report, which `2026-10-20-a-dependency-knip-already-called-dead-stays-declared-because-its-report-is-read-by-hand`
already proposes gating and leaves to the owner.
