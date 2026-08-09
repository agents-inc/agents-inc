---
scope: reference
area: testing
keywords:
  [
    vitest,
    test-projects,
    unit,
    integration,
    commands,
    directory-structure,
    config,
    error-handling,
    ink-testing-library,
    ink-upgrade,
    keypress-behaviour,
  ]
related:
  - reference/testing/factories.md
  - reference/testing/mock-data.md
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-07-30
---

# Test Infrastructure

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

### The `commands` project executes `dist/`, not `src/`

`unit` and `integration` import `src/` directly. **`commands` does not.** Its helper
`runCliCommand` (`src/cli/lib/__tests__/helpers/cli-runner.ts`) calls oclif's
`run(args, { root: CLI_ROOT })`, and oclif resolves that root through `package.json`'s
`oclif.commands.target`, which is `"./dist/commands"`. Every spec in this project therefore runs
**the last build**.

**A commands-project result is a statement about the last build.** Since CLI-457 you no longer have
to remember that, because two layers enforce it:

| Layer                                         | Covers                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pretest` in `package.json` (`bun run build`) | `bun run test` and `npm test` — mirrors the long-standing `pretest:e2e`                                                                                                                                                                                                                                            |
| `globalSetup` -> `vitest.global-setup.ts`     | Every invocation, `npx vitest run <file>` included. Calls `assertDistIsFresh` (`src/cli/lib/testing/dist-staleness.ts`), which compares the newest mtime under each tree compiled into `dist/` (build inputs only) against the newest in `dist/` and **throws before any spec is collected** when `dist/` is older |

The guard **refuses; it does not rebuild** — a direct `vitest run` stays fast and stays something
you asked for. Its message names the fix (`bun run build`). It ignores `*.test.ts(x)`, `__tests__/`
and `__mocks__/` — the same negations `tsup.config.ts` and `turbo.json` use — so editing or adding a
spec never trips it, and it globs directories as well as files because a **deleted** source file
leaves nothing to stat: only its parent directory's mtime moves.

**Two trees, not one** (CLI-458). `BUILD_INPUT_TREES` names `packages/cli/src` and
`packages/matrix/src`, because tsup inlines `@workspace/matrix` into the bundle (`noExternal`) —
matrix source is compiled into this package's `dist/` exactly as `src/` is, and matrix has no build
output of its own to go stale instead. Before that, touching a matrix file and running
`npx vitest run` on a commands spec was a **false green**: 18 tests passed against a `dist/` older
than every matrix source file. The message names whichever tree moved and, for matrix, why it
counts. Cost of the second tree: 28 entries, **+0.3 ms** median on a ~25 ms scan (the two trees are
scanned in parallel; matrix alone measures 0.5 ms). Two behaviours worth knowing: a **deleted**
matrix source trips it (the parent directory's mtime moves), and **editing** a matrix spec does not
— but **adding or deleting** one does, because matrix keeps its specs beside the code rather than in
`__tests__/`, so the bare-directory ignores that absorb this under `packages/cli/src` have nothing
to match there. That is a refusal you did not need, never a green you should not have had.

A third tree is not needed for `turbo test`: turbo already hashes matrix into the CLI's build task
even though matrix has no `build` script — see
[build-and-packaging.md](../build-and-packaging.md#what-turbo-hashes-as-build-input).

Both failure directions were live before that, and both are what the layers exist to stop:

| Direction   | What you see                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| False RED   | A source change the build has not picked up. During the CLI-404 removal, deleting `recommends` from `relationshipDefinitionsSchema` left 25 specs failing on `Config validation failed … relationships.recommends: Invalid input` — correct fixtures, correct source, stale `dist/` schema. A rebuild turned all 25 green with no other change. |
| False GREEN | The quieter one. A breaking source change can leave these specs passing against stale `dist/` until CI's build step surfaces it.                                                                                                                                                                                                                |

Reading a commands-project failure as "my change broke this" before checking the build date is the
first wrong turn. Source:
`agent-findings/2026-08-06-commands-project-tests-execute-stale-dist-until-rebuild.md`.

## Configuration

```typescript
// vitest.config.ts
{
  globals: true,
  environment: "node",
  disableConsoleIntercept: true,    // Required for @oclif/test + ink-testing-library
  clearMocks: true,
  setupFiles: ["./vitest.setup.ts"],
  globalSetup: ["./vitest.global-setup.ts"],  // Calls assertDistIsFresh: refuses the run when dist/ predates src/ or matrix/src/
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

- **Module scope, before any hook:** `delete process.env.CI` and `delete process.env.GITHUB_ACTIONS`. **Unit-test rendering is CI-independent by construction, and this is what makes it so.** Ink consults those variables (through `is-in-ci`) to decide when frames are written and what unmount appends, so the same component test read differently locally and on a runner and grew per-test workarounds. The deletion is at module scope rather than in a hook because `is-in-ci` reads the environment **once, at import** — a `beforeEach` would run too late. Nothing under `src/` reads either variable itself. The E2E harness is the deliberate opposite: it passes both through, so every CI run proves the CLI trusts a real terminal over the CI guess (see [`harness-decisions.md`](./harness-decisions.md) and [`commands/index.md`](../commands/index.md)).
- **`beforeAll`:** Mocks `os.homedir()` to a per-run temp dir (`vitest-home-*`). This prevents `loadProjectConfig()`'s global fallback from hitting the developer's real `~/.claude-src/config.yaml`. Tests that explicitly override `process.env.HOME` (via `setupIsolatedHome()`) keep their override.
- **`beforeEach`:** Calls `initializeMatrix(BUILT_IN_MATRIX)` and resets the Zustand wizard store (`useWizardStore.getState().reset()`). Guarantees matrix + store isolation between tests.
- **`afterAll`:** Restores all mocks and removes the temp home dir.

### Global Setup File (`vitest.global-setup.ts`) and `dist-staleness.ts`

Runs **once per run**, before any spec is collected, and does one thing: throws when `dist/` is
older than a tree compiled into it (`packages/cli/src` or `packages/matrix/src`). It also throws
when one of those trees scans to nothing, because an empty scan and an unchanged one are
indistinguishable — a package that moved would take its tree out of the comparison silently, which
is the exact failure this guard exists to prevent. It is the un-bypassable half of the freshness
rule described under
[The `commands` project executes `dist/`](#the-commands-project-executes-dist-not-src) above — read
that section for what it ignores and why it refuses instead of rebuilding. Rule
[6.19](../../standards/clean-code-standards.md) is the standard it enforces.

**It is two files, and which half is where is the point** (CLI-460). The scan, the comparison, the
`BUILD_INPUT_TREES` list and every message live in `src/cli/lib/testing/dist-staleness.ts`, whose
sole export is `assertDistIsFresh(cliRoot)`. `vitest.global-setup.ts` holds three statements: it
resolves its own directory as the CLI package root, exports `setup`, and calls that function.
Package-root files sit in no tsconfig of this package (`tsconfig.json` includes `src/**/*` only) and
match no `files` block in `eslint.config.js` — `npx eslint vitest.global-setup.ts` still reports
_"File ignored because no matching configuration was supplied"_ — so for as long as the logic lived
there, the one file whose job is to stop a meaningless green was type-checked and linted by nothing
(finding `2026-08-09-the-guard-that-polices-every-suite-is-checked-by-no-tsc-program-and-no-eslint-config.md`).
Under `src/` it is inside `tsc --noEmit`, inside `eslint .` including the type-aware layer, and
covered by `dist-staleness.test.ts` beside it — which drives the real refusals over a fixture tree
laid out like the repository (`<root>/packages/cli` and `<root>/packages/matrix/src`), so the
relative matrix hop is asserted rather than assumed.

Two consequences worth knowing. The module stays **dependency-free beyond node builtins and
fast-glob**: `globalSetup` is transpiled and evaluated before dist freshness is known, and a module
graph reaching back into the CLI would grow the guard's cost with the code it guards — the `.js`
specifier in the hook resolves to the `.ts` source through Vitest's own transform, no build
involved. And the module is itself inside the tree it scans, so **editing the guard asks for a
rebuild** before the suite will run. tsup never compiles it (no entry reaches it, so it ships
nothing), which makes that refusal one you did not need rather than a green you should not have
had — the same trade the matrix-spec caveat above describes.

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
    disk-writers.ts                  # writeTestSkill, writeSourceSkill, writeTestAgent, writeSourceAgent, createImportSource, writeTestInstalledPluginsRegistry, writeTestPluginManifest
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
    doctor-content.test.ts
    edit.test.ts
    eject.test.ts
    help.test.ts
    init.test.ts
    init-edit-validation-parity.test.ts
    init-from-plugin-install.test.ts
    list.test.ts
    search.test.ts
    uninstall.test.ts
    update.test.ts
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
    install-mode.integration.test.ts
    install-mode-round-trip.integration.test.ts
    installation.test.ts
    stack-agent-roster.integration.test.ts
    wizard-flow.integration.test.tsx
  user-journeys/
    config-precedence.test.ts
    edit-recompile.test.ts
```

Note: There is NO `test/fixtures/` directory at the project root. All fixtures are in `src/cli/lib/__tests__/fixtures/`. The `fixtures/` subdirectory does NOT contain `configs/` or `matrix/` subdirectories.

Script tests (included in `unit` project via `scripts/**/*.test.ts`):

```
scripts/generate-source-types.test.ts  # Tests for the union type code generator
```

Test surface for both generators — 34 cases here, **zero** for `scripts/generate-json-schemas.ts`, and why the latter cannot currently have one: [features/code-generation.md](../features/code-generation.md).

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
src/cli/lib/configuration/project-config.test.ts
src/cli/lib/installation/installation.test.ts
src/cli/lib/installation/local-installer.test.ts
src/cli/lib/installation/mode-migrator.test.ts
src/cli/lib/loading/loader.test.ts
src/cli/lib/loading/multi-source-loader.test.ts
src/cli/lib/loading/source-fetcher.test.ts
src/cli/lib/loading/source-fetcher-revalidation.test.ts
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
src/cli/lib/operations/skills/copy-local-skills.test.ts
src/cli/lib/operations/skills/install-plugin-skills.test.ts
src/cli/lib/operations/skills/uninstall-plugin-skills.test.ts
src/cli/lib/operations/source/ensure-marketplace.test.ts
src/cli/lib/operations/source/load-source.test.ts
src/cli/lib/output-validator.test.ts
src/cli/lib/permission-checker.test.tsx
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
src/cli/lib/skills/local-skill-mover.test.ts
src/cli/lib/source-validator.test.ts
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
src/cli/components/wizard/source-grid.test.tsx
src/cli/components/wizard/step-agents.test.tsx
src/cli/components/wizard/step-build.test.tsx
src/cli/components/wizard/step-confirm.test.tsx
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

### Asserting Colour in Ink Component Tests

Ink component tests see **no ANSI at all** by default. Ink colourises through `chalk` (`ink/build/colorize.js` calls `chalk.hex` / `chalk.bgHex`), and chalk auto-disables on vitest's non-TTY stdout — so `<Text color="#90EE90" backgroundColor="#383838">hello</Text>` renders as `lastFrame() === "hello"`, every escape sequence stripped. A colour assertion that "fails" for this reason is a **harness gap, not a product bug**; never downgrade it to a text-only assertion.

The enabling pattern (see `src/cli/components/wizard/source-grid.test.tsx`, which is the only place in the repo that asserts colour):

- Declare a `TRUECOLOR_CHALK_LEVEL = 3` constant. In `beforeEach` save `chalk.level` and set it to truecolor; in `afterEach` restore the saved value. Chalk 5 resolves the level per call, so a runtime mutation is sufficient — no import-time `FORCE_COLOR` plumbing.
- **Do NOT set it globally in `vitest.setup.ts`.** Every existing frame assertion would then have to cope with interleaved escape sequences. Keep the mutation scoped to the describe block that needs it.
- Build the expected string with `chalk.hex(...)` / `chalk.bgHex(...)` over the `CLI_COLORS.*` constant, never a literal `\x1b[38;2;R;G;Bm` sequence. Ink applies the foreground first and the background outermost, so a `<Text color bg>` renders as `bgHex(hex(text))`. This keeps the assertion a plain `toContain` on the frame (per CLAUDE.md: never split/loop/regex-scan `lastFrame()`) and survives a palette change in `consts.ts` without editing.
- Assert both shapes: the positive (label carries the expected colour) AND the negative (label does not fall back to `CLI_COLORS.WHITE`), so a fix that drops the focus background instead of fixing the colour cannot pass.

**Colour is testable only at this layer.** The E2E harness runs with `NO_COLOR`, so every E2E spec asserts the marker, not the colour. Any contract phrased as "these two surfaces render the same colour" (e.g. `rowLabelColor` in `source-grid.tsx` vs `DIFF_COLOR` in `skill-agent-summary.tsx`) needs a component test — an E2E marker assertion does not cover it. See `.ai-docs/agent-findings/2026-07-29-ink-component-colour-assertions-need-forced-chalk-level.md`.

### `ink-testing-library` looks abandoned and is not — it is 95 lines over Ink's public API

Roughly 20 component test files read their screens back through `ink-testing-library`. It was last
published in 2024, at version 4.0.0, against Ink 5 — which looks alarming for something that much of
the suite depends on, and periodically prompts someone to propose replacing it.

It touches **no Ink internals at all.** Its whole build is 95 lines and imports exactly two things:
`EventEmitter` from `node:events`, and `render` from `ink` — the same public entry point production
code calls. What it adds is a fake terminal to render into. Everything it hands back (`rerender`,
`unmount`, `cleanup`, and the `stdout` / `stderr` / `stdin` / `debug` / `exitOnCtrlC` /
`patchConsole` options it passes) is public Ink surface.

That is why the Ink 5 → 7 jump needed **no test rewrites at all** despite being a
two-major move. Verify the same way before worrying about it again: read
`node_modules/ink-testing-library/build/index.js` and check what it imports. A dependency's
publication date says nothing about its exposure; its import list does.

### Do not reason about a key from release notes — write the key and print what arrives

Ink 7 changed two things about keyboard input, and both were checked by experiment rather than by
reading. The experiment is the cheap one: render the component through `ink-testing-library`, write
the raw escape sequence to its `stdin` stub, and print the `input` string and `key` object the
handler actually received.

Both changes turned out to need no code fix, and in both cases the release note alone would have
suggested otherwise:

| Change                                                    | What the note implies                                                                                                                 | What arrived                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Escape no longer reports itself as a meta keypress        | the wizard's text-input handling decided a keypress was a real character partly from the meta flag, so a text field might type Escape | Escape arrives with an **empty** `input` string, so the field's emptiness guard rejects it before the meta flag is consulted. A field holding `ab` still held `ab`, then took `z` normally |
| Backspace now reports as `backspace` rather than `delete` | Handlers reading `key.delete` for backspace break                                                                                     | Harmless — both places that read it already accept either                                                                                                                                  |

**A behaviour claim about a keypress is testable in about ten lines, and a wrong guess about one
costs a debugging session.** `src/cli/lib/__tests__/test-constants.ts` already holds the escape
sequences (`ESCAPE`, `BACKSPACE`, `ARROW_*`) to write with.

### `render()` returns before effects flush

`ink-testing-library`'s `render()` returns before the concurrent root has flushed effects. A test that mutates the stdout stub and emits an event on the next line emits into a stdout **nothing is subscribed to yet** — the `useEffect` that registers the listener has not run.

The frame simply never changes, so the test reads as "the feature does not work". Without knowing why, the natural next move is to mock the hook — which throws away the only coverage of the subscription itself.

**Any component test that interacts with the stdout stub — resize, or a keypress on a hook-registered handler — must await one render tick first.** `src/cli/components/wizard/wizard-layout.test.tsx` is the canonical shape: a `mountLayout()` helper that renders and then `await delay(RENDER_DELAY_MS)` before returning the instance, with the reason in its doc comment.

```tsx
const mountLayout = async (logo?: string) => {
  const instance = render(
    <WizardLayout version={VERSION} logo={logo}>
      <Text>{CHILD_MARKER}</Text>
    </WizardLayout>,
  );
  await delay(RENDER_DELAY_MS);
  return instance;
};
```

`RENDER_DELAY_MS` and `delay` come from `src/cli/lib/__tests__/test-constants.ts`. **A frame that never changes after an interaction is this bug before it is a product bug.** See `.ai-docs/agent-findings/2026-07-31-getscreen-is-not-viewport-only-so-absence-assertions-are-unsound.md` § 3.

### Under Ink 7 the teardown frame is unconditional — read `frames`, not `lastFrame()`

When an error boundary exits, Ink 7 appends a `"\n"` frame on teardown **every time**. Ink 5 did this only when `CI` was set, which is exactly why the same assertion read differently on a runner. With the setup file now deleting `CI` (above), the variable can no longer paper over it either way.

The consequence for a test: `lastFrame()` after such an exit returns the blank teardown frame, not the painted one. **Assert against `frames.join("\n")`.** `src/cli/components/wizard/summary-panel.test.tsx` is the worked example and carries the reason inline — the assertion lands on the painted frames, not on a rejected `render()`, and joining reads the painted frame wherever in the sequence it lands.

### A regenerated snapshot is a proposal, not a result

`vitest -u` writes whatever the component currently renders, so a regenerated snapshot **agrees with the code by construction**. Its only value is at review time, and for a fixed-width column layout the diff a reviewer sees is a wall of aligned spaces that reads as noise unless somebody counts columns.

This is not theoretical. Both column-geometry snapshots in `src/cli/components/wizard/source-grid.test.tsx` were regenerated with `-u` when the Sources grid's scope gutter was removed, both came back green, and both encoded a layout the owner had not asked for. Nothing else caught it: `tsc`, ESLint, Prettier, 57 unit tests and every E2E spec touching the Sources grid were green against the wrong layout. **Geometry has no other gate.**

**Before committing a regenerated column-geometry snapshot, derive the intended column starts from the component's own width constants and check them against the emitted frame by index.** For `source-grid.tsx` those are `SCOPE_COL_WIDTH` (11), `SKILL_NAME_WIDTH` (26, widened from 24 by exactly the two-column marker width), and `SOURCE_COL_WIDTH` (18), plus a 2-column chevron prefix:

| Column        | Expected start (grouped / flat) | Emitted           |
| ------------- | ------------------------------- | ----------------- |
| scope gutter  | 0 / absent                      | `Global` at 0     |
| skill name    | 11 / 0                          | 13 (2-col marker) |
| `Local` cell  | 37 / 26                         | caption+value 39  |
| `Plugin` cell | 55 / 44                         | caption+value 57  |

The flat branch must be the grouped one shifted left by exactly `SCOPE_COL_WIDTH`. State the derivation in the test's JSDoc so the next reader can re-check it without re-deriving it.

> **Cross-ownership note.** The prescriptive form of this rule is **rule 6.17a in `.ai-docs/standards/clean-code-standards.md`**, which requires a whole-frame `toMatchInlineSnapshot()` per layout branch but stops short of requiring that a regenerated one be _read_. That file is owned by convention-keeper, not codex-keeper, so the extension is **proposed, not applied** — recorded here (in a codex-keeper file) so the gap is not lost. The suggestion that introduced 6.17a named this exact risk (_"a reviewer who rubber-stamps snapshot updates gets nothing"_) and shipped without an obligation closing it; the failure occurred one day later, on the very component the rule was written for. See `.ai-docs/agent-findings/2026-07-31-column-geometry-snapshots-regenerated-never-verified.md`.

**E2E specs use no snapshots at all** (zero `toMatchSnapshot` / `toMatchInlineSnapshot` occurrences under `e2e/`), so this rule is component-test territory only.

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
