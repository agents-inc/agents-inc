---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/seed/publish-seed.ts
  - src/cli/lib/loading/source-fetcher.ts
  - src/cli/lib/hosts/claude-project-trust.ts
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/matrix/matrix-health-check.ts
  - src/cli/lib/seed/external-skills.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/seed/fetch-seed.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: scope-discipline-deferred
status: partial
partial_note: >-
  Two copies folded in lane X3 round 2 (isFieldMapping into isRecord, publish-seed's arrivedAsText
  into fetch-seed's). Three remain, each needing a home in a file X3 does not own (utils/,
  matrix/matrix-provider.ts).
---

## What Was Wrong

Library modules re-declare a helper that already exists, or that a sibling module declares too.
Census, run from `packages/cli` on 2026-10-21 after this lane's changes:

```
grep -rn -B2 'return JSON.parse(' src/cli --include='*.ts' | grep -v '\.test\.' | grep 'function '
src/cli/lib/seed/publish-seed.ts-130-function jsonOf(text: string): unknown {
src/cli/lib/loading/source-fetcher.ts-326-function parseJsonOrUndefined(raw: string): unknown {
src/cli/lib/hosts/claude-project-trust.ts-110-function parsedOrUndefined(json: string): unknown {

grep -rn '\.exclusive\b' src/cli/lib --include='*.ts' | grep -v '\.test\.'
src/cli/lib/seed/seed-apply.ts:462:    matrix.categories[category]?.exclusive === true;
src/cli/lib/config-gate/propagate.ts:124:  return matrix.categories[category]?.exclusive === true;
src/cli/lib/matrix/matrix-health-check.ts:122:  return definition !== undefined && definition.exclusive;

grep -rn 'new Set(typedKeys(BUILT_IN_MATRIX.skills))' src/cli --include='*.ts'
src/cli/lib/seed/external-skills.ts:84:const CATALOGUE_SKILL_IDS ...
src/cli/lib/loading/source-loader.ts:581:const CATALOGUE_SKILL_IDS ...
```

Three bodies of one try/`JSON.parse`/`undefined` under three names, and one exclusivity rule
written three times. The copy in `seed-apply.ts` gives itself away: its docblock reads "An
undeclared category is not exclusive (see `propagate.ts`)". It points at its twin rather than
importing it, so the two agree only while both authors remember the comment.

Before this round there were two more: `isFieldMapping` in `loading/loader.ts` was the body of
`isRecord` in `utils/type-guards.ts`, and `arrivedAsText` with its `QUOTABLE_TYPE` stood in both
`seed/fetch-seed.ts` and `seed/publish-seed.ts`.

## Fix Applied

`loader.ts` calls `isRecord`; `publish-seed.ts` imports `arrivedAsText` from `fetch-seed.ts`, which
it already imported from. The remaining three are reported, not moved: each needs a shared home
in a file this lane does not own.

## Proposed Standard

One `parseJsonOrUndefined` in `src/cli/utils/`, one `isExclusiveCategory(category, matrix)` in
`matrix/matrix-provider.ts` beside `getCategoryDomain`, and one catalogue id set exported beside
the matrix provider. In `clean-code-standards.md`, a line: a comment pointing at another file's
identical code is a duplicate, so import the code instead. This does not conflict with CLAUDE.md's
"never export a constant used only in its own file", since each has callers in two modules. No
check here reports a duplicated body, as the sibling finding
`2026-10-21-four-command-guards-are-private-copies-of-one-body-beside-the-base-command-that-hosts-their-siblings`
records for commands. The censuses above are the only instrument.
