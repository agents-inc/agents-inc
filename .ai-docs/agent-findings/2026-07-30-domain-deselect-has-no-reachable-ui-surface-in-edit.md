---
type: standard-gap
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/commands/edit.tsx
  - src/cli/components/hooks/use-build-step-props.ts
  - src/cli/components/wizard/domain-selection.tsx
  - src/cli/components/wizard/stack-selection.tsx
  - src/cli/commands/init.tsx
  - src/cli/lib/installation/installation.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/README.md
date: 2026-07-30
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
---

## What Was Wrong

A test plan asked for an E2E spec covering "a project-scope edit toggling a domain off,
saving, and the global config surviving byte-identical". Tracing the surfaces first showed
that scenario has **no reachable UI path**, so the spec would have had to invent a flow that
no user can perform:

1. `toggleDomain` has exactly two callers: `domain-selection.tsx` (the DOMAINS step) and
   `stack-selection.tsx` (the init-only "start from scratch" branch, which seeds the default
   scratch domains and then enters the DOMAINS step).
2. `cc edit` hydrates with `initialStep: "build"`, and `hydrateForEdit` sets `history: []`.
   The build step's ESC handler (`use-build-step-props.ts` `onBack`) calls `prevDomain()` and
   falls back to `goBack()`, which no-ops on empty history. So the DOMAINS step is
   unreachable from an edit session — already pinned by
   `e2e/interactive/edit-wizard-navigation.e2e.test.ts` ("should stay on build step when
   pressing ESC in edit flow with no prior history", asserting `not.toContain(STEP_TEXT.DOMAINS)`).
3. `cc init` cannot supply the missing surface either: `showDashboardIfInitialized` calls
   `detectInstallation`, which falls back to `detectGlobalInstallation`, so any project run
   with a global install present routes to the dashboard → `edit` → build step. This is the
   same mechanism as the plan's "Finding 0" (the init-mode guard bypass being a production
   no-op) — the reachability argument extends from the `isInitMode` guards to `toggleDomain`.

Net effect: a domain deselect can never see a globally-installed entry in production, and a
store-level fix to `toggleDomain` is provable only at unit level. The same reasoning applies
to any "init mode + global preselection" scenario — the two vacuous specs the plan already
flagged (`init-global-preselection-confirm.e2e.test.ts`,
`selected-agent-name-excluded.e2e.test.ts`) are the same class: they drive an EDIT session
through the dashboard, not the init wizard their names imply.

## Fix Applied

None — discovery only. The requested E2E spec was deliberately not written; the (a) case is
covered at unit level in `src/cli/stores/wizard-store.test.ts` instead. Reported to the
delegating agent with the source trace above so the plan's "user-visible" framing for the
domain-deselect fix can be corrected before the code change lands.

## Proposed Standard

Add a rule to `.ai-docs/standards/e2e/anti-patterns.md` (new subsection under the existing
reachability/vacuous-test guidance):

> **Prove the surface exists before writing the E2E.** Before adding an E2E for a store
> action, grep for the action's callers and confirm a keypress path reaches one of them in
> the flow under test. Store actions reachable only from init-only steps (`stack`,
> `domains`) cannot be exercised by `cc edit` — it hydrates at `build` with empty history,
> so ESC cannot walk backwards. If no path exists, cover the behaviour at unit level and say
> so in the test-plan response; do not synthesize a flow the UI cannot produce, and do not
> settle for an absence-only assertion (a blocked action satisfies it vacuously).

A companion note belongs in `.ai-docs/reference/wizard/state-transitions.md`: state
explicitly that the DOMAINS step is init-only and unreachable from `edit`, so future plans
stop treating domain-level actions as edit-flow surfaces.
