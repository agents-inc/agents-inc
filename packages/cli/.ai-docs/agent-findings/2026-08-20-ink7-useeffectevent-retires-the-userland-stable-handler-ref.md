---
type: convention-drift
severity: medium
affected_files:
  - src/cli/components/hooks/use-category-grid-input.ts
  - src/cli/components/hooks/use-keyboard-navigation.ts
  - src/cli/components/hooks/use-panel-scroll.ts
  - src/cli/components/wizard/wizard.tsx
  - src/cli/components/wizard/step-build.tsx
  - src/cli/components/wizard/checkbox-grid.tsx
  - src/cli/components/wizard/step-confirm.tsx
  - src/cli/components/wizard/step-agents.tsx
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/components/wizard/step-sources.tsx
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-08-20
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: premise-expired
status: open
---

## What Was Wrong

`use-category-grid-input.ts` carries a 5-line comment describing a keypress race and a hand-rolled
fix for it — the latest handler kept in a ref, a `useCallback(fn, [])` wrapper passed to `useInput`
so "the effect registers once and never re-registers". The comment ends: _"causing the first space
press to be silently lost."_

**The comment was correct when it was written and is not correct now.** It landed in `a80abb5c`
(2026-02-18) under `ink@^5.0.0` / `react@^18.2.0`. Ink 5's `useInput` puts the caller's handler in
the registration effect's dependency array:

```js
}, [options.isActive, stdin, internal_exitOnCtrlC, inputHandler]);
```

so every change of handler identity really did tear the listener down and rebuild it. Ink 7 landed
in `fd19b4e4` (2026-08-05) and rewrote that hook. The handler is now wrapped in React 19's
`useEffectEvent`, and the effect's deps no longer mention it:

```js
const handleData = useEffectEvent((data) => {
  /* ... calls inputHandler */
});
useEffect(() => {
  internal_eventEmitter.on("input", handleData);
  return () => {
    internal_eventEmitter.removeListener("input", handleData);
  };
}, [options.isActive, internal_eventEmitter]);
```

`useEffectEvent` **is** the latest-handler-in-a-ref pattern, implemented by React and applied to
every `useInput` caller. The userland copy in `use-category-grid-input.ts` now duplicates it.

Two claims were verified by probe rather than by reading (both run against the repo's own vitest
`unit` project, `ink@7.1.1` / `react@19.2.8`):

- A component passing a **fresh inline closure on every render** — no ref, no `useCallback` — was
  re-rendered three times and then sent a keypress. The handler observed the **latest** state
  (`[3]`), not the mount-time state. Identity churn does not strand the handler.
- A child remounted via a changing `key`, sent a keypress with no delay between the remount and the
  press, ran the **old child's** handler (`["A"]`, not `["B"]`).

The second result is the load-bearing one, and it says the fix does not address the race its own
comment names. The comment attributes the lost press to a **remount** (`CategoryGrid` via
`key={activeDomain}`). A remount constructs a new component instance, so its `useRef` and its
`useCallback` are new too, and the registration effect still has to flush before that instance hears
anything. **A stable handler cannot make an effect run earlier.** Whatever is delivered in that
window goes to the outgoing instance's listener, which is still attached because its cleanup has not
run either. That was as true under Ink 5 as it is under Ink 7.

So the pattern addresses handler-identity churn within one mounted instance — which Ink 7 already
handles for everyone — and does not address the remount window, which is the case the comment cites.

## Fix Applied

None to product code — discovery only, and deliberately so.

This was found while triaging a request to apply the ref pattern to the seven `useInput` sites that
lack it. The census is `grep -rn "useInput(" src/cli --include='*.ts' --include='*.tsx' | grep -v
'\.test\.'` — 10 sites total, a census and not a sample; the ten paths are `affected_files:` above.
The triage verdict is that **none** of the seven need it, because the guarantee it hand-rolls is now
supplied upstream. Applying it would have added a ref, a `useCallback` and an indirection to seven
components in exchange for nothing.

What was added instead is three regression pins on the property that actually matters and is
actually ours — that a keypress is handled by the **latest** callback rather than a superseded one —
in `step-confirm.test.tsx`, `checkbox-grid.test.tsx` and `source-grid.test.tsx`. Each was verified
non-vacuous by mutation: freezing the component's handler with `useCallback(fn, [])` reddens it, and
for `source-grid` the narrower mutation of dropping `onSelect` from its hand-maintained dependency
array reddens that spec and no other of the 45 in the file.

Left in place, for the owner rather than for this pass:

- The stale comment in `use-category-grid-input.ts` — the one above `handlerRef` — and the
  `handlerRef` / `stableHandler` pair it explains. Removing them is a behaviour-neutral
  simplification under Ink 7, but the file was outside this task's file set.
- `use-panel-scroll.ts` and `use-keyboard-navigation.ts` were described in the task brief as already
  carrying this pattern. Neither does. `use-panel-scroll.ts` passes a fresh inline arrow to
  `useInput` on every render. `use-keyboard-navigation.ts` wraps its handler in `useCallback` with a
  five-entry dependency array, so its identity changes whenever a caller passes an inline `onEnter`
  or `onEscape` — it uses a ref for `focusedIndex` only. Only `use-category-grid-input.ts`
  implements the pattern as described.

## Proposed Standard

For `.ai-docs/reference/component-patterns.md`, in the hooks section:

**Do not hand-roll a stable `useInput` handler.** Ink 7 wraps the handler in `useEffectEvent` and
keys its registration effect on `isActive` and the event emitter only, so a handler that changes
identity every render is already safe and always sees the latest closure. Pass the handler plainly.
A `useCallback` around it is at best inert and at worst a stale-closure bug, since it reintroduces a
hand-maintained dependency array that Ink no longer requires — which is the live risk in
`source-grid.tsx`, the one site that still has one.

**The remount window is real and is not solved by any handler-side change.** A component remounted
via a changing `key` does not receive input until its registration effect flushes; a press in that
window is handled by the outgoing instance. If that matters for a given screen, the fix is on the
input-delivery side (do not remount, or do not accept input across the switch), never on handler
identity. Do not add a test-visible readiness sentinel for it — that was considered and rejected by
the owner on 2026-08-20, because a footer sentinel is painted by the shared `WizardFooter` and would
claim the wizard root's handler is live while the exposure is in the step's.

A general note this case argues for, which is the reason it is filed as `premise-expired` rather
than as a stale comment: **a comment that justifies code by describing a dependency's internals is
load-bearing documentation of that dependency's version.** This one survived a major upgrade of the
library it describes, kept reading as authoritative for fifteen days, and was cited in a task brief
as a proven pattern to propagate to seven more files. When a dependency that a comment reasons about
is upgraded, the comments that reason about it are part of the upgrade's surface — the Ink 7 bump
touched rendering and left the one comment explaining Ink 5's scheduler behaviour untouched.
