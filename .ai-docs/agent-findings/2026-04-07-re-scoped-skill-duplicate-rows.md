---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/skill-agent-summary.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: buildSourceRows + skill-agent-summary dedup across active/tombstone
---

## What Was Wrong

When a skill is re-scoped from global to project, `skillConfigs` contains two entries: an active project-scope entry and an excluded global-scope tombstone. Two separate locations failed to account for this dual-entry pattern:

1. **wizard-store.ts `buildSourceRows`**: The `excludedGlobalIds` collection included skills that were already present in `selectedTechnologies` or `inheritedSkillIds`, causing the same skill ID to appear multiple times in `allSkillIds`. Each occurrence then triggered the `wasReScoped` path, producing 4 rows instead of 2.

2. **skill-agent-summary.tsx**: The `allGlobalSkills` array concatenated `inheritedGlobalSkills` and `excludedGlobalSkills` without deduplication. A re-scoped skill appeared in both collections (inherited because it has a project counterpart; excluded because of the tombstone), causing duplicate display in the Global section.

## Fix Applied

1. In `buildSourceRows`, filter `excludedGlobalIds` to exclude skills already in `allActiveIds` (union of `inheritedSkillIds` and `selectedTechnologies`).
2. In `skill-agent-summary.tsx`, deduplicate `excludedGlobalSkills` against `inheritedGlobalSkills` before concatenation, for both skills and agents.

## Proposed Standard

When building aggregate collections from `skillConfigs` that may contain both active and tombstone entries for the same skill ID, always deduplicate across the component lists before merging. Document this in `.ai-docs/standards/clean-code-standards.md` under a "Scope-aware collection merging" subsection:

> When `skillConfigs` contains dual entries (active + excluded tombstone) for a re-scoped skill, each downstream consumer must ensure the skill appears in exactly one sub-collection. Filter later collections against earlier ones before concatenation.
