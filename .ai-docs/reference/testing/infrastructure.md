---
scope: reference
area: testing
keywords:
  [vitest, test-projects, unit, integration, commands, directory-structure, config, error-handling]
related:
  - reference/testing/factories.md
  - reference/testing/mock-data.md
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-07-23
---

# Test Infrastructure

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

> **Split from:** `reference/test-infrastructure.md`. See also: [factories.md](./factories.md), [mock-data.md](./mock-data.md), [e2e-infrastructure.md](./e2e-infrastructure.md).

## Test Framework

**Runner:** Vitest
**Config:** `vitest.config.ts` (project root)

## Test Projects

Vitest is configured with 3 test projects:

| Project       | Include Pattern                                                                                            | Purpose           | Retry |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- | ----- |
| `unit`        | `src/**/*.test.{ts,tsx}`, `scripts/**/*.test.ts` (excluding integration/user-journeys/commands)            | Unit + component  | 0     |
| `integration` | `src/cli/lib/__tests__/integration/**/*.test.{ts,tsx}`, `src/cli/lib/__tests__/user-journeys/**/*.test.ts` | Integration tests | 0     |
| `commands`    | `src/cli/lib/__tests__/commands/**/*.test.ts`                                                              | CLI command tests | 1     |

## Configuration

```typescript
// vitest.config.ts
{
  globals: true,
  environment: "node",
  disableConsoleIntercept: true,    // Required for @oclif/test + ink-testing-library
  clearMocks: true,
  setupFiles: ["./vitest.setup.ts"],
  testTimeout: 10000,
  hookTimeout: 10000,
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    include: ["src/cli/**/*.ts", "src/cli/**/*.tsx"],
    exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/cli/index.ts"],
  },
}
```

### Setup File (`vitest.setup.ts`)

Runs for every test across all projects:

- **`beforeAll`:** Mocks `os.homedir()` to a per-run temp dir (`vitest-home-*`). This prevents `loadProjectConfig()`'s global fallback from hitting the developer's real `~/.claude-src/config.yaml`. Tests that explicitly override `process.env.HOME` (via `setupIsolatedHome()`) keep their override.
- **`beforeEach`:** Calls `initializeMatrix(BUILT_IN_MATRIX)` and resets the Zustand wizard store (`useWizardStore.getState().reset()`). Guarantees matrix + store isolation between tests.
- **`afterAll`:** Restores all mocks and removes the temp home dir.

## Test Directory Structure

```
src/cli/lib/__tests__/
  content-generators.ts              # Pure content renderers: renderSkillMd, renderAgentYaml, renderConfigTs
  expected-values.ts                 # Canonical expected agent/skill lists for assertions (EXPECTED_AGENTS, EXPECTED_SKILLS)
  helpers.test.ts                    # Tests for helpers themselves
  test-constants.ts                  # Keyboard constants, timing delays
  test-fixtures.ts                   # Canonical skill registry (SKILLS), test categories
  test-fs-utils.ts                   # createTempDir, cleanupTempDir, fileExists, directoryExists
  factories/                         # Object creation factories (split from former helpers.ts)
    index.ts                         # Barrel re-export of all factories
    agent-factories.ts               # createMockAgent, createMockAgentConfig, createMockCompiledAgentData
    category-factories.ts            # createMockCategory
    config-factories.ts              # buildSourceConfig, buildProjectConfig, buildWizardResult, buildAgentConfigs, etc.
    matrix-factories.ts              # createMockMatrix, createComprehensiveMatrix, createBasicMatrix, createMockMatrixConfig
    plugin-factories.ts              # createCompileContext, createMockCompileConfig, createMockMarketplace, etc.
    skill-factories.ts               # createMockSkill, createMockExtractedSkill, createMockSkillEntry, etc.
    stack-factories.ts               # createMockResolvedStack, createMockStack, createMockRawStacksConfig, etc.
  helpers/                           # Test utility functions (split from former helpers.ts)
    index.ts                         # Barrel re-export + parseTestFrontmatter
    cli-runner.ts                    # CLI_ROOT, runCliCommand
    config-io.ts                     # readTestYaml, readTestJson, readTestTsConfig, writeTestTsConfig, writeTestPackageJson
    config-comparison.ts             # normalizeGlobalConfig (order-insensitive config-text normalizer: strips projects line, sorts lines)
    config-source-sections.ts        # extractNamedSection, extractScopeSections (config.ts section extractors)
    disk-writers.ts                  # writeTestSkill, writeSourceSkill, writeTestAgent, writeSourceAgent, createImportSource, writeTestPluginManifest
    isolated-home.ts                 # setupIsolatedHome, useFakeHome (chdirs to tempDir/project, points HOME at tempDir/fakehome)
    silence-console.ts               # silenceConsole (suppresses console output during a test body)
    test-dir-setup.ts                # createTestDirs, cleanupTestDirs, PluginTestDirs type
    wizard-simulation.ts             # buildSkillConfig, buildSkillConfigs, simulateSkillSelections, buildWizardResultFromStore, extractSkillIdsFromAssignment
    config-comparison.test.ts        # Tests for normalizeGlobalConfig
    config-source-sections.test.ts   # Tests for the section extractors
    index.test.ts                    # Tests for parseTestFrontmatter
  assertions/                        # Test assertion helpers (split from former helpers.ts)
    index.ts                         # Barrel re-export of all assertions
    agent-assertions.ts              # parseCompiledAgent, expectAgentCompilation, expectValidAgentMarkdown, expectCompiledAgents
    agent-assertions.test.ts         # Tests for the agent assertion helpers
    config-assertions.ts             # expectConfigSkills, expectConfigAgents, expectFullConfig, assertConfigIntegrity, etc.
    install-assertions.ts            # expectInstallResult
  mock-data/                         # Extracted test fixtures (shared across test files)
    mock-agents.ts                   # AGENT_DEFS, agent config maps, DEFAULT_TEST_AGENTS
    mock-categories.ts               # Category definitions with domain overrides
    mock-matrices.ts                 # Pre-built matrix constants (EMPTY_MATRIX, SINGLE_REACT_MATRIX, etc.)
    mock-skills.ts                   # Skill entries, TestSkill arrays, ExtractedSkillMetadata constants
    mock-source-files.ts             # Published-source on-disk shapes (stack/metadata/categories/rules/stacks) for source-validator tests
    mock-sources.ts                  # SkillSource objects (PUBLIC_SOURCE, ACME_SOURCE, INTERNAL_SOURCE)
    mock-stacks.ts                   # Stack templates, Stack objects, TestStack arrays
  commands/                          # Command-level tests (project: "commands", retry: 1)
    build/
      marketplace.test.ts
      plugins.test.ts
    compile.test.ts
    doctor.test.ts
    edit.test.ts
    eject.test.ts
    help.test.ts
    import/skill.test.ts
    init.test.ts
    list.test.ts
    new/agent.test.ts
    new/marketplace.test.ts
    new/skill.test.ts
    search.test.ts
    uninstall.test.ts
    update.test.ts
    validate.test.ts
  fixtures/
    create-test-source.ts            # Integration test source factory
    agents/                          # Agent fixture files (_templates, web-developer, api-developer)
    commands/                        # Command fixture files (deploy.md, test.md)
    plugins/                         # Plugin fixture directories (valid-plugin, invalid-plugin-*)
    skills/                          # Skill fixture files (web-framework-react, web-testing-vitest.md)
    stacks/                          # Stack fixture files (default/)
  integration/
    compilation-pipeline.test.ts
    consumer-stacks-matrix.integration.test.ts
    import-skill.integration.test.ts
    init-end-to-end.integration.test.ts
    init-flow.integration.test.ts
    install-mode.integration.test.ts
    installation.test.ts
    source-switching.integration.test.ts
    wizard-flow.integration.test.tsx
  user-journeys/
    compile-flow.test.ts
    config-precedence.test.ts
    edit-recompile.test.ts
    install-compile.test.ts
    user-journeys.integration.test.ts
```

Note: There is NO `test/fixtures/` directory at the project root. All fixtures are in `src/cli/lib/__tests__/fixtures/`. The `fixtures/` subdirectory does NOT contain `configs/` or `matrix/` subdirectories.

Script tests (included in `unit` project via `scripts/**/*.test.ts`):

```
scripts/generate-source-types.test.ts  # Tests for the union type code generator
```

Co-located unit tests (next to source files):

```
src/cli/lib/agents/agent-fetcher.test.ts
src/cli/lib/agents/agent-plugin-compiler.test.ts
src/cli/lib/agents/agent-recompiler.test.ts
src/cli/lib/compiler.test.ts
src/cli/lib/configuration/__tests__/config-loader.test.ts
src/cli/lib/configuration/__tests__/config-round-trip.test.ts
src/cli/lib/configuration/__tests__/config-types-writer.test.ts
src/cli/lib/configuration/__tests__/config-writer.test.ts
src/cli/lib/configuration/__tests__/default-categories.test.ts
src/cli/lib/configuration/__tests__/default-rules.test.ts
src/cli/lib/configuration/__tests__/default-stacks.test.ts
src/cli/lib/configuration/__tests__/define-config.test.ts
src/cli/lib/configuration/config.test.ts
src/cli/lib/configuration/config-generator.test.ts
src/cli/lib/configuration/config-merger.test.ts
src/cli/lib/configuration/config-saver.test.ts
src/cli/lib/configuration/project-config.test.ts
src/cli/lib/configuration/source-manager.test.ts
src/cli/lib/installation/installation.test.ts
src/cli/lib/installation/local-installer.test.ts
src/cli/lib/installation/mode-migrator.test.ts
src/cli/lib/loading/loader.test.ts
src/cli/lib/loading/multi-source-loader.test.ts
src/cli/lib/loading/source-fetcher.test.ts
src/cli/lib/loading/source-fetcher-refresh.test.ts
src/cli/lib/loading/source-loader.test.ts
src/cli/lib/marketplace-generator.test.ts
src/cli/lib/matrix/matrix-health-check.test.ts
src/cli/lib/matrix/matrix-loader.test.ts
src/cli/lib/matrix/matrix-provider.test.ts
src/cli/lib/matrix/matrix-resolver.test.ts
src/cli/lib/matrix/skill-resolution.integration.test.ts
src/cli/lib/matrix/skill-resolution.test.ts
src/cli/lib/operations/project/compile-agents.test.ts
src/cli/lib/operations/project/detect-project.test.ts
src/cli/lib/operations/project/load-agent-defs.test.ts
src/cli/lib/operations/project/write-project-config.test.ts
src/cli/lib/operations/skills/compare-skills.test.ts
src/cli/lib/operations/skills/copy-local-skills.test.ts
src/cli/lib/operations/skills/install-plugin-skills.test.ts
src/cli/lib/operations/skills/uninstall-plugin-skills.test.ts
src/cli/lib/operations/source/ensure-marketplace.test.ts
src/cli/lib/operations/source/load-source.test.ts
src/cli/lib/output-validator.test.ts
src/cli/lib/plugins/plugin-discovery.test.ts
src/cli/lib/plugins/plugin-finder.test.ts
src/cli/lib/plugins/plugin-info.test.ts
src/cli/lib/plugins/plugin-manifest.test.ts
src/cli/lib/plugins/plugin-manifest-finder.test.ts
src/cli/lib/plugins/plugin-settings.test.ts
src/cli/lib/plugins/plugin-validator.test.ts
src/cli/lib/resolver.test.ts
src/cli/lib/schemas.test.ts
src/cli/lib/skills/local-skill-loader.test.ts
src/cli/lib/skills/skill-copier.test.ts
src/cli/lib/skills/skill-fetcher.test.ts
src/cli/lib/skills/skill-metadata.test.ts
src/cli/lib/skills/skill-plugin-compiler.test.ts
src/cli/lib/skills/source-switcher.test.ts
src/cli/lib/source-validator.test.ts
src/cli/lib/stacks/stack-installer.test.ts
src/cli/lib/stacks/stack-plugin-compiler.test.ts
src/cli/lib/stacks/stacks-loader.test.ts
src/cli/lib/versioning.test.ts
src/cli/lib/wizard/build-step-logic.test.ts
src/cli/stores/wizard-store.test.ts
src/cli/stores/d227-same-scope-tombstone-duplicate.test.ts
src/cli/utils/errors.test.ts
src/cli/utils/exec.test.ts
src/cli/utils/frontmatter.test.ts
src/cli/utils/fs.test.ts
src/cli/utils/logger.test.ts
src/cli/utils/messages.test.ts
src/cli/utils/typed-object.test.ts
```

Component tests:

```
src/cli/components/common/confirm.test.tsx
src/cli/components/hooks/use-section-scroll.test.ts
src/cli/components/hooks/use-terminal-dimensions.test.ts
src/cli/components/wizard/category-grid.test.tsx
src/cli/components/wizard/checkbox-grid.test.tsx
src/cli/components/wizard/hotkeys.test.ts
src/cli/components/wizard/search-modal.test.tsx
src/cli/components/wizard/source-grid.test.tsx
src/cli/components/wizard/step-agents.test.tsx
src/cli/components/wizard/step-build.test.tsx
src/cli/components/wizard/step-confirm.test.tsx
src/cli/components/wizard/step-settings.test.tsx
src/cli/components/wizard/step-sources.test.tsx
src/cli/components/wizard/step-stack.test.tsx
src/cli/components/wizard/utils.test.ts
src/cli/components/wizard/wizard-tabs.test.tsx
```

## Code Patterns

### Temp Directory Management

```typescript
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils.js";

let tempDir: string;
beforeEach(async () => {
  tempDir = await createTempDir();
});
afterEach(async () => {
  await cleanupTempDir(tempDir);
});
```

### CLI Command Runner

```typescript
import { runCliCommand } from "../__tests__/helpers/index.js";

const result = await runCliCommand(["compile", "--verbose"]);
// result.stdout, result.stderr, result.error
```

Intercepts both `process.stdout.write` (Node.js) and `console.log` (Bun) for cross-runtime compatibility.

### Isolated Home + Project Directory

Required for any command test that reads `os.homedir()` or `~/.claude*` paths. Without it, tests silently depend on the developer's real home directory.

```typescript
import { setupIsolatedHome, type IsolatedHome } from "../__tests__/helpers/index.js";

let env: IsolatedHome;
beforeEach(async () => {
  env = await setupIsolatedHome("my-test-");
  // env.projectDir is now cwd; process.env.HOME = env.fakeHome
});
afterEach(async () => {
  await env.cleanup(); // Restores cwd + HOME, removes tempDir
});
```

`setupIsolatedHome(prefix)` returns `{ tempDir, projectDir, fakeHome, cleanup }`. It creates a temp dir, `chdir`s to `<tempDir>/project`, and sets `process.env.HOME` to `<tempDir>/fakehome`. The global `os.homedir()` mock in `vitest.setup.ts` respects this override.

**Isolation mechanism — `process.env.HOME` vs `os.homedir()`:** `setupIsolatedHome` and `useFakeHome` isolate production code that reads the home directory via `process.env.HOME`. They do NOT isolate code that calls `os.homedir()` — that path reads the OS-level home and ignores `process.env.HOME`. `os.homedir()` callers are covered instead by the global spy in `vitest.setup.ts` (`vi.spyOn(os, "homedir")`), which returns the per-run test home dir UNLESS a test has pointed `process.env.HOME` at a value other than the real home (then it echoes that value). The two mechanisms are NOT interchangeable: a test asserting on `os.homedir()`-based resolution that must diverge from `process.env.HOME` needs its own `vi.spyOn(os, "homedir")`.

### Fake Home Hook (`useFakeHome`)

Hook-registering sibling of `setupIsolatedHome` (both in `src/cli/lib/__tests__/helpers/isolated-home.ts`). Unlike `setupIsolatedHome`, it does NOT `chdir` or create a `projectDir` — it only manages `process.env.HOME`.

Signature: `useFakeHome(getTempDir: () => string, options?: { setHome?: boolean }): { readonly dir: string }`.

- Registers a `beforeEach` that points `process.env.HOME` at `<tempDir>/fake-home` (created fresh per test) and an `afterEach` that restores the original HOME — or unsets it when it was originally undefined.
- `getTempDir` — lazy accessor for the owning temp dir. Evaluated inside `beforeEach`, so it can reference a `let` assigned by an outer hook.
- `options.setHome` — defaults to `true`. Pass `setHome: false` when the test itself decides when to point HOME at the fake home: the hook still creates the dir and exposes `.dir`, but leaves `process.env.HOME` untouched until the test sets it.
- Returns a live view `{ readonly dir }` of the fake home directory (getter, so `.dir` reflects the per-test path).

### Console Silencing (`silenceConsole`)

`silenceConsole(methods?)` in `src/cli/lib/__tests__/helpers/silence-console.ts`. Call once at the top of a describe block.

Signature: `silenceConsole(methods: ConsoleMethod[] = ["log", "warn", "error"]): Partial<Record<ConsoleMethod, MockInstance>>` where `ConsoleMethod = "log" | "warn" | "error" | "info" | "debug"`.

- Registers a `beforeEach` that replaces each requested console method with a no-op `vi.spyOn` spy and an `afterEach` that restores them via `mockRestore`. It only restores the spies it created — it does NOT call `vi.restoreAllMocks()`, so unrelated spies survive.
- `methods` — which console methods to silence. Defaults to `["log", "warn", "error"]`; `"info"` / `"debug"` are opt-in.
- Returns a live spy map. Only the requested methods get an entry (the rest stay `undefined`). Because entries are populated in `beforeEach`, read them (e.g. `spies.log?.mock.calls`) inside test bodies, not at module scope.

## Test Constants (`src/cli/lib/__tests__/test-constants.ts`)

### Keyboard Escape Sequences

| Constant      | Value    | Purpose         |
| ------------- | -------- | --------------- |
| `ARROW_UP`    | `\x1B[A` | Up arrow key    |
| `ARROW_DOWN`  | `\x1B[B` | Down arrow key  |
| `ARROW_LEFT`  | `\x1B[D` | Left arrow key  |
| `ARROW_RIGHT` | `\x1B[C` | Right arrow key |
| `ENTER`       | `\r`     | Enter key       |
| `ESCAPE`      | `\x1B`   | Escape key      |
| `CTRL_C`      | `\x03`   | Ctrl+C          |
| `TAB`         | `\t`     | Tab key         |
| `SPACE`       | `" "`    | Space key       |
| `BACKSPACE`   | `\x7F`   | Backspace key   |
| `KEY_Y`       | `"y"`    | Y key (confirm) |
| `KEY_N`       | `"n"`    | N key (reject)  |

### Timing Constants

| Constant                   | Value (ms) | Purpose               |
| -------------------------- | ---------- | --------------------- |
| `INPUT_DELAY_MS`           | 50         | Between keystrokes    |
| `RENDER_DELAY_MS`          | 100        | After render          |
| `SELECT_NAV_DELAY_MS`      | 100        | After navigation      |
| `CONFIRM_INPUT_DELAY_MS`   | 100        | After confirm input   |
| `OPERATION_DELAY_MS`       | 150        | After async operation |
| `STEP_TRANSITION_DELAY_MS` | 150        | Between wizard steps  |

### Utility

| Export            | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `delay(ms)`       | Promise-based delay helper for test timing        |
| `TEST_SOURCE_URL` | Canonical source URL (`github:agents-inc/skills`) |

## Error Handling in Tests

All `try/catch/finally` blocks have been removed from unit and integration test files. The standard patterns are:

- **Cleanup:** Lifted to `afterEach` hooks (runs even on test failure)
- **Expected rejections:** `await expect(fn()).rejects.toThrow("message")`
- **Fire-and-forget with expected errors:** `await Command.run(args).catch(() => {})`
- **No `try/finally` for cleanup in test bodies** -- `afterEach` is sufficient

This applies to unit and integration test files across `src/cli/` and `scripts/` (~127 test files total). Two command tests retain a local `try` block for deliberate error-path handling: `commands/edit.test.ts` (captures a thrown oclif `CLIError` to assert on `oclif.exit` and message) and `commands/search.test.ts`.

### Config Section Extractors

Two shared helpers in `src/cli/lib/__tests__/helpers/config-source-sections.ts` for asserting on generated config sections (previously file-local in `config-writer.test.ts`, now extracted and exported; imported directly, not via the `helpers/index.ts` barrel):

- `extractNamedSection(source, name)` -- Extracts a named `const` block (`"skills" | "agents" | "stack"`) from generated config source
- `extractScopeSections(section)` -- Splits a section into `{ global, project }` parts using `// global` / `// project` comment markers

Used by `src/cli/lib/configuration/__tests__/config-writer.test.ts`. A separate order-INSENSITIVE normalizer, `normalizeGlobalConfig()` in `helpers/config-comparison.ts` (strips the `"projects"` line and sorts the remaining lines), is exported via the barrel for config-text comparison.

## Test Anti-Patterns (From CLAUDE.md)

- NEVER construct test data inline (configs, matrices, skills, stacks, agents)
- NEVER use raw `writeFile` for skill/agent test data
- NEVER inline `SkillsMatrixConfig` or `MergedSkillsMatrix` construction
- NEVER create alias/mapping hacks to paper over wrong test data
- NEVER put TODO/task IDs in test describe blocks
- NEVER use raw `mkdtemp`/`rm` -- use `createTempDir()`/`cleanupTempDir()`
- NEVER use `try/catch/finally` in test bodies -- use `afterEach` for cleanup, `.catch(() => {})` or `rejects.toThrow()` for errors
