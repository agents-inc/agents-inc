---
type: convention-drift
severity: low
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-loader.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-24
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`FetchResult.unreachable` in `source-fetcher.ts` is copied into `SourceLoadResult.unreachable` by
`resolveBaseResult` and the remote branch of `source-loader.ts`, and nothing in production reads it
after that. Only unit specs assert it (`source-fetcher-revalidation.test.ts`,
`source-loader-global.test.ts`, `source-fetcher.test.ts`). Census, every read outside the fetcher:

```
grep -rn "unreachable" packages/cli/src packages/cli/e2e --include='*.ts' --include='*.tsx' | grep -E "\.unreachable|unreachable[,}]|\{[^}]*unreachable" | grep -v "^\S*source-fetcher.ts:"
```

It cost a decision in CLI-958: a copy kept over a refused version check needed an `unreachable`
value, and nothing downstream could say which one was right. It was set `false`, since the
marketplace was reached.

`packages/cli/CLAUDE.md` already says to delete a field with no reader rather than widen it, but
only under display and report types (`agentsDir`), so it doesn't read as covering a load result.

## Fix Applied

None. Discovery only: deleting the field is outside CLI-958's scope.

## Proposed Standard

Delete `unreachable` from `FetchResult` and `SourceLoadResult`, and the specs asserting it. Before
that, check whether a spec stands in for a reader that was meant to exist (the
unused-test-binding rule in `packages/cli/CLAUDE.md`). Widen the CLAUDE.md sentence to "any result
type", not only display and report types. Not cross-checked against a standard that wants the flag
kept: none was found.
