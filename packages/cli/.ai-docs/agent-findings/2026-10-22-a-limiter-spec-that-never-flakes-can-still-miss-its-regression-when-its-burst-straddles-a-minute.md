---
type: anti-pattern
severity: medium
affected_files:
  - apps/server/src/compose.test.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: api
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Both compose specs that counted the real COMPOSE_CALLS binding now stub it with a per-key
  counter. No standard yet says a spec counting a windowed binding stubs it whether or not it
  flakes.
---

## What Was Wrong

Miniflare's `RateLimiterObject` (`ratelimit-object.worker.js`) buckets by
`Math.floor(Date.now() / (period * 1e3))` and clears every key when that changes. So the window is
the wall clock's minute, not 60 seconds from the first call. Run by hand against `wrangler dev`, an
address refused at 13:17:26 was let through again at 13:18:00.022.

The owner's ruling ("Stub the limiter") was asked about the specs that flaked. Two `compose.test.ts`
specs counted the real binding, and only one of them flaked:

- "still spends an allowance on every sentence that reaches the model" fails when its 11 calls
  straddle a minute: `expected 200 to be 429`.
- "spends no allowance on a sentence it refuses for length" never fails on correct code, because
  its last call is the first one counted. But its verdict on the regression it exists for (the
  limiter above the length guard, `2026-09-02-a-rate-limiter-above-a-free-guard-charges-for-work-it-refused-to-do`)
  depended on the window. Inside one minute, a mutant spending before the guards fails it with
  `expected 429 to be 400`. Across a minute, the bucket resets mid-loop and the same mutant passes.

A flake is visible. A miss is not: no run of the spec on correct code could show it.

## Fix Applied

`stubAllowance` in `compose.test.ts` counts per key, as the binding does, with no window. Both specs
call it, and their assertions are unchanged. The stub also removed the only check of what the count
is keyed by; a third spec restores it, and
`2026-10-22-a-limiter-stub-built-afresh-for-each-spec-never-sees-a-second-caller-so-the-limits-key-goes-unchecked`
records why.

The evidence is probes that make each spec's 6th call wait for the next wall-clock minute:

| Probe                | Before                                       | After                                     |
| -------------------- | -------------------------------------------- | ----------------------------------------- |
| real route, crossing | "still spends" red, `expected 200 to be 429` | both green                                |
| mutant, crossing     | length spec green (mutant missed)            | length spec red, `expected 429 to be 400` |

The `CONFIG_WRITES` specs in `stacks.test.ts` were already stubbed. Forced across a minute, the two
that write more than once pass.

Census (not a sample):

- `CONFIG_WRITES` limits only when `cf-connecting-ip` is set, and
  `grep -rln "cf-connecting-ip" apps/server/src --include='*.test.ts'` returns `compose.test.ts` and
  `stacks.test.ts`.
- Every other compose spec spends one allowance on a fresh `seedSession` user, which no boundary can
  change.
- Better Auth's sign-in rule (`customRules` in `auth.ts`, five a minute) is the third limiter, and
  `auth.test.ts` counts it to its 429. It is exempt: Better Auth resets a key only once 60 seconds
  have passed since the last request it counted (`now - data.lastRequest >= windowInMs` in
  `better-auth/dist/api/rate-limiter/index.mjs`), not on the clock's minute, so a fast burst cannot
  cross a reset. The address grep above cannot find it.
  `grep -rn -c "429" apps/server/src --include='*.test.ts'` finds every spec that asserts a refusal.
  The only other one, in `index.test.ts`, is Sentry's status relayed back.

## Proposed Standard

For `standards/editor-and-worker.md`: a spec whose subject is a count against a windowed binding
stubs the binding with a per-key counter, **whether or not it flakes**, and the file keeps a spec
with two callers the key must separate. A burst that straddles the window can turn a catch into a pass as well as a pass into a
failure. The cost, accepted by the owner's ruling: no spec exercises the configured numbers in
`wrangler.jsonc` (`limit: 20` and `limit: 10`).
