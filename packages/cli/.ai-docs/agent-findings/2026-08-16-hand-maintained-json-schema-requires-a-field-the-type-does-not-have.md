---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/schemas/project-config.schema.json
  - packages/cli/src/cli/types/config.ts
  - packages/cli/src/cli/types/matrix.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-16
reporting_agent: Explore
category: typescript
domain: shared
root_cause: enforcement-gap
status: open
---

# A hand-maintained JSON Schema requires a field its TypeScript type does not have

## What was found

`src/schemas/project-config.schema.json` declares a property `installMode` and lists it in its
`required` array. `ProjectConfig` — the type the schema is supposed to describe — has no such field.

`InstallMode` is not a stored field at all. It is **derived at runtime** from `SkillConfig.source`:
`installModeOfSource()` in `stores/wizard-store.ts` returns `"eject"` when the value is
`EJECT_SOURCE` and `"plugin"` otherwise, and `types/matrix.ts` documents `InstallMode` in exactly
those terms.

So the schema requires a field that no writer emits, no reader consults, and no type declares.

## Why nothing caught it

The file's own `$comment` says it is **hand-maintained** and that no generator re-derives it. That
is the whole finding: every other artifact describing this shape is generated or type-checked
against the source of truth, and this one is a parallel description maintained by hand, so it can
drift silently and indefinitely.

Nothing in any gate compares it to `ProjectConfig`. `tsc` does not read it. The Zod schemas in
`lib/schemas.ts` are separate objects that happen to describe the same thing. There are now three
descriptions of one shape — the TypeScript type, the Zod schema, and this JSON Schema — and only
the first two are mechanically tied to anything.

## Why it matters beyond the stale key

The drift is currently harmless because nothing validates against this file at runtime. The risk is
that it looks authoritative. It is the artifact an external consumer or a future agent would read to
learn the config contract, and it currently teaches that `installMode` is a required field of a
project config. Anyone acting on that writes a config the CLI does not understand and cannot explain.

This was found during the CLI-463 rename audit, which is the relevant hazard: a rename pass that
consults this schema to enumerate fields would carry the phantom forward, and a rename pass that
edits it by hand can leave it inconsistent again with nothing to say so.

## What to do

Two options, and the choice is about whether this file should exist as a separate description:

1. **Generate it** from `ProjectConfig` / the Zod schema, the way the other schemas under
   `src/schemas/` relate to their sources, and put the generator in a gate. This removes the class
   of defect rather than this instance.
2. **Delete `installMode` and add the file to whatever gate can assert it** — at minimum a test that
   every `required` key exists on `ProjectConfig`. Cheaper, but leaves a hand-maintained parallel
   description that can drift on the next field change.

Option 1 is the honest fix; option 2 is the one that fits in the current pass. Either way the
`installMode` key goes, because it describes a field that has never existed on this type.

## Related

Sibling drifts found in the same audit, not yet filed:

- Tests populate `ProjectConfig.marketplace` with URLs (`https://marketplace.example.com`) when the
  field holds a marketplace **name** (`agents-inc`). They pass because the field is `z.string()`.
  This is the pattern
  [`2026-07-20-field-name-meaning-mismatch-marketplace-display-name.md`](./2026-07-20-field-name-meaning-mismatch-marketplace-display-name.md)
  was written to prohibit.
- The `source` → `marketplace` rename is already half-done in the UI: `summary-panel.tsx` renders a
  `Marketplace` header while `list.tsx` renders `Source`, with no note that the split is deliberate.
- Committed `apps/www/dist/` build output still documents `--source` as a `BaseCommand` flag
  inherited by every command, which stopped being true when the flag narrowed to `init`.
- Live configs carry `domains` and `selectedAgents` keys that are on no schema and that nothing
  reads, surviving purely through `.passthrough()` on both loader schemas.
