---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/components/wizard/wizard-layout.tsx
  - src/cli/lib/operations/source/load-source.ts
  - src/cli/utils/logger.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-08-09
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  WizardLayout now paints the buffered messages as a band between the tab bar and the step
  (`StartupMessages`, three painted where the terminal has rows to spare and one below
  LOGO_MIN_TERMINAL_ROWS, the rest counted), covered by five component tests in
  wizard-layout.test.tsx and by e2e/interactive/init-wizard-unreachable-source.e2e.test.ts, which
  stages a warm cache against a tarball server and then takes the server away.
---

## What Was Wrong

`WizardLayout` declared `startupMessages?: StartupMessage[]` and never destructured it. Everything
upstream worked: `loadSource({ captureStartupMessages: true })` turned on buffering so `warn()`
collected instead of writing to stderr, `init` and `edit` threaded the drained buffer through
`runWizardSession` into `<Wizard>`, and `<Wizard>` passed it to `<WizardLayout>` — which dropped it.

Buffering is not optional decoration on that path: the wizard clears the terminal on its way in, so
a warning written to stderr before Ink mounts is wiped. Buffered and unrendered, those lines existed
nowhere at all. The source-unreachable warning (`Could not reach <source> — using the cached copy,
which may be out of date.`) is the one that made this visible: the whole point of falling back to a
cached copy quietly is that the user is TOLD the copy may be stale, and on `init`/`edit` they never
were.

Two comments described a rendering path that did not exist — `logger.ts` ("passed to Ink's
`<Static>` component so messages survive Ink's clearTerminal") and `load-source.ts` ("The caller
passes these messages to the Wizard's `<Static>` block"). There has never been a `<Static>` block in
this codebase. Only `reference/utilities.md` recorded the truth, in a subordinate clause.

## Fix Applied

`StartupMessages` in `wizard-layout.tsx`, rendered between `WizardTabs` and the step content and
outside the `showInfo` branch, so a warning is readable whether the step or the `I` overlay is up.
Level-coloured with the existing vocabulary (`info` → `NEUTRAL`, `warn` → `WARNING`, `error` →
`ERROR`), `flexShrink={0}` so Yoga cannot compress the lines into one overprinted row.

**The cap is load-bearing, and was not a guess.** The band paints at most three messages and counts
the rest (`... and N more`). The hand-run that verified the fix opened the wizard against the E2E
fixture source and the band reported **2384** buffered warnings — one per unresolved relationship
slug in that fixture's `skill-rules.ts`. Unbounded, the band would have swallowed the wizard whole
at any terminal height. The default marketplace produces none, so a healthy install still shows no
band at all.

**A second budget, below `LOGO_MIN_TERMINAL_ROWS`, came from the E2E suite rather than from
reading.** At `TERMINAL_SIZE.SHORT` — the wizard's own advertised minimum — a four-row band left the
confirm summary a one-row viewport, and `wizard-overflow-affordance` / `confirm-step-info-panel-parity`
went red on rows they could no longer scroll into view. The band now paints one message and the count
at that height, on the same measurement the logo gate rests on: a terminal too short to spare six
rows for decoration cannot spare four for news either.

## Proposed Standard

In `reference/component-patterns.md`, beside the new band section: **a prop a component accepts is
part of its contract, and a contract nothing renders is a silent drop.** Where a component takes
data it does not use, either render it or delete the prop — an accepted-and-ignored prop reads to
every caller as delivery, which is precisely why three call sites went on threading this one.

There is no cheap checker for this class (the prop was declared, so `noUnusedLocals` saw nothing —
it was never destructured, so nothing was unused). What would have caught it is the rule the E2E
standards already state for tests, applied to plumbing: **prove the code path fired.** A feature
whose whole output is a rendered line needs one assertion on the rendered frame; this one had four
files of plumbing and no test that any of it reached a terminal.
