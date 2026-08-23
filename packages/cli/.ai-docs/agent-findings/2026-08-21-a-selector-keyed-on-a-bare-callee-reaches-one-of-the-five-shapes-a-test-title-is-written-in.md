---
type: standard-gap
severity: medium
affected_files:
  - eslint.config.js
  - src/cli/lib/__tests__/spec-filenames.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The title half is now gated, in `spec-filenames.test.ts`, across all five callee shapes and all
  four tracker prefixes — green today over every spec the package holds. What has not moved is
  `eslint.config.js` itself, which this lane did not own: its three selectors still key on
  `[callee.name=...]` and still omit the `SKILLS-` prefix, the hyphenless run and the lowercase
  form, so the ASSERTION-MESSAGE half of the same ban is still reachable only in its bare
  `expect(x, "...")` form. The exact four-line replacement is in "Proposed Standard" below.
---

## What Was Wrong

`2026-08-21-the-task-id-ban-holds-at-its-two-enforceable-locations-and-nowhere-else` split the
three-member ban into a reachable half and an unreachable one, and its central sentence is this:

> of the three locations the rule enumerates, **two are selector-reachable and one is exactly as
> unreachable as the filename**

The two are selector-reachable. They are not selector-REACHED. `eslint.config.js`'s three
selectors all key the call on `[callee.name=/^(describe|it|test)$/]`, and `callee.name` exists
only when the callee is a bare `Identifier`. Every modified form of the same call puts a
`MemberExpression` or a `CallExpression` there instead, so the property is `undefined` and the
selector does not fire.

Measured through `ESLint.lintText` against this package's real config on 2026-08-21, one planted
title per shape, `filePath` set to a spec that exists so the project service resolves it:

| Planted title                           | Existing rule |
| --------------------------------------- | ------------- |
| `it("D-227 …")`                         | CONDEMNED     |
| `describe("CLI-551 …")`                 | CONDEMNED     |
| ``it(`D-227 …`)``                       | CONDEMNED     |
| `expect(1, "D-227 …")`                  | CONDEMNED     |
| `it.skip("D-227 …")`                    | **escapes**   |
| `it.only("D-227 …")`                    | **escapes**   |
| `it.each([1])("p4-17 …")`               | **escapes**   |
| `describe.skipIf(false)("SKILLS-42 …")` | **escapes**   |
| ``it.each`a`(`cli-551 …`)``             | **escapes**   |

Three further gaps in the same `value` regex, independent of the callee:

- **`SKILLS-` is absent from its prefix list** (`(D|R|P\d*|CLI|REPO|WWW|ED|SRV)`), and
  `todo/skills.md` is one of the six trackers.
- **The hyphen is required** (`-\d+`), so `d227` — the exact spelling of the one filename this
  repository actually broke the ban with — is not a match.
- **It is case-sensitive**, so `cli-551` and `p4-17` pass.

`it.each` is not a hypothetical shape in this tree: 46 titles are written behind a second call,
and `describe.each` / `describe.skipIf` / `it.skip` are in daily use.

**Why this stayed invisible is the durable half.** The census that would reveal it reads exactly
like the census of a working gate. Zero titles carry a tracker-shaped run today — the sibling
finding measured it, and an AST-based recogniser over all five shapes agrees — so the rule looks
enforced from every angle a reader has: the config declares it, the lint run is green, and the
tree is clean. A selector that fires on nothing because there is nothing to fire on, and a
selector that fires on nothing because it cannot see the node, produce the same report.

## Fix Applied

The title half is gated, in `src/cli/lib/__tests__/spec-filenames.test.ts` — beside the filename
gate, because the two are the same ban read at two locations and a reader who finds one should
find the other.

One `it`, one in-process ESLint pass over every spec the package holds (~4s across 435 files),
under a config that REPLACES `eslint.config.js` rather than extending it: `no-restricted-syntax`
takes options and so does not merge across config blocks, and an override would silently drop the
config's own selectors. `noInlineConfig` is set, so an `eslint-disable` in a spec cannot switch it
off. The four callee shapes are matched by `callee.name`, `callee.object.name`,
`callee.callee.object.name` and `callee.tag.object.name`.

Red-then-green, planted in a real spec rather than argued: `describe.skip("CLI-593 …")` and
`it.each([1])("d227 …")` appended to `e2e/interactive/init-wizard-unreachable-source.e2e.test.ts`
were both reported by file and line, and both are shapes the existing rule lets through.

The three constraints the sibling finding measured were re-derived and **two of them turned out to
belong to the other gate**:

- **`{2,4}` holds, for its stated reason.** `{1,4}` condemns the `D-1` … `D-7` E2E phase labels
  CLI-574 rules need no rename.
- **The year exclusion holds, and is not load-bearing here.** `skills-2026` inside
  `"custom-skills-2026-08-06-investigation"` is a BODY line in
  `scripts/check-finding-citations.test.ts`, not a title. It is implemented anyway, with that
  string as its fixture, because a title quoting a plan slug is one edit away.
- **`NAMES_A_TASK` is not at risk from a title gate.** The sibling finding's constraint —
  "it would condemn `spec-filenames.test.ts` itself" — is a fact about the CONTENT-side gate:
  those eight lines are array members, not titles. The fixtures are composed from
  `TRACKER_ID_PREFIXES` regardless, because that is the right shape for the content gate when it
  lands and it costs nothing now.

## Proposed Standard

**One: widen the three selectors in `eslint.config.js`.** The four escaping shapes are one
`:matches(...)` away, and the prefix gaps are a regex edit. Not done here — the file belongs to
another lane this round — so the replacement is written out rather than described:

```
"CallExpression[callee.name=/^(?:describe|it|test)$/], " +
"CallExpression[callee.object.name=/^(?:describe|it|test)$/], " +
"CallExpression[callee.callee.object.name=/^(?:describe|it|test)$/], " +
"CallExpression[callee.tag.object.name=/^(?:describe|it|test)$/]"
```

as the `:matches(...)` head of each of the three, and
`/\b(?!(?:cli|d|p4|skills)-?(?:19|20)\d{2}\b)(?:cli|d|p4|skills)-?\d{2,4}\b/i` as the `value`
pattern. Doing so makes the vitest gate redundant for titles and leaves it correct; the ASSERTION
MESSAGE half has no second home and is the reason to do it at all.

**Two, and it generalises past this instance: an AST selector keyed on a bare `callee.name`
is a claim about one of several call shapes, and the claim has to be tested.** `[callee.name=X]`
reads as "calls to X" and means "calls to X written as a bare identifier". Everything a test
runner, a builder or a fluent API offers — `.skip`, `.only`, `.each`, `.mock`, a tagged template —
moves the name off that property. The rule belongs beside `clean-code-standards.md` § 6.18, which
already governs recognisers written into specs, and it is one sentence: **a `no-restricted-syntax`
selector lands with a planted fixture per shape it claims to reach, in the same change.** The
mechanism is already in this repository — `spec-gates.test.ts` runs in-process ESLint over real
zones for exactly this reason — so what is proposed is applying it to the selector's SHAPE
coverage as well as to its zone coverage.

**Three: correct the sibling finding's sentence rather than rewrite it.** "Two are
selector-reachable" is true and is read as "two are enforced". The word that carries the
difference is REACHABLE, and the evidence that they were not reached is the table above.
