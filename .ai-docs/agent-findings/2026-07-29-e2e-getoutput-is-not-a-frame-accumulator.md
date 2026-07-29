---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/edit-wizard-dual-scope-added-marker.e2e.test.ts
  - e2e/pages/base-step.ts
  - e2e/helpers/terminal-session.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-07-29
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

An E2E spec tried to dodge the Sources grid's focus padding (a focused row renders
`+  React ` — glyph, then the name padded with spaces — so the single-space form
`+ React` is not a substring) by pressing a navigation key and then asserting on
`step.getOutput()`, on the stated assumption that "the accumulated output is then
guaranteed to hold a frame where the row renders in the stable unfocused form".

That assumption is false. `BaseStep.getOutput()` calls
`TerminalSession.getFullOutput()`, which reads **xterm's processed buffer**
(`this.xterm.buffer.active`) — screen plus scrollback. Ink redraws in place, so when
a frame is small enough to fit the viewport (the common case on `TERMINAL_SIZE.TALL`)
each repaint **overwrites** the previous one and nothing scrolls into scrollback. The
earlier frame is gone.

The helper that does have frame-accumulating semantics is
`TerminalSession.getRawOutput()`, whose own doc comment already says it "captures
every byte the process wrote — including text that Ink later overwrites in the
terminal buffer". It is not exposed on `BaseStep`.

Verified empirically against the real binary (temporary probe spec, since removed):

```
PROBE before-move getOutput  marker "+ web-framework-react": true
PROBE after-move  getOutput  marker "+ web-framework-react": false
PROBE after-move  getRawOutput marker "+ web-framework-react": true
```

A second, compounding assumption in the same comment — "one move flips which of them
holds focus" — silently depends on which row starts focused. `SourceGrid` seeds focus
with `firstFocusableRowIndex(rows, 0)` and `step-sources.tsx` passes no
`defaultFocusedRow`, so focus starts on the FIRST focusable row. In this fixture that
is the untouched project row, so the single `navigateDown()` moves focus ONTO the row
under test rather than away from it — the assertion would have been better served by
capturing before the move, or not moving at all.

## Fix Applied

None to the spec — reporting only. The hard constraints for this task forbade editing
the RED spec, and the production behaviour it targets is correct: the marker renders
(proven by the probe above, and by the pre-move capture containing the exact asserted
string). The spec needs a one-line change by its owner — assert on the raw output, or
capture `getOutput()` before the navigation key.

The production fix this spec was written against did land:
`buildSourceRows` now classifies additions on the `(id, scope)` slot rather than the
id alone, so the project row of a globally-installed skill adopted at project scope
carries the `+` marker.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` a section
**"getOutput() is a buffer, not a frame log"**:

- `getOutput()` / `getFullOutput()` return xterm's processed buffer — the CURRENT
  screen plus whatever genuinely scrolled off. Ink repaints overwrite in place, so a
  value that was rendered and then re-rendered differently is NOT retrievable from it.
- Never assert "some earlier frame contained X" via `getOutput()`. If a test needs
  historical frames, assert at the moment the frame is on screen, or add a
  `getRawOutput()` passthrough on `BaseStep` and use that — it is the only
  frame-accumulating surface.
- When a rendering differs between focused and unfocused states (padding, chevrons,
  highlight), assert against the state that is actually on screen at capture time
  rather than pressing keys to manufacture a different one. If a key press is
  unavoidable, assert which row holds focus first — `SourceGrid` seeds focus at
  `firstFocusableRowIndex(rows, 0)`, which skips inert (locked / pending-removal)
  rows, so "the first row" and "the first focusable row" are frequently different.

Also add the `getOutput()`-vs-`getRawOutput()` distinction to the E2E Helpers table in
`.ai-docs/reference/testing/e2e-infrastructure.md`, which currently lists both without
noting that only one survives an in-place repaint.
