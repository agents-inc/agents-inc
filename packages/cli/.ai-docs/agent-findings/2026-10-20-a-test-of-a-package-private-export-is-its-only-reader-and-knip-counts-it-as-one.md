---
type: anti-pattern
severity: low
affected_files:
  - packages/matrix/src/built-in-agents.ts
  - packages/matrix/src/read-model/sub-agents.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-structure.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`packages/matrix/src/built-in-agents.test.ts` tested `agentDefinitionSchema` and
`agentDefinitionsSchema`, which the package does not export: neither is in `src/index.ts` or a
`package.json` `exports` subpath, and `read-model/sub-agents.ts` is their only production reader.
Folding the schema into `sub-agents.ts` changes no behaviour, yet that file went red on it
(`Cannot find module './built-in-agents'`) while the other 399 tests stayed green. That was checked
in a scratch copy of the package.

Default `knip` cannot see this, because it counts a test as a reader. On that tree,
`npx knip --workspace packages/matrix --include exports,types` exited 0.
`npx knip --workspace packages/matrix --production --include exports,types` exited 1 and named
`agentDefinitionSchema`, because the test was its only reader. `tested-exports-reach-production.test.ts`
covers this class for `packages/cli` alone.

## Fix Applied

The file was deleted, and its refusals were rewritten through `SUB_AGENT_GROUPS` / `subAgentById`
in `sub-agents.test.ts`. They inject a bad generated roster with `vi.doMock("../generated/agents")`,
the same seam the file already used. Four mutants were checked in the scratch copy: id as
`z.string()`, model as `z.string()`, `.optional()` in place of `.exactOptional()`, and a `model`
key always set. The rewritten specs kill all four. The old file killed the first three.
`agentDefinitionSchema` lost its `export`.

Census, run after the fix: `knip --production --include exports,types` exits 0 for `packages/matrix`,
`packages/api` and `packages/api-mocks`. No other workspace was run.

## Proposed Standard

For workspaces outside `packages/cli`, use
`npx knip --workspace <w> --production --include exports,types` as the census for "a private helper
tested directly". Each name it prints is an export that only a test reads. This is a census and
not a gate, which matches the repository's ruling that knip is not a gate. Nothing in
`CLAUDE.md` conflicts with it.
