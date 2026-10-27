---
type: standard-gap
severity: low
affected_files:
  - packages/cli/e2e/fixtures/dual-scope-helpers.ts
  - packages/cli/e2e/fixtures/e2e-stack-seed.ts
  - packages/cli/.ai-docs/standards/e2e/test-data.md
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/test-data.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Met by the CLI-965 tester on 2026-10-24; filed by the CLI-981 tester on 2026-10-26, with every claim
below re-derived against that day's tree.

`createTestEnvironment()` in `e2e/fixtures/dual-scope-helpers.ts` makes `projectDir` as
`<fakeHome>/project`: the project sits inside the fake HOME. Its own comment says so. The other
setups give two sibling folders under one temp folder: `ProjectBuilder.dualScope()` (`global-home`
and `project`) and the unit suite's `setupIsolatedHome` (`fakehome` and `project`).

`e2e/test-data.md` describes the helper as "Creates tempDir/fakeHome/project with permissions
files", which reads as three folders, and its guidance on choosing between it, the seed wrappers and
`ProjectBuilder.dualScope()` says nothing about where the project sits. The seed wrappers inherit the
nesting: `installDualScopeStack`, `createDualScopeEnvFromSeed` and `createGlobalOnlyEnvFromSeed` in
`e2e/fixtures/e2e-stack-seed.ts` each call it.

The CLI-965 tester's first draft of a spec about the old-folder line used it, and the line came out
as `<tmp>/fake-home/project/.claude-src/`, so the spec covered a project under HOME as well as its
subject without saying so. The tester moved the spec to sibling roots.

No product behaviour depends on the nesting today, as far as a search shows: the CLI recognises HOME
by equality (`isHomeDirectory`) and walks no ancestors. The gap is that a spec gets one layout or the
other by its choice of helper, and nothing it reads at that choice tells it which.

Census of the spec files built on it, from `packages/cli` (a census; the seed wrappers' callers come
on top):

```
grep -rln 'createTestEnvironment(' e2e --include='*.e2e.test.ts' | wc -l
```

On 2026-10-26 it returned 126.

## Fix Applied

None. Discovery only.

## Proposed Standard

In `e2e/test-data.md`:

- The `createTestEnvironment` row says "the project inside the fake HOME (`<fakeHome>/project`)".
- The helper-choice paragraph names each setup's layout: `createTestEnvironment` and the seed
  wrappers nest the project in HOME; `ProjectBuilder.dualScope()` makes them siblings.
- A spec whose subject depends on where the project sits relative to HOME (a line naming a root, how
  far a scope reaches) picks its layout on purpose, and says which in its docblock.

This conflicts with no CLAUDE.md rule.
