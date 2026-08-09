---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/matrix/matrix-resolver.ts
  - src/cli/types/matrix.ts
  - src/cli/lib/seed/seed-to-wizard.ts
  - src/cli/lib/matrix/skill-resolution.integration.test.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`SelectionValidation` (`src/cli/types/matrix.ts`) declares two fields:

```ts
export type SelectionValidation = {
  valid: boolean;
  errors: ValidationError[];
};
```

`validateSelection` — the only producer — ends with `return { valid: true, errors }`. The literal
`true` is unconditional: it does not consult `errors`, and there is no branch anywhere in the
function that can produce `false`. The field's declared type says `boolean` and its inhabited type
is `true`.

Nothing in production reads it. Every consumer asks `errors` instead, which is why the lie has cost
nothing so far — the reporting shared by `init` and `edit` iterates `validation.errors` and would
be correct however `valid` were set. The exposure is entirely forward-looking: a `boolean` field
named `valid` on a type named `SelectionValidation` reads as the summary flag it is not, and the
first `if (result.validation.valid)` written against it will pass on every rejected selection there
is.

Two specs already assert the untruth in place:

- `skill-resolution.integration.test.ts` asserts `expect(validation.valid).toBe(true)` on the line
  ABOVE `expect(firstElement(validation.errors).type).toBe("missingRequirement")`.
- The same file does it again beside an assertion that the first error is a `conflict`.

Both assertions are vacuous — they cannot fail — and they read as documentation that a selection
with a conflict is nonetheless valid, which is the opposite of what the surrounding test is
demonstrating.

A second copy of the same literal sits in `seed-to-wizard.ts`, where the decode returns
`validation: { valid: true, errors: [] }` for a shared configuration. There the `true` is at least
coherent with the empty `errors` beside it, but it inherits the same ambiguity: a reader cannot
tell whether it means "checked and clean" or "not checked".

## Fix Applied

None — discovery only. Fixing it is a two-line change with a blast radius that has to be measured
first: `valid` is on an exported type, the two vacuous assertions have to be corrected rather than
deleted (they are asserting SOMETHING about the shape), and the `seed-to-wizard.ts` literal has to
be decided alongside the open question in
`2026-08-07-a-user-facing-report-both-commands-owe-lived-private-on-one-of-them.md` about whether
`init --from` should validate at all. Doing it inside a behaviour fix would have meant changing a
type contract while claiming to change only a report.

The two candidate shapes, for whoever picks it up:

1. **Derive it.** `valid: errors.length === 0` in `validateSelection`. Cheapest, keeps the field,
   and makes the two specs assert `false` — which is what they were always demonstrating.
2. **Delete it.** `errors` alone already carries the whole answer, and every consumer already reads
   it that way. This is the shape the codebase behaves as if it had.

Option 2 is the better fit for a pre-1.0 codebase with a no-backward-compat rule, but it is a
public type change and belongs in its own pass.

## Proposed Standard

Add to `.ai-docs/standards/typescript-types-bible.md`, in the section on modelling result types:

> **A boolean on a result type must be computed from that result, never asserted.** A field like
> `valid`, `ok` or `success` that is returned as a literal by every producer is not a summary — it
> is a comment with a type annotation, and it will be read as a guard. Either derive it from the
> data beside it (`valid: errors.length === 0`) or leave it out and let the data answer. A
> discriminated union is the third option when the two states genuinely carry different fields.

And the matching test rule, for `.ai-docs/standards/e2e/assertions.md` or the unit-test equivalent:

> **An assertion that cannot fail is not coverage.** `expect(x.valid).toBe(true)` beside
> `expect(x.errors[0].type).toBe("conflict")` documents a contradiction and proves nothing. If a
> field is constant by construction, assert the constant ONCE at the producer's own spec and drop
> it from every consumer's.
