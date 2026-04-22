---
last_validated: 2026-04-21
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

| Layer     | Files                                                                                         | Purpose                                          |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Matchers  | `e2e/matchers/project-matchers.ts`, `setup.ts`                                                | Custom Vitest matchers for file-based assertions |
| Fixtures  | `e2e/fixtures/project-builder.ts`, `cli.ts`, `dual-scope-helpers.ts`, `interactive-prompt.ts` | Project creation, CLI execution, scope helpers   |
| Constants | `e2e/pages/constants.ts`                                                                      | All UI text, paths, timeouts, exit codes         |

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
  fixtures/
    project-builder.ts    # Project directory factories (ProjectBuilder)
    cli.ts                # Non-interactive CLI runner (CLI.run)
    dual-scope-helpers.ts # Multi-phase dual-scope lifecycle helpers
    interactive-prompt.ts # Non-wizard interactive prompt page object
  pages/
    constants.ts          # DIRS, FILES, STEP_TEXT, TIMEOUTS, EXIT_CODES, INTERNAL_DELAYS
    base-step.ts          # Abstract base for all step page objects
    terminal-screen.ts    # Screen abstraction over TerminalSession
    wizard-result.ts      # WizardResult + ProjectHandle types
    dashboard-session.ts  # Dashboard mode page object
    wizards/
      init-wizard.ts      # InitWizard entry point
      edit-wizard.ts      # EditWizard entry point
    steps/
      stack-step.ts       # Stack selection step
      domain-step.ts      # Domain selection step
      build-step.ts       # Skill selection / build step
      sources-step.ts     # Source configuration step
      agents-step.ts      # Agent selection step
      confirm-step.ts     # Confirm and install step
      search-modal.ts     # Search overlay (opened from build step)
  matchers/
    project-matchers.ts   # Custom Vitest matcher implementations
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

| Setting       | Value                   | Notes                                                    |
| ------------- | ----------------------- | -------------------------------------------------------- |
| `pool`        | `"forks"`               | Process isolation between test files                     |
| `testTimeout` | `30_000`                | Default per-test timeout                                 |
| `hookTimeout` | `60_000`                | Default for beforeAll/afterAll                           |
| `retry`       | `2`                     | Automatic retry (up to 2 retries on failure)             |
| `include`     | `e2e/**/*.e2e.test.ts`  | Smoke tests (`*.smoke.test.ts`) excluded, run explicitly |
| `globalSetup` | `./e2e/global-setup.ts` | Pre-suite setup                                          |

Long tests override per-test: `it("...", { timeout: TIMEOUTS.LIFECYCLE }, async () => {})`.

---

## Constants Quick-Reference

All constants live in `e2e/pages/constants.ts`. Tests import from here, never from `src/cli/`.

**Directories (`DIRS`):** `CLAUDE`, `CLAUDE_SRC`, `SKILLS`, `AGENTS`, `PLUGINS`, `PLUGIN_MANIFEST`

**Files (`FILES`):** `CONFIG_TS`, `CONFIG_TYPES_TS`, `SKILL_MD`, `METADATA_YAML`, `SETTINGS_JSON`, `INSTALLED_PLUGINS_JSON`, `IDENTITY_MD`, `PLAYBOOK_MD`, `PLUGIN_JSON`

**Step text (`STEP_TEXT`):** `STACK`, `DOMAINS`, `DOMAIN_WEB`, `DOMAIN_API`, `DOMAIN_META`, `DOMAIN_MOBILE`, `BUILD`, `BUILD_FOOTER`, `SOURCES`, `AGENTS`, `CONFIRM`, `INIT_SUCCESS`, `EDIT_SUCCESS`, `EDIT_UNCHANGED`, `COMPILE_SUCCESS`, `EJECT_SUCCESS`, `IMPORT_SUCCESS`, `UNINSTALL_SUCCESS`, `LOADING_SKILLS`, `RECOMPILING`, `COMPILING_STACK`, `LOADED`, `LOADED_LOCAL`, `CONFIRM_UPDATE`, `CONFIRM_UNINSTALL`, `SEARCH`, `DASHBOARD`, `FOOTER_SELECT`, `START_FROM_SCRATCH`, `TOGGLE_SELECTION`, `NO_INSTALLATION`, `TOO_NARROW`, `TOO_SHORT`

**Timeouts (`TIMEOUTS`):** `WIZARD_LOAD` (15s), `INSTALL` (30s), `PLUGIN_INSTALL` (60s), `PLUGIN_TEST` (90s = PLUGIN_INSTALL + EXIT_WAIT), `EXIT` (10s), `SESSION_DEFAULT` (10s), `SESSION_DEFAULT_CI` (20s), `EXIT_WAIT` (30s), `SETUP` (60s), `LIFECYCLE` (180s), `EXTENDED_LIFECYCLE` (300s), `INTERACTIVE` (120s)

**Exit codes (`EXIT_CODES`):** `SUCCESS` (0), `ERROR` (1), `INVALID_ARGS` (2), `NETWORK_ERROR` (3), `CANCELLED` (4), `UNKNOWN_COMMAND` (127)

**`INTERNAL_DELAYS`** contains `STEP_TRANSITION` and `KEYSTROKE`. These are framework-internal and must never appear in test files.

**Source paths (`SOURCE_PATHS`):** `SKILLS_DIR`, `SKILL_CATEGORIES`, `SKILL_RULES`, `STACKS_FILE`, `PLUGIN_MANIFEST_DIR`

These are paths within a skills source directory (not a project directory). Use for tests that assert on source structure.

---

## Critical Rules

**Rebuild before running E2E tests.** E2E tests execute the compiled binary at `dist/` via `bin/run.js` — source edits in `src/` are invisible until `npm run build` runs. `ensureBinaryExists()` only checks that the binary exists; it does NOT stamp-check that it was built after the latest source edit. After any `src/` change, run `npm run build` before running E2E tests. If E2Es fail with pre-fix symptoms despite source edits, rebuild first. Unit tests cover the same source directly and will pass against stale `dist/` — disagreement between unit-test green and E2E red with identical failure signature is the canonical stale-build signal.

**State-change verification.** Any test that completes a wizard flow or runs a command that creates, modifies, or removes files or config entries MUST assert the resulting state of both config AND filesystem. If the operation should NOT change something, snapshot before and assert identical after. Never check only one side.

**Page object key-press rule.** Every step page-object method that sends a key press MUST call `await this.waitForStableRender()` _before_ the press. No qualifier — every keypress needs the wait under parallel suite contention, not just the first one. Post-press waits don't substitute — the race is between render commit and `useEffect`, so the guard must sit upstream of the keystroke. Callers cannot be trusted to have left the screen stable, because the previous method may itself have been a keypress-before-settle. In isolation the race is invisible; under contention the PTY write lands between commit and `useEffect` and the `useInput` handler registered by the new frame isn't listening yet — the keystroke is silently swallowed and the test passes by not exercising the behavior it claims to test.

**Never broaden assertions.** When a strict assertion fails, investigate why — don't weaken it. If the failure is a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, use `it.fails`.

**Prove the code path fired — don't just assert the contract.** When a test depends on a specific conditional code path running (e.g. `propagateGlobalChangesToProjects` fires only when `finalConfig.projects?.length` is truthy; a merger step fires only when a field is present), add a proof-of-execution assertion (file-content diff, mtime change, side-effect invariant) alongside the contract assertions. Otherwise a regression that short-circuits the path before the contract code runs produces a vacuous pass — the contract assertions hold trivially because the post-state equals the pre-state. If the pre-condition cannot be met on current `main` (blocked by a known bug), comment the proof-of-execution assertion as `// KNOWN GAP:` with a finding reference so it can be uncommented once unblocked. Cross-link to branch selectors (e.g. `writeScopedConfigs` HOME-context vs project-context) when the trigger path is ambiguous.

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
