---
type: convention-drift
severity: medium
affected_files:
  - e2e/pages/terminal-screen.ts
  - e2e/pages/base-step.ts
  - e2e/pages/dashboard-session.ts
  - e2e/pages/wizards/edit-wizard.ts
  - e2e/pages/wizards/init-wizard.ts
  - e2e/pages/steps/agents-step.ts
  - e2e/pages/steps/build-step.ts
  - e2e/pages/steps/confirm-step.ts
  - e2e/pages/steps/domain-step.ts
  - e2e/pages/steps/search-modal.ts
  - e2e/pages/steps/sources-step.ts
  - e2e/pages/steps/stack-step.ts
  - e2e/helpers/terminal-session.ts
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/standards/e2e-testing-bible.md
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code rename landed (79 call sites across 12 files in e2e/pages/). Pending —
  the ~17 docs/standards files and CLAUDE.md § "Test Assertions" still name the
  removed `waitForStableRender()`, and the dead duplicate
  `TerminalSession.waitForStableRender` in e2e/helpers/terminal-session.ts is
  untouched. Both are enumerated under "Proposed Standard" below.
---

## What Was Wrong

`TerminalScreen.waitForStableRender(timeoutMs)` and its cursor-anchored sibling
`waitForStableRenderAfter(cursor, timeoutMs)` were named as if they were generic
"wait until the terminal UI has settled" primitives. They are not. Each is a
single `waitForText("select", …)` sentinel match against the wizard footer
string emitted by `HOT_KEYS` in `src/cli/components/wizard/wizard-layout.tsx`.
The sentinel exists on every wizard step and **only** on wizard steps.

The name invited exactly the misreading it eventually caused: a mechanical
keypress-guard sweep applied `waitForStableRender()` to
`e2e/pages/dashboard-session.ts`. The dashboard renders `ASCII_LOGO` plus a bare
`SelectList` with no footer, so the sentinel never appears; the guard burned the
full 15s `TIMEOUTS.WIZARD_LOAD` and threw. Because the shared dual-scope helpers
funnel through `DashboardSession`, that single misapplication fanned out to
**72 failures across 35 files**. That incident is recorded in
`2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`,
whose Proposed Standard item 2 asked for this rename. This finding records that
the rename has now landed.

A second, still-open instance of the same naming hazard was found during the
sweep: `TerminalSession.waitForStableRender` in `e2e/helpers/terminal-session.ts`
is an **independent duplicate** of the same one-string sentinel (it calls its own
`waitForText("select", …)` and returns `getFullOutput()`). It has **zero callers**
anywhere in `e2e/`, `src/`, or `scripts/` — it is dead code carrying the exact
misleading name the rename was meant to eliminate, and it remains grabbable by
autocomplete for the next agent writing a non-wizard page object.

## Fix Applied

Pure mechanical rename, no behavioural, timeout, or call-order changes:

- `waitForStableRender` → `waitForWizardFooter`
- `waitForStableRenderAfter` → `waitForWizardFooterAfter`

Renamed on `TerminalScreen` (`e2e/pages/terminal-screen.ts`) and on the identically
named pure-delegation wrappers on `BaseStep` (`e2e/pages/base-step.ts`). Renaming
the `BaseStep` wrappers was required for the rename to accomplish anything — the
`TerminalScreen` method has only 5 direct callers, whereas the `BaseStep` wrapper
is the name all ~70 step-file call sites actually read.

**79 occurrences across 12 files** in `e2e/pages/`: `terminal-screen.ts` (3),
`base-step.ts` (14), `dashboard-session.ts` (1), `wizards/{edit,init}-wizard.ts`
(2, 1), `steps/{agents,build,confirm,domain,search-modal,sources,stack}-step.ts`
(6, 29, 3, 4, 3, 11, 2).

The JSDoc on both methods now leads with the precondition rather than burying it:
"ONLY valid on screens rendered by WizardLayout, which paints the footer
containing 'select'… This is a sentinel match on one literal string, NOT a
generic 'the UI has settled' primitive." The `BaseStep` wrapper JSDoc adds the
corollary that every `BaseStep` subclass qualifies and non-`BaseStep` page
objects do not.

**Call-site audit (the point of the exercise).** Every one of the 79 sites was
checked against the precondition. All are on `WizardLayout`-rendered screens:
the 7 step files and `base-step.ts` are all `BaseStep` subclasses; both wizard
launchers wait on build-step frames. `dashboard-session.ts`'s single remaining
use sits inside `selectEdit`'s `retryEnterUntil` callback, which runs _after_
Enter has launched the edit wizard and after `STEP_TEXT.BUILD_FOOTER` has
already matched — the footer genuinely is rendering there. It is pre-existing
and correct, matching the explicit "deliberately not touched" carve-out in the
prior finding. **No latent dashboard-class bugs were found.**

Verification: `npm run build` clean; `npx tsc --noEmit` reports only the known
baseline `default-categories.ts(468,12) TS1360`; `npx prettier --check` clean on
all 12 files; 24 tests across 6 e2e files pass (`smoke/pom-framework`,
`lifecycle/dual-scope-edit-display`, `lifecycle/exclusion-lifecycle`,
`interactive/init-wizard-navigation`, `interactive/edit-wizard-navigation`,
`interactive/search-static`) — spanning `DashboardSession`, both wizard
launchers, and all seven step page objects.

## Proposed Standard

1. **Delete `TerminalSession.waitForStableRender`** (`e2e/helpers/terminal-session.ts`).
   Zero callers, duplicate sentinel, misleading name. The project is pre-1.0, so
   remove it outright rather than aliasing. Not done here: the file is outside
   this task's ownership boundary.

2. **Sweep the docs.** The rename makes every doc naming the old method wrong —
   they now document a symbol that does not exist. Files still carrying
   `waitForStableRender`: `CLAUDE.md` § "Test Assertions";
   `.ai-docs/standards/e2e/page-objects.md`, `.ai-docs/standards/e2e/README.md`,
   `.ai-docs/standards/e2e/test-structure.md`, `.ai-docs/standards/e2e-testing-bible.md`;
   `.ai-docs/reference/testing/e2e-infrastructure.md`,
   `.ai-docs/reference/test-infrastructure.md`,
   `.ai-docs/reference/concepts/guard-pattern.md`,
   `.ai-docs/reference/wizard/state-transitions.md`,
   `.ai-docs/reference/findings-impact-report.md`, `.ai-docs/DOCUMENTATION_MAP.md`;
   `todo/TODO.md`, `todo/refactor-expressive-ts.md`. Historical records —
   the six prior `agent-findings/*.md` and the four `changelogs/*.md` — should
   **not** be rewritten; they describe incidents under the then-current name, and
   editing them falsifies the record. Cross-reference instead.

3. **Combine the rename with the CLAUDE.md rule qualification** (item 1 of the
   prior finding, still pending). The rule currently reads "NEVER add a key-press
   method to an E2E step page object without calling `waitForStableRender()`
   first". It must both use the new name and carry the WizardLayout qualifier —
   a name that states its precondition plus a rule that states it is the durable
   fix; either alone leaves the trap half-set.

4. **Naming rule, generally applicable.** A test helper whose implementation is a
   match on one hardcoded sentinel string MUST be named for that sentinel
   (`waitForWizardFooter`), never for the condition the sentinel is being used to
   infer (`waitForStableRender`). The inferred condition is the _caller's_
   interpretation and is only valid under a precondition the name silently drops.
   Belongs in `.ai-docs/standards/e2e/page-objects.md` alongside the keypress rule.
