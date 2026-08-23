---
type: audit
severity: low
affected_files:
  - .ai-docs/agent-findings/2026-08-21-a-spec-hand-rolled-a-reader-that-already-existed.md
  - .ai-docs/agent-findings/INDEX.md
  - src/cli/lib/__tests__/helpers/generated-types.ts
  - src/cli/lib/__tests__/helpers/generated-types.test.ts
  - src/cli/lib/configuration/config-types-writer.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  The reader's boundary is now stated in its docblock and pinned by a test that reddens only when
  the reader is taught to span braces. The false divergence claim is deleted from the finding that
  carried it and from its INDEX row. What is NOT closed is the class: a finding's recorded
  MECHANISM is prose, and nothing runs it.
---

## What Was Wrong

`2026-08-21-a-spec-hand-rolled-a-reader-that-already-existed` is right about the duplication and
right about the fix. Its recorded MECHANISM is wrong, in a way that matters because it is the half a
reader would act on:

> The propagation spec's copy differed from the shared one in exactly one respect (`[^;]+` where the
> helper uses `[\s\S]*?`), and that difference is invisible until a union body contains a semicolon.

Both halves fail against the source. `[^;]+` cannot cross a `;` and `[\s\S]*?;` is lazy, so **both
stop at the first `;`** — they are equivalent on membership and differ only in leading whitespace,
which the hand-rolled copy trimmed with `\s*`. Run over the same three sources:

```
export type A = "x" | "y";       shared: ' "x" | "y"'          hand-rolled: '"x" | "y"'
export type A =\n  | "x"\n  | "y";  shared: '\n  | "x"\n  | "y"'  hand-rolled: '| "x"\n  | "y"'
export type SkillAssignment = SkillId | { id: SkillId; preloaded: boolean };
                                 shared: ' SkillId | { id: SkillId'
                                 hand-rolled: 'SkillId | { id: SkillId'
```

The third line is the second failure: a union body containing a semicolon does not distinguish the
two copies, it **truncates both identically**. So the one scenario the finding named as the
divergence's consequence is the one scenario in which the shared reader is no better than the copy.

That scenario is not hypothetical. `generateStackAgentConfig` in
`src/cli/lib/configuration/config-types-writer.ts` emits `export type StackAgentConfig = {` followed
by one `"<category>"?: SkillAssignment<…>;` line per category, so a generated `config-types.ts`
carries an alias whose body holds semicolons, and `readGeneratedUnion(types, "StackAgentConfig")`
answers its first property. Every alias the readers are pointed at today is a flat string union
(`SkillId`, `Category`, `Domain`, `AgentName`, `SelectedAgentName`, `ProjectAgentName`), so nothing
is broken — the boundary is latent, and it was undocumented, which is the state that invites copy
number three from the next author whose alias comes back cut in half.

## Why Nothing Caught It

Nothing reads a finding. `scripts/check-findings-frontmatter.ts` proves the YAML parses and reports
duplicate `(affected_files, root_cause, date)` tuples; the body is prose. A mechanism sentence is
exactly the part a later reader trusts most and the part with the least behind it — and this one was
written the same day, by the pass that fixed the defect, about code it had just read.

The helper's own suite could not catch it either, because it did not ask. Its fixtures were three
flat unions, all of them the shapes the reader handles; no case named a body the reader cannot span,
so "stops at the first `;`" was true of the implementation and stated nowhere.

## Fix Applied

- `readGeneratedUnion`'s docblock states the boundary — an alias ends at the first `;`, which is the
  end of a flat union and the end of one PROPERTY of an object body — and names `StackAgentConfig`
  as the emitted alias that hits it.
- `generated-types.test.ts` pins it: an object-body fixture and a `toBe` against a named constant,
  with the assertion message saying it is a boundary rather than a contract, and that teaching the
  reader to span braces is what retires the pin. Mutation-checked both ways — a brace-aware regex
  reddens that test and only that test; the ten around it stay green.
- The false divergence sentence is deleted from the finding that carried it and from its INDEX row,
  each replaced by a pointer here. Deleting beat rewriting: the claim's value was the mechanism, and
  the mechanism was the wrong half.

Not fixed: the second hand-rolled copy the earlier finding names, in
`e2e/lifecycle/config-scope-integrity.e2e.test.ts`, which is owned by another lane this wave.

## Proposed Standard

Where a shared test helper answers a question about a GENERATED artefact, its docblock states the
shapes of that artefact it does not handle, and its suite carries one fixture per stated boundary.
The rule the helper already satisfies (`clean-code-standards.md` 6.18 — a reusable extractor lives in
`__tests__/helpers/` WITH its own tests) is satisfied by a suite that only exercises the shapes the
author had in mind, and that is the suite that leaves the next author with no way to tell an
unsupported shape from a bug.

This is a narrowing of 6.18 rather than a new rule, and it belongs in that rule's paragraph. It is
cheap where it applies: the artefact's writer is in the tree, so the shapes it emits are readable
rather than guessable — `config-types-writer.ts` emits exactly two kinds of alias, and one of them
is the boundary.
