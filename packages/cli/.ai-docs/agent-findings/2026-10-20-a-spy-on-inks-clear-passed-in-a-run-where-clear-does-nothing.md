---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/components/common/prompt-confirm-holds-the-terminal.test.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The spec stands stdout at a TTY fed to @xterm/headless, as spinner.test.ts does, and asserts the
  screen keeps an answered prompt by default and loses it under clearOnResolve. The render.js mock
  is gone.
---

## What Was Wrong

`prompt-confirm-holds-the-terminal.test.tsx` mocked the project's own `components/render.js` to wrap
each Ink instance's `clear` in a spy. Its spec "erases a resolved prompt only when asked to" asserted
the spy ran once under `clearOnResolve` and never without it.

Ink 7's `clear()` acts only when Ink paints interactively —
`if (this.interactive && !this.options.debug) { this.log.clear(); … }` in `ink/build/ink.js` — and
interactive is `!isInCi && stdout.isTTY` unless a caller forces it. A vitest worker's stdout is no
TTY, so in the run that judged the spec `clear()` erased nothing. The spec stayed green whether or
not anything was erased, and a behaviour-preserving change (erasing through another Ink API, say)
would have turned it red.

## Fix Applied

Rewritten as two specs. stdout is a TTY fed to `@xterm/headless`. The prompt paints a question, and
the spec checks the question is on row 0 before it answers. Then it asserts row 0 still holds the
question without `clearOnResolve`, and that with it row 0 is blank and the cursor is on row 0. Both
were watched failing against `prompt-confirm.tsx`: with the `clear()` call removed the erase spec
fails, and with the call unconditional the keep spec fails.

Sibling census, run over `packages/cli` after the rewrite, returned nothing:

```
grep -rnE "\.(clear|unmount|rerender)\)\.(not\.)?toHaveBeenCalled" src e2e --include='*.ts' --include='*.tsx'
```

`stubInkInstance` is used by `edit.test.ts` and `init-edit-validation-parity.test.ts` only to stop
wizards drawing. Neither asserts on its `clear`.

## Proposed Standard

`packages/cli/CLAUDE.md` → Test Assertions: never assert that a terminal effect was CALLED (clear,
erase, raw mode). Assert what the screen shows or what mode the input is in, with stdout fed to
`@xterm/headless` as in `spinner.test.ts`, because Ink gates its erasing on an interactive paint a
vitest worker never has. Checked against `CLAUDE.md`: it extends "the rendered frame is the
contract" and conflicts with nothing.
