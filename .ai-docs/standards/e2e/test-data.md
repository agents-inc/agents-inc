---
last_validated: 2026-04-21
---

# Test Data

How to set up the world before a test runs.

---

## ProjectBuilder Is the Only Way to Create Projects

Never inline `mkdir` + `writeFile` to build a project directory in a test file. Use `ProjectBuilder` static methods. Each returns a `ProjectHandle` (`{ dir: string }`) that matchers, `CLI.run()`, and wizards all accept.

### When to Use Each Method

| Method                                                | Returns                  | Use When                                                                                                  |
| ----------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `ProjectBuilder.minimal()`                            | `ProjectHandle`          | Compile tests. Creates config + 1 skill (`web-testing-vitest`).                                           |
| `ProjectBuilder.editable(options?)`                   | `ProjectHandle`          | Edit wizard tests. Creates config + skills + agents dir. Options: `skills`, `agents`, `domains`, `stack`. |
| `ProjectBuilder.dualScope()`                          | `DualScopeHandle`        | Dual-scope non-interactive tests. Creates `globalHome` + `project` with separate configs.                 |
| `ProjectBuilder.withCustomSkill()`                    | `ProjectHandle`          | Custom skill validation. Creates config + config-types.ts + custom skill with `custom: true`.             |
| `ProjectBuilder.pluginProject(options)`               | `ProjectHandle`          | Plugin mode tests. Creates config with marketplace source, skills, agent stubs.                           |
| `ProjectBuilder.localProjectWithMarketplace(options)` | `ProjectHandle`          | Eject mode with marketplace field in config. Skills have `source: "eject"`.                               |
| `ProjectBuilder.globalWithSubproject()`               | `{ globalHome, subDir }` | Global installation tests. Creates global config + skill + empty subproject dir.                          |
| `ProjectBuilder.installation(dir)`                    | `void`                   | Minimal install detection. Writes config.ts into existing dir. Unlike others, does not create a temp dir. |

**When 3+ tests share a setup pattern not covered by these methods, add a new `ProjectBuilder` method rather than duplicating setup logic across test files.**

---

## DRY for Setup

If you find yourself writing the same `mkdir` + `writeFile` + `writeProjectConfig` sequence in multiple test files, it belongs in `ProjectBuilder` or a fixture helper.

Signs you need a new `ProjectBuilder` method:

- 3+ files write the same directory structure
- Setup logic spans more than 5 lines

Signs you need a fixture helper (not `ProjectBuilder`):

- The setup involves running wizard interactions to reach a state
- The setup is lifecycle-specific (multi-phase with shared state)

---

## Source Fixtures

The E2E source is an expensive fixture (creates 9 skills, 2 agents, 1 stack, templates on disk). Create it once per `describe` block and share across tests.

**`createE2ESource(options?)`** -- Creates a full skills source with:

| Content   | Details                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 skills  | `web-framework-react`, `web-testing-vitest`, `web-state-zustand`, `web-framework-vue-composition-api`, `web-state-pinia`, `api-framework-hono`, 3x `meta-{methodology,reviewing}-*` |
| 3 domains | web, api, meta                                                                                                                                                                      |
| 2 agents  | web-developer, api-developer                                                                                                                                                        |
| 1 stack   | "E2E Test Stack"                                                                                                                                                                    |
| Templates | `agent.liquid` template                                                                                                                                                             |

Returns `{ sourceDir, tempDir }`. The `tempDir` is the parent -- clean it up in `afterAll`.

**`createE2EPluginSource(options?)`** -- Extends the above by building plugins and generating `marketplace.json`. Returns `{ sourceDir, tempDir, marketplaceName, pluginsDir }`.

### Before Extending Fixtures

Before adding a new skill, agent, stack, or mapping to `createE2ESource` / `createE2EPluginSource`, grep the fixture for the entity you're being asked to add. The canonical inventory (9 skills, 2 agents, 1 stack -- see the table above) is defined in `e2e/helpers/create-e2e-source.ts` and already covers most mixed-domain and multi-skill-per-agent scenarios.

- Grep/read the fixture first. If the entity (skill ID, agent name, skill-to-agent mapping) is already present, skip the extension and note it in the report.
- Only extend when genuinely absent. Redundant fixture data obscures the fixture's actual contract and confuses later readers.
- Prefer reusing existing entries (e.g. `web-state-zustand` on `web-developer`) over adding a parallel one.

See finding `2026-04-20-d217-test-prereq-already-satisfied.md` for the incident that motivated this rule.

### Source Sharing Convention

```typescript
let source: { sourceDir: string; tempDir: string };

beforeAll(async () => {
  source = await createE2ESource();
}, TIMEOUTS.SETUP);

afterAll(async () => {
  await cleanupTempDir(source.tempDir);
});

it("test 1", async () => {
  // Each test gets its own project dir but shares the source
  const wizard = await InitWizard.launch({ source });
  // ...
});
```

Only create sources inline when the test requires a unique or modified source (e.g., custom relationships).

---

## Dual-Scope Setup

**Non-interactive dual-scope tests:** Use `ProjectBuilder.dualScope()`, which returns `{ project, globalHome }`. Pass `HOME` via env to CLI commands.

**Interactive dual-scope lifecycle tests:** Use `dual-scope-helpers.ts`, which builds dual-scope state through actual wizard interactions:

| Helper                                                                    | Purpose                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createTestEnvironment()`                                                 | Creates tempDir/fakeHome/project with permissions files                       |
| `initGlobal(sourceDir, sourceTempDir, homeDir)`                           | Runs init wizard in HOME dir with defaults                                    |
| `initGlobalWithEject(sourceDir, sourceTempDir, homeDir)`                  | Like initGlobal but sets all sources to eject mode                            |
| `initProject(sourceDir, sourceTempDir, homeDir, projectDir)`              | Runs init with scope toggling (API skill + agent to project)                  |
| `initProjectAllGlobal(sourceDir, sourceTempDir, homeDir, projectDir)`     | Runs init with eject mode, all skills stay global (no scope toggling)         |
| `setupDualScope(sourceDir, sourceTempDir, fakeHome, projectDir)`          | Runs both phases and asserts success                                          |
| `setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir)` | Like setupDualScope but Phase A uses eject mode                               |
| `createDualScopeEnv(sourceDir, sourceTempDir)`                            | Creates env + runs dual-scope setup with eject, returns `DualScopeEnv`        |
| `createGlobalOnlyEnv(sourceDir, sourceTempDir)`                           | Creates env with all-global skills (no project scope), returns `DualScopeEnv` |

**Convenience wrappers:** `createDualScopeEnv` and `createGlobalOnlyEnv` combine environment creation + wizard setup + cleanup into a single call. They return a `DualScopeEnv` with `{ fakeHome, projectDir, destroy() }` -- call `destroy()` in `afterEach`/`afterAll` for automatic cleanup.

Use `createTestEnvironment` + `setupDualScope` when you need fine-grained control. Use `createDualScopeEnv`/`createGlobalOnlyEnv` for simpler test setup. Use `ProjectBuilder.dualScope()` when you only need the file structure without running the wizard.

---

## Permissions File

`createPermissionsFile(projectDir)` writes `.claude/settings.json` with default allow permissions. Without it, the Ink permission prompt blocks the PTY after install.

`InitWizard.launch()` and `EditWizard.launch()` call this internally. You only need to call it directly when:

- Using `InteractivePrompt` for non-wizard flows
- Building project state manually with `ProjectBuilder` for an interactive test
- Using the dual-scope helpers (`createTestEnvironment` handles it)

---

## Where Test Data Lives

| What                         | Location                             | Examples                                                        |
| ---------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Project directory factories  | `e2e/fixtures/project-builder.ts`    | `ProjectBuilder.minimal()`, `.editable()`                       |
| Source factories             | `e2e/helpers/create-e2e-source.ts`   | `createE2ESource()`, `createE2EPluginSource()`                  |
| Utility helpers              | `e2e/helpers/test-utils.ts`          | `createTempDir()`, `writeProjectConfig()`, `createLocalSkill()` |
| UI text and paths            | `e2e/pages/constants.ts`             | `STEP_TEXT`, `DIRS`, `FILES`, `TIMEOUTS`                        |
| Dual-scope lifecycle helpers | `e2e/fixtures/dual-scope-helpers.ts` | `setupDualScope()`, `initGlobal()`                              |
| Expected value constants     | `e2e/fixtures/expected-values.ts`    | `E2E_AGENTS`, `E2E_SKILL_IDS`                                   |
| Assertion helpers            | `e2e/assertions/`                    | `expectPhaseSuccess()`, `expectCleanUninstall()`                |
| Agent matchers               | `e2e/matchers/agent-matchers.ts`     | `toHaveAgentFrontmatter`, `toHaveAgentDynamicSkills`            |

**Never create test data in** `e2e/commands/`, `e2e/interactive/`, `e2e/lifecycle/`, or `e2e/integration/`. Those directories contain only test files.

---

## CLI.run() vs runCLI()

**`CLI.run(args, project, options?)`** is the standard for new non-interactive tests. Takes a `ProjectHandle` (or `{ dir: string }`), returns `{ exitCode, stdout, stderr, output }`. Sets `HOME` to project dir automatically. All output is ANSI-stripped.

```typescript
const { exitCode, output } = await CLI.run(["compile"], project);
```

**`runCLI(args, cwd, options?)`** still exists in `test-utils.ts` and returns `{ exitCode, stdout, stderr, combined }`. It takes a raw `cwd` string. New tests should prefer `CLI.run()`. Only `create-e2e-plugin-source.ts` still imports `runCLI` directly.

Key differences:

| Aspect                  | `CLI.run()`           | `runCLI()`                  |
| ----------------------- | --------------------- | --------------------------- |
| Input                   | `ProjectHandle`       | `string` (cwd)              |
| Output field            | `output`              | `combined`                  |
| Location                | `e2e/fixtures/cli.ts` | `e2e/helpers/test-utils.ts` |
| Preferred for new tests | Yes                   | Legacy                      |

`CLI.run()` sets `HOME=project.dir` and `AGENTSINC_SOURCE=undefined` by default. `runCLI()` sets `HOME=cwd` but does NOT set `AGENTSINC_SOURCE` -- callers must pass it via `options.env` if needed. Both strip ANSI from all output.

**Do NOT spread `process.env` into `env`.** `execa` inherits `process.env` automatically. Spreading it clobbers the `HOME` override that both `CLI.run()` and `runCLI()` set for isolation:

```typescript
// BAD: HOME override is clobbered by process.env.HOME
await CLI.run(["compile"], project, { env: { ...process.env, AGENTSINC_SOURCE: undefined } });

// GOOD: execa inherits process.env, only override what you need
await CLI.run(["compile"], project);
```

---

## Remaining Utilities in test-utils.ts

These are still exported and used in some tests. Matchers are preferred for assertions, but these exist for edge cases where no matcher covers the need:

| Export                                   | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `FORKED_FROM_METADATA`                   | Standard `forkedFrom` metadata block for plugin/uninstall tests     |
| `listFiles(dirPath)`                     | `readdir` wrapper, returns `[]` on error instead of throwing        |
| `readTestFile(filePath)`                 | `readFile(path, "utf-8")` wrapper                                   |
| `agentsPath(dir)`                        | Returns path to `.claude/agents/` in a project                      |
| `getEjectedTemplatePath(dir)`            | Returns path to ejected `agent.liquid` template                     |
| `stripAnsi(text)`                        | Strips ANSI escape sequences (rarely needed -- CLI.run pre-strips)  |
| `createLocalSkill(dir, id, opts?)`       | Creates a skill directory with SKILL.md + optional metadata.yaml    |
| `writeProjectConfig(dir, config)`        | Writes `.claude-src/config.ts` (used internally by ProjectBuilder)  |
| `createPermissionsFile(dir)`             | Writes `.claude/settings.json` with default permissions             |
| `skillsPath(dir)`                        | Returns path to `.claude/skills/` in a project                      |
| `addForkedFromMetadata(dir)`             | Writes forkedFrom metadata to default web-framework-react skill     |
| `injectMarketplaceIntoConfig(dir, name)` | Patches marketplace field into existing config.ts                   |
| `delay(ms)`                              | Framework-internal wait utility (not for use in test `it()` blocks) |
| `createE2ESource()`                      | Re-export from create-e2e-source.ts                                 |
| `ensureBinaryExists()`                   | Verifies `bin/run.js` exists, throws if not                         |
| `BIN_RUN`                                | Absolute path to `bin/run.js` binary                                |
| `CLI_ROOT`                               | Absolute path to repository root                                    |
| `renderSkillMd(id, desc, body?)`         | Re-export from content-generators.ts                                |
| `renderConfigTs(config)`                 | Re-export from content-generators.ts                                |
| `renderAgentYaml(agent)`                 | Re-export from content-generators.ts                                |
| `fileExists(path)`                       | Re-export from test-fs-utils.ts                                     |
| `directoryExists(path)`                  | Re-export from test-fs-utils.ts                                     |
| `isClaudeCLIAvailable()`                 | Re-export from exec.ts -- checks if Claude CLI binary is available  |
| `claudePluginInstall(...)`               | Re-export from exec.ts -- runs `claude plugin install`              |
| `claudePluginUninstall(...)`             | Re-export from exec.ts -- runs `claude plugin uninstall`            |
| `execCommand(cmd)`                       | Re-export from exec.ts -- general command execution                 |

---

## Related

- [test-structure.md](./test-structure.md) -- Three-phase pattern and lifecycle hooks
- [assertions.md](./assertions.md) -- How to verify outcomes after setup
- [patterns.md](./patterns.md) -- Complete examples for each test type
