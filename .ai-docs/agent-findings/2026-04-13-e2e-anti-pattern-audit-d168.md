---
type: audit
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - e2e/commands/uninstall.e2e.test.ts
  - e2e/init-wizard-scratch.e2e.test.ts
  - e2e/init-wizard-stack.e2e.test.ts
  - e2e/init-wizard-flags.e2e.test.ts
  - e2e/edit-wizard-detection.e2e.test.ts
  - e2e/edit-wizard-launch.e2e.test.ts
  - e2e/update.e2e.test.ts
  - e2e/search-static.e2e.test.ts
  - e2e/real-marketplace.e2e.test.ts
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/build.e2e.test.ts
  - e2e/build-agent-plugins.e2e.test.ts
  - e2e/plugin-install.smoke.test.ts
  - e2e/dual-scope-edit-mixed-sources.e2e.test.ts
  - e2e/plugin-scope-lifecycle.e2e.test.ts
  - e2e/init-wizard-navigation.e2e.test.ts
  - e2e/edit-wizard-local.e2e.test.ts
  - e2e/validate.e2e.test.ts
  - e2e/plugin-chain-poc.smoke.test.ts
  - e2e/eject.e2e.test.ts
  - e2e/plugin-lifecycle.e2e.test.ts
  - e2e/eject-compile.e2e.test.ts
  - e2e/eject-integration.e2e.test.ts
  - e2e/edit-wizard-excluded-skills.e2e.test.ts
  - e2e/init-wizard-scope-split.e2e.test.ts
  - e2e/exclusion-lifecycle.e2e.test.ts
  - e2e/global-skill-toggle-guard.e2e.test.ts
  - e2e/unified-config-view.e2e.test.ts
  - e2e/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/edit-agent-scope-routing.e2e.test.ts
  - e2e/edit-skill-accumulation.e2e.test.ts
  - e2e/list.e2e.test.ts
  - e2e/uninstall.e2e.test.ts
  - e2e/uninstall-preservation.e2e.test.ts
  - e2e/doctor.e2e.test.ts
  - e2e/doctor-diagnostics.e2e.test.ts
  - e2e/global-scope-lifecycle.e2e.test.ts
  - e2e/init-global-preselection-confirm.e2e.test.ts
  - e2e/init-wizard-interactions.e2e.test.ts
  - e2e/project-tracking-propagation.e2e.test.ts
  - e2e/scope-aware-local-copy.e2e.test.ts
  - e2e/init-wizard-existing.e2e.test.ts
  - e2e/edit-wizard-plugin-operations.e2e.test.ts
  - e2e/init-wizard-plugin.e2e.test.ts
  - e2e/init-then-edit-merge.e2e.test.ts
  - e2e/re-edit-cycles.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/standards/e2e/README.md
date: 2026-04-13
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
task: D-168
auditor: cli-tester (20 agents)
status: resolved
resolved_by: D-168 E2E audit shipped in 0.125.0
---

# E2E Anti-Pattern Audit (D-168)

Full sweep of 86 E2E test files against `.ai-docs/standards/e2e/anti-patterns.md` and `.ai-docs/standards/e2e/assertions.md`.

## Violation Counts (Cross-File Grep)

| Anti-Pattern                                | Occurrences | Files                          |
| ------------------------------------------- | ----------- | ------------------------------ |
| `writeFile`/`mkdir` in test files           | 194         | 34                             |
| `readTestFile` in assertions                | 155         | 34                             |
| `fileExists` existence-only assertions      | 113         | 28                             |
| `directoryExists` existence-only assertions | 100         | 19                             |
| Hardcoded UI strings (STEP_TEXT exists)     | ~50         | ~20                            |
| Production imports from `src/cli/`          | 5           | 5 (all type-only -- compliant) |
| `delay()` in tests                          | 0           | 0                              |
| `TerminalSession` in tests                  | 0           | 0                              |
| `INTERNAL_DELAYS` in tests                  | 0           | 0                              |

## Fix Batches

### Batch 1: Constants + Quick Wins (no test logic changes)

- [x] 1a. Add missing STEP_TEXT constants to `e2e/pages/constants.ts`: `INSTALLING_PLUGINS`, `PLUGIN_NATIVE`, `SKILLS_COPIED_TO`, `AGENTS_COMPILED_TO`, `CONFIGURATION`, `GLOBAL_SKILLS_BLOCKED`, `GLOBAL_AGENTS_BLOCKED`, `CONFIRM_UNINSTALL_PROMPT`, `UNINSTALL_CANCELLED`, `READY_TO_INSTALL`, `NO_SKILLS_FOUND`, `LOADED_LOCAL_PREFIX`, `SELECT_STACK_TO_COMPILE`
- [x] 1b. Replace hardcoded `"Uninstall complete!"` with `STEP_TEXT.UNINSTALL_SUCCESS` in `e2e/commands/uninstall.e2e.test.ts` (lines 79, 106)
- [x] 1c. Replace hardcoded `"Framework"` with `STEP_TEXT.BUILD` in: `init-wizard-scratch.e2e.test.ts:120`, `init-wizard-stack.e2e.test.ts:140`, `init-wizard-flags.e2e.test.ts:55`, `edit-wizard-detection.e2e.test.ts:105`, `edit-wizard-launch.e2e.test.ts:59,117,146`
- [x] 1d. Replace hardcoded `"Loading skills..."` with `STEP_TEXT.LOADING_SKILLS` in `update.e2e.test.ts:78,386`
- [x] 1e. Replace hardcoded `"Loaded from local:"` with `STEP_TEXT.LOADED_LOCAL` in: `update.e2e.test.ts:198,367`, `search-static.e2e.test.ts:161,173`
- [x] 1f. Replace hardcoded `"Recompiling agents"` with `STEP_TEXT.RECOMPILING` in `update.e2e.test.ts:153`
- [x] 1g. Replace hardcoded `"Proceed with update?"` with `STEP_TEXT.CONFIRM_UPDATE` in `update.e2e.test.ts:303,307,343`
- [x] 1h. Replace hardcoded `"No installation found"` with `STEP_TEXT.NO_INSTALLATION` in `real-marketplace.e2e.test.ts:154`
- [x] 1i. Replace hardcoded `"Are you sure you want to uninstall"` with new STEP_TEXT constant in `interactive/uninstall.e2e.test.ts` (7 occurrences)
- [x] 1j. Replace hardcoded `".claude-plugin"` with `SOURCE_PATHS.PLUGIN_MANIFEST_DIR` in: `build.e2e.test.ts:128`, `build-agent-plugins.e2e.test.ts:107,119,223,275`, `plugin-install.smoke.test.ts:67`
- [x] 1k. Replace hardcoded `"agents"` with `DIRS.AGENTS` in: `dual-scope-edit-mixed-sources.e2e.test.ts:186,194`, `plugin-scope-lifecycle.e2e.test.ts:140-143`
- [x] 1l. Remove unused imports: `init-wizard-navigation.e2e.test.ts:TIMEOUTS`, `init-wizard-scratch.e2e.test.ts:TIMEOUTS`, `init-wizard-flags.e2e.test.ts:TIMEOUTS`, `init-wizard-stack.e2e.test.ts:source,createE2ESource,cleanupTempDir`
- [x] 1m. Remove local timeout alias in `edit-wizard-local.e2e.test.ts:20` -- use `TIMEOUTS.PLUGIN_INSTALL` directly
- [x] 1n. Replace `toContain("error")` with specific error string in `validate.e2e.test.ts:202`; replace `toMatch(/error/i)` at `:466-467`
- [x] 1o. Replace `readdir` from `fs/promises` with `listFiles` in `plugin-chain-poc.smoke.test.ts:68`

### Batch 2: Matcher Adoption (replace raw filesystem reads with matchers)

- [x] 2a. Replace bare `toHaveConfig()` with `toHaveConfig({ skillIds, agents, source })` in `eject.e2e.test.ts:80,104`
- [x] 2b. Replace `fileExists` + `readTestFile` + `JSON.parse` + `toHaveProperty` with `toHaveSettings({ hasKey })` in `plugin-lifecycle.e2e.test.ts:88-91`
- [x] 2c. Replace `fileExists(ejectedTemplatePath).toBe(true)` with `toHaveEjectedTemplate()` in: `eject-compile.e2e.test.ts:54,303`, `eject-integration.e2e.test.ts:52,123`
- [x] 2d. Replace `readTestFile` agent content assertions with `toHaveCompiledAgentContent` in `plugin-scope-lifecycle.e2e.test.ts:164-177,199-205`
- [x] 2e. Replace manual dual-scope verification with `expectDualScopeInstallation` in `plugin-scope-lifecycle.e2e.test.ts:120-177`
- [x] 2f. Replace `directoryExists` post-uninstall assertions with `expectCleanUninstall` in `plugin-lifecycle.e2e.test.ts:112-114`
- [x] 2g. Replace `readTestFile` + `path.join` config assertions with `toHaveConfig` where applicable in: `edit-wizard-excluded-skills.e2e.test.ts` (5 occurrences), `init-wizard-scope-split.e2e.test.ts:114-118`
- [x] 2h. Replace `fileExists` for agents with `toHaveCompiledAgent` in: `eject.e2e.test.ts` (8 existence-only assertions), `exclusion-lifecycle.e2e.test.ts:83-90`, `plugin-scope-lifecycle.e2e.test.ts:145-161`
- [x] 2i. Replace `directoryExists` for skills with `toHaveLocalSkills(ids)` or `toHaveSkillCopied` in: `edit-wizard-excluded-skills.e2e.test.ts:319-320`, `global-skill-toggle-guard.e2e.test.ts:91-92,143`
- [x] 2j. Add `../matchers/setup.js` import where missing but matchers should be used: `eject-integration.e2e.test.ts`, `build.e2e.test.ts`, `build-agent-plugins.e2e.test.ts`, `unified-config-view.e2e.test.ts`
- [x] 2k. Replace `directoryExists` with `toHaveCompiledAgents()` or `toHaveCompiledAgent(name)` in `unified-config-view.e2e.test.ts:136`
- [x] 2l. Fix conditional assertions that silently skip in `plugin-uninstall-edge-cases.e2e.test.ts:148,209,240` -- assert file exists first or restructure

### Batch 3: Fixture Extraction (replace inline writeFile/mkdir in it() blocks)

- [x] 3a. Replace inline metadata YAML construction with `createLocalSkill()` in: `interactive/uninstall.e2e.test.ts:56-66`, `update.e2e.test.ts` (6 inline blocks)
- [x] 3b. Replace inline `mkdir` + `writeFile` agent stubs with a helper in: `edit-agent-scope-routing.e2e.test.ts:79-84,119-124`, `edit-skill-accumulation.e2e.test.ts:81-86,107-112`, `list.e2e.test.ts:135-136,237-242`, `uninstall.e2e.test.ts:157,177-183,207-215`, `uninstall-preservation.e2e.test.ts:119-135,176-180`
- [x] 3c. Replace inline `mkdir`/`writeFile` in doctor tests with helpers: `doctor.e2e.test.ts:112-115`, `doctor-diagnostics.e2e.test.ts:88,137-138,196-203`
- [x] 3d. Replace inline env setup (`mkdir` + `createPermissionsFile`) with `createTestEnvironment()` in: `global-scope-lifecycle.e2e.test.ts:178-185`, `init-global-preselection-confirm.e2e.test.ts:48-52` (also ADD missing `createPermissionsFile`), `init-wizard-interactions.e2e.test.ts:106-108`, `project-tracking-propagation.e2e.test.ts:60-62,131-132,197-199,281-283`, `scope-aware-local-copy.e2e.test.ts:68-69,137-138,193-194`
- [x] 3e. Replace inline `writeFile` in `init-wizard-existing.e2e.test.ts:50-55,196` with `ProjectBuilder` methods
- [x] 3f. Fix temp dir leaks in `init-wizard-existing.e2e.test.ts` (5 `createDashboardProject()` calls leak temp dirs) and `edit-wizard-launch.e2e.test.ts` / `edit-wizard-local.e2e.test.ts` (`ProjectBuilder.editable()` temp dirs not cleaned up)
- [x] 3g. Fix leaked temp dir in `update.e2e.test.ts:203-204` (double `createTempDir` call)
- [x] 3h. Rewrite `unified-config-view.e2e.test.ts:57-116` to use `ProjectBuilder.dualScope()` or a dedicated fixture instead of 60+ lines of inline file construction
- [x] 3i. Extract `completeEditFromBuild` from `edit-wizard-local.e2e.test.ts:44-49` to shared wizard helper (duplicated in 3+ files)

### Batch 4: Missing Assertions

- [x] 4a. Add missing negative assertion for excluded skill in `edit-wizard-excluded-skills.e2e.test.ts:89-99`
- [x] 4b. Add missing negative assertion after skill removal in `edit-wizard-plugin-operations.e2e.test.ts:82-85`
- [x] 4c. Fix comment/code mismatch in `edit-wizard-plugin-operations.e2e.test.ts:170-174` (comment says both skills, assertion only checks one)
- [x] 4d. Add missing negative assertion after skill removal in `edit-wizard-local.e2e.test.ts:180-192`
- [x] 4e. Add timeout overrides to all `it()` blocks in `init-wizard-plugin.e2e.test.ts` (use `TIMEOUTS.PLUGIN_TEST`)
- [x] 4f. Add missing negative error assertions (`not.toContain("Failed to")`, `not.toContain("ENOENT")`) in `init-then-edit-merge.e2e.test.ts` after edit phase

### Batch 5: Infrastructure Improvements

- [x] 5a. ~~Add `ProjectBuilder.withAgentStubs(agents)` method~~ — addressed via local `writeAgentStub()` helpers in affected files (simpler approach)
- [x] 5b. Extract `expectNoDuplicates()` from `re-edit-cycles.e2e.test.ts:87-97` and `init-then-edit-merge.e2e.test.ts:35-43` to shared assertion helper
- [x] 5c. ~~Deduplicate `ProjectBuilder.pluginProject()` and `localProjectWithMarketplace()`~~ — deferred; `dualScopeWithImport()` was added instead for the unified-config-view rewrite

## Clean Files (0 issues)

- `relationships.e2e.test.ts`
- `init-wizard-stack-agents.e2e.test.ts`
- `init-wizard-exclusive-compat.e2e.test.ts`
- `init-wizard-filter-incompatible.e2e.test.ts`
- `scope-change-deselect-integrity.e2e.test.ts`
- `help.e2e.test.ts`
- `pom-framework.e2e.test.ts`
