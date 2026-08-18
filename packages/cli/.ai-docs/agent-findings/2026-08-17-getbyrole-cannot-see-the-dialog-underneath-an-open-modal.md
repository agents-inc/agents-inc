---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/e2e/pages/dialogs.ts
  - apps/editor/e2e/specs/skill-contents.spec.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-17
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code-side fix landed in EDITOR-32 — `InstallDialog` gained a `sheet` locator that does not go
  through the accessibility tree, and the spec asks its "still there behind" question of that. What
  is pending is the written rule; the editor's e2e conventions say to scope through roles and
  landmarks, and do not say where that stops being possible.
---

## What Was Wrong

EDITOR-32 opens a contents preview from inside the install dialog, and the whole point of the
arrangement is that the install dialog is still there when the preview closes. The obvious
assertion:

```ts
await install.contentsOf(SKILL_NAME).click();
await expect(contents.root).toBeVisible();
await expect(install.skillsPane).toBeVisible(); // ← fails
```

```
Locator: getByRole('dialog').filter({ hasText: 'INSTALL' }).locator('[data-slot="dialog-pane"]').first()
Expected: visible
Error: element(s) not found
```

That reads as a product bug — the second dialog closed the first — and it is not one. Base UI marks
the sheet underneath `aria-hidden="true"` when a second modal opens, which is correct: only the
topmost modal should be in the accessibility tree. Playwright's `getByRole` resolves against that
tree, so the install dialog becomes unaddressable by role while anything is on top of it, even
though it is mounted, painted and fully visible on screen.

Measured, rather than deduced, because the ARIA snapshot in Playwright's `error-context.md` shows
BOTH dialogs and reads as if the locator should have matched:

```js
document.querySelectorAll('[data-slot="dialog-content"]').length; // 2 — both present, neither inert
await page.getByRole("dialog").count(); // 1
```

The `aria-hidden` is not on the dialog element itself but on its portal container one level up,
which is why an element-level check finds nothing wrong.

The trap is that the failure is indistinguishable from the bug the test exists to catch. An agent
reading only the error message would "fix" the implementation — most likely by giving up on
stacking and closing the install dialog when the preview opens, which is the behaviour the row
explicitly does not want.

## Fix Applied

`InstallDialog` gained a locator that does not go through the accessibility tree, named for what
makes it different:

```ts
// The sheet itself, reached WITHOUT the accessibility tree. While a contents preview is open on
// top of it this dialog is `aria-hidden` — correct for a modal underneath another, and invisible
// to `getByRole` — so "still there behind" is a question only a CSS locator can ask.
get sheet(): Locator {
  return this.page
    .locator('[data-slot="dialog-content"]')
    .filter({ hasText: "npx agents-inc edit" })
}
```

The spec asks "still on screen" of `sheet` while the preview is open, and goes back to the
role-based `skillsPane` after it closes — which is the stronger assertion of the two, because it
also proves the `aria-hidden` was removed.

One consequence worth stating separately: `filter({ hasText })` is a case-insensitive **substring**
match, so with two dialogs open the words in one can capture the other's locator. `InstallDialog`
is located by `hasText: "INSTALL"`, so the contents dialog must not contain the word "install"
anywhere in its own chrome. It does not, deliberately, and the component says so in a comment —
but that is a constraint held by a comment in a different package from the locator that depends
on it.

## Proposed Standard

Add to `.ai-docs/standards/e2e/assertions.md`:

> **Only the topmost modal is in the accessibility tree.** When one dialog opens over another, the
> one underneath is marked `aria-hidden` by the dialog library, and `getByRole` therefore cannot see
> it — the failure is `element(s) not found`, which is indistinguishable from the dialog having
> closed. Assert on a dialog underneath another through a CSS/`data-slot` locator, and note in the
> page object why that one locator does not follow the "scope through roles and landmarks" rule.
>
> Prefer to assert the role-based locator again AFTER the top dialog closes. That is the stronger
> claim: it proves both that the sheet survived and that it was handed back to assistive technology.
>
> **Before concluding a stacked-dialog test found a product bug, count the DOM.**
> `document.querySelectorAll('[data-slot="dialog-content"]').length` against
> `page.getByRole("dialog").count()` separates "it closed" from "it is hidden from the tree" in one
> step. Playwright's `error-context.md` ARIA snapshot is not reliable here — it rendered both
> dialogs while `getByRole` matched one.
>
> **A dialog located by `filter({ hasText })` claims that word.** The match is a case-insensitive
> substring, so once two dialogs can be open together, a word in one captures the other's locator.
> Either keep the other dialog's vocabulary clear of it, or locate by accessible name
> (`getByRole("dialog", { name })`), which is what the newer `SkillContentsDialog` does.
