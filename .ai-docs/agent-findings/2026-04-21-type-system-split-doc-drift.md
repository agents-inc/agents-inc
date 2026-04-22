---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/type-system.md
  - .ai-docs/reference/types/core-types.md
  - .ai-docs/reference/types/operations-types.md
  - .ai-docs/reference/types/zod-schemas.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: type-system.md is now a thin pointer to the three children (types/core-types.md, types/operations-types.md, types/zod-schemas.md); documentation-bible.md §Splits & Pointers codifies the rule
---

## What Was Wrong

`.ai-docs/reference/type-system.md` was split into three files in Phases 2+3 of the doc restructure (`types/core-types.md`, `types/operations-types.md`, `types/zod-schemas.md`) but the original 469-line file was preserved alongside the children — creating a dual-source-of-truth hazard. The original drifted significantly while the splits were updated:

- Claimed **161 SkillIds / 51 Categories**; actual generated source has **222 / 89**.
- Missing **D-231** (ProjectConfig `version` field removed).
- Missing **D-217** (`source` field added to `SkillConfig`, `SkillReference`, `Skill`).
- Missing `SkillConfig`, `AgentScopeConfig`, `SkillDefinition` entries (present in `types/core-types.md`).

Both staleness dashboard rows claimed "OK, 0 days stale" — the `last_validated` front-matter was bumped in a prior sweep without re-reading the body.

## Fix Applied

Replaced body of `reference/type-system.md` with a thin pointer: table of "where content lives now", a semantic-shift index (D-231, D-217, D-229), and verified counts. Kept the file at the same path because CLAUDE.md, older findings, and cross-ref frontmatter still link to `reference/type-system.md`.

## Proposed Standard

Add to `.ai-docs/standards/documentation-bible.md` (Splits & Pointers section):

**Rule:** When a doc is split into children, the original MUST become a pointer within the same session as the split. Never leave the pre-split body alongside the children — parallel maintenance guarantees drift. A pointer contains: (1) a "where content lives now" table, (2) a list of inbound-link reasons (why the path is kept), (3) NO duplicated content beyond a semantic-shift index cross-linked to the children.

**Detection:** During validation sweeps, any file whose frontmatter `related:` overlaps with a sibling's `related:` AND whose headings duplicate the sibling's headings is a drift candidate — audit the body, not just the front-matter date.

## Impact

- Future agents reading `type-system.md` will be directed to the authoritative splits rather than acting on stale counts or missing semantic shifts.
- Removes recurring sweep burden: three files to re-validate, not four.
- One data point for a broader rule: validated staleness dashboards must check body content against current code, not just bump timestamps.
