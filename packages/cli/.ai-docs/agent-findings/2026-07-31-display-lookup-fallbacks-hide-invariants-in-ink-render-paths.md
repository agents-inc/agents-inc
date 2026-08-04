---
type: anti-pattern
severity: low
affected_files:
  - src/cli/components/wizard/summary-panel.tsx
  - src/cli/components/wizard/utils.ts
  - src/cli/components/hooks/use-panel-scroll.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-07-31
reporting_agent: cli-developer
category: typescript
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: "Code landed on BOTH surfaces — summary-panel.tsx first (pinned by a frame test), then getStackName in components/wizard/utils.ts, which is now the single asserting lookup both call sites share (see Update, 2026-07-31). The standard is still pending — nothing in .ai-docs records how to decide whether a *display* lookup may fall back, nor that an assert inside an Ink component is caught by Ink's error boundary rather than thrown out of render()."
---

## What Was Wrong

`summary-panel.tsx` rendered the selected stack with

```ts
const stackName = selectedStackId ? (findStack(selectedStackId)?.name ?? selectedStackId) : null;
```

Two different absences are collapsed into one expression there. "No stack selected" is a real
state the panel must render (`Stack none`). "A stack is selected but the matrix does not hold it"
is not a state at all — and the `?? selectedStackId` fallback silently paints the raw id as though
it were a display name, which is exactly the silent fallback CLAUDE.md's Data Integrity rule bans.

Tracing every write to `selectedStackId` settles it: the only non-null writer in production is
`selectStack(focusedStack.id)` in `stack-selection.tsx`, where `focusedStack` came out of
`matrix.suggestedStacks` — the same array `findStack` searches. Nothing restores the field from
config, and nothing reloads the matrix mid-session (`initializeMatrix` runs during startup loading;
the wizard's own source operations — `addSource` / `removeSource` via `useSourceOperations` —
write config and re-read a summary, they never rebuild the matrix). So the fallback branch could
not execute, and `wizard.tsx` already hard-errors on the same lookup miss in
`resolveSelectedSkillIds`. The panel was the lenient one of the two.

The rule that let it through is not missing, it is under-specified: `getSkillDisplayName` in
`matrix-provider.ts` documents a _sanctioned_ `?? id` fallback for exactly this shape, because a
skill id may legitimately be foreign to the current matrix. Nothing says how to tell that case
apart from the stack case, so "it is only a label" reads as sufficient justification.

A second surface still carries the shape: `getStackName` in `components/wizard/utils.ts` is
`findStack(stackId)?.name`, feeding the confirm-step dropdown label in `wizard-layout.tsx`, with a
unit test pinning the undefined return for an unknown id. It was out of scope for this change and
is left as-is deliberately — the label degrades to "your custom stack" rather than to a wrong name,
so it is the milder instance, but it is the same decision made the same way.

## Fix Applied

- `summary-panel.tsx` now resolves the name through a named `resolveStackName` that returns `null`
  for "nothing selected" and **throws** for "selected but absent", with the provenance argument
  written into its doc comment (the constraint is invisible at the call site).
- Pinned by a frame test. **The assert does not escape `render()`:** Ink wraps the tree in an
  internal error boundary, so `expect(() => render(<SummaryPanel />)).toThrow()` fails — the render
  resolves normally and Ink paints its `ERROR` overview instead. The test therefore asserts on
  `lastFrame()` containing the message, with `silenceConsole(["error"])` for React's boundary log.
  This also settles the "will an assert crash the wizard?" objection: it does not, it replaces the
  panel with a diagnosable error screen.
- Unrelated to the fallback, same file: the ~25 lines of scroll machinery (viewport measurement,
  the monotonic `Math.max(prev, height)` content reading, `maxScroll` / `hiddenBelow`, the `↑`/`↓`
  `useInput`) moved to `components/hooks/use-panel-scroll.ts`, joining `use-measured-height.ts` and
  `use-section-scroll.ts`. Both correctness comments travelled with the code they explain, and the
  hook deliberately does not return `contentHeight` — the "must never gate the clip" warning is now
  enforced by the interface, not just documented.

## Update — 2026-07-31, the second surface

The paragraph above says `getStackName` "is left as-is deliberately". That is no longer true, and the
paragraph is kept rather than rewritten because the reasoning it records is what the follow-up had to
re-verify.

Provenance was re-traced for that call site specifically rather than assumed identical, and it is
identical: `getStackName` has exactly one caller, `resolveDropdownLabel` in `wizard-layout.tsx`, which
passes `store.selectedStackId` — the same field `summary-panel.tsx` reads. `createInitialState` starts
it `null`; **neither** `hydrateForEdit` nor `hydrateForInit` writes it, so nothing restores it from
config; and `selectStack` is its only writer, taking its sole non-null argument from
`matrix.suggestedStacks` in `stack-selection.tsx` — the array `findStack` searches.
`source-manager.ts` (the wizard's own add/remove-source path) never touches the matrix. The fallback
branch was unreachable from either surface.

Because the two functions were then identical in behaviour, they were collapsed rather than
duplicated: `getStackName` in `components/wizard/utils.ts` is now **the** asserting lookup, carrying
the provenance argument in its doc comment, and `summary-panel.tsx` imports it — its local
`resolveStackName` and its `findStack` import are gone. `utils.ts` was already the shared module for
this layer (`wizard-layout.tsx` imports its siblings from there), so the direction of the collapse
follows the existing dependency, and both call sites still read as one named transform.

One behavioural difference survives and is intentional: the "no stack selected" return stays
`undefined` rather than `null`, matching `getStackName`'s existing signature. Both call sites already
tolerate either (`stackName ? … : …` in the dropdown label, `stackName ?? "none"` in the panel
header). The unit test that pinned the old lenient return now pins the throw.

## Proposed Standard

For `.ai-docs/reference/component-patterns.md`, alongside the existing `ScrollAffordance` rules:

> **A display fallback is only allowed where the absent value has a provenance that admits it.**
> Before writing `lookup(id)?.name ?? id` in a render path, trace every writer of `id`. If the only
> writers take it from the same collection the lookup searches, and nothing rebuilds that
> collection while the component is mounted, the miss is unreachable — assert instead. Reserve the
> lenient form for ids that arrive from outside the current matrix (saved config, a foreign source,
> a removed skill), which is why `getSkillDisplayName` keeps its `?? id` and documents why. "It is
> only a label" is not the test; where the id came from is.

And in the same doc, under component testing:

> **An assert inside an Ink component is caught by Ink's error boundary.** `render()` resolves and
> the frame becomes Ink's `ERROR` overview, so `expect(() => render(...)).toThrow()` never passes.
> Assert on `lastFrame()` containing the thrown message and silence `console.error` for the
> boundary's log.
