---
type: standard-gap
severity: medium
affected_files:
  - apps/server/vitest.config.ts
  - apps/server/src/index.test.ts
  - apps/server/src/skill-index.test.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-08
reporting_agent: api-developer
category: testing
domain: api
root_cause: convention-undocumented
status: partial
partial_note: The new suite handles both losses correctly (per-key cleanup in `beforeEach`, `vi.stubGlobal` for outbound fetch) and `apps/server/vitest.config.ts` already documents the plugin move. What is pending is a written note that KV state now LEAKS between tests in a file — nothing states it, and `index.test.ts` is quietly relying on it not mattering.
---

## What Was Wrong

`@cloudflare/vitest-pool-workers` 0.20 removed two things the Workers testing docs still lead with,
and `apps/server` was upgraded to it without either loss being noticed — because the 17 tests that
existed happened not to depend on either.

**1. `isolatedStorage` is gone.** Under 0.19 each test ran on its own storage stack and KV was
empty at the start of every test. Verified against 0.20.1: the string does not appear anywhere in
`node_modules/@cloudflare/vitest-pool-workers` — not in `dist/pool`, not in `dist/worker`, not in
`types/cloudflare-test.d.ts`. A throwaway pair of tests confirmed the behaviour: one writing
`env.CONFIGS.put("spike", "one")`, the next reading the same key back, got `"one"` rather than
`null`. **KV now leaks between tests in a file.**

The existing suite survives on luck. `index.test.ts` writes `corrupt1` and `corrupt2` and reads them
back inside the same test, and its other cases use content-addressed ids that collide harmlessly.
Nothing there would fail — but nothing there is written in the knowledge that state persists, either,
and the first test that seeds a cache and expects a cold one afterwards would fail confusingly.

The replacement is `reset()` from `cloudflare:test` ("Deletes all data from all attached bindings"),
which is a bigger hammer than it looks: it empties every binding, so a suite calling it in
`beforeEach` is reaching past its own keys.

**2. `fetchMock` is gone.** The declared way to intercept a Worker's OUTBOUND requests used to be
`import { fetchMock } from "cloudflare:test"` plus `fetchMock.get(origin).intercept(...)`. In 0.20.1
`cloudflare:test` exports no such binding — `dist/worker/lib/cloudflare/test.mjs` exports 18 names
and `fetchMock` is not among them. The undici `MockAgent` TYPES are still in
`types/cloudflare-test.d.ts`, describing an API the module no longer provides, which is what makes
this easy to lose an afternoon to.

## Fix Applied

`apps/server/src/skill-index.test.ts` — the first suite in this repository that needed either — was
written against what 0.20 actually offers, with both facts recorded in comments where the next
reader will hit them:

- **Storage:** the suite clears exactly its own keys in `beforeEach` rather than calling `reset()`.
  Narrower than the hammer, and it cannot disturb whatever another test file is holding. (The
  expression was `INDEXED_REPOS.map((repo) => env.CONFIGS.delete(skillIndexShardKey(repo)))` when
  this was written; SERVER-06 collapsed the per-repository shards into one key and it is now
  `env.CONFIGS.delete(SKILL_INDEX_KEY)`. The practice is unchanged.)
- **Outbound fetch:** `vi.stubGlobal("fetch", ...)`, with `vi.unstubAllGlobals()` in `afterEach`.
  This works because of something the pool's own types state in passing — the `main` worker "runs in
  the same isolate/context as tests, so any global mocks will apply to it too". `SELF.fetch` is a
  `Fetcher` method rather than the global, so dispatching INTO the worker still works while every
  call the worker makes OUT is intercepted. Confirmed by spike before the suite was designed around
  it.

## Proposed Standard

A short section in `apps/server`'s testing guidance — the natural home is the comment block already
at the top of `apps/server/vitest.config.ts`, which explains the 0.20 plugin move and stops one
paragraph short of these two consequences:

1. **KV state persists between tests in a file.** A test that needs a cold binding must clear its
   own keys in `beforeEach`. Prefer deleting the keys the suite owns over `reset()`, which empties
   every binding attached to the runner.
2. **Intercept outbound requests with `vi.stubGlobal("fetch", ...)`, not `fetchMock`.** `fetchMock`
   was removed in 0.20 while its undici types were left behind, so the old approach fails at import
   with types that still typecheck. Always pair it with `vi.unstubAllGlobals()` in `afterEach` —
   `clearMocks: true` from the shared config clears mock CALLS, not stubbed globals.

Both are the kind of rule that costs nothing to write and an hour to rediscover, and neither is
inferable from the code as it stands: the losses are silent, and the type declarations actively
point the wrong way on the second one.
