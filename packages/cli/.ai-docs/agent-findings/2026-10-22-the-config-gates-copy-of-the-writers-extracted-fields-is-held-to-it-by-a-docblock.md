---
type: convention-drift
severity: low
affected_files:
  - packages/cli/src/cli/lib/config-gate/classify.ts
  - packages/compile/src/config-source.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: dry
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The proposed fix, both halves, by expressive-ts round 3 of the lane owning classify.ts.
  packages/compile/src/config-source.ts exports EXTRACTED_FIELDS, and classify.ts builds its
  extractedFields set from that import, with its private copy and docblock deleted; the census
  in the body now returns one declaration and one import.
---

## What Was Wrong

The writer's set of fields it pulls out into typed named variables (`skills`, `agents`, `stack`,
`selectedDomains`) is declared twice:

- `EXTRACTED_FIELDS` in `packages/compile/src/config-source.ts`, which decides what the writer
  extracts and, through `isCopiedScalarField`, which global scalars a project config inlines.
- A private `EXTRACTED_FIELDS` Set in `packages/cli/src/cli/lib/config-gate/classify.ts`, whose
  docblock says "The four fields the config writer extracts into typed named variables". It decides
  which keys `scalarKeys` treats as inlined scalars, and so which tier a global change gets.

The docblock is the only link. Nothing imports one list from the other, and no spec compares them.
Census, run 2026-10-22:

```
grep -rn 'EXTRACTED_FIELDS' packages/cli/src packages/compile/src --include='*.ts'
```

returned two declarations, one per package, with each package's uses beside its own copy.

Expressive-ts round 3 made the compile list `as const satisfies readonly (keyof ProjectConfig)[]`
and switched `standaloneExportField` to an exhaustive switch over it. Adding a fifth field there now
fails `tsc` in compile, which was checked with a type-level mutation. The CLI's copy does not take
part, so the same edit leaves `classify.ts` compiling on the old four.

Inference, not measured: if the two drift, a global scalar the writer inlines but the gate counts
as extracted would leave `scalarsChanged` empty for a real change. That would under-tier it, so
the registered projects' inlined copies would go stale.

## Fix Applied

None — discovery only. `classify.ts` belongs to another lane in this run. Exporting the constant
from compile with no importer would be an unused export, so neither half was made.

## Proposed Standard

The fix, both halves together: export `EXTRACTED_FIELDS` from
`packages/compile/src/config-source.ts`, and in `classify.ts` replace the private Set with
`new Set<string>(EXTRACTED_FIELDS)` imported from `@workspace/compile/config-source`. Delete the
docblock's restatement. `config-merger.ts` already imports `HAND_WRITTEN_FIELDS` and
`GLOBAL_IDENTITY_FIELDS` that way, so this follows an existing pattern rather than adding a new
one.

No new rule. This is the "a centralised rule declared a second time" case that `packages/cli/CLAUDE.md`
› Code Style already names for the stack comparator. Once the import lands, `tsc` checks it and no
other check is needed.
