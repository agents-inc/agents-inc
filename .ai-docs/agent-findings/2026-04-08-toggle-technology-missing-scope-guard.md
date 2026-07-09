---
type: standard-gap
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/stores/wizard-store.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: scope guard added to toggleTechnology
---

## What Was Wrong

`toggleTechnology` in `wizard-store.ts` had no guard to prevent deselecting globally installed skills when editing from project scope (`isEditingFromGlobalScope: false`). Other toggle functions (`toggleSkillScope`, `applyAgentToggle`) already had similar guards, but `toggleTechnology` was missing one. This allowed users to deselect a globally-installed skill via Space in the build step, which would then be treated as an uninstall of the global skill.

Additionally, 6 existing tests that tested global skill toggling behavior were missing `isEditingFromGlobalScope: true` in their setup. These tests simulated global edit flows but relied on the default `false` value, masking the missing guard.

## Fix Applied

1. Added a guard at the top of `toggleTechnology` that checks if the skill is globally installed and the user is not editing from global scope. If both conditions are true, returns a toast message and skips the toggle.
2. Added `isEditingFromGlobalScope: true` to 6 existing tests that simulate global-scope edit flows.
3. Added a new test asserting the guard blocks toggles from project scope and sets the correct toast message.

## Proposed Standard

When adding new toggle/mutation functions to the wizard store, always check whether scope-based guards are needed. The pattern is:

- Check `state.installedSkillConfigs` for the item with `scope === "global"` and `!excluded`
- Check `!state.isEditingFromGlobalScope`
- If both true, return `{ toastMessage: "..." }` without mutating state

This pattern exists in `toggleSkillScope`, `applyAgentToggle`, and now `toggleTechnology`. Document this as a required guard pattern in `.ai-docs/standards/clean-code-standards.md` under scope awareness.
