---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/features/seed-contract.md
  - .ai-docs/reference/features/model-and-effort.md
  - .ai-docs/reference/types/zod-schemas.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-06
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Docs landed, standard pending. All three affected_files are corrected: seed-contract.md's module
  map is now two files plus the imported @workspace/matrix/seed module, the vendoring rule and the
  section on the deleted seed-schema-drift.test.ts are replaced by "One Schema, One Home" (importer
  table, the devDependency + tsup noExternal pair, verified dist inlining), and the "do not 'tidy'
  it into a package import" instruction is gone; model-and-effort.md and zod-schemas.md now source
  the seed enums to packages/matrix/src/seed.ts. Still pending: the Proposed Standard's
  grep-.ai-docs-before-deleting-a-module rule is in neither documentation-bible.md nor CLAUDE.md,
  and convention-keeper owns both.
---

## What Was Wrong

`src/cli/lib/seed/seed-schema.ts` was deleted when the seed contract moved to its single home in
`@workspace/matrix` (bundled into the CLI via tsup `noExternal`). The reference docs still describe
the removed architecture as current, and in one place instruct the reader to preserve it:

- `reference/features/seed-contract.md` lists `seed-schema.ts` in its module table as "The vendored
  wire contract", states "`seed-schema.ts` is a hand-maintained copy", carries a Mermaid node
  `seed-schema.ts / seedPayloadSchema`, and devotes a section to `seed-schema-drift.test.ts` — a
  test file that no longer exists, having been deleted as orphaned-by-design once there was only
  one copy to compare.
- The same doc tells a future reader the drift test's computed path "**is the statement of which
  file `seed-schema.ts` is a copy of** — do not 'tidy' it into a package import." Repointing those
  imports to `@workspace/matrix/seed` is exactly what shipped. The doc now argues against the
  landed design.
- `reference/features/model-and-effort.md` sources `SeedAgent` to `src/cli/lib/seed/seed-schema.ts`
  and describes enums living there; `reference/types/zod-schemas.md` excludes that path from its
  scope note.

This matters more than ordinary staleness because `CLAUDE.md` requires reading
`.ai-docs/DOCUMENTATION_MAP.md` and the indexed docs **before** working on an area. An agent
following that instruction is routed into a doc that names a deleted file as the source of truth
and forbids the import style the codebase now uses.

## Fix Applied

None — discovery only. This session's scope was test code in `packages/cli`; the three test-side
cascades (drift guard deleted, `seed-factories.ts` and `seed-schema.test.ts` repointed to
`@workspace/matrix/seed`) are done and all gates are green. The reference docs were left untouched
rather than edited out of scope.

## Proposed Standard

Deleting a module should carry the same "grep for the old value" discipline that `CLAUDE.md`
already mandates for renaming test data: **before removing a source file, grep `.ai-docs/` for its
basename and update or retire every hit in the same change.** A doc that names a deleted file is
not merely out of date — it is an instruction, and agents are told to follow it.

Add this as a bullet to `.ai-docs/standards/documentation-bible.md` alongside the existing
counts-live-in-one-document rule, and extend the `CLAUDE.md` "ALWAYS grep for the old value when
changing test data or renaming anything" line to say "…renaming or **deleting** anything, including
its references in `.ai-docs/`".
