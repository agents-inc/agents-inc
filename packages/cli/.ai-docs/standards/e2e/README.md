---
last_validated: 2026-07-30
---

# E2E Testing Standards

Standards and conventions for the E2E test suite. These docs govern how tests are written, structured, and maintained. For API details, read the source files directly.

**Audience:** Developers and AI agents writing or modifying E2E tests.

---

## Architecture

The framework uses a 5-layer Page Object Model adapted for terminal-based CLI testing. Each layer has a single responsibility and a strict boundary: a layer may only call the layer directly below it.

```
+-------------------------------------------------------------------+
|  TEST LAYER                                                        |
|  e2e/{commands,interactive,lifecycle,integration,smoke}/*.test.ts  |
|  Uses: wizards, CLI.run, matchers. Never touches Session.          |
+-------------------------------------------------------------------+
                              |
+-------------------------------------------------------------------+
|  WIZARD LAYER                                                      |
|  e2e/pages/wizards/{init-wizard,edit-wizard}.ts                    |
|  Spawns session, returns first step. Composite flows.              |
+-------------------------------------------------------------------+
                              |
+-------------------------------------------------------------------+
|  STEP LAYER                                                        |
|  e2e/pages/steps/{stack,domain,build,sources,agents,confirm}.ts    |
|  e2e/pages/steps/search-modal.ts                                   |
|  Methods model user intent, return next-step objects.              |
+-------------------------------------------------------------------+
                              |
+-------------------------------------------------------------------+
|  SCREEN LAYER                                                      |
|  e2e/pages/terminal-screen.ts                                      |
|  Auto-retrying text matchers, stable render detection.             |
+-------------------------------------------------------------------+
                              |
+-------------------------------------------------------------------+
|  SESSION LAYER (framework-internal)                                |
|  e2e/helpers/terminal-session.ts                                   |
|  Raw PTY (node-pty + @xterm/headless). Never used in tests.       |
+-------------------------------------------------------------------+
```

**Horizontal layers** support all vertical layers:

| Layer      | Files                                                                                                                                                                  | Purpose                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Matchers   | `e2e/matchers/project-matchers.ts`, `agent-matchers.ts`, `setup.ts`                                                                                                    | Custom Vitest matchers for file-based assertions                                                          |
| Assertions | `e2e/assertions/{phase,scope,uninstall,config}-assertions.ts`, `four-surfaces.ts`                                                                                      | Composite assertion helpers (plain functions, NOT called via `expect()`)                                  |
| Fixtures   | `e2e/fixtures/project-builder.ts`, `cli.ts`, `dual-scope-helpers.ts`, `interactive-prompt.ts`, `expected-values.ts`, `plugin-install-state.ts`, `seed-config-store.ts` | Project creation, CLI execution, scope helpers, canonical expected values, the seed config store stand-in |
| Constants  | `e2e/pages/constants.ts`                                                                                                                                               | All UI text, paths, timeouts, exit codes                                                                  |

---

## Directory Structure

```
e2e/
  commands/           # Non-interactive command tests (CLI.run)
  interactive/        # Wizard and interactive component tests
  lifecycle/          # Multi-phase flows: init -> edit -> compile -> uninstall
  integration/        # Cross-command pipelines
  smoke/              # Third-party binary probes, framework validation
  handrun-journeys.ts     # The hand-run (step 4 of the change workflow) — NOT a gate, no script runs it in CI
  handrun-driver.ts       # Transcript printing only: section / note / verdict / attempt
  handrun-surfaces.ts     # The hand-run's presentation of assertions/four-surfaces.ts
  helpers/
    test-utils.ts         # runCLI, createTempDir, path helpers, re-exports
    handrun.gen.mjs       # The esbuild bundle scripts/handrun.mjs emits. Gitignored, and ignored by
                          # eslint (globalIgnores "e2e/helpers/*.gen.mjs") and prettier. It must live
                          # HERE — CLI_ROOT derives from import.meta.url, and a bundle written
                          # elsewhere silently points the spawned binary at the wrong tree
    terminal-session.ts   # PTY wrapper (framework-internal, never imported by tests)
    create-e2e-source.ts  # 10-skill E2E source factory
    node-pty.d.ts         # Type reference for node-pty
    create-e2e-plugin-source.ts # Plugin source factory (builds plugins + marketplace.json)
    tarball-source-server.ts # Serves a source dir as an HTTP tarball under a test-controlled ETag
    type-check-probe.ts   # tsc probe: asserts a generated config-types.ts alias still REJECTS bad values
  fixtures/
    project-builder.ts    # Project directory factories (ProjectBuilder)
    cli.ts                # Non-interactive CLI runner (CLI.run)
    dual-scope-helpers.ts # Multi-phase dual-scope lifecycle helpers
    interactive-prompt.ts # Non-wizard interactive prompt page object
    expected-values.ts    # E2E_SKILL_IDS, E2E_SKILL, E2E_AGENT, E2E_AGENTS, E2E_AGENT_DISPLAY
    plugin-install-state.ts # Reproduces a completed plugin install WITHOUT the Claude CLI
    seed-config-store.ts  # Loopback HTTP stand-in for the config store, plus the four --from/--ui/share runners
  pages/
    constants.ts          # DIRS, FILES, STEP_TEXT, TIMEOUTS, EXIT_CODES, SOURCE_PATHS, TERMINAL_SIZE, INTERNAL_DELAYS, INTERNAL_RETRIES
    base-step.ts          # Abstract base for all step page objects
    retry-enter.ts        # retryEnterUntil(): closed-loop Enter retry shared by BaseStep + DashboardSession
    terminal-screen.ts    # Screen abstraction over TerminalSession
    wizard-result.ts      # WizardResult + ProjectHandle types
    dashboard-session.ts  # Dashboard mode page object
    wizards/
      init-wizard.ts      # InitWizard entry point
      edit-wizard.ts      # EditWizard entry point
      global-home.ts      # allocateProjectGlobalHome(): fresh-or-reused global HOME for launchInProject
    steps/
      stack-step.ts       # Stack selection step
      domain-step.ts      # Domain selection step
      build-step.ts       # Skill selection / build step
      sources-step.ts     # Source configuration step
      agents-step.ts      # Agent selection step
      confirm-step.ts     # Confirm and install step
      search-modal.ts     # Search overlay (opened from build step)
  assertions/
    phase-assertions.ts     # expectPhaseSuccess, expectFullInstallation
    scope-assertions.ts     # expectDualScopeInstallation
    uninstall-assertions.ts # expectCleanUninstall
    config-assertions.ts    # expectNoDuplicates, normalizeConfigPreservingOrder
    four-surfaces.ts        # inspectFourSurfaces (reports) / expectFourSurfaces (throws)
  matchers/
    project-matchers.ts   # Custom Vitest matcher implementations
    agent-matchers.ts     # toHaveAgentFrontmatter, toHaveAgentDynamicSkills
    setup.ts              # Matcher registration + type augmentation
    project-matchers.e2e.test.ts # the matchers' own spec — runs in the E2E suite, on real project trees
```

---

## Test Categories

| Category    | Directory      | Tool                        | Description                                                                                                                                                                                                          |
| ----------- | -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command     | `commands/`    | `CLI.run()`                 | Non-interactive commands: flags, output, exit codes, file side effects. One `describe` per command; split into files when a command has 15+ tests.                                                                   |
| Interactive | `interactive/` | `InitWizard` / `EditWizard` | Wizard flows: navigation, step transitions, completion. Split by concern: `init-wizard-stack`, `edit-wizard-local`.                                                                                                  |
| Lifecycle   | `lifecycle/`   | Both                        | Multi-phase: init, edit, compile, uninstall across shared project state. Single `it()` block per lifecycle.                                                                                                          |
| Integration | `integration/` | `CLI.run()`                 | Cross-command pipelines (e.g., eject then compile)                                                                                                                                                                   |
| Smoke       | `smoke/`       | Various                     | Third-party probes (Claude CLI). May import `exec.ts` functions (`execCommand`, `claudePluginInstall`, etc.) because they test the Claude CLI binary directly, not our CLI. Use `describe.skipIf(!claudeAvailable)`. |

---

## File Naming

- Test files: `{feature}.e2e.test.ts`
- Smoke tests: `{feature}.smoke.test.ts`
- Split at 300 LOC or when a file covers 2+ unrelated concerns
- Use descriptive names: `edit-wizard-plugin-migration.e2e.test.ts`, not `edit-2.e2e.test.ts`
- No task IDs (`D-NNN`) in `describe()` / `it()` names, assertion messages (2nd arg to `expect`), or inline test-body comments. File-level JSDoc at the top of the file is the only permitted location. Test names describe BEHAVIOR ("renders spurious minus on G→P toggle"), not tickets — names rot, and IDs look authoritative but become meaningless once the task is closed.

---

## Vitest Configuration

**File:** `e2e/vitest.config.ts`

| Setting       | Value                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool`        | `"forks"`                                 | Process isolation between test files                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxWorkers`  | `Math.min(16, os.availableParallelism())` | Capped at BOTH ends. PTY-driven wizard tests are load-sensitive: at one worker per core (21+ on dev machines) dropped keystrokes and slow installs produce flake that never reproduces solo — and a flat `16` on a four-core CI runner puts four PTY workers on every core, the same contention inverted.                                                                                                              |
| `testTimeout` | `30_000`                                  | Default per-test timeout                                                                                                                                                                                                                                                                                                                                                                                               |
| `hookTimeout` | `60_000`                                  | Default for beforeAll/afterAll                                                                                                                                                                                                                                                                                                                                                                                         |
| `retry`       | `1`                                       | One automatic retry. It bounds a genuine failure's cost at 2x rather than 3x, and a retry that fires shows up in vitest's flaky report instead of passing silently. **Do not raise it to hide a failure.**                                                                                                                                                                                                             |
| `projects`    | `e2e` and `smoke`                         | Two named projects over one tree, split by FILENAME rather than by directory: `e2e` includes `e2e/**/*.e2e.test.ts`, `smoke` includes `e2e/**/*.smoke.test.ts`. Every other setting in this table is shared via `extends: true`. Each project needs its own script (`test:e2e`, `test:smoke`) — a project nothing selects by name never runs; `src/cli/lib/__tests__/spec-gates.test.ts` is what enforces the pairing. |
| `globalSetup` | `./e2e/global-setup.ts`                   | Pre-suite setup                                                                                                                                                                                                                                                                                                                                                                                                        |

Long tests override per-test: `it("...", { timeout: TIMEOUTS.LIFECYCLE }, async () => {})`.

---

## Constants Quick-Reference

All constants live in `e2e/pages/constants.ts`. Tests import from here, never from `src/cli/`.

**Directories (`DIRS`):** `CLAUDE`, `CLAUDE_SRC`, `SKILLS`, `AGENTS`, `PLUGINS`, `PLUGIN_MANIFEST`

**Files (`FILES`)** — all 12: `CONFIG_TS`, `CONFIG_TYPES_TS`, `SKILL_MD`, `METADATA_YAML`, `SETTINGS_JSON`, `INSTALLED_PLUGINS_JSON`, `IDENTITY_MD`, `PLAYBOOK_MD`, `PLUGIN_JSON`, `MARKETPLACE_JSON`, `CATALOG_JSON`, `PACKAGE_JSON`

**Step text (`STEP_TEXT`)** — **172 members**, and the groups below partition all 172 exactly (no member appears twice). An exhaustive list that is short is worse than a glob, because it reads as authoritative — re-derive both the count **and the membership** from `e2e/pages/constants.ts` rather than carrying either forward, and grep [reference/testing/e2e-infrastructure.md](../../reference/testing/e2e-infrastructure.md) for the old value in the same session, since it is the only other place the number is written:

| Group                    | Members                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step identification      | `STACK`, `DOMAINS`, `DOMAIN_WEB`, `DOMAIN_API`, `DOMAIN_META`, `DOMAIN_MOBILE`, `BUILD`, `BUILD_FOOTER`, `SCOPE`, `CATEGORY_FRAMEWORK`, `SOURCES`, `AGENTS`, `CONFIRM`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Completion               | `INIT_SUCCESS`, `EDIT_SUCCESS`, `EDIT_UNCHANGED`, `COMPILE_SUCCESS`, `COMPILE_COMPLETE`, `CONFIG_LOAD_FAILED`, `CONFIG_UNREADABLE_RECREATE`, `EDITOR_URL`, `CONFIG_UNREADABLE_DOCTOR`, `EJECT_SUCCESS`, `IMPORT_SUCCESS`, `UNINSTALL_SUCCESS`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Status / progress        | `LOADING_SKILLS`, `RECOMPILING`, `NO_AGENTS_TO_RECOMPILE`, `AGENTS_REWRITTEN`, `UNCHANGED`, `COMPILE_GLOBAL_SCOPE_HINT`, `CONFIG_TYPES_REFRESHED`, `SKILL_NOT_FOUND_WARNING`, `STACK_SKILL_ABSENT_FROM_MATRIX`, `COMPILE_PASS_NO_SKILLS`, `SOURCE_HAS_NEWER_CONTENT`, `SOURCE_UNREACHABLE_CACHED`, `UNRESOLVED_SLUG`, `COMPILE_NO_SKILLS_ERROR`, `COMPILE_METADATA_UNUSABLE`, `COMPILE_METADATA_MISSING_FIELD`, `METADATA_UNUSABLE_WAY_OUT`, `REMOVED_REASON_NOT_IN_SOURCE`, `REMOVED_REASON_FILES_GONE`, `PROPAGATED_RECOMPILE_ONE`, `PROPAGATED_RECOMPILE`, `LOADED`, `LOADED_SKILL`, `COMPILED_LIST`                                                                                                                                                                                  |
| `update`                 | `UPDATE_HELP_SUMMARY`, `UPDATE_EJECTED_OWNED`, `UPDATE_NO_MARKETPLACES`, `UPDATE_MARKETPLACE_REFRESHED`, `UPDATE_COMPLETE`, `UPDATE_NO_CLAUDE_CLI`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Prompts / uninstall plan | `CONFIRM_UNINSTALL`, `SEARCH`, `UNINSTALL_PREVIEW`, `UNINSTALL_PREVIEW_HEADING`, `UNINSTALL_CONFIG_SECTION`, `UNINSTALL_PROJECTS_UPDATED_ONE`, `UNINSTALL_PROJECT_SKIPPED`, `UNINSTALL_CONFIG_UNREADABLE`, `UNINSTALL_NOTHING_TO_UNINSTALL`, `UNINSTALL_NOT_INSTALLED`, `UNINSTALL_NO_CHANGES_MADE`, `UNINSTALL_CLI_COMPILED`, `UNINSTALL_CLI_MANAGED_SECTION`, `UNINSTALL_AGENTS_KEPT_ONE`, `UNINSTALL_AGENTS_KEPT_TWO`, `UNINSTALL_AGENTS_KEPT_REASON`                                                                                                                                                                                                                                                                                                                                 |
| Install-mode captions    | `INSTALL_MODE_LOCAL`, `INSTALL_MODE_PLUGIN`, `FOOTER_SET_ALL_LOCAL`, `FOOTER_SET_ALL_PLUGIN`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Scope group labels       | `SCOPE_GLOBAL`, `SCOPE_PROJECT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Dashboard                | `DASHBOARD`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `doctor` layered output  | `DOCTOR_CONTENT_SECTION`, `DOCTOR_OPERATIONAL_SECTION`, `DOCTOR_SKIP_AFTER_CONTENT_ERRORS`, `DOCTOR_SKIP_NO_INSTALLATION`, `DOCTOR_CONFIG_CHECK`, `DOCTOR_ROW_SKILLS_RESOLVED`, `DOCTOR_ROW_AGENTS_COMPILED`, `DOCTOR_ROW_NO_ORPHANS`, `DOCTOR_ROW_SKILLS_INSTALLED`, `DOCTOR_ROW_PLUGINS_INSTALLED`, `DOCTOR_ROW_SOURCE_REACHABLE`, `DOCTOR_ROW_MARKETPLACES`, `DOCTOR_CONFIG_IS_VALID`, `DOCTOR_SOURCE_LOCAL`, `DOCTOR_SKILLS_AVAILABLE`, `DOCTOR_AGENTS_NEED_RECOMPILATION`, `DOCTOR_TIP_COMPILE_AGENTS`, `DOCTOR_TIP_CHECK_SKILL_IDS`, `DOCTOR_TIP_RE_EJECT`, `DOCTOR_SUMMARY`, `DOCTOR_SKILLS_VALIDATED`, `DOCTOR_AGENTS_VALIDATED`, `DOCTOR_ONE_MARKETPLACE_VALIDATED`, `DOCTOR_MARKETPLACE_LOAD_FAILED`, `DOCTOR_SKILLS_SKIPPED_UNREACHABLE`, `DOCTOR_FOREIGN_MARKETPLACE_DEFECT` |
| `doctor` config verdicts | `DOCTOR_CONFIG_UNREADABLE`, `DOCTOR_CONFIG_NOT_FOUND`, `DOCTOR_CONFIG_DECLARES_NOTHING`, `DOCTOR_ONE_CONFIG_VALIDATED`, `DOCTOR_TIP_CREATE_CONFIG`, `DOCTOR_TIP_RECREATE_CONFIG`, `DOCTOR_TIP_NOTHING_CONFIGURED`, `DOCTOR_FOREIGN_SKILL_DIR`, `DOCTOR_UNOWNED_INSTALL`, `DOCTOR_TIP_UNOWNED_INSTALL`, `DOCTOR_SKIPPED_CONFIG_INVALID`, `DOCTOR_NO_SKILLS_CONFIGURED`, `DOCTOR_NO_AGENTS_CONFIGURED`, `CONFIG_SOURCE_LOAD_NOISE`                                                                                                                                                                                                                                                                                                                                                         |
| UI elements              | `FOOTER_SELECT`, `FOOTER_HOTKEY_ROW`, `START_FROM_SCRATCH`, `TOGGLE_SELECTION`, `NO_INSTALLATION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Installation output      | `INSTALLING_PLUGINS`, `INSTALLING_PLUGINS_ELLIPSIS`, `PLUGIN_NATIVE`, `EJECT_LOCAL_COPY`, `SWITCHING_SKILLS_PREFIX`, `SWITCHING_SKILLS_SUFFIX`, `COPIED_LOCAL_SKILLS_PREFIX`, `COPIED_LOCAL_SKILLS_SUFFIX`, `SKILLS_COPIED_TO`, `AGENTS_COMPILED_TO`, `CONFIGURATION_LABEL`, `READY_TO_INSTALL`, `NO_SKILLS_FOUND`, `UNINSTALL_CANCELLED`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `init --from` refusals   | `SHARED_CONFIG_EXISTING_INSTALL`, `SHARED_CONFIG_GLOBAL_INSTALL`, `SHARED_CONFIG_UNINSTALL_HINT`, `SHARED_CONFIG_UNWRITABLE_PAIR`, `SHARED_CONFIG_PROJECT_SCOPE_AT_HOME`, `SHARED_CONFIG_PROJECT_SCOPE_HINT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `edit --from` apply      | `SHARED_CONFIG_APPLY_PREVIEW`, `SHARED_CONFIG_APPLY_CONFIRM`, `SHARED_CONFIG_APPLY_NOTHING_REMOVED`, `SHARED_CONFIG_NEEDS_TERMINAL`, `SHARED_CONFIG_ONE_DIRECTION`, `SHARED_CONFIG_KEPT_AUTHORED`, `SHARED_CONFIG_KEPT_UNPLACEABLE`, `SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY`, `SHARED_CONFIG_GLOBAL_SKILLS_HEADING`, `SHARED_CONFIG_GLOBAL_AGENTS_HEADING`, `SHARED_CONFIG_GLOBAL_REACH`, `SHARED_CONFIG_GLOBAL_REACH_PROJECTS`, `SHARED_CONFIG_GLOBAL_REACH_ALONE`                                                                                                                                                                                                                                                                                                                      |
| Selection validation     | `VALIDATION_REQUIRES`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Scope warnings           | `GLOBAL_SKILLS_BLOCKED`, `GLOBAL_AGENTS_BLOCKED`, `SKILL_ASSIGNED_TO_NO_AGENT`, `STACK_PAIR_DROPPED_BY_SCOPE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Terminal-size warning    | `TOO_NARROW`, `TOO_SHORT`, `RESIZE_PROMPT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Stack-step banner        | `LOGO_BANNER`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Scroll affordance        | `SCROLL_MORE_BELOW`, `SCROLL_MORE_ABOVE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Summary-panel header     | `PANEL_MARKETPLACE`, `PANEL_STACK`, `PANEL_STACK_NONE`, `SOURCE_DISPLAY_DEFAULT`, `SOURCE_DISPLAY_EJECT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Diff markers (`ADDED_MARKER` `+`, `REMOVED_MARKER` `-`, `UNCHANGED_MARKER` `•`)** are separate exports from the same file, not `STEP_TEXT` members. They mirror the glyphs the info panel, the confirm step and the Sources grid paint in front of a row. They are duplicated here rather than imported from `src/cli/consts.ts` on purpose: an assertion importing the very symbol the product rendered with cannot fail when that symbol changes, because both sides move together.

**The remaining loose exports of `constants.ts`, exhaustive** — nothing else is exported from that file beyond the nine objects above and the three markers:

| Export                            | What it is                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_INVOKE_COMMAND`              | `"npx agents-inc"` — the invocation prefix the CLI prints in its guidance. Mirrored for the same reason as the glyphs.                                                                   |
| `WIZARD_TAB_STACK`                | `"Stack"`, named on its own because it is the one tab a flow can lack: a source shipping no stacks gives the wizard no stack step.                                                       |
| `WIZARD_TAB_LABELS`               | The step tabs in the order `WizardTabs` paints them. Kept as the WHOLE set — a spec naming two of six cannot tell a complete tab bar from one that dropped the steps it did not mention. |
| `WIZARD_TAB_LABELS_WITHOUT_STACK` | `WIZARD_TAB_LABELS` minus the Stack tab — the whole bar a stackless flow paints.                                                                                                         |
| `E2E_MARKETPLACE_NAME`            | `"e2e-test-fixture"` — the fixture marketplace's name, deliberately stable rather than timestamped, because a marketplace's name is the namespace its skill ids are written in.          |
| `E2E_MARKETPLACE_PREFIX`          | `"e2e-test-"`. `e2e/global-setup.ts` sweeps stale Claude marketplace registrations with a `startsWith` on it, so it lives beside the names being swept rather than in that file.         |
| `e2eSkillId(bare)`                | Composes a fixture skill id inside that namespace. Its results are typed `string`, never `SkillId` — the generated union is the PUBLIC catalogue's.                                      |
| type `WizardType`                 | `"init" \| "edit"` (see below).                                                                                                                                                          |

**Choosing a member's wording is the whole of what the specs using it can hold the CLI to.** Where the message makes a claim, the sentinel goes in the clause a reader would dispute, never in the lead-in that introduces it — a preamble is true whatever follows, so a sentinel matching one cannot fail. Row labels and step headings are exempt: they identify a screen rather than assert anything. Rule, worked example and the measurement showing it is not mechanically checkable: [assertions.md § A Sentinel Must Name the Substantive Claim](./assertions.md).

`SCOPE` ("Scope") is painted only for genuine project-scope edits — the footer hides it when `isEditingFromGlobalScope` is true — so it is the sentinel for asserting which scope a session actually runs at. `DOCTOR_CONFIG_CHECK` ("Config Valid") is a row only `doctor`'s operational layer emits, so its absence proves that layer was skipped rather than merely quiet.

**Timeouts (`TIMEOUTS`):** `WIZARD_LOAD` (45s), `WIZARD_TRANSITION` (45s), `INSTALL` (30s), `PLUGIN_INSTALL` (60s), `PLUGIN_TEST` (90s = PLUGIN_INSTALL + EXIT_WAIT), `EXIT` (10s), `SESSION_DEFAULT` (10s), `SESSION_DEFAULT_CI` (20s), `EXIT_WAIT` (30s), `SETUP` (60s), `SETUP_DUAL` (120s = SETUP × 2, for `beforeAll` hooks that build two sources), `LIFECYCLE` (180s), `EXTENDED_LIFECYCLE` (300s), `INTERACTIVE` (120s)

`WIZARD_LOAD` was raised 15s → 45s: `init` against the real marketplace under full-suite parallelism can sit at "Loading skills..." well past 15s. `BaseStep.defaultTimeout` derives from it, so every unqualified step wait is now a 45s upper bound — including the one that burns when `waitForWizardFooter` is used on a footer-less screen.

**Exit codes (`EXIT_CODES`):** `SUCCESS` (0), `ERROR` (1), `INVALID_ARGS` (2), `NETWORK_ERROR` (3), `CANCELLED` (4), `UNKNOWN_COMMAND` (127)

**Terminal geometry (`TERMINAL_SIZE`):** `TALL` = `{ rows: 60, cols: 120 }` (full build grid visible); `SHORT` = `{ rows: 20, cols: 100 }` (smallest viewport that still clears the wizard's own 80×20 minimum-size gate — wide enough to render normally, short enough that an overflowing step must clip and paint a `SCROLL_MORE_*` affordance); `BELOW_MINIMUM` = `{ rows: 16, cols: 100 }` (**below** the gate — reachable only by RESIZING a session that started larger; launching here hangs on the resize prompt). Unset session defaults live in `helpers/terminal-session.ts` and are deliberately not mirrored here.

`SHORT.rows` must equal `MIN_TERMINAL_SIZE.ROWS` in `src/cli/consts.ts`, the single live size gate. Set it lower and every spec using `SHORT` hangs on `Terminal too short. Please resize.` until its timeout instead of failing; set it higher and those specs stop exercising the tightest geometry the wizard claims to support. The value is duplicated rather than imported because `e2e/pages/constants.ts` is deliberately free of `src/cli` imports.

**Resizing mid-session.** The same gate is enforced a second time by `WizardLayout`, which replaces the wizard tree when the terminal shrinks under a running session. `BaseStep.resizeBelowMinimum(cols, rows)` and `resizeAboveMinimum(cols, rows)` drive that: each resizes the PTY **and** the xterm emulator (both, or the buffer desynchronises from the process) and then closed-loops on a cursor-anchored raw wait — the resize prompt one way, the wizard footer the other. Do not assert the wizard's ABSENCE after a shrink: the emulator keeps everything the session ever drew, so any wizard string is still matchable from scrollback. Assert that the prompt is the CURRENT frame instead.

**`INTERNAL_DELAYS`** contains `STEP_TRANSITION` (500ms) and `KEYSTROKE` (150ms). **`INTERNAL_RETRIES`** contains `MAX_ATTEMPTS` (5) and `INTERVAL_MS` (3000), the budget for the closed-loop `retryEnterUntil()` helper. Both are framework-internal and must never appear in test files.

**`WizardType`** is an exported type (`"init" | "edit"`) — which wizard a shared step page object is driving. `AgentsStep.acceptDefaults` / `advance` and `BuildStep.saveFromBuild` take it.

**Source paths (`SOURCE_PATHS`):** `SKILLS_DIR` (`src/skills`), `SKILL_CATEGORIES` (`config/skill-categories.ts`), `SKILL_RULES` (`config/skill-rules.ts`), `STACKS_FILE` (`config/stacks.ts`), `PLUGIN_MANIFEST_DIR` (`.claude-plugin`), `PLUGINS_DIST` (`dist/plugins`)

These are paths within a skills source directory (not a project directory). Use for tests that assert on source structure.

---

## Critical Rules

**Rebuild before running E2E tests.** E2E tests execute the compiled binary at `dist/` via `bin/run.js` — source edits in `src/` are invisible until `npm run build` runs. `ensureBinaryExists()` only checks that the binary exists; it does NOT stamp-check that it was built after the latest source edit. After any `src/` change, run `npm run build` before running E2E tests. If E2Es fail with pre-fix symptoms despite source edits, rebuild first. Unit tests cover the same source directly and will pass against stale `dist/` — disagreement between unit-test green and E2E red with identical failure signature is the canonical stale-build signal.

**State-change verification.** Any test that completes a wizard flow or runs a command that creates, modifies, or removes files or config entries MUST assert the resulting state of both config AND filesystem. If the operation should NOT change something, snapshot before and assert identical after. Never check only one side. This is the file-and-config half of a wider demand — a spec that drives a transition owes an assertion on what the OLD state left behind, on every surface that holds one: [assertions.md § Assert the Departure, Not Only the Arrival](./assertions.md).

**Page object key-press rule.** Every step page-object method that sends a key press MUST call `await this.waitForWizardFooter()` _before_ the press. No qualifier on WHICH keypress — every keypress needs the wait under parallel suite contention, not just the first one. There IS a qualifier on WHICH SCREEN: `waitForWizardFooter()` is a one-string match on the footer text `"select"` that only `WizardLayout` paints, so the rule covers `BaseStep` subclasses only — applying it to the dashboard or any other footer-less screen hangs for the full timeout instead of settling. Post-press waits don't substitute — the race is between render commit and `useEffect`, so the guard must sit upstream of the keystroke. Callers cannot be trusted to have left the screen stable, because the previous method may itself have been a keypress-before-settle. In isolation the race is invisible; under contention the PTY write lands between commit and `useEffect` and the `useInput` handler registered by the new frame isn't listening yet — the keystroke is silently swallowed and the test passes by not exercising the behavior it claims to test.

**Grid navigation must be closed-loop.** Page-object navigation on the build grid MUST verify the focused CATEGORY from the rendered screen after every focus-moving keystroke. Never maintain a keystroke-count model of grid position across calls. Under `NO_COLOR` the focused CELL has no text signal at all (only border colours distinguish it, and those are stripped), but the focused category header does — it paints one column deeper. Tab moves to the next category AND resets the column to 0; arrow-DOWN moves category but PRESERVES and clamps the column. Only Tab yields a known column. `BuildStep.focusSkill` is the canonical implementation; see [patterns.md § Closed-Loop Grid Navigation](./patterns.md) and [page-objects.md](./page-objects.md).

**`getOutput()` is a buffer, not a frame log.** `getOutput()` / `getFullOutput()` return xterm's PROCESSED buffer — the current screen plus whatever genuinely scrolled off. Ink repaints overwrite in place, so a value that was rendered and then re-rendered differently is NOT retrievable from it. Never assert "some earlier frame contained X" via `getOutput()`. Assert at the moment the frame is on screen, or use a raw-output surface (`getRawOutput()`, `waitForRawText`, `waitForTextAfter`) — raw PTY output is append-only and is the only frame-accumulating surface.

**Never broaden assertions.** When a strict assertion fails, investigate why — don't weaken it. If the failure is a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, use `it.fails`.

**Mutation-check every regression guard — green after a fix is not evidence.** A spec that has never been observed to fail is indistinguishable from one that cannot. Before calling a spec a guard: revert the fix in `src/`, `npm run build`, run the spec, confirm it is red **and red for the reason the test name claims**, then restore. This applies to repaired assertions as much as to new ones — a "fixed" vacuous assertion nobody has watched go red is exactly the vacuum it replaced.

Two mechanisms make a spec pass for the wrong reason, and neither is visible by reading it:

1. **The fixture is smaller than production, so the defect's blast radius differs.** `createE2ESource()` writes one stack and ten skills; the real marketplace carries a dozen stacks and many more. For a size-dependent rendering defect, how far an overpaint reaches scales with list length. The stack-step bleed reached the footer against the real marketplace but stopped two rows short of it against the fixture — so the footer assertion, the one matching the reported symptom, was **green against the unfixed binary**. Record in the spec which assertion carries the red under this fixture, so a later reader does not simplify it down to the one that does not.
2. **The assertion's subject is not painted in the captured frame.** See the absence rule below.

**The rule covers every gate-style assertion, not only specs — and a shared helper is where it is easiest to skip, because the specs calling it are green.** A composite assertion module, a probe, a matcher and a hand-run verdict each report a pass or a fail and are each trusted on that report. None of them has been shown to assert anything until it has been watched produce the fail. Two live instances, and mutation is the only thing that separated either from a working check:

| The verdict                                   | Why it could not fail                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe.exitCode !== 0` on the narrowing probe | The probe was handed a skill id where it takes type ALIAS names, so it rendered unparseable TypeScript and `tsc` exited non-zero on a **syntax** verdict without ever type-checking an assignment. The collapse it exists to catch produced the same non-zero exit as success. See the probe rule below. |
| `after.length >= 0 && before.length >= 0`     | A length is never negative. The verdict reported success against every pair of directory listings it was ever given, while reading as a comparison of two.                                                                                                                                               |

**A verdict is judged on the specific signal that answers its question, never on a coarser one that a failure also produces.** `TS2322` answers "does this alias still reject the value", a non-zero exit answers "did tsc have anything to say at all", and the second holds for a probe that compiled nothing. The same distinction applies wherever a check reads an exit code, a non-empty output or a thrown error: name the signal, not the symptom.

The vacuous-comparison half of this is now mechanical, and it is answered in two places. `packages/cli/eslint.config.js` carries `VACUOUS_COMPARISONS` — `no-restricted-syntax` selectors for a `length`, a `size` or a `byteLength` compared against zero in either operand order. `packages/eslint-config/base.js` carries core ESLint's `no-self-compare` for `x === x`, which reaches **every** workspace: it takes no options, so it merges across config blocks, and `x === x` is not a mistake this package has a special claim on. The selectors cannot follow it there for exactly the reason the next paragraph gives.

**`@typescript-eslint/no-unnecessary-condition` does not and cannot catch either**: it asks whether a value's TYPE settles a condition, and `number >= 0` is a `boolean` that the type `number` leaves open, because there is no non-negative number type for a count to narrow to. The shape is only ever reachable syntactically. A `||` of two loose conditions is the same class and stays un-lintable — whether either side can be false is a question about the subject, not the syntax, so it is what the mutation run is for.

**A widening is measured before it lands, never assumed.** `size` and `byteLength` joined `length` on 2026-08-18 on the numbers: the selector reaches a property by NAME, so a domain object's own `size` field is condemned alongside `Map.prototype.size`, and that is where a false positive would come from. Twelve comparisons of a `.size`, `.byteLength` or `.count` against a literal exist across every workspace and every one is discriminating; none sits in the vacuous direction, so the widening condemns nothing that exists. `count` was measured and left out — it names no builtin, so a `count` field is whatever its owner made it. This is the standard two candidate sentinel checks were **refused** against, and a widening is held to it too.

`no-restricted-syntax` options are **not** merged across config blocks: the last block naming the rule for a file owns all of them, so a zone declaring it for its own reason silently drops every selector it did not restate, and a zone no block names has none. `src/cli/lib/__tests__/spec-gates.test.ts` lints one real file per zone against the loaded config, once for every shape in its `ESCAPE_SHAPES` table, and requires the vacuous form to be reported and the discriminating form to be left alone — the positive half is the subject guard for the negative one, and the fixture is thrown on rather than counted if it fails to parse, for the reason the probe row above gives. A fifth gate beside it lints under `packages/eslint-config/base.js` and nothing else, which is the only way to tell a rule the shared base carries from one this package adds on top; the loaded config cannot, because there the two are indistinguishable.

**Absence is the hardest thing to assert in a terminal, and three separate traps make it vacuous.** (a) `getScreen()` is **not** viewport-only despite its name and doc comment — it reads scrollback plus viewport, so `not.toContain(X)` matches anything the session ever drew; prove negatives by ORDER (`toMatch(/…$/)`) or by BEHAVIOUR. (b) A negative rendering assertion needs a **positive subject guard** in the same captured frame — `not.toContain("<bug shape>")` passes for free where none of the rows the shape is made of are painted, and clearing the size gate is not evidence the content is visible. (c) **A counter is not its content** — a scroll affordance's numbers move whether or not anything scrolled. Full detail: [assertions.md § Negative Assertions](./assertions.md) and [anti-patterns.md § Weak Assertions](./anti-patterns.md).

**A workaround in a test's JSDoc is a defect report.** When a spec sidesteps a rendering difference to assert something else, it must cite a finding for that difference or point at the spec that pins the un-worked-around form. Otherwise every later spec inherits the dodge, none asserts the real form, and the defect becomes structurally invisible — the suite green precisely because nothing looks. This is not hypothetical: the Sources grid's focus-padding bug was written into `anti-patterns.md` as the worked example for an unrelated rule and shipped untested for two releases.

**Prove the code path fired — don't just assert the contract.** When a test depends on a specific conditional code path running (e.g. `propagateGlobalChangesToProjects` fires only when `finalConfig.projects?.length` is truthy; a merger step fires only when a field is present), add a proof-of-execution assertion (file-content diff, mtime change, side-effect invariant) alongside the contract assertions. Otherwise a regression that short-circuits the path before the contract code runs produces a vacuous pass — the contract assertions hold trivially because the post-state equals the pre-state. If the pre-condition cannot be met on current `main` (blocked by a known bug), comment the proof-of-execution assertion as `// KNOWN GAP:` with a finding reference so it can be uncommented once unblocked. Cross-link to branch selectors (e.g. `writeScopedFromWizard`'s home branch vs project branch) when the trigger path is ambiguous.

**Diff-shape assertions prove BOTH positive and negative shape.** For diff collections (info-panel rows, config section diffs, scope-per-skill prefix maps) use `toStrictEqual` on a scope-anchored slice, NOT `expect.arrayContaining` — `arrayContaining` passes as long as expected entries exist and silently tolerates extra wrong entries (e.g. a spurious `- React` row alongside the expected `• React`). When two rows share the same prefix, prove it by exhaustively negating all other prefixes (`toContain("• React") + not.toContain("+ React") + not.toContain("- React") + not.toContain("~ React")`) rather than extracting to a parsed struct.

**No parser/extractor helpers in test files.** Never define loops, regex scans, or state machines inside a test file to pick data out of rendered output (`lastFrame()`, `getFullOutput()`) or config text. If a helper has non-trivial logic it would need its OWN tests to be trusted; an uninstrumented parser silently produces wrong answers when layout changes. Assert directly on the raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g. `loadProjectConfig` for config.ts). If genuinely reusable across tests, live it in `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own tests.

**A narrowing probe is judged on `TS2322`, never on a non-zero exit code.** `probeConfigTypesNarrowing` asks whether a generated alias still REJECTS a value it should never accept, and only `TS_NOT_ASSIGNABLE` in its `output` answers that question. `exitCode` answers a different one — tsc exits non-zero for ANY diagnostic — so `expect(probe.exitCode).not.toBe(0)` passes on a probe that never type-checked an assignment at all. The failure mode is not theoretical: the probe takes ALIAS NAMES to import, and handing it a skill id instead renders `import type { web-framework-react }`, which is unparseable. Measured against a `config-types.ts` degraded to `SkillId = string` — the exact collapse the probe exists to catch — a literal argument produced the same non-zero exit as a correct narrow union, so the check could not tell the defect from success. The argument type (`GeneratedAlias`) now makes that particular mistake a compile error; the rule stands anyway, because an exit-code check is uninformative however the non-zero arose.

---

## Further Reading

| Topic                                      | File                                     |
| ------------------------------------------ | ---------------------------------------- |
| The journeys the suite must cover          | [user-journeys.md](./user-journeys.md)   |
| Test structure and the three-phase pattern | [test-structure.md](./test-structure.md) |
| Setting up test data and fixtures          | [test-data.md](./test-data.md)           |
| Assertions and custom matchers             | [assertions.md](./assertions.md)         |
| Reusable patterns for each test type       | [patterns.md](./patterns.md)             |
| Page Object Model framework                | [page-objects.md](./page-objects.md)     |
| Rules and anti-patterns                    | [anti-patterns.md](./anti-patterns.md)   |
