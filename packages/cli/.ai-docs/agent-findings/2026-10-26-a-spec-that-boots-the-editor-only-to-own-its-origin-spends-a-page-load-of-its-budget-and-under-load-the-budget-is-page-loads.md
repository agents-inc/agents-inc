---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/accounts.spec.ts
  - apps/editor/e2e/specs/catalog-first.spec.ts
  - apps/editor/e2e/specs/codex-model.spec.ts
  - apps/editor/e2e/specs/composer.spec.ts
  - apps/editor/e2e/specs/dialog-focus.spec.ts
  - apps/editor/e2e/specs/leaving-a-shared-link.spec.ts
  - apps/editor/e2e/specs/marketplace-switch.spec.ts
  - apps/editor/e2e/specs/persistence.spec.ts
  - apps/editor/e2e/specs/saved-stack-apply.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  accounts.spec.ts seeds at a bare origin page in seven setups (EDITOR-99). The other spec files
  are not checked, and the README line is not written.
---

## What Was Wrong

`localStorage` belongs to an origin, so a spec that seeds it has to be on the served origin first.
`accounts.spec.ts` got there by booting the whole editor (`arrive`), seeding, and booting again.
The first boot did nothing else.

Under load the page loads are the test's whole budget. On 2026-10-26 the file ran three times on 8
workers with load 29–69 on 16 cores (median 55). Page loads (navigation plus the wait for the
grid) took 75–96% of each multi-load test's time. Three of the eight tests that load the page
four or five times hit the 30 s timeout once each:

- 'two such loads in a row carry nothing again, and the next shows each save once'
- 'leaves nothing owed though the writes are refused too, and the next load asks no new name'
- 'Cancel posts nothing and leaves it owed, and the next sign-in asks again'

The rest ran at 24.8–30.0 s. Tests by page loads, from that run: 1: 29, 2: 26, 3: 33, 4: 7, 5: 1.

The cost is in the page load itself, not in the suite's network fixture. The same boot measured
8-way parallel, routed through `@msw/playwright` and with only the worker's origin routed, took
5.9 s and 5.4 s cold at load 21–25, and 2.6 s and 2.3 s at load 13. Every boot made 162 requests.

## Fix Applied

`atTheOrigin` in `accounts.spec.ts` opens `/origin-only`, which a stub answers with an empty
document, so the origin is there with nothing booted. `arriveHolding`, `firstSignInUnread`,
`owingBeside`, `owingWithTheListHeld` and three tests seed there, so the first page load is the
one the test is about. 'reaches the screen with the dialog already open over the stacks' also
stopped going through `owingThenListed`'s refused first sign-in, which its claim never needed. It
loads the page once instead of four times.

`owedOnARetry` and 'waits behind a dialog already open, then asks' still boot first, because what
they arrange clicks in the app.

The file passed 96 of 96 unloaded after the change. The loaded comparison is in EDITOR-99's report.

## Proposed Standard

One line under "Before adding a spec" in `apps/editor/e2e/README.md`: **seed `localStorage` at a
bare origin page, not after a boot, and count page loads.** Each load is several seconds of the
30 s budget under load, so a claim that needs four is near the limit.

The other spec files seed after the `configure` fixture has already booted:
`grep -rn "\.seed(\|seedSavedMarketplaces(\|seedStored\|localStorage.setItem" apps/editor/e2e/specs`
outside `accounts.spec.ts` returned 19 call sites in 8 files. That is a list of candidates, and
none were judged. No rule in either `CLAUDE.md` conflicts. The README says the `configure` fixture
"navigates before any stub you add", and this is the same reasoning applied to seeds.
