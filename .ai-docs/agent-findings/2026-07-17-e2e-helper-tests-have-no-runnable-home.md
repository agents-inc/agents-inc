---
type: standard-gap
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - src/cli/lib/__tests__/helpers/config-comparison.ts
  - src/cli/lib/__tests__/helpers/config-comparison.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-17
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

CLAUDE.md requires a genuinely reusable E2E helper to "live in `e2e/helpers/` ... WITH its own tests — never inline and untested." But no vitest project actually executes a `*.test.ts` file placed under `e2e/helpers/`: the root project's include glob is `src/**/*.test.ts`, and `e2e/vitest.config.ts`'s is `e2e/**/*.e2e.test.ts`. A test file at `e2e/helpers/some-helper.test.ts` would silently never run under either config — an orphaned test that looks like coverage but isn't.

Discovered while extracting a duplicated `normalizeGlobalConfig` helper (previously inlined verbatim in two E2E lifecycle test files) into a shared, tested location.

## Fix Applied

The helper was placed at `src/cli/lib/__tests__/helpers/config-comparison.ts` (inside the unit project's include glob, so its co-located `.test.ts` actually runs on `npm test`), re-exported through `src/cli/lib/__tests__/helpers/index.ts`, and re-exported again from `e2e/helpers/test-utils.ts` for E2E consumption — mirroring the existing pattern already used for `writeTestPackageJson`. Both consuming E2E files now import it from `../helpers/test-utils.js` instead of carrying inline copies.

## Proposed Standard

Document in `.ai-docs/standards/e2e/README.md` (or wherever the "extract reusable helpers" rule currently lives) that a tested E2E helper's actual implementation + test belongs under `src/cli/lib/__tests__/helpers/`, re-exported through `e2e/helpers/test-utils.ts` — not under `e2e/helpers/` directly, since a test file placed there will never execute. Point to `writeTestPackageJson` / `normalizeGlobalConfig` as the canonical example of this pattern.
