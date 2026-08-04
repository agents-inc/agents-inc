---
type: standard-gap
severity: medium
affected_files:
  - e2e/helpers/terminal-session.ts
  - e2e/pages/base-step.ts
  - e2e/interactive/wizard-terminal-resize-guard.e2e.test.ts
  - src/cli/components/wizard/wizard-layout.test.tsx
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/README.md
date: 2026-07-31
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: "The two consequences were worked around in the spec and page objects that hit them, and both are recorded in `standards/e2e/README.md` (resize paragraph) and in the NEEDS-VALIDATION annotation on `reference/testing/e2e-infrastructure.md`. Neither is written as a RULE in `standards/e2e/anti-patterns.md` or `assertions.md`, and `TerminalSession.getScreen`'s misleading doc comment is unchanged — correcting it changes what every existing caller reads, which is a deliberate pass of its own."
---

## What Was Wrong

Two independent harness behaviours, both undocumented, both of which silently produce tests that
cannot fail. They surfaced together while covering the mid-session terminal-resize guard, because
that feature's contract is "the wizard is REPLACED" — an absence claim, and an absence claim is
exactly what these two break.

### 1. `getScreen()` is not the viewport, despite its name and its doc comment

```ts
/** Reads the visible screen area (viewport only, no scrollback). */
getScreen(): string {
  return this.readBufferLines(this.xterm.buffer.active.viewportY + this.xterm.rows);
}
```

`readBufferLines(n)` reads absolute buffer lines `0 .. n-1`. `viewportY` is the absolute row of the
TOP of the viewport, so the range is **scrollback + viewport**, not the viewport. While a session has
produced no scrollback (`viewportY === 0`) the two coincide, which is why this has never bitten —
most specs assert positively, and most short sessions never scroll.

It bites the moment a spec makes a negative claim about a screen that used to show something else.
Shrinking a terminal from 60 rows to 16 pushes the entire pre-shrink frame into scrollback, so
`expect(screen).not.toContain(STEP_TEXT.BUILD)` fails against residue _whether or not the guard
works_. The obvious test for "the wizard was replaced" is therefore unsound, and its failure looks
like a product bug rather than a harness one.

Note this is not the same as the already-documented "`getOutput()` is a buffer, not a frame log"
rule in `standards/e2e/README.md`. That rule warns against asserting a PAST frame was present. This
is the converse and is not covered: asserting a past frame is ABSENT now.

### 2. Raw output after a resize contains two frames, not one

The cursor-anchored raw-output idiom (`getRawCursor()` → act → `waitForTextAfter`) is the suite's
standard escape from problem 1. It does not rescue a negative assertion here either, because a
resize triggers **two** paints: Ink's own `resized()` handler re-renders the current tree
synchronously, and only then does the dimensions hook's `setState` produce the guarded render. The
post-cursor raw slice therefore holds `[old wizard frame] + [prompt frame]`, so
`not.toContain("Framework")` fails there as well.

### 3. (Unit-side, same family) Ink effects have not run when `render()` returns

`ink-testing-library`'s `render()` returns before the concurrent root has flushed effects. A test
that mutates the stdout stub and emits `resize` on the next line emits into a stdout **nothing is
subscribed to yet** — `useTerminalDimensions`'s `useEffect` has not run. The frame simply never
changes, and the test reads as "the guard does not work". One `await delay(RENDER_DELAY_MS)` between
`render()` and the first interaction is the whole fix; without knowing why, the natural next move is
to mock the hook, which would have thrown away the only coverage of the resize subscription itself.

## Fix Applied

Worked around rather than papered over, in each place it mattered:

- The E2E spec asserts **order, not absence**: `toMatch(/Please resize\.$/)` — the prompt is the last
  thing painted, so nothing was drawn after it. That IS the "replaced, not overlaid" contract, and it
  is discriminating (with the guard reverted the buffer ends with the wizard footer). The spec
  carries a paragraph explaining why the absence assertion was rejected, so a later reader does not
  "strengthen" it back into an unsound one.
- `BaseStep.resizeBelowMinimum` / `resizeAboveMinimum` close the loop on cursor-anchored raw waits
  (the resize prompt one way, the wizard footer the other), so neither depends on reading a screen.
- `TerminalSession.resize` resizes the PTY **and** the xterm instance, with a comment saying why
  both: PTY-only leaves the emulator laying new output out at the old geometry, emulator-only never
  reaches the process.
- The unit test mounts through a `mountLayout()` helper that awaits the first paint, with the reason
  in its doc comment.
- `standards/e2e/README.md` gained a "Resizing mid-session" paragraph carrying the absence warning;
  `reference/testing/e2e-infrastructure.md`'s NEEDS-VALIDATION annotation records the `getScreen`
  behaviour.

## Proposed Standard

**Rule, for `.ai-docs/standards/e2e/assertions.md`:** _never assert that text is ABSENT from
`getScreen()` / `getOutput()` when the same text was legitimately on screen earlier in the session.
Both surfaces include scrollback, so the assertion is testing the emulator's memory, not the
process's current output. Prove the negative by ORDER instead — assert that the expected content is
the last thing painted (`toMatch(/…$/)`) — or by BEHAVIOUR (drive the session and assert the outcome
that the absent element would have changed)._

**Rule, for `.ai-docs/standards/e2e/anti-patterns.md`:** _a terminal resize paints twice — the
emulator's own re-render of the existing tree, then the app's reaction to the new dimensions. Any
assertion anchored on a pre-resize raw cursor must expect both frames._

**Correction owed to `TerminalSession.getScreen`'s doc comment.** It states the opposite of what the
method does. Left unchanged here deliberately: it is read by every page object and every spec author,
so rewriting it belongs to a pass that can also audit whether any existing spec depends on the
current (wrong) description — this pass verified only the specs it touched.

**Rule, for `.ai-docs/standards/e2e/patterns.md` or the component-test section of
`reference/testing/infrastructure.md`:** _`ink-testing-library`'s `render()` returns before effects
flush. Any component test that interacts with the stdout stub — resize, keypress on a hook-registered
handler — must await one render tick first. A frame that never changes after an interaction is this
bug before it is a product bug._
