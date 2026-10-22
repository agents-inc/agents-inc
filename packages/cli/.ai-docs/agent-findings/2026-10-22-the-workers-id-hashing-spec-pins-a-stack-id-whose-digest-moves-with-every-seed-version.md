---
type: standard-gap
severity: low
affected_files:
  - apps/server/src/index.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: api
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`names a payload by the base64url SHA-256 of what it stores` in `apps/server/src/index.test.ts`
posts `payload({ stackId: URL_UNSAFE_STACK_ID })` and asserts the first eight standard-base64
characters of the stored body's digest contain `+/`. The stored body is the whole re-serialised
payload, `v` included, so the constant is a search result that holds for one contract version.
Bumping `SEED_VERSION` from 6 to 7 moved the digest of `url-unsafe-16` to `LP3mVw9W` and reddened
the spec with nothing pointing at the bump: its comment says what the id hashes to, not how the id
was found. Any change to the payload fixture's bytes does the same.

## Fix Applied

Re-derived with a search over `url-unsafe-<n>`, parsing `seedPayload({ stackId })` through
`installableSeedPayloadSchema` and hashing `JSON.stringify` of the result as the worker does:
`url-unsafe-540` gives `U+/5jvhV`. The constant now holds that id; the comment is unchanged.

## Proposed Standard

A constant found by search carries the search beside it: the comment names the loop (the fixture,
the serialisation, the predicate) so the next contract bump costs one paste rather than a
reconstruction. Or the spec finds its id at run time over a bounded range and fails naming the
range when none matches. Either fits `clean-code-standards.md`; neither conflicts with
`CLAUDE.md`. One spec, a census of one.
