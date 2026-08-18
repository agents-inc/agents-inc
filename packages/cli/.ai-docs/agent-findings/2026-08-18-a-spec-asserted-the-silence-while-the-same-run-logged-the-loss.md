---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/catalog-first.spec.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed. The one path was fixed on 2026-08-18 while closing EDITOR-45's last half — the
  own-config restore door now names every dropped id through the same `droppedNotice` the
  shared-link door uses, and the assertion that pinned the silence was replaced by one that reads
  the sentence. Pending is the rule. Nothing stops the next negative assertion from freezing the
  next silent loss, and nothing connects a `reportIssue` about lost work to the obligation to say so
  on screen. Both proposals below are unwritten.
---

## What Was Wrong

`apps/editor/e2e/specs/catalog-first.spec.ts` → "finishes the parked restore when the field is
cleared for the public catalogue" ended with:

<!-- Deliberately an untagged fence: this is apps/editor source, which is semicolon-free, and a
     `ts` tag would have Prettier reformat the quotation under packages/cli's own config. -->

```
await expect(configure.importNotice).toBeHidden()
```

That is an assertion that the screen says nothing. It was taken over the exact path EDITOR-45 was
filed about: a visitor whose saved marketplace will not load resolves the parked restore by clearing
the marketplace field, the public catalogue becomes the one their configuration is read against, and
every `acme-` id in it is pruned. The test's own `beforeEach` selects such a skill and confirms it
reached storage. So the assertion pinned "an afternoon of configuration disappears with nothing on
screen" as the correct behaviour, in the suite whose whole subject is that catalogue drift must be
survivable out loud.

**The evidence was already in the same test's output.** The run below is the unmodified suite,
before any change of mine — the WebServer line and the passing test that produced it, adjacent:

```
[WebServer] [vite] (client) [console.warn] [issue] Pruned saved ids the catalog no longer knows {"droppedIds":6}
  ✓   2 [chromium] › catalog-first.spec.ts:202:3 › a saved marketplace that no longer loads ›
        finishes the parked restore when the field is cleared for the public catalogue (3.9s)
```

Six ids reported lost, by the application, on the console, in the CI log, one line above the green
tick on the test asserting that nothing needed saying. Two channels describing the same moment and
disagreeing, with nothing arranged to notice.

**Why it held.** `config-store.ts` describes the loss thoroughly — to Sentry. `reportPruning` counts
the dropped ids, distinguishes a dropped stack, and carries a careful comment about not leaking the
user's own data into the issue. Nothing crossed back to the screen. Observability had been made to
carry the whole weight of "this was noticed", and it reads like diligence: the code plainly _knows_.
What it knows never reaches the person it happened to.

The comparison that makes it a defect rather than a judgement call is inside the same feature.
`seed.ts` → `unknownPayloadIds` and `use-catalog-first.ts` → `droppedNotice` have named every id a
shared link lost since EDITOR-16, in a sentence written to be read by a person — _"Not in the public
catalogue, so not applied: acme-web-widgets."_ One loss, two doors. One door told the visitor, the
other told Sentry, and the second door's silence was held in place by a passing test.

## Fix Applied

The path, not the class.

- `config-store.ts` gained `unknownSavedIds(before, after)` beside its existing `countIds` /
  `droppedAnything` / `reportPruning` family, and `merge` — the only place the saved blob and the
  configuration it pruned to both exist — records what it dropped. `readSavedConfig` answers with
  it, so the opening can say what the read cost. The report travels beside the store rather than
  through it, because every route out of the store is a `set`, persist wraps `set`, and mentioning
  the prune through state would have written the pruned configuration into the slot as the price of
  mentioning it.
- `use-catalog-first.ts` says it in the shared-link door's words: the same `droppedNotice`, composed
  through the same `sentences(...)`, on the parked resolution and on the ordinary read alike.
- The assertion changed from `toBeHidden()` to reading the line — one test now requires the notice
  to have stopped naming the marketplace, and a new one requires it to name `acme-web-widgets`.

Mutation-proved: making the notice report `1 id(s)` instead of the name leaves the notice on screen
and turns the tests red on `Expected substring: "acme-web-widgets" / Received string: "Not in the
public catalogue, so not applied: 1 id(s)."` — which is the distinction the old assertion could not
have drawn at all.

**Not fixed: the class.** Both mechanisms below are still available to the next change.

## Proposed Standard

**1. A `reportIssue` about the user's own work is not a substitute for telling them.**

The rule is one sentence and the repository already believes it — `use-catalog-first.ts` says so in
prose about the other door ("a name a reader can go and look up is the difference between a warning
and a fact"), and EDITOR-30's "a failed restore is silent" was overturned on exactly this ground.
What is missing is the general form:

> Where the app reports a loss of the user's own work to observability, the same event must have a
> user-facing statement — or a comment at the `reportIssue` call site saying why this one does not.
> An issue filed to a dashboard the user cannot see is a record that we noticed, not that we said.

This belongs in `standards/documentation-bible.md` beside the existing observability guidance. The
`reportIssue` call sites are few and hand-written, so the comment-or-statement requirement is
checkable by reading, and the exceptions are real: `migrateConfig`'s version discard genuinely has
nowhere on screen to land at the moment it happens.

**2. A negative assertion about user-facing output is a claim, and it needs a reason.**

`toBeHidden()` on a notice is the assertion "nothing happened worth saying". That is a substantive
product claim, and it is the one shape of assertion that gets _stronger_ as the app loses more
behaviour — the emptier the screen, the greener the test. Every other assertion in this suite fails
when the app does less.

> An assertion that a user-facing surface is empty must carry a comment naming what would otherwise
> have been there and why it should not be. Where the same path emits a `reportIssue`, the two must
> be reconciled before the assertion is written: one of them is wrong.

**3. A cheap enforcement, and the suite is already 90% of the way to it.**

Playwright is already piping the app's `[issue]` console warnings into the run output through
`webServer.stderr: "pipe"` — that is how the line quoted above reached the log. Nothing reads them.
A fixture that collects `console` events matching `[issue]` and fails a test that emitted one it did
not declare would have turned this finding into a red build the day the behaviour landed, and would
have caught it without anyone thinking to look. The opt-in shape matters: an `expectsIssue(...)`
escape hatch, so the specs that deliberately provoke a discard (`persistence.spec.ts` and the
unreadable-catalogue cases) declare it rather than being exempted wholesale.

This is the same argument the sibling finding
`2026-08-18-an-editor-e2e-test-reached-live-github-and-asserted-a-third-partys-file-size.md` makes
for network access, in the same fixtures file, about the same suite: a guarantee worth having is one
that holds where nobody thought to ask. Both want `e2e/fixtures.ts` to stop being a single
`configure` fixture with no defaults, and they should probably be done together.
