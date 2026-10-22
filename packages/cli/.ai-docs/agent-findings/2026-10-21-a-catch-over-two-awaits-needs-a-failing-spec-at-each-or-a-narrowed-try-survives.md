---
type: anti-pattern
severity: low
affected_files:
  - apps/server/src/crawl.ts
  - apps/server/src/crawl.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: api
root_cause: missing-rule
status: open
---

## What Was Wrong

`fetchManifest` (`apps/server/src/crawl.ts`) holds `fetch` and `await response.text()` in one `try`,
and its catch turns a failed SKILL.md read into one skill left out. No spec in `crawl.test.ts`
reaches it. The spec credited with it, "fails rather than returning a partial index when a
repository is unreachable", stubs every `fetch` to reject, so the crawl dies in `fetchRepoFacts`
before any SKILL.md is read. Three hand mutants each left the file's 31 specs green (the mutants
tried, not a census): the catch rethrowing, the `try` narrowed to `fetch`, and the `try` narrowed to
`text()`. Under any of them one dropped connection rejects `readSkills`' `Promise.all`, so
`crawlSkillIndex` rejects and `scripts/build-skill-index.ts` writes no index for any repository.

## Fix Applied

None in the tree; the test file was outside the reporting lane. The spec proposed for it, run from a
scratch copy, has one case where `fetch` rejects and one where it answers 200 over a body stream that
errors. Each case cuts one URL and every other call still reaches msw. All 33 specs pass on the real
file. The rethrow mutant fails both cases, and each narrowing mutant fails exactly the case at the
await it moved out of the `try`. A single "connection refused" case leaves the fetch-only narrowing
alive. Both stubs answer what a real `fetch` can, so this is not the shape
`2026-10-20-a-catch-reached-only-by-stubbing-a-collaborator-into-a-failure-it-cannot-make` refuses.

## Proposed Standard

`standards/e2e/anti-patterns.md`, or a unit-suite equivalent: a catch over several awaits gets a
failing case at each await, and a spec whose stub fails the first call covers no catch after it.
Nothing checks either. Not in conflict with `CLAUDE.md`.
