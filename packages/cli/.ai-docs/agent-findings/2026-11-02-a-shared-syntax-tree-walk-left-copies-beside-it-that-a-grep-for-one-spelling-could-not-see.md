---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/__tests__/helpers/syntax-tree.ts
  - src/cli/lib/__tests__/helpers/kebab-case-judges.ts
  - src/cli/lib/__tests__/helpers/producer-rosters.ts
  - src/cli/lib/__tests__/helpers/known-gap-retries.ts
  - src/cli/lib/__tests__/helpers/test-only-invocations.ts
  - scripts/check-boundary-union-casts.ts
  - scripts/refusal-expectations.ts
  - scripts/check-spec-name-vocabulary.ts
  - scripts/check-spawn-doors.ts
  - scripts/check-findings-frontmatter.ts
  - scripts/check-symbol-citations.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-11-02
reporting_agent: reviewer
category: dry
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  Code half landed: the census in the body finds no full walk outside `eachNode`, and the four
  walks left beside it do a different job. The census rule and the pin proposed below are not
  written.
---

## What Was Wrong

REPO-55's third round, CLI test-support lane, added `eachNode` (a parent-before-children walk of a
TypeScript syntax tree) in `src/cli/lib/__tests__/helpers/syntax-tree.ts`. It moved only the
word-for-word copies it was looking at onto it. The review found four more walks doing the same
job. Three it found with
`grep -rn -E 'forEachChild\([a-zA-Z.]+, *visit\)' packages/cli/scripts`, and one,
`knownGapMarkersIn` in `known-gap-retries.ts`, by reading. The fix round found four more that the
grep could not see, because they were written `node.forEachChild(collect)`: `spawnCallsIn`,
`literalPiecesIn` and `initializerOf` in `check-spawn-doors.ts`, and `identifiersIn` in
`check-findings-frontmatter.ts`. A grep for one spelling of the call found three of the eight
copies left. `clean-code-standards.md` 8.1 asks for the shared helper, and nothing reports a copy
beside it.

## Fix Applied

The fix round moved all eight onto `eachNode`. Census, 2026-11-02, from `packages/cli`:

```
grep -rnE 'forEachChild|getChildren\(' --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist ../../packages ../../apps
```

Besides `eachNode` itself, it finds four walks that do a different job, which the fix round left on
purpose. `valueIdentifiersIn` in `check-spawn-doors.ts` skips property-key names, and
`valueIdentifiersIn` in `test-only-invocations.ts` skips type nodes. `containsNode` in
`producer-rosters.ts` stops at the first match. `linksIn` in `check-symbol-citations.ts` uses
`getChildren` to reach JSDoc. `grep -rn 'eachNode(' --include='*.ts' src scripts` finds 13 calls in
8 files, besides the helper and its own test.

## Proposed Standard

Two parts, both proposals:

- A census for a syntax-tree walk greps for the call (`forEachChild`, `getChildren(`), not for one
  spelling of it.
- A spec holds the walks outside `syntax-tree.ts` to the four named above, with `toStrictEqual`
  against a named list, the way
  `check-findings-frontmatter-against-this-repository.test.ts` holds its known references.

The fix round weighed a lint ban on `forEachChild` and dropped it, because it would need disables
at the four sites. CLAUDE.md allows a disable only where the rule's own escape hatch cannot work,
and giving `eachNode` a pruning option would be one. Neither part conflicts with CLAUDE.md.
