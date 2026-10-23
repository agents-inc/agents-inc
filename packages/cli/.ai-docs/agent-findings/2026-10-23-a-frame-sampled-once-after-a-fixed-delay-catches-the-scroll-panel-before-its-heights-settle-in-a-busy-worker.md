---
type: standard-gap
severity: low
affected_files:
  - packages/cli/src/cli/components/hooks/use-panel-scroll.test.tsx
  - packages/cli/src/cli/components/hooks/use-measured-height.test.tsx
  - packages/cli/src/cli/components/common/summary-panel.test.tsx
  - packages/cli/src/cli/lib/__tests__/test-constants.ts
  - packages/cli/src/cli/components/hooks/use-terminal-dimensions-follows-the-terminal.test.tsx
  - packages/cli/src/cli/components/hooks/use-panel-scroll.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-23
reporting_agent: cli-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The scroll, summary-panel and measured-height specs now wait for the settled frame. Still open:
  the resizedTo specs in use-terminal-dimensions-follows-the-terminal.test.tsx, the Math.max guard
  in usePanelScroll that no spec reaches, and the standards line.
---

## What Was Wrong

`use-panel-scroll.test.tsx` › "shows the top lines and counts the rest below before any key"
turned the unit gate red once with `…2 more below` for `…3 more below`. It read `lastFrame()` once,
`RENDER_DELAY_MS` after mounting. The panel's heights settle over several renders, and each one
starts from a `useEffect` through React's scheduler, which queues on `setImmediate`. A busy worker
starts those late, so the sample caught the frame before the last measurement.

Reproduction: a `.mjs` file listed in `setupFiles` before `./vitest.setup.ts`, so it loads before
React's scheduler captures `setImmediate`:

```js
const SLOW_MS = Number(process.env.SLOW_MS);
globalThis.setImmediate = (cb, ...args) => setTimeout(() => cb(...args), SLOW_MS);
```

This census covers the three spec files that render these hooks
(`grep -rln -E 'useMeasuredHeight|usePanelScroll|<SummaryPanel' src --include='*.test.tsx'`), at
HEAD, with SLOW_MS at 0, 60, 100 and 150, one run each:

| Spec                                                                           | Red at SLOW_MS |
| ------------------------------------------------------------------------------ | -------------- |
| `use-panel-scroll.test.tsx` › "shows the top lines…"                           | 60 and up      |
| `use-panel-scroll.test.tsx` › "moves it back a line per up arrow"              | 150            |
| `summary-panel.test.tsx` › "should count the lines it clips…"                  | 100 and up     |
| `use-measured-height.test.tsx` › "answers 0 before the first layout…"          | 150            |
| `use-measured-height.test.tsx` › "measures again when narrowing the terminal…" | 150            |

At 60 only the gate's spec fails, with the gate's own message. At 0 all 32 pass.

"moves it back" shows the second half of the cause. Keys pressed before the heights settle are
clamped at the bottom measured so far, so two down arrows and an up arrow left the panel at the top.

The trap in the repair is that a fixed delay used as a PRECONDITION cannot become a `vi.waitFor`.
In `use-measured-height.test.tsx` the delay before a re-render or a resize keeps the spec past the
mount's own retry timers (0, 16 and 50 ms). A spec that waits only for the frame lets a retry
measure again on its own, so it passes with the hook's every-render effect or its resize listener
deleted. Those delays are kept, and both mutants still turn their own spec red.

Also found: no spec reaches `usePanelScroll`'s `Math.max(prev, height)` guard. A mutant that sets
the measured content height directly passes `use-panel-scroll.test.tsx` and
`summary-panel.test.tsx`, both at HEAD and after the fix. Neither mounting squeezes the content
box, which is when Yoga under-reports. Under
`2026-10-22-the-summary-panel-is-drawn-only-by-render-to-string-so-its-scroll-hooks-never-act` no
command mounts these hooks live, so the gap is in a spec, not in a command.

Other fixed samples, census command:

```
grep -rn -c 'delay(RENDER_DELAY_MS)' src e2e --include='*.ts' --include='*.tsx' | grep -v ':0$'
```

Five of those files ran under the same harness: `use-terminal-dimensions-follows-the-terminal`,
`select-list`, `use-keyboard-navigation`, `confirm` and `init`. All pass at 0 and 60. At 150, one
of the two specs in `use-terminal-dimensions-follows-the-terminal.test.tsx` that go through
`resizedTo` turns red in each of two runs: "follows a resize" in one, and in the other "falls back
to the defaults when a resized stream reports no size", whose frame was still `100x24`. The two
command specs (`uninstall.test.ts`, `bare-run.test.ts`) were not run under it. The four delays left in
`use-measured-height.test.tsx` are the preconditions above and the waits before an absence check.

## Fix Applied

The specs wait for the settled frame with `vi.waitFor` and `SETTLE_TIMEOUT_MS`, a new constant in
`test-constants.ts`. Key specs wait for it before their first key. Delays that keep a spec past the
mount's retries stay, with the wait after them. All 32 specs in the three files pass at SLOW_MS 0,
60, 100, 150 and 250, two runs each. Each mutant (no every-render effect, no resize listener, an
off-by-one `hiddenBelow`) turns red the same specs after the fix as at HEAD.

## Proposed Standard

`clean-code-standards.md` 6.5 names `RENDER_DELAY_MS` for timing and stops there. Add: a frame that
effects settle over several renders is awaited with `vi.waitFor` and `SETTLE_TIMEOUT_MS`, never
sampled after a fixed delay. A delay that keeps a spec past a hook's own timers stays, with the wait
after it. This does not conflict with `CLAUDE.md`.
