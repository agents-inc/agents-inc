---
type: convention-drift
severity: medium
affected_files:
  - e2e/pages/base-step.ts
  - e2e/pages/steps/agents-step.ts
  - e2e/pages/steps/build-step.ts
  - e2e/pages/steps/confirm-step.ts
  - e2e/pages/steps/domain-step.ts
  - e2e/pages/steps/search-modal.ts
  - e2e/pages/steps/sources-step.ts
  - e2e/pages/steps/stack-step.ts
  - e2e/pages/wizards/init-wizard.ts
  - e2e/pages/wizards/edit-wizard.ts
  - e2e/pages/dashboard-session.ts
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Landed — the seven-file keypress-guard sweep (item 1 of
  2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md) across base-step,
  all six sibling step files, build-step loop bodies, dashboard-session, and
  InitWizard.acceptStackDefaults. Pending — three sync `abort()`/`escape()`/
  `ctrlC()` wizard methods cannot be guarded without changing their signature
  to async (see "Deliberate carve-outs" below); they are reachable via the new
  guarded `abortAndDestroy()` instead, but the sync methods remain on the API.
  CORRECTION 2026-07-20 — the `dashboard-session.ts` portion of this sweep was
  WRONG and has been reverted; see "Correction" below.
---

> **Correction (2026-07-20).** The `e2e/pages/dashboard-session.ts` guards listed
> below as landed were incorrect and have been reverted. The dashboard is not a
> wizard screen, so `waitForStableRender` — which matches the wizard footer
> sentinel `"select"` — could never succeed there and hung for the full 15s
> timeout, causing 72 failures across 35 files. The three guards on `arrowDown()`,
> `arrowUp()` and `selectEdit()` were removed, restoring the file byte-identical
> to its pre-sweep state. The other ten files in this sweep are wizard screens
> rendered through `WizardLayout` and their guards stand. See
> `2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`.

## What Was Wrong

`2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md` audited every
key-press-emitting page-object method and found the 2026-04-21 `build-step.ts`
fix had not been swept across the sibling files. That finding's item 1 (the
seven-file sweep) stayed `open` on `main`; only the docs items landed.

Re-audit on 2026-07-20 confirmed the gap was still present, and found two
method classes the original audit did not enumerate:

- **Loop bodies.** `base-step.waitForItemVisible`, `base-step.navigateCursorToItem`,
  `domain-step.deselectAll`, `search-modal.type`, and `build-step.focusSkill`
  press keys inside a loop. A single guard at the top of the method does not
  cover iterations 2..N — `.ai-docs/standards/e2e/page-objects.md` already
  requires the wait _inside_ the loop body, but no file did this.
- **Composition helpers that press.** `base-step.pressEnterAndWaitFor` and
  `build-step.pressEnterWaitNewFrame` drive `retryEnterUntil`, which writes
  Enter to the PTY. They are not "raw primitives" (whose no-wait contract is
  documented design intent) so they need the guard themselves.

## Fix Applied

Added `await this.waitForStableRender()` upstream of every PTY write across all
owned page objects, including inside the five loop bodies and both composition
helpers. Callers that only delegate to a now-guarded helper were NOT given a
redundant second guard.

Cost is near-zero: `waitForStableRender` polls for the footer sentinel
`"select"` via `pollUntil`, which evaluates its predicate _before_ its first
`delay()`. Once any wizard frame is in scrollback the guard returns on the
first synchronous check.

Verified: `init-wizard-navigation` (5/5), `edit-wizard-excluded-skills` (5/5),
`init-wizard-scratch` (7/7) — covering abort, per-step goBack, cancel,
cursor navigation, deselectAll, scratch domains, and the build grid.

### Deliberate carve-outs (guard NOT added, with reason)

| Method                                                                                   | Why skipped                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseStep` `pressEnter`/`pressSpace`/`pressKey`/`pressEscape`/`pressArrow*`/`pressCtrlC` | Documented design intent: primitives are raw and cost-flat; the wait is each composed method's responsibility (`e2e-infrastructure.md` § BaseStep "Design intent"). Guarding them would double-wait in ~20 already-correct methods. |
| `retryEnterUntil` internal press loop                                                    | It IS the stability primitive — its `confirmPainted(cursor)` post-condition is the closed loop that detects a dropped Enter. Guarded once at each call site instead.                                                                |
| `InitWizard.abort/escape`, `EditWizard.abort`, `DashboardSession.escape/ctrlC`           | Synchronous `void` methods called **unawaited** at 19 + 7 spec sites. Making them `async` would silently create floating promises at every call site, and the spec files could not be updated in the same change.                   |

## Proposed Standard

1. The sync-abort carve-out is the last hole. Close it by making
   `abortAndDestroy()` (added in this change, guarded and `async`) the
   sanctioned teardown API, then delete the bare sync `abort()`/`escape()`/
   `ctrlC()` methods once spec adoption completes. Until then, a guard on
   those methods is unreachable without a breaking signature change.
2. Add to `.ai-docs/standards/e2e/page-objects.md` § "Adding a New Wizard
   Method": a page-object method that only delegates to an already-guarded
   composition helper (`pressEnterAndWaitFor`, `navigateCursorToItem`,
   `waitForItemVisible`) does NOT need its own guard — stacking guards adds
   noise without changing the invariant. Name the guarded helpers explicitly
   so the self-check grep does not produce false positives.
3. Update the per-method coverage table in
   `.ai-docs/reference/testing/e2e-infrastructure.md` § "Page-Object Keypress
   Rule" — it still states "All `press*`, `navigate*`, `waitForItemVisible`,
   `navigateCursorToItem`, `abort`, and `pressEnterAndWaitFor` do NOT wait
   before pressing", which is now stale for everything except the raw
   primitives.
