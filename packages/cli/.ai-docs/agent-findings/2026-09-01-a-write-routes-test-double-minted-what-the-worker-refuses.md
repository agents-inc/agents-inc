---
type: anti-pattern
severity: high
affected_files:
  - packages/api-mocks/src/handlers.ts
  - packages/cli/e2e/fixtures/seed-config-store.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-01
reporting_agent: api-tester
category: testing
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: >-
  `createConfig` in packages/api-mocks/src/handlers.ts now validates a posted body against
  `installableSeedPayloadSchema` before minting, answering 400 with the same envelope
  `@hono/zod-validator`'s default hook sends when it refuses. `mintedHandler` in
  packages/cli/e2e/fixtures/seed-config-store.ts now files and mints only when the same schema
  accepts the body, falling through to `configHandlers`'s own refusal otherwise — restating no
  rule of its own. Both watched failing first: `packages/api-mocks/src/handlers.test.ts` and
  `packages/cli/e2e/commands/seed-config-store-validation.e2e.test.ts` (new — see
  `2026-09-01-a-new-specs-directory-can-break-an-unrelated-symbolic-journey-reference.md` for why
  it lives in `commands/` rather than beside the fixture it tests), both posting the exact payload
  that reached a real user — a project-scoped skill assigned to a sub-agent resting at the
  `global` default — and asserting a mint where each previously answered 201.
---

## What Was Wrong

Both of this ecosystem's test doubles for `POST /configs` answered `201 { id }` to **any** body at
all, while the real worker (`apps/server/src/index.ts`) gates that route with
`installableSeedPayloadSchema` and refuses with 400, 409, 413 or 503. A double more permissive
than the service it stands in for cannot fail, and one that cannot fail is not a test of whatever
posts to it.

This is not hypothetical: the CLI's own local pre-POST check used the BASE schema
(`seedPayloadSchema`) for a week where the write route needs the STRICTER one, and every suite
touching a config POST stayed green throughout, because both `packages/api-mocks`'s `createConfig`
and `packages/cli`'s own `e2e/fixtures/seed-config-store.ts` `mintedHandler` minted an id
regardless. A real user hit the resulting `HTTP 400` with no local suite ever having sent that
shape of request through anything that could refuse it.

Two comments in `handlers.ts` had encoded the belief that made the gap invisible rather than
merely unfilled: one described 409 and 503 as "the two statuses `POST /configs` refuses with"
where the worker declares four; `storeRefusedHandler`'s said KV refusal (503) was "the one failure
the POST has that no request can provoke, since the body was built from the contract's own
schema" — stated as fact while nothing enforced it, and falsified by the production incident this
same week.

**The general shape:** a package that mirrors a service's READ side faithfully (fixed fixtures,
parsed against the real schema — see `STORED_PAYLOAD` and `SKILL_INDEX` in
`packages/api-mocks/src/fixtures.ts`, both `.parse()`'d rather than asserted) can still leave its
WRITE side unguarded, because a write's `default` answer has no fixture to parse against — it has
to run the schema on the CALLER'S body, which is a different kind of work than serving a constant.

## Fix Applied

- `packages/api-mocks/src/handlers.ts`: `createConfig` now reads the posted body, runs
  `installableSeedPayloadSchema.safeParse`, and answers `mintedConfig()` on success or
  `HttpResponse.json({ success: false, error }, { status: 400 })` on failure — the same shape
  `@hono/zod-validator`'s default hook produces (`c.json(result, 400)`), verified by comparing a
  `safeParse` result run through both.
- `packages/cli/e2e/fixtures/seed-config-store.ts`: `mintedHandler` is now only installed ahead of
  `configHandlers` when a new `isInstallable` check (the same schema, same question) accepts the
  posted body; an invalid POST is left unfiled and falls through to `configHandlers`'s own
  (now-validating) refusal, so this file states no rule of its own either.
- The three comments named above were corrected in place rather than deleted, with the false
  premise and what falsified it stated alongside the correction (`clean-code-standards.md`'s
  posture on a caught-and-discarded cause, applied to a discarded assumption instead).
- Every opt-in override (`configRefusedHandlerFor`, `storeRefusedHandler`) was left unchanged and
  is covered by new specs proving it still shadows the validating default — a spec installing one
  of these wants a SPECIFIC failure, not the schema's opinion of its body.

Both suites were watched RED first against the unmodified doubles before the fix landed:
`npx vitest run src/handlers.test.ts` (packages/api-mocks) and
`npx vitest run --config e2e/vitest.config.ts -t "" e2e/commands/seed-config-store-validation.e2e.test.ts`
(packages/cli), each failing with `expected 201 to be 400` on the demonstration payload.

## Proposed Standard

Add to `.ai-docs/standards/editor-and-worker.md`, near the sections on what a published contract
and an `hc` route owe their consumers:

> **A test double for a WRITE route validates what the worker validates; it does not merely mirror
> the worker's READ answers.** A GET double can be faithful by construction — parse a fixed fixture
> against the real schema once, at import, and serve it. A POST/PUT/PATCH double cannot: its
> default answer is a function of whatever the CALLER sends, so faithfulness means importing the
> same schema the route is gated with and running it over the request body, then answering exactly
> as the framework's own validation failure does (envelope shape included) — not inventing a
> narrower or looser one.
>
> This is a second implementation of the contract and can drift if the route adds a rule the
> double does not re-import — accepted deliberately, because the alternative (an unvalidated
> double) is silent rather than merely imperfect. Minimise the drift surface by importing the
> schema and restating no rule of it by hand; a double that reimplements validation logic rather
> than calling the shared schema has re-introduced the exact risk this rule exists to bound.
>
> **The tell that a double needs this:** the route the double stands in for declares more than one
> non-2xx response in its OpenAPI route definition, and the double's default handler answers only
> the 2xx one regardless of what was posted.

## How It Was Caught

Independently by two lanes reaching for the same fact from different directions in the same week
(a code reviewer, and the `publish-seed.ts` refusal-body work), which is itself worth naming: **a
double this permissive gives no local signal that it needs fixing** — nothing failed, nothing
flaked, every suite touching the route was green. It surfaced only because a real HTTP 400 forced
someone to read `apps/server/src/index.ts`'s actual route declaration against what the doubles
answered, and noticed the gap between four declared refusals and one that would ever fire.

## Residual

`configRefusedHandlerFor` still answers 409 with no body, while the real worker's 409
(`refuseAnotherSeedVersion`) sends the "Reload the page" sentence — so no spec in this repository
exercises that envelope against a handler shaped like the worker's real one (`publish-seed.test.ts`
builds its own `contractVersionRefusalHandler` text response for this instead). This was flagged
alongside the finding that produced this one and was explicitly out of this task's scope (see
`todo/archive.md`'s CLI-849 entry once landed); it is recorded here rather than left to be
rediscovered, since it is the same class one status short of full coverage.
