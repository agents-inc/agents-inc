---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/config-generator.test.ts
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The two assertions that produced the finding are fixed and mutation-proved, and the
  `splitConfigByScope` invariant they cover is now pinned. What is pending is the census — the
  same shape is unexamined everywhere else, and the grep in "Proposed Standard" has not been
  triaged.
---

## What Was Wrong

CLAUDE.md already bans `?? {}` on data that must exist, in PRODUCT code, because a silent fallback
hides a bug. The same three characters inside an **assertion** are worse, and nothing named that
case: they do not hide the product's state from the product, they hide it from the only thing
looking.

`splitConfigByScope` (`src/cli/lib/configuration/config-generator.ts`) writes `stack` on both
partitions unconditionally, and its own doc comment says why that is load-bearing:

> A derivation that yielded nothing is a partition with no stack, and `{}` is how that is said …
> the merger reads an absent stack as no statement and keeps the stale one.

So the invariant has two halves: the partition's stack must be EMPTY, and it must be PRESENT.
Two specs covered it — `gives the global partition no stack when no global agent survives` and its
project-side mirror — and both were written:

```ts
expect(result.global.stack ?? {}, "...").toStrictEqual({});
```

The `?? {}` collapses `undefined` and `{}` into the same value before the matcher sees either, so
the assertion could only ever check the first half. The second half — the one the doc comment
calls the reason the code is shaped this way — was unpinned, in the two specs whose subject it is.

### Reproduction

Change the two literals in `splitConfigByScope` so an empty derivation writes no key:

```ts
stack: typedKeys<AgentName>(globalStack).length > 0 ? globalStack : undefined,
stack: typedKeys<AgentName>(projectStack).length > 0 ? projectStack : undefined,
```

then run the two specs. With `?? {}`:

```
 Test Files  1 passed (1)
      Tests  2 passed | 89 skipped (91)
```

Without it:

```
AssertionError: an empty stack says the derivation ran and yielded nothing; an absent one says
nothing at all, and the merger keeps the stale rows: expected undefined to strictly equal {}
```

Both runs are of the SAME mutated product. Only the fallback decides whether the suite notices.

**Note which mutation this is.** The obvious one — making the override conditional over the
unconditional `...config` spread — is caught by both forms, because the partition then inherits the
OTHER partition's rows and `{}` no longer matches. That is the 2026-08-17 finding's defect and it
is genuinely covered. The mutation the fallback hides is the narrower one: an explicit `undefined`,
which reads at the call site as "no stack", is exactly what the merger mistakes for "no statement",
and leaves both existing assertions green.

## Fix Applied

Both `?? {}` fallbacks removed, so `toStrictEqual({})` now distinguishes present-and-empty from
absent, and both assertion messages state the distinction rather than the membership. The two `it`
names changed from "no stack" to "an empty stack" — the old name described the state the assertion
could not tell apart from the one it wanted.

Not renamed or widened beyond that, and no new spec added: the invariant already had a home, and
what it lacked was an assertion that could fail.

## Proposed Standard

For CLAUDE.md → "Test Assertions", beside "NEVER encode a known gap in an assertion's ARITY, LENGTH
or ABSENCE", which is the nearest rule and does not reach this:

**NEVER put `??` or `?.` between the subject and the matcher.** A fallback inside `expect(...)`
normalises the subject before anything looks at it, so the assertion is about the normalised value
and not about the product's. Where the field is genuinely optional on the TYPE but the function
under test always writes it, that gap is precisely the thing worth pinning — the type permits the
regression and only the spec can refuse it.

The tell is that the fallback's value equals the expected value: `x ?? {}` compared against `{}`,
`xs ?? []` compared against `[]`, `n ?? 0` compared against `0`. That pairing can never fail on the
axis it was written for. Census — a sample was not taken, and the triage is what is pending:

```
grep -rn -E 'expect\([^)]*(\?\?|\?\.)' src e2e --include='*.ts' --include='*.tsx'
```

This does not conflict with the CLAUDE.md rule it extends: that one governs product code, is about
hiding a bug from a user, and says nothing about test files. It is also NOT the "broaden an
assertion to make a failing test pass" rule — nothing here was failing. The fallback was written
defensively against an optional TYPE, which is why it reads as harmless at the call site and why
review passes over it.
