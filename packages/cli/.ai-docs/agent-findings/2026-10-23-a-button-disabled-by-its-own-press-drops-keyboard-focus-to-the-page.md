---
type: anti-pattern
severity: low
affected_files:
  - packages/ui/src/components/button.tsx
  - apps/editor/src/features/configure/components/stack-switch-dialog.tsx
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/src/features/configure/components/composer.tsx
  - apps/editor/src/features/configure/components/add-skill-dialog.tsx
  - apps/editor/src/features/configure/components/save-stack-dialog.tsx
  - apps/editor/src/features/configure/components/roster-panel.tsx
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-23
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  The stack-switch question's Retry/Switch button and the Marketplace dialog's Load keep focus
  (`focusableWhenDisabled`, with `aria-disabled:` classes in `buttonVariants`). Composer's Send,
  the add-skill dialog's Add, the save dialog's Save and the roster's Share still take native
  `disabled` from a state their own press sets.
---

## What Was Wrong

A natively disabled element cannot hold focus. Where a button's own press sets the state that
disables it, a keyboard user who pressed it loses focus to `body`, and nothing brings it back when
the button is enabled again.

The stack-switch question's Retry is the case review found. Retry and the held Switch rendered from
one ternary in the same slot, so React kept one `<button>`; Retry's press re-reads the stack, the
button became a Switch with `disabled` while "loading…" shows, and focus left the dialog. A
Playwright probe in the editor's dev build printed `focus: BODY … inDialog=false` after Enter on
Retry (inherited from the E2c answers review, then reproduced here by the red spec below).

`buttonVariants` in `packages/ui/src/components/button.tsx` dimmed only `disabled:`. Base UI's
`focusableWhenDisabled` keeps a disabled button focusable by setting `aria-disabled` instead of
`disabled`, so without matching classes a held button looked live, and `packages/ui/CLAUDE.md`
forbids copying the classes at a call site.

Census, 2026-10-23:
`grep -rn "disabled={" apps/editor/src --include='*.tsx' | grep -v aria-disabled` lists every
natively disabled control in the editor. Read one by one, six are disabled by a state their own
press sets: the stack-switch question's action, the Marketplace dialog's Load
(`state.status === "loading"`), the composer's Send (`pending`), the add-skill dialog's Add
(`commit.status === "resolving"`), the save dialog's Save (`saving`) and the roster's Share
(`shareState === "sharing"`). The rest are disabled by a state the press does not set.

## Fix Applied

- `button.tsx`: `aria-disabled:pointer-events-none aria-disabled:opacity-40` beside the `disabled:`
  pair, so a button held with `focusableWhenDisabled` looks held. No existing `Button` carried
  `aria-disabled`, so no render changed.
- `stack-switch-dialog.tsx`: one `AlertDialogAction`, labelled Retry or Switch, with
  `focusableWhenDisabled`. Focus stays on it through Retry, Enter does nothing while it is held, and
  Enter switches once the dialog says what Switch does.
- `marketplace-dialog.tsx`: Load takes `focusableWhenDisabled`, so the press its answer asks for
  ("press Load again to switch.") is one key away.

Red first. `button.stories.tsx` › `DisabledFocusableIsDimmed` and
`DisabledFocusableRefusesThePointer` were red (`expected '1' to be '0.4'`, `expected 'auto' to be
'none'`). `saved-stack-apply.spec.ts` › "keeps the keyboard on the button Retry becomes, which
switches on Enter only once the payload arrives" and `dialog-focus.spec.ts` › "keeps focus on Load
through the read it starts" were red on `toBeFocused`. In a scratch copy, a Switch marked only
`aria-disabled` (so it still answered Enter) reddened the first spec at the step after the held
Enter, because the question had closed.

Not repaired: Send, Add, Save and Share, in files this lane did not own. Each needs
`focusableWhenDisabled` on its `Button`.

## Proposed Standard

For `packages/ui/CLAUDE.md` › Rules: a `Button` whose own press sets the state that disables it
takes `focusableWhenDisabled`, so focus stays where the press left it. The `aria-disabled:` pair in
`buttonVariants` is what makes it look held. Proposal only; the standard is unchanged.

Nothing would catch a new instance. A focus spec per button is the only check today, and no lint
rule can tell which state a press sets.
