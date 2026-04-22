---
type: anti-pattern
severity: medium
affected_files:
  - e2e/integration/custom-agents.e2e.test.ts
  - e2e/integration/eject-compile.e2e.test.ts
  - e2e/integration/eject-integration.e2e.test.ts
  - e2e/smoke/plugin-chain-poc.smoke.test.ts
  - e2e/commands/plugin-uninstall-core.e2e.test.ts
  - e2e/commands/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/commands/uninstall-preservation.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-09
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: duplicated helpers removed; D-168 audit
---

## What Was Wrong

Three categories of anti-patterns found across 7 E2E test files:

1. **Duplicated `agentsPath()` helper**: Three integration test files defined a local `function agentsPath(projectDir: string)` that is identical to the shared `agentsPath()` already exported from `e2e/helpers/test-utils.ts`. This violates the "Always check existing shared helpers before writing local ones" rule.

2. **Duplicated `PLUGIN_MANIFEST_DIR` constant**: Two smoke test files defined `const PLUGIN_MANIFEST_DIR = ".claude-plugin"` locally when `SOURCE_PATHS.PLUGIN_MANIFEST_DIR` already exists in `e2e/pages/constants.ts`. This violates the "Never use hardcoded path segments" rule.

3. **Hardcoded UI text strings**: Multiple files used `"Uninstall complete!"` and `"Eject complete!"` inline instead of `STEP_TEXT.UNINSTALL_SUCCESS` and `STEP_TEXT.EJECT_SUCCESS`. This violates the "Never use raw UI text in tests" rule.

4. **Hardcoded timeout numbers**: `plugin-uninstall-core.e2e.test.ts` used `120_000` and `60_000` inline instead of `TIMEOUTS.INTERACTIVE` and `TIMEOUTS.PLUGIN_INSTALL`.

## Fix Applied

- Removed 3 local `agentsPath()` definitions, imported from `test-utils.ts`
- Removed 1 local `PLUGIN_MANIFEST_DIR` constant, replaced with `SOURCE_PATHS.PLUGIN_MANIFEST_DIR`
- Replaced 8 occurrences of `"Uninstall complete!"` with `STEP_TEXT.UNINSTALL_SUCCESS`
- Replaced 1 occurrence of `"Eject complete!"` with `STEP_TEXT.EJECT_SUCCESS`
- Replaced 2 inline timeout numbers with `TIMEOUTS.INTERACTIVE` and `TIMEOUTS.PLUGIN_INSTALL`

## Proposed Standard

The existing anti-patterns doc covers all these cases but the rules are not being enforced in review. Consider:

1. Adding a grep-based CI check for common hardcoded strings (`"Uninstall complete!"`, `"Eject complete!"`, `"initialized successfully"`) in `*.test.ts` files
2. Adding a grep check for local function definitions that shadow `test-utils.ts` exports (e.g., `function agentsPath`, `function skillsPath`)
3. In `.ai-docs/standards/e2e/anti-patterns.md`, add `SOURCE_PATHS.PLUGIN_MANIFEST_DIR` to the "Never use hardcoded path segments" section examples
