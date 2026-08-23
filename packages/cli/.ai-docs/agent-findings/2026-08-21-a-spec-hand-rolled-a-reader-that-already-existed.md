---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts
  - e2e/lifecycle/config-scope-integrity.e2e.test.ts
  - src/cli/lib/__tests__/helpers/generated-types.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: partial
partial_note: "The propagation spec's copy is gone — it now calls readGeneratedUnionMembers, which was added to src/cli/lib/__tests__/helpers/generated-types.ts with five tests of its own. config-scope-integrity.e2e.test.ts still carries a second copy of the same regex, in a file another lane owns."
---

## What Was Wrong

`readGeneratedUnion` has lived in `src/cli/lib/__tests__/helpers/generated-types.ts` since
2026-08-06. It takes a generated `config-types.ts` and an alias name and returns that alias's
declared body, and six E2E specs plus two unit specs call it.

Two other specs wrote the same regex again, inline, in their own file:

- `global-agent-propagation-type-consistency.e2e.test.ts` declared
  `parseSelectedAgentNameUnion`, which matched `export type SelectedAgentName\s*=\s*([^;]+);`
  and then re-scanned the captured body for quoted names.
- `config-scope-integrity.e2e.test.ts` matches `export type Domain\s*=\s*([\s\S]*?);` inline and
  reads group 1 through a `!` non-null assertion, two lines after asserting the match is not null.

Both are the construct CLAUDE.md bans outright under Test Assertions — a local parser with
non-trivial logic, which would need its own tests to be trusted and has none. What makes the pair
worth a finding rather than two fixes is that **the rule was followed and the duplication happened
anyway**. The banned form has one sanctioned escape ("live it in
`src/cli/lib/__tests__/helpers/` WITH its own tests") and the escape had already been taken; nothing
in the rule, in `e2e/README.md`, or at the point of writing a spec says a reader for this exact
artefact is already there. The author of a second copy is not breaking a rule they can see.

## Why Nothing Caught It

Nothing can. A hand-rolled copy of a shared helper is green by construction — it is written against
the same file format the original reads, so it agrees with the original for every input either was
tried on, and it diverges only in the cases neither was tested against. This finding named a
divergence between the two regexes and it does not exist; the correction, and the shared boundary
both copies really have, are in
`2026-08-21-the-hand-rolled-reader-and-the-shared-one-stopped-at-the-same-semicolon.md`.

`no-restricted-syntax` cannot express it: the offending thing is not a syntax shape but a
duplicated concept, and both copies are ordinary `String.prototype.match` calls.

## Proposed Standard

A generated `config-types.ts` alias has exactly one reader, and a test file must not build a second
one. That is mechanically checkable at high precision, because the artefact's own text is the tell:
a regex literal in a spec file containing `export type` **and a capture group** is a spec extracting
an alias body rather than asserting on one.

Measured across `src/` and `e2e/` on 2026-08-21, that selector reports one file —
`config-scope-integrity.e2e.test.ts` — and leaves alone all three
`toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/)` assertions in
`project-tracking-propagation.e2e.test.ts`, which assert on raw text and are the rule's other
sanctioned option. The capture group is what separates the two: an assertion matches, an extractor
captures.

The remaining copy's fix is one line — `readGeneratedUnion(configTypesContent, "Domain")` in place
of the match, which also retires the `!` non-null assertion beside it, since the helper's
`undefined` return is the same information without the assertion.
