---
type: missing-standard
severity: low
affected_files:
  - apps/editor/vite.config.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-23
reporting_agent: web-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`2026-10-21-a-mutant-only-playwright-reaches-can-be-served-to-the-dev-server-without-writing-the-shared-tree`
serves a hand mutant through a Vite config outside the tree so the shared source is never written.
Followed as written, it still writes the shared tree: the out-of-tree config hashes differently from
the editor's own, so Vite re-optimises into the editor's dependency cache. Observed on CLI-949, the
first such run printed:

```
[vite] (client) Re-optimizing dependencies because vite config has changed
```

The cache is untracked, so `git diff` stays empty and nothing reports it. But another lane's dev
server (any `test:e2e` run) reads the same cache, and each server re-optimising under the other can
serve outdated dependency chunks mid-run: a failure in a lane that changed nothing.

## Fix Applied

None in the tree. The out-of-tree config used for CLI-949 sets `cacheDir` to a scratch directory,
and the "Re-optimizing" line did not reappear on the four runs after it. The editor's own dev server
re-optimises once on its next start, back to its own hash.

## Proposed Standard

Add to the method the 2026-10-21 finding proposes for `docs/architecture.md` › "Mutation testing":
the out-of-tree Vite config sets its own `cacheDir`, outside the tree. Nothing checks this. Not in
conflict with `CLAUDE.md`.
