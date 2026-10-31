---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/shared-source.ts
  - packages/cli/e2e/global-setup.ts
  - packages/cli/e2e/handrun-journeys.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-29
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  CLI-994 gives each run its own folder, handed to the workers through the
  AGENTS_INC_E2E_SHARED_FIXTURES variable, removes it at teardown, and sweeps dead runs' folders at
  startup.
---

## What Was Wrong

The e2e shared fixtures sat at one fixed machine-wide folder under `os.tmpdir()`, so two runs on one
machine wiped each other's data. Measured with the old harness, two runs at once: the second ended
"Test Files 55 failed | 5 passed (60)", with 93 "Local marketplace not found" lines. The fixed path
rested on a premise recorded in the INDEX line
`2026-09-02-a-fixture-at-a-machine-wide-path-had-no-rule-about-who-may-write-it`: that "neither side
can be handed the location". It was false: global setup's `process.env` reaches the workers vitest
starts after it.

## Fix Applied

CLI-994: `setUpSharedSource` in `shared-source.ts` builds in a folder of the run, named by the
variable above, and only it (called from `e2e/global-setup.ts` and `e2e/handrun-journeys.ts`) sweeps
and builds in `os.tmpdir()`. The same two-run measurement afterwards: "58 passed (60)", with none of
those lines; the 2 reds fail alone too.

## Proposed Standard

`.ai-docs/standards/e2e/README.md`: a fixture shared across a run's workers lives in a folder of that
run, handed over by global setup, never at a fixed machine-wide path.
