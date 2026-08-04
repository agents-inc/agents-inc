---
type: missing-standard
severity: high
affected_files:
  - e2e/pages/dashboard-session.ts
  - e2e/pages/terminal-screen.ts
  - e2e/helpers/terminal-session.ts
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
# Partially reverts the dashboard-session.ts portion of
# 2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout.md (that finding's
# other ten files stand, so this does not supersede it). The originating
# 2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md was correctly scoped
# and is likewise not superseded.
status: partial
partial_note: >-
  Code fix landed (three bad guards removed from dashboard-session.ts, restoring
  it byte-identical to HEAD). The rule-qualification in CLAUDE.md and
  standards/e2e/page-objects.md is still pending — until it lands, the next
  mechanical sweep will re-introduce the same class of bug.
---

## What Was Wrong

The keypress rule is stated without a qualifier. CLAUDE.md § "Test Assertions" says:

> NEVER add a key-press method to an E2E step page object without calling
> `waitForStableRender()` first — React effects may not have fired yet,
> causing handlers to silently no-op

Read literally — "every key-sending method gets a guard" — this is unsafe, because
`waitForStableRender` is **not a generic stability primitive**. It is a sentinel
match on one literal string. From `e2e/pages/terminal-screen.ts`:

```ts
/** Wait for the wizard footer ("select") to render, indicating stable layout. */
async waitForStableRender(timeoutMs: number): Promise<void> {
  await this.waitForText("select", timeoutMs);
}
```

The string `"select"` comes from `HOT_KEYS` in `src/cli/components/wizard/wizard-layout.tsx`
(`{ label: "select", values: [KEY_LABEL_SPACE] }`), rendered by `WizardFooter`.
`WizardLayout` renders `WizardFooter` in **both** branches, so the sentinel is
present on every wizard step — and **only** on wizard steps.

A Pass 8 Cluster G item applied the unqualified rule to `e2e/pages/dashboard-session.ts`,
adding a guard to `arrowDown()`, `arrowUp()` and `selectEdit()`. The dashboard is not
a wizard. `Dashboard` in `src/cli/commands/init.tsx` renders only `ASCII_LOGO` plus
`SelectList`, and `SelectList` (`src/cli/components/common/select-list.tsx`) renders
no footer at all:

```
❯ Edit
  Compile
  Doctor
  List
```

The substring `"select"` never appears. The guard therefore burned the full
`TIMEOUTS.WIZARD_LOAD` (15s) and threw:

```
TerminalScreen: timeout waiting for "select" after 15000ms
  ❯ TerminalScreen.waitForStableRender  e2e/pages/terminal-screen.ts
  ❯ DashboardSession.selectEdit         e2e/pages/dashboard-session.ts
  ❯ initProject / initProjectAllGlobal  e2e/fixtures/dual-scope-helpers.ts
```

Because the shared dual-scope helpers all funnel through `DashboardSession`, this
single misapplied rule fanned out to **72 failures across 35 files** (suite went
from ~520/521 passing to 443 passing).

Two aggravating details worth recording:

1. **Scrollback does not save you.** `waitForText` scans `getFullOutput()`, which
   includes scrollback, so one might assume a dashboard following a wizard in the
   same PTY would find stale `"select"` residue and pass. It does not: the dashboard
   calls `clearTerminalScreen()` (`src/cli/commands/init.tsx`), which writes
   `\x1b[H\x1b[2J\x1b[3J` — and `\x1b[3J` erases saved lines, wiping scrollback.
   The hang is therefore deterministic, not load-dependent.

2. **A passing guard here would have been worse.** Had the residue survived, the
   guard would have returned instantly on stale text — a silent no-op that looks
   like protection while providing none.

The prior finding (`2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md`)
was correctly scoped: it enumerated seven wizard-step files plus `base-step.ts`,
and did **not** list `dashboard-session.ts`. The regression came from the sweep
generalising past that finding's own scope to "all key-sending methods".

## Fix Applied

Removed the three swept guards from `e2e/pages/dashboard-session.ts` (`arrowDown`,
`arrowUp`, `selectEdit`) and dropped the now-unused `TIMEOUTS` import.
`git diff HEAD -- e2e/pages/dashboard-session.ts` is now empty — the file is
byte-identical to its pre-sweep state.

Deliberately **not** touched: the `waitForStableRender` inside `selectEdit`'s
`retryEnterUntil` callback. That one is pre-existing and correct — by the time it
runs, Enter has already launched the edit wizard, so the footer genuinely is
rendering.

Audited every other guard the sweep added (`git diff HEAD -- e2e/pages/`):
`base-step.ts`, `steps/{agents,build,confirm,domain,search-modal,sources,stack}.ts`,
`wizards/{edit,init}-wizard.ts`. All of them operate on `BaseStep` subclasses whose
screens are rendered through `WizardLayout`, so the footer genuinely is present —
including `StepSettings` and `SearchModal`, both of which render inside
`WizardLayout` (via `renderStep()` and `source-grid.tsx` respectively). Verdict for
all of those: **KEPT**. `dashboard-session.ts` was the only non-wizard page object
the sweep touched; `wizard-result.ts` and `retry-enter.ts` contain no such guards.

No guard was converted to `waitForStableRenderAfter`. That variant is only correct
when the cursor is captured **before** a repaint-triggering action; a cursor
captured at a pre-keypress guard site would wait for output that is never coming
and hang. The existing correct usage is `build-step.ts::pressEnterWaitNewFrame`,
which captures the cursor via `retryEnterUntil` and anchors _after_ the Enter.

Verification: `uninstall-reinit-lifecycle`, `tombstone-cleanup-PtoG-restoration`,
`re-edit-cycles`, and `smoke/pom-framework` all pass (10 tests). Typecheck clean
apart from the known pre-existing `default-categories.ts` TS1360.

## Proposed Standard

1. **Qualify the rule in CLAUDE.md** § "Test Assertions". Replace the current
   unqualified line with:

   > NEVER add a key-press method to a **wizard** step page object without calling
   > `waitForStableRender()` first — React effects may not have fired yet, causing
   > handlers to silently no-op. `waitForStableRender` matches the wizard footer
   > sentinel `"select"` and is valid **only** on screens rendered through
   > `WizardLayout`. On non-wizard screens (the dashboard, the post-install result
   > screen, plain `SelectList` menus) it hangs for the full timeout. For those,
   > wait on text the screen actually renders.

2. **Rename the primitive** to `waitForWizardFooter()` (keeping
   `waitForStableRender` as nothing at all — the project is pre-1.0, so no alias).
   The current name actively invites the misapplication: "stable render" reads as a
   universal primitive, "wizard footer" cannot be misread. This is the single
   highest-leverage change; a rule that has to be remembered will be forgotten,
   whereas a name that states its own precondition will not.

3. **Add a precondition guard to the helper.** Have `waitForStableRender` fail fast
   with a diagnostic naming the likely cause, rather than burning 15s and reporting
   a bare timeout:

   > `waitForStableRender` waited for the wizard footer but the screen does not
   > appear to be a wizard step. If this is the dashboard or a non-wizard menu,
   > wait on text that screen actually renders.

4. **Add to `.ai-docs/standards/e2e/page-objects.md`** § "Adding a New Wizard
   Method", directly beneath the existing self-check paragraph: before adding a
   guard, confirm the screen is rendered through `WizardLayout`. If the page object
   does not extend `BaseStep`, the guard is almost certainly wrong.

5. **Sweep-hygiene rule, generally applicable.** When a finding proposes a
   mechanical sweep, the sweep's scope is the file list in that finding — not a
   generalisation of its rationale. Broadening the target set is a new decision
   requiring its own verification, and the `type: standard-gap` findings that
   propose sweeps should say so explicitly.
