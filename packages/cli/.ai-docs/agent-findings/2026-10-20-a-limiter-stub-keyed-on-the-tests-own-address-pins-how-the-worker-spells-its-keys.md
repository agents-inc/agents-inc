---
type: anti-pattern
severity: low
affected_files:
  - apps/server/src/stacks.test.ts
  - apps/server/src/compose.test.ts
  - apps/server/e2e/helpers/local-dev.e2e.test.ts
  - apps/www/scripts/check-syntax-theme.ts
  - apps/www/scripts/check-editor-address.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-20
reporting_agent: api-tester
category: testing
domain: api
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  REPO-44 step 7, lane W6. Each assertion below was rewritten to read the public surface, or deleted where
  a behaviour test already covered it. The working tree carries the change.
---

## What Was Wrong

The "tests survive refactor" ruling was in force, yet four kinds of assertion in the worker and site
lanes went red on refactors that keep behaviour:

- **A stub that answers according to the test's own value.** `stacks.test.ts` stubbed
  `CONFIG_WRITES.limit` with `success: key !== refusedAddress` and then asserted
  `limit.mock.calls` against `[{ key: address }]`. Both lines fixed the key's spelling, so a key
  rewritten as `configs:${address}`, which still limits per address, turned the status assertion
  red as well as the call-list assertion. To reproduce: change `{ key: address }` in
  `apps/server/src/index.ts` and run `npx vitest run src/stacks.test.ts`.
- **A route declaration read off the route object.** `compose.test.ts` imported `composeRoute` and
  `listStacksRoute` and read `route.responses[401].content[…].schema`, so moving a route out of its
  module would break the test.
- **A spawned command's argv.** `local-dev.e2e.test.ts` asserted the exact `wrangler kv key put …`
  argv. The behaviour was already covered: `dev.e2e.test.ts` › "keeps an index younger than three
  days" publishes through real wrangler and has the worker serve the result.
- **Source text standing in for a render check.** `check-syntax-theme.ts` searched
  `astro.config.ts` for the import, while its own render check compared against hand-copied hex
  values.

## Fix Applied

- The per-address limiter test now uses a fake that gives each key one allowance. It asserts A
  passes, then A is refused, then B passes, so it shows the addresses are limited separately
  without depending on how the worker spells its keys. A constant key still turns it red, and a
  renamed key does not. Both were run.
- The 401 declaration is now read from `app.getOpenAPI31Document()` for all five operations that
  need a session. A `z.literal("")` mutant still turns it red.
- The argv assertion is deleted, along with the `argv` field the stand-in recorded only for it.
- The syntax check now builds its expected colours from `inkRampSyntaxTheme`, and the source read
  is deleted. It was watched red against a modified theme.
- `check-editor-address.ts` now imports the site's own `EDITOR_URL` instead of parsing
  `links.ts`.

## Proposed Standard

Add to `standards/editor-and-worker.md`, where the worker's tests are described: a stub for a keyed
binding (`limit`, KV) answers from state it builds up across calls (one allowance per key), not by
comparing the key to a value the test expects. A route's declared contract is read from
`app.getOpenAPI31Document()`, never from an imported `createRoute` object. Nothing enforces either
rule today.
