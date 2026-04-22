---
type: standard-gap
severity: medium
affected_files:
  - src/cli/components/wizard/skill-agent-summary.tsx
  - src/cli/stores/wizard-store.ts
  - src/cli/components/hooks/use-wizard-initialization.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: isInitMode added to wizard store; SkillAgentSummary skips removal diff in init mode
---

## What Was Wrong

The `SkillAgentSummary` component treated all deselected skills/agents identically regardless of whether the wizard was in init mode or edit mode. When globally-installed skills were pre-selected during `cc init` and the user deselected them, they appeared as "removed from global" with a `-` marker and error color. This was incorrect because init mode does not modify global installations -- the user is simply choosing not to add the skill to the project.

The root cause was that the wizard store had no concept of init vs edit mode. The diff rendering logic only knew about `installedSkillConfigs`/`installedAgentConfigs` snapshots, which are populated for both modes.

## Fix Applied

Added `isInitMode: boolean` to the wizard store, set from `use-wizard-initialization.ts` based on whether `initialStep` is defined (edit mode sets it to `"build"`, init mode leaves it undefined). The `SkillAgentSummary` component now returns empty arrays for `removedGlobalSkills`/`removedGlobalAgents` when `isInitMode` is true, while still showing project-scope removals normally.

## Proposed Standard

When adding diff-rendering or state-transition logic to wizard components, always consider whether the behavior should differ between init mode (`cc init` / first-time setup) and edit mode (`cc edit` / modifying existing installation). Global-scope items are inherited in init mode but actively managed in edit mode, so removal semantics differ.
