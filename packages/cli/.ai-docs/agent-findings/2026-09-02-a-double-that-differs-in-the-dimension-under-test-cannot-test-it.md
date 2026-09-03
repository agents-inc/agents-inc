---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/helpers/cli-runner.ts
  - src/cli/lib/__tests__/commands/search.test.ts
  - src/cli/lib/schema-validator.ts
  - src/cli/lib/schema-validator.test.ts
  - src/cli/lib/seed/publish-seed.ts
  - src/cli/lib/seed/publish-seed.test.ts
  - src/cli/lib/seed/fetch-seed.ts
  - src/cli/lib/seed/fetch-seed.test.ts
  - packages/api-mocks/src/handlers.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-02
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Landed — `runCliCommand` exposes `rawStdout` and `search.test.ts` reads its escape negation off
  it; both seed suites carry a fixture answering hono's real `text/plain; charset=UTF-8`;
  `publish-seed.test.ts` pins the trimmed restatement comparison; `schema-validator.test.ts` pins
  both remaining sanitisation points in `formatZodIssue`, each with its permitted twin.
  The `packages/api-mocks` half was closed the same day: the five worker call sites route through a
  `workerText` helper answering hono's real `text/plain; charset=UTF-8`, proved by a `===` mutant
  that passed against the bare form and fails against the corrected one. The two GitHub-CDN call
  sites deliberately keep the bare form, because hono is not involved there.
  Still pending, in another lane's file — `cli-runner`'s `stderr` and
  `error.message` are stripped with no raw reading beside them, so the same vacuum is one spec away
  from reopening on either.
---

## What Was Wrong

Four assertions across three suites could not fail, and one library check was tested only against a
wire that does not exist. They look like four unrelated coverage gaps and they are one shape:

> **A double or a harness that differs from production in exactly the dimension the code
> discriminates on cannot test that dimension.** The check passes, for a reason production never
> supplies.

Neither half is visible from the assertion. Both read as rigorous.

### 1. The harness removed the characters the assertion negated

`runCliCommand` returns `stdout: stdoutBuf.map((s) => ansis.strip(s)).join("")`. `search.test.ts`
then asserted, of a catalogue whose `displayName` carries an erase-line and a carriage return:

```ts
expect(stdout).not.toContain(ESCAPE);
expect(stdout).not.toContain(CARRIAGE_RETURN);
```

The first line is vacuous **by construction** — `ansis.strip` removes ANSI escapes, so no command
output of any kind can satisfy `toContain(ESCAPE)` after it. The second still bites, because a bare
`\r` is not an ANSI sequence and survives the strip. So a pair written as one invariant was half a
test, and nothing about the two adjacent lines says which half.

Measured: with `toResultRow`'s `name` changed from `stripTerminalControls(skill.displayName)` to
`skill.displayName.replaceAll("\r", "")` — an escape-only leak, no carriage return — all ten specs
in `search.test.ts` passed. The raw buffer for that run held
`Playwright<ESC>[2K ›   VERIFIED PUBLISHER <ESC>[22m`.

That `<ESC>[22m` is the part worth keeping. `@oclif/table` **passes cell escapes straight through
and sizes the column over them**, then emits its own SGR reset beside them: the run measured 706
raw bytes against 697 stripped, and the Name column's border no longer lines up. So the third
defect the CLI-854 hand-run found was reachable by the exact assertion that had been written to
catch it, and could not be caught by it.

One caveat this cost an experiment to learn, because it points the wrong way: a reset **appended to
a cell value** (`` `${...}<ESC>[0m` ``) is normalised away by the table and never reaches stdout.
Escapes are dropped where the table generates them and preserved where the catalogue supplies them,
so an SGR-reset mutant is not a probe for this and an unsanitised-content mutant is.

### 2. Every fixture announced a content type the worker does not send

`arrivedAsText`, in both `publish-seed.ts` and `fetch-seed.ts`, is the whole discriminator on the
prose arm — the wire's own statement that the store, rather than a proxy or a captive portal, wrote
the body:

```ts
return (response.headers.get("content-type") ?? "").startsWith(QUOTABLE_TYPE);
```

`QUOTABLE_TYPE` is `"text/plain"`. Hono's `c.text(...)` sends `TEXT_PLAIN`, which is
`text/plain; charset=UTF-8` (`node_modules/hono/dist/context.js`). MSW's `HttpResponse.text` sends
a bare `text/plain`. **Every fixture in both suites took the MSW default**, and `grep -rn 'charset'`
over the two spec files and `packages/api-mocks/src` returned nothing.

So `.startsWith(...)` regressed to `=== QUOTABLE_TYPE` left all 32 specs across the two files green
— while, against the deployed worker, silencing every refusal either route can explain. On the write
side that is `Could not store this config`, the one body on `POST /configs` that names a cause
rather than restating its own status, and the whole subject of CLI-855.

`fetch-seed.ts` had the identical gap, not a related one: same expression, same constant, same
absent charset in its fixtures.

### 3. A docblock claimed a comparison the specs did not make

`restatesItsOwnStatus` is documented as comparing "against the trimmed body". Every body in
`publish-seed.test.ts` was already flush against its reason phrase, so moving the call from the
trimmed `said` to the raw `body` left all 17 specs green. A restatement written with a trailing
newline — what anything echoing a line really sends — would then be quoted onto the terminal beside
the status line that had already said it.

### 4. Two of three sanitisation points in a ~16-call-site renderer were unpinned

`formatZodIssue` sanitises the joined path, the `unrecognized_keys` key list, and `issue.message`.
Only the path was covered, incidentally, by `read-piped-payload.test.ts`. Removing
`stripTerminalControls` from **both** other points left **6778 tests across 190 files** — the entire
`unit` project — passing.

And the message is sanitised at **two** call sites, not one:

```ts
return path
  ? `${path}: ${stripTerminalControls(issue.message)}`
  : stripTerminalControls(issue.message);
```

The branch is chosen by the path, so an issue carrying one cannot reach the other. A single spec
pins whichever branch its own fixture selects and leaves the other bare — which is why the pinning
below feeds one hostile message under a path and one at the root.

## Fix Applied

Seven mutants, each built, compiled into `dist/` and watched red against the new assertions:

| Mutant                                             | Caught by                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `publish-seed.ts` `.startsWith` → `===`            | `quotes it when the type arrives with the charset the worker really sends` |
| `fetch-seed.ts` `.startsWith` → `===`              | the same spec on the read side                                             |
| `restatesItsOwnStatus(said, …)` → `(body, …)`      | `keeps one restating around whitespace to its status too`                  |
| `issue.keys` sanitisation removed                  | `names it without the terminal escapes the document put in it`             |
| `issue.message` sanitisation removed, path branch  | `renders it under its path without the escapes inside it`                  |
| `issue.message` sanitisation removed, root branch  | `does the same where there is no path to render it under`                  |
| `search.ts` leaks an escape and no carriage return | `expect(rawStdout).not.toContain(ESCAPE)`                                  |

`runCliCommand` gained `rawStdout` — `stdoutBuf.join("")`, unstripped — carrying the reason in a
comment at the return, so the next author reading `stdout` knows it has been normalised.
`stdout`/`stderr` stay stripped, deliberately: a spec asserting on WORDS should not have to know
whether the run had colour, which is why the strip is the default and the raw reading is the
exception rather than the reverse.

Each refusal is pinned beside a permitted case in the same file, per `packages/cli/CLAUDE.md` — a
sanitiser held only against hostile input cannot be told from one that strips everything, and a
validation message that lost the key it was naming would have stopped being a validation message.

## Proposed Standard

**1. A negative assertion about a character class must be read off a value the harness has not
normalised.** Where a helper strips, sanitises, trims or decodes on the way out, an assertion
negating exactly what it removed is unfailable, and nothing static reports it: it type-checks,
lints, and passes. Census for this package — every negation of an escape or control constant:

```
grep -rn 'not\.toContain(ESCAPE)\|not\.toContain(CARRIAGE_RETURN)\|not\.toContain(ERASE_LINE)' src e2e --include='*.ts' --include='*.tsx'
```

Run over `packages/cli` this returns sites in `matrix-resolver.test.ts`, `errors.test.ts`,
`read-piped-payload.test.ts` and `search.test.ts`. Only the last read through `runCliCommand`; the
others assert on pure-function output and are sound. So the class had exactly one instance — but
the same helper still strips `stderr` and `error.message` with no raw reading beside them, so the
next spec to negate an escape on either reopens it silently.

**2. A test double must match the production emitter in any field the code under test
discriminates on.** A double is a claim about the real thing. Where a gate reads a header, a
prefix, a status or a content type, the fixture answering it is only evidence if it answers as the
deployed service does — and a library default (`HttpResponse.text`'s bare `text/plain`) is not
that. The tell is a fixture whose value was never written down by anyone: nobody chose bare
`text/plain`, it arrived.

**3. Where a docblock names the FORM of a comparison — trimmed, case-insensitive, prefix rather
than equality — a spec exists whose fixture differs from the naive form only in that.** Otherwise
the sentence is a description of the code rather than a constraint on it. A prefix gate needs a
fixture with a suffix; a trimmed comparison needs a padded body; a case-insensitive one needs a
re-cased string. All three cost one handler.

**4. Count sanitisation CALL SITES, not conceptual points.** `formatZodIssue` renders three things
at four call sites, and a branch reachable only by an empty path is not reachable by any spec
carrying one. Where a value is sanitised inside a ternary, both arms are separate work.

## Residual

Two things this lane did not own and did not touch.

`packages/api-mocks/src/handlers.ts` answers every plain-text refusal through `HttpResponse.text`
with no explicit content type — `configRefusedHandlerFor`, `readConfig`'s integrity and not-found
arms, and `missingConfigHandlerFor`. Each is a bare `text/plain` where the worker sends
`text/plain; charset=UTF-8`, so that package currently describes a worker that does not exist in the
one field two CLI gates read. The exact change, at each `HttpResponse.text(...)` call in that file:

```ts
HttpResponse.text(BODY, { status, headers: { "content-type": "text/plain; charset=UTF-8" } });
```

It is a one-field change with a real blast radius — `apps/editor`'s suite resolves the same
handlers — which is why it is written here rather than made. Until it lands, the two CLI suites
carry their own `HONO_TEXT_PLAIN` fixture and the charset claim is pinned only there.

`cli-runner`'s `stderr` and `error.message` are stripped exactly as `stdout` was. No spec negates an
escape on either today, so there is nothing broken to fix and a raw reading for each would be
capability nobody asked for. It is recorded because the comment now on `rawStdout` explains the trap
for `stdout` alone, and the trap is the helper's, not that field's.
