---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/features/plugin-system.md
  - .ai-docs/reference/features/skills-and-matrix.md
  - .ai-docs/reference/features/configuration.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: ralph-audit
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: reference doc fixes landed (plugin-system.md, skills-and-matrix.md, configuration.md) per Fix Applied section
---

## What Was Wrong

Three classes of drift between `.ai-docs/reference/features/*.md` export lists and current barrel files (`src/cli/**/index.ts`):

1. `plugin-system.md` Installation Barrel Exports list for `installation/index.ts` was missing `deregisterProjectPath` and `propagateGlobalChangesToProjects` (both added to the local-installer re-export block, and referenced elsewhere in the same doc tree).
2. `skills-and-matrix.md` Relationship Query barrel claim said "All 13 functions above" but silently omitted `validateSelection`, which is also in the `matrix/index.ts` barrel alongside the 13 query functions.
3. `configuration.md` Config I/O table listed `formatOrigin()` and had a dedicated "Agent Source Resolution" section for `resolveAgentsSource()` — neither function exists anywhere in `src/cli/`.

Enumerated barrel export lists in reference docs drift silently because there is no mechanical check coupling the list to the source file. Adding or removing a single line from a barrel leaves prose lists and table entries behind. The operations-layer doc avoids this by cross-referencing specific files for each entry, but the older feature docs use flat prose enumerations.

## Fix Applied

- `plugin-system.md`: appended `deregisterProjectPath`, `propagateGlobalChangesToProjects` to the local-installer re-export line.
- `skills-and-matrix.md`: rewrote the Relationship Query barrel sentence to spell out that `validateSelection` is in the barrel and the four `validate{Conflicts,Requirements,Exclusivity,Recommendations}` helpers are not.
- `configuration.md`: removed `formatOrigin()` row from the Config I/O table and deleted the stale Agent Source Resolution section for `resolveAgentsSource()`.

## Proposed Standard

Add to `standards/documentation-bible.md`:

> When documenting barrel re-export lists in `.ai-docs/reference/**`, structure them as a table with one row per exported name rather than a prose enumeration. Each row references the source file the symbol lives in. Prose enumerations of "All N functions above" are forbidden — they silently decouple from counts and miss additions like `validateSelection` alongside a table of 13 query functions.
>
> When a documented function is removed from source (no grep hits in `src/cli/`), the matching reference-doc row MUST be removed in the same PR. Grep for the old name across `.ai-docs/reference/` before deleting a function.
