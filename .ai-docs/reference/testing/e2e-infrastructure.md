---
scope: reference
area: testing
keywords:
  [
    e2e,
    page-object-model,
    POM,
    terminal-session,
    custom-matchers,
    fixtures,
    project-builder,
    dual-scope,
    timeout,
    keypress-rule,
    waitForWizardFooter,
  ]
related:
  - reference/testing/infrastructure.md
  - reference/testing/factories.md
  - reference/testing/mock-data.md
last_validated: 2026-07-30
---

<!-- NEEDS-VALIDATION EXTENDED 2026-07-31 (harness additions, not yet folded into the enumerations below; `last_validated` deliberately NOT re-stamped). New surface added this session, all verified against disk: (1) `TerminalSession.resize(cols, rows)` — resizes the PTY AND the xterm instance, both required or the emulator buffer desynchronises from the process; (2) `BaseStep.resizeBelowMinimum(cols, rows)` / `resizeAboveMinimum(cols, rows)` — closed-loop resize helpers, cursor-anchored on the resize prompt and on the wizard footer respectively; (3) `STEP_TEXT.RESIZE_PROMPT` ("Please resize"), the dimension-independent tail of the shared too-small message; (4) `TERMINAL_SIZE.BELOW_MINIMUM` = `{ rows: 16, cols: 100 }`, which must NEVER be used to LAUNCH a session (the startup gate blocks pre-Ink and it hangs) — only to resize one that started larger; (5) new spec `e2e/interactive/wizard-terminal-resize-guard.e2e.test.ts`, so `e2e/interactive` is one file larger than the total recorded below. The STEP_TEXT enumeration in this file is now short by MORE than the one member the note below records — a direct count gives 72 and the standards README (`standards/e2e/README.md`) was rebuilt against that count this session; this file's copy was not. Also NOT yet recorded: `getScreen()` reads from buffer line 0, so once a session has scrollback it is NOT viewport-only despite its name — never assert the ABSENCE of previously-drawn text through it. Prior annotation follows. -->

<!-- re-validated 2026-07-30 (product v0.146.0, test-harness pass): corrected TIMEOUTS.WIZARD_LOAD 15s -> 45s everywhere it appeared (constants table, BaseStep defaultTimeout, waitForWizardFooter poll budget) per the 0.145.0 raise; re-counted every per-directory spec file total against disk (commands 24 -> 30, interactive 37 -> 47, lifecycle 70 -> 75) and listed the 21 previously-missing spec files; added the new pages/wizards/global-home.ts module; re-counted STEP_TEXT (50 -> 64) and enumerated the 14 omitted members plus TERMINAL_SIZE.SHORT; rewrote the BuildStep inventory — focusSkill is now a closed-loop Tab-walk, and selectSkillAwaiting / saveFromBuild / toggleInfoPanel were missing; removed the dangling findSkillGridPosition reference (the method no longer exists); added EditWizard.launchInProjectShort, AgentsStep.toggleFocusedAgentAwaiting/getScopeBadgesForAgent, ConfirmStep.confirmAwaiting/confirmExpectingExit; documented createPermissionsFile's merge semantics and the getOutput-vs-getRawOutput frame-accumulation distinction; added writeConfigTypes to the test-utils table -->

# E2E Test Infrastructure

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Split from:** `reference/test-infrastructure.md`. See also: [infrastructure.md](./infrastructure.md), [factories.md](./factories.md), [mock-data.md](./mock-data.md).

## E2E Tests

**Config:** `e2e/vitest.config.ts` (separate Vitest config, no `setupFiles` — matchers imported per-test)
**Pattern:** `e2e/**/*.e2e.test.ts` (include)
**Timeout:** `testTimeout: 30_000`, `hookTimeout: 60_000`
**Pool:** `forks` (process isolation) with `maxWorkers: 16` — worker count capped because PTY-driven wizard tests drop keystrokes and flake under full parallelism (21+ workers on dev machines)
**Retry:** `retry: 2` (automatic retry on failure)
**Global Setup:** `e2e/global-setup.ts` (teardown function only — lists marketplaces via `claudePluginMarketplaceList` and removes names starting with `e2e-test-` via `claudePluginMarketplaceRemove`; best-effort, swallows list errors)

Note: Smoke tests use `*.smoke.test.ts` pattern and are NOT matched by the E2E vitest config include pattern. They must be run separately. One `pom-framework.e2e.test.ts` file inside `e2e/smoke/` IS matched by the include pattern (test framework self-tests).

## E2E Directory Structure

```
e2e/
  vitest.config.ts                   # E2E-only Vitest config (forks pool, retry 2)
  global-setup.ts                    # Teardown: removes stale e2e-test-* marketplaces
  tsconfig.json                      # E2E-only tsconfig
  FINDINGS.md                        # E2E investigation findings
  TODO-E2E.md                        # E2E task tracking
  helpers/
    create-e2e-plugin-source.ts      # Plugin source factory for E2E
    create-e2e-source.ts             # E2E source factory
    node-pty.d.ts                    # Type declarations for node-pty
    terminal-session.ts              # Terminal session management
    test-utils.ts                    # Shared E2E utilities (runCLI, createTempDir, createLocalSkill, pollUntil, etc.)
    type-check-probe.ts              # tsc probe: asserts generated config-types.ts aliases still reject bad values (not text)
  assertions/                        # Reusable high-level assertion helpers
    config-assertions.ts             # expectNoDuplicates(arr, label, context?), normalizeConfigPreservingOrder(config)
    phase-assertions.ts              # expectPhaseSuccess(result, { skillIds, agents, source, ... }), expectFullInstallation(...)
    scope-assertions.ts              # expectDualScopeInstallation(globalHome, projectDir, expected)
    uninstall-assertions.ts          # expectCleanUninstall(dir, { preservedSkills, preservedAgentFiles, removeConfig? })
  pages/                             # Page Object Model (POM) infrastructure
    constants.ts                     # DIRS, FILES, STEP_TEXT, TIMEOUTS, INTERNAL_DELAYS, INTERNAL_RETRIES, EXIT_CODES, SOURCE_PATHS, TERMINAL_SIZE
    base-step.ts                     # Base class for wizard step page objects
    retry-enter.ts                   # retryEnterUntil(): closed-loop Enter retry shared by BaseStep + DashboardSession
    terminal-screen.ts               # Terminal output parsing
    dashboard-session.ts             # Dashboard interaction page object
    wizard-result.ts                 # ProjectHandle type, wizard completion result
    steps/                           # Individual wizard step page objects
      agents-step.ts
      build-step.ts
      confirm-step.ts
      domain-step.ts
      search-modal.ts
      sources-step.ts
      stack-step.ts
    wizards/                         # Composed wizard page objects
      edit-wizard.ts
      global-home.ts                 # allocateProjectGlobalHome(): fresh-or-reused global HOME + cleanup ownership for launchInProject
      init-wizard.ts
  matchers/                          # Custom Vitest matchers for E2E assertions
    project-matchers.ts              # toHaveConfig, toHaveCompiledAgent, toHaveSkillCopied, toHavePlugin, etc.
    agent-matchers.ts                # toHaveAgentFrontmatter, toHaveAgentDynamicSkills
    setup.ts                         # expect.extend({...projectMatchers, ...agentMatchers}) + type augmentation
  fixtures/                          # E2E test fixtures and builders
    cli.ts                           # CLI class for running non-interactive commands
    dual-scope-helpers.ts            # createTestEnvironment, initGlobal, initProject, setupDualScope, config readers
    expected-values.ts               # E2E_SKILL_IDS, E2E_SKILL, E2E_AGENT, E2E_AGENTS, E2E_AGENT_DISPLAY
    interactive-prompt.ts            # InteractivePrompt class for PTY-based tests
    plugin-install-state.ts          # createPluginInstalledProject / uninstallProjectPlugins (writes config + settings.json + fake-HOME registry directly; NO Claude CLI, runs unconditionally)
    project-builder.ts               # ProjectBuilder class (minimal, editable, dualScope, withCustomSkill factories)
  commands/                          # Command (non-interactive) E2E tests — 30 files
    build.e2e.test.ts
    build-agent-plugins.e2e.test.ts
    compile.e2e.test.ts
    compile-config-types-refresh.e2e.test.ts
    compile-corrupt-config.e2e.test.ts
    compile-edge-cases.e2e.test.ts
    compile-global-scope-hint.e2e.test.ts
    compile-prunes-stale-agents.e2e.test.ts
    compile-scope-filtering.e2e.test.ts
    doctor.e2e.test.ts
    doctor-blind-spots.e2e.test.ts
    doctor-diagnostics.e2e.test.ts
    dual-scope.e2e.test.ts
    eject.e2e.test.ts
    help.e2e.test.ts
    import-skill.e2e.test.ts
    list.e2e.test.ts
    local-skill-invalid-metadata-yaml.e2e.test.ts
    new-agent.e2e.test.ts
    new-marketplace.e2e.test.ts
    new-skill.e2e.test.ts
    plugin-build.e2e.test.ts
    plugin-uninstall-core.e2e.test.ts
    plugin-uninstall-edge-cases.e2e.test.ts
    relationships.e2e.test.ts
    uninstall.e2e.test.ts
    uninstall-global-propagation.e2e.test.ts
    uninstall-manifest-removal.e2e.test.ts
    uninstall-preservation.e2e.test.ts
    validate.e2e.test.ts
  interactive/                       # Interactive wizard E2E tests — 47 files (PTY-based)
    build-step-category-ordering.e2e.test.ts
    confirm-step-source-change-indicator.e2e.test.ts
    default-sandbox-runs-project-scope.e2e.test.ts   # pins the D-226 sibling-HOME default
    edit-agent-scope-routing.e2e.test.ts
    edit-migration-eject-to-plugin-no-marketplace.e2e.test.ts
    edit-plugin-hard-error.e2e.test.ts
    edit-skill-accumulation.e2e.test.ts
    edit-wizard-added-skill-source-marker.e2e.test.ts
    edit-wizard-completion.e2e.test.ts
    edit-wizard-detection.e2e.test.ts
    edit-wizard-dual-scope-added-marker.e2e.test.ts
    edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts
    edit-wizard-dual-scope-indicator.e2e.test.ts
    edit-wizard-excluded-skills.e2e.test.ts
    edit-wizard-global-scope-pending-removal-row.e2e.test.ts
    edit-wizard-launch.e2e.test.ts
    edit-wizard-local.e2e.test.ts
    edit-wizard-navigation.e2e.test.ts
    edit-wizard-pending-removal-row.e2e.test.ts
    edit-wizard-plugin-migration.e2e.test.ts
    edit-wizard-plugin-operations.e2e.test.ts
    edit-wizard-unique-skill-guard.e2e.test.ts
    info-panel-scope-toggle-diff.e2e.test.ts
    init-plugin-config-marketplace-source.e2e.test.ts
    init-wizard-default-source.e2e.test.ts
    init-wizard-exclusive-compat.e2e.test.ts
    init-wizard-existing.e2e.test.ts
    init-wizard-filter-incompatible.e2e.test.ts
    init-wizard-flags.e2e.test.ts
    init-wizard-interactions.e2e.test.ts
    init-wizard-navigation.e2e.test.ts
    init-wizard-plugin.e2e.test.ts
    init-wizard-scope-split.e2e.test.ts
    init-wizard-scratch.e2e.test.ts
    init-wizard-sources.e2e.test.ts
    init-wizard-stack.e2e.test.ts
    init-wizard-stack-agents.e2e.test.ts
    init-wizard-ui.e2e.test.ts
    real-marketplace.e2e.test.ts
    scenario-c-init-registers-project.e2e.test.ts
    search-static.e2e.test.ts
    smoke.e2e.test.ts
    sources-overflow-pending-removal.e2e.test.ts
    sources-step-duplicate-marketplace-column.e2e.test.ts
    uninstall.e2e.test.ts
    update.e2e.test.ts
    wizard-overflow-affordance.e2e.test.ts
  lifecycle/                         # Lifecycle E2E tests — 75 files (grew substantially during tombstone + scope-toggle + stack-cleanup + cross-scope-rule work)
    agent-scope-toggle-agents-array.e2e.test.ts
    cancelled-init-blank-global-config.e2e.test.ts
    compile-after-scope-change.e2e.test.ts
    config-scope-integrity.e2e.test.ts
    cross-scope-lifecycle.e2e.test.ts
    doctor-dual-scope.e2e.test.ts
    doctor-global-scope-blind-spots.e2e.test.ts
    dual-scope-agent-badge-and-s-collapse.e2e.test.ts
    dual-scope-collapse-and-restore-via-s.e2e.test.ts
    dual-scope-collapse-live-selection.e2e.test.ts
    dual-scope-edit-display.e2e.test.ts
    dual-scope-edit-integrity.e2e.test.ts
    dual-scope-edit-mixed-sources.e2e.test.ts
    dual-scope-edit-scope-changes.e2e.test.ts
    dual-scope-edit-source-changes.e2e.test.ts
    dual-scope-in-session-collapse-restore-sequence.e2e.test.ts
    dual-scope-mixed-source-compiled-ref.e2e.test.ts
    dual-scope-s-round-trip-space-inert.e2e.test.ts
    dual-scope-same-source-eject.e2e.test.ts
    dual-scope-same-source-plugin.e2e.test.ts
    edit-add-local-skills.e2e.test.ts
    edit-deselect-reselect-discards-source-scope.e2e.test.ts
    edit-global-agent-removal-propagation.e2e.test.ts
    edit-global-fallback.e2e.test.ts
    edit-global-propagation-stale-stack-ref.e2e.test.ts
    edit-global-remove-dual-scope-partial.e2e.test.ts
    edit-global-source-toggle-propagation-compiled-ref.e2e.test.ts
    edit-project-scope-last-skill-stack-cleanup.e2e.test.ts
    edit-remove-last-skill-stack-cleanup.e2e.test.ts
    edit-remove-one-of-many-skills-stack-cleanup.e2e.test.ts
    edit-remove-skill-stack-surgical.e2e.test.ts
    eject-skill-directory-cleanup.e2e.test.ts
    exclusion-lifecycle.e2e.test.ts
    global-agent-propagation-type-consistency.e2e.test.ts
    global-agent-toggle-guard.e2e.test.ts
    global-blank-config-overinstalls-agents.e2e.test.ts
    global-install-masks-project-owned-exclusive-category.e2e.test.ts  # D-279: cross-scope exclusive-category masking
    global-install-tombstones-project-owned.e2e.test.ts                # D-279: identity-collision masking
    global-scope-install-reporting.e2e.test.ts
    global-scope-lifecycle.e2e.test.ts
    global-skill-filter-incompatible-guard.e2e.test.ts
    global-skill-toggle-guard.e2e.test.ts
    init-dashboard-edit-plugin-install.e2e.test.ts
    init-edit-compile-roundtrip.e2e.test.ts
    init-edit-error-guards.e2e.test.ts
    init-global-preselection-confirm.e2e.test.ts
    init-plugin-marketplace-fail.e2e.test.ts
    init-then-edit-merge.e2e.test.ts
    local-lifecycle.e2e.test.ts
    mixed-mode-skill-ref-format.e2e.test.ts
    plugin-install-failure-hard-error.e2e.test.ts   # D-229: hard-error before orphan config
    plugin-lifecycle.e2e.test.ts
    plugin-scope-lifecycle.e2e.test.ts
    preloaded-preservation.e2e.test.ts
    project-edit-global-source-switch-divergence.e2e.test.ts
    project-init-global-config-marketplace.e2e.test.ts
    project-only-deselect-integrity.e2e.test.ts
    project-scope-config-types-union-collapse.e2e.test.ts
    project-tracking-propagation.e2e.test.ts
    re-edit-cycles.e2e.test.ts
    scenario-b-edit-home-preserves-projects.e2e.test.ts
    scope-aware-local-copy.e2e.test.ts
    scope-change-deselect-integrity.e2e.test.ts
    scope-toggle-agent-content.e2e.test.ts
    scope-toggle-combined.e2e.test.ts
    scope-toggle-config-snapshot.e2e.test.ts
    scope-toggle-roundtrip.e2e.test.ts
    selected-agent-name-excluded.e2e.test.ts
    source-switching-full-cycle.e2e.test.ts
    source-switching-modes.e2e.test.ts
    source-switching-per-skill.e2e.test.ts
    stack-per-agent-curation.e2e.test.ts
    tombstone-cleanup-PtoG-restoration.e2e.test.ts  # D-223/D-224: dual-scope tombstone semantics
    unified-config-view.e2e.test.ts
    uninstall-reinit-lifecycle.e2e.test.ts
  integration/                       # E2E integration tests — 3 files
    custom-agents.e2e.test.ts
    eject-compile.e2e.test.ts
    eject-integration.e2e.test.ts
  smoke/                             # Smoke tests — 3 *.smoke.test.ts (NOT matched by include) + 1 *.e2e.test.ts (IS matched)
    home-isolation.smoke.test.ts
    plugin-chain-poc.smoke.test.ts
    plugin-install.smoke.test.ts
    pom-framework.e2e.test.ts
```

**Note on E2E splits:** Several large E2E files were split into smaller files for parallel execution (commit 84e68ef):

- `plugin-uninstall.e2e.test.ts` -> `plugin-uninstall-core.e2e.test.ts` + `plugin-uninstall-edge-cases.e2e.test.ts`
- `edit-wizard-plugin.e2e.test.ts` -> `edit-wizard-plugin-migration.e2e.test.ts` + `edit-wizard-plugin-operations.e2e.test.ts`
- `edit-wizard.e2e.test.ts` -> `edit-wizard-completion.e2e.test.ts` + `edit-wizard-launch.e2e.test.ts` + `edit-wizard-navigation.e2e.test.ts`
- `search.e2e.test.ts` -> `search-static.e2e.test.ts` (interactive search flow folded into other tests; there is no `search-interactive.e2e.test.ts`)
- `dual-scope-edit.e2e.test.ts` -> `dual-scope-edit-display.e2e.test.ts` + `dual-scope-edit-integrity.e2e.test.ts` + `dual-scope-edit-mixed-sources.e2e.test.ts` + `dual-scope-edit-scope-changes.e2e.test.ts` + `dual-scope-edit-source-changes.e2e.test.ts`
- `source-switching.e2e.test.ts` -> `source-switching-modes.e2e.test.ts` + `source-switching-per-skill.e2e.test.ts` + `source-switching-full-cycle.e2e.test.ts`
- Scope-toggle coverage expanded into `scope-toggle-agent-content.e2e.test.ts` + `scope-toggle-combined.e2e.test.ts` + `scope-toggle-config-snapshot.e2e.test.ts` + `scope-toggle-roundtrip.e2e.test.ts` + `agent-scope-toggle-agents-array.e2e.test.ts` + `compile-after-scope-change.e2e.test.ts`

**Note on the D-260 dual-scope renames:** three lifecycle specs whose names described SPACEBAR behaviour were renamed to match the `s`-is-the-sole-toggle contract (spacebar is now inert on any globally-backed row):

- `dual-scope-agent-badge-and-s-inert.e2e.test.ts` -> `dual-scope-agent-badge-and-s-collapse.e2e.test.ts`
- `dual-scope-spacebar-reselect-restore.e2e.test.ts` -> `dual-scope-collapse-and-restore-via-s.e2e.test.ts`
- `dual-scope-spacebar-collapse-live-selection.e2e.test.ts` -> `dual-scope-collapse-live-selection.e2e.test.ts`

`dual-scope-s-round-trip-space-inert.e2e.test.ts` was added alongside them to pin the round-trip plus the spacebar-inert half of the contract directly.

## E2E Page Object Model (POM)

The E2E tests use a Page Object Model pattern in `e2e/pages/`. Constants are self-contained (no imports from `src/cli/`).

**Constants (`e2e/pages/constants.ts`):**

| Export             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIRS`             | Directory names: `CLAUDE` (`.claude`), `CLAUDE_SRC` (`.claude-src`), `SKILLS`, `AGENTS`, `PLUGINS`, `PLUGIN_MANIFEST`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `FILES`            | File names: `CONFIG_TS`, `CONFIG_TYPES_TS`, `SKILL_MD`, `METADATA_YAML`, `SETTINGS_JSON`, `INSTALLED_PLUGINS_JSON`, `IDENTITY_MD`, `PLAYBOOK_MD`, `PLUGIN_JSON`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `STEP_TEXT`        | Text used to identify wizard steps, completion states, prompts, dashboard, installation output, scope warnings, terminal-size warnings, and the scroll-overflow affordance. All 64 members: step identification — `STACK`, `DOMAINS`, `DOMAIN_WEB`, `DOMAIN_API`, `DOMAIN_META`, `DOMAIN_MOBILE`, `BUILD`, `BUILD_FOOTER`, `SCOPE`, `CATEGORY_FRAMEWORK`, `SOURCES`, `AGENTS`, `CONFIRM`; completion — `INIT_SUCCESS`, `EDIT_SUCCESS`, `EDIT_UNCHANGED`, `COMPILE_SUCCESS`, `COMPILE_COMPLETE`, `CONFIG_LOAD_FAILED`, `EJECT_SUCCESS`, `IMPORT_SUCCESS`, `UNINSTALL_SUCCESS`; status/progress — `LOADING_SKILLS`, `RECOMPILING`, `NO_AGENTS_TO_RECOMPILE`, `COMPILE_GLOBAL_SCOPE_HINT`, `CONFIG_TYPES_REFRESHED`, `SKILL_NOT_FOUND_WARNING`, `COMPILE_PASS_NO_SKILLS`, `COMPILE_NO_SKILLS_ERROR`, `LOADED`, `LOADED_LOCAL`, `LOADED_SKILL`, `COMPILED_LIST`; prompts — `CONFIRM_UPDATE`, `CONFIRM_UNINSTALL`, `SEARCH`, `UNINSTALL_PREVIEW`, `UNINSTALL_PREVIEW_HEADING`, `UNINSTALL_CONFIG_SECTION`, `UNINSTALL_PROJECTS_UPDATED_ONE`, `UNINSTALL_PROJECT_SKIPPED`; sources — `CONFIGURED_MARKETPLACES`, `ADD_SOURCE`; dashboard — `DASHBOARD`; UI — `FOOTER_SELECT`, `START_FROM_SCRATCH`, `TOGGLE_SELECTION`, `NO_INSTALLATION`; installation output — `INSTALLING_PLUGINS`, `INSTALLING_PLUGINS_ELLIPSIS`, `PLUGIN_NATIVE`, `SKILLS_COPIED_TO`, `AGENTS_COMPILED_TO`, `CONFIGURATION_LABEL`, `READY_TO_INSTALL`, `NO_SKILLS_FOUND`, `UNINSTALL_CANCELLED`; scope warnings — `GLOBAL_SKILLS_BLOCKED`, `GLOBAL_AGENTS_BLOCKED`; terminal-size warnings — `TOO_NARROW`, `TOO_SHORT`; scroll affordance — `SCROLL_MORE_BELOW`, `SCROLL_MORE_ABOVE`. `SCOPE` ("Scope") is painted ONLY for genuine project-scope edits — the footer hides it when `isEditingFromGlobalScope` is true — which makes it the sentinel for asserting which scope a session actually runs at. |
| `TIMEOUTS`         | `WIZARD_LOAD`=45s (raised from 15s in 0.145.0 — solo runs land in ~1–2s, but `init` against the real marketplace under full-suite parallelism can sit at "Loading skills..." well past 15s; `BaseStep.defaultTimeout` derives from it, so every default step wait is now a 45s upper bound), `WIZARD_TRANSITION`=45s (Enter→next-view first-frame under parallel load), `INSTALL`=30s, `PLUGIN_INSTALL`=60s, `PLUGIN_TEST`=90s (`PLUGIN_INSTALL + EXIT_WAIT`), `EXIT`=10s, `SESSION_DEFAULT`=10s (local) / `SESSION_DEFAULT_CI`=20s, `EXIT_WAIT`=30s, `SETUP`=60s, `SETUP_DUAL`=120s (`SETUP * 2`, for `beforeAll` hooks building two sources), `LIFECYCLE`=180s, `EXTENDED_LIFECYCLE`=300s, `INTERACTIVE`=120s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `INTERNAL_DELAYS`  | Framework-internal delays (NOT for test files): `STEP_TRANSITION`=500ms, `KEYSTROKE`=150ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `INTERNAL_RETRIES` | Framework-internal closed-loop retry budget (NOT for test files): `MAX_ATTEMPTS`=5, `INTERVAL_MS`=3_000. Consumed by the shared `retryEnterUntil()` helper (`pages/retry-enter.ts`) that backs `BaseStep.pressEnterAndWaitFor` and `DashboardSession.selectEdit` — re-presses Enter when the first keystroke may land before the `useInput` handler mounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `EXIT_CODES`       | Process exit codes: `SUCCESS`=0, `ERROR`=1, `INVALID_ARGS`=2, `NETWORK_ERROR`=3, `CANCELLED`=4, `UNKNOWN_COMMAND`=127                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SOURCE_PATHS`     | Paths within a skills source directory (duplicated from `src/cli/consts.ts`): `SKILLS_DIR`=`src/skills`, `SKILL_CATEGORIES`=`config/skill-categories.ts`, `SKILL_RULES`=`config/skill-rules.ts`, `STACKS_FILE`=`config/stacks.ts`, `PLUGIN_MANIFEST_DIR`=`.claude-plugin`, `PLUGINS_DIST`=`dist/plugins`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `TERMINAL_SIZE`    | Terminal geometry overrides for CLI sessions: `TALL`=`{ rows: 60, cols: 120 }` (tall viewport for wizard flows needing the full build grid); `SHORT`=`{ rows: 20, cols: 100 }` (smallest viewport that still clears the wizard's own 80x20 minimum-size gate — `rows` must track `MIN_TERMINAL_SIZE.ROWS` in `src/cli/consts.ts` exactly, since a lower value makes every spec using it hang on the resize prompt — wide enough to render normally, short enough that any step whose content exceeds the viewport must clip and paint a `SCROLL_MORE_*` affordance). Unset session defaults live in `helpers/terminal-session.ts`, deliberately not mirrored here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `WizardType`       | Exported type `"init" \| "edit"` — which wizard a shared step page object is driving.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Page Objects:**

| Page Object        | File                           | Purpose                                                                                                                                                                                                  |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseStep`         | `pages/base-step.ts`           | Base class for step page objects                                                                                                                                                                         |
| `TerminalScreen`   | `pages/terminal-screen.ts`     | Terminal output parsing                                                                                                                                                                                  |
| `DashboardSession` | `pages/dashboard-session.ts`   | Dashboard interaction                                                                                                                                                                                    |
| `WizardResult`     | `pages/wizard-result.ts`       | `ProjectHandle` type (`{ dir, globalHome? }`), wizard-completion result. `ConfirmStep` builds it, stamping `project.globalHome` from `session.globalHome`, so `CLI.run` can target the same global root. |
| `AgentsStep`       | `pages/steps/agents-step.ts`   | Agents step interactions                                                                                                                                                                                 |
| `BuildStep`        | `pages/steps/build-step.ts`    | Build step interactions                                                                                                                                                                                  |
| `ConfirmStep`      | `pages/steps/confirm-step.ts`  | Confirm step interactions                                                                                                                                                                                |
| `DomainStep`       | `pages/steps/domain-step.ts`   | Domain selection interactions                                                                                                                                                                            |
| `SearchModal`      | `pages/steps/search-modal.ts`  | Search modal interactions                                                                                                                                                                                |
| `SourcesStep`      | `pages/steps/sources-step.ts`  | Sources step interactions                                                                                                                                                                                |
| `StackStep`        | `pages/steps/stack-step.ts`    | Stack selection interactions                                                                                                                                                                             |
| `EditWizard`       | `pages/wizards/edit-wizard.ts` | Composed edit wizard flows                                                                                                                                                                               |
| `InitWizard`       | `pages/wizards/init-wizard.ts` | Composed init wizard flows                                                                                                                                                                               |

### Page Object Method Inventories

Public API of the composed page objects. `BuildStep` extends `BaseStep`, so its inherited key-press / wait primitives are catalogued separately under [BaseStep Primitives Contract](#basestep-primitives-contract); the `BuildStep` table below lists only its own step methods. `DashboardSession`, `InitWizard`, `EditWizard`, and `TerminalScreen` do NOT extend `BaseStep`. In each table the "Returns" column shows the resolved value for `async` methods.

#### `InitWizard` (`e2e/pages/wizards/init-wizard.ts`)

Wraps a `TerminalSession` plus its cleanup dirs; exposes the ready `StackStep` as `readonly stack`. Options: `InitWizardOptions` = `{ source?, projectDir?, cols?, rows?, env?, noSource?, skipPermissions?, loadTimeout?, defaultTimeout?, globalHome? }`. The `globalHome?` option (honoured by `launchInProject` only) REUSES an existing global HOME dir instead of allocating a fresh one, so a later phase of a multi-phase test can see an earlier phase's global content; the allocator (the test), not the wizard, owns its cleanup. See [Scope & HOME model](#scope--home-model).

| Method                                           | Returns            | Purpose                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `static launch(options?)`                        | `InitWizard`       | Launch `init [--source <dir>]`, then `StackStep.waitForReady(loadTimeout)`. Escape hatch: HOME is an internal auto-allocated sibling dir; `wizard.globalHome` throws.                                                          |
| `static launchInProject(options?)`               | `InitWizard`       | Launch `init` as a PROJECT install: HOME is a fresh dir distinct from `projectDir`, exposed as `wizard.globalHome`. Default-scope (global) content lands under `<globalHome>/.claude/…`; `config.ts` stays under `projectDir`. |
| `static launchInGlobal(options?)`                | `InitWizard`       | Launch `init` as the GLOBAL install: `HOME === cwd === projectDir` (intentional collapse); `wizard.globalHome` equals `projectDir`.                                                                                            |
| `static launchRaw(options?)`                     | `InitWizard`       | Launch and poll for non-empty output WITHOUT waiting for the stack step — for resize-warning / pre-stack asserts. Escape hatch like `launch()`: `wizard.globalHome` throws.                                                    |
| `get globalHome`                                 | `string`           | Global HOME where install content landed, for filesystem assertions. THROWS on a plain `launch()`/`launchRaw()` wizard (their HOME is internal).                                                                               |
| `static launchForDashboard(options)`             | `DashboardSession` | Launch `init` in an already-installed dir (dashboard mode). Options `{ projectDir, source?, env? }`.                                                                                                                           |
| `completeWithDefaults(stackName?)`               | `WizardResult`     | Full traversal: Stack → Domain → Build (all domains) → Sources → Agents → Confirm.                                                                                                                                             |
| `acceptStackDefaults()`                          | `WizardResult`     | Select first stack, accept domain defaults, press `a` hotkey, confirm — for unknown domain count (`BUILT_IN_MATRIX`).                                                                                                          |
| `getOutput()` / `getScreen()` / `getRawOutput()` | `string`           | Processed full output / viewport / raw PTY output (sync).                                                                                                                                                                      |
| `waitForExit(timeoutMs?)`                        | `number`           | Await process exit, return exit code.                                                                                                                                                                                          |
| `abort()`                                        | `void`             | Ctrl+C (sync).                                                                                                                                                                                                                 |
| `abortAndDestroy(timeoutMs?)`                    | `number`           | Ctrl+C → `waitForExit(timeoutMs)` → `destroy()`; returns exit code. Standard read-only-scenario teardown.                                                                                                                      |
| `escape()`                                       | `void`             | Escape (cancel from stack step, sync).                                                                                                                                                                                         |
| `destroy()`                                      | `void`             | Destroy session and clean up `cleanupDirs`.                                                                                                                                                                                    |

#### `EditWizard` (`e2e/pages/wizards/edit-wizard.ts`)

Exposes the ready `BuildStep` as `readonly build` — edit opens directly to the build step (no stack step). Options: `EditWizardOptions` = `{ projectDir (required), source?, cols?, rows?, env?, extraArgs?, defaultTimeout?, globalHome? }`. The `globalHome?` option (honoured by `launchInProject` only) REUSES an existing global HOME dir instead of allocating a fresh one, so this edit can see an earlier phase's global content; the allocator owns its cleanup. See [Scope & HOME model](#scope--home-model).

| Method                                 | Returns        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static launch(options)`               | `EditWizard`   | Launch `edit [--source <dir>] [...extraArgs]`; three-sentinel wait `BUILD_FOOTER` → `waitForWizardFooter` → `BUILD` (all `TIMEOUTS.WIZARD_TRANSITION`) before returning. Escape hatch: HOME is an internal auto-allocated sibling dir; `wizard.globalHome` throws.                                                                                                                                                                                                                                                                                         |
| `static launchInProject(options)`      | `EditWizard`   | Launch `edit` as a PROJECT install: HOME is a fresh dir distinct from `projectDir`, exposed as `wizard.globalHome`. Global-scoped content (compiled agents, ejected global skills) lands under `<globalHome>/.claude/…`; `config.ts` stays under `projectDir`. Fresh dir removed by `destroy()`.                                                                                                                                                                                                                                                           |
| `static launchInProjectShort(options)` | `EditWizard`   | `launchInProject` variant for `TERMINAL_SIZE.SHORT`, where the build grid overflows the viewport and the `BUILD` ("Framework") category header never settles as a stable substring. Skips the third settle wait (`BUILD_FOOTER` + footer still confirm the step is live). ONLY valid for callers that step through the build step blind — blind Enter advances and toggles of the already-focused skill — never for callers that locate a skill by name, because `focusSkill` needs the clean category layout this variant deliberately does not wait for. |
| `static launchInGlobal(options)`       | `EditWizard`   | Launch `edit` on the GLOBAL install: `HOME === cwd === projectDir` (intentional collapse); `wizard.globalHome` equals `projectDir`. Allocates no extra dir, so `destroy()` leaves `projectDir` to the caller's cleanup.                                                                                                                                                                                                                                                                                                                                    |
| `get globalHome`                       | `string`       | Global HOME where install content landed, for filesystem assertions. THROWS on a plain `launch()` wizard (its HOME is internal).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `passThrough()`                        | `WizardResult` | Build (all domains) → Sources → Agents → Confirm with no mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `completeFromBuild()`                  | `WizardResult` | Single-domain path via `build.saveFromBuild("edit")`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `getOutput()` / `getRawOutput()`       | `string`       | Processed full output / raw PTY output (sync).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `waitForExit(timeoutMs?)`              | `number`       | Await process exit, return exit code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `abort()`                              | `void`         | Ctrl+C (sync).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `abortAndDestroy(timeoutMs?)`          | `number`       | Ctrl+C → `waitForExit(timeoutMs)` → `destroy()`; returns exit code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `destroy()`                            | `void`         | Destroy session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

#### `DashboardSession` (`e2e/pages/dashboard-session.ts`)

Wrapper for init's dashboard mode (already-initialized project). NOT a wizard flow — paints no wizard footer, so its key methods gate on their own sentinels, never `waitForWizardFooter` (see the [keypress rule](#page-object-keypress-rule-waitforwizardfooter) precondition). Constructor exposes `readonly projectDir`.

| Method                         | Returns     | Purpose                                                                                                                                                                                                                                   |
| ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)` | `void`      | Wait for `text` in full output.                                                                                                                                                                                                           |
| `getOutput()` / `getScreen()`  | `string`    | Full output / visible viewport (sync).                                                                                                                                                                                                    |
| `escape()` / `ctrlC()`         | `void`      | Synchronous key presses.                                                                                                                                                                                                                  |
| `arrowDown()` / `arrowUp()`    | `void`      | Arrow press + `INTERNAL_DELAYS.KEYSTROKE` (150ms).                                                                                                                                                                                        |
| `selectEdit()`                 | `BuildStep` | Enter on the default-focused "Edit" option via closed-loop `retryEnterUntil` (waits `BUILD_FOOTER` after cursor, `waitForWizardFooter`, then `BUILD` after cursor); launches the edit wizard in the same PTY and returns its `BuildStep`. |
| `waitForExit(timeoutMs?)`      | `number`    | Await process exit.                                                                                                                                                                                                                       |
| `destroy()`                    | `void`      | Destroy session and clean up `cleanupDirs`.                                                                                                                                                                                               |

#### `TerminalScreen` (`e2e/pages/terminal-screen.ts`)

Output-scraping + wait layer over a `TerminalSession`. All `waitFor*` methods delegate to the shared `pollUntil` skeleton and press no keys.

| Method                                               | Surface                       | Purpose                                                                            |
| ---------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)`                       | full output (xterm buffer)    | Poll until `text` appears anywhere.                                                |
| `waitForTextAfter(text, cursor, timeoutMs)`          | raw output sliced at `cursor` | Poll append-only raw output past a `getRawCursor()` snapshot (closed-loop retry).  |
| `waitForRawText(text, timeoutMs)`                    | raw PTY output                | Poll raw output (no xterm processing).                                             |
| `waitForEither(textA, textB, timeoutMs)`             | full output                   | Poll until either string appears.                                                  |
| `waitForWizardFooter(timeoutMs)`                     | full output                   | Poll for the footer sentinel `"select"`. `WizardLayout` screens only.              |
| `waitForWizardFooterAfter(cursor, timeoutMs)`        | raw output after `cursor`     | Cursor-anchored footer wait. `WizardLayout` screens only.                          |
| `getRawCursor()`                                     | —                             | Returns the current raw-output length (`number`), for pairing with `*After` waits. |
| `getScreen()` / `getFullOutput()` / `getRawOutput()` | —                             | Return (`string`) viewport / scrollback-inclusive / raw-ANSI-stripped output.      |

#### `BuildStep` own methods (`e2e/pages/steps/build-step.ts`)

Extends `BaseStep`. All methods are `async`. Every key-pressing method `await`s `waitForWizardFooter()` before the press (keypress rule); the two read queries await it once, then scrape.

| Method                                       | Returns             | Purpose                                                                                                   |
| -------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `advanceDomain()`                            | `void`              | Enter to advance the current domain (via `pressEnterWaitNewFrame`); resets the tracked column hint.       |
| `focusSkill(label)`                          | `void`              | Move grid focus to a skill by EXACT rendered label, without toggling. Closed-loop Tab-walk — see below.   |
| `selectSkill(label)`                         | `void`              | `focusSkill` then Space.                                                                                  |
| `toggleFocusedSkill()`                       | `void`              | Space on the focused skill.                                                                               |
| `toggleFocusedSkillAwaiting(sentinel)`       | `void`              | Space, then wait for `sentinel` in raw output after a pre-press cursor — use when asserting on a toast.   |
| `selectSkillAwaiting(label, sentinel)`       | `void`              | `focusSkill` then `toggleFocusedSkillAwaiting`.                                                           |
| `toggleScopeOnFocusedSkill()`                | `void`              | Press `s` (scope toggle); `focusedSkillId` is seeded synchronously by the store.                          |
| `passThroughAllDomains()`                    | `SourcesStep`       | Enter through Web/API/Methodology using cursor-anchored `pressEnterWaitNewFrame`.                         |
| `passThroughAllDomainsGeneric()`             | `SourcesStep`       | Enter until `STEP_TEXT.SOURCES` appears (unknown domain count); throws after 10 presses.                  |
| `passThroughScratchDomains()`                | `SourcesStep`       | Scratch flow: Web (Space) → API (Space) → Mobile (empty).                                                 |
| `passThroughWebAndMethodologyDomains()`      | `SourcesStep`       | Web → Methodology (API deselected).                                                                       |
| `advanceToSources()`                         | `SourcesStep`       | Single Enter → Sources (single-domain projects).                                                          |
| `saveFromBuild(wizardType)`                  | `WizardResult`      | Build → Sources → Agents → Confirm → `confirm()`. ONLY for the no-mutation default path.                  |
| `navigateToNextCategory()`                   | `void`              | Tab to the next category.                                                                                 |
| `toggleLabels()`                             | `void`              | Press `d` (compatibility labels).                                                                         |
| `openSearch()`                               | `SearchModal`       | Press `/`.                                                                                                |
| `toggleFilterIncompatible()`                 | `void`              | Press `f`.                                                                                                |
| `toggleFilterIncompatibleAwaiting(sentinel)` | `void`              | Press `f`, then wait for `sentinel` in raw output after a pre-press cursor (toast assertions).            |
| `toggleInfoPanel()`                          | `void`              | Press `i` — gated by `FEATURE_FLAGS.INFO_PANEL`; renders a `SkillAgentSummary` overlay.                   |
| `goBack()`                                   | `void`              | Escape to the domain step.                                                                                |
| `getScopeBadgesForSkill(label)`              | `Array<"P" \| "G">` | Read-only: parse rendered scope badges (`P`/`G`) for a skill; returns `[]`, `["P"]`, `["G"]`, or both.    |
| `getExclusiveCategorySelectedCount(name)`    | `number`            | Read-only: parse the `(N of M)` counter an exclusive category header renders; returns the selected count. |

`pressEnterWaitNewFrame()` is a private helper: `waitForWizardFooter` → `retryEnterUntil` with a cursor-anchored `waitForWizardFooterAfter` post-condition. Build-step domain→domain transitions repaint the same tab labels ("Web | API | Methodology"), so a scrollback-matched wait fires instantly on stale residue; the footer IS re-emitted on every fresh paint, so anchoring on raw-output position detects a genuinely new frame without depending on domain-specific text.

##### `focusSkill` — closed-loop category Tab-walk

`focusSkill` was rewritten closed-loop in 0.145.0. The previous implementation dead-reckoned rows and assumed arrow-DOWN resets the grid column; the real grid PRESERVES and CLAMPS it (`use-focused-list-item.ts`: `finalCol = min(currentCol, newColCount - 1)`), so a second `focusSkill` in the same domain started its RIGHT presses from a wrong column and, with cyclic wrap, toggled the WRONG skill.

Two observability facts drive the current design:

| Fact                                                                                                                                                                             | Consequence                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The focused CELL has no text signal under `NO_COLOR`. `SkillTag` distinguishes it only via `borderColor`/`borderDimColor`, which the harness strips.                             | Cell-level focus cannot be verified from the frame; no design may depend on reading it. |
| The focused CATEGORY HEADER **is** observable: it paints as one background-highlighted text with one extra leading space (`  Framework * (1 of 1)` vs ` Client State (1 of 1)`). | Row/category focus can be closed-loop verified by re-parsing the viewport.              |
| Tab moves focus to the next category AND resets the column to 0 (`use-category-grid-input.ts` does `setFocused(nextSection, 0)`). DOWN does not.                                 | Only Tab yields a known column, so the walk is built on Tab, not DOWN.                  |

Algorithm: parse the current viewport into `VisibleCategory[]` (header lines are non-empty, box-drawing-free lines immediately followed by a `┌` line; cells are the `│`-delimited segments up to the next header, flattened in option order) → Tab-walk with a re-read of the rendered screen after every press until the focused category contains the target → walk RIGHT from the screen-verified `(row, 0)` to the target column. Bounded by `MAX_FOCUS_ATTEMPTS = 30` (Tab wraps, so one cycle visits every category) with a screen-dumping error on exhaustion; a swallowed Tab self-corrects because a press that produced no fresh frame within `INTERNAL_RETRIES.INTERVAL_MS` is simply followed by another re-read.

**Labels are matched EXACTLY, not by substring.** `cellLabel()` strips leading `P`/`G` scope badges and `+ - ✓ ✗ ⏏` diff glyphs (`CELL_LEADING_MARKERS`) plus the trailing compatibility annotation `(requires … | required by … | incompatible | recommended | discouraged)` (`CELL_ANNOTATION`), then trims. So `"React"` no longer stops the walk on a `"React Query"` cell, nor `"Vite"` on `"Vitest"`. Both regexes are deliberately narrow: the marker tokens must be followed by whitespace (so `"Pinia"` / `"GraphQL"` are never clipped) and the annotation must open with one of the five keywords (so `"Gel (EdgeDB)"` keeps its parentheses).

The one residual open-loop spot is `focusColumnInSingleCategory`: when the grid has a single visible category with no scroll affordance, Tab is a guarded no-op (`use-category-grid-input.ts` skips `setFocused` when the next section equals the current), so the walk cannot reset the column. A single-cell category needs no navigation (the grid clamps to 0); a multi-cell one falls back to the private `gridCol` hint using the grid's real cyclic-wrap arithmetic. Single-category domains in the standard E2E source are all single-cell, so the fallback is effectively unreachable there. `gridCol` is a best-effort HINT consulted ONLY by that fallback — it is reset on domain change and on `navigateToNextCategory`.

#### Sibling-step methods beyond the base contract

Full per-step inventories live in the prescriptive [page-objects.md](../../standards/e2e/page-objects.md). These are the members whose CONTRACT (not just existence) matters when choosing a surface to assert on:

| Step          | Method                                 | Why it exists                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentsStep`  | `toggleFocusedAgentAwaiting(sentinel)` | Space + cursor-anchored RAW-output wait. Toast-asserting counterpart of `toggleAgent`; mirrors `BuildStep.toggleFocusedSkillAwaiting`.                                                                                                                                                                                             |
| `AgentsStep`  | `getScopeBadgesForAgent(label)`        | Parses the bracketed `[P]` / `[G]` badges between the checkbox and the agent label; returns `["P"]`, `["G"]`, `["P","G"]`, `["G","P"]`, or throws. Checkbox tokens (`[✓]`, `[ ]`) never contain a bare P/G.                                                                                                                        |
| `ConfirmStep` | `confirmAwaiting(sentinel, timeoutMs)` | Confirm, then wait for ONE exact sentinel in RAW output on the caller's budget. `confirm()` bakes in both edit sentinels (`EDIT_SUCCESS` \| `EDIT_UNCHANGED`) off the xterm buffer within `TIMEOUTS.INSTALL`; use this when a test must pin one, read it from raw output, or allow the longer real-`claude plugin install` budget. |
| `ConfirmStep` | `confirmExpectingExit()`               | Confirm and return without requiring a success banner — for flows that hard-error at the install step. Callers assert on the exit code and output.                                                                                                                                                                                 |

## E2E Helpers (`e2e/helpers/test-utils.ts`)

The single shared-utility module for E2E. Re-exports fs helpers from the unit-test helper tree (`src/cli/lib/__tests__/`) plus Claude-CLI wrappers from `src/cli/utils/exec.ts`.

| Export                                                                                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLI_ROOT` / `BIN_RUN`                                                                                                                                  | Absolute paths to repo root and the built binary (`bin/run.js`). `BIN_RUN` requires `npm run build` first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `E2E_TEMP_PREFIX` (internal)                                                                                                                            | `"ai-e2e-"` — prefix for all E2E temp dirs created via `createTempDir()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `FORKED_FROM_METADATA`                                                                                                                                  | Multi-line string containing the standard `forkedFrom` metadata block used by plugin/uninstall tests. Represents a skill forked from `web-framework-react`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `createTempDir()`                                                                                                                                       | Thin wrapper around `createTempDirBase(E2E_TEMP_PREFIX)` from unit test `test-fs-utils.ts`. Returns an absolute tmp-dir path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `cleanupTempDir(dir)`                                                                                                                                   | Re-exported from unit test `test-fs-utils.ts`. Recursive rm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `fileExists` / `directoryExists`                                                                                                                        | Re-exported from `test-fs-utils.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `delay(ms)`                                                                                                                                             | Promise-based sleep. Shared by PTY-based tests and `BaseStep`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pollUntil(isSatisfied, timeoutMs, buildTimeoutError)`                                                                                                  | Poll `isSatisfied` (predicate evaluated before the first delay) until true, or throw `buildTimeoutError()` after `timeoutMs`. Shared skeleton for every `TerminalScreen` wait helper.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `stripAnsi(text)`                                                                                                                                       | Wraps Node's `stripVTControlCharacters`. Strips ANSI escape sequences from CLI output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ensureBinaryExists()`                                                                                                                                  | Throws with a clear message if `BIN_RUN` does not exist. Call once at `beforeAll` in every E2E file (pattern enforced throughout the suite).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `runCLI(args, cwd, options?)`                                                                                                                           | The canonical non-interactive runner. Executes `node <BIN_RUN> <args>` via `execa` with `reject: false`. HOME defaults to a freshly-created SIBLING temp dir (prefix `ai-e2e-home-`), distinct from `cwd`, so `os.homedir()` never collapses onto the project dir (which would silently force a project command into global scope) while still isolating from the user's real global config; the auto-created dir is removed in a `finally`. An explicit `options.env.HOME` wins and is never auto-removed. Returns `{ exitCode, stdout, stderr, combined }` with all fields pre-stripped of ANSI. See [Scope & HOME model](#scope--home-model). |
| `listFiles(dir)`                                                                                                                                        | Best-effort `readdir`; returns `[]` on error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `readTestFile(path)`                                                                                                                                    | `readFile(path, "utf-8")` passthrough.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `readMarketplaceJson(outputPath)`                                                                                                                       | Parse a generated `marketplace.json` into `Marketplace`. Used by `build marketplace` / `new marketplace` tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `writeProjectConfig(baseDir, cfg)`                                                                                                                      | Renders `config.ts` via `renderConfigTs()` and writes it under `<baseDir>/.claude-src/`. Seeds missing `skills: []` and `agents: []`. Emits ONLY `config.ts` — pair with `writeConfigTypes` when the test asserts on the companion file.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `writeConfigTypes(baseDir)`                                                                                                                             | Writes a minimal `config-types.ts` stub under `<baseDir>/.claude-src/`. `writeProjectConfig` emits only `config.ts`, so tests asserting on the companion file (e.g. uninstall manifest removal) seed it with this.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `seedDefaultSourceCache(homeDir, sourceDir)`                                                                                                            | Copies `sourceDir` into the CLI source cache for `DEFAULT_SOURCE` under `homeDir` so the public-marketplace fallback resolves from disk instead of the network. Returns the seeded dir.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `createLocalSkill(dir, id, opts?)`                                                                                                                      | Creates `<dir>/.claude/skills/<id>/SKILL.md` via `renderSkillMd()`, plus optional `metadata.yaml`. Returns absolute skill dir.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `writeAgentFile(baseDir, agentName, opts?)`                                                                                                             | Writes `<baseDir>/.claude/agents/<agentName>.md`. Defaults to a bare `# <agentName>` heading, no frontmatter (enough for `doctor`/`list` to see the agent). `opts.frontmatter` prefixes a `name:` block.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `writeAgentStubs(projectDir, agents)`                                                                                                                   | Writes minimal compiled-agent stubs (frontmatter with name only) as a prior `compile` would leave behind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `createPermissionsFile(dir)`                                                                                                                            | Ensures `<dir>/.claude/settings.json` grants `permissions.allow: ["Read(*)"]`, bypassing the post-install permission prompt (otherwise the PTY never exits — see FINDINGS.md, Finding 7). **MERGES, never overwrites** (0.145.0): every existing field is preserved, a file that already grants the permission is left byte-identical, and invalid JSON is a hard error. It previously clobbered the whole file, wiping `enabledPlugins` / `extraKnownMarketplaces` whenever an `EditWizard.launch` re-ran it mid-lifecycle after a plugin install.                                                                                              |
| `agentsPath(dir)` / `skillsPath(dir)`                                                                                                                   | `.claude/agents` and `.claude/skills` path builders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `configTsPath(dir)` / `configTypesTsPath(dir)`                                                                                                          | `<dir>/.claude-src/config.ts` and `.../config-types.ts` path builders (project or global scope dir).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `addForkedFromMetadata(dir)`                                                                                                                            | Writes `FORKED_FROM_METADATA` to the default `web-framework-react` skill's `metadata.yaml`. Marks it as CLI-managed so `uninstall` removes it (instead of skipping as user-created).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `injectMarketplaceIntoConfig(dir,name)`                                                                                                                 | Textually inserts `"marketplace": "<name>",` after `export default {` in an existing `config.ts`. Used by lifecycle tests switching local → plugin source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getEjectedTemplatePath(dir)`                                                                                                                           | Returns `<dir>/.claude-src/agents/_templates/agent.liquid`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `loadConfigOrFail(dir)`                                                                                                                                 | Structurally loads a scope's `config.ts` via `loadProjectConfigFromDir()`; throws when absent or unparseable (no silent empty-config fallback). Returns `ProjectConfig`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `readAgentEntriesFor(dir, agentName)`                                                                                                                   | Loads a scope's config and returns every `AgentScopeConfig` named `agentName`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `completeWithLocalSources(wizard)`                                                                                                                      | Drives the init wizard end-to-end with every skill source switched to local (`l` hotkey on the Sources step). Returns the `WizardResult`. Required by tests asserting on `.claude/skills/` contents.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `renderAgentMd` / `renderAgentYaml` / `renderConfigTs` / `renderMetadataYaml` / `renderSkillMd`                                                         | Re-exported from `src/cli/lib/__tests__/content-generators.ts`. **Always use these** instead of inlining fixtures (CLAUDE.md rule).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `normalizeGlobalConfig`                                                                                                                                 | Re-exported from `src/cli/lib/__tests__/helpers/config-comparison.ts`. Normalizes a global config for stable comparison.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `writeTestPackageJson`                                                                                                                                  | Re-exported from `src/cli/lib/__tests__/helpers/config-io.ts`. Writes a minimal `package.json` for TypeScript config loading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `createE2ESource` / `E2E_AGENT_TITLES` / `E2E_SKILL_TITLES` / type `E2ESource`                                                                          | Re-exported from `./create-e2e-source.ts`. `createE2ESource` builds a fake skills-marketplace source tree under a temp dir; the `*_TITLES` maps hold the display titles the wizard renders for each agent/skill.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `isClaudeCLIAvailable` / `claudePluginMarketplaceAdd` / `claudePluginMarketplaceList` / `claudePluginInstall` / `claudePluginUninstall` / `execCommand` | Re-exported from `src/cli/utils/exec.ts`. Used by tests that exercise the real Claude plugin install flow — gated behind `describe.skipIf(!claudeAvailable)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Scope & HOME model

The E2E sandbox never lets `HOME` collapse onto the project dir by accident. Both the interactive path (`TerminalSession`, `helpers/terminal-session.ts`) and the non-interactive `runCLI` default `HOME` to a freshly-created SIBLING temp dir (prefix `ai-e2e-home-`), distinct from `cwd`/`projectDir`, and remove it on teardown. Because `os.homedir()` therefore never equals the project dir, a project `edit`/`init` stays at genuine PROJECT scope (`isEditingFromGlobalScope === false`) instead of silently running as a global edit. An explicit `env.HOME` always wins and is never auto-removed. (Earlier revisions defaulted HOME to `cwd`/`projectDir`; that collapse is gone.)

Skills and agents default to GLOBAL scope, so their installed content (`.claude/skills`, compiled agents, `settings.json`) lands under that global HOME, NOT `projectDir`. The scope-explicit wizard launchers expose that dir as `wizard.globalHome`:

- `launchInProject()` allocates a fresh global HOME distinct from `projectDir` — models a project install: global-default content is observable at `wizard.globalHome`, while `config.ts` stays under `projectDir`. An optional `globalHome?` reuse param lets a multi-phase test share one global HOME across launches (allocator owns cleanup).
- `launchInGlobal()` sets `HOME === cwd === projectDir` — models editing the global install, so every artifact collapses back onto `projectDir`.
- A plain `launch()`/`launchRaw()` wizard uses an internal auto-allocated HOME and `wizard.globalHome` throws.

`CLI.run` and the `WizardResult`/`ProjectHandle` handle carry the same `globalHome` (see [E2E Fixtures](#e2e-fixtures-e2efixtures)), so a follow-up command reads the same global root the wizard wrote.

Pick the launcher by what the test does — asserting installed content vs. toggling a global skill's source vs. running a cwd-resolving follow-up (`cc uninstall`, `claude plugin install`). Those decision rules are the prescriptive standard [Choosing the Wizard Launcher by Scope](../../standards/e2e/anti-patterns.md#choosing-the-wizard-launcher-by-scope); this doc only describes the mechanism.

## E2E Source Factories (`e2e/helpers/create-e2e-source.ts`, `create-e2e-plugin-source.ts`)

Build fake skills-marketplace source trees under a temp dir for the init/edit wizard and plugin flows. Create ONCE per describe block in `beforeAll` and pass via the wizard launchers' `source` option — never per-test.

| Export                  | Signature                                                                                                                | Purpose                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createE2ESource`       | `(options?: { relationships?: Partial<RelationshipDefinitions> }) => Promise<E2ESource>`                                 | Writes skills, agents, stacks, and the minimal agent template so the full init → compile pipeline succeeds. Optional `relationships` writes `config/skill-rules.ts` for slug-based relationship E2E (`validate` / `info`). |
| `createE2EPluginSource` | `(options?: { marketplaceName?: string; relationships?: Partial<RelationshipDefinitions> }) => Promise<E2EPluginSource>` | Canonical plugin-mode setup: `createE2ESource()` → `build plugins` → `build marketplace` (via `runCLI`); throws on either non-zero exit. `marketplaceName` defaults to `e2e-test-<Date.now()>`.                            |
| type `E2ESource`        | `{ sourceDir: string; tempDir: string }`                                                                                 | Source root + owning temp dir (clean up `tempDir` in `afterAll`).                                                                                                                                                          |
| type `E2EPluginSource`  | `E2ESource & { marketplaceName: string; pluginsDir: string }`                                                            | `pluginsDir` = `<sourceDir>/dist/plugins` (`PLUGINS_DIST_PATH`); each subdir is a plugin root.                                                                                                                             |

**Source-of-truth title maps** (`create-e2e-source.ts`): written into each fixture's `metadata.yaml`, so they ARE the text the wizard renders. Assertions matching rendered skill/agent text MUST key off these instead of re-typing strings. `E2E_AGENT_TITLES` is re-exported by `fixtures/expected-values.ts` as `E2E_AGENT_DISPLAY`; both maps are also re-exported through `helpers/test-utils.ts`.

`E2E_SKILL_TITLES` — `Partial<Record<SkillId, string>>`, all 9 entries:

| Skill id                                | Display title          |
| --------------------------------------- | ---------------------- |
| `web-framework-react`                   | `web-framework-react`  |
| `web-testing-vitest`                    | `web-testing-vitest`   |
| `web-state-zustand`                     | `web-state-zustand`    |
| `api-framework-hono`                    | `api-framework-hono`   |
| `meta-methodology-research-methodology` | `Research Methodology` |
| `meta-reviewing-reviewing`              | `Reviewing`            |
| `meta-reviewing-cli-reviewing`          | `CLI Reviewing`        |
| `web-framework-vue-composition-api`     | `Vue Composition Api`  |
| `web-state-pinia`                       | `web-state-pinia`      |

`E2E_AGENT_TITLES` — `Partial<Record<AgentName, string>>`, both entries: `web-developer` → `Web Developer`, `api-developer` → `API Developer`.

The 9 skill ids here match the `E2E_SKILL_IDS` tuple in `fixtures/expected-values.ts` (see the [E2E Fixtures](#e2e-fixtures-e2efixtures) table).

## Type-Narrowing Probe (`e2e/helpers/type-check-probe.ts`)

Verifies that a project's generated `config-types.ts` union aliases still REJECT bogus values — asserting the property that matters, not the emitted text. A union that has collapsed to `string` passes a text assertion but silently accepts everything; this probe makes `tsc` render the verdict.

| Export                      | Signature                                                                                             | Purpose                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probeConfigTypesNarrowing` | `(claudeSrcDir: string, aliases: readonly string[]) => Promise<{ exitCode: number; output: string }>` | Writes a probe module next to `config-types.ts` assigning a bogus literal to each alias, runs the repo-local `tsc` on it, removes the probe, returns tsc's verdict. `exitCode` `0` = aliases NOT narrowing (bug); non-zero with `TS2322` in `output` = narrowing correctly. |
| `TS_NOT_ASSIGNABLE`         | `"TS2322"`                                                                                            | TypeScript's "type X is not assignable to type Y" diagnostic code; asserted in `output` to confirm narrowing.                                                                                                                                                               |

Mechanics: the bogus literal is `__agentsinc-e2e-bogus-literal__` (module-internal `BOGUS_TYPE_LITERAL`, not exported). The compiler is the repo-local `node_modules/typescript/bin/tsc` (an `npx tsc` from a temp dir resolves the wrong package). Flags mirror the repo tsconfig (`--noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler`) and are passed positionally so the temp directory's own tsconfig cannot perturb the verdict. The probe file is removed in a `finally`, leaving the installed file tree byte-identical for the caller's subsequent filesystem assertions. Consumers pass the generated aliases `SkillId`, `AgentName`, `Domain`, `Category`.

## Test-Lifecycle Patterns

E2E files consistently follow this shape (see `plugin-install-failure-hard-error.e2e.test.ts`, `info-panel-scope-toggle-diff.e2e.test.ts` as representative examples):

```ts
beforeAll(async () => {
  await ensureBinaryExists();
  source = await createE2ESource(); // or createE2EPluginSource()
}, TIMEOUTS.SETUP);

afterAll(async () => {
  await cleanupTempDir(source.tempDir);
});

afterEach(async () => {
  await wizard?.destroy(); // close PTY, cleanup temp project + temp dirs
  wizard = undefined;
});
```

Key rules enforced across the suite:

- **`ensureBinaryExists()` in `beforeAll`** — every interactive/lifecycle/command file calls it once.
- **Source creation in `beforeAll`** — E2E sources are expensive; never re-create per-test.
- **Project dir creation per-test** — use `ProjectBuilder` (`fixtures/project-builder.ts`) in `beforeEach` / `it()` body so each scenario starts clean.
- **Cleanup in `afterEach`** — PTY sessions and per-test projects are torn down via the page object's `destroy()` (InitWizard/EditWizard/DashboardSession all expose it; there is no `dispose()`); source teardown lives in `afterAll`.
- **`describe.skipIf(!claudeAvailable)`** — tests that exercise the real `claude plugin install` pipeline (e.g. `plugin-install-failure-hard-error.e2e.test.ts`, `plugin-lifecycle.e2e.test.ts`) are gated on `isClaudeCLIAvailable()`. Note: `real-marketplace.e2e.test.ts` is gated instead on `hasSkillsSource` (a `directoryExists` check for the local skills repo under `SKILLS_SOURCE`), NOT on the Claude CLI.

## Timeout Infrastructure

`TerminalSession` has a `defaultTimeout` readonly property (set from `TerminalSessionOptions.defaultTimeout` or CI-aware defaults: `TIMEOUTS.SESSION_DEFAULT` (10s) locally, `TIMEOUTS.SESSION_DEFAULT_CI` (20s) in CI). Methods `waitForText()` and `waitForExit()` use this as their fallback timeout.

`BaseStep` sets its own `defaultTimeout` to `TIMEOUTS.WIZARD_LOAD` (45s) -- intentionally different from the session default -- used by `waitForStep()`, `waitForStepAfter()`, `waitForWizardFooter()`, `waitForWizardFooterAfter()`, and the `*Awaiting` raw-output waits. It rose with `WIZARD_LOAD` in 0.145.0 (15s → 45s), so every unqualified step wait is now a 45s upper bound.

`InitWizardOptions` and `EditWizardOptions` both accept `defaultTimeout` which is passed through to `TerminalSession`. `InitWizardOptions` also accepts `loadTimeout` to override the initial `waitForReady()` timeout separately.

## Custom Matchers (`e2e/matchers/`)

Imported per-test via `import "../matchers/setup.js"`. The setup extends `expect` with matchers from both `project-matchers.ts` and `agent-matchers.ts`.

**Project matchers (`project-matchers.ts`):**

- `toHaveConfig()` - Verify project config exists with expected content
- `toHaveCompiledAgents()` / `toHaveCompiledAgent(name)` - Verify agent compilation
- `toHaveCompiledAgentContent(name, { contains, notContains })` - Verify agent content
- `toHaveSkillCopied(skillId)` - Verify skill was copied
- `toHaveLocalSkills(expectedIds?)` / `toHaveNoLocalSkills()` - Verify local skills
- `toHavePlugin(key)` / `toHaveNoPlugins()` - Verify plugin state
- `toHavePluginInRegistry(key, scope?)` - Verify plugin registry
- `toHaveEjectedTemplate()` - Verify ejected template exists
- `toHaveSettings(expectations?)` - Verify settings file

**Agent matchers (`agent-matchers.ts`):**

- `toHaveAgentFrontmatter(agentName, { name?, description?, model?, tools?, skills?, noSkills? })` - Verify agent frontmatter fields
- `toHaveAgentDynamicSkills(agentName, { skillIds?, noSkillIds?, hasActivationProtocol?, allPreloaded? })` - Verify agent dynamic skills section

## E2E Fixtures (`e2e/fixtures/`)

| File                      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`                  | `CLI` class with `static run(args, project, options?)` for non-interactive commands. HOME precedence is `options.env.HOME` > `project.globalHome` > `project.dir`: a follow-up command reads the same global root the wizard wrote when the handle carries a `globalHome` (from `launchInProject`/`launchInGlobal`), and falls back to `project.dir` (byte-identical to the old hardcoded default) otherwise. See [Scope & HOME model](#scope--home-model).                                                                                                                                             |
| `dual-scope-helpers.ts`   | Types `DualScopeEnv` / `TestEnvironment`; env builders `createTestEnvironment()`, `initGlobal()`, `initProject()`, `finishWizard()`, `setupDualScope()`, `initGlobalWithEject()`, `setupDualScopeWithEject()`, `createDualScopeEnv()`, `initProjectAllGlobal()`, `setupProjectOnlyMixedScope()`, `createGlobalOnlyEnv()`; config readers `readSkillEntries()`, `readAgentEntries()`, `readSelectedAgents()`, `readAllSkillEntries()`, `readConfigSkillIds()`; edit probes `runEditWithFirstSkillAction()`, `readSkillBadgesViaEdit()`                                                                   |
| `expected-values.ts`      | `E2E_SKILL_IDS` (9-entry tuple: `api-framework-hono`, `meta-methodology-research-methodology`, `meta-reviewing-cli-reviewing`, `meta-reviewing-reviewing`, `web-framework-react`, `web-framework-vue-composition-api`, `web-state-pinia`, `web-state-zustand`, `web-testing-vitest`), `E2E_SKILL` (per-skill id↔slug↔display map), `E2E_AGENT` (per-agent name↔display map), `E2E_AGENTS` (agent name constants with `WEB`, `API`, and computed `WEB_AND_API` getter), `E2E_AGENT_DISPLAY` (re-exported `E2E_AGENT_TITLES`) -- canonical expected values for E2E assertions                             |
| `interactive-prompt.ts`   | `InteractivePrompt` class for PTY-based wizard tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `plugin-install-state.ts` | Types `PluginInstalledProject` / `PluginInstalledProjectOptions`; `createPluginInstalledProject()` reproduces a completed `claude plugin install` WITHOUT the Claude CLI binary — it writes `config.ts` (skills sourced to the marketplace), `settings.json` (`enabledPlugins`), and the fake-HOME `installed_plugins.json` registry directly, so plugin-state tests run unconditionally (e.g. `commands/doctor-blind-spots.e2e.test.ts` consumes it ungated). `uninstallProjectPlugins()` read-modify-writes both files to clear `enabledPlugins` and registry records, leaving `config.ts` untouched. |
| `project-builder.ts`      | `ProjectBuilder` class with all 9 `static` factories: `minimal()`, `editable()`, `dualScope()`, `dualScopeWithImport()`, `withCustomSkill()`, `pluginProject()`, `localProjectWithMarketplace()`, `globalWithSubproject()`, and `installation(dir)`. Return shapes: `ProjectHandle` (most), `DualScopeHandle` (`dualScope` / `dualScopeWithImport`), `{ globalHome, subDir }` (`globalWithSubproject`), `void` (`installation`).                                                                                                                                                                        |

## BaseStep Primitives Contract

`BaseStep` (`e2e/pages/base-step.ts`) is the superclass for every wizard step page object. It provides raw PTY-input primitives, output-scraping accessors, and a small set of composition helpers. Subclasses (`BuildStep`, `DomainStep`, etc.) compose these into step-specific methods.

**Design intent:** primitives are intentionally "raw" — they write to the PTY and wait only for a minimal intra-keystroke debounce. They do NOT call `waitForWizardFooter`. The footer wait is the responsibility of each composed step method (see [Page-Object Keypress Rule](#page-object-keypress-rule-waitforwizardfooter)). This keeps primitive cost flat and lets callers batch operations without paying for a stability probe on every character.

### Key-Press Primitives (protected)

All key-press primitives share the same contract: write one PTY token, then `await delay(INTERNAL_DELAYS.KEYSTROKE)` (150ms) — except `pressEnter`, which uses `INTERNAL_DELAYS.STEP_TRANSITION` (500ms) because Enter typically advances wizard state.

| Primitive         | Writes to PTY          | Post-press delay                        | Pre-press `waitForWizardFooter`? |
| ----------------- | ---------------------- | --------------------------------------- | -------------------------------- |
| `pressEnter`      | `session.enter()`      | `INTERNAL_DELAYS.STEP_TRANSITION` 500ms | NO                               |
| `pressSpace`      | `session.space()`      | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressKey(k)`     | `session.write(k)`     | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressEscape`     | `session.escape()`     | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressArrowDown`  | `session.arrowDown()`  | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressArrowUp`    | `session.arrowUp()`    | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressArrowRight` | `session.arrowRight()` | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |
| `pressCtrlC`      | `session.ctrlC()`      | `INTERNAL_DELAYS.KEYSTROKE` 150ms       | NO                               |

**Contract:** returns after the PTY write flushes AND the fixed delay elapses. Does NOT guarantee React has committed, effects have flushed, or a new frame has painted.

**Invariants assumed:** caller has ensured the previous frame is stable and the relevant `useInput` handler is mounted. Violating this is the general PTY-write-vs-React-commit race the page-object keypress rule guards against. (The specific `focusedSkillId` seeding race that originally motivated the rule was closed in 0.142.5 — the store now seeds `focusedSkillId` synchronously; see the keypress-rule section below.)

### Wait Primitives (protected)

| Primitive                           | Delegates to                                                      | Guarantee                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitForStep(text, t?)`             | `screen.waitForText`                                              | Returns when `text` appears anywhere in full output within `t ?? TIMEOUTS.WIZARD_LOAD` (45s).                                                                               |
| `waitForStepAfter(text, cur, t?)`   | `screen.waitForTextAfter`                                         | Cursor-anchored variant. Returns when `text` appears AFTER raw-output offset `cur`. Use when scrollback may match.                                                          |
| `waitForWizardFooter(t?)`           | `screen.waitForWizardFooter`                                      | Returns when the wizard footer sentinel `"select"` is visible. `WizardLayout` screens only. Observes PTY output, NOT React lifecycle (see scrollback note).                 |
| `waitForWizardFooterAfter(cur,t?)`  | `screen.waitForWizardFooterAfter`                                 | Cursor-anchored footer wait. Required at step transitions where prior frames sit in scrollback.                                                                             |
| `waitForItemVisible(label, n=30)`   | loop: `waitForWizardFooter` + `arrowDown` until `label` in output | Scrolls looking for `label`, awaiting the footer before each keypress (per the 2026-07-20 guard sweep). Throws after `n` attempts. Does NOT confirm cursor is on the label. |
| `navigateCursorToItem(label, n=30)` | loop: `waitForWizardFooter` + `arrowDown` until `❯` line matches  | Moves cursor until the focused line (marked with `❯`) contains `label`, awaiting the footer before each keypress. Throws after `n` attempts.                                |

**Distinction:** `waitForItemVisible` is a VISIBILITY check — it only guarantees the label is on screen somewhere. `navigateCursorToItem` is a CURSOR check — it guarantees the focused row contains the label. Choose the latter whenever the next action depends on cursor position.

### Cursor / Screen Queries (public / protected)

| Method                               | Access    | Returns                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOutput()`                        | public    | xterm's PROCESSED buffer — current screen plus whatever genuinely scrolled off. NOT a frame log (see below).                                                                                                                                                                          |
| `getScreen()`                        | public    | Visible viewport only. For test assertions that must ignore scrollback.                                                                                                                                                                                                               |
| `getRawCursor()`                     | protected | Raw-output byte offset snapshot, for pairing with `*After` wait methods.                                                                                                                                                                                                              |
| `getSummaryDiffEntries(displayName)` | public    | Parses `SkillAgentSummary` panel; returns `{prefix, scope}[]` for the given display name (splitting the columns on the `│` divider so Project/Global scope is attributed per column). Internally calls `waitForWizardFooter` once before scraping — the only read query that does so. |

#### `getOutput()` is a buffer, not a frame log

`BaseStep.getOutput()` → `TerminalSession.getFullOutput()` reads `xterm.buffer.active` — the current screen plus whatever genuinely scrolled off. **Ink redraws in place**, so when a frame fits the viewport (the common case at `TERMINAL_SIZE.TALL`) each repaint OVERWRITES the previous one and nothing enters scrollback. A value that was rendered and then re-rendered differently is not retrievable from it.

The only frame-accumulating surface is `TerminalSession.getRawOutput()` — every byte the process wrote, including text Ink later overwrote. It is reachable from the wizard objects (`InitWizard.getRawOutput()`, `EditWizard.getRawOutput()`, `WizardResult.rawOutput`) and from `TerminalScreen.getRawOutput()` / `waitForRawText` / `waitForTextAfter`, but is deliberately NOT exposed on `BaseStep`. Empirically verified against the real binary: a `+ web-framework-react` marker present in `getOutput()` before a `navigateDown()` is absent from `getOutput()` after it, while `getRawOutput()` still holds it.

Practical consequence for the toast-asserting methods (`toggleFocusedSkillAwaiting`, `toggleFilterIncompatibleAwaiting`, `toggleFocusedAgentAwaiting`, `confirmAwaiting`): toasts render in an absolutely-positioned row Ink rewrites in place, so the processed buffer has already lost the text by the time a test reads it. Those methods snapshot a raw cursor before the press and wait on raw output after it. See `.ai-docs/agent-findings/2026-07-29-e2e-getoutput-is-not-a-frame-accumulator.md`.

### Composition Helpers (protected / public)

| Helper                               | Purpose                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressEnterAndWaitFor(nextStepText)` | Awaits `waitForWizardFooter`, then delegates to the shared `retryEnterUntil()` (`pages/retry-enter.ts`): snapshot cursor, press Enter, poll for `nextStepText` after cursor within `INTERNAL_RETRIES.INTERVAL_MS`, re-press up to `INTERNAL_RETRIES.MAX_ATTEMPTS` (5) times. `DashboardSession.selectEdit` uses the same `retryEnterUntil`. |
| `abort()`                            | Awaits `waitForWizardFooter`, then `pressCtrlC` (guarded per the 2026-07-20 sweep).                                                                                                                                                                                                                                                         |
| `navigateDown/Up/Right()`            | Await `waitForWizardFooter`, then `pressArrow*` (guarded per the 2026-07-20 sweep).                                                                                                                                                                                                                                                         |

**`pressEnterAndWaitFor` invariant:** the sentinel text MUST be unique to the next step's first frame — text appearing in the current footer (e.g. `"select"`) returns instantly on the Enter's own repaint and defeats the closed-loop retry.

### Design Question: Primitive-Level Wait vs. Method-Level Wait

> **Resolved 2026-07-20 (Option B).** The [keypress-guard sweep](../../agent-findings/2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout.md) took Option B: raw primitives stay cost-flat, and `await this.waitForWizardFooter()` was added upstream of every PTY write in each composed method — including inside the five loop bodies (`waitForItemVisible`, `navigateCursorToItem`, `domain-step.deselectAll`, `search-modal.type`, `build-step.focusSkill`) and both composition helpers (`pressEnterAndWaitFor`, `build-step.pressEnterWaitNewFrame`). Cost turned out near-zero because `pollUntil` evaluates its predicate before its first `delay`, so a footer already in scrollback returns synchronously. The remaining hole is the sync `abort()`/`escape()`/`ctrlC()` methods on `InitWizard`/`EditWizard`/`DashboardSession` (called unawaited at ~26 spec sites) — reachable via the guarded async `abortAndDestroy()` instead. The analysis below is retained as the historical trade-off record.

The iter-9 audit found 32 sibling-step methods and 5 `BaseStep` composition helpers that press keys without a pre-press `waitForWizardFooter`. Two structural options:

**Option A — internalize the wait in primitives.** Move `await this.waitForWizardFooter()` into every `press*` primitive. Pros: structurally enforced, impossible to forget, deletes ~32 caller lines. Cons: every primitive pays the footer probe cost (worst case one `TerminalScreen.waitForWizardFooter` poll interval per keystroke); breaks the "primitives are cheap" design; over-serializes tests that legitimately batch keystrokes (e.g. `search-modal.type` typing a query char-by-char); and hard-couples every primitive to the wizard footer, which non-`WizardLayout` screens never paint.

**Option B — keep primitives raw, enforce at method level.** Require every composed method to call `waitForWizardFooter` before any primitive use. Pros: primitives stay fast, batched typing remains one wait; callers can use `waitForWizardFooterAfter(cursor)` or custom waits where the footer sentinel is wrong. Cons: structurally unenforced (the 32 audit gaps prove this); every new step method is a potential regression.

**Option C (hybrid) — keep primitives raw, but add a wait-first composition helper.** Introduce `pressAfterStable(primitiveFn)` that calls `waitForWizardFooter` then invokes the primitive. Refactor compliant methods through it. Pros: opt-in, cheap primitives preserved, single audit point. Cons: two ways to press a key; linting would need a custom rule.

**Cost estimate for Option A (back-of-envelope):**

- `TerminalScreen.waitForWizardFooter` polls full output for `"select"` on an interval. A compliant session where the footer is already present returns on the first poll (~0ms observation, ~20-50ms scheduling). A session mid-transition waits one full poll cycle (~100ms typical).
- Suite size at the time of the estimate was ~65 E2E files (156 as of 0.146.0) × ~5-10 keypresses per test × ~100ms worst-case = ~30-60s total added under contention. Under no contention: negligible (first-poll hits).
- `search-modal.type` is the outlier: typing "cli" is 3 `pressKey` calls → 3 extra stability probes on text that is intentionally mid-change. Would need an exemption.

**Recommendation at the time (doc-only observation):** Option C. It localizes the wait decision, keeps the 150ms keystroke-batching property for multi-char input, and makes the audit a one-file grep (`pressAfterStable` call sites). The sweep ultimately shipped Option B (see the resolution note above) — the near-zero measured cost of guarding every method removed the main argument for the hybrid.

### Primitives That Already Wait

After the 2026-07-20 keypress-guard sweep, the only `BaseStep` members that do NOT `await waitForWizardFooter` before their action are:

- The **raw key-press primitives** — `pressEnter`, `pressSpace`, `pressKey`, `pressEscape`, `pressArrowDown/Up/Right`, `pressCtrlC` — by documented design intent (callers own the wait).
- The **read-only queries** — `getOutput`, `getScreen`, `getRawCursor` — they scrape without pressing.

Everything that presses a key now guards first: `navigateDown/Up/Right`, `abort`, `waitForItemVisible` and `navigateCursorToItem` (inside their loop bodies), `pressEnterAndWaitFor`, and the scraping query `getSummaryDiffEntries`. The one exception is `retryEnterUntil`'s internal press loop, which IS the stability primitive (its `confirmPainted(cursor)` post-condition detects a dropped Enter) and is guarded once at each call site instead.

## Page-Object Keypress Rule (waitForWizardFooter)

### Invariant

Every page-object method that sends a key press (keystroke, Space, Enter, Escape, arrow, Tab, literal char, `session.*`) MUST `await this.waitForWizardFooter()` **before** the press. Post-press waits do not substitute. This applies to every method on every step, not just the first interaction after a step transition.

**Precondition — `WizardLayout` screens only.** `waitForWizardFooter` matches the single footer string `"select"`, which only `WizardLayout` paints. The rule therefore binds `BaseStep` subclasses; a page object for a footer-less screen (`DashboardSession`) must gate on its own sentinel instead. Applying the guard to the dashboard once cost 72 failures across 35 files — see the findings at the end of this section.

### Why (PTY-Write-vs-React-Commit Race)

- **The general hazard (still live):** under parallel-suite contention a PTY write can land between React commit and the incoming frame's `useInput` handler registering. The keystroke reaches the new frame, but the handler hasn't mounted yet, so the press silently no-ops. In isolation the race is invisible (slack in the event loop); under load it surfaces as flake on whichever scenario loses the race first. This is why the rule applies to every keypress, not just the first after a transition.
- **Historical concrete case (fixed in 0.142.5):** the `s` scope-toggle handler in `wizard.tsx` HOTKEY_SCOPE reads `store.focusedSkillId`, which `CategoryGrid` used to seed in a post-mount `useEffect` — `null` until the effect flushed. 0.142.5 deleted that mount effect: the store now seeds `focusedSkillId` synchronously via `seedFocusedSkillForActiveDomain()` (`src/cli/stores/wizard-store.ts`) at hydrate (init + edit), build-step entry, and every domain transition, from the same `buildCategoriesForDomain` derivation the grid renders. The `s`-toggle race that flaked `lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts` under load is closed; the keypress rule still guards the general race for every other handler.

### How `waitForWizardFooter` Works

Defined on `BaseStep` (`e2e/pages/base-step.ts`), delegates to `TerminalScreen.waitForWizardFooter` (`e2e/pages/terminal-screen.ts`), which polls for the footer sentinel `"select"` in full output until `TIMEOUTS.WIZARD_LOAD` (45s since 0.145.0 — so a footer-less screen now burns 45s, not 15s, before the wait gives up).

| Observes                                        | Does NOT observe                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Footer "select" text in PTY scrollback          | React `useEffect` having flushed                                                                                         |
| Frame layout having painted                     | `useInput` handler being registered on new frame                                                                         |
| Wizard has reached a renderable, laid-out state | Store fields seeded by post-mount effects (`focusedSkillId` was one until 0.142.5 moved it to synchronous store seeding) |

**Scrollback hazard:** The footer "select" is emitted by every wizard step. On step transitions where previous frames sit in scrollback, `waitForWizardFooter` can return instantly on stale residue — use `waitForWizardFooterAfter(cursor)` (cursor-anchored, footer match post-cursor).

### Former Escape Hatch — `FOCUS_EFFECT_FLUSH_MS` (Removed in 0.142.5)

`BuildStep.toggleScopeOnFocusedSkill` once added `await this.delay(FOCUS_EFFECT_FLUSH_MS)` (500ms) after `waitForWizardFooter` and before pressing `s`, to absorb the post-mount `focusedSkillId` seed. That delay was deleted when 0.142.5 made the store seed `focusedSkillId` synchronously (see above). The method is now just:

```ts
async toggleScopeOnFocusedSkill(): Promise<void> {
  await this.waitForWizardFooter();
  await this.pressKey("s");
}
```

`FOCUS_EFFECT_FLUSH_MS` no longer exists anywhere in the repo. The general lesson stands: if a future keypress ever depends on store state seeded by a post-mount effect that `waitForWizardFooter` cannot observe, fix the seeding layer (seed synchronously in the store, as `seedFocusedSkillForActiveDomain()` does) rather than widening a page-object delay.

### Better Primitives (Resolved for focusedSkillId)

`waitForWizardFooter` observes terminal output, not React lifecycle. For the `focusedSkillId` case the canonical fix shipped in 0.142.5: the store seeds `focusedSkillId` synchronously via `seedFocusedSkillForActiveDomain()`, eliminating that race and making the `FOCUS_EFFECT_FLUSH_MS` delay dead code (since removed). Two tighter alternatives were considered and not needed:

- **ANSI focus-indicator parse** — detect that CategoryGrid emitted the focused skill's inverted-style marker before keypress. Tighter than footer match but requires per-screen parsing logic.
- **Store snapshot probe** — expose a debug hook that prints `focusedSkillId` to stderr, poll until non-null. Requires product-code instrumentation.

For any future handler that reads store state seeded by a post-mount effect, prefer the same fix: seed synchronously in the store rather than adding a footer-blind delay in the page object.

### Scope: Where the Rule Applies

- **All step page objects** (`e2e/pages/steps/*.ts`) — every public method that presses a key. NOT `e2e/pages/dashboard-session.ts`: the dashboard paints no wizard footer, so the guard can never match there.
- **`BaseStep` helpers** (`e2e/pages/base-step.ts`) — the `pressEnter` / `pressSpace` / `pressKey` / `pressEscape` / `pressArrowX` / `pressCtrlC` primitives do NOT wait internally. Callers (subclass methods) are responsible.
- **Higher-level `BaseStep` methods** (`waitForItemVisible`, `navigateCursorToItem`, `navigate*`, `abort`, `pressEnterAndWaitFor`) — these send keystrokes and, since the 2026-07-20 keypress-guard sweep, all `await waitForWizardFooter` before every press (inside the loop bodies for `waitForItemVisible` / `navigateCursorToItem`). See "Primitives That Already Wait" above. The one exception is `retryEnterUntil`'s internal press loop, which IS the stability primitive and is guarded once at each call site.
- **All interactions, not just keypress:** The rule applies to any `session.*` write — character input (`search-modal.type`), navigation, modifier keys, Ctrl+C. The race is between PTY write and React commit+effect, independent of the key's semantic.
- **Not applicable:** `render`-inspection methods (`getOutput`, `getScreen`, `getRawCursor`, `getScopeBadgesForSkill`, `getExclusiveCategorySelectedCount`, `getScopeBadgesForAgent`, `getSummaryDiffEntries`) — these only read output. (`findSkillGridPosition` no longer exists: the parse-then-dead-reckon navigator it backed was replaced by `focusSkill`'s closed-loop Tab-walk.)

### Coverage Audit (2026-04-21, re-validated iter 35)

> **Superseded 2026-07-20.** The sweep in [`2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout.md`](../../agent-findings/2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout.md) added the guard upstream of every PTY write in `e2e/pages/steps/*.ts` and `e2e/pages/base-step.ts`, so the `NO` column below is historical. Re-audit before citing it.

The table below is the pre-sweep snapshot (as of 2026-04-21, re-validated iter 35): after the iter 8/9 fixes only `BuildStep` was compliant and the sibling step files still lacked the wait on many keypress methods. The 2026-07-20 sweep (see the superseded banner above) closed every `NO` row except the sync-abort carve-out, so this table is retained only as the historical gap record:

| File              | Method                      | Keystroke                          | Wait before press?                         |
| ----------------- | --------------------------- | ---------------------------------- | ------------------------------------------ |
| `agents-step.ts`  | `navigateCursorToAgent`     | arrow-down loop                    | NO                                         |
| `agents-step.ts`  | `advance`                   | Enter                              | NO                                         |
| `agents-step.ts`  | `goBack`                    | Escape                             | NO                                         |
| `confirm-step.ts` | `goBack`                    | Escape                             | NO                                         |
| `confirm-step.ts` | `goBackToAgents`            | Escape                             | NO                                         |
| `domain-step.ts`  | `acceptDefaults`            | Enter (`pressEnterAndWaitFor`)     | NO (only `waitForStep`, not stable-render) |
| `domain-step.ts`  | `toggleDomain`              | Space                              | NO                                         |
| `domain-step.ts`  | `advance`                   | Enter (`pressEnterAndWaitFor`)     | NO                                         |
| `domain-step.ts`  | `deselectAll`               | Space + arrow-down in loop         | NO                                         |
| `domain-step.ts`  | `goBack`                    | Escape                             | NO                                         |
| `search-modal.ts` | `type`                      | pressKey per char                  | NO                                         |
| `search-modal.ts` | `selectResult`              | Enter (after `waitForItemVisible`) | NO (visibility != stable render)           |
| `search-modal.ts` | `close`                     | Escape                             | NO                                         |
| `sources-step.ts` | `setAllLocal`               | `l`                                | NO                                         |
| `sources-step.ts` | `setAllPlugin`              | `p`                                | NO                                         |
| `sources-step.ts` | `selectFocusedSourceCell`   | Space                              | NO                                         |
| `sources-step.ts` | `openSettings`              | `s`                                | NO                                         |
| `sources-step.ts` | `closeSettings`             | Escape                             | NO                                         |
| `sources-step.ts` | `pressAddSource`            | `a`                                | NO                                         |
| `sources-step.ts` | `pressDeleteSource`         | `\x7f`                             | NO                                         |
| `sources-step.ts` | `goBack`                    | Escape                             | NO                                         |
| `sources-step.ts` | `advance`                   | Enter                              | NO                                         |
| `stack-step.ts`   | `selectFirstStack`          | Enter (`pressEnterAndWaitFor`)     | NO (relies on caller's `waitForReady`)     |
| `stack-step.ts`   | `selectStack`               | Enter (after navigate)             | NO                                         |
| `stack-step.ts`   | `selectScratch`             | Enter (after navigate)             | NO                                         |
| `stack-step.ts`   | `cancel`                    | Escape                             | NO                                         |
| `base-step.ts`    | `pressEnterAndWaitFor`      | Enter                              | NO (cursor-anchored post-wait only)        |
| `base-step.ts`    | `navigateCursorToItem`      | arrow-down loop                    | NO                                         |
| `base-step.ts`    | `waitForItemVisible`        | arrow-down loop                    | NO                                         |
| `base-step.ts`    | `navigateDown`/`Up`/`Right` | arrow                              | NO (public passthroughs)                   |
| `base-step.ts`    | `abort`                     | Ctrl+C                             | NO                                         |

**Compliant (for reference):** `build-step.ts` (all 22 public methods as of 0.146.0 — it was 16 when this table was taken), `agents-step.ts::acceptDefaults`, `agents-step.ts::toggleAgent` (only after navigate), `agents-step.ts::toggleScopeOnFocusedAgent`, `confirm-step.ts::confirm`, `confirm-step.ts::confirmExpectingExit`, `sources-step.ts::acceptDefaults` (via `waitForReady`), `stack-step.ts::waitForReady`.

### Findings

- [`2026-04-21-e2e-build-step-keypress-missing-stable-render.md`](../../agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md) — original 7 `build-step.ts` fixes and proposed standard tightening.
- [`2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`](../../agent-findings/2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md) — the 72-failure regression from applying the guard to `DashboardSession`; source of the `WizardLayout` precondition above.
- [`2026-07-20-waitforstablerender-renamed-to-waitforwizardfooter.md`](../../agent-findings/2026-07-20-waitforstablerender-renamed-to-waitforwizardfooter.md) — the rename (`waitForStableRender` → `waitForWizardFooter`, `waitForStableRenderAfter` → `waitForWizardFooterAfter`) that puts the precondition in the name.
- [`2026-07-29-e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk.md`](../../agent-findings/2026-07-29-e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk.md) — the `focusSkill` closed-loop rewrite, the `NO_COLOR` cell-focus observability constraint, the `createPermissionsFile` merge fix, and the `WIZARD_LOAD` 15s→45s raise.
- [`2026-07-29-e2e-getoutput-is-not-a-frame-accumulator.md`](../../agent-findings/2026-07-29-e2e-getoutput-is-not-a-frame-accumulator.md) — why `getOutput()` cannot serve historical-frame assertions, and which surface can.
- [`2026-07-24-d226-stepA-breaks-43-miscategorized-tests.md`](../../agent-findings/2026-07-24-d226-stepA-breaks-43-miscategorized-tests.md) and [`2026-07-24-d226-phase1-launcher-sugar-and-multiphase-home.md`](../../agent-findings/2026-07-24-d226-phase1-launcher-sugar-and-multiphase-home.md) — the sibling-HOME default, the 43-test/21-file migration surface it exposed, the `launchInProject`/`launchInGlobal` sugar, and the `globalHome?` reuse param for multi-phase flows.
