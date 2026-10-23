---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
  - apps/editor/src/features/configure/components/stack-switch-dialog.tsx
  - apps/editor/src/features/configure/lib/use-apply-stack-request.test.ts
  - apps/editor/e2e/specs/saved-stack-apply.spec.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-23
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `stackSwitchCost` in `use-apply-stack-request.ts` answers a `StackSwitchCost` union (unread,
  replaces, elsewhere) that `consequenceOf` in `stack-switch-dialog.tsx` maps with an exhaustive
  switch, and the dialog subscribes to the `useAccountStore` payloads, so a payload arriving while
  the question is open redraws it. Held by `use-apply-stack-request.test.ts` and by the two
  held-payload specs in `saved-stack-apply.spec.ts`, "the question before an account's saved stack
  replaces changes".
---

## What Was Wrong

The editor asks before a saved stack replaces changes that came from no stack. An account's stack
has its payload, and so its marketplace, read after the grid draws, so the question can be asked
before the editor knows which marketplace the stack is built on.

`stackSwitchCost` answered `string | null`. The string was the sentence for a stack built on
another marketplace. `null` meant both "this stack replaces what is on screen" and "the payload is
not read yet". `stack-switch-dialog.tsx` rendered `stackSwitchCost(request) ?? discarding(skillCount)`,
so an answer not yet known was spoken as the costliest one: "Switching replaces your current setup,
discarding 1 selected skill…" for a stack built on another marketplace, which opens that
marketplace's own configuration and discards nothing. The payload was read with
`useAccountStore.getState()` during render, so its arrival never redrew the question.

That code was never committed (`git show HEAD:apps/editor/src/features/configure/lib/use-apply-stack-request.ts`
declares no `stackSwitchCost`). The description above is the fixing lane's reading of its working
tree, and its red-first run below is the evidence.

`editor-and-worker.md` › "Where a surface shows A in place of B, the condition that hides B is "A
arrived" — never "A was attempted"", in place since 2026-09-03, already describes one `null`
answering for two readings (`adoptLocalSaves`). It is framed around work that failed, so it did not
reach an answer whose input is still loading.

## Fix Applied

- `stackSwitchCost(request, accountPayloads)` returns
  `{ kind: "unread" } | { kind: "replaces" } | { kind: "elsewhere"; consequence }`. Only an
  account's stack whose payload has not arrived is `unread`.
- `consequenceOf` maps it with an exhaustive switch, so a variant added without wording does not
  compile. `unread` reads "This stack is built on loading…", inside an `aria-live="polite"` span so
  the sentence that replaces it is read out.
- The dialog subscribes with `useAccountStore((state) => state.payloads)`.

What holds it, as the fixing lane measured it:

- `use-apply-stack-request.test.ts`, "what the switch question says of a stack": 4 of 4 red against
  the `string | null` version. Rerun on 2026-10-23: 4 passed.
- `saved-stack-apply.spec.ts` › "the question before an account's saved stack replaces changes":
  "shows loading where the marketplace goes until the payload arrives, then names it" and "shows
  loading until the payload arrives, then says what one built on the marketplace on screen
  discards" fail with the subscription put back to `getState()`, and pass on the restored file.

Census of store reads in editor components:

```
grep -rn "getState()" apps/editor/src/components apps/editor/src/features --include='*.tsx'
```

On 2026-10-23 it returns 2 hits, both in `marketplace-dialog.tsx` and neither in render: a
`useState` initializer and the `readCatalogue` handler. It reads `.tsx` files only. Reads during
render through `.ts` helpers remain: `localSaveById` in `stackSwitchCost`, `activeStacks` in the
dialog's `catalogueStackName`, and `leavingNow` and `marketplaceOnScreen` behind
`stackElsewhereCost`. The fixing lane judged that nothing changes them while the dialog is open;
that was not re-measured.

Not decided here: what Switch does while the question reads "loading…", and what the question says
once the payload read fails. Both were open owner questions on 2026-10-23
(`q-e2c-switch-while-loading`, `q-e2c-load-fails`). Until answered, Switch stays pressable while
loading, and a failed read leaves "loading…" showing until the dialog closes.

## Proposed Standard

For `editor-and-worker.md`, widening "Where a surface shows A in place of B…" from work that failed
to work still loading: an answer that can be "not known yet" gets its own variant, never a `null`
shared with a known answer, and a component whose words wait on store state subscribes to that
state rather than reading `getState()` during render. Checked against `CLAUDE.md` and that section:
no conflict.
