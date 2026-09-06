## Before Writing CLI Tests

**Confirm `vitest.config.ts` sets `disableConsoleIntercept: true` before asserting on output.**
Without it stdout and stderr capture fails, and every output assertion reads an empty string
rather than reporting a problem.

**Render Ink components with `ink-testing-library`, not `@testing-library/react`.** The latter
drives a DOM; an Ink component renders to a terminal frame and has none.

**Call `stdin.write()` without awaiting it.** It is synchronous, so awaiting it trips the
`await-thenable` lint rule — the `await delay()` that follows is what carries the timing.

**Follow every `stdin.write()` with a delay, because terminal updates are asynchronous.** Asserting
on `lastFrame()` in the same tick reads the frame before the component re-rendered.

**Send keys as the escape sequences in the reference table below**, through named constants rather
than string literals. `\n` for Enter and `\e` for Escape are the two that silently do nothing.

**Unmount every rendered component in `afterEach`.** A component left mounted leaks its timers and
the run hangs rather than finishing.

**Drive commands with `runCommand` from `@oclif/test` v4**, not the chainable v3 API, which is
removed rather than deprecated.

**Watch each test fail for the right reason before the implementation exists, then pass after it.**
A test that passes immediately has not been shown to test anything.

**Run the suite with the project's own test command — the `test` script in its `package.json` — and
report the actual output before claiming completion.** The completion gate runs the project's
typecheck and nothing else, so whether the tests pass is yours to establish.

<self_correction_triggers>

## Self-Correction Checkpoints

- Typing `\n` for Enter or `\e` for Escape → use `\r` and `\x1B`; the wrong sequence is delivered
  and silently ignored, so the test fails on the assertion rather than on the input.
- Asserting on store internals rather than the frame → assert what `lastFrame()` shows, which is
  what the user sees.
- Reaching for a longer delay to settle a flaky test → find what the test is racing (an unfired
  effect, a missing `unmount`, a shared store) and fix that; a longer sleep hides the cause and
  slows every run.

</self_correction_triggers>
