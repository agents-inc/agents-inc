---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The selector in accounts.spec.ts leaves toasts out (EDITOR-99). The README line proposed below
  is not written.
---

## What Was Wrong

`accounts.spec.ts` counted open dialogs with `[role="dialog"], [role="alertdialog"]`. Base UI's
toasts carry `role="dialog"` (high priority ones `alertdialog`) with `aria-modal="false"`, so the
count included any toast on screen.

"waits behind a stack switch's confirm open as the account lands" switches React on to have
unsaved changes, and that raises the editor's sub-agent toast ("web developer, web researcher, web
tester and 2 more switched on: React added"). The spec then asserts one open dialog. A census probe
every 100 ms found two elements, the toast and the confirm, until the toast's 5-second timer ran
out. The assertion's own 5-second retry passed only because the toast left first, by about 100 ms
when unloaded.

Reproduced at the time of writing: 1 of 6 serial runs failed unloaded ("Received: 2"), and 1 of 3
at load about 46 on 16 cores. The same failure is in the EDITOR-111 and EDITOR-113 logs, both of
which called it a dialog still closing.

## Fix Applied

`openDialogs` in `accounts.spec.ts` now reads
`[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]:not([aria-modal="false"])`. The
assertion stopped waiting out the toast: it took 19 ms at most over 10 runs, and the test took
3.6 s where it had taken 7–10 s. A page holding a modal dialog, a confirm and a toast counts 2
under the new selector, so a save dialog opening over the confirm still fails the spec.

Sibling search, `grep -rn 'role="dialog"\|getByRole("dialog")' apps/editor/e2e`: the only other
unnamed dialog queries are `pages/dialogs.ts`'s `InstallDialog`, `AddSkillDialog` and
`MarketplaceDialog`. Each filters by `hasText` ("INSTALL", "ADD SKILL", "MARKETPLACE"). The editor
raises toasts from one call site (`sayInToasts` in `stores/config-store.ts`), naming sub-agents and
skills, and a grep of `packages/matrix/src` for a name holding any of those words found none. They
were not changed.

## Proposed Standard

One line under Conventions in `apps/editor/e2e/README.md`, beside "Only the topmost modal is in the
accessibility tree": **a toast is a dialog to a role or attribute selector.** Base UI gives each
toast `role="dialog"` and `aria-modal="false"`, so a count of open dialogs leaves out
`[aria-modal="false"]`, and a spec that raises a toast never counts dialogs with a bare role. This
conflicts with no rule in either `CLAUDE.md`.
