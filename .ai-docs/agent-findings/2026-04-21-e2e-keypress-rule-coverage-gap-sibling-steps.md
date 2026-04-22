---
type: convention-drift
severity: medium
affected_files:
  - e2e/pages/base-step.ts
  - e2e/pages/steps/agents-step.ts
  - e2e/pages/steps/confirm-step.ts
  - e2e/pages/steps/domain-step.ts
  - e2e/pages/steps/search-modal.ts
  - e2e/pages/steps/sources-step.ts
  - e2e/pages/steps/stack-step.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-04-21
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The 2026-04-21 fix (finding `2026-04-21-e2e-build-step-keypress-missing-stable-render.md`) added `await this.waitForStableRender()` to seven `build-step.ts` methods and proposed tightening the rule so it applies to every keypress, not just the first after a transition. That fix did not sweep the sibling step files.

Audit of every key-press-emitting page-object method across `e2e/pages/steps/*.ts` and `e2e/pages/base-step.ts` finds the following uncovered methods (no `waitForStableRender` before the keystroke):

**`base-step.ts`** (helpers inherited by every step):

- `pressEnterAndWaitFor` — only a cursor-anchored _post-press_ wait; the Enter can race the effect queue on the CURRENT frame before any cursor-anchored logic runs
- `navigateCursorToItem` — arrow-down loop
- `waitForItemVisible` — arrow-down loop
- `navigateDown` / `navigateUp` / `navigateRight` — public passthroughs to `pressArrowX`
- `abort` — Ctrl+C

**`agents-step.ts`**: `navigateCursorToAgent`, `advance`, `goBack`

**`confirm-step.ts`**: `goBack`, `goBackToAgents`

**`domain-step.ts`**: `acceptDefaults` (uses `waitForStep`, not stable-render), `toggleDomain`, `advance`, `deselectAll`, `goBack`

**`search-modal.ts`**: `type`, `selectResult`, `close`

**`sources-step.ts`**: `setAllLocal`, `setAllPlugin`, `toggleFocusedSource`, `openSettings`, `closeSettings`, `pressAddSource`, `pressDeleteSource`, `goBack`, `advance` (only `acceptDefaults` waits via `waitForReady`)

**`stack-step.ts`**: `selectFirstStack`, `selectStack`, `selectScratch`, `cancel`

These methods work today because (a) the sub-wizard they drive doesn't share the `focusedSkillId` post-mount seeding pattern, and (b) the callers usually happen to give the renderer time. Neither property is guaranteed — any future component that seeds store state in a post-mount `useEffect` will re-introduce the same flake class in sibling steps.

## Fix Applied

None — discovery only. Documented the coverage gap in `.ai-docs/reference/testing/e2e-infrastructure.md` under the new "Page-Object Keypress Rule" section with a per-method table.

## Proposed Standard

1. Sweep all seven files above and add `await this.waitForStableRender()` as the first line of every keypress method, matching `build-step.ts`. Prefer a single mechanical pass over drip-fixes.
2. Update `BaseStep` primitives (`pressEnter`, `pressSpace`, `pressKey`, `pressEscape`, `pressArrowX`, `pressCtrlC`) to `waitForStableRender` internally — this would make the rule impossible to violate and eliminate the audit burden. Open question: does the extra footer-match poll inside every primitive slow the suite unacceptably? Measure before committing.
3. Add a `standards/e2e/page-objects.md` checklist item: "Grep your new step method for `this.session.` or `this.press*`. Every hit must be immediately preceded by `await this.waitForStableRender()` in the same method."
4. Longer-term: pursue Fix A (seed `focusedSkillId` synchronously in `hydrateWizardStore`) so the `FOCUS_EFFECT_FLUSH_MS` escape hatch in `build-step.ts::toggleScopeOnFocusedSkill` can be deleted and the entire race class disappears.

## Docs Landed — 2026-04-21

Item 3 merged into `.ai-docs/standards/e2e/page-objects.md` § "Adding
a New Wizard Method" as a **self-check before committing** paragraph
directly under the existing "Never call `pressKey` / … without a
preceding `await this.waitForStableRender()`" rule. The paragraph
includes the grep command, the "elsewhere in the method does not
count" qualifier, the loop-body carve-out, and a cross-link to the
per-method coverage audit in `.ai-docs/reference/testing/e2e-infrastructure.md`.

Items 1 (file sweep), 2 (primitive-level wait), and 4 (Fix A) remain
code-only. Finding status stays `open` until the seven-file sweep
lands — the audit gap is still present on `main`.
