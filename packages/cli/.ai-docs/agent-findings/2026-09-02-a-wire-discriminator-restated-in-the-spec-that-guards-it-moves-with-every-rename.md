---
type: anti-pattern
severity: high
affected_files:
  - apps/server/src/compose.test.ts
  - apps/editor/src/lib/api/compose.test.ts
  - apps/server/src/compose.ts
  - apps/editor/src/lib/api/compose.ts
  - packages/api-mocks/src/fixtures.ts
  - packages/api-mocks/src/handlers.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-02
reporting_agent: web-tester
category: testing
domain: api
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  apps/server/src/compose.test.ts now asserts the length refusal against
  COMPOSE_TOO_LONG_BODY from @workspace/api-mocks/fixtures instead of restating the
  literal, which is the link UNAUTHORIZED_BODY already gave the 401 in the same file.
  apps/editor/src/lib/api/compose.test.ts names the same fixture in a guard over
  composeTooLongHandler, so the editor's spec is pinned to the definition rather than
  to whatever the double happens to carry. Three mutants were built and each was
  watched red against the new assertion before restoration; the census command
  `grep -rn '"too long"' apps/server/src apps/editor/src packages/api-mocks/src` now
  returns three sites — producer, fixture, consumer — and no spec.
---

## What Was Wrong

**A value that two processes must agree on was written out as a literal in the spec that guards
it, so the rename that breaks production touches the producer and its own assertion together and
every suite stays green.**

`POST /compose` spends ONE 400 on TWO guards — an empty sentence and one past its cap — and names
which in the BODY. The editor therefore reads the body rather than the status
(`refusalFor`, apps/editor/src/lib/api/compose.ts), comparing against its own copy of the bytes.
That one string existed in four places:

```
grep -rn '"too long"' apps/server/src apps/editor/src packages/api-mocks/src
```

the worker's literal (`compose.ts`), the fixture (`COMPOSE_TOO_LONG_BODY`), the editor's
production constant (`TOO_LONG`), and — the one that mattered — a restatement inside
`apps/server/src/compose.test.ts`, the very spec whose job was to hold the worker to it.

**The restatement is what made the other three unfalsifiable.** A rename is not an edit to one
line; it is an edit to a line and the assertion beside it, because that is the shape in which a
red test is made green. Renaming the worker's discriminator together with its own assertion was
measured to leave the server suite (10), the editor suite (9) and `packages/api-mocks` (27) all
passing, while the shipped editor reverts to "The model did not answer. Nothing changed." for an
over-long sentence — a sentence that is not merely unhelpful but false, since both guards run
before the model is called — and pages `reportIssue` for a request that cost nothing. That is
precisely the defect EDITOR-69 was filed to fix, reachable again with every gate green.

**The boundary against the correct opposite rule is the part nobody could have read off the
file.** Three lines above the defective assertion sits a comment stating, correctly, that
`PAST_THE_CAP` is "written out rather than imported. A test that reads the very constant the
guard compares against cannot fail when that constant moves, because both halves move together."
That is right — and it argues, to any reader, against the fix. The distinction it does not draw:

- **A constant ONE side owns** (the 600-character cap) is written out. Importing it makes the
  assertion tautological, because there is no second party whose copy could disagree.
- **A value BOTH sides must agree on** (a wire discriminator) gets ONE definition that both
  specs import. Writing it out makes the assertion tautological in the same way, for the
  opposite reason: the copy under test and the copy asserted are the same edit.

Two rules with the same surface — "do not import what you assert" — and opposite answers, decided
entirely by whether a second process holds a copy. Nothing stated the second half, and the file
carrying the first half is the file where the second was needed.

**Nothing mechanical reaches any of it.** A renamed literal and its renamed assertion type-check,
lint, and pass. `verbatimModuleSyntax`, `installableSeedPayloadSchema` and the generated
`hc<AppType>` client all see `error: z.string()` — the schema declares the FIELD, never the
value, so the discriminator is invisible to every type in the system by construction.

## Fix Applied

Both specs now name one definition, and each was watched red first.

**Mutant A — the proven failure.** Renamed the discriminator in `apps/server/src/compose.ts` and
its assertion in `compose.test.ts` together. Server 10 passed, editor 9 passed, api-mocks 27
passed. With `toStrictEqual(COMPOSE_TOO_LONG_BODY)` in place instead of the literal:

```
AssertionError: expected { error: 'over the cap' } to strictly equal { error: 'too long' }
```

**Mutant B — the propagation.** The new assertion forces the fixture to move too. With the
fixture renamed as well, the server suite returns to green and the EDITOR's spec reddens, because
the editor's production `TOO_LONG` is now the only copy left behind:

```
AssertionError: expected { ok: false, refusal: 'refused' } to strictly equal
                { ok: false, refusal: 'too-long' }
```

That is the chain doing its job: the rename cannot land without an edit to
`apps/editor/src/lib/api/compose.ts`, which is where the shipped bug lives and the one copy no
spec may import, `@workspace/api-mocks` being a test dependency.

**Mutant C — the residual hole, and why the editor needed its own line.** The editor's link ran
through `composeTooLongHandler`, so it was a link to the DOUBLE rather than to the definition. A
double rewritten to carry a literal (`HttpResponse.json({ error: "too long" }, ...)`) leaves the
fixture free to move with the worker while the editor's spec keeps agreeing with the editor about
a string the worker no longer sends — all three suites green again, production broken again.
`apps/editor/src/lib/api/compose.test.ts` now guards the double against the fixture before
standing on it, the same self-check `handlers.test.ts` makes on `OUT_OF_SCOPE_PAYLOAD`:

```
AssertionError: the double must still carry the worker's own discriminator:
  expected { error: 'too long' } to strictly equal { error: 'over the cap' }
```

All four mutated production files were restored and verified byte-identical by checksum.

**Census, over the three workspaces, with its command.** The editor reads exactly one response
body as a discriminator — `grep -rn 'data\.error\|body\.error\|\.error ===' apps/editor/src`
returns `compose.ts:86` and nothing else; every other refusal path keys on `response.status`,
which is not a copyable literal. After the fix,
`grep -rn 'toEqual({ *error:\|toStrictEqual({ *error:' apps/server/src apps/editor/src
apps/editor/e2e packages/api-mocks/src` returns one site: `{ error: "empty" }`, the sibling 400 on
the same route. **It is deliberately not the same shape and was left alone** — no client reads it
(`refusalFor` answers `refused` for any 400 that is not the length body), `packages/api-mocks`
models it as a BODILESS 400 on purpose so the editor's degrade path has something to fall back
on, and there is no second copy for it to disagree with. So the population of this defect in
these three workspaces was one, and it is closed.

One adjacent case is named and not touched: `/compose` answers 502 with two different bodies
(`"unparseable"` and `"the model did not answer"`, apps/server/src/compose.ts:185 and :195), of
which the fixture states one and nothing branches on either. It is the same one-status-two-bodies
SHAPE that produced EDITOR-69, so it is where this class recurs the moment a client starts
telling those two apart — but today nothing reads them, so there is no defect to fix and no
assertion pinning one.

## Proposed Standard

For `.ai-docs/standards/editor-and-worker.md`, beside the existing refused-body rules, and it
needs both halves or it inverts:

**A value that crosses a process boundary AND is branched on by the receiver has exactly one
definition, and every spec on either side asserts against that definition rather than restating
it.** In this repository that definition lives in `packages/api-mocks/src/fixtures.ts`, which is
already the shared statement of what the worker says and is importable by any spec in any
workspace. `UNAUTHORIZED_BODY` is the worked example: it is asserted by name in
`apps/server/src/compose.test.ts` and in `packages/api-mocks/src/answer.test.ts`, which is why
the 401 was never exposed to this defect while the 400 beside it was.

**The complement, which must be written down with it: a constant only ONE side owns is written
out in the spec, never imported.** A cap, a limit, a timeout, a version — importing these makes
the assertion move with the code it is meant to hold. `PAST_THE_CAP` in
`apps/server/src/compose.test.ts` is the worked example on that side.

**The discriminator between the two rules is not "is it a constant" but "does a second process
hold a copy it must agree with".** Stating either rule alone is worse than stating neither: this
finding exists because the second rule was documented three lines from the defect and reads as an
argument against the first.

Two mechanical checks are proposed, both cheap and neither currently run:

1. **A response body literal may not appear in a spec.** `grep -rn 'toEqual({ *error:\|toStrictEqual({ *error:' apps/server/src apps/editor/src packages/api-mocks/src`
   should return only bodies with no second reader; today it returns one, `{ error: "empty" }`,
   which is why the check wants an allowlist rather than a zero.
2. **A discriminator's copies are countable.** For each `*_BODY` fixture,
   `grep -rn '"<value>"' apps/server/src apps/editor/src packages/api-mocks/src` should return
   the producer, the fixture, and the consumers that branch on it — and no spec. For
   `"too long"` that is now three sites, and a fourth means somebody restated it.

**Cross-checked against CLAUDE.md and it conflicts with nothing.** The root `CLAUDE.md` rule that
a brief carries the command rather than its result is why both checks above are written as
invocations. `packages/cli/CLAUDE.md`'s "ALWAYS use `toStrictEqual` (not `toEqual`) for object and
array comparisons" is what the new assertions use; the pre-existing `toEqual` sites in the same
file were left, being outside this change's subject. Its rule against encoding a known gap in an
assertion's arity or absence is the same instinct one level up — a full `toStrictEqual` against a
named constant is what it asks for, and a named constant shared across the boundary is what this
adds to it.
