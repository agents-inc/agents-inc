---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/skill-atomicity-bible.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
  - .ai-docs/standards/skill-atomicity-primer.md
date: 2026-04-21
reporting_agent: ralph-loop
category: architecture
domain: shared
root_cause: convention-undocumented
status: partial
partial_note: Bible edits applied (redirect-stub rule flipped, examples.md → examples/ paths corrected). "Primer-wins" authority note added at top of bible. Schema enum regeneration pipeline remains pending.
---

## What Was Wrong

Ralph iter 73 verification uncovered three stale rules in `skill-atomicity-bible.md`:

1. **Direct contradiction with primer** — Bible quality-gate line: "Old technology-named example files replaced with redirect stubs pointing to `core.md`". Primer (newer) says: "do not leave redirect stubs". Marketplace audit confirms zero redirect stubs exist across all 222 skills — primer's rule is the enforced one.
2. **Legacy `examples.md` references** — Bible still instructs to grep/check `skill/examples.md` in four places. No skill in `/home/vince/dev/skills/src/skills/` uses a monolithic `examples.md`; all 222 use an `examples/` directory with `core.md` + topic files.
3. **Cross-verified infrastructure drift (not fixed here)** — `src/schemas/metadata.schema.json` `slug` enum is pinned at 87 entries while `src/cli/types/generated/source-types.ts` has 222. Category enum also stale (50 vs 89). Schema regeneration pipeline not running against current marketplace.

## Fix Applied

Bible updated in four places:

- Quality-gate checklist: redirect-stub rule flipped to match primer ("deleted ... do not leave redirect stubs").
- Pitfall 4 rule text: `examples.md` -> `examples/` directory.
- Phase 1 audit grep command: `skill/examples.md` -> `skill/examples/*.md`.
- Extraction rule: "leave as single `core.md` or `examples.md`" -> "leave as single `examples/core.md`".
- Section 12 verification grep: `cat skill/examples.md` -> `cat skill/examples/*.md`.

Historical Relocations Reference table (lines 601-606) left untouched — those are dated records referring to the legacy layout as it was at the time.

Schema enum drift in `src/schemas/metadata.schema.json` intentionally not touched — that's a build-pipeline regeneration concern, not a doc concern.

## Proposed Standard

When the primer and bible conflict, the primer wins — primer is iteration-current, bible is canonical reference. Add a note at the top of `skill-atomicity-bible.md` stating "If the primer contradicts this document, the primer is authoritative for active iterations" so future readers don't apply stale bible rules.

Also: the schema enum regeneration (`src/schemas/metadata.schema.json`) needs to be wired to `source-types.ts` so the two don't drift. Today any agent validating a marketplace skill against the JSON schema would fail on 135 legitimate categories and slugs.
