---
type: convention-drift
severity: medium
affected_files:
  - apps/editor/src/lib/api/stacks.test.ts
  - apps/editor/src/stores/account-store.test.ts
  - apps/editor/e2e/support/auth.ts
standards_docs:
  - packages/api-mocks/README.md
date: 2026-10-25
reporting_agent: api-tester
category: testing
domain: web
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`packages/api-mocks/README.md` says the package is the one description of the worker and to "not
write a second description of a route anywhere else". The editor's suites answer `POST /stacks`
themselves. Census, run 2026-10-25 from the repository root:

```
grep -rn -A1 "http\.post" apps/editor/src apps/editor/e2e | grep "STACKS_URL"
```

5 hits in 3 files: `stacks.test.ts` (a deliberately malformed answer, and one recording the sent
body), `account-store.test.ts` (`recordWrites`), `e2e/support/auth.ts` (`stubSignedIn`, stateful,
and `holdStackSave`). Each answers 201 to any name. The shared mock has no stateful account to
offer, which is why each suite wrote its own.

It mattered once the worker started refusing a stack name the account already holds (owner ruling
2026-10-24). The new refusal lives in api-mocks' `signedInHandlers` and `STACK_NAME_TAKEN_BODY`.
None of these local handlers will give it, so a suite saving a name its own list holds still gets a
201 the worker would not send. And one spec breaks the other way: `stacks.test.ts` "returns the
stack the worker saved" saves `SAVED_STACK.name` against `signedInHandlers`, whose list already
holds that name. So the faithful mock refuses it.

## Fix Applied

None — discovery only. These files are in the editor's lane.

## Proposed Standard

A suite-local handler for a worker route should either delegate the worker's refusals to
api-mocks, or say which refusal it leaves out and why. A census like the one above could go in the
README's "Using it" section, so a contract change in api-mocks comes with the list of stubs it
won't reach. This sits inside the README's existing rule and doesn't conflict with it.
