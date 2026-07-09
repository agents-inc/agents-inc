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
    waitForStableRender,
  ]
related:
  - reference/testing/infrastructure.md
  - reference/testing/factories.md
last_validated: 2026-04-21
---

# E2E Test Infrastructure

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Split from:** `reference/test-infrastructure.md`. See also: [infrastructure.md](./infrastructure.md), [factories.md](./factories.md), [mock-data.md](./mock-data.md).

## E2E Tests

**Config:** `e2e/vitest.config.ts` (separate Vitest config, no `setupFiles` — matchers imported per-test)
**Pattern:** `e2e/**/*.e2e.test.ts` (include)
**Timeout:** `testTimeout: 30_000`, `hookTimeout: 60_000`
**Pool:** `forks` (process isolation; no `poolOptions` — default fork count)
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
    test-utils.ts                    # Shared E2E utilities (runCLI, createTempDir, createLocalSkill, etc.)
  assertions/                        # Reusable high-level assertion helpers
    config-assertions.ts             # expectNoDuplicates(arr, label)
    phase-assertions.ts              # expectPhaseSuccess(result, { skillIds, agents, source, ... })
    scope-assertions.ts              # expectDualScopeInstallation(globalHome, projectDir, expected)
    uninstall-assertions.ts          # expectCleanUninstall(dir, { preservedSkills, preservedAgentFiles, removeConfig? })
  pages/                             # Page Object Model (POM) infrastructure
    constants.ts                     # DIRS, FILES, STEP_TEXT, TIMEOUTS, EXIT_CODES, SOURCE_PATHS
    base-step.ts                     # Base class for wizard step page objects
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
      init-wizard.ts
  matchers/                          # Custom Vitest matchers for E2E assertions
    project-matchers.ts              # toHaveConfig, toHaveCompiledAgent, toHaveSkillCopied, etc.
    setup.ts                         # expect.extend(projectMatchers) + type augmentation
  fixtures/                          # E2E test fixtures and builders
    cli.ts                           # CLI class for running non-interactive commands
    dual-scope-helpers.ts            # createTestEnvironment, initGlobal, initProject, setupDualScope
    interactive-prompt.ts            # InteractivePrompt class for PTY-based tests
    project-builder.ts               # ProjectBuilder class (minimal, editable, plugin project factories)
  commands/                          # Command (non-interactive) E2E tests — 22 files
    build.e2e.test.ts
    build-agent-plugins.e2e.test.ts
    compile.e2e.test.ts
    compile-edge-cases.e2e.test.ts
    compile-scope-filtering.e2e.test.ts
    doctor.e2e.test.ts
    doctor-diagnostics.e2e.test.ts
    dual-scope.e2e.test.ts
    eject.e2e.test.ts
    help.e2e.test.ts
    import-skill.e2e.test.ts
    list.e2e.test.ts
    new-agent.e2e.test.ts
    new-marketplace.e2e.test.ts
    new-skill.e2e.test.ts
    plugin-build.e2e.test.ts
    plugin-uninstall-core.e2e.test.ts
    plugin-uninstall-edge-cases.e2e.test.ts
    relationships.e2e.test.ts
    uninstall.e2e.test.ts
    uninstall-preservation.e2e.test.ts
    validate.e2e.test.ts
  interactive/                       # Interactive wizard E2E tests — 33 files (PTY-based)
    edit-agent-scope-routing.e2e.test.ts
    edit-plugin-hard-error.e2e.test.ts
    edit-skill-accumulation.e2e.test.ts
    edit-wizard-completion.e2e.test.ts
    edit-wizard-detection.e2e.test.ts
    edit-wizard-dual-scope-indicator.e2e.test.ts
    edit-wizard-excluded-skills.e2e.test.ts
    edit-wizard-launch.e2e.test.ts
    edit-wizard-local.e2e.test.ts
    edit-wizard-navigation.e2e.test.ts
    edit-wizard-plugin-migration.e2e.test.ts
    edit-wizard-plugin-operations.e2e.test.ts
    edit-wizard-unique-skill-guard.e2e.test.ts
    info-panel-scope-toggle-diff.e2e.test.ts
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
    search-static.e2e.test.ts
    smoke.e2e.test.ts
    uninstall.e2e.test.ts
    update.e2e.test.ts
  lifecycle/                         # Lifecycle E2E tests — 45 files (grew substantially during tombstone + scope-toggle work)
    agent-scope-toggle-agents-array.e2e.test.ts
    compile-after-scope-change.e2e.test.ts
    config-scope-integrity.e2e.test.ts
    cross-scope-lifecycle.e2e.test.ts
    doctor-dual-scope.e2e.test.ts
    dual-scope-edit-display.e2e.test.ts
    dual-scope-edit-integrity.e2e.test.ts
    dual-scope-edit-mixed-sources.e2e.test.ts
    dual-scope-edit-scope-changes.e2e.test.ts
    dual-scope-edit-source-changes.e2e.test.ts
    edit-add-local-skills.e2e.test.ts
    edit-global-fallback.e2e.test.ts
    exclusion-lifecycle.e2e.test.ts
    global-agent-propagation-type-consistency.e2e.test.ts
    global-agent-toggle-guard.e2e.test.ts
    global-scope-lifecycle.e2e.test.ts
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
    project-tracking-propagation.e2e.test.ts
    re-edit-cycles.e2e.test.ts
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

## E2E Page Object Model (POM)

The E2E tests use a Page Object Model pattern in `e2e/pages/`. Constants are self-contained (no imports from `src/cli/`).

**Constants (`e2e/pages/constants.ts`):**

| Export             | Purpose                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIRS`             | Directory names: `CLAUDE` (`.claude`), `CLAUDE_SRC` (`.claude-src`), `SKILLS`, `AGENTS`, `PLUGINS`, `PLUGIN_MANIFEST`                                                                                                                                                                                                                                    |
| `FILES`            | File names: `CONFIG_TS`, `CONFIG_TYPES_TS`, `SKILL_MD`, `METADATA_YAML`, `SETTINGS_JSON`, `INSTALLED_PLUGINS_JSON`, `IDENTITY_MD`, `PLAYBOOK_MD`, `PLUGIN_JSON`                                                                                                                                                                                          |
| `STEP_TEXT`        | Text used to identify wizard steps, completion states, prompts, dashboard, installation output, scope warnings, and terminal-size warnings. Key members include `STACK`, `DOMAINS`, `BUILD`, `BUILD_FOOTER`, `SOURCES`, `AGENTS`, `CONFIRM`, `INIT_SUCCESS`, `EDIT_SUCCESS`, `EDIT_UNCHANGED`, `FOOTER_SELECT`, `TOO_NARROW`, `TOO_SHORT`, etc.          |
| `TIMEOUTS`         | `WIZARD_LOAD`=15s, `WIZARD_TRANSITION`=45s (Enter→next-view first-frame under parallel load), `INSTALL`=30s, `PLUGIN_INSTALL`=60s, `PLUGIN_TEST`=90s (`PLUGIN_INSTALL + EXIT_WAIT`), `EXIT`=10s, `SESSION_DEFAULT`=10s (local) / `SESSION_DEFAULT_CI`=20s, `EXIT_WAIT`=30s, `SETUP`=60s, `LIFECYCLE`=180s, `EXTENDED_LIFECYCLE`=300s, `INTERACTIVE`=120s |
| `INTERNAL_DELAYS`  | Framework-internal delays (NOT for test files): `STEP_TRANSITION`=500ms, `KEYSTROKE`=150ms                                                                                                                                                                                                                                                               |
| `INTERNAL_RETRIES` | Framework-internal closed-loop retry budget (NOT for test files): `MAX_ATTEMPTS`=5, `INTERVAL_MS`=3_000. Used by `BaseStep.pressEnterAndWaitFor` and `DashboardSession.selectEdit` to re-press Enter when the first keystroke may land before the `useInput` handler mounts.                                                                             |
| `EXIT_CODES`       | Process exit codes: `SUCCESS`=0, `ERROR`=1, `INVALID_ARGS`=2, `NETWORK_ERROR`=3, `CANCELLED`=4, `UNKNOWN_COMMAND`=127                                                                                                                                                                                                                                    |
| `SOURCE_PATHS`     | Paths within a skills source directory (duplicated from `src/cli/consts.ts`): `SKILLS_DIR`=`src/skills`, `SKILL_CATEGORIES`=`config/skill-categories.ts`, `SKILL_RULES`=`config/skill-rules.ts`, `STACKS_FILE`=`config/stacks.ts`, `PLUGIN_MANIFEST_DIR`=`.claude-plugin`                                                                                |

**Page Objects:**

| Page Object        | File                           | Purpose                          |
| ------------------ | ------------------------------ | -------------------------------- |
| `BaseStep`         | `pages/base-step.ts`           | Base class for step page objects |
| `TerminalScreen`   | `pages/terminal-screen.ts`     | Terminal output parsing          |
| `DashboardSession` | `pages/dashboard-session.ts`   | Dashboard interaction            |
| `WizardResult`     | `pages/wizard-result.ts`       | ProjectHandle type, result type  |
| `AgentsStep`       | `pages/steps/agents-step.ts`   | Agents step interactions         |
| `BuildStep`        | `pages/steps/build-step.ts`    | Build step interactions          |
| `ConfirmStep`      | `pages/steps/confirm-step.ts`  | Confirm step interactions        |
| `DomainStep`       | `pages/steps/domain-step.ts`   | Domain selection interactions    |
| `SearchModal`      | `pages/steps/search-modal.ts`  | Search modal interactions        |
| `SourcesStep`      | `pages/steps/sources-step.ts`  | Sources step interactions        |
| `StackStep`        | `pages/steps/stack-step.ts`    | Stack selection interactions     |
| `EditWizard`       | `pages/wizards/edit-wizard.ts` | Composed edit wizard flows       |
| `InitWizard`       | `pages/wizards/init-wizard.ts` | Composed init wizard flows       |

## E2E Helpers (`e2e/helpers/test-utils.ts`)

The single shared-utility module for E2E. Re-exports fs helpers from the unit-test helper tree (`src/cli/lib/__tests__/`) plus Claude-CLI wrappers from `src/cli/utils/exec.ts`.

| Export                                                                                                                                                  | Purpose                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_ROOT` / `BIN_RUN`                                                                                                                                  | Absolute paths to repo root and the built binary (`bin/run.js`). `BIN_RUN` requires `npm run build` first.                                                                                                                                                                                            |
| `E2E_TEMP_PREFIX` (internal)                                                                                                                            | `"ai-e2e-"` — prefix for all E2E temp dirs created via `createTempDir()`.                                                                                                                                                                                                                             |
| `FORKED_FROM_METADATA`                                                                                                                                  | Multi-line string containing the standard `forkedFrom` metadata block used by plugin/uninstall tests. Represents a skill forked from `web-framework-react`.                                                                                                                                           |
| `createTempDir()`                                                                                                                                       | Thin wrapper around `createTempDirBase(E2E_TEMP_PREFIX)` from unit test `test-fs-utils.ts`. Returns an absolute tmp-dir path.                                                                                                                                                                         |
| `cleanupTempDir(dir)`                                                                                                                                   | Re-exported from unit test `test-fs-utils.ts`. Recursive rm.                                                                                                                                                                                                                                          |
| `fileExists` / `directoryExists`                                                                                                                        | Re-exported from `test-fs-utils.ts`.                                                                                                                                                                                                                                                                  |
| `delay(ms)`                                                                                                                                             | Promise-based sleep. Shared by PTY-based tests and `BaseStep`.                                                                                                                                                                                                                                        |
| `stripAnsi(text)`                                                                                                                                       | Wraps Node's `stripVTControlCharacters`. Strips ANSI escape sequences from CLI output.                                                                                                                                                                                                                |
| `ensureBinaryExists()`                                                                                                                                  | Throws with a clear message if `BIN_RUN` does not exist. Call once at `beforeAll` in every E2E file (pattern enforced throughout the suite).                                                                                                                                                          |
| `runCLI(args, cwd, options?)`                                                                                                                           | The canonical non-interactive runner. Executes `node <BIN_RUN> <args>` via `execa` with `reject: false` and `HOME: cwd` by default (isolates from user's real global config). Returns `{ exitCode, stdout, stderr, combined }` with all fields pre-stripped of ANSI. Override HOME via `options.env`. |
| `listFiles(dir)`                                                                                                                                        | Best-effort `readdir`; returns `[]` on error.                                                                                                                                                                                                                                                         |
| `readTestFile(path)`                                                                                                                                    | `readFile(path, "utf-8")` passthrough.                                                                                                                                                                                                                                                                |
| `readMarketplaceJson(outputPath)`                                                                                                                       | Parse a generated `marketplace.json` into `Marketplace`. Used by `build marketplace` / `new marketplace` tests.                                                                                                                                                                                       |
| `writeProjectConfig(baseDir, cfg)`                                                                                                                      | Renders `config.ts` via `renderConfigTs()` and writes it under `<baseDir>/.claude-src/`. Seeds missing `skills: []` and `agents: []`.                                                                                                                                                                 |
| `createLocalSkill(dir, id, opts?)`                                                                                                                      | Creates `<dir>/.claude/skills/<id>/SKILL.md` via `renderSkillMd()`, plus optional `metadata.yaml`. Returns absolute skill dir.                                                                                                                                                                        |
| `createPermissionsFile(dir)`                                                                                                                            | Writes `<dir>/.claude/settings.json` with `{permissions:{allow:["Read(*)"]}}` to bypass the post-install permission prompt (otherwise PTY hangs — see FINDINGS.md, Finding 7).                                                                                                                        |
| `agentsPath(dir)` / `skillsPath(dir)`                                                                                                                   | `.claude/agents` and `.claude/skills` path builders.                                                                                                                                                                                                                                                  |
| `addForkedFromMetadata(dir)`                                                                                                                            | Writes `FORKED_FROM_METADATA` to the default `web-framework-react` skill's `metadata.yaml`. Marks it as CLI-managed so `uninstall` removes it (instead of skipping as user-created).                                                                                                                  |
| `injectMarketplaceIntoConfig(dir,name)`                                                                                                                 | Textually inserts `"marketplace": "<name>",` after `export default {` in an existing `config.ts`. Used by lifecycle tests switching local → plugin source.                                                                                                                                            |
| `getEjectedTemplatePath(dir)`                                                                                                                           | Returns `<dir>/.claude-src/agents/_templates/agent.liquid`.                                                                                                                                                                                                                                           |
| `renderAgentYaml` / `renderConfigTs` / `renderSkillMd`                                                                                                  | Re-exported from `src/cli/lib/__tests__/content-generators.ts`. **Always use these** instead of inlining fixtures (CLAUDE.md rule).                                                                                                                                                                   |
| `writeTestPackageJson`                                                                                                                                  | Re-exported from `src/cli/lib/__tests__/helpers/config-io.ts`. Writes a minimal `package.json` for TypeScript config loading.                                                                                                                                                                         |
| `createE2ESource`                                                                                                                                       | Re-exported from `./create-e2e-source.ts`. Builds a fake skills-marketplace source tree under a temp dir.                                                                                                                                                                                             |
| `isClaudeCLIAvailable` / `claudePluginMarketplaceAdd` / `claudePluginMarketplaceList` / `claudePluginInstall` / `claudePluginUninstall` / `execCommand` | Re-exported from `src/cli/utils/exec.ts`. Used by tests that exercise the real Claude plugin install flow — gated behind `describe.skipIf(!claudeAvailable)`.                                                                                                                                         |

**HOME isolation pattern:** `runCLI` sets `HOME: cwd` by default so the binary reads/writes global config under the temp project dir, not the user's real `~`. Tests that need dual-scope behavior explicitly override via `fixtures/dual-scope-helpers.ts` which orchestrates a separate `globalHome` temp dir.

## Test-Lifecycle Patterns

E2E files consistently follow this shape (see `plugin-install-failure-hard-error.e2e.test.ts`, `info-panel-scope-toggle-diff.e2e.test.ts` as representative examples):

```ts
beforeAll(async () => {
  await ensureBinaryExists();
  source = await createE2ESource(); // or createE2EPluginSource()
}, TIMEOUTS.SETUP);

afterAll(async () => {
  await cleanupTempDir(source.sourceDir);
});

afterEach(async () => {
  if (wizard) await wizard.dispose?.(); // close PTY, cleanup temp project
  wizard = undefined;
});
```

Key rules enforced across the suite:

- **`ensureBinaryExists()` in `beforeAll`** — every interactive/lifecycle/command file calls it once.
- **Source creation in `beforeAll`** — E2E sources are expensive; never re-create per-test.
- **Project dir creation per-test** — use `ProjectBuilder` (`fixtures/project-builder.ts`) in `beforeEach` / `it()` body so each scenario starts clean.
- **Cleanup in `afterEach`** — PTY sessions and per-test projects are disposed; source teardown lives in `afterAll`.
- **`describe.skipIf(!claudeAvailable)`** — tests that exercise the real `claude plugin install` pipeline (e.g. `plugin-install-failure-hard-error.e2e.test.ts`, `real-marketplace.e2e.test.ts`) are gated on `isClaudeCLIAvailable()`.

## Timeout Infrastructure

`TerminalSession` has a `defaultTimeout` readonly property (set from `TerminalSessionOptions.defaultTimeout` or CI-aware defaults: `TIMEOUTS.SESSION_DEFAULT` (10s) locally, `TIMEOUTS.SESSION_DEFAULT_CI` (20s) in CI). Methods `waitForText()` and `waitForExit()` use this as their fallback timeout.

`BaseStep` sets its own `defaultTimeout` to `TIMEOUTS.WIZARD_LOAD` (15s) -- intentionally different from the session default -- used by `waitForStep()` and `waitForStableRender()`.

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

| File                    | Exports                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli.ts`                | `CLI` class with `static run(args, project, options?)` for non-interactive commands                                                                                                                                                                                                                                                                                                                                            |
| `dual-scope-helpers.ts` | `DualScopeEnv` type, `createTestEnvironment()`, `initGlobal()`, `initProject()`, `setupDualScope()`, `initGlobalWithEject()`, `setupDualScopeWithEject()`, `createDualScopeEnv()`, `initProjectAllGlobal()`, `createGlobalOnlyEnv()`                                                                                                                                                                                           |
| `expected-values.ts`    | `E2E_SKILL_IDS` (9-entry tuple: `api-framework-hono`, `meta-methodology-research-methodology`, `meta-reviewing-cli-reviewing`, `meta-reviewing-reviewing`, `web-framework-react`, `web-framework-vue-composition-api`, `web-state-pinia`, `web-state-zustand`, `web-testing-vitest`), `E2E_AGENTS` (agent name constants with `WEB`, `API`, and computed `WEB_AND_API` getter) -- canonical expected values for E2E assertions |
| `interactive-prompt.ts` | `InteractivePrompt` class for PTY-based wizard tests                                                                                                                                                                                                                                                                                                                                                                           |
| `project-builder.ts`    | `ProjectBuilder` class with `minimal()`, `editable()`, plugin project factories                                                                                                                                                                                                                                                                                                                                                |

## BaseStep Primitives Contract

`BaseStep` (`e2e/pages/base-step.ts`) is the superclass for every wizard step page object. It provides raw PTY-input primitives, output-scraping accessors, and a small set of composition helpers. Subclasses (`BuildStep`, `DomainStep`, etc.) compose these into step-specific methods.

**Design intent:** primitives are intentionally "raw" — they write to the PTY and wait only for a minimal intra-keystroke debounce. They do NOT call `waitForStableRender`. The render-stability wait is the responsibility of each composed step method (see [Page-Object Keypress Rule](#page-object-keypress-rule-waitforstablerender)). This keeps primitive cost flat and lets callers batch operations without paying for a stability probe on every character.

### Key-Press Primitives (protected)

All key-press primitives share the same contract: write one PTY token, then `await delay(INTERNAL_DELAYS.KEYSTROKE)` (150ms) — except `pressEnter`, which uses `INTERNAL_DELAYS.STEP_TRANSITION` (500ms) because Enter typically advances wizard state.

| Primitive         | Writes to PTY          | Post-press delay                        | Pre-press `waitForStableRender`? |
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

**Invariants assumed:** caller has ensured the previous frame is stable and the relevant `useInput` handler is mounted. Violating this is the root cause of the `focusedSkillId` seeding race documented below.

### Wait Primitives (protected)

| Primitive                          | Delegates to                              | Guarantee                                                                                                           |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `waitForStep(text, t?)`            | `screen.waitForText`                      | Returns when `text` appears anywhere in full output within `t ?? TIMEOUTS.WIZARD_LOAD` (15s).                       |
| `waitForStepAfter(text, cur, t?)`  | `screen.waitForTextAfter`                 | Cursor-anchored variant. Returns when `text` appears AFTER raw-output offset `cur`. Use when scrollback may match.  |
| `waitForStableRender(t?)`          | `screen.waitForStableRender`              | Returns when footer sentinel `"select"` is visible. Observes PTY output, NOT React lifecycle (see scrollback note). |
| `waitForStableRenderAfter(cur,t?)` | `screen.waitForStableRenderAfter`         | Cursor-anchored stable-render. Required at step transitions where prior frames sit in scrollback.                   |
| `waitForItemVisible(label, n=30)`  | loop: `arrowDown` until `label` in output | Scrolls looking for `label`. Throws after `n` attempts. Does NOT confirm cursor is on the label.                    |
| `navigateCursorToItem(label, n)`   | loop: `arrowDown` until `❯` line matches  | Moves cursor until focused line (marked with `❯`) contains `label`. Throws after `n` attempts.                      |

**Distinction:** `waitForItemVisible` is a VISIBILITY check — it only guarantees the label is on screen somewhere. `navigateCursorToItem` is a CURSOR check — it guarantees the focused row contains the label. Choose the latter whenever the next action depends on cursor position.

### Cursor / Screen Queries (public / protected)

| Method                     | Access    | Returns                                                                                                                                                                              |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getOutput()`              | public    | Full PTY output including scrollback. For test assertions.                                                                                                                           |
| `getScreen()`              | public    | Visible viewport only. For test assertions that must ignore scrollback.                                                                                                              |
| `getRawCursor()`           | protected | Raw-output byte offset snapshot, for pairing with `*After` wait methods.                                                                                                             |
| `getSummaryDiffEntries(n)` | public    | Parses `SkillAgentSummary` panel; returns `{prefix, scope}[]` for the given display name. Internally calls `waitForStableRender` once before scraping — the only query that does so. |

### Composition Helpers (protected / public)

| Helper                               | Purpose                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressEnterAndWaitFor(nextStepText)` | Closed-loop retry: snapshot cursor, press Enter, poll for `nextStepText` after cursor within `INTERNAL_RETRIES.INTERVAL_MS`, re-press up to `INTERNAL_RETRIES.MAX_ATTEMPTS` (5) times. Mirrors `DashboardSession.selectEdit`. |
| `abort()`                            | Public passthrough to `pressCtrlC`. No pre-wait.                                                                                                                                                                              |
| `navigateDown/Up/Right()`            | Public passthroughs to `pressArrow*`. No pre-wait.                                                                                                                                                                            |

**`pressEnterAndWaitFor` invariant:** the sentinel text MUST be unique to the next step's first frame — text appearing in the current footer (e.g. `"select"`) returns instantly on the Enter's own repaint and defeats the closed-loop retry.

### Design Question: Primitive-Level Wait vs. Method-Level Wait

The iter-9 audit found 32 sibling-step methods and 5 `BaseStep` composition helpers that press keys without a pre-press `waitForStableRender`. Two structural options:

**Option A — internalize the wait in primitives.** Move `await this.waitForStableRender()` into every `press*` primitive. Pros: structurally enforced, impossible to forget, deletes ~32 caller lines. Cons: every primitive pays the stability probe cost (worst case one `TerminalScreen.waitForStableRender` poll interval per keystroke); breaks the "primitives are cheap" design; over-serializes tests that legitimately batch keystrokes (e.g. `search-modal.type` typing a query char-by-char).

**Option B — keep primitives raw, enforce at method level.** Require every composed method to call `waitForStableRender` before any primitive use. Pros: primitives stay fast, batched typing remains one wait; callers can use `waitForStableRenderAfter(cursor)` or custom waits where footer-sentinel is wrong. Cons: structurally unenforced (the 32 audit gaps prove this); every new step method is a potential regression.

**Option C (hybrid) — keep primitives raw, but add a wait-first composition helper.** Introduce `pressAfterStable(primitiveFn)` that calls `waitForStableRender` then invokes the primitive. Refactor compliant methods through it. Pros: opt-in, cheap primitives preserved, single audit point. Cons: two ways to press a key; linting would need a custom rule.

**Cost estimate for Option A (back-of-envelope):**

- `TerminalScreen.waitForStableRender` polls full output for `"select"` on an interval. A compliant session where the footer is already present returns on the first poll (~0ms observation, ~20-50ms scheduling). A session mid-transition waits one full poll cycle (~100ms typical).
- Current suite has ~65 E2E files × ~5-10 keypresses per test × ~100ms worst-case = ~30-60s total added under contention. Under no contention: negligible (first-poll hits).
- `search-modal.type` is the outlier: typing "cli" is 3 `pressKey` calls → 3 extra stability probes on text that is intentionally mid-change. Would need an exemption.

**Recommendation (doc-only observation):** Option C. It localizes the wait decision, keeps the 150ms keystroke-batching property for multi-char input, and makes the audit a one-file grep (`pressAfterStable` call sites). Decision deferred — this section documents the trade-off only.

### Primitives That Already Wait

Only one: `getSummaryDiffEntries` calls `waitForStableRender` before scraping. All other `get*` methods read without waiting. All `press*`, `navigate*`, `waitForItemVisible`, `navigateCursorToItem`, `abort`, and `pressEnterAndWaitFor` do NOT wait before pressing.

## Page-Object Keypress Rule (waitForStableRender)

### Invariant

Every page-object method that sends a key press (keystroke, Space, Enter, Escape, arrow, Tab, literal char, `session.*`) MUST `await this.waitForStableRender()` **before** the press. Post-press waits do not substitute. This applies to every method on every step, not just the first interaction after a step transition.

### Why (focusedSkillId Seeding Race)

- The `s` handler in `wizard.tsx` HOTKEY_SCOPE reads `store.focusedSkillId`. `CategoryGrid` seeds that id in a **post-mount `useEffect`** — it is `null` until the effect flushes.
- Under parallel-suite contention, a PTY write can land between React commit and `useEffect` flush. The keystroke reaches the new frame, but the `useInput` handler hasn't registered yet, so the press silently no-ops.
- In isolation the race is invisible (slack in the event loop). Under load it surfaces as flake on whichever scenario loses the race first — see `lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts`.

### How `waitForStableRender` Works

Defined on `BaseStep` (`e2e/pages/base-step.ts`), delegates to `TerminalScreen.waitForStableRender` (`e2e/pages/terminal-screen.ts`), which polls for the footer sentinel `"select"` in full output until `TIMEOUTS.WIZARD_LOAD` (15s).

| Observes                                        | Does NOT observe                                             |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Footer "select" text in PTY scrollback          | React `useEffect` having flushed                             |
| Frame layout having painted                     | `useInput` handler being registered on new frame             |
| Wizard has reached a renderable, laid-out state | Store fields seeded by post-mount effects (`focusedSkillId`) |

**Scrollback hazard:** The footer "select" is emitted by every wizard step. On step transitions where previous frames sit in scrollback, `waitForStableRender` can return instantly on stale residue — use `waitForStableRenderAfter(cursor)` (cursor-anchored, footer match post-cursor).

### When It's Insufficient — The `FOCUS_EFFECT_FLUSH_MS` Escape Hatch

`BuildStep.toggleScopeOnFocusedSkill` adds `await this.delay(FOCUS_EFFECT_FLUSH_MS)` (500ms) **after** `waitForStableRender` and **before** pressing `s`. The comment documents this as a workaround, not the fix:

> TODO: Fix A — seed `focusedSkillId` synchronously in `hydrateWizardStore` so this delay becomes unnecessary.

Use this escape hatch only when a keypress depends on store state seeded by a post-mount effect that `waitForStableRender` cannot observe. Prefer fixing the seeding layer over widening the delay.

### Better Primitives (Open Question)

`waitForStableRender` observes terminal output, not React lifecycle. Alternatives that would strictly bound the race:

- **ANSI focus-indicator parse** — detect that CategoryGrid emitted the focused skill's inverted-style marker before keypress. Tighter than footer match but requires per-screen parsing logic.
- **Store snapshot probe** — expose a debug hook that prints `focusedSkillId` to stderr, poll until non-null. Requires product-code instrumentation.
- **Fix A (canonical)** — seed `focusedSkillId` synchronously in `hydrateWizardStore`. Eliminates the race entirely; makes `FOCUS_EFFECT_FLUSH_MS` dead code.

Until Fix A lands, `waitForStableRender` + documented escape hatch is the pragmatic primitive.

### Scope: Where the Rule Applies

- **All step page objects** (`e2e/pages/steps/*.ts`, `e2e/pages/dashboard-session.ts`) — every public method that presses a key.
- **`BaseStep` helpers** (`e2e/pages/base-step.ts`) — the `pressEnter` / `pressSpace` / `pressKey` / `pressEscape` / `pressArrowX` / `pressCtrlC` primitives do NOT wait internally. Callers (subclass methods) are responsible.
- **Higher-level `BaseStep` methods** (`waitForItemVisible`, `navigateCursorToItem`, `navigate*`, `abort`, `pressEnterAndWaitFor`) — these send keystrokes; they currently do NOT call `waitForStableRender` and are coverage gaps (see below).
- **All interactions, not just keypress:** The rule applies to any `session.*` write — character input (`search-modal.type`), navigation, modifier keys, Ctrl+C. The race is between PTY write and React commit+effect, independent of the key's semantic.
- **Not applicable:** `render`-inspection methods (`getOutput`, `getScreen`, `getScopeBadgesForSkill`, `findSkillGridPosition`, `getSummaryDiffEntries`) — these only read output.

### Coverage Audit (2026-04-21, re-validated iter 35)

After iter 8/9 fixes, `BuildStep` is fully compliant. Sibling step files still lack the wait on many keypress methods:

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
| `sources-step.ts` | `toggleFocusedSource`       | Space                              | NO                                         |
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

**Compliant (for reference):** `build-step.ts` (all 16 public methods), `agents-step.ts::acceptDefaults`, `agents-step.ts::toggleAgent` (only after navigate), `agents-step.ts::toggleScopeOnFocusedAgent`, `confirm-step.ts::confirm`, `confirm-step.ts::confirmExpectingExit`, `sources-step.ts::acceptDefaults` (via `waitForReady`), `stack-step.ts::waitForReady`.

### Findings

- [`2026-04-21-e2e-build-step-keypress-missing-stable-render.md`](../../agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md) — original 7 `build-step.ts` fixes and proposed standard tightening.
