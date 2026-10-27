---
type: missing-standard
severity: low
affected_files:
  - src/cli/lib/operations/project/detect-project.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The one missed spec is fixed (CLI-985). The Proposed Standard's sentence is not written into
  CLAUDE.md.
---

## What Was Wrong

CLI-985 deleted `Installation.skillsDir`. Before the deletion, the tester listed every spec asserting
the field with a language-service census (`getReferencesAtPosition` on the member), because the bare
name `skillsDir` is shared by many unrelated locals. After the deletion, `tsc` passed on all three
projects. Both missed `detect-project.test.ts`. Its `detectedAt(dir)` helper returns an untyped
object literal, which the spec compares with `toStrictEqual`. Nothing ties that literal to
`Installation`, so the language service lists no reference and `tsc` reports no excess property.
Only the full unit run found it: four specs expected 5 fields and got 4.

The census proves no product code reads the field. It does not list every spec that asserts it.

## Fix Applied

Deleted the `skillsDir` line from `detectedAt`. The whole-object `toStrictEqual` remains, so the spec
now pins the field's absence, like the tester's specs.

A shape grep finds this kind of miss. From `packages/cli`:

```
grep -rln "skillsDir:" src e2e scripts --include='*.ts' --include='*.tsx' | xargs grep -l "projectDir" | xargs grep -ln "configPath"
```

Before the fix it listed `detect-project.test.ts` among unrelated types (install paths, host roles,
marketplace config). Afterwards only the unrelated types remain.

## Proposed Standard

One sentence beside CLAUDE.md's "ALWAYS grep for the old value when changing test data or renaming
anything": when deleting a type member, find the specs asserting it with a full unit run against the
deletion, or a grep for the member together with its siblings' keys, because a language-service
census and `tsc` both miss an untyped expected literal.
