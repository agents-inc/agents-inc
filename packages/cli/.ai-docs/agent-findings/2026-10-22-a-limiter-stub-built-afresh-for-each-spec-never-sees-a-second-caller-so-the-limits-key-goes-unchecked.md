---
type: anti-pattern
severity: medium
affected_files:
  - apps/server/src/compose.test.ts
  - apps/server/src/db/seed-session.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: api
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  compose.test.ts now has a spec with a second sign-in and a second person at one address. No
  standard yet says that a file stubbing a limiter keeps a spec with two callers.
---

## What Was Wrong

`2026-10-22-a-limiter-spec-that-never-flakes-can-still-miss-its-regression-when-its-burst-straddles-a-minute`
replaced the real `COMPOSE_CALLS` binding with a per-key stub. Against the real binding, every spec
in the file spent from one shared store, so a limiter keyed by a constant ran out partway through the
file. The review measured that at HEAD: 8 of 16 specs failed against a one-key mutant (inherited, not
re-run here). After the change, each spec built a fresh stub and used one person, so the stub never
saw a second key. Nothing checked what the count was keyed by, and every spec stayed green.

The per-key stub of `2026-10-20-a-limiter-stub-keyed-on-the-tests-own-address-pins-how-the-worker-spells-its-keys`
works only beside a spec with a second caller. Its proposed standard names the stub and leaves out
that spec.

Mutants of `key: session.user.id` in `compose.ts` were loaded into the worker by a throwaway vitest
config: a `resolveId` hook returns the mutant when `src/index.ts` imports `./compose`. A sentinel
mutant failed 12 of 16 specs, so the hook reaches the worker's own copy.

| Key in the mutant                                     | Spec file before | After                              |
| ----------------------------------------------------- | ---------------- | ---------------------------------- |
| `"compose"`                                           | 16 passed        | 1 failed, `expected 429 to be 200` |
| `c.req.header("cf-connecting-ip") ?? session.user.id` | 16 passed        | 1 failed, `expected 429 to be 200` |
| `session.session.id`                                  | 16 passed        | 1 failed, `expected 200 to be 429` |
| `session.user.id` (the real route)                    | 16 passed        | 17 passed                          |

Nothing ever checked the session row, HEAD included, because each spec's person had only one
session.

## Fix Applied

"counts a person's calls across their sessions, and apart from another person's at the same address"
gives each key an allowance of one. The person is let through. Their second sign-in is refused. A
second person sending the same `cf-connecting-ip` is let through. The shared address is what catches
a key that falls back to the user when no address is sent. `signInAgain` in `db/seed-session.ts`
makes the second session through Better Auth's adapter, and `signedIn` takes an optional address.
The spec does not read the stub's calls, so renaming the key leaves it green.

A probe against the real binding at its configured limit gave ten 200s then a 429. The second
sign-in got a 429 and the other person a 200, all inside one clock minute.

## Proposed Standard

For `standards/editor-and-worker.md`, with the 2026-10-20 stub rule: a file that stubs a limiter
keeps one spec that sends the key two callers it must separate and two it must merge, and asserts
both. `stacks.test.ts` › "limits each address apart, so one refused address leaves another let
through" and the compose spec above are the two instances. The stubs to check:
`grep -rn 'spyOn(env\.[A-Z_]*, "limit")' apps/server/src`.
