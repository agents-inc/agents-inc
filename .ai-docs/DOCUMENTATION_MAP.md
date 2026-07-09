---
last_validated: 2026-04-21
---

# Documentation Map

**Last Updated:** 2026-04-21
**Total Areas:** 32 (18 original + 14 new from restructure)
**Documented:** 32 (100%)
**In Progress:** 0
**Needs Validation:** 0
**Last Validated:** 2026-04-21 (iter 87 re-ran iter-50's 5-invariant audit: (1) header counts 32/18/14 match table rows ✓; (2) no duplicate dashboard rows ✓; (3) cross-surface sync — all 32 Reference-table `Last Validated` = 2026-04-21, all 32 dashboard Days Stale = 0, all 41 disk frontmatter `last_validated: 2026-04-21` ✓; (4) disk-vs-map 41 files = 32 tracked + 9 pointers ✓; (5) date basis = today ✓. No fixes required. Previous: iter 50 first formal audit, iter 43 ad-hoc.)

## Status Legend

- [DONE] Complete and validated
- [NEEDS-VALIDATION] Documented but needs validation
- [IN-PROGRESS] In progress
- [PLANNED] Planned
- [NOT-STARTED] Not started

## Staleness Dashboard

Machine-readable staleness tracker. Thresholds from `standards/documentation-bible.md`.

### Original Files (preserved, authoritative until cleanup)

| Doc                      | Days Stale | Threshold | Status |
| ------------------------ | ---------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-overview.md | 0          | 30        | OK     | <!-- re-validated 2026-04-21 iter27: version 0.123.0→0.141.0; removed dead `build stack` subcommand (only marketplace.ts + plugins.ts exist); search.tsx→search.ts; removed deleted `info.ts` command entry; marked `new/` commands feature-gated; updated matrix/skill-resolution.ts entry (resolveRelationships is module-private; exports are synthesizeCategory + mergeMatrixWithSkills); expanded lib/configuration/ to list config-types-writer + project-config + default-*; expanded operations/skills list (uninstallPluginSkills, compareSkills); expanded operations/project list (detectBothInstallations); dropped stale Zod count (39); added Section 10 config-types writer selection rule (D-228: project path → regenerateConfigTypes, global path → writeStandaloneConfigTypes); added Section 13 Per-Skill Source (D-217: SkillConfig.source authoritative; no agent-level installMode; D-229 hard-error on plugin failure); added Section 14 Projects Array Lifecycle (global-only, used by propagateGlobalChangesToProjects); renumbered Stack Grouping → Section 15; added concepts/tombstone-pattern + concepts/scope-system + config/config-writer to related frontmatter --> |
| commands.md              | 0          | 14        | OK     | <!-- re-validated 2026-04-21 iter25: removed dead `build stack` entry (file does not exist in src/cli/commands/build/, only marketplace.ts + plugins.ts); fixed `search` entry (search.ts not .tsx, query required, zero flags — baseFlags overridden to {}); fixed `doctor` flags (no flags, baseFlags overridden, setVerbose(true) unconditional); added feature-gate notes on `new skill`/`new agent`/`new marketplace` (all three gated behind FEATURE_FLAGS.*_COMMAND, currently false in src/cli/lib/feature-flags.ts); added Feature-Gated Commands section -->                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| type-system.md           | 0          | 14        | OK     | <!-- CONVERTED TO POINTER 2026-04-21 iter41: original was 469 lines, heavily drifted (claimed 161 SkillIds / 51 Categories — actually 222 / 89; missing D-231 version removal on ProjectConfig; missing D-217 source field on SkillConfig/SkillReference/Skill; missing SkillConfig + AgentScopeConfig + SkillDefinition entries that exist in types/core-types.md). Content already duplicated in types/core-types.md + types/operations-types.md + types/zod-schemas.md (all iter 23/24/41 validated). Replaced body with pointer + semantic-shift index + verified counts. Rationale: maintaining two parallel views drifts; splits are the source of truth going forward. -->                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| store-map.md             | 0          | 7         | OK     | <!-- re-validated 2026-04-21 iter14: expanded \_stackDomainSelections / installedSkillConfigs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | installedAgentConfigs snapshot semantics (set once by hydrateWizardStore, never modified post-hydration, 3 roles: diff baseline / tombstone probe / locked-row source); documented focusedSkillId | focusedAgentId post-mount race; split domainSelections (selection intent) vs skillConfigs (saved-config shape) semantics; tightened toggleTechnology guard clauses (3 guards); documented selectedAgents | agentConfigs pairing + D-215 retention rationale; added globalPreselections | globalAgentPreselections init-only lifetime; added full Internal Helpers (reconcileSkillConfigs, restoreSkillConfigs, applyAgentToggle, findIncompatibleWebSkills, sortDomainsCanonically, resolveSkillForPopulation, etc.); added Hydration Entry Point section documenting hydrateWizardStore(HydrateOptions) --> |
| compilation-pipeline.md  | 0          | 14        | OK     | <!-- Reference table shows Last Validated 2026-04-21; dashboard row previously read 11 days stale — corrected iter 43 consistency audit. -->                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

| configuration.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter21: added D-220 options (newlyAddedSkillIds, scopeEligibilityGained, existingStack) on generateProjectConfigFromSkills; added scopeEligibilityKey function entry; added caller-contract invariant (skillConfigs + agentConfigs required when selectedAgents non-empty, getScopeOrThrow hard-errors); expanded splitConfigByScope partitioning list to cover selectedAgents + agents split (D-222); added cross-link to config/scope-split.md; prior: D-228/D-229/D-231 drift sweep -->
| wizard-flow.md | 0 | 14 | OK |
| skills-and-matrix.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter26: verified all file paths + exported functions in matrix-loader.ts / skill-resolution.ts / source-loader.ts / multi-source-loader.ts still exist; added Known Limitations section cross-ref'd to D-214 (9 gaps: duplicate-IDs-silent-overwrite #1, invalid-YAML-crashes-whole-matrix #2, custom-slugs-not-in-slugMap #3, partial-requires-resolution #4, extras-drop-skill-rules #5, auto-synth-fires-for-builtins #6, unresolved-slugs-dropped-pre-health-check #7, half-written-duplicate-slug-reverse-map #8, double-initializeMatrix #9); tightened Data Flow steps 4-5-6 with inline limitation pointers; tightened resolveRelationships note -->

| plugin-system.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter18: added D-217 per-skill source authoritative section + dead-plumbing note; added D-229 hard-error contract on PluginInstallResult.failed before writeConfigAndCompile; added Plugin Reference Formats table distinguishing {id}@{marketplace} (install shell) from ${id}:${id} (compiled agent); documented latent sourceById dual-scope last-write-wins in buildCompileAgents feeder path -->
| component-patterns.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter15: removed stale HOTKEY_COPY_LINK row (removed in 0.130.0); rewrote SkillAgentSummary diff-baseline section to reflect D-230/D-232 slot-occupancy match (baseline is NOT pre-filtered; tombstones occupy (id,scope) slot; only prevSourceMap filters to active entries); added tombstone dedup rationale; added init-mode gating of removedGlobal*; added CategoryGrid mount-effect focus seeding pattern (mountedRef + useEffect, Scenario B race reference); added tombstone-pattern + guard-pattern to related frontmatter -->
| utilities.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter31: fixed message counts (SUCCESS 5->4, STATUS 12->11); removed non-existent UI_LAYOUT/UI_MESSAGES from UI Constants (not defined in consts.ts); added CHECK/CROSS to UI_SYMBOLS list; added pointer to src/cli/lib/exit-codes.ts for EXIT_CODES (lives outside utils/); expanded typed-object section with CLAUDE.md mandate rationale; rewrote stale yaml.ts "DELETED" note into neutral guidance; expanded ERROR/SUCCESS/STATUS/INFO example lists; tightened Claude CLI wrappers section with scope+projectDir contract -->

| test-infrastructure.md | 0 | 14 | OK | <!-- iter42 converted to pointer. Body was drifted (2026-04-13, missing dual-scope POM, waitForStableRender, BaseStep contract, test-fs-utils/expected-values splits) while testing/* children were current (2026-04-21). Now matches type-system.md pointer pattern. -->
| operations-layer.md | 0 | 14 | OK | <!-- Reference table shows Last Validated 2026-04-21; dashboard row previously read 11 days stale — corrected iter 43 consistency audit. -->
| agent-system.md | 0 | 14 | OK | <!-- Reference table shows Last Validated 2026-04-21; dashboard row previously read 11 days stale — corrected iter 43 consistency audit. -->

| dependency-graph.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter32: fixed search.tsx→search.ts filename; removed non-existent `build stack` command row (file deleted); removed `components/skill-search/` component row; updated info-panel.tsx import (matrix→findStack); added skill-agent-summary.tsx row (matrix); added init direct-lib imports (detectInstallation, detectGlobalInstallation, loadProjectConfigFromDir replacing stale detectProjectInstallation); added edit Installation type; added doctor filterExcludedEntries; added uninstall deregisterProjectPath; rewrote validate direct-lib imports to match current source; added new/skill schemas+feature-flags; added new/agent feature-flags+ConfigTypesBackgroundData; added new/marketplace feature-flags; added Key Observations 8-10 (config-types-writer routing D-228, removed build stack, search rewrite) -->

| boundary-map.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter33: fixed search.tsx→search.ts filename + flags (query positional, baseFlags={}); added config-types-writer.ts + local-installer.ts + stack-plugin-compiler.ts to Key Files; rewrote Section 3.2 Config Types Writer to distinguish D-228 writer selection boundary (project path → regenerateConfigTypes with import-from-global branch; global path → writeStandaloneConfigTypes standalone); added generateConfigTypesSource, generateProjectConfigTypesSource, loadConfigTypesDataInBackground; added propagateGlobalChangesToProjects row to Section 3.4; added Section 3.6 Per-Skill Source Propagation (D-217) documenting derivePluginRef contract + SkillConfig.source authoritativeness + no agent-level installMode; renumbered Skill Metadata Injection 3.6→3.7 -->

| state-transitions.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter13: removed stale reference to deleted `src/cli/components/hooks/use-wizard-initialization.ts`; rewrote Hydration section against actual `hydrateWizardStore()` in wizard-store.ts (empty history + direct jump, not step walk); documented that `focusedSkillId` is seeded asynchronously by CategoryGrid mount effect (Scenario B race); added Tombstone Lifecycle Transitions (active-project↔dual-scope↔global-only per D-223/D-224), Diff Projection section (D-230/D-232 pre-filter baseline), and Cancellation/Exit transitions -->
| findings-impact-report.md | 0 | 30 | OK | <!-- FULL REGENERATION 2026-04-21 iter40: replaced 2026-03-28 snapshot + incremental sections with consolidated 2026-04-03..2026-04-21 report (55 findings aggregated); Incremental Updates reset to empty; primary tables: root-cause, severity, category, domain, per-reference-doc impact, per-source-file churn, per-test-area churn; 10 systemic patterns (A-J, replacing old 1-8); 64 deduplicated standards proposals; timeline rollup; open vs closed status (37 closed, 18 open); next full regeneration triggered when >10 entries accumulate in Incremental Updates per documentation-bible rule -->

### New Files (from Phases 2+3 restructure)

| Doc                       | Days Stale | Threshold | Status |
| ------------------------- | ---------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| testing/infrastructure.md | 0          | 14        | OK     | <!-- re-validated 2026-04-21 iter34: removed dead stack.test.ts + schema-validator.test.ts entries; added coverage config + vitest.setup.ts section (homedir mock + matrix init + wizard-store reset); added helpers/isolated-home.ts + mock-data/mock-source-files.ts + writeTestPackageJson; added setupIsolatedHome code pattern; fixed test count estimate --> |

| testing/factories.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter36: confirmed 3-dir split (factories/ helpers/ assertions/); fixed createMockMarketplacePlugin signature (added category? param); added setupIsolatedHome + writeTestPackageJson to helpers table; added renderAgentMd to content generators. All 34 factory signatures verified against actual exports -->
| testing/mock-data.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter37: removed stale claims (PIPELINE_MATRIX, *_EXTRACTED, SINGLE_AGENT_STACK_TEMPLATE, MULTI_AGENT_STACK_TEMPLATE — none exist); added MULTI_STYLING_MATRIX; added missing mock-source-files.ts section (6 VALID_*_FILE fixtures); fixed CATEGORY_GRID_SKILLS count 31→30; enumerated HEALTH_*_MATRIX (12) + ALL_SKILLS_*_MATRIX (8) + pre-built matrix constants + BUILD_STEP matrix names. All SKILLS, TEST_CATEGORIES, AGENT_DEFS verified against source -->
| testing/e2e-infrastructure.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter35: deeper pass on non-keypress content. Fixed file counts (interactive 32→33, lifecycle 25→45); added missing files (info-panel-scope-toggle-diff, edit-plugin-hard-error, edit-wizard-dual-scope-indicator, plugin-install-failure-hard-error, tombstone-cleanup-PtoG-restoration, ~20 scope-toggle/lifecycle adds); added `assertions/` dir entry; fixed split note (search-interactive doesn't exist; removed build-stack reference); expanded Constants table (added WIZARD_TRANSITION=45s, PLUGIN_TEST=90s, INTERNAL_RETRIES, full EXIT_CODES + SOURCE_PATHS); added new E2E Helpers section (CLI_ROOT, BIN_RUN, FORKED_FROM_METADATA, runCLI, createTempDir, delay, stripAnsi, ensureBinaryExists, writeProjectConfig, createLocalSkill, createPermissionsFile, addForkedFromMetadata, injectMarketplaceIntoConfig, getEjectedTemplatePath, readMarketplaceJson, agentsPath/skillsPath, HOME isolation pattern); added Test-Lifecycle Patterns section (beforeAll/afterAll/afterEach); clarified vitest.config.ts (no setupFiles, no poolOptions); tightened expected-values.ts (9-skill tuple, WEB_AND_API getter). Previous: iter 9 added keypress rule. -->
| types/core-types.md | 0 | 14 | OK |
| types/operations-types.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter23: added Key Type Shapes section with explicit shapes for PluginInstallResult (D-229), PluginUninstallResult, MarketplaceResult (lazy), CompilationResult, CompileAgentsOptions (installMode still alive), LoadedSource, ConfigWriteResult, DiscoveredSkills, DetectedProject, BothInstallations, AgentDefs, SkillCopyResult, ScopedSkillDir(sResult), SkillComparisonResults, SkillMatchResult; confirmed all 17 types + file paths exist in src/cli/lib/operations/; cross-ref to D-229 finding -->
| types/zod-schemas.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter24: confirmed 39 exported schemas match code; D-231 cross-ref on projectConfigLoaderSchema (version field removed); fixed utility-function drift (formatZodErrors → formatZodIssues, added isCustomMetadata) -->
| concepts/scope-system.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter38: deep pass. Confirmed SkillScope = "project"|"global" in config.ts; resolveInstallPaths(projectDir, scope="project") default + base = os.homedir() vs projectDir verified; splitConfigByScope tombstone→project routing verified; toggleSkillScope/toggleAgentScope G→P gated on wasInstalledGlobally, P→G unconditional cleanup (D-224); isEditingFromGlobalScope asymmetry documented (init uses fs.realpathSync both sides, edit uses plain `===` on cwd); isInitMode = !initialStep via hydrateWizardStore; writeScopedConfigs home-dir fast path uses fs.realpathSync(projectDir)===fs.realpathSync(homeDir). Added: InstallPaths return shape, P→G/G→P gating rules, invariant (no active+tombstone at same (id,scope)), Global Visibility From Project Scope section. -->
| concepts/tombstone-pattern.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter11 (expanded: D-223 preservation in populateFromSkillIds, D-224 unconditional P→G cleanup invariant, D-230/D-232 slot-occupancy diff baseline in skill-agent-summary.tsx, D-233 known gap in applySkillRemoval dual-scope branch, compound-key survival through mergeConfigs, tombstone-to-project routing cross-refs) -->
| concepts/guard-pattern.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter12 (added: Only-Skill Deselect guard, Scope Toggle Global-Context hotkey guard, scope silent-guards for direct action callers, shouldIncludeTriple stack-build predicate, warn-and-return table for setSourceSelection/setEnabledSources/bindSkill/populateFromSkillIds; new "Silent Guards and Race Surfaces" section mapping Scenario B focusedSkillId race; fixed outdated "No-op (silent)" claim for agent scope — hotkey layer emits toast, store silent guard only catches direct callers) -->
| commands/edit.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 (D-228/D-229 drift sweep: hard-error interrupt, writer selection, no-change exit) -->
| config/config-writer.md | 0 | 14 | OK | <!-- re-validated 2026-04-21 iter8 (added sibling "Registration observability" subsection: what the stale-filter drops + trigger, user-visible-signal table, relation to propagation gap, cross-link to 2026-04-21-registerProjectPath-sweep-observability-gap.md finding; iter7 added "Propagation observability" subsection) -->
| config/config-merger.md | 0 | 14 | OK | <!-- created 2026-04-21 iter4 (mergeConfigs compound-key + replace-on-match, mergeGlobalConfigs additive, additiveMergeStack triple rule, tombstone flow, projects-field-drop) -->
| config/scope-split.md | 0 | 14 | OK | <!-- created 2026-04-21 iter5 (splitConfigByScope partition rules, tombstone-to-project routing, scopeEligibilityKey, D-220 delta pipeline: computeNewlyAddedSkillIds + computeScopeEligibilityGained, shouldIncludeTriple decision table) -->

**Status values:** `OK` = within threshold, `DUE` = at or past threshold, `OVERDUE` = at or past 2x threshold.
**Date basis:** 2026-04-21. All rows reflect Last Validated dates in the Reference tables below. New Files count is 14 (12 from Pass 20 + config-merger.md and scope-split.md added iter 4-5). Two pointer-only files (`type-system.md`, `test-infrastructure.md`) share a single dashboard row each — the body content lives in the split children (types/_, testing/_).

## Reference Documentation

Descriptive docs -- "how things work". Validated aggressively (7-30 day cadence).

### New Directory Structure (Phase 2+3)

```
reference/
  architecture/
    overview.md              # -> architecture-overview.md (pointer)
    dependency-graph.md      # -> dependency-graph.md (pointer)
    boundary-map.md          # -> boundary-map.md (pointer)
  concepts/                  # NEW: Cross-cutting concerns
    scope-system.md          # Consolidates scope docs from 5 files
    tombstone-pattern.md     # Consolidates excluded/tombstone lifecycle
    guard-pattern.md         # Unified view of all store guards
  commands/
    index.md                 # -> commands.md (pointer)
    edit.md                  # Detailed edit command (new content)
  wizard/
    flow.md                  # -> features/wizard-flow.md (pointer)
    state-transitions.md     # CANONICAL (flipped iter 102; root state-transitions.md is now a pointer)
    store-map.md             # -> store-map.md (pointer)
    component-patterns.md    # -> component-patterns.md (pointer)
  types/
    core-types.md            # Split from type-system.md (full content)
    operations-types.md      # Split from type-system.md (full content)
    zod-schemas.md           # Split from type-system.md (full content)
  config/
    configuration.md         # -> features/configuration.md (pointer)
    config-writer.md         # Split from configuration.md (full content)
    config-merger.md         # Merge contract: mergeConfigs + mergeGlobalConfigs (new, 2026-04-21)
    scope-split.md           # splitConfigByScope + scopeEligibilityKey + D-220 delta pipeline (new, 2026-04-21)
  testing/
    infrastructure.md        # Split from test-infrastructure.md (full content)
    factories.md             # Split from test-infrastructure.md (full content)
    mock-data.md             # Split from test-infrastructure.md (full content)
    e2e-infrastructure.md    # Split from test-infrastructure.md (full content)
  features/
    compilation-pipeline.md  # Stays (unchanged)
    configuration.md         # Stays (unchanged, pointed to by config/configuration.md)
    skills-and-matrix.md     # Stays (unchanged)
    plugin-system.md         # Stays (unchanged)
    agent-system.md          # Stays (unchanged)
    operations-layer.md      # Stays (unchanged)
    wizard-flow.md           # Stays (unchanged, pointed to by wizard/flow.md)
  findings-impact-report.md  # Stays (unchanged)
```

**Note:** Original files are preserved alongside new structure. "Pointer" files redirect to originals. "Full content" files contain the actual split content. Once user confirms cleanup, originals can be removed.

### Original Files (preserved, authoritative)

| Area                  | Status | File                                                                                                   | Last Updated | Last Validated | Next Action                                                                                                    |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| Architecture Overview | [DONE] | `reference/architecture-overview.md`                                                                   | 2026-04-13   | 2026-04-21     | Validate in 30 days                                                                                            |
| Commands Reference    | [DONE] | `reference/commands/index.md` (canonical; `reference/commands.md` is now a pointer)                    | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Type System           | [DONE] | `reference/type-system.md`                                                                             | 2026-04-13   | 2026-04-21     | Validate in 14 days                                                                                            |
| State Management      | [DONE] | `reference/store-map.md`                                                                               | 2026-04-21   | 2026-04-21     | Validate in 7 days                                                                                             |
| Compilation Pipeline  | [DONE] | `reference/features/compilation-pipeline.md`                                                           | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Configuration System  | [DONE] | `reference/features/configuration.md`                                                                  | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Wizard Flow           | [DONE] | `reference/features/wizard-flow.md`                                                                    | 2026-04-13   | 2026-04-21     | Validate in 14 days                                                                                            |
| Skills & Matrix       | [DONE] | `reference/features/skills-and-matrix.md`                                                              | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Plugin System         | [DONE] | `reference/features/plugin-system.md`                                                                  | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Component Patterns    | [DONE] | `reference/component-patterns.md`                                                                      | 2026-04-13   | 2026-04-21     | Validate in 14 days                                                                                            |
| Utilities Reference   | [DONE] | `reference/utilities.md`                                                                               | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Test Infrastructure   | [DONE] | `reference/test-infrastructure.md`                                                                     | 2026-04-13   | 2026-04-21     | Validate in 14 days                                                                                            |
| Operations Layer      | [DONE] | `reference/features/operations-layer.md`                                                               | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Agent System          | [DONE] | `reference/features/agent-system.md`                                                                   | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Dependency Graph      | [DONE] | `reference/dependency-graph.md`                                                                        | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Boundary Map          | [DONE] | `reference/boundary-map.md`                                                                            | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| State Transitions     | [DONE] | `reference/wizard/state-transitions.md` (canonical; `reference/state-transitions.md` is now a pointer) | 2026-04-21   | 2026-04-21     | Validate in 14 days                                                                                            |
| Findings Impact       | [DONE] | `reference/findings-impact-report.md`                                                                  | 2026-04-21   | 2026-04-21     | Regenerated iter 92 (106 findings; rollups refreshed; Incremental Updates reset); next trigger >10 new entries |

### New Files (Phase 2+3 restructure, 2026-04-13)

| Area                    | Status | File                                      | Last Updated | Last Validated | Next Action         |
| ----------------------- | ------ | ----------------------------------------- | ------------ | -------------- | ------------------- |
| Test Infrastructure     | [DONE] | `reference/testing/infrastructure.md`     | 2026-04-13   | 2026-04-21     | Validate in 14 days |
| Test Factories          | [DONE] | `reference/testing/factories.md`          | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Test Mock Data          | [DONE] | `reference/testing/mock-data.md`          | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| E2E Infrastructure      | [DONE] | `reference/testing/e2e-infrastructure.md` | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Core Types              | [DONE] | `reference/types/core-types.md`           | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Operations Types        | [DONE] | `reference/types/operations-types.md`     | 2026-04-13   | 2026-04-21     | Validate in 14 days |
| Zod Schemas             | [DONE] | `reference/types/zod-schemas.md`          | 2026-04-13   | 2026-04-21     | Validate in 14 days |
| Scope System            | [DONE] | `reference/concepts/scope-system.md`      | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Tombstone Pattern       | [DONE] | `reference/concepts/tombstone-pattern.md` | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Guard Pattern           | [DONE] | `reference/concepts/guard-pattern.md`     | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Edit Command (Detailed) | [DONE] | `reference/commands/edit.md`              | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Config Writer (Detail)  | [DONE] | `reference/config/config-writer.md`       | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Config Merger Contract  | [DONE] | `reference/config/config-merger.md`       | 2026-04-21   | 2026-04-21     | Validate in 14 days |
| Config Scope Split      | [DONE] | `reference/config/scope-split.md`         | 2026-04-21   | 2026-04-21     | Validate in 14 days |

## Standards Documentation

Prescriptive rules for code quality, testing, and content authoring. Lighter validation cadence -- validate when convention-keeper proposes updates, or quarterly.

| Area                          | File                                  | Last Moved | Last Audited | Scope disambiguator                                                                   |
| ----------------------------- | ------------------------------------- | ---------- | ------------ | ------------------------------------------------------------------------------------- |
| Clean Code Standards          | `standards/clean-code-standards.md`   | 2026-03-25 | 2026-04-02   |                                                                                       |
| E2E Testing Bible             | `standards/e2e-testing-bible.md`      | 2026-03-25 | 2026-04-02   |                                                                                       |
| E2E Sub-Standards             | `standards/e2e/` (7 files)            | 2026-03-25 | 2026-04-02   |                                                                                       |
| Prompt Engineering (phrasing) | `standards/prompt-bible.md`           | 2026-03-25 | 2026-04-21   | XML tags, delegation prompt shape, per-delegation boilerplate — **what to say**       |
| Loop Prompts (cadence)        | `standards/loop-prompts-bible.md`     | 2026-03-25 | 2026-04-21   | Ralph-loop iter discipline, completion promise, synthesis passes — **when/how often** |
| Skill Atomicity               | `standards/skill-atomicity-bible.md`  | 2026-03-25 | 2026-04-02   |                                                                                       |
| Skill Atomicity Primer        | `standards/skill-atomicity-primer.md` | 2026-03-25 | 2026-04-02   |                                                                                       |
| TypeScript Types              | `standards/typescript-types-bible.md` | 2026-03-25 | 2026-04-02   |                                                                                       |
| Documentation Standards       | `standards/documentation-bible.md`    | 2026-03-25 | 2026-04-21   |                                                                                       |
| Commit Protocol               | `standards/commit-protocol.md`        | 2026-03-25 | 2026-04-02   |                                                                                       |

## Agent Findings Pipeline

Sub-agent feedback loop for standards improvement. See [`agent-findings/README.md`](agent-findings/README.md) for pipeline details.

## Agent Suggestions

Forward-looking proposals (may or may not land). See [`agent-suggestions/README.md`](agent-suggestions/README.md) for the status enum (`proposal` / `approved` / `in-progress` / `mostly-completed` / `absorbed-informally` / `absorbed` / `rejected` / `superseded`) and resolution fields.

## Coverage Metrics

**Source Files:** 328 TypeScript files in `src/cli/` (203 production + 125 co-located tests) -- verified 2026-04-21
**E2E Suite:** 140 TypeScript files in `e2e/` (107 `*.test.ts` + 33 helpers/fixtures/pages)
**All major systems documented:** Yes

**Technical Areas:**

- Architecture: [DONE] (`architecture/overview.md` + `architecture-overview.md`)
- Commands: [DONE] (`commands/index.md` + `commands/edit.md` + `commands.md`)
- Type System: [DONE] (`types/core-types.md` + `types/operations-types.md` + `types/zod-schemas.md` + `type-system.md`)
- State Management: [DONE] (`wizard/store-map.md` + `store-map.md`)
- Compilation Pipeline: [DONE]
- Configuration: [DONE] (`config/configuration.md` + `config/config-writer.md` + `config/config-merger.md` + `features/configuration.md`)
- Wizard Flow: [DONE] (`wizard/flow.md` + `features/wizard-flow.md`)
- Skills & Matrix: [DONE]
- Plugin System: [DONE]
- Component Patterns: [DONE] (`wizard/component-patterns.md` + `component-patterns.md`)
- Utilities: [DONE]
- Test Infrastructure: [DONE] (`testing/infrastructure.md` + `testing/factories.md` + `testing/mock-data.md` + `testing/e2e-infrastructure.md` + `test-infrastructure.md`)
- Operations Layer: [DONE]
- Agent System: [DONE]
- Dependency Graph: [DONE] (`architecture/dependency-graph.md` + `dependency-graph.md`)
- Boundary Map: [DONE] (`architecture/boundary-map.md` + `boundary-map.md`)
- State Transitions: [DONE] (`wizard/state-transitions.md` CANONICAL + `state-transitions.md` POINTER)
- Findings Impact Report: [DONE]

**Cross-Cutting Concepts (NEW):**

- Scope System: [DONE] (`concepts/scope-system.md`)
- Tombstone Pattern: [DONE] (`concepts/tombstone-pattern.md`)
- Guard Pattern: [DONE] (`concepts/guard-pattern.md`)

## Validation History

### 2026-04-21 Ralph iter 50 -- first formal Map Self-Consistency Audit

Applied the 5-invariant audit codified in `standards/documentation-bible.md` (iter 49, rule 10).

**Invariant 1 (header counts match table rows):** PASS. Total Areas 32 = 18 original + 14 new; staleness dashboard 18 + 14 = 32 rows; Reference tables 18 + 14 = 32 rows.

**Invariant 2 (no duplicate rows):** PASS. No duplicate doc names in staleness dashboard.

**Invariant 3 (cross-surface sync):** 8 violations fixed. Reference-table `Last Validated` drifted to `2026-04-13` on 8 rows while staleness dashboard showed `0 days` and frontmatter `last_validated: 2026-04-21`. Bumped all 8 to `2026-04-21`:

1. Architecture Overview (`reference/architecture-overview.md`)
2. Commands Reference (`reference/commands.md`)
3. Type System (`reference/type-system.md`)
4. Component Patterns (`reference/component-patterns.md`)
5. Test Infrastructure (`reference/test-infrastructure.md`)
6. Test Infrastructure New (`reference/testing/infrastructure.md`)
7. Operations Types (`reference/types/operations-types.md`)
8. Zod Schemas (`reference/types/zod-schemas.md`)

**Invariant 4 (disk-vs-map):** PASS. 41 `.md` files on disk under `reference/` = 32 tracked + 9 pointer files documented in directory diagram (architecture/{overview,dependency-graph,boundary-map}, commands/index, wizard/{flow,state-transitions,store-map,component-patterns}, config/configuration). No orphans.

**Invariant 5 (header date freshness):** PASS. Date basis = 2026-04-21 = today.

**Root-cause enum audit (separate task, flag only):** Grepped `root_cause:` across `.ai-docs/agent-findings/*.md`. Found 1 violation outside widened enum: `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` uses `root_cause: scope-boundary-preserved` (not in `missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred`). Not fixed — flagged for convention-keeper disposition (widen enum vs. reclassify finding). `TEMPLATE.md`'s verbatim enum-list root_cause is expected (it's the template).

**No finding filed** — this iter is the codified audit procedure running for the first time; drift it caught (Reference-table dates) is the same class the procedure exists to detect.

### 2026-04-21 Ralph iter 49 -- documentation-bible.md rule incorporation

Cross-referenced 15 proposed rules from iter 11/12/13/16/25/26/32/33/37/39/40/41/42/43/45 findings against `standards/documentation-bible.md`. Rules 10-11 (findings-impact-report append-only + >10 regeneration trigger) already present from iter 40. Thirteen rules incorporated this iter, grouped to minimize surface area:

1. **Re-Validation Triggers (Beyond Calendar Cadence)** — covers iter 11, 12, 13 (finding/task-ID/concept-class triggers override cadence).
2. **Doc-Touching Changes table** — covers iter 32, 33 (dependency-graph + boundary-map revalidation on command/component/D-feature touches, with `NEEDS-VALIDATION` fallback).
3. **Command Reference Docs** — covers iter 25 (verify `static flags` / `baseFlags`, glob-diff, `Feature flag:` line).
4. **Known Limitations Rule** — covers iter 26 (TODO.md cross-ref for hardening-gap systems).
5. **Hydration-vs-Props / Hook Table / Hotkey Registry** — covers iter 16 (props-vs-hydrate, hook existence check, hotkey registry sentinel).
6. **Store Map Completeness** — covers store-map hydration finding (non-exported helpers, decision-probe consumers, hydration entry point).
7. **Guard / Silent-Guard Rules** — covers iter 12 (user-visible outcomes, silent-guard race-risk table).
8. **Exhaustive Enumeration over Glob Shorthand** — covers iter 37 (no `etc.` shorthand, exhaustive name lists).
9. **Splits & Pointers** — covers iter 41, 42 (original MUST become pointer same session, drift-candidate heuristic).
10. **Map Self-Consistency Audit** — covers iter 43 (5 invariants, decennial cadence).
11. **Agent Findings Frontmatter** section — covers iter 45 (require frontmatter, widen enum, `superseded_by` / `supersedes` keys, audits/ subdir).

No drift found during bible read-through. `Standards Documentation` table row for `standards/documentation-bible.md` bumped to `Last Validated 2026-04-21`.

### 2026-04-21 Ralph iter 43 -- DOCUMENTATION_MAP self-consistency audit

Audited the map itself for drift after ~42 iterations of row-level validation and date bumps. Fixes applied:

1. **Header count:** `Total Areas: 30 (18 original + 12 new)` → `32 (18 original + 14 new)`. New Files section grew to 14 when `config-merger.md` (iter4) and `scope-split.md` (iter5) were added 2026-04-21; header was never bumped.
2. **Duplicate row removed:** `| type-system.md (pointer) | 0 | - | OK |` deleted — the row above it (`type-system.md`) already carries the CONVERTED TO POINTER annotation. Single row suffices.
3. **Stale 11-day rows synced:** `compilation-pipeline.md`, `operations-layer.md`, `agent-system.md` showed `Days Stale: 11` while the Reference table showed `Last Validated: 2026-04-21`. All three bumped to `0` with annotation.
4. **Reference table stale dates synced:** `Dependency Graph` row said `2026-04-02` / `2026-04-02`; staleness dashboard showed `0` from iter32 today. Bumped to `2026-04-21` / `2026-04-21`.
5. **Date basis note:** updated 2026-04-13 → 2026-04-21, clarified pointer-row semantics.
6. **Notes for Next Session:** replaced 2026-04-02 context with iter43 summary + forward validation dates.

**Disk vs map audit:** 41 `.md` files under `reference/` on disk. Reference tables track 32 (18 original + 14 new). 9 pointer files (architecture/overview, architecture/dependency-graph, architecture/boundary-map, commands/index, wizard/{flow,state-transitions,store-map,component-patterns}, config/configuration) are intentionally not tracked in staleness dashboard — they redirect to originals. Directory-structure diagram documents all 41.

**Validation History chronology:** Entries are in reverse-chronological order (newest first) by date, but iter numbers interleave (iter 30 before iter 29 before iter 10 before iter 43 at top). Iter numbers are a logical ordering, not the primary sort key — acceptable.

**Finding filed:** `.ai-docs/agent-findings/2026-04-21-documentation-map-drift-iter43.md` — documenting map-self-drift as a new drift class distinct from content-vs-code drift.

### 2026-04-21 Ralph iter 30 -- Link-Integrity Audit: remaining reference/ dirs + root files

Audited link integrity across 30 files: subdirs `architecture/` (3), `commands/` (2), `wizard/` (4), `testing/` (4), `features/` (7); root-level `reference/` files (11): `architecture-overview.md`, `boundary-map.md`, `commands.md`, `component-patterns.md`, `dependency-graph.md`, `findings-impact-report.md`, `state-transitions.md`, `store-map.md`, `test-infrastructure.md`, `type-system.md`, `utilities.md`. Verified `related:` YAML frontmatter, explicit `[text](path)` markdown links, and backtick-wrapped `reference/...` path references.

**Link count:** ~95 link units total (58 frontmatter `related:` entries + 26 relative markdown body links `./` and `../` + 11 backtick-wrapped `reference/...` refs, plus 1 `../../agent-findings/` finding ref).

**Broken links:** 0.

**Pre-restructure path check:** Root-level files (e.g., `reference/architecture-overview.md`, `reference/commands.md`, `reference/component-patterns.md`, `reference/state-transitions.md`, `reference/test-infrastructure.md`, `reference/type-system.md`) are still referenced as "authoritative source until cleanup" by the subdir stubs. All originals exist on disk; stubs correctly point to them. No Phase 2+3 migration drift detected.

**Agent-findings reference:** `.ai-docs/agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md` (referenced from `testing/e2e-infrastructure.md:425`) resolves.

**No finding filed** -- link integrity clean across all remaining reference/ dirs and root-level files.

### 2026-04-21 Ralph iter 29 -- Link-Integrity Audit: concepts/ + types/ + config/

Audited link integrity across 10 files in `.ai-docs/reference/concepts/` (3), `.ai-docs/reference/types/` (3), `.ai-docs/reference/config/` (4). Verified `related:` YAML frontmatter lists AND markdown-body links (explicit `[text](path)` links + backtick-wrapped path references).

**Scope:**

- `concepts/guard-pattern.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`
- `types/core-types.md`, `types/operations-types.md`, `types/zod-schemas.md`
- `config/config-merger.md`, `config/config-writer.md`, `config/configuration.md`, `config/scope-split.md`

**Link count:** 76 link units total (37 frontmatter `related:` + 24 markdown body links + 15 backtick-wrapped path refs, including finding references and `todo/`, `changelogs/` references).

**Broken links:** 0.

**Pre-restructure path check:** The three `types/*.md` files reference `reference/type-system.md` in their "Split from:" headers; `type-system.md` still exists on disk (Phase 2+3 preserves originals alongside new structure), so these resolve correctly.

**Agent-findings references:** All 16 distinct findings referenced across the 10 files resolve in `.ai-docs/agent-findings/`.

**No finding filed** -- link integrity was already clean; this iter confirms no drift.

### 2026-04-21 Ralph iter 10 -- BaseStep Primitives Contract

Added new section "BaseStep Primitives Contract" to `reference/testing/e2e-infrastructure.md`, placed immediately before the existing "Page-Object Keypress Rule" so primitives are defined before the rule cites them.

**Content:**

- Enumerated all BaseStep members by type: 8 key-press primitives (`pressEnter`, `pressSpace`, `pressKey`, `pressEscape`, `pressArrowDown/Up/Right`, `pressCtrlC`), 6 wait primitives (`waitForStep`, `waitForStepAfter`, `waitForStableRender`, `waitForStableRenderAfter`, `waitForItemVisible`, `navigateCursorToItem`), 4 cursor/screen queries (`getOutput`, `getScreen`, `getRawCursor`, `getSummaryDiffEntries`), 4 composition helpers (`pressEnterAndWaitFor`, `abort`, `navigateDown/Up/Right`).
- Documented each primitive's contract as tables: PTY write, post-press delay (`INTERNAL_DELAYS.KEYSTROKE` 150ms or `STEP_TRANSITION` 500ms), whether it pre-waits for stable render (all NO except `getSummaryDiffEntries`).
- Captured invariants: callers must ensure prior frame stability; `pressEnterAndWaitFor` sentinel must be unique to next step's first frame; `waitForItemVisible` is visibility-only while `navigateCursorToItem` is cursor-position.
- Added a "Design Question" subsection presenting three options (A internalize wait in primitives, B status quo, C hybrid `pressAfterStable` helper) with trade-offs and a back-of-envelope cost estimate (~30-60s added suite time under contention if Option A is adopted, with `search-modal.type` as outlier needing exemption). Recommendation is Option C, flagged as doc-only observation.
- Noted the one primitive that already waits: `getSummaryDiffEntries` calls `waitForStableRender` internally before scraping.

**No finding filed** — iter 9's finding (`2026-04-21-e2e-build-step-keypress-missing-stable-render.md`) already documents the underlying drift; this iter is groundwork, not a new discovery.

**Files touched:** `reference/testing/e2e-infrastructure.md` (+~90 lines, new section only; no existing content changed).

### 2026-04-13 Pass 24 -- Final Sweep: Cross-Reference Verification + DOCUMENTATION_MAP Consistency

Complete cross-reference and consistency audit across all 39 reference documentation files.

**Part 1: Cross-reference verification (0 broken references):**

- Verified all `related:` YAML frontmatter paths across 50 files (all 39 reference files have frontmatter). Every path resolves to an existing file under `.ai-docs/`.
- Verified all markdown `[text](path)` links in reference doc bodies. All resolve to existing files.
- Verified all `> **See also:**` and `> **Detailed documentation:**` inline links (16 occurrences). All resolve correctly.
- Verified all 9 pointer file redirect targets (architecture/overview.md, architecture/dependency-graph.md, architecture/boundary-map.md, commands/index.md, wizard/flow.md, wizard/state-transitions.md, wizard/store-map.md, wizard/component-patterns.md, config/configuration.md). All point to existing files.

**Part 2: DOCUMENTATION_MAP consistency (1 issue found, fixed):**

- All 30 staleness dashboard entries (18 original + 12 new) verified to exist on disk.
- 9 pointer files exist on disk and are documented in the directory structure diagram (not tracked in staleness dashboard, which is correct since they just redirect).
- Directory structure diagram was missing `features/configuration.md` and `features/wizard-flow.md` from the `features/` listing. **Fixed:** added both with "(pointed to by ...)" annotations.
- File counts verified: 39 total reference files = 11 root + 7 features + 21 in subdirectories (3 architecture + 3 concepts + 2 commands + 4 wizard + 3 types + 2 config + 4 testing).

**Part 3: documentation-bible.md structure diagram update:**

- The directory structure diagram in `standards/documentation-bible.md` only showed the original flat structure. **Fixed:** updated to include all Phase 2+3 subdirectories (architecture/, concepts/, commands/, wizard/, types/, config/, testing/) with their files and annotations.

**Fixes applied (3 edits in 2 files):**

1. `DOCUMENTATION_MAP.md`: Added `features/configuration.md` and `features/wizard-flow.md` to directory structure diagram
2. `DOCUMENTATION_MAP.md`: Updated "Last Validated" header to pass 24, added pass 24 validation history entry
3. `standards/documentation-bible.md`: Updated directory structure diagram to reflect Phase 2+3 restructure

### 2026-04-13 Pass 21 -- Deep Validation of Wizard + Architecture + Component Patterns

Verified 8 documentation files against source code with 200+ individual claim checks:

**Files validated:**

- `state-transitions.md` (434 lines) -- every line reference, action table, reset matrix, initial state table, hotkey mapping
- `store-map.md` (255 lines) -- WizardState shape, all action signatures, computed getters, usage patterns
- `features/wizard-flow.md` (326 lines) -- WizardProps, WizardResultV2, hooks table, feature flags, domain descriptions, stack grouping
- `architecture-overview.md` (sections 11-13) -- scope system paths, tombstone types, stack grouping line references
- `component-patterns.md` (388 lines) -- CategoryOption type, SkillTag, StepAgents dual-scope, StackSelection grouping, hotkey registry
- `wizard/flow.md`, `wizard/state-transitions.md`, `wizard/store-map.md`, `wizard/component-patterns.md` -- pointer file targets verified

**Inaccuracies found and fixed (2):**

1. `state-transitions.md:196` -- `preselectAgentsFromDomains()` described as "Replaces (not merges)" but actual implementation merges with existing agentConfigs and preserves excluded entries. Fixed to accurate description.
2. `features/wizard-flow.md:239-248` -- Domain descriptions table missing `desktop` domain. Added `desktop: "Desktop applications"` matching `domain-selection.tsx:16`.

**Verified correct (sample of critical claims):**

- WizardStep union at wizard-store.ts:262-268
- WIZARD_STEPS at wizard-tabs.tsx:41-48
- createInitialState() at wizard-store.ts:633 (all 27 initial values match)
- selectStack() reset at wizard-store.ts:676
- goBack() at wizard-store.ts:1056-1064
- getStepProgress() at wizard-store.ts:1222 (all 7 step cases verified)
- DOMAIN_AGENTS at wizard-store.ts:185-196
- WizardProps at wizard.tsx:47-61, WizardResultV2 at wizard.tsx:32-45
- Forward navigation: stack-selection.tsx:178-207, :210-243; domain-selection.tsx:54; use-build-step-props.ts:36-37; wizard.tsx:143-144, :246-251; step-agents.tsx:211
- CategoryOption/CategoryRow at category-grid.tsx:12-36
- SkillTag at category-grid.tsx:80-179, lock icon at :169, scope badges at :146-155
- StepAgents at step-agents.tsx:165-329, secondaryScope at :264-268
- StackSection at stack-selection.tsx:69-103, GROUP_ORDER at :17, groupStacks at :21-62
- CLI_COLORS at consts.ts:181-198, UI_SYMBOLS at :99-115
- Feature flags: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true
- toggleTechnology guard at wizard-store.ts:836-841, exclusive guard at :857-866
- toggleAgent guard at wizard-store.ts:1068-1074
- toggleSkillScope at wizard-store.ts:952-1001
- resolveInstallPaths at local-installer.ts:104-116, writeScopedConfigs at :577
- Stack.group at matrix.ts:137, ResolvedStack.group at matrix.ts:251
- SkillConfig.excluded at config.ts:27, AgentScopeConfig.excluded at :34
- 24 source files / 15 test files in wizard/, 16 hooks / 3 test files in hooks/

### 2026-04-13 Pass 20 -- Phases 2+3 Directory Restructure and File Splits

Created new directory structure under `reference/` with 7 subdirectories and 19 new files:

**Phase 2 -- Directory Reorganization (7 new directories, 7 pointer files):**

- `architecture/overview.md`, `architecture/dependency-graph.md`, `architecture/boundary-map.md` -- pointer files to originals
- `commands/index.md` -- pointer to `commands.md`
- `wizard/flow.md`, `wizard/state-transitions.md`, `wizard/store-map.md`, `wizard/component-patterns.md` -- pointers to originals
- `config/configuration.md` -- pointer to `features/configuration.md`

**Phase 3 -- File Splits (12 new content files):**

1. `test-infrastructure.md` (774 lines) split into 4 files:
   - `testing/infrastructure.md` -- Vitest config, test projects, directory structure, error handling patterns
   - `testing/factories.md` -- All factory/helper/assertion tables (34 factories, 15 helpers, 12 assertions)
   - `testing/mock-data.md` -- SKILLS registry, TEST_CATEGORIES, mock-data module constants
   - `testing/e2e-infrastructure.md` -- E2E config, directory structure, POM, matchers, fixtures, timeout infrastructure

2. `type-system.md` (449 lines) split into 3 files:
   - `types/core-types.md` -- Type module structure, generated unions, core data structures, named aliases, type narrowing, type guards, typed helpers
   - `types/operations-types.md` -- Operations layer types, edit command types (ConfigChanges, detectConfigChanges, etc.)
   - `types/zod-schemas.md` -- All 39 schemas (bridge, loader, structural, strict)

3. New cross-cutting concept docs (3 files):
   - `concepts/scope-system.md` -- Consolidated from 5 source files
   - `concepts/tombstone-pattern.md` -- Consolidated from 4 source files
   - `concepts/guard-pattern.md` -- Consolidated from 2 source files

4. New detail docs (2 files):
   - `commands/edit.md` -- Detailed edit command (flow, types, exported utilities)
   - `config/config-writer.md` -- Config writer and config types writer detail

**Cross-references added to 4 original files:**

- `architecture-overview.md`: Notes on sections 11 (scope) and 12 (tombstone) pointing to concepts/
- `state-transitions.md`: Note on Global-Installed Guard Behavior pointing to concepts/
- `features/wizard-flow.md`: Note on Global-Item Guards pointing to concepts/
- `features/configuration.md`: Note on Scope-Aware Config Splitting pointing to concepts/

**Original files preserved:** All 18 original files remain untouched (except added cross-reference notes). User will handle cleanup.

### 2026-04-13 Pass 19 -- Phase 1 Frontmatter Addition

Added YAML frontmatter to all 18 reference docs (11 root + 7 features/). Each frontmatter block contains:

- `scope: reference` (all files)
- `area:` one of architecture, commands, wizard, types, config, testing, features
- `keywords:` searchable terms for AI agent discovery
- `related:` cross-references to related docs (relative paths from `.ai-docs/` root)
- `last_validated:` date matching the file's "Last Updated" header

**Area distribution:** architecture (5), wizard (4), features (4), commands (1), types (1), config (1), testing (1), features (1)

**Files updated (18):**

- `reference/architecture-overview.md`, `reference/boundary-map.md`, `reference/commands.md`
- `reference/component-patterns.md`, `reference/dependency-graph.md`, `reference/findings-impact-report.md`
- `reference/state-transitions.md`, `reference/store-map.md`, `reference/test-infrastructure.md`
- `reference/type-system.md`, `reference/utilities.md`
- `reference/features/agent-system.md`, `reference/features/compilation-pipeline.md`
- `reference/features/configuration.md`, `reference/features/operations-layer.md`
- `reference/features/plugin-system.md`, `reference/features/skills-and-matrix.md`
- `reference/features/wizard-flow.md`

**No content changes** -- only frontmatter blocks prepended before `# Title` headings.

### 2026-04-13 Pass 15 -- Update Pass 3 (0.122.0/0.123.0 changes)

Updated 2 reference docs to reflect changes shipped in releases 0.122.0 and 0.123.0:

1. **configuration.md**: Documented `generateProjectConfigWithInlinedGlobal()` no-dedup snapshot behavior (global + project entries preserved with `// global` / `// project` comments, excluded-entry tombstone mechanism). Added `buildSkillConfigForId()` project-over-global preference from `wizard-store.ts:153`.
2. **commands.md**: Updated `edit` command: `logChangeSummary()` now takes `newSkills`/`oldSkills` params, uses display names and scope labels `[G]`/`[P]`, G-to-P renders as green `+`. Documented exported-for-testing utilities: `ConfigChanges` type, `detectConfigChanges()`, `migratePluginSkillScopes()`, `PluginScopeMigrationResult` type.

### 2026-04-02 Pass 14 -- Behavioral Claims Verification (10 claims vs source code)

Verified 10 behavioral claims by reading actual implementation code. Focus: does the documentation accurately describe what the code DOES?

1. **architecture-overview.md source resolution precedence**: PASS -- doc says `--source flag > CC_SOURCE env var > project config > global config > default`. Code at `config.ts:83-131` confirms exact order: flag (line 91) > env (line 102) > effectiveConfig.source (project via `??` global, line 121) > DEFAULT_SOURCE (line 131).
2. **configuration.md isLocalSource()**: PASS -- doc says "Returns true for paths starting with `/` or `.`, false for remote protocols. Rejects `..` and `~` in non-remote sources." Code at `config.ts:431-447` confirms exact behavior.
3. **plugin-system.md deriveInstallMode()**: PASS -- doc says "Empty skills array = eject mode." Code at `installation.ts:27` confirms `if (skills.length === 0) return "eject"`.
4. **compilation-pipeline.md sanitizeCompiledAgentData()**: PASS -- doc lists all fields. Code at `compiler.ts:77-111` matches exactly.
5. **wizard-flow.md INFO_PANEL feature flag**: PASS -- doc says flag gates info panel visibility and footer label. Code confirms it gates three things: panel visibility (`wizard-layout.tsx:167`), footer label (`wizard-layout.tsx:218`), and hotkey handling (`wizard.tsx:116`).
6. **state-transitions.md goBack() from domains**: PASS -- doc correctly states side effects: `setApproach(null)`, `selectStack(null)` before `goBack()`. Code at `domain-selection.tsx:41-44` confirms.
7. **compilation-pipeline.md compileAgents() "thin facade"**: FAIL -- doc called it "thin facade" / "thin wrapper" but code at `compile-agents.ts:32-72` has 20+ lines of scope-filtering logic. **Fixed**: replaced with "scope-filtering orchestrator" / "scope-filtering + delegation."
8. **skills-and-matrix.md getAvailableSkills()**: PASS -- doc says "Get skills for a category with state annotations." Code confirms it annotates but does NOT filter.
9. **store-map.md reset()**: PASS -- doc says "Restore all state to createInitialState() defaults." Code at `wizard-store.ts:958` confirms.
10. **boundary-map.md private IP blocking**: FAIL -- doc omitted `172.16-31.x.x` and `0.0.0.0` from IP ranges. **Fixed**: added both.

**Fixes applied (3 edits in 2 files):**

- `boundary-map.md`: Added `172.16-31.x.x` and `0.0.0.0` to private IP blocking list
- `compilation-pipeline.md`: Replaced "thin facade" (line 16) and "Thin wrapper" (line 269) with accurate descriptions

### 2026-04-02 Pass 13 -- Code Example Verification (4 standards files)

Verified every code example in `clean-code-standards.md`, `typescript-types-bible.md`, `e2e-testing-bible.md`, and `commit-protocol.md` against actual source files.

**clean-code-standards.md (S3, S5, S6, S7, S8):**

- S3 `getErrorMessage()`: PASS -- signature `(error: unknown): string` matches `utils/errors.ts:2`
- S3.2 `handleError()`: PASS -- exists in `base-command.ts:26`, calls `getErrorMessage()` + `this.error(message, { exit: EXIT_CODES.ERROR })`
- S5.4 `sanitizeLiquidSyntax()`: PASS -- `compiler.ts:41`, signature `<T extends string>(value: T, fieldName: string): T`
- S6.4 SKILLS registry keys: PASS -- all 10 keys verified in `test-fixtures.ts` (react, vue, zustand, pinia, scss, tailwind, vitest, hono, drizzle, antiOverEng)
- S6.9 `createMockSkill()` signature: PASS -- `(id: SkillId, overrides?: Partial<ResolvedSkill>): ResolvedSkill` matches `helpers.ts:439`
- S7.1 `typedEntries` usage: PASS -- call syntax correct (actual function accepts wider `Partial<Record>` type)
- S7.3 Zod canonical pattern: PASS -- `schema.safeParse()` used in `schema-validator.ts:200`
- S7.4 `formatZodErrors` two variants: PASS -- `schemas.ts:776` takes `ZodIssue[]`, `schema-validator.ts:156` takes `ZodError`
- S8.4 Remeda production list: PASS -- all 13 functions (`unique`, `uniqueBy`, `sortBy`, `groupBy`, `mapValues`, `pipe`, `flatMap`, `filter`, `countBy`, `sumBy`, `difference`, `indexBy`, `zip`) confirmed in production files

**typescript-types-bible.md:**

- Section 6 `typedEntries`/`typedKeys` code example: FAIL -- showed `Record<K, V>` parameter but actual signature is `Partial<Record<K, V>>`. **Fixed.**
- All other TypeScript examples: PASS -- correct syntax, correct patterns
- Type guard examples (`isCategory`, `isDomain`, `isAgentName`): PASS -- match `type-guards.ts`
- Boundary cast taxonomy: PASS -- references to clean-code-standards.md Section 7.2 valid

**e2e-testing-bible.md:**

- Section 3.1 `runCLI` example: PASS -- destructured fields `{ exitCode, stdout, stderr, combined }` match actual return type
- Section 3.5 `InitWizard.launch({ source })`: PASS -- matches actual static method signature
- Section 4.6 page object methods table: PASS -- `completeWithDefaults`, `passThrough`, `passThroughAllDomains`, `waitForRawText` all verified
- Section 5.5 `ProjectBuilder` factories: PASS -- all 8 static methods + `createLocalSkill` + `writeProjectConfig` verified
- Section 5.6 `createE2ESource`/`createE2EPluginSource`: PASS -- both exist and are re-exported
- Section 7.1 TIMEOUTS values: PASS -- all 10 constants match `e2e/pages/constants.ts`
- Section 9.1 dual-scope helpers: PASS -- `initGlobal`, `initProject`, `createTestEnvironment`, `createDualScopeEnv` all exist
- Section 11 exports table: PASS -- all listed exports verified in `test-utils.ts`

**commit-protocol.md:**

- Conventional commits format: PASS -- matches actual git log (e.g., `chore(release): 0.100.0 -- ...`, `feat(wizard): ...`)
- Release commit format `chore(release): {version} -- brief summary`: PASS -- matches actual releases

**Fixes applied (1 edit):**

- `typescript-types-bible.md` Section 6: Updated `typedEntries` and `typedKeys` parameter types from `Record<K, V>` to `Partial<Record<K, V>>` to match actual `utils/typed-object.ts` signatures

### 2026-04-02 Round 10 Deep Verification (pass 9 fix verification + 10-item random deep check)

**Task 1: Verified pass 9 fixes (5 checks):**

1. **typescript-types-bible.md PermissionMode**: PASS -- 6 members including "delegate" match `src/cli/types/matrix.ts:14-20`
2. **e2e-testing-bible.md skill count**: PASS -- no "10-skill" or "10 skills" occurrences remain
3. **findings-impact-report.md deepMergeStacks**: FAIL -- lines 305/315 still said `deepMergeStacks()`. Fixed to `mergeConfigs()` (confirmed function exists in `config-merger.ts`). Agent file names (identity.md, playbook.md, output.md, metadata.yaml) verified against `src/agents/developer/cli-developer/`
4. **Agent findings (3 files)**: PASS -- all 3 findings properly documented with correct details

**Task 2: 10-item random deep verification:**

1. **architecture-overview.md Install Modes table**: FAIL -- missing `mixed` mode. Source `installation.ts:15` defines `InstallMode = "eject" | "plugin" | "mixed"`. Added `mixed` row to table. Line numbers for `detectInstallation()` (84) and `detectProjectInstallation()` (35) confirmed.
2. **commands.md doctor command**: PASS -- flags (`--source`/-s string, `--verbose`/-v boolean) match source. "Defined directly, not via BaseCommand.baseFlags" confirmed. All 5 checks exist (Config Valid, Skills Resolved, Agents Compiled, No Orphans, Source Reachable).
3. **commands.md eject command**: PASS -- args (type, not required, 4 options) and flags (--force/-f, --output/-o, --refresh, --source/-s) all match source. Key deps confirmed.
4. **type-system.md Zod Schemas**: PASS -- 39 exported schemas confirmed. 5 random schemas verified: `domainSchema` (line 45), `boundSkillSchema` (53), `metadataValidationSchema` (612), `hooksRecordSchema` (143), `skillFrontmatterLoaderSchema` (165).
5. **plugin-system.md Plugin Settings**: PASS -- all 3 functions (`getEnabledPluginKeys`, `resolvePluginInstallPaths`, `getVerifiedPluginInstallPaths`) and 2 types (`PluginKey`, `ResolvedPlugin`) confirmed in `plugin-settings.ts`.
6. **configuration.md Source Manager**: PASS -- all 3 functions (`addSource`, `removeSource`, `getSourceSummary`) confirmed in `source-manager.ts`.
7. **operations-layer.md functions**: PASS -- 3 random functions verified: `copyLocalSkills(skills, projectDir, sourceResult)`, `compileAgents(options)`, `findSkillMatch(skillName, results)` all match source signatures.
8. **dependency-graph.md wizard-store imports**: PASS -- all 4 lib imports confirmed: `deriveInstallMode` from installation, `resolveAlias` from matrix, `matrix/getSkillById/getCategoryDomain` from matrix-provider, `isCompatibleWithSelectedFrameworks` from wizard.
9. **clean-code-standards.md S12 Exit Codes**: PASS -- all 5 exit codes match: SUCCESS(0), ERROR(1), INVALID_ARGS(2), NETWORK_ERROR(3), CANCELLED(4).
10. **skill-atomicity-bible.md directory structure**: PASS -- verified against `web-framework-react` in skills repo. Directory has SKILL.md (with name/description frontmatter), metadata.yaml (category/slug/domain/author/displayName/cliDescription/usageGuidance), reference.md, examples/ (with core.md + topic files).

**Fixes applied (3 edits):**

- `findings-impact-report.md`: Replaced 2 stale `deepMergeStacks()` references with `mergeConfigs()` at lines 305 and 315
- `architecture-overview.md`: Added `mixed` install mode row to Install Modes table

### 2026-04-02 Round 9 Deep Verification (e2e-testing-bible.md, commit-protocol.md, e2e/ sub-standards)

Complete line-by-line verification of the most-edited standards docs. Verified every code example, constant reference, page object method, helper function, and anti-pattern against actual source files.

**e2e-testing-bible.md (4 fixes):**

1. Section 4.6: `BuildStep.passThroughAllDomains()` description said "Web -> API -> Shared" but actual code does "Web -> API -> Methodology". Fixed.
2. Section 8.1: Claimed "10 skills" but source has 9. Claimed "6 methodology skills (`meta-methodology-*`)" but actual breakdown is 5 web, 1 api, 3 meta. Updated skill count and domain table to match `create-e2e-source.ts`.
3. Section 3.4: Claimed both `CLI.run()` and `runCLI()` set `AGENTSINC_SOURCE: undefined` by default. Only `CLI.run()` does. Fixed.
4. Section 10.5: Referenced production constants (`CLAUDE_DIR`, `STANDARD_FILES.CONFIG_TS`) instead of E2E constants (`DIRS.CLAUDE`, `FILES.CONFIG_TS`). Fixed to match section 10.1's rule about using `e2e/pages/constants.ts`.

**commit-protocol.md (0 fixes):** All claims verified: conventional commits format, changelog files exist, `changelogs/` directory structure matches, pre-commit hook exists in `.husky/`.

**e2e/ sub-standards (0 fixes across 7 files):**

- README.md: Directory structure, file counts, config values all match filesystem and `vitest.config.ts`.
- assertions.md: All 12 matchers match `project-matchers.ts` and `setup.ts` type augmentation.
- patterns.md: All code examples use current page object APIs (`selectSkill`, `advanceToSources`, `setAllLocal`, `toggleAgent`).
- test-data.md: Fixture references correct (9 skills, correct `runCLI` vs `CLI.run()` difference documented).
- test-structure.md: Directory layout, naming conventions, cleanup patterns all accurate.
- page-objects.md: All page object methods verified against source (StackStep, DomainStep, BuildStep, SourcesStep, AgentsStep, ConfirmStep, SearchModal, BaseStep, TerminalScreen, WizardResult, DashboardSession, InteractivePrompt).
- anti-patterns.md: All anti-patterns still relevant, no banned references found.

### 2026-04-02 Round 8 Standards Audit (5 previously-unaudited standards docs)

Audited all 5 standards documents that had never been audited (Last Audited = `--`). Verified every technical claim, file path, function name, cross-reference, and code example against actual source.

**prompt-bible.md (2 fixes):**

1. Line 9: Removed dead cross-reference to `claude-architecture-bible.md` (file does not exist anywhere in the repository). Simplified the note to remove the link.
2. Line 1768: Removed reference to `claude-architecture-bible.md` in version history entry.

**skill-atomicity-bible.md (6 fixes across 3 sections):**

1. Line 47: Directory structure comment claimed metadata.yaml has `category, tags, version`. Fixed to `category, author, slug, displayName, etc.` -- per MEMORY.md "metadata.yaml must NOT have version or tags fields" and actual `metadataValidationSchema` in schemas.ts.
2. Lines 617-621: Quality Gate Checklist claimed required fields `category, author, version, cli_name, cli_description, usage_guidance` with snake_case names. Fixed to actual camelCase field names from schema: `category, author, slug, displayName, cliDescription, usageGuidance`. Removed `version` (does not exist). Removed `tags` checklist item (field does not exist). Removed `Version is an integer` checklist item.
3. Line 620: Changed `claude-architecture-bible.md` category enum reference to `src/cli/types/generated/source-types.ts CATEGORIES` (actual location).
4. Lines 622, 678: Changed `bun cc:validate` to `agentsinc validate` (no `cc:validate` script exists in package.json; actual CLI binary is `agentsinc`).

**documentation-bible.md (0 fixes):** All file paths verified correct. Staleness thresholds match DOCUMENTATION_MAP.md implementation. Cross-references to other standards docs valid. Code examples syntactically correct.

**loop-prompts-bible.md (0 fixes):** All 10 agent names verified present in AGENT_NAMES (23 agents). No codebase-specific file paths or function names to verify. Process documentation is accurate.

**skill-atomicity-primer.md (0 fixes):** No codebase-specific technical claims. References to skill-atomicity-bible.md and prompt-bible.md are valid.

**Result: 8 factual errors fixed across 2 files. 3 files had zero errors. All 5 standards docs now audited.**

### 2026-04-02 Round 7 Standards Fixes + DOCUMENTATION_MAP Audit + Final Grep Sweep

**Task 1: Fixed 3 stale `installLocal()` references in standards docs:**

- `standards/e2e-testing-bible.md:404` -- `installLocal()` -> `installEject()` (anti-pattern example)
- `standards/e2e-testing-bible.md:473` -- `installLocal()` -> `installEject()` (E2E definition)
- `standards/e2e/test-structure.md:206` -- `installLocal()` -> `installEject()` (E2E definition)

**Task 2: DOCUMENTATION_MAP.md self-audit (1 fix):**

- Staleness Dashboard was missing `findings-impact-report.md` entry (17 rows for 18 docs). Added with 5 days stale, 30-day threshold, OK status.
- Header metadata verified correct: Total Areas 18, Documented 18.
- Reference Documentation table verified: all 18 entries present, 17 show 2026-04-02, findings-impact-report.md shows 2026-03-28.
- Standards Documentation table verified: 10 entries, dates correct.
- Coverage Metrics verified: 317 TypeScript files, all areas [DONE].
- Validation history entries in chronological order (newest first), no duplicates.

**Task 3: Final grep sweep of all `.ai-docs/` (0 active issues found):**

- `installLocal` -- 0 hits in reference/, 0 hits in standards/ (all fixed). Remaining hits are validation history only.
- `setAllSourcesLocal` -- 0 hits in reference/ or standards/. Remaining hits are validation history only.
- `view-title.tsx` -- 0 hits in reference/ or standards/. Remaining hits are findings + validation history only.
- `stats-panel.tsx` -- 0 hits in reference/ or standards/. Remaining hits are findings + validation history only.
- `safeLoadYamlFile` -- 0 active references. Hits in reference/ are deletion notes ("was removed as dead code"). Remaining hits are findings + validation history.
- `0.94.0` / `0.74.10` -- 0 hits in active docs. All hits are validation history entries documenting past version bumps.
- `"local"` in reference/ -- all 5 hits are legitimate (CategoryPath type, SkillSourceType, categoryPathSchema). 0 install-mode context.
- `"local"` in standards/ -- 0 hits.

**Result: 0 active documentation issues remaining across all `.ai-docs/` files.**

### 2026-04-02 Round 6 Final Cross-Document Consistency Sweep

Full consistency audit across all 18 reference docs + standards docs + DOCUMENTATION_MAP.md. All 5 check axes passed.

**Check 1: Stale terminology grep (0 errors in reference/):**

- `installLocal` -- 0 hits in reference/ (all cleaned in prior rounds)
- `setAllSourcesLocal` -- 0 hits in reference/ (renamed to `setAllSourcesEject` in round 4)
- `LocalInstall` -- 0 hits in reference/
- `view-title.tsx` -- 0 hits in reference/
- `stats-panel.tsx` -- 0 hits in reference/
- `yaml.ts` as existing util -- 0 hits in reference/ (all correctly marked DELETED)
- `config/show.ts`, `config/path.ts` -- 0 hits in reference/
- `diff.ts`, `outdated.ts` -- 0 hits in reference/
- `safeLoadYamlFile` -- 0 active reference hits (only historical notes about deletion)
- **Standards note (out of scope):** `installLocal()` appears 3 times in `standards/e2e-testing-bible.md` and `standards/e2e/test-structure.md` as an anti-pattern example. Convention-keeper should update to `installEject()`.

**Check 2: Count consistency (0 errors):**

| Value            | Expected | Verified Against                            | Docs Referencing                         |
| ---------------- | -------- | ------------------------------------------- | ---------------------------------------- | -------------------- |
| Skills           | 161      | source-types.ts SKILL_MAP (lines 7-167)     | type-system.md, skills-and-matrix.md     |
| Categories       | 51       | source-types.ts CATEGORIES (lines 506-556)  | type-system.md, skills-and-matrix.md     |
| Domains          | 9        | source-types.ts DOMAINS (lines 563-573)     | type-system.md, skills-and-matrix.md     |
| AgentNames       | 23       | source-types.ts AGENT_NAMES (lines 579-603) | type-system.md, agent-system.md          |
| TypeScript files | 317      | `find src/cli -name '_.ts' -o -name '_.tsx' | wc -l`                                   | DOCUMENTATION_MAP.md |
| Zod schemas      | 39       | `grep -c` on schemas.ts                     | architecture-overview.md, type-system.md |
| Version          | 0.100.0  | package.json                                | architecture-overview.md                 |

**Check 3: Store line numbers (0 errors):**

All wizard-store.ts references consistent across store-map.md, state-transitions.md, wizard-flow.md:

| Reference          | Actual   | store-map.md | state-transitions.md | wizard-flow.md   |
| ------------------ | -------- | ------------ | -------------------- | ---------------- |
| useWizardStore     | :560     | :560         | (not referenced)     | (not referenced) |
| createInitialState | :530     | :530-558     | :530                 | (not referenced) |
| WizardState        | :190-497 | :190-497     | (refs store-map.md)  | (not referenced) |
| DOMAIN_AGENTS      | :93-104  | :93-104      | :93-104              | (not referenced) |
| goBack             | :898-906 | (no line)    | :898-906             | (not referenced) |
| getStepProgress    | :1001    | (no line)    | :1001                | (not referenced) |

**Check 4: Compiler line numbers (0 errors):**

All compiler.ts references consistent across compilation-pipeline.md, agent-system.md, architecture-overview.md, boundary-map.md:

| Function                  | Actual   | All docs agree |
| ------------------------- | -------- | -------------- |
| compileAllAgents          | :216     | :216           |
| compileAgent              | :190     | :190           |
| createLiquidEngine        | :394-419 | :394-419       |
| sanitizeCompiledAgentData | :77-111  | :77-111        |

**Check 5: Consts.ts line numbers (0 errors):**

All consts.ts references consistent across utilities.md, component-patterns.md, boundary-map.md, architecture-overview.md:

| Constant                  | Actual   | All docs agree |
| ------------------------- | -------- | -------------- |
| MAX_MARKETPLACE_FILE_SIZE | :150     | :150           |
| MAX_PLUGIN_FILE_SIZE      | :151     | :151           |
| MAX_CONFIG_FILE_SIZE      | :152     | :152           |
| MAX_JSON_NESTING_DEPTH    | :154     | :154           |
| MAX_MARKETPLACE_PLUGINS   | :155     | :155           |
| CLI_COLORS                | :185-196 | :185-196       |
| UI_SYMBOLS                | :99-115  | :99-115        |
| DEFAULT_BRANDING          | :170-173 | :170-173       |
| SCROLL_VIEWPORT           | :157-168 | :157-168       |
| UI_LAYOUT                 | :117     | :117           |
| UI_MESSAGES               | :124     | :124           |
| CLI_BIN_NAME              | :27      | :27            |

**Result: 0 errors in reference documentation. 3 stale `installLocal()` references in standards/ (convention-keeper scope).**

### 2026-04-02 Round 5 Final Exhaustive Verification (boundary-map.md)

Exhaustive line-by-line verification of EVERY claim in boundary-map.md -- the most error-prone document (4 errors round 1, 5 round 2, 3 cross-doc round 4). Checked all exec.ts, consts.ts, schemas.ts, command flags, plugin-\*, config.ts, compiler.ts, and skill-copier.ts references.

**16 errors fixed:**

1. `doctor` command flags line: `:325-335` -> `:372-382`
2. `import skill` flags: added `--subdir`, `--force`, `--refresh`; line range `:65-80` -> `:65-95`
3. `new skill` flags: added `--output`; line range `:47-67` -> `:47-73`
4. `search` flags: added `--json`; line range `:58-73` -> `:58-78`
5. `build plugins` flags: added `--skill`, `--verbose`; line range `:30-45` -> `:30-53`
6. `build stack` flags: added `--verbose`; line range `:52-67` -> `:52-74`
7. `build marketplace` flags: added `--version`, `--description`; line range `:39-54` -> `:39-62`
8. `config-loader.ts loadConfig()` range: `:26-58` -> `:26-65`
9. `MAX_CONFIG_FILE_SIZE` Used By: `safeLoadYamlFile` (dead) -> `permission-checker.tsx`
10. Skill copier function name: `copySkills()` -> `copySkillsToPluginFromSource()` / `copySkillsToLocalFlattened()` at `:131` / `:199`
11. `injectForkedFromMetadata()` line: `:~305+` -> `:299`
12. `readPluginManifest()` in plugin-finder.ts: `:57-69` -> `:49-71`
13. Plugin validation function name: `validatePlugin()` -> `validatePluginManifest()` with line range `:~115-149` -> `:114-183`
14. `validateSkillFrontmatter()` range: `:~184-219` -> `:185-219`
15. `validateAgentFrontmatter()` range: `:~221-254` -> `:221-264`
16. `plugin-validator.ts:335` description: "(test helper)" -> "(`loadManifestForValidation()`)"
17. `source-validator.ts` metadata schema line: `:184` -> `:189`; added `customMetadataValidationSchema` alternative
18. Init hook location range: `:24-34` -> `:24-40` (was missing `-s` short flag extraction at :37-40)

**All verified correct (no additional errors):**

- All exec.ts function line numbers: validatePluginPath(:20-41), validateMarketplaceSource(:43-64), validatePluginName(:66-87), execCommand(:95-130), claudePluginInstall(:137-152), isClaudeCLIAvailable(:154-161), claudePluginMarketplaceList(:170-195), claudePluginMarketplaceAdd(:202-220), claudePluginMarketplaceRemove(:222-240), claudePluginMarketplaceUpdate(:242-257), claudePluginUninstall(:259-278)
- JSON.parse at :180, Array cast at :191 -- both correct
- All consts.ts file size constants: MAX_MARKETPLACE_FILE_SIZE(:150), MAX_PLUGIN_FILE_SIZE(:151), MAX_CONFIG_FILE_SIZE(:152), MAX_JSON_NESTING_DEPTH(:154), MAX_MARKETPLACE_PLUGINS(:155)
- All SAFE patterns: SAFE_PLUGIN_PATH_PATTERN and SAFE_NAME_PATTERN char classes match actual regexes
- All command flag ranges for init(:162-168), edit(:81-90), compile(:31-41), list(:64-66), info(:85-92), eject(:79-94), update(:69-80), uninstall(:96-107), validate(:60-77), new agent(:80-97), new marketplace(:137-148)
- All schemas.ts line numbers (30+ schemas, 3 helpers) -- every single one verified
- pluginSettingsSchema(:34-38), installedPluginsSchema(:50-55) in plugin-settings.ts
- getEnabledPluginKeys(:63-98), resolvePluginInstallPaths(:103-173), getVerifiedPluginInstallPaths(:179-198)
- All config.ts security validation lines: NULL_BYTE(:293), LENGTH(:303), PATH_TRAVERSAL(:336), UNC(:418), CONTROL_CHAR(:406), validateHttpUrl(:357-387), PRIVATE_IP(:377), validateGitShorthand(:389-399), isLocalSource(:431-447)
- compiler.ts: LIQUID_SYNTAX_PATTERN(:31), sanitizeCompiledAgentData(:77-111), createLiquidEngine(:394-419), removeCompiledOutputDirs(:422-426)
- config-writer.ts: generateConfigSource(:35), ensureBlankGlobalConfig(:525), generateBlankGlobalConfigSource(:489), generateBlankGlobalConfigTypesSource(:503), JSON.parse(JSON.stringify) at :40-41,:59
- skill-copier.ts: validateSkillPath(:25-45), null byte(:30), path.resolve(:34-35), startsWith(:37-39)
- readFileSafe at utils/fs.ts:13-21
- All JSON parse boundary line numbers in Section 2.4
- All write boundary line numbers in Section 3
- Trust boundary diagram and data flow descriptions accurate
- No remaining yaml.ts references (correctly noted as removed in Section 2.1)
- No config command references
- No incorrect "local" references (all are legitimate local-skills/local-installer usage)

### 2026-04-02 Round 4 Deep Pass (wizard-flow.md, store-map.md)

Complete line-by-line reverification of 2 docs with substantial round-1 edits (7 and 8 errors respectively). Focus on areas not covered in round 3.

**wizard-flow.md (4 errors fixed):**

- Fixed WizardResultV2 line range: `:32-45` -> `:31-44` (off by 1)
- Fixed WizardProps line range: `:47-63` -> `:46-62` (off by 1)
- Fixed StepSettings feature-flag claim in component tree: was "(S hotkey on sources step; feature-flagged: SOURCE_SEARCH)" but the S hotkey in wizard.tsx:170 is NOT gated by SOURCE_SEARCH. Only the footer label visibility (wizard-layout.tsx:212) is gated. Updated to "always functional, footer label gated by SOURCE_SEARCH"
- Fixed S hotkey on sources step description: same issue, updated from "(feature-flagged: SOURCE_SEARCH)" to "(always functional; footer label gated by SOURCE_SEARCH)"

**All verified correct in wizard-flow.md (0 additional errors):**

- WizardStep type at wizard-store.ts:172-178 (6 steps, all correct)
- Step progression: stack -> domains -> build -> sources -> agents -> confirm (matches WIZARD_STEPS at wizard-tabs.tsx:41-48)
- All component tree entries exist: wizard.tsx, wizard-layout.tsx, wizard-tabs.tsx, info-panel.tsx, step-stack.tsx, stack-selection.tsx, domain-selection.tsx, step-build.tsx, category-grid.tsx, checkbox-grid.tsx, section-progress.tsx, step-sources.tsx, selection-card.tsx, source-grid.tsx, search-modal.tsx, step-agents.tsx, step-confirm.tsx, skill-agent-summary.tsx, step-settings.tsx
- Additional components verified: menu-item.tsx, selection-card.tsx, step-refine.tsx, toast.tsx all exist
- Feature flags verified: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true (feature-flags.ts:1-8)
- All 16 hooks verified to exist in src/cli/components/hooks/
- Build step logic functions verified: validateBuildStep, isCompatibleWithSelectedFrameworks, buildCategoriesForDomain (build-step-logic.ts:16, :38, :48)
- All hotkeys in hotkeys.ts verified: HOTKEY_INFO(I), HOTKEY_ACCEPT_DEFAULTS(A), HOTKEY_SCOPE(S), HOTKEY_SETTINGS(S), HOTKEY_TOGGLE_LABELS(D), HOTKEY_FILTER_INCOMPATIBLE(F), HOTKEY_SET_ALL_LOCAL(L), HOTKEY_SET_ALL_PLUGIN(P), HOTKEY_ADD_SOURCE(A)
- HOTKEY_COPY_LINK was removed in 0.130.0 cleanup (no longer in hotkeys.ts) — component-patterns.md iter15 removed its table row
- Key labels verified: KEY_LABEL_ENTER, KEY_LABEL_ESC, KEY_LABEL_SPACE, KEY_LABEL_TAB, KEY_LABEL_DEL, KEY_LABEL_ARROWS, KEY_LABEL_ARROWS_VERT, KEY_LABEL_VIM, KEY_LABEL_VIM_VERT (hotkeys.ts:48-56)
- isHotkey helper at hotkeys.ts:63 verified
- Hotkey contexts verified in wizard.tsx: I toggles info (116-128), A on build+stack jumps to confirm (142-149), S on build toggles skill scope (152-158), S on agents toggles agent scope (161-168), S on sources toggles settings (170-173, NOT gated by flag)
- Settings step hotkeys verified in step-settings.tsx: A (HOTKEY_ADD_SOURCE, :134), DEL/Backspace (:120), ESC via useKeyboardNavigation(:77)
- BUILT_IN_DOMAIN_ORDER at consts.ts:199 verified (8 domains in correct order)
- DEFAULT_SCRATCH_DOMAINS at consts.ts:211 verified (["web", "api", "mobile"])
- Domain descriptions table verified against BUILT_IN_DOMAIN_DESCRIPTIONS in domain-selection.tsx:10-19 (all 8 match exactly)
- Edit mode flow verified: useWizardInitialization walks steps via setStep() building history (use-wizard-initialization.ts:43-51)
- Framework-first filtering verified: use-framework-filtering.ts hook + build-step-logic.ts functions

**store-map.md (0 errors found, 0 fixes needed):**

- useWizardStore at :560 verified
- WizardState range :190-497 verified (starts at 190, `buildSourceRows` return type ends at 497)
- All 26 state fields verified present in WizardState type and createInitialState (lines 530-558)
- All 26 initial values verified correct against createInitialState output
- All 29 actions verified to exist with correct signatures (checked every one against wizard-store.ts)
- All 8 computed getters verified with correct return types
- DOMAIN_AGENTS at :93-104 verified (web:6, api:3, cli:3)
- Source sort tiers verified (4 tiers at :113-116, getSourceSortTier at :118-123)
- createInitialState at :530-558, reset at :958 -- both verified
- selectStack reset fields verified (9 fields at :571-583)
- All 10 production file consumers verified via grep for useWizardStore:
  - wizard.tsx, wizard-layout.tsx, step-build.tsx, step-sources.tsx, step-agents.tsx, stack-selection.tsx, domain-selection.tsx, info-panel.tsx, skill-agent-summary.tsx, use-wizard-initialization.ts
  - Correctly excludes: step-confirm.tsx, step-settings.tsx, source-grid.tsx (receive data via props)
  - Correctly excludes: use-build-step-props.ts (receives store as parameter, doesn't import useWizardStore)

### 2026-04-02 Cross-Document Consistency Audit (all 18 reference docs)

21 fixes across 7 files. Verified 6 consistency axes: local->eject rename, count consistency, version consistency, line number cross-references, deleted file references, command list consistency.

**Axis 1: local -> eject rename (12 fixes across 5 files):**

- **state-transitions.md (5):** Sources step "local" -> "eject". `setAllSourcesLocal()` -> `setAllSourcesEject()`. `source: "local"` -> `source: "eject"`. `non-local` -> `non-eject`. `InstallMode ("local"` -> `("eject"`. Hotkey description "local" -> "eject".
- **architecture-overview.md (2):** Install mode table "local" -> "eject". eject.ts comment "Eject to local mode" -> "Eject skills/templates to local filesystem".
- **commands.md (3):** `local/plugin/mixed` -> `eject/plugin/mixed`. `local/mixed` -> `eject/mixed`. `local-to-plugin and plugin-to-local` -> `eject-to-plugin and plugin-to-eject`.
- **configuration.md (1):** `source: "local"` comment -> `source: "eject"`.
- **plugin-system.md (1):** All three `"local"` mode references -> `"eject"` in deriveInstallMode section.

**Axis 2: Count consistency -- ALL CORRECT (0 fixes):**
Verified: Skills=161, Categories=51, Domains=9, AgentNames=23, Source files=317, Zod schemas=39.

**Axis 3: Version consistency -- ALL CORRECT (0 fixes):**
Only version reference: architecture-overview.md says 0.100.0 (correct).

**Axis 4: Line number cross-references (3 fixes in boundary-map.md):**

- `MAX_CONFIG_FILE_SIZE` line: `consts.ts:144` -> `consts.ts:152`
- `writeScopedConfigs()` range: `:~395-425` -> `:369-425`
- `MAX_JSON_NESTING_DEPTH` line: `consts.ts:146` -> `consts.ts:154`

All other cross-references verified consistent: `resolveSource` at config.ts:84, `detectInstallation` at installation.ts:84, `compileAllAgents` at compiler.ts:216, `createLiquidEngine` at compiler.ts:394, WizardState at :190-497, useWizardStore at :560.

**Axis 5: Deleted file references (6 fixes across 3 files):**

- **architecture-overview.md (2):** Removed `yaml.ts` from file tree. Updated `safeLoadYamlFile` reference to note deletion.
- **boundary-map.md (2):** Removed `yaml.ts` from boundary file list. Rewrote section 2.1 to note deletion and document inline parse pattern.
- **dependency-graph.md (2):** Marked `yaml.ts` section as DELETED. Updated observation from "is dead code" to "has been removed".

No other deleted file references found (config/, diff.ts, outdated.ts, view-title.tsx, stats-panel.tsx already cleaned in prior audits).

**Axis 6: Command list consistency -- ALL CORRECT (0 fixes):**
All 4 docs (architecture-overview, commands, dependency-graph, boundary-map) agree on same 11 commands + 7 subcommands. None reference deleted config/diff/outdated.

**Intentionally NOT changed (legitimate "local" usages):**

- `CategoryPath = Category | "local"` (type-system.md, boundary-map.md) -- "local" means local skills directory, not install mode
- `SkillSourceType = "public" | "private" | "local"` (type-system.md) -- "local" means skill source type, not install mode
- `copyLocalSkills`, `deleteLocalSkill`, `migrateLocalSkillScope` -- actual function names
- `local-installer.ts` -- actual file name
- "local skills" in component descriptions -- refers to skills on local disk

### 2026-04-02 Adversarial Audit (8 docs: operations-layer, configuration, plugin-system, agent-system, boundary-map, dependency-graph, state-transitions, compilation-pipeline)

14 errors fixed across 6 of the 8 files. 2 files (operations-layer.md, compilation-pipeline.md) had zero errors -- only date stamps updated.

**boundary-map.md (4 errors):**

- Fixed `list` command file path: `commands/list.tsx:64-66` (was `commands/list.ts:17-19`)
- Fixed `init` flags line: `commands/init.tsx:162-168` (was `:170-176`)
- Fixed `edit` flags line: `commands/edit.tsx:81-90` (was `:75-84`)
- Fixed file size constant lines in consts.ts: MAX_MARKETPLACE_FILE_SIZE `:150` (was `:142`), MAX_PLUGIN_FILE_SIZE `:151` (was `:143`), MAX_CONFIG_FILE_SIZE `:152` (was `:144`), MAX_JSON_NESTING_DEPTH `:154` (was `:146`), MAX_MARKETPLACE_PLUGINS `:155` (was `:147`)
- Fixed `writeStandaloneConfigTypes` file: `installation/local-installer.ts:344` (was `configuration/config-types-writer.ts`)

**dependency-graph.md (3 errors):**

- Removed `config` command row (commands/config/ directory deleted)
- Fixed `list` file path: `commands/list.tsx` (was `commands/list.ts`)
- Updated `list` direct lib imports: added `lib/installation/` (detectInstallation), `lib/configuration/project-config` (loadProjectConfig) -- the rewrite added these
- Added `list` to Command -> Component Imports table: imports `SkillAgentSummary` from wizard

**agent-system.md (3 errors):**

- Updated AGENT_NAMES: now 23 entries at `:579-605` (was 18 entries at `:550-571`). All 5 previously missing agents (ai-developer, ai-reviewer, api-pm, api-tester, infra-reviewer) are now in the generated union.
- Removed entire "Agents NOT in Generated Union" section (no longer accurate)
- Fixed AgentName type line: `:605` (was `:571`)

**plugin-system.md (2 errors):**

- Removed `installLocal()` function (no longer exists). Replaced with `installEject()`.
- Fixed barrel exports: `LocalInstallOptions`/`LocalInstallResult`/`installLocal`/`buildLocalSkillsMap` -> `EjectInstallOptions`/`EjectInstallResult`/`installEject`/`buildEjectSkillsMap`
- Fixed `Both installLocal() and installPluginConfig()` -> just `installPluginConfig()`

**state-transitions.md (4 errors):**

- Fixed `goBack()` line: `wizard-store.ts:898-906` (was `:890-898`)
- Fixed `getStepProgress()` line: `wizard-store.ts:1001` (was `:993-1021`)
- Fixed `createInitialState()` line: `wizard-store.ts:530` (was `:524-550`)
- Fixed `selectStack()` line: `wizard-store.ts:571` (was `:563-575`)
- Fixed `DEFAULT_SCRATCH_DOMAINS` line: `consts.ts:211` (was `:202`)

**configuration.md (1 error):**

- Fixed `DEFAULT_BRANDING` line: `consts.ts:170-173` (was `:162-165`)

**All verified correct (no changes needed):**

- operations-layer.md: All 20 file structure entries, all type/function tables, all command consumer mappings, all data flow diagrams verified
- compilation-pipeline.md: All compiler.ts line numbers (sanitizeLiquidSyntax :41, sanitizeCompiledAgentData :77, readAgentFiles :118, buildAgentTemplateContext :151, compileAgent :190, compileAllAgents :216, compileAllSkills :263, copyClaudeMdToOutput :332, compileAllCommands :350, createLiquidEngine :394, removeCompiledOutputDirs :422), output-validator.ts lines, recompileAgents :157, discoverInstalledSkills :112
- boundary-map.md: exec.ts validation functions (:20, :43, :66), shell commands (:137, :154, :170, :202, :222, :242, :259), schemas.ts helper functions (:776, :784, :803), all schema line numbers verified, source validation chain (:84, :142, :291, :431) all correct
- configuration.md: ProjectConfig :66-146, SkillConfig :23-27, AgentScopeConfig :30-33, ResolvedConfig :18-22, resolveSource :84, validateSourceFormat :291, resolveAgentsSource :142, all config I/O function lines, all config-generator.ts lines (:47, :146, :169), all config-merger.ts lines (:25, :89), writeProjectConfig operation :43
- agent-system.md: All agent type lines in agents.ts (:9, :17, :27, :41, :55, :62, :71, :89, :108), compiler.ts function lines (:77, :118, :151, :190, :216, :394), STANDARD_FILES :50-60, agentYamlConfigSchema :215-227, DOMAIN_AGENTS :93-104, loadAllAgents :38, getAgentDefinitions :13
- plugin-system.md: All plugin-validator.ts lines (:64, :114, :185, :221, :351, :381, :459), all local-installer.ts lines (:96, :251, :282, :300, :309, :336, :369, :492), detection functions (:26, :35, :59, :84, :95), all exec.ts function lines

### 2026-04-02 Adversarial Audit (architecture-overview.md)

4 errors fixed, 0 additions. Version bump, command removal, file rename, and line drift since 2026-03-28 (version 0.94.0 -> 0.100.0).

**Errors fixed:**

- Fixed version: 0.100.0 (was 0.94.0)
- Removed `config/` subdirectory from directory structure (commands `config show`, `config path` deleted)
- Fixed `list.ts` -> `list.tsx` and updated description: "Show installation information (Ink component)" (was "List installed skills")
- Fixed file size limits line: `consts.ts:150-152` (was :143-145, shifted by new constants EJECT, BULLET, LABEL_BG)

**Source file count updated in DOCUMENTATION_MAP.md:** 317 (was 327, -10 from removed commands and related files)

**All verified correct (no changes needed):**

- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- resolveSource at config.ts:84-132, validateSourceFormat at config.ts:291 with helpers through :447
- sanitizeCompiledAgentData at compiler.ts:77-111, createLiquidEngine at compiler.ts:394-419
- detectInstallation at :84, detectProjectInstallation at :35, writeScopedConfigs at :369
- generateConfigSource at config-writer.ts:35, resolveRelationships at skill-resolution.ts:150
- exec.ts validation at :7-87
- Technology stack versions: ink v5, Zustand v5, Zod v4.3.6, Remeda v2.33.6
- Zod schema count: 39 exported schemas (still correct)
- Feature flags: SOURCE_SEARCH, SOURCE_CHOICE, INFO_PANEL (all confirmed)
- Data flow, wizard steps, security measures, install modes -- all verified unchanged

### 2026-04-02 Adversarial Audit (commands.md)

7 errors fixed. Removed deleted `config` command (row from Commands Index + Operations Layer table). Fixed `list` command: file path `list.ts` -> `list.tsx`, type `ts` -> `tsx`, rewrote detailed section from old plain-TS description to Ink-based implementation (ListView component, SkillAgentSummary, detectInstallation, loadProjectConfig, TTY/non-TTY branching), updated Operations Layer description. Fixed `edit` summary: "Edit installed skills via wizard" -> "Edit skills in the plugin" (matches actual `static summary`), added styled output description (chalk-colored change summary, simplified completion message). Verified `config/`, `diff`, `outdated` commands all deleted from filesystem. Verified message counts unchanged (ERROR=10, SUCCESS=5, STATUS=12, INFO=6). Version 0.100.0 confirmed.

### 2026-04-02 Adversarial Audit (skills-and-matrix.md)

5 count errors fixed, 0 line number errors, 0 structural errors. All 18 matrix-resolver.ts line numbers verified correct. All 8 matrix-provider.ts line numbers verified correct. All 3 skill-resolution.ts line numbers verified correct. All 7 stacks-loader.ts line numbers verified correct. SourceLoadResult line range (62-69) verified correct. rawMetadataSchema line range (26-36) verified correct. Barrel exports from matrix/index.ts verified (14 from matrix-resolver, validateConflicts/Requirements/Exclusivity/Recommendations correctly documented as non-barrel). default-rules.ts verified against documented relationship types.

**Count drift (5 errors):**

- Fixed SKILL_MAP count: 161 (was 155, +6 skills added)
- Fixed Categories count: 51 (was 50, +1 category added)
- Fixed Domains count: 9 (was 8, "desktop" domain added)
- Fixed Domains list: added "desktop" (was missing from enumeration)
- Fixed AgentNames count: 23 (was 18, +5 agents added)

**All verified correct (no changes needed):**

- All 18 matrix-resolver.ts function line numbers
- All 8 matrix-provider.ts exports and line numbers
- All 3 skill-resolution.ts exports and line numbers
- All 7 stacks-loader.ts function line numbers
- SourceLoadResult type at source-loader.ts:62-69
- rawMetadataSchema at matrix-loader.ts:26-36
- Barrel export documentation (matrix/index.ts)
- Relationship system table (6 types)
- Data flow pipeline (7 steps)
- All file structure tables (matrix, skills, loading, stacks)
- Operations layer integration table

### 2026-04-02 Adversarial Audit (wizard-flow.md, component-patterns.md)

19 errors fixed across 2 files. 1 finding written.

**wizard-flow.md (7 errors):** INFO_PANEL default false→true. BUILT_IN_DOMAIN_ORDER line 190→199. Default scratch domains line 202→211. Removed deleted view-title.tsx and stats-panel.tsx entries. Added SkillAgentSummary to StepConfirm component tree. Rewrote InfoPanel section (old groupSkillsByBucket/groupAgentsByScope helpers replaced with marketplace/stack header + SkillAgentSummary delegation).

**component-patterns.md (12 errors):** Added missing skill-agent-summary.tsx and toast.tsx to directory listing. Removed deleted view-title.tsx and stats-panel.tsx. CLI_COLORS range 177-187→185-196, added LABEL_BG. UI_SYMBOLS range 99-112→99-115, added LOCK, EJECT, BULLET. CategoryOption type: added locked field. HOTKEY_ACCEPT_DEFAULTS context fixed. Rewrote InfoPanel section, replaced StatsPanel with SkillAgentSummary documentation. SCROLL_VIEWPORT range 149-160→157-168.

**Finding:** `agent-findings/2026-04-02-documentation-references-deleted-files.md`

### 2026-04-02 Verification Pass (post-edit validation of utilities.md, component-patterns.md, type-system.md, store-map.md)

Second-pass verification of recently edited docs (sorted by edit count: utilities 18, component-patterns 12, type-system 10, store-map 8). Purpose: catch errors introduced by the editing process itself.

**1 error fixed:**

- component-patterns.md: Inline `CLI_COLORS` reference at line 103 still said `177-187` (stale from before the +8 shift), while the Color Constants section header already said `185-196`. Fixed inline reference to `185-196`.

**All other edits verified correct:**

- **utilities.md (18 edits):** All line numbers verified via `sed -n`: UI_LAYOUT :117, CLI_COLORS :185, SCROLL_VIEWPORT :157, DEFAULT_BRANDING :170, 5 Limits :150-155, GITHUB_SOURCE :129, DEFAULT_SKILLS_SUBDIR :135, KEBAB_CASE_PATTERN :138, BUILT_IN_DOMAIN_ORDER :199, DEFAULT_SCRATCH_DOMAINS :211. UI_SYMBOLS has exactly 15 members (counted). UI_MESSAGES at :124. SOURCE_DISPLAY_NAMES has "eject" not "local". yaml.ts confirmed deleted. All exec.ts line numbers verified: ExecResult :89, execCommand :95, claudePluginInstall :137, isClaudeCLIAvailable :154, MarketplaceInfo :163, claudePluginMarketplaceList :170, claudePluginMarketplaceExists :197, claudePluginMarketplaceAdd :202, claudePluginMarketplaceRemove :222, claudePluginMarketplaceUpdate :242, claudePluginUninstall :259. WarnOptions at :66. Message counts: ERROR=10, SUCCESS=5, STATUS=12, INFO=6.
- **component-patterns.md (12 edits):** skill-agent-summary.tsx and toast.tsx exist in wizard/. view-title.tsx and stats-panel.tsx confirmed deleted. CLI_COLORS range 185-196, UI_SYMBOLS range 99-115, SCROLL_VIEWPORT range 157-168 all verified. LOCK/EJECT/BULLET in UI_SYMBOLS table. CategoryOption has `locked` field at category-grid.tsx:20. InfoPanel: no props, reads skillConfigs/agentConfigs/selectedStackId/enabledSources from store. SkillAgentSummary: exports SkillAgentSummaryProps, SkillAgentSummary, TableHeader, ScopeLabel, EjectIcon -- all confirmed.
- **type-system.md (10 edits):** SKILL_MAP at source-types.ts:6. SkillSlug at :170. SkillId at :171. AgentName at :579 with 23 entries (counted). Domain at :563 with 9 entries (counted). Category at :505 with 51 entries (counted). "desktop" is in domain list. SKILL_MAP has 161 entries (counted).
- **store-map.md (8 edits):** useWizardStore at :560. WizardState :190-497. installedSkillConfigs and installedAgentConfigs both in store. setAllSourcesEject exists, setAllSourcesLocal does not. createInitialState at :530-558. reset at :958. skill-agent-summary.tsx imports useWizardStore (confirmed). canGoToNextDomain/canGoToPreviousDomain are `() => boolean` getter functions.

### 2026-04-02 Adversarial Audit (utilities.md, store-map.md, type-system.md)

36 errors fixed across 3 files. 1 finding written.

**utilities.md (18 errors):** yaml.ts updated to DELETED status. All line numbers shifted +8 due to new UI_SYMBOLS entries (EJECT, BULLET, SCROLL_UP, SCROLL_DOWN): UI_LAYOUT 114→117, CLI_COLORS 177→185, SCROLL_VIEWPORT 149→157, SOURCE_DISPLAY_NAMES 171→179, DEFAULT_BRANDING 162→170, DEFAULT_PUBLIC_SOURCE_NAME 168→176, HASH_PREFIX_LENGTH 132→140, CACHE_HASH_LENGTH 135→143, CACHE_READABLE_PREFIX_LENGTH 138→146, all 5 Limits 142-147→150-155, GITHUB_SOURCE 121→129, DEFAULT_SKILLS_SUBDIR 127→135, KEBAB_CASE_PATTERN 130→138, BUILT_IN_DOMAIN_ORDER 190→199, DEFAULT_SCRATCH_DOMAINS 202→211. Added missing UI_MESSAGES constant. Added EJECT, BULLET, SCROLL_UP, SCROLL_DOWN to UI_SYMBOLS (full 15 members). SOURCE_DISPLAY_NAMES value fixed: "local"→"eject".

**store-map.md (8 errors):** useWizardStore line 552→560. WizardState shape range 190-493→190-497. Added missing installedSkillConfigs and installedAgentConfigs fields. setAllSourcesLocal→setAllSourcesEject rename. Source sort tier "local/installed"→"eject/global (installed on disk)". reset() line 524-550→createInitialState at 530-558, reset at 958. Added skill-agent-summary.tsx consumer. canGoToNextDomain/canGoToPreviousDomain return types boolean→() => boolean (getter functions).

**type-system.md (10 errors):** SKILL_MAP line 165→6. SkillId/SkillSlug count 155→161. SkillSlug line 164→170. AgentName line 571→579, count 18→23 (added ai-developer, ai-reviewer, api-pm, api-tester, infra-reviewer). Domain line 546→563, count 8→9 (added desktop). Category line 540→505, count 50→51 (added desktop-framework). Domain list: added desktop.

**Finding:** `agent-findings/2026-04-02-local-to-eject-rename.md`

### 2026-04-02 Deep Second Pass (agent-system.md, compilation-pipeline.md)

Exhaustive line-by-line verification of 2 docs that received only light coverage in the remaining-docs audit. Every line number, type definition, function signature, and pattern claim checked against actual source files.

**agent-system.md (1 fix):**

- Fixed re-export chain: clarified that `AGENT_NAMES` value is NOT barrel-exported through `types/index.ts` (which uses `export type *`). Consumers import from `agents.ts` or `source-types.ts` directly. Also fixed line reference `:3-6` -> `:5-6` (lines 3-4 are import, 5-6 are re-exports).

**All verified correct in agent-system.md (0 additional errors):**

- All 10 agent type definitions in agents.ts verified: AgentHookAction :9-14, AgentHookDefinition :17-20, BaseAgentFields :27-38, AgentDefinition :41-52, AgentConfig :55-59, AgentYamlConfig :62-68, AgentFrontmatter :71-86, CompiledAgentData :89-105, AgentSourcePaths :108-112
- AgentName at source-types.ts:605 (23 entries at :579-603 verified)
- agentYamlConfigSchema at schemas.ts:215-227 verified
- ModelName at matrix.ts:11, PermissionMode at matrix.ts:14-20 verified
- STANDARD_FILES at consts.ts:43-61 (agent constants at 50, 56-60) verified
- All 10 Key Functions: loadAllAgents :38, readAgentFiles :118, buildAgentTemplateContext :151, sanitizeCompiledAgentData :77, compileAgent :190, compileAllAgents :216, createLiquidEngine :394, sanitizeLiquidSyntax :41, getAgentDefinitions :13, loadAgentDefs :21
- DOMAIN_AGENTS at wizard-store.ts:93-104 verified (web:6, api:3, cli:3 agents)
- 11 unmapped agents verified (4 meta, 2 pattern, 1 planning, 2 reviewer, 1 tester, 1 developer)
- Agent inventory: 23 agents, 20 opus / 3 sonnet verified via metadata.yaml grep
- skill-summoner tools (WebSearch, WebFetch, no Bash) verified
- Template variables table verified against agent.liquid (snake_case property names match template)
- Methodology partials: 5 rendered + 1 unrendered (improvement-protocol.liquid) verified
- createLiquidEngine template roots (3 paths) verified
- Engine config (extname, strictVariables, strictFilters) verified

**compilation-pipeline.md (0 errors found, 0 fixes):**

- All 11 compiler.ts function line numbers verified: sanitizeLiquidSyntax :41, sanitizeCompiledAgentData :77, readAgentFiles :118-149, buildAgentTemplateContext :151-172, compileAgent :190, compileAllAgents :216, compileAllSkills :263-321, copyClaudeMdToOutput :332-339, compileAllCommands :350-381, createLiquidEngine :394-419, removeCompiledOutputDirs :422-426
- LIQUID_SYNTAX_PATTERN at :31 verified
- Skill split logic at :156-158 verified
- All 6 output-validator.ts line numbers verified: checkXmlTagBalance :5, checkTemplateArtifacts :37, checkRequiredPatterns :53, validateFrontmatter :76, validateCompiledAgent :108, printOutputValidationResult :140
- All 9 compiler.ts function signatures verified against actual code
- All 6 output-validator.ts function signatures verified
- recompileAgents at agent-recompiler.ts:157 verified, all 9 flow steps match actual code
- compileAgents at compile-agents.ts:32 verified
- discoverInstalledSkills at discover-skills.ts:112 verified
- resolveAgents at resolver.ts:153 verified
- All 4 plugin-mode compilers verified: compileSkillPlugin :99, compileAgentPlugin :44, compileStackPlugin :191, compileAgentForPlugin :72
- compileAgentForPlugin 3 differences from standard compileAgent verified (pluginRef format, preloaded IDs, direct file reading)
- resolveClaudeMd at resolver.ts:22 verified
- validateCompiledAgent 4 checks verified (frontmatter, XML, artifacts, patterns)
- checkRequiredPatterns 4 checks verified (frontmatter start, role, principles, min length)
- Template root resolution hierarchy (3 paths) verified against createLiquidEngine code

### 2026-04-02 Round 4 Deep Pass (operations-layer.md, dependency-graph.md)

Complete line-by-line verification of 2 docs that received only date-stamp updates in round 1. Every operation function, type definition, function signature, dependency table, command-to-operation mapping, data flow diagram, and consumer count verified against actual source files.

**operations-layer.md (2 errors fixed):**

- Fixed test file count: 10 co-located test files (was 9 -- missed detect-project.test.ts)
- Fixed discover-skills.ts Lower-Level Lib Dependencies: added `utils/logger.js` (verbose, warn) and `utils/typed-object.js` (typedEntries, typedKeys) that were omitted while other entries in the same table included their utils imports

**All verified correct in operations-layer.md (0 additional errors):**

- All 19 file structure entries match filesystem (2 root + 3 barrels + 14 operations)
- All 3 source types: LoadSourceOptions (4 fields), LoadedSource (2 fields), MarketplaceResult (2 fields)
- All 8 skills types: DiscoveredSkills (6 fields), ScopedSkillDir (3 fields), ScopedSkillDirsResult (5 fields), SkillCopyResult (3 fields), SkillComparisonResults (3 fields), SkillMatchResult (2 fields), PluginInstallResult (2 fields), PluginUninstallResult (2 fields)
- All 7 project types: DetectedProject (3 fields), BothInstallations (3 fields), CompileAgentsOptions (9 fields), CompilationResult (3 fields), ConfigWriteOptions (5 fields), ConfigWriteResult (6 fields), AgentDefs (3 fields)
- All 15+ function signatures verified: loadSource, ensureMarketplace, discoverInstalledSkills, loadSkillsFromDir, discoverLocalProjectSkills, mergeSkills, collectScopedSkillDirs, copyLocalSkills, compareSkillsWithSource, buildSourceSkillsMap, findSkillMatch, installPluginSkills, uninstallPluginSkills, detectProject, detectBothInstallations, compileAgents, loadAgentDefs, writeProjectConfig
- All 7 command consumer rows verified: init (8 ops), edit (10 ops), compile (4 ops), update (6 ops), doctor (2 ops), search (1 op), eject (1 op)
- All 3 data flow diagrams verified: init flow (6 steps), compile flow (dual-pass), edit flow (10 steps)
- All 14 Lower-Level Lib Dependencies entries verified against actual imports

**dependency-graph.md (3 errors fixed):**

- Fixed Key Observations: utils/fs.ts consumer count 54 -> 52 (table body already said 52, summary was inconsistent)
- Fixed utils/errors.ts: added base-command.ts to Commands layer, updated count 10 -> 11, total 32 -> 33
- Fixed utils/typed-object.ts: Lib count 17 -> 16 (was counting test helper **tests**/helpers.ts), total 24 -> 23

**All verified correct in dependency-graph.md (0 additional errors):**

- All 18 Command -> Operations Map rows verified: 8 commands with operations match actual imports, 10 commands with "(none)" confirmed via grep
- All Command -> Direct Lib Imports verified for: init (6 modules), edit (4 modules), compile (2 modules), doctor (4 modules), eject (3 modules), search (2 modules), list (3 modules)
- Command -> Component Imports table verified: init, edit, list, update, uninstall, search, new/agent, build/stack
- All Operations -> Lib Map entries verified (2 source, 5 project, 8 skills)
- Store -> Lib Dependencies verified (4 lib modules: installation.ts, matrix/, matrix-provider.ts, wizard/)
- All 13 Component -> Lib Dependencies verified via grep
- Shared utility consumer counts verified: exec.ts=8, fs.ts=52, logger.ts=57, errors.ts=33, messages.ts=9, typed-object.ts=23, string.ts=3, type-guards.ts=2, frontmatter.ts=4
- Layer diagram and allowed dependency directions table unchanged and correct

### 2026-04-02 Round 5 Final Verification (state-transitions.md)

Exhaustive verification of all line references, state transition diagrams, eject terminology, feature-flag gating, and consts.ts references. Every wizard-store.ts function/action/getter line number verified.

**7 errors fixed:**

- Fixed `step-agents.tsx:207` -> `:216` (setStep("confirm") is at line 216)
- Fixed `wizard.tsx:148-149` -> `:147-148` (setStackAction at 147, setStep at 148)
- Fixed `wizard.tsx:243-246` -> `:240-245` (onContinue callback spans 240-245)
- Fixed `wizard.tsx:144-147` -> `:142-146` (accept-defaults condition check)
- Added missing `installedSkillConfigs` and `installedAgentConfigs` to Initial State table (both `null`)
- Fixed step sequence diagram: added missing `setStackAction("customize")` and `setApproach("stack")` for stack item path
- Fixed Derived State table: escaped pipe characters in union types (`Domain | null`, `"eject" | "plugin" | "mixed"`) that were breaking markdown table columns

**All verified correct (0 additional errors):**

- WizardStep type at :172-178 (6 variants)
- WIZARD_STEPS at wizard-tabs.tsx:41-48 (6 steps, labels match)
- createInitialState at :530 (26 fields, order matches doc)
- selectStack at :571 (9 fields reset)
- goBack at :898-906 (pops history, falls back to "stack")
- getStepProgress at :1001 (all 7 rows in logic table traced through code)
- nextDomain at :780-789, prevDomain at :791-800
- DOMAIN_AGENTS at :93-104 (web:6, api:3, cli:3 agents)
- DEFAULT_SCRATCH_DOMAINS at consts.ts:211 (web, api, mobile)
- BUILT_IN_DOMAIN_ORDER at consts.ts:199 (8 domains)
- Feature flags: SOURCE_SEARCH=false, SOURCE_CHOICE=false, INFO_PANEL=true
- stack-selection.tsx: scratch at :160, stack at :169 (both setStep("domains"))
- domain-selection.tsx: onContinue at :53 (setStep("build"))
- use-build-step-props.ts: nextDomain at :36, setStep("sources") at :37
- All hotkey registrations verified against hotkeys.ts constants
- Overlay blocking logic verified (showSettings blocks all except S, showInfo blocks all except ESC/I)
- No remaining "local" references in install-mode contexts
- All 3 cross-referenced docs exist (store-map.md, wizard-flow.md, component-patterns.md)

### 2026-03-28 Adversarial Audit (utilities.md)

0 errors found, 0 fixes needed. Full adversarial verification of all 10 utility files, all function signatures and line numbers, all message counts (ERROR=10, SUCCESS=5, STATUS=12, INFO=6), all 8 exec.ts exported functions + 4 internal helpers, all 11 fs.ts functions, all 4 logger functions + WarnOptions + buffering API, all 4 type-guard functions, all consts.ts constants (paths, DIRS, STANDARD_FILES x17, STANDARD_DIRS x3, branding, versioning, hashing, limits, YAML formatting, UI constants, schema paths, source resolution, domain config). string.ts already documented with correct signature and 3 importers. yaml.ts dead code confirmed (zero production importers, only yaml.test.ts). All mock files verified. Documentation was already fully current from prior update session.

### 2026-03-28 Adversarial Audit (wizard-flow.md)

15 errors fixed, 8 additions. Step progression missing "domains" step. Phantom HelpModal and ? hotkey removed (file does not exist). WizardResultV2 line range fixed (32-45 not 30-43). BUILT_IN_DOMAIN_ORDER expanded from 5 to 8 domains (ai, infra, meta added) at line 190 (not 191). Phantom computeOptionState() removed, isCompatibleWithSelectedFrameworks() added. WizardProps: removed phantom marketplaceLabel, added isEditingFromGlobalScope. Added Feature Flags section, Info Panel section, F/I hotkeys, Settings hotkeys, domain descriptions table.

### 2026-03-28 Adversarial Audit (architecture-overview.md)

Deep adversarial verification after 14 days stale, 204 file changes, version 0.74.10 -> 0.94.0.

**architecture-overview.md -- 11 errors fixed, 5 omissions added:**

- Fixed version: 0.94.0 (was 0.74.10)
- Fixed `detectInstallation()` line: 84 (was 103)
- Fixed `writeScopedConfigs()` line: 369 (was 422)
- Fixed `generateConfigSource()` line: 35 (was 29)
- Fixed `resolveRelationships()` line: 150 (was 147)
- Fixed template root resolution: `createLiquidEngine()` at 394-419 (was 400-434)
- Fixed `sanitizeCompiledAgentData()` range: 77-111 (was 77-112)
- Fixed wizard steps: added missing "domains" step (stack -> domains -> build -> sources -> agents -> confirm)
- Updated Zod schema count: 39 (was "30+")
- Updated feature flags: added SOURCE_CHOICE and INFO_PANEL (was only SOURCE_SEARCH)
- Added `operations/` directory with 3 subdirectories (source, skills, project) to directory structure
- Added `string.ts` utility to utils listing
- Added operations layer to data flow section
- Updated configuration directory comment to include config-generator
- Updated data flow Installation section to reference operations layer

**All verified correct (no changes needed):**

- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- baseFlags: only `--source` (confirmed)
- resolveSource at config.ts:84-132
- validateSourceFormat at config.ts:291-320 with helpers through :447
- File size limits at consts.ts:143-145
- exec.ts validation at :7-87
- Source file count: 327 TypeScript files
- Technology stack versions: ink v5, Zustand v5, Zod v4.3.6, Remeda v2.33.6
- Vitest config: 3 projects (unit, integration, commands)
- Config subcommands: show, path (+ index.ts alias)
- All directory structure entries verified

### 2026-03-28 Adversarial Audit (skills-and-matrix.md)

28 errors fixed, 4 sections added. 15 function line numbers drifted in matrix-resolver.ts: resolveAlias 20->33, getDependentSkills 48->61, isDiscouraged 94->139, getDiscourageReason 153->253, isRecommended 234->403, getRecommendReason 266->435, getAvailableSkills 454->645, getSkillsByCategory 485->673, validateSelection 424->593, validateConflicts 282->451, validateRequirements 305->474, validateExclusivity 341->510, validateRecommendations 372->541. Also: resolveRelationships 147->150, mergeMatrixWithSkills 97->100 (skill-resolution.ts). SourceLoadResult 61-67->62-69 with missing marketplaceDisplayName field. rawMetadataSchema 26-37->26-36. Removed phantom tags from metadata.yaml example. Counts: SKILL_MAP 86->155, Categories 34->50, Domains 5->8, AgentNames 17->18. Added 5 undocumented matrix-resolver exports (getUnmetRequiredBy, isIncompatible, hasUnmetRequirements, getIncompatibleReason, getUnmetRequirementsReason). Added hasSkill to matrix-provider with barrel note. New sections: Current Counts, Skill Generators, Operations Layer Integration, expanded stacks-loader.

### 2026-03-28 Adversarial Audit (plugin-system.md)

17 line errors fixed, 4 sections added. See inline comments in plugin-system.md for full details. Key corrections: installLocal :584, installPluginConfig :492, writeScopedConfigs :369, detectInstallation :84, detectGlobalInstallation :59, getInstallationOrThrow :95, validatePlugin :351. Added mode-migrator.ts section, operations layer plugin ops, 3 missing exec.ts functions, installation barrel exports.

### 2026-03-28 Adversarial Audit (configuration.md)

9 line-number errors fixed, 1 phantom function removed, 1 section added. Prior 2026-03-14 audit marked several stale values as "verified correct" but those had already drifted. Fixed: `generateConfigSource` :29->:35, `buildStackProperty` :142->:146, `splitConfigByScope` :199->:169, removed phantom `compactStackForYaml`, `mergeWithExistingConfig` :83->:89, `mergeConfigs` :24->:25, `writeScopedConfigs` :422->:369, `DEFAULT_BRANDING` :163-166->:162-165, `SCHEMA_PATHS` :79-86->:78-85. Added Operations Layer section for `writeProjectConfig()` at operations/project/write-project-config.ts:43.

### 2026-03-28 Adversarial Audit (store-map.md)

Deep validation of every line number, state field, action, getter, and consumer against `src/cli/stores/wizard-store.ts` (1105 lines). 17 errors found and fixed:

**Line number drift (4 errors):**

- Fixed `useWizardStore` line: 552 (was 494)
- Fixed `WizardState` shape range: 190-493 (was 149-439)
- Fixed `createInitialState()` range: 524-550 (was 468-492)
- Fixed `DOMAIN_AGENTS` range: 93-104 (was 54-65)

**Missing "domains" step (2 errors):**

- Added `"domains"` to WizardStep union (was missing entirely)
- Fixed step progression: `stack -> domains -> build -> sources -> agents -> confirm` (was missing `domains`)

**Phantom state field (1 error):**

- Removed `showHelp` (does not exist in code -- was renamed to `showInfo`)

**Missing state fields (3 errors):**

- Added `filterIncompatible: boolean` (filter incompatible skills in build step)
- Added `showInfo: boolean` (info overlay visible -- replaced `showHelp`)
- Added `isEditingFromGlobalScope: boolean` (disables scope toggling when editing from ~/.claude/)

**Phantom action (1 error):**

- Removed `toggleHelp` (does not exist -- was renamed to `toggleInfo`)

**Missing actions (3 errors):**

- Added `toggleFilterIncompatible` (toggle filtering + removes incompatible web skills on enable)
- Added `toggleInfo` (toggle info overlay)
- Added `setCurrentDomainIndex` (set domain index directly, no-op if out of range)

**Consumer list drift (2 errors):**

- Removed `step-stack.tsx` (no longer imports useWizardStore directly)
- Added `info-panel.tsx` (new consumer: info overlay showing selected skills/agents)

**Initial state values (1 error):**

- Updated initial state: replaced `showHelp: false` with `filterIncompatible: false`, `showInfo: false`, `isEditingFromGlobalScope: false`

**All verified correct (no changes needed):**

- Zustand v5 library, single store pattern
- All 10 Selection State fields
- All 2 Source State fields
- All 3 Approach State fields
- All 5 Scope/Source Per-Skill actions and signatures
- All 5 Source Management actions and signatures
- All 3 Population actions and signatures
- All 8 Computed Getters and return types
- `deriveInstallMode` signature and behavior
- `selectStack()` reset behavior (9 fields reset)
- DOMAIN_AGENTS content (web=6, api=3, cli=3 agents)
- Source sort tiers (4 tiers)
- Usage pattern code examples

### 2026-03-28 Adversarial Audit (commands.md)

Complete rewrite after 14 days stale. Every command file (23 total) read in full. Every flag verified against actual `static flags` definitions. Operations layer usage mapped per command.

**commands.md -- FULL REWRITE. Major drift found:**

- Prior doc had ZERO mention of operations layer -- 10 commands using operations now documented with specific operation calls
- Prior `init` flow outdated: now uses 8 operations (loadSource, ensureMarketplace, installPluginSkills, copyLocalSkills, writeProjectConfig, compileAgents, discoverInstalledSkills, loadAgentDefs)
- Prior `edit` flow missed: detectProject, uninstallPluginSkills, scope migration, agent scope changes, migration handling
- Prior `compile` flow missed: detectBothInstallations, scopeFilter on passes, buildCompilePasses logic
- Prior `list` summary wrong: was "List installed skills", actual: "Show installation information" (alias: ls)
- Prior doc had NO flags/details for 17 of 23 commands
- doctor defines source flag directly (not via BaseCommand.baseFlags) -- now documented
- Added complete flags/args tables for all 23 commands
- Added Operations Layer Usage by Command cross-reference table
- Added exported utilities from init: formatDashboardText, showDashboard, getDashboardData

### 2026-03-28 Adversarial Audit (utilities.md)

10 errors/omissions fixed: Added `string.ts` module (truncateText, 3 importers), 2 missing exec.ts wrappers (Remove/Update, total now 8), ExecResult/MarketplaceInfo types, warn() WarnOptions param, MAX_CONFIG_FILE_SIZE line (:144 was :145), 9 missing STANDARD_FILES entries, DIRS/Branding/Schema/Source/Domain sections. Flagged yaml.ts as dead code.

**Verified correct (unchanged):** Exit codes (5), message counts (ERROR=10, SUCCESS=5, STATUS=12, INFO=6), BaseCommand flag (--source), all 23 file paths, config subcommands (show, path only)

### 2026-03-14 Second-Pass Audit (architecture-overview.md, type-system.md)

Deep adversarial verification of every line number, count, function signature, directory structure, and data flow claim against actual source code.

**architecture-overview.md -- 3 errors fixed:**

- Fixed config subcommands: was "(get, set-project, show, path, unset-project)" but only `show.ts`, `path.ts`, and `index.ts` (alias for show) exist. Changed to "(show, path)"
- Fixed Data Flow: `render(<Wizard matrix={matrix} />)` was wrong -- Wizard does not receive matrix as a prop. Changed to `render(<Wizard projectDir={...} marketplaceLabel={...} />)` and added note that wizard imports matrix from matrix-provider.ts directly
- Fixed Data Flow: `loadSkillsMatrixFromSource() -> MergedSkillsMatrix` was imprecise -- returns `SourceLoadResult` (which contains matrix + sourceConfig). Changed to `-> SourceLoadResult (matrix + sourceConfig)`

**type-system.md -- 1 error fixed:**

- Fixed `projectConfigLoaderSchema` validates column: was `.claude-src/config.yaml`, changed to `.claude-src/config.ts` (config files are now TypeScript loaded via jiti)

**All verified correct (no changes needed):**

- Version 0.74.10 matches package.json
- CLI_BIN_NAME at consts.ts:27, BaseCommand at base-command.ts:12
- resolveSource at config.ts:84, sanitizeCompiledAgentData at compiler.ts:77-112
- validateSourceFormat at config.ts:291-320 with helpers through :447
- File size limits at consts.ts:143-145, exec.ts validation at :7-87
- generateConfigSource at config-writer.ts:29, writeScopedConfigs at local-installer.ts:422
- resolveRelationships at skill-resolution.ts:147, template root at compiler.ts:400-434
- 293 TypeScript files, 86 SKILL_MAP entries, 17 AgentNames, 5 Domains, 34 Categories
- All union type line numbers (SkillId :96, SkillSlug :95, AgentName :347, Domain :323, Category :317)
- All Named Aliases line numbers, all Core Data Structure line ranges
- All 10 Wizard/UI type line ranges, all type guard and typed object helper signatures
- All 26 Zod schema names exist, all 3 utility functions exist
- Directory structure matches actual filesystem, WizardStep union confirmed

### 2026-03-14 Second-Pass Audit (test-infrastructure.md)

Adversarial audit of first-pass validation results for test-infrastructure.md. Errors found and fixed:

- Added missing co-located test: `src/cli/lib/source-validator.test.ts`
- Added 2 missing component tests: `hotkeys.test.ts`, `utils.test.ts`
- Added 2 missing factory functions to table: `createMockRawStacksConfigWithArrays()`, `createMockRawStacksConfigWithObjects()`
- Added new "Test Utilities" section documenting 9 helper functions omitted from factory table: `runCliCommand`, `readTestYaml`, `readTestTsConfig`, `writeTestTsConfig`, `parseTestFrontmatter`, `createTestDirs`, `cleanupTestDirs`, `createTempDir`, `cleanupTempDir`
- Fixed unit test project include pattern: added `scripts/**/*.test.ts` (was missing)
- Added note that smoke tests use `*.smoke.test.ts` pattern, not matched by E2E vitest config

Verified correct (no changes needed):

- E2E file counts: commands=24, interactive=24, lifecycle=11, integration=3, smoke=3, total=65
- SKILLS registry: 10 entries
- TEST_CATEGORIES: 15 entries
- All keyboard/timing constants match source
- All 5 content generator functions match source
- All 6 mock-data files match source
- E2E helper files match source
- Fixture directory structure matches source (no `configs/` or `matrix/` subdirectories)

### 2026-03-14 Second-Pass Audit (configuration.md, plugin-system.md)

Deep adversarial verification of every claim in configuration.md and plugin-system.md against actual source code. All line numbers, type definitions, function signatures, and file paths verified correct. No hallucinated content found from the prior agent pass. Omissions found and fixed:

**features/configuration.md -- 0 errors, 5 additions:**

- All 14 documented line numbers verified correct against source code
- All 3 type definitions (ProjectConfig, SkillConfig, AgentScopeConfig, ResolvedConfig) verified exact match
- All 5 source resolution precedence steps verified against `resolveSource()` implementation
- Added 4 undocumented exported functions to Config I/O table: `getProjectConfigPath()` (:24), `resolveAllSources()` (:224), `resolveAuthor()` (:204), `formatOrigin()` (:172)
- Added `isLocalSource()` documentation with behavior description (:431)
- Added `SplitConfigResult` return type to `splitConfigByScope()` description

**features/plugin-system.md -- 0 errors, 4 additions:**

- All 16 documented line numbers verified correct against source code
- All type definitions (PluginManifest, Marketplace) verified exact match
- All 5 exec.ts shell command strings verified against actual `execCommand()` calls
- Fixed `deriveInstallMode()` to document empty-skills-array case (returns `"local"`)
- Added Plugin Manifest Finder section documenting `findPluginManifest()` (walks up dirs)
- Added Plugin Info section documenting 4 exported functions and 2 types from `plugin-info.ts`
- Added exported frontmatter validators `validateSkillFrontmatter()` (:184) and `validateAgentFrontmatter()` (:220)

**Cross-reference checks passed:**

- architecture-overview.md agrees on `resolveSource()` at config.ts:84, `validateSourceFormat()` at :291
- type-system.md agrees on `ProjectConfig` at types/config.ts:66-146
- installation/index.ts barrel exports match all documented re-exports

### 2026-03-14 Second-Pass Adversarial Audit (commands.md, utilities.md)

Deep verification of every claim in commands.md and utilities.md against actual source code. Major hallucination errors found and fixed from prior agent pass:

**commands.md -- 8 errors fixed:**

- Removed phantom `--dry-run` base flag (does not exist in BaseCommand; only `--source` is a base flag)
- Removed 3 phantom config subcommands: `config get` (get.ts does not exist), `config set-project` (set-project.ts does not exist), `config unset-project` (unset-project.ts does not exist). Only `config` exists (show/path subcommands later removed).
- Removed phantom `--dry-run` from init flags (init only has `--refresh`, `--source`)
- Removed phantom `--dry-run` from edit flags (edit only has `--refresh`, `--agent-source`, `--source`)
- Removed phantom `--output` and `--dry-run` from compile flags (compile only has `--verbose`, `--agent-source`, `--source`)
- Removed phantom "Custom output" compile mode description (no `--output` flag exists)
- Fixed config section: `.claude-src/config.yaml` changed to `.claude-src/config.ts` (TypeScript format)
- Updated compile flow description: now describes dual-pass global+project compilation with `detectGlobalInstallation()` and `detectProjectInstallation()`

**utilities.md -- 3 additions, no errors:**

- Added `GLOBAL_INSTALL_ROOT`, `SKILL_CATEGORIES_PATH`, `SKILL_RULES_PATH` to paths table
- Added `STANDARD_FILES.CONFIG_TS` and `STANDARD_FILES.CONFIG_TYPES_TS` to standard files table
- Added Startup Message Buffering subsection documenting `enableBuffering()`, `drainBuffer()`, `disableBuffering()`, `pushBufferMessage()` and `StartupMessage` type

**All verified correct (no changes needed):**

- Exit codes (5 entries in exit-codes.ts)
- Message counts: ERROR_MESSAGES=10, SUCCESS_MESSAGES=5, STATUS_MESSAGES=12, INFO_MESSAGES=6
- Line numbers: getErrorMessage :2, execCommand :95, extractFrontmatter :3, safeLoadYamlFile :13, MAX_CONFIG_FILE_SIZE :145
- All 6 Claude CLI wrapper functions in exec.ts
- All 4 type guard functions in type-guards.ts
- All 11 fs.ts function signatures
- All 4 logger functions plus style guide
- typedEntries/typedKeys signatures
- All consts.ts constant values and limits

### 2026-03-14 Targeted Validation (commands.md, utilities.md, test-infrastructure.md)

Validated against source code after significant test infrastructure and command changes (Feb 25 - Mar 14).

**commands.md:**

- Updated `init` flow: documented Dashboard shown when project CLI config exists (`detectInstallation()`)
- Added marketplace registration step before plugin installation (`claudePluginMarketplaceExists()` + `claudePluginMarketplaceAdd()`)
- Added `edit` cwd fix note (commit 093e18b)
- Updated key dependencies: added `detectInstallation`, `deriveInstallMode`
- Fixed SUCCESS_MESSAGES count: 5 (was 6)
- Fixed INFO_MESSAGES count: 6 (was 7)
- Removed DRY_RUN_MESSAGES (object deleted from messages.ts)

**utilities.md:**

- Added `type-guards.ts` module with 4 functions: `isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`
- Fixed `execCommand` line reference: 95 (was 94)
- Fixed `MAX_CONFIG_FILE_SIZE` line reference: 145 (was 140)
- Removed `SKILLS_MATRIX_PATH` from consts paths (deleted from consts.ts)
- Fixed SUCCESS_MESSAGES count: 5 (was 6)
- Fixed INFO_MESSAGES count: 6 (was 7)
- Removed DRY_RUN_MESSAGES (object deleted from messages.ts)

**test-infrastructure.md:**

- Added `content-generators.ts` to directory structure (5 renderer functions)
- Added `test-fs-utils.ts` to directory structure
- Added `mock-data/` directory with 6 files: mock-agents, mock-categories, mock-matrices, mock-skills, mock-sources, mock-stacks
- Removed phantom `configs/` and `matrix/` from fixtures subdirectories (do not exist)
- Added `compile.test.ts` to command tests listing
- Added `install-mode.integration.test.ts` to integration tests
- Added 22 new co-located test files: configuration/**tests**/ (8 files), mode-migrator, matrix-provider, skill-resolution, config-generator, config-merger, versioning, local-installer, use-section-scroll, etc.
- Expanded factory functions table: 6 -> 35 factories documented
- Added Content Generators section
- Added Canonical Test Fixtures section (SKILLS registry table, TEST_CATEGORIES table)
- Added Mock Data Module section documenting all 6 mock-data files
- Removed `OUTPUT_STRINGS` section (deleted from helpers.ts)
- Removed `TEST_AVAILABLE_SKILLS` reference (deleted)
- Added complete E2E test infrastructure section: config, directory structure (65 E2E files across 5 directories), helpers, E2E file split history
- Added `setupFiles: ["./vitest.setup.ts"]` to config section
- Updated `buildSourceResult` signature: now takes 3 params (matrix, sourcePath, overrides)

### 2026-03-14 Architecture Overview Validation

Validated `architecture-overview.md` against current source code. Significant drift found and fixed:

- Fixed version: 0.74.10 (was 0.47.0)
- Fixed CLI_BIN_NAME line: consts.ts:27 (was :24)
- Fixed BaseCommand line: base-command.ts:12 (was :11)
- Fixed baseFlags: only `--source` (was `--dry-run, --source` -- dry-run does not exist)
- Fixed source resolution: config.ts:84-132 (was :100-148)
- Fixed source precedence: `.claude-src/config.ts` (was `config.yaml`), added global step
- Fixed install mode detection: installation.ts detectInstallation():103, detectProjectInstallation():35 (was :23-60)
- Fixed template root resolution: compiler.ts:400-434 (was :412-437)
- Fixed sanitize line range: compiler.ts:77-112 (was :77-115)
- Fixed validateSourceFormat: config.ts:291-320 with helpers to 447 (was :307-445)
- Fixed file size limits: consts.ts:143-145 (was :137-140)
- Fixed exec.ts validation: :7-87 (was :19-86)
- Added `config-exports.ts` to directory structure
- Added `types/generated/` directory (source-types.ts, matrix.ts)
- Added `utils/type-guards.ts` (isCategory, isDomain, isAgentName, isCategoryPath)
- Added `lib/feature-flags.ts`
- Added `select-list.tsx` to common components
- Added jiti to technology stack (config loader)
- Added new sections: Generated Types (7), Matrix Provider and Skill Resolution (8), Config Writer (10)
- Updated Data Flow to include generateConfigSource() and writeScopedConfigs()
- Updated source file count: 293 (was 253)

### 2026-03-14 Configuration + Plugin System Validation

Validated `features/configuration.md` and `features/plugin-system.md` against source code after significant changes (R-11 config writer consolidation, scope-aware config splitting, global defaults).

**features/configuration.md:**

- Config files changed from `.yaml` to `.ts` (TypeScript loaded via jiti)
- Removed `ProjectSourceConfig` type (consolidated into unified `ProjectConfig` at `types/config.ts`)
- Removed `saveProjectConfig()` (replaced by `generateConfigSource()` + `writeFile()`)
- Added 7 new files: `config-writer.ts`, `config-types-writer.ts`, `config-loader.ts`, `define-config.ts`, `default-categories.ts`, `default-rules.ts`, `default-stacks.ts`
- Added scope-aware config splitting section (`splitConfigByScope`, `writeScopedConfigs`)
- Added config-types writer section (narrowed unions, global/project split)
- Added `loadGlobalSourceConfig()` function
- Updated source resolution to 5-tier precedence (flag > env > project > global > default)
- Updated all line references: `resolveSource()` :84, `resolveAgentsSource()` :142, `resolveBranding()` :216, `validateSourceFormat()` :291, `loadProjectSourceConfig()` :28, `ResolvedConfig` :18-22
- Updated branding example from YAML to TypeScript
- Added `SkillConfig` and `AgentScopeConfig` type sections
- Updated schema table (removed `projectSourceConfigValidationSchema`)

**features/plugin-system.md:**

- Updated `installLocal()` line: :634 (was :511)
- Updated `installPluginConfig()` line: :542 (was :435)
- Added scope-aware installation section with `writeScopedConfigs` and helper functions table
- Updated detection section: now uses `detectProjectInstallation()` :35 + `detectGlobalInstallation()` :68 fallback
- Added `deriveInstallMode()` documentation
- Added `getInstallationOrThrow()` reference
- Updated marketplace command descriptions (scope param is `"project" | "user"`)
- Added `readPluginManifest()` and `getPluginSkillIds()` to plugin-finder table
- Added `validateAllPlugins()` and `printPluginValidationResult()` to validation section
- Added `getPluginDir()` to manifest generation table
- `validatePlugin()` line verified correct at :350

### 2026-03-14 Targeted Validation (skills-and-matrix.md, wizard-flow.md)

Validated against source code after significant matrix and wizard changes (Feb 25 - Mar 14).

**features/skills-and-matrix.md:**

- Replaced `skills-matrix.yaml` references with `skill-categories.ts` + `skill-rules.ts` (YAML config replaced by TS config)
- Removed phantom `SkillsMatrixConfig` type and `skillAliases` field (no longer exist)
- Removed phantom `displayNameToId` references -- alias resolution now uses `slugMap`
- Added new `matrix-provider.ts` to file structure table with all 6 exported functions
- Added new `skill-resolution.ts` to file structure table with `mergeMatrixWithSkills` and `synthesizeCategory`
- Documented R-08 unified `resolveRelationships()` -- 5 separate resolve functions consolidated into single internal function
- Moved `mergeMatrixWithSkills()` from matrix-loader.ts to skill-resolution.ts (line 97)
- Updated `validateSelection()` line: 424 (was 512)
- Added line numbers for all matrix-resolver.ts functions with current values
- Added 4 new exported validation helpers: `validateConflicts` (282), `validateRequirements` (305), `validateExclusivity` (341), `validateRecommendations` (372)
- Updated `resolveAlias()` description -- no longer does display name lookup, just validates ID exists in matrix
- Updated data flow: step 3 now loads categories + rules separately (was single matrix YAML)
- Updated data flow: step 5 now documents slug-based resolution and auto-synthesized categories
- Updated data flow: step 7 now documents BUILT_IN_MATRIX optimization for default source
- Updated SourceLoadResult line range: 61-67 (was 59-65)
- Fixed metadata.yaml example: removed `compatibleWith`, `requires`, `conflictsWith` (now in skill-rules.ts); added `slug`, `displayName` fields
- Added `rawMetadataSchema` reference (was `skillMetadataLoaderSchema`)
- Added `migrateLocalSkillScope()` to source-switcher.ts documentation
- Added `compatibleWith` relationship type to table
- Updated `source-switcher.ts` description to include scope migration
- Added full Matrix Provider section with all functions
- Added full Skill Resolution section with merge logic description

**features/wizard-flow.md:**

- Updated `WizardResultV2` type: `selectedSkills` renamed to `skills: SkillConfig[]`, removed `sourceSelections` and `installMode`, added `agentConfigs: AgentScopeConfig[]`
- Updated `WizardResultV2` line range: 30-43 (was 27-42)
- Updated `WizardProps`: removed `matrix` prop (uses matrix-provider), removed `initialInstallMode`, added `installedSkillConfigs`, `installedAgentConfigs`, `lockedSkillIds`, `lockedAgentNames`, `startupMessages`
- Added note that wizard does NOT receive matrix prop
- Added 2 new hooks: `useRowScroll`, `useSectionScroll`
- Updated build step logic functions: removed `getSkillDisplayLabel()`, added `computeOptionState()` and `buildCategoriesForDomain()`
- Added new wizard components: `menu-item.tsx`, `selection-card.tsx`, `step-refine.tsx`, `stack-selection.tsx`
- Updated component tree: added `StackSelection` and `DomainSelection` under StepStack
- Fixed `BUILT_IN_DOMAIN_ORDER`: now includes "shared" -- `["web", "api", "mobile", "cli", "shared"]` at line 191 (was 179)
- Fixed default scratch domains: `["web", "api", "mobile"]` (all except CLI and shared)
- Updated keyboard navigation section: centralized hotkeys in `hotkeys.ts`, documented per-step hotkeys (S for scope, D for labels, L/P for sources)
- Updated edit mode flow: added steps for `installedSkillConfigs`, `installedAgentConfigs`, `lockedSkillIds`/`lockedAgentNames`
- Updated `populateFromSkillIds()` signature in edit mode flow (now takes optional `savedConfigs`)
- Updated framework-first filtering: `compatibleWith` now resolved from `skill-rules.ts` not per-skill metadata

### 2026-03-14 Targeted Validation (store-map.md, component-patterns.md)

Validated against source code after wizard store and component changes (Feb 25 - Mar 14).

**store-map.md:**

- Fixed useWizardStore line: 494 (was 431)
- Fixed WizardState shape range: 149-439 (was 157-408)
- Removed deleted state fields: `installMode`, `sourceSelections`
- Added 7 new state fields: `_stackDomainSelections`, `skillConfigs`, `focusedSkillId`, `agentConfigs`, `focusedAgentId`, `lockedSkillIds`, `lockedAgentNames`
- Removed deleted actions: `toggleExpertMode`, `toggleInstallMode`
- Added 8 new actions: `deriveInstallMode`, `toggleSkillScope`, `setSkillSource`, `setFocusedSkillId`, `toggleAgentScope`, `setFocusedAgentId`, `setAllSourcesLocal`, `setAllSourcesPlugin`
- Fixed `populateFromSkillIds` signature (now takes `savedConfigs?` instead of `skills, categories`)
- Fixed `populateFromStack` signature (no `categories` param -- uses matrix internally)
- Documented `selectStack()` reset behavior (resets all selections on stack change)
- Fixed `buildSourceRows` return type: `() => { skillId, options }[]` (was `(matrix) => SourceRow[]`)
- Fixed `createInitialState()` line range: 468-492 (was 410-429)
- Fixed DOMAIN_AGENTS line range: 54-65 (was 37-48)
- Updated store consumer list: removed 4 files that no longer import store directly (step-confirm, step-settings, wizard-tabs, use-build-step-props); added 2 new consumers (stack-selection, domain-selection)
- Updated initial state to include all 17 fields

**component-patterns.md:**

- Fixed hooks count: 16 (was 14). Added `use-row-scroll.ts`, `use-section-scroll.ts`
- Fixed wizard files count: 23 (was 22). Added `hotkeys.ts`
- Added new `select-list.tsx` in common/ with type signatures
- Added `CHEVRON_SPACER` to UI_SYMBOLS table
- Fixed `CLI_COLORS` line range: 178-188 (was 166-176)
- Fixed `UI_SYMBOLS` line range: 100-113 (was 95-108)
- Fixed `SCROLL_VIEWPORT` line range: 150-161 (was 145-156)
- Fixed CategoryOption type: removed phantom `label` field, added `scope?: "project" | "global"`
- Added `use-framework-filtering.ts` to CategoryOption/CategoryRow consumers list
- Fixed `build-step-logic.ts` path: `src/cli/lib/wizard/build-step-logic.ts`
- Added Hotkeys Registry section documenting `hotkeys.ts`
- Added Section Scroll and Row Scroll subsections

### 2026-02-25 Adversarial Audit

Full validation of all 12 documentation files against actual source code. Errors found and fixed:

**type-system.md:**

- Fixed Category count: 38 (was 46)
- Fixed SkillDisplayName count: 82 (was 118)
- Removed phantom "SkillRef" alias (does not exist; actual type is PluginSkillRef)
- Added missing types: CompileConfig, CompileContext, ValidationResult, ExtractedSkillMetadata
- Added wizard/UI types table from matrix.ts
- Added metadataValidationSchema to Zod schemas table

**utilities.md:**

- Fixed ERROR_MESSAGES count: 10 (was 8)
- Fixed STATUS_MESSAGES count: 12 (was 10)
- Fixed INFO_MESSAGES count: 7 (was 6)
- Added STANDARD_FILES and STANDARD_DIRS reference section

**features/plugin-system.md:**

- Fixed installLocal() location: local-installer.ts:511 (was installation.ts)
- Fixed installPluginConfig() location: local-installer.ts:435 (was installation.ts)
- Added re-export note from index.ts
- Added validatePlugin line reference (:359)
- Added dual getPluginManifestPath note

**test-infrastructure.md:**

- Added note that test/fixtures/ directory does NOT exist at project root
- Added KEY_Y and KEY_N to keyboard constants table
- Added delay() utility
- Added missing co-located test files (installation, plugin tests)

**component-patterns.md:**

- Fixed hooks count: 14 (was 15)
- Fixed wizard files count: 22 (was 20)
- Added DISABLED symbol to UI_SYMBOLS table
- Fixed CategoryOption type: uses `state: OptionState` pattern (not individual booleans)
- Added OptionState and CategoryRow types
- Updated consumers list (added build-step-logic.ts)

**commands.md:**

- Fixed installIndividualPlugins reference (private method on Init class, not from installation module)
- Fixed key dependencies (installation/index.ts, not installation.ts)
- Added message count references

**store-map.md:**

- Added 14 missing actions: setApproach, selectStack, setStackAction, nextDomain, prevDomain, toggleShowLabels, toggleExpertMode, toggleInstallMode, setSourceSelection, setCustomizeSources, toggleSettings, toggleHelp, setEnabledSources
- Reorganized actions into clear categories (Navigation, Approach/Stack, Selection, UI Toggles, Source Management, Population, Reset)

**features/skills-and-matrix.md:**

- Added missing `sourcePath: string` field to SourceLoadResult type
- Added line references to SourceLoadResult type definition
- Added line numbers for all matrix-resolver.ts functions
- Added undocumented utility functions: getAvailableSkills, getSkillsByCategory

## Notes for Next Session

- Iter 87 re-audit (final sweep of 100-iter Ralph run): all 5 invariants still PASS, no drift introduced by iters 51-86. Dashboard 0-stale across all 32 rows, Reference-table dates uniformly 2026-04-21, disk frontmatter 41/41 at 2026-04-21.
- Iter 50 Map Self-Consistency Audit: 8 Reference-table `Last Validated` dates bumped 2026-04-13→2026-04-21 (cross-surface sync with dashboard + frontmatter). All 5 invariants now clean.
- Root-cause enum violation flagged (unfixed): `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` uses `scope-boundary-preserved` — convention-keeper must either widen the enum in `TEMPLATE.md` or reclassify the finding.
- All 41 reference files on disk accounted for. 32 tracked in Reference tables; 9 pointer files tracked only in directory diagram.
- Next full regeneration of `findings-impact-report.md` triggered when Incremental Updates accumulate >10 entries (per documentation-bible rule). Reset iter 40.
- Next map self-consistency audit: per bible cadence (decennial iteration cadence, i.e., every ~10 iters) — target iter 60.
- store-map.md next validation due 2026-04-28 (7-day cadence). All other docs due 2026-05-05 (14-day cadence).

## Ralph Docs Sweep (Apr 2026)

Canonical loop-postmortem: [`agent-findings/2026-04-21-iter99-ralph-docs-sweep-summary.md`](./agent-findings/2026-04-21-iter99-ralph-docs-sweep-summary.md) — 100-iter Ralph run across `.ai-docs/` + docs/guides + CLAUDE.md.

### Agent Routing Pattern

- **codex-keeper**: default for `.ai-docs/reference/` descriptive docs.
- **general-purpose**: `standards/` normative docs + `CLAUDE.md` + `MEMORY.md`.
- **cli-tester**: when a docs change requires verifying code claims against source.

### Residual Drifts (for next maintainer)

- Sweep totals (2026-04-21 window, post residual-cleanup + d224 close-out + micro-sync + file-path-canon close-out + 0.42.1 orphan-release filing + eject-success-log filing + pre-impl-design-docs-historical filing): 90 resolved / 7 partial / 10 open / 2 superseded (total 109 on disk). `state-transitions.md` and `commands.md` dual-home splits both RESOLVED (canonical is now the subdir file in each case, root is the pointer). `agent-suggestions/` status model codified in `agent-suggestions/README.md` (iter 98 follow-up) — RESOLVED. `file-path-canonicalization-mixed-forms` closed out by new `documentation-bible.md § File-Path Conventions in Docs`.
- Residual-cleanup 2026-04-21: 8 findings lacking explicit `status:` classified (4 resolved, 1 superseded, 3 open). See `reference/findings-impact-report.md` "By Status" block for the list. Most recent close-out: `d217-test-prereq-already-satisfied` → `standards/e2e/test-data.md § Before Extending Fixtures`.
- 17 non-closed findings tracked in `agent-findings/` (7 partial + 10 open) — triage + close-out pass needed.
