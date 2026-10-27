---
type: standard-gap
severity: medium
affected_files:
  - apps/server/src/auth.test.ts
  - apps/server/vitest.config.ts
standards_docs:
  - packages/cli/.ai-docs/standards/editor-and-worker.md
date: 2026-10-25
reporting_agent: api-tester
category: testing
domain: api
root_cause: convention-undocumented
status: open
---

## What Was Wrong

No server spec drives the second leg of a GitHub sign-in (`GET /api/auth/callback/github`), so the
cookie a sign-in sets is pinned by nothing. It cannot be added as things stand: every request to the
callback ends in Better Auth's `throw c.redirect(...)`, and in the `@cloudflare/vitest-pool-workers`
pool that `APIError` (status 302) also surfaces as an unhandled rejection. Vitest counts it under
`Errors` and exits 1 with every test passing.

Reproduced 2026-10-25 against better-auth 1.7.2, with a one-test probe file in `apps/server/src`
(removed afterwards):

- `createAuth(env).handler(new Request("https://api.test/api/auth/callback/github?code=x"))`, with no
  Hono involved: status 302, `Tests 1 passed`, `Errors 1 error`, `Unhandled Rejection`, `statusCode: 302`.
- The same request through `app.request`: identical.
- A full round trip (sign-in, then the callback with the state cookie, GitHub stood in by msw):
  302 to the editor, session cookie set, one unhandled rejection per callback.

So the cause is Better Auth's thrown redirect under workerd, not this repository's wiring. The
SERVER-11 session-lifetime specs pin the length on the `get-session` path instead, which sets its
cookie from the same `sessionConfig.expiresIn`.

## Fix Applied

None. This was found while writing the specs.

## Proposed Standard

`apps/server/vitest.config.ts` could take an `onUnhandledError` filter (Vitest 4) that drops only an
`APIError` whose `statusCode` is between 300 and 399. Better Auth uses that error for flow control.
After that, a sign-in round-trip spec can be added to `auth.test.ts`. Record the filter's reason in
`editor-and-worker.md` beside the worker's testing notes. This is a proposal for whoever owns the
config. Hiding unhandled errors goes against the suite's "fail on anything undescribed" stance in
`vitest.setup.ts`, so a narrower filter is the only form worth considering.
