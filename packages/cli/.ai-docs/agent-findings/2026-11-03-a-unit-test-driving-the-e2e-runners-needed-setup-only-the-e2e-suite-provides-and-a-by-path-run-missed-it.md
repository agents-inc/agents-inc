---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/e2e-runner-environment.test.ts
  - e2e/fixtures/codex-on-path.ts
  - e2e/global-setup.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-11-03
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: partial
partial_note: >-
  Landed: the unit test stubs `CODEX_SHIM_ENV` before each case, so it runs without the e2e global
  setup. Pending: nothing tells a change to `e2e/fixtures/` or `e2e/helpers/` which unit tests load
  it.
---

## What Was Wrong

`e2e-runner-environment.test.ts` is a unit test that loads the e2e runners (`CLI.run`,
`TerminalSession`) to check that every spawned binary is kept from the developer's HOME, the seed
API and other exported variables. A change to `e2e/fixtures/codex-on-path.ts` moved the codex shim
from one fixed temp folder to one per run, whose path reaches workers only through
`AGENTS_INC_E2E_CODEX_BIN`. `e2e/global-setup.ts` sets it; the unit project has no global setup. Two
of the three runners then threw on every case: 10 of the test's 15 failed, both headless and at a
120x40 terminal.

The lane that made the change ran its unit tests by path, naming the files it touched. This test
reaches `codex-on-path.ts` only through the runners it loads, so no by-path list included it, and
the red surfaced at the final unfiltered gate.

## Fix Applied

A file-level `beforeEach` stubs `CODEX_SHIM_ENV` (imported, not restated) to a folder nothing
creates, and a file-level `afterEach` clears the stubs. `codexShimDir()` keeps throwing when the
variable is unset; a fallback there would hide a real run that skipped global setup.

## Proposed Standard

`standards/e2e/README.md`, under fixtures: a change to `e2e/fixtures/` or `e2e/helpers/` also runs
the unit tests that reach into them, listed by
`grep -rln -E "e2e/(fixtures|helpers)/" src scripts --include='*.test.ts'`, or the unfiltered unit
suite. A unit test that loads an e2e runner provides, in its own setup, every variable the e2e
global setup would.
