---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/features/skills-and-matrix.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
---

## What Was Wrong

`.ai-docs/reference/features/skills-and-matrix.md` described the matrix composition pipeline (`mergeMatrixWithSkills`, `extractAllSkills`, `mergeLocalSkillsIntoMatrix`, `loadSkillsFromAllSources`) as if it worked correctly end-to-end. It never surfaced the nine D-214 matrix-hardening gaps that are current runtime behaviors:

1. `mergeMatrixWithSkills` silently overwrites duplicate skill IDs (no warn).
2. `extractAllSkills` wraps `parseYaml` with no try/catch — a single malformed `metadata.yaml` kills the whole matrix load.
3. `mergeLocalSkillsIntoMatrix` never re-runs `buildSlugMap` — `getSkillBySlug("<custom-slug>")` throws for every local/custom skill.
4. `resolveRelationships` filters unresolved slugs from `requires` and proceeds with the subset — `needsAny: false` (AND) silently narrows.
5. `tagExtraSources` only reads extras' skill metadata — their `skill-rules.ts` and `skill-categories.ts` are dropped.
6. `synthesizeCategory` fires for built-ins too — marketplace drift is masked behind an `order: 999` stub.
7. `resolveToCanonicalId` only `warn(...)`s — no `unresolvedSlugs[]` returned, so `checkMatrixHealth` can't flag typos.
8. `buildSlugMap` half-writes the reverse map on slug collision — `idToSlug[loser.id]` is `undefined`.
9. `source-loader.ts` calls `initializeMatrix` twice — the singleton is stale between the two writes.

Consumer agents reading the doc had no way to know any of this. `new marketplace` is feature-flagged off pending D-214, but the pipeline is exercised today by every custom-skill flow and every private-marketplace consumer.

## Fix Applied

- Added a **Known Limitations (D-214 matrix-hardening gaps)** section enumerating all nine behaviors with file/function anchors.
- Tightened Data Flow steps 4-5-6 with inline pointers to the relevant limitations so the flow narrative doesn't lie.
- Tightened the `resolveRelationships` blurb in the Skill Resolution section.
- Updated `last_validated` and `DOCUMENTATION_MAP.md` entry.

## Proposed Standard

In `documentation-bible.md`, extend the reference-doc contract with:

> **Known-limitations rule:** When a documented system has active hardening tasks in `todo/TODO.md`, the reference doc MUST include a "Known Limitations" section cross-referenced to the task ID. Silent current-behavior gaps are drift.

This is the second time in 2026 a reference doc was found describing code as if its TODOs were closed. A rule here is cheaper than an audit each iteration.
