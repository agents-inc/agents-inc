---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/types/zod-schemas.md
  - .ai-docs/reference/type-system.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: 'Both proposed rules landed in `standards/documentation-bible.md`, and the specific drift is gone. Verified 2026-07-30: rule 1 is present as the section "A Count Lives in Exactly One Document", with the GOOD/BAD pair using this finding''s own example and an ownership registry naming the single owner of each frequently-duplicated count; it cites this instance as evidence — the `# All 39 Zod schemas` annotation surviving from 2026-07-23 to 2026-07-30 through a full sweep and two targeted syncs. Rule 2 is present in the validation guidance: "When a validation pass changes a count, grep `.ai-docs/` for BOTH the old and the new value before finishing", including the instruction to record an out-of-ownership mismatch in a file you do own, naming the stale file, its value and its owner. The stale annotation itself is corrected — the bible''s tree now reads `zod-schemas.md # Zod schemas (bridge, loader, structural, strict)` with no number. This finding is a member of Pattern O, whose prose half was widened on the strength of it.'
---

## What Was Wrong

`documentation-bible.md` describes the documentation tree with a per-file annotation, and one of
those annotations carries a **number**:

```
    types/                      # Type system splits
      ...
      zod-schemas.md            # All 39 Zod schemas (bridge, loader, structural, strict)
```

The real count has been **35** since the 2026-07-23 validation sweep, which corrected it inside
`zod-schemas.md` and recorded the correction in that file's own "Recent changes" section. The index
annotation was never updated, so the two surfaces have disagreed for a week across a full
documentation sweep and two targeted syncs.

The mechanism is a gap, not an oversight. Validation is organised **per document**: an agent
assigned `zod-schemas.md` re-counts the schemas, fixes the body, and bumps that file's
`last_validated`. Nothing in the process tells it that another file quotes the same number.
`documentation-bible.md` is in `standards/` and owned by a different agent, so the agent that
learns the count is also the agent that may not edit the file carrying the stale copy. The count
is duplicated with no back-link in either direction.

This is the same failure class the bible itself warns about under "Exhaustive Enumeration over
Glob Shorthand" (a phantom `PIPELINE_MATRIX` survived 8 days behind an `etc.`), but one level up:
here the drift is in the **index**, and the index is what agents are told to load first. A number
in the entry point is read as authoritative precisely because it is read before the doc it
describes.

Re-verified this pass by counting `export const *Schema` declarations directly in
`src/cli/lib/schemas.ts`: 35 (4 bridge / 8 loader / 16 structural / 7 strict). `schemas.ts` grew
~63 lines in the 0.145.0–0.146.0 window without adding a schema — the growth is
`splitMetadataValidationIssues` and its helpers — so 35 is both the current and the previously
correct value.

## Fix Applied

Partial, and bounded by file ownership.

- `reference/types/zod-schemas.md` (owned): re-counted from source, added a per-table breakdown
  that visibly sums to 35, and added a "Recent changes" entry stating the count was re-verified
  and is unchanged.
- `reference/type-system.md` (owned): added the schema count to its "Counts (verified against
  generated source)" section — the file that already exists to hold verified counts — plus an
  explicit `> Known inbound drift` note naming `documentation-bible.md`, its stale value, and its
  owner.
- `.ai-docs/standards/documentation-bible.md`: **not edited.** It belongs to convention-keeper.
  The annotation still reads "All 39 Zod schemas".

## Proposed Standard

Two rules, both for `.ai-docs/standards/documentation-bible.md`.

**1. Keep counts out of the index.** Add to the "Document Hierarchy" section:

> Annotations in the documentation tree and in the "What Each Document Covers" table describe
> **scope**, never quantity. Write `zod-schemas.md # Zod schemas (bridge, loader, structural,
strict)`, not `# All 39 Zod schemas`. A count belongs in exactly one place — the document that
> re-verifies it against source — because a count duplicated into a file with a different owner
> and a different validation cadence will drift, and the index drifts silently since it is read
> before the doc it describes.

**2. Grep for the number when you re-verify one.** Add to the "Validation Process" section, under
"What to verify":

> When a validation pass changes a count, grep `.ai-docs/` for both the old and the new value
> before finishing. Any other file quoting it is drift. If the other file is outside your
> ownership, record the mismatch in a file you do own — name the stale file, its stale value and
> its owner — and report it, rather than leaving the two surfaces to disagree unremarked.

The second rule generalises past this instance: the same duplication exists for the
`SkillId` / `Category` / `Domain` / `AgentName` counts, which `type-system.md`, `core-types.md`
and several feature docs all quote independently.
