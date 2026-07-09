---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/architecture-overview.md
  - .ai-docs/reference/commands.md
  - .ai-docs/reference/component-patterns.md
  - .ai-docs/reference/features/configuration.md
  - .ai-docs/reference/features/wizard-flow.md
  - .ai-docs/reference/state-transitions.md
  - .ai-docs/reference/store-map.md
  - .ai-docs/reference/type-system.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-13
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: line numbers corrected; MEMORY.md feedback_no_line_numbers_in_docs added
---

## What Was Wrong

A non-codex-keeper process updated `.ai-docs/reference/` documentation with multiple inaccuracies:

1. **Stale line numbers:** 14+ line references pointed to wrong positions due to code shifts since the docs were last baselined. Examples: `writeScopedConfigs` claimed at `:369` (actual `:577`), `WizardStep` at `:172-178` (actual `:262-268`), `OptionState` at `:302-306` (actual `:306-310`), multiple forward-navigation references in state-transitions.md off by 10-50 lines.

2. **Stale color values:** `component-patterns.md` listed CLI_COLORS as named CSS colors (`"cyan"`, `"green"`, `"red"`) when the actual values are hex codes (`"#99FFFF"`, `"#90EE90"`, `"#DC343B"`). Also missing 6 color constants added since the doc was written.

3. **Removed props still documented:** `commands.md` referenced `lockedSkillIds` and `lockedAgentNames` as Wizard props passed by the `edit` command. These props were removed in v0.122.0; global-item locking is now handled inside the store via `isInstalledGlobal` guards.

4. **Missing domain:** `wizard-flow.md` listed `BUILT_IN_DOMAIN_ORDER` without `"desktop"` which was added in a prior release.

5. **Outdated version number:** architecture-overview.md showed `0.100.0` when the current version is `0.123.0`.

6. **WizardState shape range wrong:** `store-map.md` claimed `WizardState` spans lines `280-543` but the type actually spans `280-598` (actions and getters are part of the type).

## Fix Applied

All 14+ inaccurate line numbers, the color table, the removed prop references, the domain list, and the version number were corrected. Each fix was verified against the actual source code.

## Proposed Standard

Add a validation rule to `documentation-bible.md`: **Line number references must be verified against actual source before any doc update is marked "validated."** When a non-codex-keeper process generates doc updates, they must go through codex-keeper audit before the DOCUMENTATION_MAP status is set to [DONE].
