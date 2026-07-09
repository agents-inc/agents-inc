---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-06
reporting_agent: orchestrator
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: buildEjectConfig uses buildStackProperty for per-agent stack; D-220 stack ownership model
---

## What Was Wrong

In `buildEjectConfig`, the call to `generateProjectConfigFromSkills` builds a stack where ALL selected skills are assigned to ALL agents. This is because `generateProjectConfigFromSkills` groups skills by category and then maps every agent to the same category groups -- it has no knowledge of which skills belong to which agent in the stack definition.

The subsequent "preloaded overlay" loop patched preloaded flags but did not address the fundamental cross-contamination: every agent received every skill regardless of the stack YAML's per-agent assignments.

Result: `api-developer` would contain `web-framework-react`, `web-testing-vitest`, etc., and `web-developer` would contain `api-framework-hono`.

## Fix Applied

Replaced the generic stack from `generateProjectConfigFromSkills` with a filtered version built from `buildStackProperty(loadedStack)`. The new code:

1. Gets the authoritative per-agent assignments from the stack definition via `buildStackProperty`
2. Filters each agent's assignments to only include user-selected skills (via `selectedSkillSet`)
3. Preserves preloaded flags from the stack YAML (no separate overlay needed)
4. Assigns the filtered stack back to `localConfig.stack`

This removed the preloaded overlay loop entirely since `buildStackProperty` already preserves preloaded flags.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` a rule:

**Stack property generation**: When a stack is selected, always derive the `stack` property from the stack definition's per-agent assignments (via `buildStackProperty`), never from a generic "all skills to all agents" generator. The generic generator (`generateProjectConfigFromSkills`) is only appropriate for "start from scratch" flows where no stack exists.
