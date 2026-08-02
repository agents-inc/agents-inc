---
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.147.1)
     ✓ STEP_TEXT re-counted from e2e/pages/constants.ts; §Critical Rules (four added); the
       TERMINAL_SIZE and "Resizing mid-session" paragraphs re-read against source
     ✗ TIMEOUTS, EXIT_CODES, SOURCE_PATHS, DIRS, FILES, INTERNAL_DELAYS, INTERNAL_RETRIES, the
       directory tree, the Vitest config table, the test-category table — 2026-07-30 basis
-->

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

| Layer      | Files                                                                                                                                          | Purpose                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Matchers   | `e2e/matchers/project-matchers.ts`, `agent-matchers.ts`, `setup.ts`                                                                            | Custom Vitest matchers for file-based assertions                          |
| Assertions | `e2e/assertions/{phase,scope,uninstall,config}-assertions.ts`                                                                                  | Composite assertion helpers (plain functions, NOT called via `expect()`)  |
| Fixtures   | `e2e/fixtures/project-builder.ts`, `cli.ts`, `dual-scope-helpers.ts`, `interactive-prompt.ts`, `expected-values.ts`, `plugin-install-state.ts` | Project creation, CLI execution, scope helpers, canonical expected values |
| Constants  | `e2e/pages/constants.ts`                                                                                                                       | All UI text, paths, timeouts, exit codes                                  |

---

## Directory Structure

```
e2e/
  commands/           # Non-interactive command tests (CLI.run)
  interactive/        # Wizard and interactive component tests
  lifecycle/          # Multi-phase flows: init -> edit -> compile -> uninstall
  integration/        # Cross-command pipelines
  smoke/              # Third-party binary probes, framework validation
  helpers/
    test-utils.ts         # runCLI, createTempDir, path helpers, re-exports
    terminal-session.ts   # PTY wrapper (framework-internal, never imported by tests)
    create-e2e-source.ts  # 9-skill E2E source factory
    node-pty.d.ts         # Type reference for node-pty
    create-e2e-plugin-source.ts # Plugin source factory (builds plugins + marketplace.json)
    type-check-probe.ts   # tsc probe: asserts a generated config-types.ts alias still REJECTS bad values
  fixtures/
    project-builder.ts    # Project directory factories (ProjectBuilder)
    cli.ts                # Non-interactive CLI runner (CLI.run)
    dual-scope-helpers.ts # Multi-phase dual-scope lifecycle helpers
    interactive-prompt.ts # Non-wizard interactive prompt page object
    expected-values.ts    # E2E_SKILL_IDS, E2E_SKILL, E2E_AGENT, E2E_AGENTS, E2E_AGENT_DISPLAY
    plugin-install-state.ts # Reproduces a completed plugin install WITHOUT the Claude CLI
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
  matchers/
    project-matchers.ts   # Custom Vitest matcher implementations
    agent-matchers.ts     # toHaveAgentFrontmatter, toHaveAgentDynamicSkills
    setup.ts              # Matcher registration + type augmentation
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

| Setting       | Value                   | Notes                                                                                                                                                                           |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool`        | `"forks"`               | Process isolation between test files                                                                                                                                            |
| `maxWorkers`  | `16`                    | Capped. PTY-driven wizard tests are load-sensitive: at one worker per core (21+ on dev machines) dropped keystrokes and slow installs produce flake that never reproduces solo. |
| `testTimeout` | `30_000`                | Default per-test timeout                                                                                                                                                        |
| `hookTimeout` | `60_000`                | Default for beforeAll/afterAll                                                                                                                                                  |
| `retry`       | `2`                     | Automatic retry (up to 2 retries on failure)                                                                                                                                    |
| `include`     | `e2e/**/*.e2e.test.ts`  | Smoke tests (`*.smoke.test.ts`) excluded, run explicitly                                                                                                                        |
| `globalSetup` | `./e2e/global-setup.ts` | Pre-suite setup                                                                                                                                                                 |

Long tests override per-test: `it("...", { timeout: TIMEOUTS.LIFECYCLE }, async () => {})`.

---

## Constants Quick-Reference

All constants live in `e2e/pages/constants.ts`. Tests import from here, never from `src/cli/`.

**Directories (`DIRS`):** `CLAUDE`, `CLAUDE_SRC`, `SKILLS`, `AGENTS`, `PLUGINS`, `PLUGIN_MANIFEST`

**Files (`FILES`):** `CONFIG_TS`, `CONFIG_TYPES_TS`, `SKILL_MD`, `METADATA_YAML`, `SETTINGS_JSON`, `INSTALLED_PLUGINS_JSON`, `IDENTITY_MD`, `PLAYBOOK_MD`, `PLUGIN_JSON`

**Step text (`STEP_TEXT`)** — all 77 members (re-derived from `e2e/pages/constants.ts` on 2026-08-02, after the config-gate work added `PROPAGATED_RECOMPILE` and `SOURCE_ADDED`; the "75" recorded earlier the same day counted the tree before those two landed, and the "72" recorded on 2026-07-31 was itself short by `FOOTER_HOTKEY_ROW` and `LOGO_BANNER`, which no doc had ever listed). An exhaustive list that is short is worse than a glob, because it reads as authoritative — re-derive this count from `e2e/pages/constants.ts` rather than carrying it forward, and grep [reference/testing/e2e-infrastructure.md](../../reference/testing/e2e-infrastructure.md) for the old value in the same session, since it is the only other place the number is written:

| Group                 | Members                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step identification   | `STACK`, `DOMAINS`, `DOMAIN_WEB`, `DOMAIN_API`, `DOMAIN_META`, `DOMAIN_MOBILE`, `BUILD`, `BUILD_FOOTER`, `SCOPE`, `CATEGORY_FRAMEWORK`, `SOURCES`, `AGENTS`, `CONFIRM`                                                                                                                                          |
| Completion            | `INIT_SUCCESS`, `EDIT_SUCCESS`, `EDIT_UNCHANGED`, `COMPILE_SUCCESS`, `COMPILE_COMPLETE`, `CONFIG_LOAD_FAILED`, `EJECT_SUCCESS`, `IMPORT_SUCCESS`, `UNINSTALL_SUCCESS`                                                                                                                                           |
| Status / progress     | `LOADING_SKILLS`, `RECOMPILING`, `NO_AGENTS_TO_RECOMPILE`, `COMPILE_GLOBAL_SCOPE_HINT`, `CONFIG_TYPES_REFRESHED`, `SKILL_NOT_FOUND_WARNING`, `COMPILE_PASS_NO_SKILLS`, `COMPILE_NO_SKILLS_ERROR`, `PROPAGATED_RECOMPILE_ONE`, `PROPAGATED_RECOMPILE`, `LOADED`, `LOADED_LOCAL`, `LOADED_SKILL`, `COMPILED_LIST` |
| Prompts               | `CONFIRM_UPDATE`, `CONFIRM_UNINSTALL`, `SEARCH`, `UNINSTALL_PREVIEW`, `UNINSTALL_PREVIEW_HEADING`, `UNINSTALL_CONFIG_SECTION`, `UNINSTALL_PROJECTS_UPDATED_ONE`, `UNINSTALL_PROJECT_SKIPPED`, `UNINSTALL_CONFIG_UNREADABLE`                                                                                     |
| Sources step          | `CONFIGURED_MARKETPLACES`, `ADD_SOURCE`, `SOURCE_ADDED`                                                                                                                                                                                                                                                         |
| Scope group labels    | `SCOPE_GLOBAL`, `SCOPE_PROJECT`                                                                                                                                                                                                                                                                                 |
| Dashboard             | `DASHBOARD`                                                                                                                                                                                                                                                                                                     |
| UI elements           | `FOOTER_SELECT`, `FOOTER_HOTKEY_ROW`, `START_FROM_SCRATCH`, `TOGGLE_SELECTION`, `NO_INSTALLATION`                                                                                                                                                                                                               |
| Installation output   | `INSTALLING_PLUGINS`, `INSTALLING_PLUGINS_ELLIPSIS`, `PLUGIN_NATIVE`, `SKILLS_COPIED_TO`, `AGENTS_COMPILED_TO`, `CONFIGURATION_LABEL`, `READY_TO_INSTALL`, `NO_SKILLS_FOUND`, `UNINSTALL_CANCELLED`                                                                                                             |
| Scope warnings        | `GLOBAL_SKILLS_BLOCKED`, `GLOBAL_AGENTS_BLOCKED`                                                                                                                                                                                                                                                                |
| Terminal-size warning | `TOO_NARROW`, `TOO_SHORT`, `RESIZE_PROMPT`                                                                                                                                                                                                                                                                      |
| Stack-step banner     | `LOGO_BANNER`                                                                                                                                                                                                                                                                                                   |
| Scroll affordance     | `SCROLL_MORE_BELOW`, `SCROLL_MORE_ABOVE`                                                                                                                                                                                                                                                                        |
| Summary-panel header  | `PANEL_MARKETPLACE`, `PANEL_STACK`, `PANEL_STACK_NONE`, `SOURCE_DISPLAY_DEFAULT`                                                                                                                                                                                                                                |

`SCOPE` ("Scope") is painted only for genuine project-scope edits — the footer hides it when `isEditingFromGlobalScope` is true — so it is the sentinel for asserting which scope a session actually runs at.

**Timeouts (`TIMEOUTS`):** `WIZARD_LOAD` (45s), `WIZARD_TRANSITION` (45s), `INSTALL` (30s), `PLUGIN_INSTALL` (60s), `PLUGIN_TEST` (90s = PLUGIN_INSTALL + EXIT_WAIT), `EXIT` (10s), `SESSION_DEFAULT` (10s), `SESSION_DEFAULT_CI` (20s), `EXIT_WAIT` (30s), `SETUP` (60s), `SETUP_DUAL` (120s = SETUP × 2, for `beforeAll` hooks that build two sources), `LIFECYCLE` (180s), `EXTENDED_LIFECYCLE` (300s), `INTERACTIVE` (120s)

`WIZARD_LOAD` was raised 15s → 45s in 0.145.0: `init` against the real marketplace under full-suite parallelism can sit at "Loading skills..." well past 15s. `BaseStep.defaultTimeout` derives from it, so every unqualified step wait is now a 45s upper bound — including the one that burns when `waitForWizardFooter` is used on a footer-less screen.

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

**State-change verification.** Any test that completes a wizard flow or runs a command that creates, modifies, or removes files or config entries MUST assert the resulting state of both config AND filesystem. If the operation should NOT change something, snapshot before and assert identical after. Never check only one side.

**Page object key-press rule.** Every step page-object method that sends a key press MUST call `await this.waitForWizardFooter()` _before_ the press. No qualifier on WHICH keypress — every keypress needs the wait under parallel suite contention, not just the first one. There IS a qualifier on WHICH SCREEN: `waitForWizardFooter()` is a one-string match on the footer text `"select"` that only `WizardLayout` paints, so the rule covers `BaseStep` subclasses only — applying it to the dashboard or any other footer-less screen hangs for the full timeout instead of settling. Post-press waits don't substitute — the race is between render commit and `useEffect`, so the guard must sit upstream of the keystroke. Callers cannot be trusted to have left the screen stable, because the previous method may itself have been a keypress-before-settle. In isolation the race is invisible; under contention the PTY write lands between commit and `useEffect` and the `useInput` handler registered by the new frame isn't listening yet — the keystroke is silently swallowed and the test passes by not exercising the behavior it claims to test.

**Grid navigation must be closed-loop.** Page-object navigation on the build grid MUST verify the focused CATEGORY from the rendered screen after every focus-moving keystroke. Never maintain a keystroke-count model of grid position across calls. Under `NO_COLOR` the focused CELL has no text signal at all (only border colours distinguish it, and those are stripped), but the focused category header does — it paints one column deeper. Tab moves to the next category AND resets the column to 0; arrow-DOWN moves category but PRESERVES and clamps the column. Only Tab yields a known column. `BuildStep.focusSkill` is the canonical implementation; see [patterns.md § Closed-Loop Grid Navigation](./patterns.md) and [page-objects.md](./page-objects.md).

**`getOutput()` is a buffer, not a frame log.** `getOutput()` / `getFullOutput()` return xterm's PROCESSED buffer — the current screen plus whatever genuinely scrolled off. Ink repaints overwrite in place, so a value that was rendered and then re-rendered differently is NOT retrievable from it. Never assert "some earlier frame contained X" via `getOutput()`. Assert at the moment the frame is on screen, or use a raw-output surface (`getRawOutput()`, `waitForRawText`, `waitForTextAfter`) — raw PTY output is append-only and is the only frame-accumulating surface.

**Never broaden assertions.** When a strict assertion fails, investigate why — don't weaken it. If the failure is a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, use `it.fails`.

**Mutation-check every regression guard — green after a fix is not evidence.** A spec that has never been observed to fail is indistinguishable from one that cannot. Before calling a spec a guard: revert the fix in `src/`, `npm run build`, run the spec, confirm it is red **and red for the reason the test name claims**, then restore. This applies to repaired assertions as much as to new ones — a "fixed" vacuous assertion nobody has watched go red is exactly the vacuum it replaced.

Two mechanisms make a spec pass for the wrong reason, and neither is visible by reading it:

1. **The fixture is smaller than production, so the defect's blast radius differs.** `createE2ESource()` writes one stack and nine skills; the real marketplace carries a dozen stacks and many more. For a size-dependent rendering defect, how far an overpaint reaches scales with list length. The stack-step bleed reached the footer against the real marketplace but stopped two rows short of it against the fixture — so the footer assertion, the one matching the reported symptom, was **green against the unfixed binary**. Record in the spec which assertion carries the red under this fixture, so a later reader does not simplify it down to the one that does not.
2. **The assertion's subject is not painted in the captured frame.** See the absence rule below.

**Absence is the hardest thing to assert in a terminal, and three separate traps make it vacuous.** (a) `getScreen()` is **not** viewport-only despite its name and doc comment — it reads scrollback plus viewport, so `not.toContain(X)` matches anything the session ever drew; prove negatives by ORDER (`toMatch(/…$/)`) or by BEHAVIOUR. (b) A negative rendering assertion needs a **positive subject guard** in the same captured frame — `not.toContain("<bug shape>")` passes for free where none of the rows the shape is made of are painted, and clearing the size gate is not evidence the content is visible. (c) **A counter is not its content** — a scroll affordance's numbers move whether or not anything scrolled. Full detail: [assertions.md § Negative Assertions](./assertions.md) and [anti-patterns.md § Weak Assertions](./anti-patterns.md).

**A workaround in a test's JSDoc is a defect report.** When a spec sidesteps a rendering difference to assert something else, it must cite a finding for that difference or point at the spec that pins the un-worked-around form. Otherwise every later spec inherits the dodge, none asserts the real form, and the defect becomes structurally invisible — the suite green precisely because nothing looks. This is not hypothetical: the Sources grid's focus-padding bug was written into `anti-patterns.md` as the worked example for an unrelated rule and shipped untested for two releases.

**Prove the code path fired — don't just assert the contract.** When a test depends on a specific conditional code path running (e.g. `propagateGlobalChangesToProjects` fires only when `finalConfig.projects?.length` is truthy; a merger step fires only when a field is present), add a proof-of-execution assertion (file-content diff, mtime change, side-effect invariant) alongside the contract assertions. Otherwise a regression that short-circuits the path before the contract code runs produces a vacuous pass — the contract assertions hold trivially because the post-state equals the pre-state. If the pre-condition cannot be met on current `main` (blocked by a known bug), comment the proof-of-execution assertion as `// KNOWN GAP:` with a finding reference so it can be uncommented once unblocked. Cross-link to branch selectors (e.g. `writeScopedFromWizard`'s home branch vs project branch) when the trigger path is ambiguous.

**Diff-shape assertions prove BOTH positive and negative shape.** For diff collections (info-panel rows, config section diffs, scope-per-skill prefix maps) use `toStrictEqual` on a scope-anchored slice, NOT `expect.arrayContaining` — `arrayContaining` passes as long as expected entries exist and silently tolerates extra wrong entries (e.g. a spurious `- React` row alongside the expected `• React`). When two rows share the same prefix, prove it by exhaustively negating all other prefixes (`toContain("• React") + not.toContain("+ React") + not.toContain("- React") + not.toContain("~ React")`) rather than extracting to a parsed struct.

**No parser/extractor helpers in test files.** Never define loops, regex scans, or state machines inside a test file to pick data out of rendered output (`lastFrame()`, `getFullOutput()`) or config text. If a helper has non-trivial logic it would need its OWN tests to be trusted; an uninstrumented parser silently produces wrong answers when layout changes. Assert directly on the raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g. `loadProjectConfig` for config.ts). If genuinely reusable across tests, live it in `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own tests.

---

## Further Reading

| Topic                                      | File                                     |
| ------------------------------------------ | ---------------------------------------- |
| Test structure and the three-phase pattern | [test-structure.md](./test-structure.md) |
| Setting up test data and fixtures          | [test-data.md](./test-data.md)           |
| Assertions and custom matchers             | [assertions.md](./assertions.md)         |
| Reusable patterns for each test type       | [patterns.md](./patterns.md)             |
| Page Object Model framework                | [page-objects.md](./page-objects.md)     |
| Rules and anti-patterns                    | [anti-patterns.md](./anti-patterns.md)   |
