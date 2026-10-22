---
type: anti-pattern
severity: low
affected_files:
  - scripts/check-enumeration-drift.ts
  - scripts/check-enumeration-drift.test.ts
  - scripts/check-mirrored-constants.ts
  - scripts/check-mirrored-constants.test.ts
  - scripts/check-mirrored-constants-against-this-repository.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: >-
  Both guards now read the verdicts the scan returned, and REGISTRY and MIRRORS lost their export.
  Pending: neither check function refuses an empty registry, which the proposal below asks for.
---

## What Was Wrong

`check-enumeration-drift.test.ts` and `check-mirrored-constants.test.ts` each kept their
repository run from passing vacuously with `expect(REGISTRY.length).toBeGreaterThan(0)` and
`expect(MIRRORS.length).toBeGreaterThan(0)`. Both `check()` functions answer an empty registry with
`{"clean":true,"verdicts":[]}`. Run in `packages/cli`:

```
bun -e 'import { check } from "./scripts/check-mirrored-constants.ts"; console.log(JSON.stringify(check({ mirrors: [] })))'
```

The guard read the scan's input rather than its result. A `check()` that skipped every entry it was
handed would leave the guard green beside a clean verdict. The guard was also the only reader of
either export, so folding the registry into `check()` would redden a test with no behaviour changed.

## Fix Applied

Both guards now assert that `check().verdicts` is not `[]`, inside the test that reads the drift
(`check-enumeration-drift.test.ts` › "this repository", and
`check-mirrored-constants-against-this-repository.test.ts`). The separate registry tests are
deleted. `REGISTRY` and `MIRRORS` are no longer exported.

Census, all of `packages` and `apps`:

```
grep -rnE "expect\(\[?\.{0,3}[A-Z][A-Z0-9_]+\]?\.length[,)]" --include='*.test.ts' --include='*.test.tsx' packages apps
```

It returned 3 hits outside these two files: `agent-placement.test.ts`, `skill-contents.test.ts` and
`derive.contract.test.ts` in `apps/editor`. Each guards an input the test builds itself, not a
module's registry, so none of them is this shape.

## Proposed Standard

The scripts' checkers already refuse other inputs that would leave them judging nothing
(`NO_DOORS`, `SOURCE_ENUMERATES_NOTHING`, `NO_SPECS`). These two `check()` functions accept an
empty registry and report clean. They should refuse it like the others, with one `expectRefusal`
spec each. That makes the vacuity structural, and the test-side guard becomes unnecessary. Until
then, a guard that a scan judged something should assert on what the scan returned.
`clean-code-standards.md` § 6 is the home. Nothing in `CLAUDE.md` conflicts.
