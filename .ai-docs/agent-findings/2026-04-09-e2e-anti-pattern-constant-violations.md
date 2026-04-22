---
type: convention-drift
severity: low
affected_files:
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/commands/doctor.e2e.test.ts
  - e2e/smoke/plugin-install.smoke.test.ts
  - e2e/smoke/home-isolation.smoke.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: constants swapped across 5 files; D-168 audit
---

## What Was Wrong

Six instances of E2E anti-pattern violations across 5 test files:

1. **Hardcoded path segment** `".claude"` in `edit-wizard-excluded-skills.e2e.test.ts:319` instead of `DIRS.CLAUDE`
2. **Hardcoded file name** `"metadata.yaml"` in `uninstall.e2e.test.ts:54` instead of `FILES.METADATA_YAML`
3. **Hardcoded file name** `"config.ts"` in `doctor.e2e.test.ts:122` instead of `FILES.CONFIG_TS`
4. **Bare exit code numbers** `.toBe(0)` and `.not.toBe(0)` in `plugin-install.smoke.test.ts:48,164` instead of `EXIT_CODES.SUCCESS`
5. **Bare exit code number** `.toBe(0)` in `home-isolation.smoke.test.ts:49` instead of `EXIT_CODES.SUCCESS`
6. **Local constant duplicating existing** `const PLUGIN_MANIFEST_DIR = ".claude-plugin"` in `home-isolation.smoke.test.ts:13` instead of `SOURCE_PATHS.PLUGIN_MANIFEST_DIR`

## Fix Applied

- Replaced all hardcoded path/file segments with `DIRS.*` / `FILES.*` constants
- Replaced all bare exit code numbers with `EXIT_CODES.*` constants
- Removed local `PLUGIN_MANIFEST_DIR` constant and replaced with `SOURCE_PATHS.PLUGIN_MANIFEST_DIR`
- Added missing constant imports (`FILES`, `EXIT_CODES`, `SOURCE_PATHS`) to affected files

All affected E2E tests pass after fixes.

## Proposed Standard

No new rules needed -- all violations are covered by existing rules in `.ai-docs/standards/e2e/anti-patterns.md` (sections: "Never use hardcoded path segments", "Never use inline timeout numbers", "Never use bare exit code numbers"). The gap is in enforcement, not documentation. A lint rule or grep-based CI check could catch these automatically.
