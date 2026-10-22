---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/e2e/pages/configure-page.ts
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Landed: `ConfigurePage.goto()` waits for the stacks with `includeHidden`, and a spec holds the
  page's load to put the arrival dialog up first. Open: the README convention for a readiness wait
  after a navigation.
---

## What Was Wrong

`ConfigurePage.goto()` waited for the screen with `getByRole("group", { name: "Stacks" })`. Where
arriving opens a modal, as the save dialog a sign-in owes does in `accounts.spec.ts`, the modal hides
the grid from role queries. If it opened before the wait's first successful look, the wait never
resolved, and the test died on its 30 s timeout with the dialog on screen. The gate saw it once
under load and not again in 20, 195 or 873 reruns.

The README already says only the topmost modal is in the accessibility tree, and `openDialogs` in
`accounts.spec.ts` locates by attribute for that reason. Neither says that a wait run straight after
a navigation is exposed to it as well. The test cannot place that wait after the modal, because the
wait is inside `goto()`.

Made deterministic by holding the page's `load` event. An init script appends a hidden `<img>` at
`DOMContentLoaded` whose request is answered only on release. The spec waits for the dialog, releases
the image, and lets `goto()` continue. Against the old wait, 3 of 3 runs (and 3 earlier) timed out
at the gate's own line: `waiting for getByRole('group', { name: 'Stacks' }) to be visible`.

One harness lesson from building it: `expect(locator).toBeVisible()` over a whole page boot hits
its 5 s default under parallel load. With it, 2 of 10 repeats failed though the dialog did open.
`locator.waitFor()`, bounded only by the test as `goto()`'s own waits are, passed 20 of 20. Holding
the image through MSW (`stubWith`) or through `page.route` made no difference once that cap was gone
(20 of 20 each).

## Fix Applied

- `goto()` waits for `getByRole("group", { name: "Stacks", includeHidden: true })`. This is the
  same element, found whether or not a modal has hidden it, and `waitFor()` still requires it to
  be drawn.
- `accounts.spec.ts` gained `holdPageLoad` and the test "reaches the screen with the dialog already
  open over the stacks": red 3 of 3 against the old wait, green 20 of 20 against the new one. The
  full editor suite passed 874 of 874.

Census of the same wait elsewhere: `grep -rn "stacks.waitFor()" apps/editor/e2e/specs`. Every hit
follows a `page.reload()` in a signed-out persistence, composer, scope or saved-stack spec, where
nothing opens a modal on arrival. Left as found. The `?fromId` arrivals (`grep -rn "page.goto("
apps/editor/e2e`) assert the state they expect instead of waiting for readiness.

**What would catch a recurrence:** the new spec, but only for `goto()` and the owed-save dialog. A
new readiness wait by role elsewhere is not caught.

## Proposed Standard

`apps/editor/e2e/README.md` -> "Conventions", beside "Only the topmost modal is in the accessibility
tree": "A wait for readiness after a navigation finds its landmark with `includeHidden: true`, or
by CSS. A dialog that opens on arrival hides the page from role queries, and it can be up before the
wait first looks." No conflict with a `CLAUDE.md` rule. The README's "locate by role" still holds,
since the role and name stay the same.
