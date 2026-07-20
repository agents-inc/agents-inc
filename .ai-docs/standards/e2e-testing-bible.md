---
last_validated: 2026-04-21
---

# E2E Testing Standards

Consolidated from 11 audit/strategy docs and 74 E2E test files. Every rule is enforceable and grounded in actual codebase patterns.

---

## 1. Test Organization

**1.1 Directory structure follows test category.**

```
e2e/
  commands/         # Non-interactive command tests (CLI.run / runCLI)
  interactive/      # Wizard and interactive component tests (InitWizard / EditWizard)
  lifecycle/        # Multi-phase flows: init -> edit -> compile -> uninstall
  integration/      # Cross-command integration (eject -> compile, custom agents)
  smoke/            # Third-party binary probes (Claude CLI availability)
  helpers/          # Shared infrastructure (NO test files here)
    test-utils.ts         # runCLI, createTempDir, path helpers, re-exports
    terminal-session.ts   # PTY wrapper with xterm-headless screen reading
    create-e2e-source.ts  # 9-skill source fixture (skills, agents, stacks, templates)
    create-e2e-plugin-source.ts  # Source + built plugins + marketplace.json
    node-pty.d.ts         # Type declaration reference for @lydell/node-pty
  fixtures/         # Project creation, CLI execution, scope helpers
    project-builder.ts    # ProjectBuilder static factories
    cli.ts                # Non-interactive CLI runner (CLI.run)
    dual-scope-helpers.ts # Multi-phase dual-scope lifecycle helpers
    interactive-prompt.ts # Non-wizard interactive prompt page object
  pages/            # Page Object Model framework
    constants.ts          # DIRS, FILES, STEP_TEXT, TIMEOUTS, EXIT_CODES
    base-step.ts          # Abstract base for all step page objects
    terminal-screen.ts    # Screen abstraction over TerminalSession
    wizard-result.ts      # WizardResult + ProjectHandle types
    dashboard-session.ts  # Dashboard mode page object
    wizards/              # Wizard entry points (InitWizard, EditWizard)
    steps/                # Step page objects (stack, domain, build, sources, agents, confirm)
  matchers/         # Custom Vitest matchers for file-based assertions
    project-matchers.ts   # Matcher implementations
    setup.ts              # Matcher registration + type augmentation
```

**1.2 File naming: `{feature}.e2e.test.ts`.** Smoke tests use `{feature}.smoke.test.ts`. Split files at 300 LOC or 2+ unrelated concerns. Use descriptive names: `edit-wizard-plugin-migration.e2e.test.ts`, not `edit-2.e2e.test.ts`.

**1.3 No task IDs in test names, assertion messages, or inline comments.** Never include `D-NNN` / `P-BUILD-1` / `Bug A` in `describe()` names, `it()` names, assertion messages (2nd arg to `expect`), or inline test-body comments. The only permitted location is file-level JSDoc at the top of the file, for scenario context. Test names describe BEHAVIOR ("version field is not emitted on init"), not tickets. Assertion messages describe the INVARIANT ("config.ts must not contain version field"), not the ticket that added it. Names rot — ticket IDs look authoritative but become meaningless once the task is closed. See `.ai-docs/agent-findings/2026-04-21-task-ids-in-test-names-sweep-needed.md`.

**1.4 Vitest config:** `e2e/vitest.config.ts` uses `pool: "forks"`, `testTimeout: 30_000`, `hookTimeout: 60_000`, `retry: 2`. The include pattern is `e2e/**/*.e2e.test.ts` -- smoke tests (`*.smoke.test.ts`) are excluded and must be run explicitly. Long tests override per-test with `{ timeout: TIMEOUTS.LIFECYCLE }`.

---

## 2. Test Categories

**2.1 Command tests** (`commands/`): Non-interactive. Use `CLI.run()` (preferred) or `runCLI()`. Test flags, output text, exit codes, and file system side effects. One `describe` per command, split into files when a command has 15+ tests.

**2.2 Interactive tests** (`interactive/`): Wizard flows. Use `InitWizard` / `EditWizard` page objects. Test keyboard navigation, step transitions, wizard completion, and resulting file output. Split by concern: `init-wizard-stack`, `init-wizard-scratch`, `edit-wizard-local`.

**2.3 Lifecycle tests** (`lifecycle/`): Multi-phase flows spanning commands. A single `it()` block runs Phase 1 (init) -> Phase 2 (compile/edit) -> Phase 3 (uninstall) -> Phase 4 (verify clean state). Use page objects for interactive phases, `CLI.run()` for non-interactive phases.

**2.4 Integration tests** (`integration/`): Cross-command pipelines. Example: eject templates, modify them, compile, verify custom template content appears in output. Use `CLI.run()` exclusively.

**2.5 Smoke tests** (`smoke/`): Third-party binary probes (Claude CLI). These test whether external tools work, not our CLI. Use `describe.skipIf(!claudeAvailable)`. Never import production functions except `isClaudeCLIAvailable` and other `exec.ts` utilities for guards. Smoke tests also import `exec.ts` functions (`execCommand`, `claudePluginInstall`, etc.) because they test the Claude CLI binary directly, not our CLI.

---

## 3. CLI Execution

### Non-interactive: `CLI.run()` / `runCLI`

**3.1 Use `CLI.run()` from `e2e/fixtures/cli.ts` (preferred) or `runCLI()` from `test-utils.ts` for non-interactive commands.**

```typescript
import { runCLI } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

const { exitCode, stdout, stderr, combined } = await runCLI(["compile", "--verbose"], projectDir, {
  env: { AGENTSINC_SOURCE: undefined },
});

expect(exitCode).toBe(EXIT_CODES.SUCCESS);
expect(combined).toContain("Discovered 1 local skills");
```

**3.2 `runCLI` sets `HOME=cwd` by default** to isolate from user's real global config. Override via `options.env.HOME` when testing dual-scope (separate global home and project dir).

**3.3 All output is pre-stripped of ANSI.** `runCLI` calls `stripVTControlCharacters` on stdout, stderr, and combined. No manual stripping needed.

**3.4 Use `{ AGENTSINC_SOURCE: undefined }` in env options** to prevent remote source resolution during compile tests. `CLI.run()` sets this by default; `runCLI()` does NOT -- callers must pass it via `options.env` if needed. Do NOT spread `process.env` into `env` -- `execa` inherits it automatically, and spreading would clobber the `HOME` override.

### Interactive: Page Objects (Wizards + Steps)

**3.5 Use page objects for all interactive flows.** Tests use `InitWizard.launch()` or `EditWizard.launch()` from `e2e/pages/wizards/`. Never import `TerminalSession` in test files.

```typescript
import { InitWizard } from "../pages/wizards/init-wizard.js";

const wizard = await InitWizard.launch({ source });
const result = await wizard.completeWithDefaults();
```

For non-wizard interactive prompts (uninstall confirmation, update), use `InteractivePrompt` from `e2e/fixtures/interactive-prompt.ts`.

**3.6 `TerminalSession` architecture (framework-internal -- never used in tests):**

- Spawns `node bin/run.js` via `@lydell/node-pty` (prebuilt binaries, no C++ compilation)
- Spreads `process.env` and sets `HOME=cwd`, `NO_COLOR=1`, `FORCE_COLOR=0` (color suppression ensures clean xterm buffer reads)
- Pipes PTY output to `@xterm/headless` virtual terminal (processes all ANSI/cursor codes)
- `getScreen()`: visible viewport only
- `getFullOutput()`: viewport + scrollback (use for most assertions)
- `getRawOutput()`: raw PTY data with ANSI stripped (for text that Ink overwrites in the buffer)
- `waitForText()`: polls `getFullOutput()` every 50ms until match or timeout
- `waitForExit()`: waits for process to exit, returns exit code
- Kills process tree via `tree-kill` on destroy

**3.7 Always destroy sessions.** Use `afterEach` for interactive/command tests (each test is independent) or `afterAll` for lifecycle tests (phases share state):

```typescript
// Interactive/command tests: afterEach (independent tests)
afterEach(async () => {
  await wizard?.destroy();
  wizard = undefined;
});

// Lifecycle tests: afterAll (shared state across phases)
afterAll(async () => {
  await wizard?.destroy();
  if (tempDir) await cleanupTempDir(tempDir);
});
```

**3.8 Always call `ensureBinaryExists()` in `beforeAll`.** This verifies `bin/run.js` exists before running tests, providing a clear error if the CLI wasn't built:

```typescript
beforeAll(ensureBinaryExists);
```

---

## 4. Interactive Testing

**4.1 Keystroke methods on `TerminalSession`:**

| Method         | Escape Sequence | Usage               |
| -------------- | --------------- | ------------------- |
| `enter()`      | `\r`            | Confirm selection   |
| `arrowDown()`  | `\x1b[B`        | Navigate down       |
| `arrowUp()`    | `\x1b[A`        | Navigate up         |
| `arrowRight()` | `\x1b[C`        | Navigate right      |
| `space()`      | ` `             | Toggle checkbox     |
| `escape()`     | `\x1b`          | Cancel / back       |
| `tab()`        | `\t`            | Next section        |
| `ctrlC()`      | `\x03`          | Interrupt           |
| `write(str)`   | any string      | Type text or hotkey |

**4.2 The `waitForText` -> `delay` -> `keystroke` pattern.** Every wizard step follows this sequence:

```typescript
// Wait for the step to render
await session.waitForText("Choose a stack", TIMEOUTS.WIZARD_LOAD);
// Allow rendering to stabilize (framework-internal; page objects handle this automatically)
await delay(INTERNAL_DELAYS.STEP_TRANSITION);
// Send input
session.enter();
```

Never send keystrokes without first waiting for the expected UI text. The delay after `waitForText` prevents race conditions where the UI hasn't finished rendering all elements.

**4.3 Use `waitForWizardFooter()` for assertions on wizard content.** It waits for the footer ("select") to render (last element in Ink tree), guaranteeing all content above is stable:

```typescript
await screen.waitForWizardFooter(TIMEOUTS.WIZARD_LOAD);
expect(screen.getFullOutput()).toContain("web-framework-react");
```

**Precondition — `WizardLayout` screens only.** This is a one-string sentinel match on the footer text `"select"`, which only `WizardLayout` paints. It is not a generic "the UI has settled" primitive: on a footer-less screen (the dashboard, a plain `SelectList` menu, the post-install result screen) the sentinel never appears and the call burns the full 15s timeout instead of settling. On those screens, wait on text that screen actually renders.

**4.4 For text that Ink overwrites (installation progress), use `getRawOutput()`.** The xterm buffer has limited scrollback (1000 lines). Installation warnings may exceed this. `getRawOutput()` captures everything:

```typescript
await screen.waitForRawText("initialized successfully", TIMEOUTS.INSTALL);
```

**4.5 Send hotkeys with `session.write()`.** Wizard hotkeys are single characters — send them as `session.write("a")`. See `hotkeys.ts` for the full registry. Do not hardcode hotkey characters in tests; if a hotkey changes, the test should break at the `waitForText` assertion, not silently pass with the wrong key.

**4.6 Use page object composite flows for repeated patterns.** The old `navigate*` helper functions in `test-utils.ts` have been replaced by page object methods:

| Page Object Method                            | Purpose                                                        | Source                   |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------ |
| `InitWizard.completeWithDefaults(stackName?)` | Stack -> Domain -> Build (all) -> Sources -> Agents -> Confirm | `wizards/init-wizard.ts` |
| `EditWizard.passThrough()`                    | Build (all) -> Sources -> Agents -> Confirm                    | `wizards/edit-wizard.ts` |
| `BuildStep.passThroughAllDomains()`           | Web -> API -> Methodology domain build steps                   | `steps/build-step.ts`    |
| `TerminalScreen.waitForRawText(text, ms)`     | Poll raw PTY output (bypasses xterm buffer limits)             | `terminal-screen.ts`     |

**4.7 Page-object keypress rule.** Every key-press method in an E2E step page object (`e2e/pages/steps/*.ts`, `e2e/pages/base-step.ts`) MUST call `await this.waitForWizardFooter()` _before_ pressing the key. This applies to `pressEnter`, `pressSpace`, `pressKey`, `pressEscape`, `pressArrowUp`/`Down`/`Right`, `pressCtrlC`, and any domain-specific keypress method (e.g. `toggleFocusedSkill`, `openSearch`, `navigateToNextCategory`, `goBack`).

**The rule binds `BaseStep` subclasses only.** `waitForWizardFooter()` is a one-string match on the wizard footer text `"select"`, which only `WizardLayout` paints — so on a footer-less screen it hangs for the full timeout rather than settling. A non-wizard page object (e.g. `DashboardSession`) must gate on its own screen-specific sentinel instead. Applying the guard to the dashboard once cost 72 failures across 35 files; see `.ai-docs/agent-findings/2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`.

React effects may not have fired yet — without the wait, the PTY write lands between commit and `useEffect`, so the `useInput` handler registered by the new frame isn't listening. The keystroke is silently swallowed and the test passes by not exercising the behavior it claims to test. Post-press waits don't substitute — the race is upstream of the keystroke. Callers cannot be trusted to have left the screen stable, because the previous method may itself have been a keypress-before-settle. In isolation the race is invisible; under parallel suite contention it surfaces as flake. See `.ai-docs/agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md`.

---

## 5. File System

**5.1 Use `createTempDir()` / `cleanupTempDir()` from `test-utils.ts`.** Never import `mkdtemp` or `os.tmpdir()` directly. The helper uses a consistent `ai-e2e-` prefix.

```typescript
let tempDir: string;

beforeAll(async () => {
  tempDir = await createTempDir();
}, TIMEOUTS.SETUP);

afterAll(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
});
```

**5.2 Use `fileExists()` / `directoryExists()` from `test-utils.ts`**, not `fs.stat` or `fs.access` directly.

**5.3 Use `readTestFile()` instead of raw `readFile(path, "utf-8")`.** Consistent helper from `test-utils.ts`.

**5.4 Use `listFiles()` instead of raw `readdir()`.** Returns `[]` on error instead of throwing.

**5.5 Project factory functions create test fixtures:**

| Factory                                               | Creates                                     | Use When                                 |
| ----------------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| `ProjectBuilder.minimal()`                            | Config + 1 skill                            | Compile tests                            |
| `ProjectBuilder.editable(options?)`                   | Config + skills + agents dir                | Edit wizard tests                        |
| `ProjectBuilder.dualScope()`                          | Global home + project with separate configs | Dual-scope tests                         |
| `ProjectBuilder.withCustomSkill()`                    | Config + custom skill ID + config-types.ts  | Custom skill validation                  |
| `ProjectBuilder.pluginProject(options)`               | Config with marketplace, skills, agents     | Plugin-mode tests                        |
| `ProjectBuilder.localProjectWithMarketplace(options)` | Eject mode + marketplace in config          | Eject-to-plugin migration tests          |
| `ProjectBuilder.globalWithSubproject()`               | Global config + skill + empty subproject    | Global installation tests                |
| `ProjectBuilder.installation(dir)`                    | Minimal config.ts in existing dir           | Commands requiring existing installation |
| `createLocalSkill(projectDir, skillId, opts?)`        | Skill dir with SKILL.md + optional metadata | Add skill to existing project            |
| `writeProjectConfig(baseDir, config)`                 | `.claude-src/config.ts`                     | Override config in any project           |

**5.6 Source fixtures for wizard tests:**

| Factory                        | Creates                                                                                           | Use When                |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `createE2ESource(opts?)`       | 9 skills, 2 agents, 1 stack, templates. Optional `relationships` for slug-based resolution tests. | Eject-mode wizard tests |
| `createE2EPluginSource(opts?)` | Above + built plugins + marketplace.json. Optional `marketplaceName`, `relationships`.            | Plugin-mode tests       |

Create sources in `beforeAll` (expensive). Share across tests in a file. Each test creates its own `tempDir` with its own project for isolation.

**5.7 Create `.claude/settings.json` before interactive tests.** Without it, the permission checker renders a blocking Ink prompt after install and the PTY never exits:

```typescript
await createPermissionsFile(projectDir);
```

---

## 6. Assertions

**6.1 Use custom Vitest matchers from `e2e/matchers/project-matchers.ts`.** Import `../matchers/setup.js` in every test file. All matchers accept a `ProjectHandle` (`{ dir: string }`) via `expect()`:

| Matcher                                                         | Checks                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `toHaveConfig({ skillIds?, source?, agents? })`                 | Config.ts exists and contains expected values              |
| `toHaveCompiledAgent(name)`                                     | Agent `.md` exists with YAML frontmatter                   |
| `toHaveCompiledAgents()`                                        | At least one agent `.md` exists in agents dir              |
| `toHaveCompiledAgentContent(name, { contains?, notContains? })` | Agent content includes/excludes strings                    |
| `toHaveSkillCopied(skillId)`                                    | `SKILL.md` exists in `.claude/skills/<id>/`                |
| `toHaveLocalSkills(ids?)`                                       | Skills directory exists with optional specific IDs         |
| `toHaveNoLocalSkills()`                                         | No skill directories in `.claude/skills/`                  |
| `toHavePlugin(key)`                                             | Plugin enabled in `settings.json`                          |
| `toHavePluginInRegistry(key, scope?)`                           | Plugin in `installed_plugins.json` (optional scope filter) |
| `toHaveNoPlugins()`                                             | No enabled plugins in `settings.json`                      |
| `toHaveEjectedTemplate()`                                       | Ejected `agent.liquid` template exists                     |
| `toHaveSettings({ hasKey?, keyValue? })`                        | Settings file exists with optional key/value check         |

**6.2 Assert exit codes with named constants.** Never use bare numbers:

```typescript
expect(exitCode).toBe(EXIT_CODES.SUCCESS); // 0
expect(exitCode).toBe(EXIT_CODES.ERROR); // 1
expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS); // 2
```

**6.3 Assert output text with `toContain` or `toMatch`.** Prefer substrings over exact strings (wizard text evolves). Use `toMatch` with regex for dynamic content:

```typescript
expect(combined).toContain("Discovered 1 local skills");
expect(combined).toMatch(/Recompiled \d+ global agents/);
expect(combined).toMatch(/\d+ added/);
```

**6.4 Never assert on single characters or whitespace.** `toContain("+")` or `toContain("-")` match skill IDs, not change indicators. `toContain("G ")` matches any word starting with G. Use distinctive substrings.

**6.5 For negative assertions, verify specific absence:**

```typescript
// BAD: asserts nothing meaningful
expect(combined).not.toContain("error");

// GOOD: asserts specific skill is absent
expect(configContent).not.toContain("web-styling-tailwind");
```

**6.6 Assert file content, not just existence.** An empty or corrupted file passes `fileExists()`:

```typescript
const content = await readTestFile(agentPath);
expect(content).toMatch(/^---\n/); // YAML frontmatter
expect(content).toContain("web-framework-react"); // Expected skill reference
```

**6.7 Diff-shape assertions.** For assertions over diff-shape collections (info-panel rows, config section diffs, scope-per-skill prefix maps), use `toStrictEqual([<exact>])` on a scope-anchored slice of the output, NOT `expect.arrayContaining([<expected>])`. `arrayContaining` passes as long as the expected entries exist; it silently tolerates extra wrong entries (e.g. a spurious `- React` row alongside the expected `• React`).

If `arrayContaining` is genuinely needed (the slice isn't scope-anchorable), it MUST be paired with a matching `.not.toEqual(expect.arrayContaining([<bug-prefix>]))` negative check that pins the concrete bug shape. Same rule for `toContain`: pair every positive `toContain("+ React")` with explicit `not.toContain("- React")` / `not.toContain("~ React")` for each diff prefix that must NOT appear. When two rows render the same prefix, prove it by exhaustively negating all other prefixes rather than extracting to a parsed struct — `toContain("• React") + not.toContain("+ React") + not.toContain("- React") + not.toContain("~ React")` is strictly stronger than a parsed `{ project: "•", global: "•" }` assertion because it pins both the positive AND negative shape of the entire rendered frame. See `.ai-docs/agent-findings/2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md`.

---

## 7. Timing & Reliability

**7.1 Use named timing constants from `e2e/pages/constants.ts`.** Never inline timeout numbers:

| Constant                      | Value   | Usage                       |
| ----------------------------- | ------- | --------------------------- |
| `TIMEOUTS.WIZARD_LOAD`        | 15,000  | Wait for wizard to render   |
| `TIMEOUTS.INSTALL`            | 30,000  | Wait for installation       |
| `TIMEOUTS.EXIT`               | 10,000  | Wait for process exit       |
| `TIMEOUTS.PLUGIN_INSTALL`     | 60,000  | Plugin install timeout      |
| `TIMEOUTS.PLUGIN_TEST`        | 90,000  | Plugin operations + exit    |
| `TIMEOUTS.EXIT_WAIT`          | 30,000  | Lifecycle process exit      |
| `TIMEOUTS.SETUP`              | 60,000  | `beforeAll` hooks           |
| `TIMEOUTS.LIFECYCLE`          | 180,000 | Multi-phase lifecycle tests |
| `TIMEOUTS.EXTENDED_LIFECYCLE` | 300,000 | Long lifecycle tests        |
| `TIMEOUTS.INTERACTIVE`        | 120,000 | Interactive wizard tests    |

**Framework-internal delays** (`INTERNAL_DELAYS.STEP_TRANSITION = 500`, `INTERNAL_DELAYS.KEYSTROKE = 150`) are encapsulated in `BaseStep` methods. Tests must never import or reference `INTERNAL_DELAYS`.

**7.2 Tests should not call `delay()` directly.** All timing is encapsulated in page object methods (`BaseStep.pressEnter()`, `BaseStep.pressSpace()`, etc.). The `delay()` function in `test-utils.ts` is framework-internal -- used by `BaseStep`, `DashboardSession`, and `InteractivePrompt`. Never use raw `setTimeout` or `new Promise(r => setTimeout(r, ms))` in tests.

**7.3 Set per-test timeouts for long tests:**

```typescript
it("should complete full lifecycle", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
  // ...
});
```

**7.4 `waitForText` is CI-aware.** Default timeout is 10s locally, 20s in CI (`process.env.CI`). Always pass explicit timeouts for operations that take longer than defaults.

**7.5 Wait for specific text, not arbitrary delays.** The `waitForText` -> `delay` -> `keystroke` pattern is the core reliability mechanism (encapsulated in `BaseStep` methods for page object tests). The delay after `waitForText` is not arbitrary -- it accounts for Ink rendering remaining elements after the matched text appears.

**7.6 For process exit, use `waitForExit()`, not sleep:**

```typescript
const exitCode = await session.waitForExit(TIMEOUTS.INSTALL);
expect(exitCode).toBe(EXIT_CODES.SUCCESS);
```

---

## 8. Source & Marketplace Setup

**8.1 The E2E source contains exactly 9 skills across 3 domains:**

| Domain | Skills                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| web    | `web-framework-react`, `web-testing-vitest`, `web-state-zustand`, `web-framework-vue-composition-api`, `web-state-pinia` |
| api    | `api-framework-hono`                                                                                                     |
| meta   | `meta-methodology-research-methodology`, `meta-reviewing-reviewing`, `meta-reviewing-cli-reviewing`                      |

**8.2 The E2E source defines 1 stack** ("E2E Test Stack") mapping skills to 2 agents (`web-developer`, `api-developer`).

**8.3 `createE2ESource()` creates the full source directory** -- skills with `SKILL.md` + `metadata.yaml`, agents with `metadata.yaml` + `identity.md` + `playbook.md`, a `stacks.ts` config, and an `agent.liquid` template.

**8.4 `createE2EPluginSource()` extends the above** by running `runCLI(["build", "plugins"])` and `runCLI(["build", "marketplace", "--name", ...])` on the source. Returns `{ sourceDir, tempDir, marketplaceName, pluginsDir }`.

**8.5 Use `describe.skipIf()` for tests requiring external dependencies.** Plugin-mode tests use `describe.skipIf(!claudeAvailable)` to skip when Claude CLI is absent. Real marketplace tests use `describe.skipIf(!hasSkillsSource)` to skip when the skills repo isn't available. Do not mock external binaries -- test against the real thing and skip gracefully when unavailable:

```typescript
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin mode lifecycle", () => {
  // Tests that require the Claude CLI binary
});
```

---

## 9. Scope Testing

**9.1 Non-interactive dual-scope tests use `ProjectBuilder.dualScope()`.** Creates a fake `HOME` at `tempDir/global-home` and a project at `tempDir/project` with separate configs and pre-created skills. Interactive dual-scope lifecycle tests (e.g., `dual-scope-edit-display`) build the two-scope state through the wizard itself -- they use helper functions from `e2e/fixtures/dual-scope-helpers.ts` (`initGlobal()`, `initProject()`, `createTestEnvironment()`, `createDualScopeEnv()`) to manage multi-phase setup.

**9.2 Pass `HOME` in env for dual-scope commands:**

```typescript
const { exitCode } = await runCLI(["compile"], projectDir, {
  env: { HOME: globalHome, AGENTSINC_SOURCE: undefined },
});
```

**9.3 Lifecycle scope verification pattern:**

```typescript
// Phase 1: Init global (HOME = fakeHome, cwd = fakeHome)
// Phase 2: Init project (HOME = fakeHome, cwd = projectDir)
// Phase 3: Edit from project (HOME = fakeHome, cwd = projectDir)
// Phase 4: Verify both configs independently
await verifyConfig(globalHome, { skillIds: ["web-framework-react"] });
await verifyConfig(projectDir, { skillIds: ["api-framework-hono"] });
```

**9.4 Scope indicators in wizard output:** `"G "` prefix for global skills, `"P "` prefix for project skills. Agent scope badges: `"[G]"`, `"[P]"`.

---

## 10. Anti-Patterns

**10.1 Never import production functions to call them directly.** E2E tests spawn the CLI binary. Importing `installEject()`, `splitConfigByScope()`, or `writeScopedConfigs()` makes it a unit/integration test, not E2E. Use `e2e/pages/constants.ts` for paths (`DIRS.CLAUDE`), exit codes (`EXIT_CODES`), and text (`STEP_TEXT`) instead of importing from `src/cli/`. Acceptable imports from `src/cli/`: type-only imports (`SkillId`, `AgentName`), `isClaudeCLIAvailable` for guards, and `exec.ts` functions for smoke tests.

**10.2 Never use `as SkillId` casts on valid union members.** Strings like `"web-framework-react"` are already valid `SkillId` literals. Only cast test-only IDs (e.g., `"web-custom-e2e-widget" as SkillId`), and extract those to file-level constants with a single cast.

**10.3 Never use `mkdtemp` or `os.tmpdir()` directly.** Always use `createTempDir()` / `cleanupTempDir()`.

**10.4 Never use `readFile` from `fs/promises` directly.** Use `readTestFile()` from `test-utils.ts`.

**10.5 Never hardcode path segments.** Use constants from `e2e/pages/constants.ts`: `DIRS.CLAUDE` (not `".claude"`), `DIRS.CLAUDE_SRC` (not `".claude-src"`), `FILES.CONFIG_TS`, `FILES.SKILL_MD`, `FILES.METADATA_YAML`, `DIRS.SKILLS`.

**10.6 Never inline timeout numbers.** Use the named constants from Section 7.1.

**10.7 Never test the Claude CLI binary from E2E tests.** Testing `claude plugin install` directly is a smoke test, not E2E. Place in `smoke/` with `.smoke.test.ts` extension.

**10.8 Never skip cleanup on test failure.** Use `afterEach`/`afterAll` for cleanup in test bodies. `afterEach` runs even when tests throw. Exception: extracted helper functions in lifecycle tests (e.g., `initGlobal()`, `initProject()`) may use try/finally to destroy sessions they create and manage internally.

**10.9 Never duplicate helper logic across files.** If 3+ files share the same setup or assertion pattern, extract to `test-utils.ts`, a custom matcher in `matchers/project-matchers.ts`, or a `ProjectBuilder` method.

**10.10 Avoid hardcoding arrow-down counts for navigation.** Prefer `waitForText` to find the target content, then send keystrokes. Hardcoded counts (`for i < 7: arrowDown()`) break when list items change. In practice, some lifecycle tests (e.g., dual-scope agent step navigation) still use counted loops because the target item has no unique text to wait for -- document the assumption with a comment when this is unavoidable.

**10.11 Use `tempDir = undefined!` in cleanup blocks.** The codebase standardizes on the non-null assertion pattern `tempDir = undefined!` in `afterEach`/`afterAll` cleanup. The variable is declared as `let tempDir: string` (not `string | undefined`) and assigned in the test body before use, then reset in cleanup.

**10.12 Use `it.fails()` for known bugs.** When a test documents expected behavior that the CLI doesn't yet implement correctly, mark it with `it.fails()` instead of weakening assertions. This keeps the suite green while documenting the bug. Add a comment explaining the bug and its location:

```typescript
// BUG: CLI exits 0 with corrupt source — it falls back to default source
// instead of reporting an error for the invalid --source directory.
it.fails("should handle corrupt source without crashing", async () => {
  // ... test that would pass once the bug is fixed
  expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
});
```

When the bug is fixed, removing `it.fails()` makes the test start passing -- no assertion changes needed. Never broaden assertions to accommodate bugs.

**10.13 Never define parser/extractor helpers with non-trivial logic inside a test file.** Loops, regex scans, and state machines that pick data out of rendered output (`lastFrame()`, `getFullOutput()`) or config text belong nowhere near a test file. If a helper has non-trivial logic it would need its OWN tests to be trusted — an uninstrumented parser in a test file silently produces wrong answers when the layout changes, and it obscures the contract (the rendered substring IS the contract).

Instead: assert directly on raw output with `toContain("+ React")`, `toMatchInlineSnapshot`, or a structural load (e.g. `loadProjectConfig` for `config.ts`). If the helper is genuinely reusable across multiple test files, move it to `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own tests — never inline and untested. See `.ai-docs/agent-findings/2026-04-21-complex-helpers-in-component-tests-anti-pattern.md`.

---

## 11. Additional Exports from `test-utils.ts`

Beyond the factories documented above, `test-utils.ts` exports:

| Export                               | Purpose                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `FORKED_FROM_METADATA`               | Standard forkedFrom metadata block for plugin/uninstall tests     |
| `CLI_ROOT`                           | Absolute path to the repository root                              |
| `BIN_RUN`                            | Absolute path to `bin/run.js` (the built binary)                  |
| `ensureBinaryExists()`               | Verifies `bin/run.js` exists; throws if CLI wasn't built          |
| `stripAnsi(text)`                    | Strips ANSI escape sequences (wraps `stripVTControlCharacters`)   |
| `getEjectedTemplatePath(projectDir)` | Returns path to ejected `agent.liquid` template                   |
| `renderConfigTs(config)`             | Re-exported from content-generators -- renders a config.ts string |
| `renderSkillMd(id, desc, content?)`  | Re-exported from content-generators -- renders a SKILL.md string  |
| `renderAgentYaml(...)`               | Re-exported from content-generators -- renders agent YAML         |
| `cleanupTempDir(dir)`                | Re-exported -- removes temp directory                             |
| `directoryExists(path)`              | Re-exported -- async directory existence check                    |
| `fileExists(path)`                   | Re-exported -- async file existence check                         |

**Constants and exit codes** are now in `e2e/pages/constants.ts` (`TIMEOUTS`, `EXIT_CODES`, `DIRS`, `FILES`, `STEP_TEXT`), not in `test-utils.ts`.

---

## 12. What a Real E2E Test Must Do

A test is E2E if it:

1. Spawns the CLI binary (via `CLI.run()` for non-interactive, `InitWizard.launch()` / `EditWizard.launch()` for interactive)
2. Sends input the way a user would (command-line args, keyboard keys)
3. Asserts on what the user sees (terminal output, files on disk, exit codes)
4. Never calls production functions directly

If a test calls `installEject()`, `compileAllAgents()`, or `splitConfigByScope()` directly, it belongs in `src/cli/lib/__tests__/`, not in `e2e/`.
