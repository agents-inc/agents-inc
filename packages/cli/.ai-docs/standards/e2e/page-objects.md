---
last_validated: 2026-10-15
---

# Page Objects

The Page Object Model (POM) framework -- how it works and how to use it.

---

## Layer Architecture

Tests (the top layer) must never reach down to the Session layer.

| Layer       | Responsibility                                   | Files                                                                  |
| ----------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| **Test**    | Launch, interact, assert. No terminal mechanics. | `e2e/**/*.e2e.test.ts`                                                 |
| **Page**    | Launch a command, press keys, wait for text.     | `e2e/pages/dashboard-session.ts`, `e2e/fixtures/interactive-prompt.ts` |
| **Screen**  | Auto-retrying text search.                       | `e2e/pages/terminal-screen.ts`                                         |
| **Session** | Raw PTY. Keystroke injection. Buffer management. | `e2e/helpers/terminal-session.ts`                                      |

**Enforcement:** Tests drive the terminal through `e2e/pages/` and `e2e/fixtures/`, never by importing `e2e/helpers/terminal-session.ts`. Page objects hold their `TerminalSession` `private`, so tests cannot call it even with a reference.

---

## TerminalScreen

**File:** `e2e/pages/terminal-screen.ts`

Wraps `TerminalSession` with auto-retrying text matchers. Tests do not interact with it directly.

All `waitFor*` methods delegate to the shared `pollUntil` skeleton (50ms interval, predicate evaluated BEFORE the first delay) and press no keys. Every one takes an explicit `timeoutMs` — there is no built-in default at this layer.

| Method                                   | Surface                    | Purpose                                                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `waitForText(text, timeoutMs)`           | full output (xterm buffer) | Poll until text appears anywhere                                                                                                                                                                                                           |
| `waitForRawText(text, timeoutMs)`        | raw PTY output             | Poll raw output (bypasses xterm buffer limits and in-place repaints)                                                                                                                                                                       |
| `waitForEither(textA, textB, timeoutMs)` | full output                | Poll until either text appears                                                                                                                                                                                                             |
| `getScreen()`                            | —                          | **Scrollback + viewport, NOT viewport-only** — safe for positive assertions about current content; never for `not.toContain` on text the session once drew. See [assertions.md § Negative Assertions](./assertions.md#negative-assertions) |
| `getFullOutput()`                        | —                          | Processed buffer: screen + genuine scrollback                                                                                                                                                                                              |
| `getRawOutput()`                         | —                          | Raw PTY output with ANSI stripped — the only frame-accumulating surface                                                                                                                                                                    |

### A `waitForText` sentinel must be a string only the awaited screen can paint

`waitForText` reads the whole buffer, so it settles on any frame the session has drawn — including
one drawn by the screen BEFORE the one you are waiting for. **`STEP_TEXT` members are LABELS, not
proofs of screen identity** — one can be a substring of another screen's copy. Run this for any
string you are about to make a sentinel; more than one painting file means it is not one:

```
grep -rn '<string>' src/cli --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
```

Where no unique string exists, the sentinel is product copy and changing it to suit a test is the
wrong direction: document the collision at the wait and keep the discriminating assertion in the
spec. That assertion is what makes the collision a good failure rather than a silent one: a wait
that settles on the earlier screen's frame fails one line later on it, where a spec that only
drove onward from there would drive the wrong screen.

---

## DashboardSession

**File:** `e2e/pages/dashboard-session.ts`

For the dashboard a bare `init` shows over an existing installation, or a bare run with `bare: true`.

Launch with `DashboardSession.launch({ projectDir, bare?, env? })`. Exposes `readonly projectDir`.

| Method                                   | Purpose                                                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)`           | Wait for text to appear                                                                                                                                                                               |
| `waitForEither(textA, textB, timeoutMs)` | Wait for whichever text appears first                                                                                                                                                                 |
| `getOutput()`                            | Full output                                                                                                                                                                                           |
| `getScreen()`                            | **Scrollback + viewport, NOT viewport-only** — see the `TerminalScreen` row above                                                                                                                     |
| `escape()`                               | `async` — Escape + `INTERNAL_DELAYS.KEYSTROKE`. **Await it.** It does not wait on a sentinel first; the delay is what stops a bare synchronous write racing the handler the current frame registered. |
| `ctrlC()`                                | `async` — Ctrl+C + `INTERNAL_DELAYS.KEYSTROKE`, same reasoning as `escape()`                                                                                                                          |
| `arrowDown()`                            | Navigate down (with `INTERNAL_DELAYS.KEYSTROKE`)                                                                                                                                                      |
| `arrowUp()`                              | Navigate up (with `INTERNAL_DELAYS.KEYSTROKE`)                                                                                                                                                        |
| `chooseInOneBurst(downs)`                | `downs` Arrow Downs + Enter in ONE write, as a paste arrives                                                                                                                                          |
| `chooseOneKeyAtATime(downs, focusedRow)` | Arrow Down one key at a time, then Enter once `focusedRow` is on screen                                                                                                                               |
| `waitForExit(timeoutMs?)`                | Wait for process exit                                                                                                                                                                                 |
| `destroy()`                              | Clean up session + temp dirs                                                                                                                                                                          |

**Navigation must be closed-loop** — see [README.md § Critical Rules](./README.md#critical-rules) and [anti-patterns.md § Index-Based Navigation](./anti-patterns.md#index-based-navigation).

---

## InteractivePrompt

**File:** `e2e/fixtures/interactive-prompt.ts`

For testing interactive prompts (the `uninstall` confirmation, the question `init --from` and `edit --from` ask before writing). Wraps `TerminalSession` + `TerminalScreen` so test files never import `TerminalSession`.

This is an architectural boundary -- it uses index-based navigation methods (`arrowDown`, `arrowUp`). The exception and what it owes are in [anti-patterns.md § Index-Based Navigation](./anti-patterns.md#index-based-navigation).

Launch at `TERMINAL_SIZE.SHORT` or larger unless the size gate is the subject: below `MIN_TERMINAL_SIZE` a gated command never exits — [patterns.md § Resize Warning Pattern](./patterns.md#resize-warning-pattern).

| Method                                         | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `waitForText(text, timeout?)`                  | Wait for text in full output                         |
| `waitForRawText(text, timeout?)`               | Wait for text in raw output                          |
| `waitForTextOrExit(text, timeout?)`            | Wait for text or process exit, whichever comes first |
| `confirm()`                                    | Type "y" + Enter                                     |
| `deny()`                                       | Type "n" + Enter                                     |
| `pressEnter()`                                 | Enter with delay                                     |
| `arrowDown()`, `arrowUp()`                     | Navigation with delay                                |
| `pressKey(key)`                                | Write key with delay                                 |
| `ctrlC()`, `escape()`                          | Control keys with delay                              |
| `waitForExit(timeout?)`                        | Wait for process exit                                |
| `getOutput()`, `getScreen()`, `getRawOutput()` | Read output                                          |
| `destroy()`                                    | Clean up session                                     |

**Wait for the frame that receives a key before sending it** — [README.md § Critical Rules](./README.md#critical-rules). `DashboardSession` and `InteractivePrompt` key methods delay only AFTER their key, so the wait is the caller's, on a sentinel that screen paints: one it never paints hangs for the full timeout.

---

## Related

- [test-structure.md](./test-structure.md) -- How tests use page objects
- [patterns.md](./patterns.md) -- Complete examples for each test type
- [anti-patterns.md](./anti-patterns.md) -- Session leakage rules
