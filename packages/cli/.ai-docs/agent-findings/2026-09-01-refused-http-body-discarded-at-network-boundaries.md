---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/seed/publish-seed.ts
  - src/cli/lib/seed/fetch-seed.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-01
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  Both halves of the census landed. The outbound half is `refusalMessage` in publish-seed.ts,
  which reads a refused POST's body and quotes the store's own issue sentences beside the status.
  The inbound half is `refusalMessage` in fetch-seed.ts, which quotes a refused read the same way
  but on a different discriminator: `getConfig` writes its refusals with plain text rather than a
  Zod envelope, so `arrivedAsText` gates on the wire's own content type against `QUOTABLE_TYPE`,
  `explanationOf` trims and clips to that module's own `EXPLANATION_BUDGET`, and 404 is held out
  ahead of the arm under `NO_SUCH_CONFIG` because the CLI's own sentence names the id and the
  store's does not. `fetchEtag` in loading/source-fetcher.ts stays outside the class for the
  reason the body gives. Specs in fetch-seed.test.ts and publish-seed.test.ts pin both the quote
  and the degrade paths; the refinement of the rule the outbound half left behind is
  2026-09-01-a-refusals-body-is-quoted-only-where-the-cli-is-its-audience.md.
---

## What Was Wrong

A boundary reduced a refused HTTP response to its status and threw the body away.

`publish-seed.ts` rendered every failed `POST /configs` as
`Sharing this configuration failed (HTTP ${response.status}).` and never read `response.body`. The
worker had already said, in plain English, exactly what was wrong. `apps/server/src/index.ts`
registers no `defaultHook` and its own hook narrows only the seed-version case, so a refused body
falls through to `@hono/zod-validator`, which answers `c.json(result, 400)` — the whole `safeParse`
result. Verified against `@hono/zod-validator` 1.5.1's own dist and reproduced with zod 4.4.3: what
crosses the wire is

```json
{
  "success": false,
  "error": {
    "name": "ZodError",
    "message": "[\n  {\n    \"code\": \"custom\",\n    \"path\": [\n      \"skills\",\n      \"web-framework-react\",\n ... \"message\": \"a project-scoped skill has nowhere to be written on 'web-developer', which rests at global scope\"\n  }\n]"
  }
}
```

A real user hit this and had `HTTP 400` and nothing else. It cost a full debugging session for a
fault the server had already described.

Two things made it worse than an ordinary omission:

1. **The status is the one part of the answer that cannot say WHY.** `POST /configs` spends five
   statuses (400, 409, 413, 429, 503) and only one of them — 409 — is self-explanatory from the
   number. 400 means "your payload is wrong" and nothing more, which is precisely the case where
   the body is load-bearing.
2. **The field named `message` is not the message.** Zod renders its ISSUES into `error.message` as
   a pretty-printed JSON document. An implementation that reads the envelope and prints
   `error.message` verbatim — the obvious reading, and the one this task was briefed with — puts
   `[\n {\n "code": "custom",` on a user's terminal. The sentences a person can act on are one
   level further in, inside that string.

**Census of the class.** Two sites in `src/cli`, found with:

```
grep -rn 'HTTP \${' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

`publish-seed.ts` (fixed) and `fetch-seed.ts:54` (open — the inbound half of the same boundary,
`Fetching configuration failed (HTTP ${response.status}).`, with no body read). Widening the search
to every `await fetch(` and `!response.ok` in `src/cli` adds only `fetchEtag` in
`lib/loading/source-fetcher.ts`, which is a HEAD reading one header and produces no message — not a
member of the class. The sibling's loss is smaller than the one fixed here and needs a DIFFERENT
extraction: `getConfig` answers `c.text(...)` for 404/500/503, so there is no Zod envelope to read,
only a bounded plain-text quote. That is why it was not fixed by copying this fix.

## Fix Applied

In `publish-seed.ts` only, since that was this task's file ownership:

- A refused response's body is read (`refusalBody`), parsed against a schema for the worker's
  envelope (`refusalSchema`), and the issue array inside `error.message` is parsed again
  (`refusedIssuesSchema`) so each issue's own sentence can be rendered path-first — the same
  `path: message` shape `formatZodIssue` in `lib/schema-validator.ts` gives a local issue, which
  it cannot reuse because a wire object is not a narrowable `z.ZodIssue`.
- The status is never given up. The explanation is appended to the existing sentence, so a body
  that is empty, not JSON, or not the envelope degrades to byte-identical output.
- The quote is bounded with `truncateText` from `utils/string.ts` at a named
  `EXPLANATION_BUDGET = 300`, so a hostile or huge body cannot paint the terminal.
- Reading the body is guarded at both the stream and the parse, since draining a body throws in
  its own right.

The specs added to `publish-seed.test.ts` cover it — `npx vitest run
src/cli/lib/seed/publish-seed.test.ts --reporter=verbose` lists them. Most of them pin the DEGRADE
paths rather than the fix, deliberately, so the change cannot grow into printing raw bodies.
Hand-verified through `node dist/index.js share --stdin` against a stub store answering a Zod
envelope, an HTML page, an empty 409, a plain-text 503 and a 100 KB hostile message.

## Proposed Standard

Add to `.ai-docs/standards/editor-and-worker.md`, in the section on what the CLI may assume about
the worker's answers:

> **A refused response's body is evidence, not noise.** A boundary that reduces a non-2xx answer to
> its status throws away the only account of the failure anyone has, and a status can say WHAT was
> refused but never WHY. Read the body, extract the server's own explanation, and append it to a
> message that still names the status — the status is what distinguishes 400 from 409, 413, 429 and
> 503, and it must survive.
>
> Three conditions on doing it, because reading a body is how this goes wrong:
>
> - **Degrade, never crash and never widen.** A body that is empty, is not JSON, or is not the
>   shape expected must produce exactly the message the status alone would have produced. Draining
>   a body can throw; guard the read as well as the parse.
> - **Bound what you print,** with `truncateText` from `utils/string.ts` and a named budget. A
>   store can be replaced by a proxy, a captive portal or something hostile, and none of them get
>   to paint a terminal.
> - **Parse the envelope with a schema, and know what the fields really hold.** Zod renders its
>   ISSUES into `error.message` as a JSON document, so a field named `message` is not necessarily
>   prose. Verify against the producer rather than against the field name.

This does not conflict with any NEVER/ALWAYS rule in `CLAUDE.md`. It is adjacent to two of them and
consistent with both: "NEVER answer a `no-unused-vars` report on a CAUGHT ERROR by renaming it
`_error` — treat it as a bug report, the author meant to report the cause and the reporting is what
is missing" is the same principle one layer down (a discarded local cause), and this is its remote
half — a cause the server supplied and the client dropped. It is also the reason `read-piped-payload.ts`
exists at all: that file's promise is "everything that can fail locally, failing before the caller
spends a write", and this rule covers what is left when the failure is NOT local.

**A checker cannot see this.** Nothing in `tsc`, `eslint` or the suite can tell a boundary that read
a body from one that did not — both compile, both lint, both pass, and the defect is a message that
is merely less useful than it could be. The grep above is the only mechanical handle, and it finds
the shape only where the message interpolates the status. That is why the sibling at
`fetch-seed.ts:54` is recorded here with its line rather than left to be rediscovered.
