---
type: anti-pattern
severity: medium
affected_files:
  - e2e/commands/eject.e2e.test.ts
  - e2e/lifecycle/plugin-lifecycle.e2e.test.ts
  - e2e/lifecycle/plugin-scope-lifecycle.e2e.test.ts
  - e2e/integration/eject-compile.e2e.test.ts
  - e2e/integration/eject-integration.e2e.test.ts
  - e2e/lifecycle/exclusion-lifecycle.e2e.test.ts
  - e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts
  - e2e/commands/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/lifecycle/unified-config-view.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-04-13
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: 9 files migrated to matcher-based assertions
---

## What Was Wrong

Multiple E2E test files used raw filesystem operations (`fileExists`, `readTestFile`, `directoryExists`, `JSON.parse`) directly in `it()` blocks instead of custom Vitest matchers. Three categories of anti-patterns were fixed:

1. **Raw `fileExists`/`directoryExists` for compiled agents** -- replaced with `toHaveCompiledAgent(name)` and `not.toHaveCompiledAgent(name)` which also validate frontmatter.

2. **Raw `readTestFile` + manual string assertions for agent content** -- replaced with `toHaveCompiledAgentContent(name, { contains, notContains })`.

3. **Conditional assertion pattern `if (await fileExists(path)) { ...assertions... }`** -- silently skips assertions when file is missing, hiding failures. Restructured to always assert the file exists first, then check content unconditionally.

Additional patterns fixed: bare `toHaveConfig()` (existence-only) replaced with content-aware versions where meaningful; `toHaveEjectedTemplate()` replacing manual path construction; `toHaveLocalSkills()` replacing `directoryExists` on skills dir; `toHaveSettings({ hasKey })` replacing `readTestFile` + `JSON.parse` + `toHaveProperty`; `expectCleanUninstall()` replacing manual post-uninstall checks; `DIRS.AGENTS` replacing hardcoded `"agents"` strings.

## Fix Applied

Migrated all nine files to use the matcher-based assertion pattern documented in `assertions.md`. Removed unused imports after migration. Added `../matchers/setup.js` imports where missing.

## Proposed Standard

The conditional assertion anti-pattern (`if (await fileExists(x)) { assertions }`) should be explicitly called out in `.ai-docs/standards/e2e/anti-patterns.md` as a separate rule. It is more insidious than simple raw filesystem reads because it can make tests appear to pass even when the expected file was never created.
