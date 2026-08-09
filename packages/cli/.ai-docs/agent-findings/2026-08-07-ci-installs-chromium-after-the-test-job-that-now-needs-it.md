---
type: architectural-drift
severity: high
affected_files:
  - .github/workflows/ci.yml
  - packages/ui/vitest.config.ts
  - packages/ui/package.json
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-07
reporting_agent: web-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`check-web` in `.github/workflows/ci.yml` runs its steps in this order:

```
- run: bun run test --filter='!agents-inc'          # unit tests
- run: bunx playwright install --with-deps chromium # working-directory: apps/editor
- run: bun run test:e2e --filter='!agents-inc'      # Playwright suite
```

The ordering encodes an assumption that held until 2026-08-07: that `test` is
Node-only and only `test:e2e` needs a browser. The comment beside the install
step says as much — "Only chromium is configured, so only chromium is
installed" — and it is attached to the E2E suite.

EDITOR-01 breaks that assumption. `packages/ui` now has a `test` script whose
suite is Storybook's Vitest addon running every story in **real Chromium** via
`@vitest/browser-playwright`. It is picked up by `bun run test --filter='!agents-inc'`,
which is the step that runs _before_ Chromium is installed.

This does not reproduce locally, which is the trap: any machine that has ever
run the editor's Playwright suite already has browsers in `~/.cache/ms-playwright`,
so the suite is green locally and on any warm runner. It fails only on a cold
CI runner — i.e. on every real CI run.

A second, smaller mismatch rides along: the install step sets
`working-directory: apps/editor`, because that is where the Playwright config
lived. Browsers land in a shared user-level cache so the directory does not
actually matter for resolution, but the step now serves two workspaces and
reads as if it serves one.

## Fix Applied

None — reported, not fixed. Two other agents were live in the repository at the
time and `ci.yml` was already carrying uncommitted edits, so changing it would
have collided. The suite, its config and its scripts are complete and green;
only the CI ordering is outstanding.

The fix is to move the Chromium install **above** the `test` step:

```yaml
- run: bunx playwright install --with-deps chromium
- run: bun run typecheck --filter='!agents-inc'
- run: bun run lint --filter='!agents-inc'
- run: bun run test --filter='!agents-inc'
- run: bun run test:e2e --filter='!agents-inc'
```

and to drop `working-directory: apps/editor`, since the step now provisions a
browser for two workspaces rather than one. The comment above it should say
that the browser serves both the editor's Playwright suite and the design
system's Storybook suite, or it will be re-narrowed by the next reader.

## Proposed Standard

A workspace-level `test` script is free to change what it _needs_ from the
runner, and nothing in CI notices. The rule that would have caught this belongs
in `.ai-docs/standards/` alongside the existing gate documentation:

> **A CI step that provisions a runtime must be ordered above every step that
> could consume it, not beside the step it was written for.** Provisioning
> steps — browser installs, service containers, toolchain setup — are named
> after the job that first needed them and then silently become shared. When a
> new suite starts needing one, the ordering is the only thing that fails, and
> it fails only on a cold runner.

The generalisable check: **if a gate passes locally but the runner is a
different shape, the difference is what CI is for.** Anything cached in `$HOME`
— Playwright browsers, bun's cache, turbo's local cache — is present on a
developer machine and absent on a fresh runner, so "it passed locally" is not
evidence about CI for any suite that touches one.
