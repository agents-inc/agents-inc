---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/seed/fetch-seed.ts
  - src/cli/lib/seed/publish-seed.ts
  - apps/server/src/index.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-01
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `refusalMessage` in fetch-seed.ts now quotes a refusal's body, gated by `arrivedAsText` on the
  wire's own content type and bounded by that module's own `EXPLANATION_BUDGET`; `refusalMessage`
  in publish-seed.ts answers a 409 with `OUT_OF_DATE_AGAINST_STORE` in the CLI's own words instead
  of the store's browser advice. Six specs across the two suites, each watched failing first.
---

## What Was Wrong

A predecessor finding established that a refused HTTP response's body must not be thrown away, and
fixed the outbound half. The rule it left behind — **quote the store's own account of a refusal** —
is right and is not specific enough, because it does not ask two questions that both have a wrong
default.

**1. Who was the body written for?** `POST /configs` answers a payload naming another seed version
with `409` and this body, from `refuseAnotherSeedVersion` in `apps/server/src/index.ts`:

```
Reload the page: this configuration names another version of the sharing contract, and this service serves v5
```

That is the correct instruction for the caller the refusal was designed around — a browser tab
minting from a bundle older than the last deploy, for which one reload really is the whole fix.
There is no page in a terminal. Quoting it would be **worse than the bare status it replaced**: a
status says nothing, where browser advice sends the reader somewhere that does not exist. And this
is the one refusal on the route whose entire purpose is naming a remedy, so it is the worst possible
member of the class to get wrong.

The actionable form of the same fact was available and unstated: `SEED_VERSION` is a `z.literal`
imported from `@workspace/matrix/seed` and bundled into the binary, so the version a CLI writes
travels _inside_ it. A 409 cannot be the payload's fault by either door — `read-piped-payload.ts`
validates a piped configuration against `installableSeedPayloadSchema` before the POST, and
`config-to-seed.ts` writes `SEED_VERSION` into one it builds — so it can only be the two ends
disagreeing, and only a newer CLI can change that.

**2. Does anything say the body came from the store at all?** The outbound half is safe by
accident: it quotes only what parses as the zod-validator envelope, so a proxy's HTML fails the
shape and degrades to the status for free. The inbound route has no envelope — `getConfig` writes
every refusal with `c.text(...)` — so the obvious completion is to quote whatever came back, and a
naive implementation written to check that (stage one of this task) put

```
Fetching configuration failed (HTTP 502). The store said: <html><head><title>Request blocked</title></head></html>
```

on the terminal from a captive-portal fixture. **A sentence has no shape to validate**, so
provenance has to be established some other way and the damage bounded regardless.

## The Standard This Suggests

> A refusal's body is repeated to a user only where the CLI is its intended audience, and only
> where the wire says the store is what sent it. Everything else degrades to the status.

Three parts, each with a test an author can apply:

| Question                         | How it is answered here                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Was this written for a terminal? | Per status, by reading the server's own handler. 409 is branched out and answered in the CLI's words |
| Did the store send it?           | `text/plain`, which is what `c.text(...)` produces and what an HTML error page is not                |
| Is it still an explanation?      | A character budget sized on what that route really writes, with attribution to the store             |

**The budget is a measurement of one route, not a policy about terminals.** `publish-seed.ts` sets
300 because the store's refusal there is a list of schema issues at ~150 characters apiece;
`fetch-seed.ts` sets 120 because that route writes one short line (`Stored config is unreadable`,
`Could not read this config`). Copying either number to the other place would be a number with no
reason attached.

**A status is not a body's provenance, and a body is not a status's meaning.** The two halves fail
in opposite directions: quoting by status alone repeats whatever answers, and answering by status
alone discards what the store knows. The read side branches on provenance and the write side
branches on status, and both are correct for their own route.

## How It Was Caught

Not by a gate — nothing static can read the audience of a sentence. It was caught by reading
`apps/server/src/index.ts` before deciding what to quote, which the tracker rows for both halves
demanded explicitly ("read the worker's actual answers before deciding; do not assume from the
row"). The two control specs that pin the non-quoting arms were written to pass, then **shown to
fail** against a deliberate unguarded first implementation — without that step they were assertions
about behaviour nothing had ever threatened.

## Residual

`publish-seed.ts` still discards the plain-text bodies the write route sends for 413, 429 and 503 —
`Payload too large`, `Too many requests`, `Could not store this config` — because its quoting arm
reads the envelope only. Reproduced against a stub answering as the worker does:

```
$ AGENTS_INC_API_URL=<stub answering 413> agents-inc share --stdin < payload.json
 ›   Error: Sharing this configuration failed (HTTP 413).
```

That is now asymmetric with the read side, which quotes plain text. It is a real gap and was left
alone deliberately: this task's rows scoped the write half to 409, and widening a fix past its row
is what the briefing contract forbids. It wants a row of its own.
