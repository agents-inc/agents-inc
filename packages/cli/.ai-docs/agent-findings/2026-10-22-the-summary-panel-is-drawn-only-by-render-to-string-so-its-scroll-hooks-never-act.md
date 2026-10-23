---
type: architectural-drift
severity: low
affected_files:
  - packages/cli/src/cli/components/common/summary-panel.tsx
  - packages/cli/src/cli/components/hooks/use-panel-scroll.ts
  - packages/cli/src/cli/components/hooks/use-measured-height.ts
  - packages/cli/src/cli/components/common/scroll-affordance.tsx
standards_docs: []
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: premise-expired
status: open
---

## What Was Wrong

`SummaryPanel` scrolls through `usePanelScroll`, which measures through `useMeasuredHeight` and
draws `ScrollAffordance`. Its only production mount is `summaryPanelText`'s
`renderToString(<SummaryPanel … />)`. Ink 7.1.1's `renderToString` makes `useInput` and `useStdout`
no-ops and returns the first render: state set in a `useEffect` never reaches the output. Both hooks
set state only from `useEffect`, so in production everything they return keeps its initial value
(offset 0, heights 0, nothing hidden, no affordance). Their arrow keys, resize listener and retry
timers never act.

Census, 2026-10-22, run from the repository root:

```
grep -rn -E '<SummaryPanel|usePanelScroll\(|useMeasuredHeight\(' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v test
```

It returns the three declarations, one call of each hook, and the `renderToString` mount. Nothing
mounts the panel with `render`. Measured the same day: `summaryPanelText` over 60 skills at 80
columns printed 40 lines and no `more below`.

The premise held while the wizard mounted the panel live (`git grep -n '<SummaryPanel' 67ac2fc6~1 --
packages/cli/src` names `wizard/step-confirm.tsx` and `wizard/wizard-layout.tsx`). 67ac2fc6 removed
the wizard, and 417dc942 brought the panel back only as text.

The hooks' specs (`use-measured-height.test.tsx`, `use-panel-scroll.test.tsx` and the `scrolling`
block of `summary-panel.test.tsx`) mount live through ink-testing-library, so they stay green while
covering behaviour that no command reaches.

## Fix Applied

None: discovery only. Expressive-ts round 3 (lane X1) put a guard clause in `useMeasuredHeight`'s
`measure` before this was found.

## Proposed Standard

This needs an owner decision, not a rule. Either delete `usePanelScroll`, `useMeasuredHeight`,
`ScrollAffordance` and their specs and draw the panel as plain boxes, or mount it live again where a
question should scroll. No check can see an effect-driven hook under `renderToString`. Neither
option conflicts with `CLAUDE.md`.
