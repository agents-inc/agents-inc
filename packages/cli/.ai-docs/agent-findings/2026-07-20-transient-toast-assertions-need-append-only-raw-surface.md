---
type: missing-standard
severity: high
affected_files:
  - e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts
  - e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts
  - e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts
  - e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts
  - e2e/pages/steps/build-step.ts
  - e2e/pages/terminal-screen.ts
  - src/cli/components/wizard/wizard-layout.tsx
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: 'Three of the four proposed items landed; one did not. Landed (verified 2026-07-30): the `toggleFilterIncompatibleAwaiting` affordance; item 1''s assertions.md half — an "Assert the Surface That Retains the Value" section with the processed-vs-raw table and "Toasts are always a raw-output assertion", naming the cursor-anchor requirement and why an unanchored raw match is unsound; item 3, the follow-up sweep — `BuildStep.toggleFocusedSkillAwaiting` and `selectSkillAwaiting` both exist and `AgentsStep.toggleFocusedAgentAwaiting` was added beyond what was asked; item 4 — `terminal-screen.ts`''s `waitForTextAfter` JSDoc now states the rule ("assert on post-cursor raw output"), not just the mechanism. Pending: item 2. `standards/e2e/anti-patterns.md` has no "reading a toast off the processed buffer with no wait" entry, so the anti-pattern is described nowhere in the doc agents consult for anti-patterns — only the positive rule exists, in assertions.md. `standards/e2e/README.md` carries the general `getOutput()`-is-not-a-frame-log rule but not the toast-specific cursor-anchoring rule item 1 also asked for there.'
---

## What Was Wrong

Toast assertions were being written against xterm's **processed buffer**
(`getOutput()` / `getFullOutput()` / `getScreen()`). That surface is not
append-only: Ink rewrites rows in place, so a transient element can be gone
from the buffer before the test reads it — even though the process definitely
wrote it.

The wizard toast is rendered in an absolutely-positioned row
(`<Box position="absolute" marginTop={terminalHeight - 4}>` in
`src/cli/components/wizard/wizard-layout.tsx`), which makes it especially
prone to being overwritten.

Measured on `global-skill-filter-incompatible-guard.e2e.test.ts` (F-hotkey
path), immediately after the keypress:

| Surface                                  | Occurrences of the lock toast |
| ---------------------------------------- | ----------------------------- |
| processed buffer (`build.getOutput()`)   | **0**                         |
| raw PTY output (`wizard.getRawOutput()`) | **1**                         |

So the test failed on a correct product fix. The guard fired, the state
update re-rendered, and the toast was written — the test was simply reading a
surface that had already lost it.

The same assertion on the SPACE path
(`global-skill-toggle-guard.e2e.test.ts`) currently measures **1** on both
surfaces, so it passes. That is a timing/layout coincidence, not a different
contract: both paths set the identical `toastMessage` through the identical
absolutely-positioned row. The SPACE tests also read with **no closed-loop
wait at all** — just `getOutput()` after `pressSpace()`'s fixed keystroke
delay — so under suite contention they can only degrade into flakes.

Two further traps found while fixing this:

1. **Anchoring on the footer is unsound for toasts.** The obvious
   cursor-anchored gate, `waitForStableRenderAfter(cursor)` (waits for the
   `"select"` footer), does not guarantee the toast has landed. Two runs of
   the same test produced opposite orderings in the post-cursor raw slice:
   `toast@1163 / select@2691` on one run, `select@1290 / toast@2610` on the
   retry. The gate must anchor on the toast text itself.

2. **A non-anchored raw match is also unsound.** `waitForRawText` would match
   a toast emitted earlier in the same session, producing a false pass.
   Raw + pre-action cursor is the only combination that is both faithful and
   non-vacuous.

Trap 1 is a second, independent reason not to treat `waitForStableRender` /
`waitForStableRenderAfter` as a generic "the UI has settled" primitive —
complementary to
`2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`,
which makes the same point from the opposite direction (the footer sentinel is
absent outside the wizard). Here the footer is present but arrives at an
unstable position relative to the element under assertion.

`e2e/pages/terminal-screen.ts` already documented the underlying hazard in
the `waitForTextAfter` JSDoc ("xterm's processed buffer is not append-only
(Ink rewrites lines in place) ... Raw output IS append-only"), but nothing
connected that note to the rule "therefore assert transient UI on raw", and
nothing pointed at it from the standards docs. The knowledge existed at the
framework layer and never reached the test layer.

## Fix Applied

Added a cursor-anchored, raw-surface affordance to the build step page object
(`e2e/pages/steps/build-step.ts`):

```ts
async toggleFilterIncompatibleAwaiting(sentinel: string): Promise<void> {
  await this.waitForStableRender();
  const cursor = this.getRawCursor();
  await this.pressKey("f");
  await this.screen.waitForTextAfter(sentinel, cursor, this.defaultTimeout);
}
```

It mirrors the existing `ConfirmStep.confirmAwaiting(sentinel, timeoutMs)`
idiom (act, then await a raw sentinel) and obeys the page-object key-press
rule (`waitForStableRender()` before the press). The pre-existing
`toggleFilterIncompatible()` is unchanged, so
`init-wizard-filter-incompatible.e2e.test.ts` (the non-blocked path) is
untouched and still green.

`global-skill-filter-incompatible-guard.e2e.test.ts` now names its sentinel
at the point of the keypress instead of scraping scrollback at the end of the
test:

```ts
await wizard.build.toggleFilterIncompatibleAwaiting(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);
```

This is strictly stronger than the assertion it replaces: it reads the
surface the process actually wrote, it cannot match stale residue, and it
reads the toast at emission time rather than after it has auto-cleared.
Proven red/green by disabling the guard in `wizard-store.ts`
(`toggleFilterIncompatible`) and rebuilding — the test fails with
`timeout waiting for "Global skills cannot be changed from project scope"
after raw cursor 1468` — then restoring it and re-running to green.

The sibling `global-skill-toggle-guard.e2e.test.ts` was **not** changed. It is
green and currently observes the toast on both surfaces; converting it needs a
matching SPACE-path affordance (`toggleFocusedSkillAwaiting`) and should be
done as one sweep across all four toast-asserting sites, verified together —
see Proposed Standard.

## Proposed Standard

**1. Add to `.ai-docs/standards/e2e/README.md` → "Critical Rules", and to
`.ai-docs/standards/e2e/assertions.md`:**

> **Assert transient UI on the raw append-only surface, anchored to a
> pre-action cursor.** Toasts, spinners, and any element Ink can overwrite
> must NOT be asserted via `getOutput()` / `getFullOutput()` / `getScreen()`.
> Those read xterm's processed buffer, which is not append-only — Ink rewrites
> rows in place, so the text can be gone before the test reads it, producing a
> failure on correct product code. Only `getRawOutput()` is append-only.
>
> Anchor the wait, don't just switch surface. Capture `getRawCursor()` before
> the action and use `TerminalScreen.waitForTextAfter(sentinel, cursor, …)`:
>
> - a non-anchored `waitForRawText` can match an identical toast emitted
>   earlier in the session (false pass);
> - `waitForStableRenderAfter` (footer `"select"`) is NOT a valid gate for a
>   toast — the footer and the toast are not emitted in a stable order within
>   a frame, so it can return before the toast lands.
>
> Express this as a page-object method that acts and awaits the sentinel,
> following `ConfirmStep.confirmAwaiting` and
> `BuildStep.toggleFilterIncompatibleAwaiting`. The test supplies the sentinel
> constant so the contract stays visible in the test file.

**2. Add to `.ai-docs/standards/e2e/anti-patterns.md`:**

> **Anti-pattern: reading a toast off the processed buffer with no wait.**
> `await step.someKeypress(); expect(step.getOutput()).toContain(TOAST)` has
> two defects — the wrong surface, and no closed-loop wait (it relies on
> `pressKey`'s fixed keystroke delay having outrun the render). When it
> passes it does so by coincidence of layout and timing, and the identical
> pattern one code path over will fail outright. Use an
> `…Awaiting(sentinel)` page-object method instead.

**3. Follow-up task (not done here — out of scope for a narrowly-diagnosed
fix):** add `BuildStep.toggleFocusedSkillAwaiting(sentinel)` and migrate the
four remaining processed-buffer toast assertions in one verified sweep:

- `e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts` (2 sites)
- `e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts`
- `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts`

**4. Cross-reference from `e2e/pages/terminal-screen.ts`:** the
`waitForTextAfter` JSDoc should state the rule, not just the mechanism, so the
next reader of the framework layer sees the test-layer consequence.
