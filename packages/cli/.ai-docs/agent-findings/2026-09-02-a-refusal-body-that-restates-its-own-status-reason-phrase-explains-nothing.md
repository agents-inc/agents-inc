---
type: standard-gap
severity: medium
affected_files:
  - apps/server/src/index.ts
  - src/cli/lib/seed/fetch-seed.ts
  - src/cli/lib/seed/publish-seed.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-02
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `publish-seed.ts` reads a refusal body for every status, tries the zod envelope first and falls
  back to quoting plain prose behind an `arrivedAsText` content-type gate, and suppresses a body
  equal to its own status's reason phrase (`node:http`'s `STATUS_CODES`, trimmed and
  case-insensitive). 503's `Could not store this config` reaches the terminal; 413's and 429's do
  not. Six specs in `publish-seed.test.ts`, each watched failing first.
---

## What Was Wrong

The rule left by `2026-09-01-a-refusals-body-is-quoted-only-where-the-cli-is-its-audience.md` asks
three questions of a refusal body before it may be quoted, and the first of them —
**"was this written for a terminal?"** — is answered there by "per status, by reading the server's
own handler." That is correct and it is not specific enough, because reading the handler tells an
author what the body SAYS and nothing about whether saying it adds anything. The other two
questions each have a mechanical test (`text/plain` for provenance, a character budget for length);
this one had only a reading, and a reading is what both consumers of the rule got wrong, in
opposite directions.

**A body that restates its own status's reason phrase explains nothing.** `POST /configs` writes
three refusals with `c.text`, and the test is one line:

```
node -e '
const { STATUS_CODES } = require("node:http");
const bodies = { 429: "Too many requests", 413: "Payload too large", 503: "Could not store this config" };
for (const [status, body] of Object.entries(bodies)) {
  console.log(status, JSON.stringify(STATUS_CODES[status]), body.toLowerCase() === STATUS_CODES[status].toLowerCase() ? "RESTATES" : "names a cause");
}'
```

| Status | Reason phrase         | Worker body                   | Verdict       |
| ------ | --------------------- | ----------------------------- | ------------- |
| 413    | `Payload Too Large`   | `Payload too large`           | RESTATES      |
| 429    | `Too Many Requests`   | `Too many requests`           | RESTATES      |
| 503    | `Service Unavailable` | `Could not store this config` | names a cause |

That is the whole population of the write route's `c.text` refusals (a census — `grep -n 'c\.text('`
over `apps/server/src/index.ts`, restricted to the two middlewares and `createConfig` that the POST
can reach). Two of the three are the reason phrase with one letter re-cased.

**The rule's imprecision then propagated in both directions from one sentence.** The predecessor
finding's own Residual named `413, 429 and 503` as a single gap and called the write half
"asymmetric with the read side, which quotes plain text" — true of the mechanism and false of the
content, because the read route's bodies are prose (`No config under this id`, `Stored config is
unreadable`, `Could not read this config`) where two of the write route's are reason phrases. The
asymmetry is therefore mostly justified rather than a gap: the two halves quote differently because
the two routes WRITE differently.

A later scrutiny pass narrowed the resulting tracker row (CLI-855) by applying a content test for
the first time, and inverted it. It disqualified 413 for restating its own status — correct — then
kept 429 on the ground that it "tells the caller something the status code does not, that waiting is
the remedy", which the body does not say and cannot, being the reason phrase; and it dismissed 503
because "503's body is already mirrored by `STORE_REFUSED_BODY` in `packages/api-mocks`", which is a
fact about a test fixture and bears on nothing a user sees. **The one body of the three that names a
cause is the one that was ruled out, on the only ground offered that was not about content.**

Reproduced through the real binary against a stub answering exactly what the worker answers
(`c.text` is `text/plain; charset=UTF-8` — `node_modules/hono/dist/context.js`, `TEXT_PLAIN`):

```
$ AGENTS_INC_API_URL=<stub answering 429> node bin/run.js share --stdin < payload.json
 ›   Error: Sharing this configuration failed (HTTP 429).
$ AGENTS_INC_API_URL=<stub answering 503> node bin/run.js share --stdin < payload.json
 ›   Error: Sharing this configuration failed (HTTP 503).
```

Building the row as written would have produced `Sharing this configuration failed (HTTP 429). The
store said: Too many requests.` — longer than what it replaces, carrying nothing the first sentence
did not, and teaching a reader that the `The store said:` clause is worth reading on a route where
two of its three occurrences would be filler.

**There is also no way to implement "the 429 alone" in the read half's idiom.** `arrivedAsText`
gates on content type, and all three bodies are `c.text`, so they are indistinguishable on the wire
but for the status line. Quoting 429 alone requires branching on the status number to decide whether
to READ a body, which contradicts the posture `publish-seed.ts` documents for itself ("Read for
every status rather than for 400 alone"). The row's scope and the row's mechanism could not both be
satisfied, and that impossibility is a second signal the content test was never run.

## Fix Applied

**Discovery and fix were two dispatches, deliberately.** The first was scoped to quoting the 429
body and forbidden from widening; both halves of what it found say do neither, so it changed nothing
and reported — the briefing contract's rule that an agent whose row does not describe the tree stops
on it rather than inventing work to justify it. The row was then re-scoped from that report and
re-dispatched.

What landed: `refusalBody` returns raw text for every status instead of parsing it as JSON;
`explanationOf` tries the zod envelope first and falls back to `quotableProseIn`, which gates on
content type, drops a blank body, and drops one equal to its own status's reason phrase from
`node:http`'s `STATUS_CODES`, compared trimmed and case-insensitively. **No status number gates a
read** — the pre-existing 409 branch, which discriminates before any read for its own documented
reason, is untouched.

The suppression is what makes the rule general rather than a hand-list: 413 and 429 needed no
special case, and neither will a fourth. Confirmed at the terminal — a 503 renders `The store said:
Could not store this config`, a 429 and a 413 render the bare status.

## Proposed Standard

For `.ai-docs/standards/editor-and-worker.md`, beside the existing three-question table, as a fourth
row and a sharpening of the first:

> **A refusal body earns its place by naming something the status does not.** Before quoting one,
> compare it against its own status's reason phrase (`node:http`'s `STATUS_CODES`). A body equal to
> that phrase up to case is the status spelled out, and quoting it makes the message longer without
> making it more actionable. A body naming the OPERATION that failed — `Could not store this
config` against `Service Unavailable` — is the case the rule exists for.

Two consequences worth writing down with it, both learned here:

1. **Per-status, not per-route.** One route can write both kinds, and `POST /configs` does. A rule
   phrased over a route ("the write half discards plain-text bodies") cannot express that, which is
   how three bodies came to be filed as one gap.
2. **A mock fixture mirroring a body is not evidence the body reaches a user.** `STORE_REFUSED_BODY`
   exists in `packages/api-mocks` and the CLI still drops the string it holds; the hand-run above is
   what settles the question, and nothing in the test tree could have.

This conflicts with no NEVER/ALWAYS rule in `CLAUDE.md`. It is a refinement of, and does not
supersede, `2026-09-01-a-refusals-body-is-quoted-only-where-the-cli-is-its-audience.md` — that
finding's fix stands and its `resolved` status is still true; what is proposed here is the mechanical
test its first question was missing. Nothing static can enforce it: a redundant quote type-checks,
lints and reads normally, and the comparison needs the server's source and the CLI's in one head.
