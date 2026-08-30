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
last_validated: 2026-08-18
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

**A commands-project result is a statement about the last build.** You no longer have
to remember that, because two layers enforce it:

| Layer                                     | Covers                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `globalSetup` -> `vitest.global-setup.ts` | Every invocation, `npx vitest run <file>` included. Calls `assertDistIsFresh` (`src/cli/lib/testing/dist-staleness.ts`), which compares the newest mtime under each tree compiled into `dist/` (build inputs only) against the newest in `dist/` and **throws before any spec is collected** when `dist/` is older |

The guard **refuses; it does not rebuild** — a direct `vitest run` stays fast and stays something
you asked for. Its message names the fix (`bun run build`). It ignores `*.test.ts(x)`, `__tests__/`
and `__mocks__/` — the same negations `tsup.config.ts` and `turbo.json` use — and it globs
directories as well as files because a **deleted** source file leaves nothing to stat: only its
parent directory's mtime moves.

That glob is why the ignore list is read a second time, as a pattern list rather than as an ignore
list. Every entry that arrives or leaves moves the one mtime a directory has, and an ordinary
editor SAVE is one of them — mainstream editors write the new contents beside the original and
rename over it. So a directory holding something ignored that has ITSELF moved since the build has
an account of its mtime the build does not care about, and `directoriesAnIgnoredChangeAccountsFor`
drops that directory out of the comparison. **That is what makes editing or adding a spec never
trip it**, in either tree.

**What that gives up, exactly:** a build input **deleted** from a directory where a spec, a
`__tests__` or a `__mocks__` entry was **also** written since the build. Those two events leave one
reading between them and nothing in it says which of them moved it. Nothing else is given up — a
build input added or edited carries an mtime of its own and still refuses, and a deletion from a
directory whose ignored entries all predate the build is still the only account of that directory's
mtime there is.

**Two trees, not one.** `BUILD_INPUT_TREES` names `packages/cli/src` and
`packages/matrix/src`, because tsup inlines `@workspace/matrix` into the bundle (`noExternal`) —
matrix source is compiled into this package's `dist/` exactly as `src/` is, and matrix has no build
output of its own to go stale instead. Before that, touching a matrix file and running
`npx vitest run` on a commands spec was a **false green**: 18 tests passed against a `dist/` older
than every matrix source file. The message names whichever tree moved and, for matrix, why it
counts. Cost of the second tree: 28 entries, **+0.3 ms** median on a ~25 ms scan (the two trees are
scanned in parallel; matrix alone measures 0.5 ms). Two behaviours worth knowing: a **deleted**
matrix source trips it (the parent directory's mtime moves), and so does a **deleted** matrix spec.
That is a refusal you did not need, never a green you should not have had.

A third tree is not needed for `turbo test`: turbo already hashes matrix into the CLI's build task
even though matrix has no `build` script — see
[build-and-packaging.md](../build-and-packaging.md#what-turbo-hashes-as-build-input).

Both failure directions were live before that, and both are what the layers exist to stop:

| Direction   | What you see                                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| False RED   | A source change the build has not picked up. When `recommends` was removed, deleting it from `relationshipDefinitionsSchema` left 25 specs failing on `Config validation failed … relationships.recommends: Invalid input` — correct fixtures, correct source, stale `dist/` schema. A rebuild turned all 25 green with no other change. |
| False GREEN | The quieter one. A breaking source change can leave these specs passing against stale `dist/` until CI's build step surfaces it.                                                                                                                                                                                                         |

Reading a commands-project failure as "my change broke this" before checking the build date is the
first wrong turn.

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
- **Module scope:** `chalk.level = 0`. Ink paints through chalk, and every component assertion in this suite was written against a plain frame — a developer's exported `FORCE_COLOR` otherwise inserts truecolour escapes BETWEEN words, and a `toContain` reports a missing string that is a harness artefact rather than a regression. Pinned rather than defaulted, so a gate result does not depend on which shell produced it. The three `describe` blocks in `source-grid.test.tsx` that assert ON colour save `chalk.level`, force truecolor and restore it; needing colour belongs to the test.
- **Module scope:** `process.env.AGENTS_INC_API_URL = WORKER_ORIGIN` (`@workspace/api-mocks/fixtures`). `SEED_API_URL` in `src/cli/lib/seed/fetch-seed.ts` is `process.env.AGENTS_INC_API_URL ?? "https://api.agentsinc.sh"`, **read once at module load**, so a spec setting the variable in a `beforeEach` has already imported the production URL and any request it fails to intercept leaves the machine. Setup files run before a test file's imports, which is what makes this the only place the substitution can be made. The value is the mock's own origin because every handler in `@workspace/api-mocks` is anchored on it — see `useMockWorker()` in [`factories.md`](./factories.md).
- **`beforeAll`:** Creates the per-run temp home dir (`vitest-home-*`).
- **`beforeEach`:** Mocks `os.homedir()` to that temp dir, preventing `loadProjectConfig()`'s global fallback from hitting the developer's real `~/.claude-src/config.yaml`; tests that explicitly override `process.env.HOME` (via `setupIsolatedHome()`) keep their override. **Installed per TEST rather than once per file**, because a single `vi.restoreAllMocks()` in a spec's own `afterEach` withdrew the spy for every later test in that file, after which `os.homedir()` answered from the developer's machine — `home-dir-read-at-call-time.test.ts` pins the re-installation. Also calls `initializeMatrix(BUILT_IN_MATRIX)` and resets the Zustand wizard store (`useWizardStore.getState().reset()`).
- **`beforeEach` and `afterEach`:** `guardAgainstDistReplacement(CLI_ROOT)` — both hooks, one check. A second agent's `bun run build` empties `dist/` mid-run (tsup has `clean: true`), and the `commands` project resolves oclif through `./dist/commands`, so a spec running inside that window fails as an ordinary assertion with no mention of a build. `beforeEach` refuses a test that would run over a replaced build; `afterEach` names the cause on the test that was in flight when the rebuild landed.
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

**It is two files, and which half is where is the point.** The scan, the comparison, the
`BUILD_INPUT_TREES` list and every message live in `src/cli/lib/testing/dist-staleness.ts`, which
exports `assertDistIsFresh(cliRoot)` for the global hook, `assertDistIsPresent` and
`guardAgainstDistReplacement(cliRoot)` for the per-test guard in `vitest.setup.ts`. `vitest.global-setup.ts` holds three statements: it
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
  <top-level files>                  # Support modules and whole-suite gate specs — not enumerated here, see below
  factories/                         # Object creation factories
    index.ts                         # Barrel re-export of all factories
    agent-factories.ts               # createMockAgent, createMockAgentConfig, createMockCompiledAgentData
    category-factories.ts            # createMockCategory
    config-factories.ts              # buildSourceConfig, buildProjectConfig, buildWizardResult, buildGateReport, ...
    matrix-factories.ts              # createMockMatrix, createComprehensiveMatrix, createBasicMatrix, ...
    plugin-factories.ts              # createMockCompileConfig, createMockMarketplace, createMockMarketplacePlugin
    seed-factories.ts                # buildSeedSkill, buildSeedPayload, buildSeedExternalSkill, UPSTREAM_SKILL_NAME
    skill-factories.ts               # createMockSkill, createMockExtractedSkill, createMockSkillEntry, ...
    skill-factories.test.ts          # Tests for the taxonomy contract those factories enforce
    stack-factories.ts               # createMockResolvedStack, createMockStack, createMockRawStacksConfig, ...
  helpers/                           # Test utility functions — not enumerated here, see below
  assertions/                        # Test assertion helpers — exports live in factories.md
    index.ts                         # Barrel re-export of all assertions
    agent-assertions.ts
    agent-assertions.test.ts         # Tests for the agent assertion helpers
    config-assertions.ts
  mock-data/                         # Extracted test fixtures (shared across test files)
    mock-agents.ts                   # AGENT_DEFS, agent config maps, DEFAULT_TEST_AGENTS
    mock-categories.ts               # Category definitions with domain overrides
    mock-matrices.ts                 # Pre-built matrix constants (EMPTY_MATRIX, SINGLE_REACT_MATRIX, ...)
    mock-skills.ts                   # Skill entries, TestSkill arrays, ExtractedSkillMetadata constants
    mock-source-files.ts             # Published-source on-disk shapes for source-validator tests
    mock-sources.ts                  # SkillSource objects (PUBLIC_SOURCE, ACME_SOURCE, INTERNAL_SOURCE)
    mock-stacks.ts                   # Stack templates, Stack objects, TestStack arrays
  commands/                          # Command-level tests (project: "commands", retry: 1)
    build/
      marketplace-catalog.test.ts
      marketplace.test.ts
      plugins.test.ts
    new/
      marketplace.test.ts
    compile.test.ts
    doctor-content.test.ts
    doctor.test.ts
    edit-from.test.ts
    edit-ui.test.ts
    edit.test.ts
    eject.test.ts
    help.test.ts
    init-edit-validation-parity.test.ts
    init-from-plugin-install.test.ts
    init-unbacked-plugin-refusal.test.ts
    init.test.ts
    list.test.ts
    search.test.ts
    share.test.ts
    uninstall.test.ts
    update.test.ts
  fixtures/
    create-test-source.ts            # Integration test source factory
    agents/                          # Agent fixture files (_templates, web-developer, api-developer)
    commands/                        # Command fixture files (deploy.md, test.md)
    plugins/                         # Plugin fixture directories (valid-plugin, invalid-plugin-*)
    skills/                          # Skill fixture files
    stacks/                          # Stack fixture files (default/)
  integration/                       # project: "integration" — not enumerated here, see below
  user-journeys/                     # project: "integration"
    config-precedence.test.ts
    edit-recompile.test.ts
```

Note: there is NO `test/fixtures/` directory at the project root. All fixtures are in
`src/cli/lib/__tests__/fixtures/`, and that directory has no `configs/` or `matrix/` subdirectory.

**Three of the blocks above are deliberately left unenumerated, and completing any of them here
would be a mistake.** `helpers/` is the largest directory in this tree — larger than `commands/` —
and a third of it is judge modules that exist only to be driven by the spec beside them, so the
filename tells a reader nothing and every entry would need a sentence to earn its line. An inventory
of that size drifts within a fortnight, which is the same reason the co-located specs below are not
listed either. The **top level** and **`integration/`** are the same fault caught later: both were
hand-kept lists that the tree outgrew — the top level named ten of twenty-five files and
`integration/` seven of nine, and in both cases a reader who greps for a name they cannot find here
concludes it does not exist.

Re-derive each instead of reading a list:

```
find src/cli/lib/__tests__ -maxdepth 1 -type f | sort   # the top level
ls src/cli/lib/__tests__/helpers/
ls src/cli/lib/__tests__/integration/
```

For `helpers/` a second place answers, and it is enforced: [factories.md](./factories.md)
§ Helper Functions names every symbol the directory exports and which module holds it, read against
the DIRECTORY by `scripts/check-enumeration-drift.ts`, so a helper landing without a row turns the
suite red — which a tree here cannot do. The top level's support modules are bound the same way:
`content-generators.ts` and `test-fs-utils.ts` each have a `factories.md` table held to their
exports, and `test-fixtures.ts`'s `SKILLS` registry is held by [mock-data.md](./mock-data.md).
`assertions/` is bound on the same terms — `factories.md` § Assertion Helpers is read against that
DIRECTORY too, which is why the tree above names its files and not their exports.
`integration/` has no enforced roster; the `ls` is the whole answer.

**Every other spec under `src/cli/` is co-located with the source it covers** — beside the module
(`src/cli/lib/compiler.test.ts`), or in a `__tests__/` directory beside it
(`src/cli/lib/configuration/__tests__/`, `src/cli/lib/config-gate/__tests__/`). Component tests sit
beside their components under `src/cli/components/`. Derive the list with
`fg "src/cli/**/*.test.{ts,tsx}"` rather than reading one here; a hand-listed inventory of that size
drifts within a fortnight, and `DOCUMENTATION_MAP.md` § Coverage owns the total.

Script tests run in the `unit` project through its `scripts/**/*.test.ts` include. The roster is a
command rather than a list here, for the reason stated two paragraphs up — this one had drifted to
ten entries while the directory held nineteen, and a hand-list is what makes that invisible:

```
ls scripts/*.test.ts                             # every script suite
ls scripts/*.ts | grep -v '\.test\.ts$'          # every script, spec'd or not
ls scripts/run-check-*.ts scripts/run-generate-*.ts  # the ones something other than a spec invokes
npx vitest run --project unit scripts/           # run them all, and the count they report
```

Two families are in there and they read differently. `generate-*.test.ts` covers a WRITER — a
generator that emits checked-in source, one per artefact, and every one of them has a `run-*` entry
point. For most `check-*.ts` the SPEC IS the checker: the module has no entry point, nothing runs at
module scope, and `bun scripts/check-<name>.ts` therefore prints nothing and exits 0 while checking
nothing — the worst possible false green. Never invoke one that way; run its spec. The exceptions
are the three `check-shared-*`, which walk every workspace in the monorepo and do have runners the
repository-root `deps:check` calls. `ls scripts/run-check-*.ts` is the line between the two.

All four generators are covered. The schema generator's spec is the newest: it was impossible while
that file called `generate()` at module scope, since importing it rewrote the repository's schemas
and shelled out to prettier — [features/code-generation.md](../features/code-generation.md) carries
what changed. `scripts/handrun.mjs` has no spec and is not meant to: it is a hand-run entry point,
not a gate — [e2e-infrastructure.md](./e2e-infrastructure.md) § The Hand-Run.

The `run-generate-*.ts` runners have no specs either. They hold argv parsing, console output and the
exit code and nothing else; the behaviour worth pinning is in the generator modules they call, which
is why those modules export `generate` and `check` and run nothing on import.

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

**Colour is testable only at this layer.** The E2E harness runs with `NO_COLOR`, so every E2E spec asserts the marker, not the colour. Any contract phrased as "these two surfaces render the same colour" (e.g. `rowLabelColor` in `source-grid.tsx` vs `DIFF_COLOR` in `skill-agent-summary.tsx`) needs a component test — an E2E marker assertion does not cover it. That pairing is the reason this subsection exists: the palette was a stated contract that no test in the repo asserted, because the naive assertion is not merely hard but unobservable, and an agent that tries one and watches it fail is one step from quietly weakening it to a text-only assertion.

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

`RENDER_DELAY_MS` and `delay` come from `src/cli/lib/__tests__/test-constants.ts`. **A frame that never changes after an interaction is this bug before it is a product bug.**

### Under Ink 7 the teardown frame is unconditional — read `frames`, not `lastFrame()`

When an error boundary exits, Ink 7 appends a `"\n"` frame on teardown **every time**. Ink 5 did this only when `CI` was set, which is exactly why the same assertion read differently on a runner. With the setup file now deleting `CI` (above), the variable can no longer paper over it either way.

The consequence for a test: `lastFrame()` after such an exit returns the blank teardown frame, not the painted one. **Assert against `frames.join("\n")`.** `src/cli/components/wizard/summary-panel.test.tsx` is the worked example and carries the reason inline — the assertion lands on the painted frames, not on a rejected `render()`, and joining reads the painted frame wherever in the sequence it lands.

### A regenerated snapshot is a proposal, not a result

`vitest -u` writes whatever the component currently renders, so a regenerated snapshot **agrees with the code by construction**. Its only value is at review time, and for a fixed-width column layout the diff a reviewer sees is a wall of aligned spaces that reads as noise unless somebody counts columns.

This is not theoretical. Both column-geometry snapshots in `src/cli/components/wizard/source-grid.test.tsx` were regenerated with `-u` when the Sources grid's scope gutter was removed, both came back green, and both encoded a layout the owner had not asked for. Nothing else caught it: `tsc`, ESLint, Prettier, 57 unit tests and every E2E spec touching the Sources grid were green against the wrong layout. **Geometry has no other gate.**

**Before committing a regenerated column-geometry snapshot, derive the intended column starts from the component's own width constants and check them against the emitted frame by index.** For `source-grid.tsx` those are `SCOPE_COL_WIDTH` (11), `SKILL_NAME_WIDTH` (26, widened from 24 by exactly the two-column marker width), and `INSTALL_MODE_COL_WIDTH` (18), plus a 2-column chevron prefix:

| Column        | Expected start (grouped / flat) | Emitted           |
| ------------- | ------------------------------- | ----------------- |
| scope gutter  | 0 / absent                      | `Global` at 0     |
| skill name    | 11 / 0                          | 13 (2-col marker) |
| `Local` cell  | 37 / 26                         | caption+value 39  |
| `Plugin` cell | 55 / 44                         | caption+value 57  |

The flat branch must be the grouped one shifted left by exactly `SCOPE_COL_WIDTH`. State the derivation in the test's JSDoc so the next reader can re-check it without re-deriving it.

> **Cross-ownership note — the extension above LANDED; what is missing is a gate, not a rule.** The prescriptive form is **rule 6.17a in `.ai-docs/standards/clean-code-standards.md`**, and it no longer stops at requiring the snapshot to exist: it requires the regeneration to re-derive the intended column starts from the component's own width constants and to state the derivation in the test's JSDoc, which `source-grid.test.tsx` now carries beside both snapshots. This paragraph read _"proposed, not applied"_ for weeks after that was false, which is the same failure one level up — a note recording a gap is only as good as the pass that returns to it. **The open half is enforcement:** a bare `vitest -u` is a review-time convention with nothing behind it, and neither `eslint.config.js`, the spec gates nor CI can tell a snapshot that was re-derived from one that was regenerated and waved through. Whether that becomes a mechanical check is an owner decision (an open row in `todo/cli.md`), not a documentation gap. The suggestion that introduced 6.17a named this exact risk (_"a reviewer who rubber-stamps snapshot updates gets nothing"_) and shipped without an obligation closing it; the failure occurred one day later, on the very component the rule was written for. See `.ai-docs/agent-findings/2026-07-31-column-geometry-snapshots-regenerated-never-verified.md`.

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

This applies to unit and integration test files across `src/cli/` and `scripts/`. Four files retain a
local `try` block, each for a reason cleanup-in-`afterEach` does not cover:

| File                                          | Why the block stays                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/commands/edit.test.ts`             | Captures a thrown oclif `CLIError` to assert on `oclif.exit` and the message                                              |
| `__tests__/commands/search.test.ts`           | Same shape                                                                                                                |
| `lib/loading/source-loader.test.ts`           | `try/finally` around `enableBuffering()` in two file-local helpers, so the buffer is drained whichever way the load exits |
| `lib/skills/unresolved-skill-entries.test.ts` | Scoped `os.homedir()` spy that must be restored even when the call under test throws                                      |

### Config Section Extractors

Two shared helpers in `src/cli/lib/__tests__/helpers/config-source-sections.ts` for asserting on generated config sections (previously file-local in `config-writer.test.ts`, now extracted and exported; imported directly, not via the `helpers/index.ts` barrel):

- `extractNamedSection(source, name)` -- Extracts a named `const` block (`"skills" | "agents" | "stack"`) from generated config source
- `extractScopeSections(section)` -- Splits a section into `{ global, project }` parts using `// global` / `// project` comment markers

Used by `src/cli/lib/configuration/__tests__/config-writer.test.ts`. A separate order-INSENSITIVE normalizer, `normalizeGlobalConfig()` in `helpers/config-comparison.ts` (strips the `"projects"` line and sorts the remaining lines), is exported via the barrel for config-text comparison.

## Spec Gates (`src/cli/lib/__tests__/spec-gates.test.ts`)

Eight gates in the `unit` project, over the suite and its config rather than over the product. They
exist because each answers a question nothing else in the repository asks, and every one of them was
written after the silence it closes had already cost something.

| Gate                                                       | What it asserts                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| every spec belongs to a configured project                 | Every `e2e/**/*.test.ts` on disk is claimed by a project's `include` in `e2e/vitest.config.ts`. `e2e/smoke/` sat outside every include for months and rotted                                                                         |
| every configured project is opened by a package script     | Each project name appears as `--project <name>` in some `package.json` script. A project no script names runs only when the OTHER project is asked for, and never otherwise                                                          |
| every spec it collects is a spec that runs                 | No `e2e/**` file carries an unconditional skip form. A file both a config and a script reach is as unrun as one neither reaches when its own `describe` is skipped, and it reads exactly like a passing file until somebody opens it |
| a journey's from-scratch specs are from scratch            | A row of `standards/e2e/user-journeys.md` whose every named spec opens from a fixture-written config must carry the `TO TEST` marker                                                                                                 |
| every named spec carries the directory it lives in         | A name a run cannot be pointed at is not proof                                                                                                                                                                                       |
| every non-spec name is one the gate has been told about    | Anything the From-scratch column names that no spec answers to must appear in `RECOGNISED_NON_SPEC_NAMES` with its reason                                                                                                            |
| a verdict that cannot fail is refused before it is trusted | Lints one real file per separately-ruled `no-restricted-syntax` zone against the LOADED `eslint.config.js`, for every shape in `ESCAPE_SHAPES`                                                                                       |
| the shared base refuses a value compared against itself    | Lints under `packages/eslint-config/base.js` ALONE, which is the only way to tell a rule the base carries from one this package adds on top                                                                                          |

Both halves of the config are **loaded, never restated**: `e2eProjects()` imports
`e2e/vitest.config.ts` and reads its `projects`, and the ESLint gates construct an `ESLint` instance
over the real `cwd`. A second copy of an include glob or a selector here could not tell a config
that stopped matching a file from one that never did.

### `spec-filenames.test.ts` — the one ban no ESLint selector can reach

A ninth gate, in its own file because its subject is not the config. Task IDs are banned from a
`describe`, an `it` and an assertion message, and each of those is a string a `no-restricted-syntax`
selector can match; a FILENAME is not — no rule sees the path it is linting as text — so the one
place the ban was unenforceable is the one place it was broken. `d227-same-scope-tombstone-duplicate.test.ts`
carried its ticket in its name for a month while every `describe` inside it said what it pins.

The gate holds every `src/**`, `e2e/**` and `scripts/**` spec basename against the tracker ID shapes
(`d227`, `d-227`, `cli-551`, `p4-17`), with the prefix roster **stated rather than derived**: `todo/`
sits above this package and does not ship with it, so a roster read from there would answer clean in
a published checkout for the reason that it could not see anything. Two hand-written rosters sit
beside the tree scan, one the recogniser must condemn and one it must leave alone — the second is the
subject guard, because a recogniser answering `false` to everything satisfies the tree-wide assertion
without reading a single name, and a floor under the glob's match count is what stops an empty scan
reporting a clean tree.

### `ESCAPE_SHAPES` and the zones it is run against

`ESCAPE_SHAPES` pairs each way a verdict can be written so nothing it measures can make it false
with the same verdict written so the code CAN. **The pairing is the point** — a rule condemning both
halves would just be banning count comparisons, and every spec would learn to write around it. Four
shapes:

| Shape                              | Rule                   |
| ---------------------------------- | ---------------------- |
| a length compared against zero     | `no-restricted-syntax` |
| a zero compared against a length   | `no-restricted-syntax` |
| a set's size compared against zero | `no-restricted-syntax` |
| a value compared against itself    | `no-self-compare`      |

The selectors live in `eslint.config.js` as `VACUOUS_COMPARISONS`, over a property named
`length`, `size` or `byteLength`. `no-self-compare` sits in `packages/eslint-config/base.js`
instead: it is core ESLint, takes no options, and therefore merges across config blocks, so it
reaches every workspace — where it had been stated in this package alone, leaving every other
workspace accepting `x === x`. The selectors cannot follow it there, because
`no-restricted-syntax` DOES take options and the last block naming it for a file owns all of them.

`@typescript-eslint/no-unnecessary-condition` sees none of these: it judges a condition against its
TYPE, and `number >= 0` is a `boolean` the type `number` leaves open. The shape is only reachable
syntactically, which is why the rules that close it are too.

`LINT_ZONES` names one REAL file per zone `eslint.config.js` configures `no-restricted-syntax`
separately in — `e2e/assertions/four-surfaces.ts` (the whole E2E tree, including its helpers),
`src/cli/lib/content-validator.ts` (an ordinary type-checked source, and the config-gate import-ban
zone), and `src/cli/lib/config-gate/index.ts` (which every block above excludes, so it inherits
nothing). The paths must EXIST: `lintText` needs a path the TypeScript project service can resolve,
and an unresolvable one fails as a parse error rather than as a missing rule. The gate throws on a
fixture that failed to parse rather than counting it, because a parse failure produces a `fatal`
message with a null `ruleId` and "eslint said something" is exactly the coarse verdict this gate
exists to refuse.

### `helpers/journey-page.ts` — the journey-page reader

The reader for `standards/e2e/user-journeys.md`'s journey tables, extracted from the gate it used to
sit inside. **Classification is TOTAL**: every backticked name in a From-scratch cell comes back as
one of three kinds, and the two ways a name can fail to be a resolvable spec are kept apart because
they mean opposite things.

| Kind             | What it means                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `spec`           | A file answers to it — judge it                                                              |
| `unlocated-spec` | A real spec named without its directory. `livesAt` carries the rewrite. A PAGE defect        |
| `not-a-spec`     | Nothing answers to it — a helper or a code symbol. A legitimate exclusion, justified by name |

The inline predecessor dropped whatever it could not resolve, and **a page whose entries are
skipped reads exactly like a page whose entries all passed**: six entries went unjudged on a page
whose whole job is to say what has been proved. The reader now throws rather than classifying when a
name inside a spec directory answers to no file, and throws rather than returning `[]` when the
table shape has moved — a reader that returns nothing for a page it failed to understand makes every
judgement over it hold vacuously.

The spec directories are DERIVED from the spec list rather than listed, which is the second half of
the same silence: a hand-kept list would leave every row naming a newly-added directory skipped. The
parsing is pure and the filesystem is one function at the edge (`readSpecNames`), so the
classification is tested against a three-element spec list rather than a fixture tree
(`helpers/journey-page.test.ts`). Its exports are inventoried in
[factories.md](./factories.md#helper-functions-srcclilib__tests__helpers).

## Repository Checks (`scripts/*.test.ts`)

Each is a plain module with **nothing at module scope** — the spec beside it is the enforcement, and
the root it reads or writes is a parameter so the check can be driven against a fixture tree. The
roster is the spec list, and the table below names all of it:

```
ls scripts/*.test.ts
```

**Do not filter that directory with `grep -v test`.** `check-shared-vitest-config` contains the
word, so the filter drops a live check and the roster silently comes back one short — a mistake
already made more than once against this very table.

| Check                           | What it asserts                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-enumeration-drift.ts`    | Every document claiming to enumerate a source symbol exhaustively still names what that symbol holds — see below                                                                                                                                                                                                                                                                            |
| `check-findings-frontmatter.ts` | Every `agent-findings/` file carries frontmatter a YAML parser can read, against `agent-findings/TEMPLATE.md`'s schema                                                                                                                                                                                                                                                                      |
| `check-finding-citations.ts`    | Every finding cited by basename from OUTSIDE `.ai-docs/` still exists — `todo/` for all citations, `changelogs/` for bracketed links only                                                                                                                                                                                                                                                   |
| `check-briefing-contract.ts`    | Every pointer the two `CLAUDE.md` files and `standards/briefing.md` write still resolves, and every standard is named by `DOCUMENTATION_MAP.md`                                                                                                                                                                                                                                             |
| `check-spec-name-vocabulary.ts` | Every spec filename is built from the vocabulary its own suite declares                                                                                                                                                                                                                                                                                                                     |
| `refusal-expectations.ts`       | Every refusal these suites assert names a message the run can read — see below                                                                                                                                                                                                                                                                                                              |
| `check-mirrored-constants.ts`   | Every structural value `e2e/pages/constants.ts` MIRRORS still reads what the product declares — `EXIT_CODES`, `TERMINAL_SIZE.SHORT.rows` against the size gate, and `SOURCE_PATHS.PLUGINS_DIST`. The numeric and nested half of the boundary `check-screen-sentinels` draws; `EXIT_CODES` is compared one-directionally, because the mirror legitimately names statuses the CLI never emits |
| `check-screen-sentinels.ts`     | Every `e2e/pages/constants.ts` literal a step page object WAITS on still reads the string the product paints — drift there times out rather than asserting                                                                                                                                                                                                                                  |
| `check-spawn-doors.ts`          | Every site that starts the built binary hands it `NO_BACKGROUND_VERSION_CHECK`, followed through the local declarations a spawn's env expression names                                                                                                                                                                                                                                      |
| `check-symbol-citations.ts`     | Every `@link` citation in this package's TypeScript resolves to a symbol the type checker can find — see below                                                                                                                                                                                                                                                                              |
| `check-shared-eslint-config.ts` | Every workspace extends `@workspace/eslint-config` rather than restating its rules                                                                                                                                                                                                                                                                                                          |
| `check-shared-tsconfig.ts`      | Every workspace extends `@workspace/typescript-config`, or declares it holds no TypeScript                                                                                                                                                                                                                                                                                                  |
| `check-shared-vitest-config.ts` | Every workspace extends `@workspace/vitest-config`, or states in its manifest why it does not — which `packages/cli` does, in `package.json`'s `//no-shared-vitest-config` note                                                                                                                                                                                                             |
| `generate-json-schemas.ts`      | The JSON Schema generator — `check` names every file in `src/schemas/` that differs from what it emits                                                                                                                                                                                                                                                                                      |
| `generate-matrix-package.ts`    | The matrix package generator                                                                                                                                                                                                                                                                                                                                                                |
| `generate-source-types.ts`      | The union type code generator                                                                                                                                                                                                                                                                                                                                                               |

### `check-symbol-citations.ts` — the only check here that builds a TypeScript program

Every other check in this directory reads source with `ts.createSourceFile`, which is syntax alone.
This one resolves `PROJECTS` with `ts.getParsedCommandLineOfConfigFile`, builds a `ts.Program` per
project and asks `checker.getSymbolAtLocation` of every `JSDocLink` node — the same symbol table an
editor answers Go-to-Definition from. That is why it costs seconds rather than milliseconds, and why
it is the only instrument that sees a citation whose contents are not an entity name at all.

**Its roster is held against `package.json`, not against a copy of itself.** `typecheckedProjects()`
reads the `typecheck` script and parses each `&&`-separated `tsc` invocation, so a fourth project
added there and not to `PROJECTS` reddens by name rather than narrowing the walk in silence. A bare
`tsc --noEmit` reads `tsconfig.json`; a `-p` followed by nothing is refused rather than skipped.

**Three limits, each a decision rather than an omission.** A citation in a `//` line comment holds no
`JSDocLink` node, so neither this walk nor an editor can resolve one — a fixed-string grep and this
check will disagree by exactly those. Every other workspace is out of scope; none of their programs
is built here. And `.d.ts` files are excluded whichever tree they are in.

**Backticks do not make a citation prose.** The JSDoc parser does not read them, so a citation
written inside backticks is judged like any other — which is what makes writing one to illustrate the
rule a defect in the document that does it. `check-symbol-citations.test.ts` assembles its fixture
citations at runtime for that reason, and no line in it can be copied into a docblock as-is.

### `refusal-expectations.ts` — a refusal is only asserted if the assertion can fail for its reason

Two halves. `expectRefusal` is what a suite here calls instead of `toThrow`; `vacuousThrowAssertions`
is the scan that says no suite under `scripts/` has gone back to the bare matcher.

The shape both exist for: `expect(run).toThrow(SOME_CONSTANT)` where the test file IMPORTS a constant
its module does not export. At runtime that name is `undefined`, `toThrow(undefined)` is vitest's
"threw anything at all", and the assertion passes against a check refusing for an entirely different
reason. `tsc` catches it — TS2305 — but `tsc` is not what a red-first step runs.

**`toThrow(new RegExp(CONSTANT))` is not the repair, and reads exactly like it.** It was proposed on
the reasoning that an absent export would raise a `TypeError` rather than match. It does not:

```
node -e 'console.log(String(new RegExp(undefined)), /(?:)/.test("any error at all"))'
```

prints `/(?:)/ true` — the empty pattern, a substring of every error message. The scan condemns that
shape and the `RegExp(...)` spelling without `new`, because the `new` is optional in the language and
would otherwise be a one-character escape from the whole check.

INTERPOLATING a constant into a pattern is deliberately not condemned. An absent export becomes the
literal text `undefined` there, which matches no real message, so such an assertion goes red rather
than passing on anything.

### A gate that reads a tree outside its own package must name that tree in `turbo.json`

Otherwise it replays a cached pass describing a tree it never opened, which is the same green a
fully-resolving tree gives.

`$TURBO_DEFAULT$` is every file in the package and stops at the package boundary. Two checks here
read past it — `check-finding-citations.ts` walks `todo/`, and `check-briefing-contract.ts` follows
the root `CLAUDE.md`'s links — and both sit outside every workspace, so a change confined to either
left `agents-inc#test`'s hash byte-identical. `packages/cli/turbo.json` names them in the `test`
task's `inputs`. Note that `.ai-docs/` needs no entry and never did: it is INSIDE the package, so the
default set already carries it.

What the task actually hashes, which is the only thing that settles this:

```
npx turbo run test --dry=json --filter=agents-inc
```

The `inputs` map it prints is every file whose content feeds the hash. `"the task that runs these
scans"` in `check-finding-citations.test.ts` holds the rule, deriving the required entries from the
checkers' own exported paths rather than from a list — so a scope row that reaches outside the
package fails that assertion instead of quietly going stale. It parses `turbo.json` rather than
searching it as text, because that file carries `//` comments explaining itself and a substring check
for an entry is satisfied by a comment mentioning it.

### `check-enumeration-drift.ts`

A registry of `(source enumeration) → (document, section)` rows, judged as **MEMBERSHIP in both
directions** rather than as a total. Two lists can agree on a total and share no names at all, and
the two failure directions are not the same size: a list that is SHORT sends a reader looking for a
member, failing to find it, and writing a duplicate; a list naming a symbol the source has since
LOST sends them grepping for nothing, after which the whole document stops being trusted.

A row's source half names a FILE or a DIRECTORY, and `SourceEnumeration` declares the five shapes.
Four name a file: `symbol` (one exported symbol — an object's keys, an array's strings, a union's
literals), `entries` (the same object read one level deeper — every key bound to the string it
holds), `exports: "const" | "function"` (the module's whole export list of one kind), and
`reexports: "every-name"` (its RE-EXPORT surface — what a consumer imports from it that the module
did not write, type-only clauses and bare blocks included). The fifth names a directory:
`enumerates: "exported-values" | "command-ids"`, for the two claims no expression in the tree holds
— what a directory of modules exports, and the command ids under `src/cli/commands/`, which oclif's
`pattern` strategy declares nowhere.

Its document half names a section delimited by two markers and how that section states its list.
`DocumentClaim` declares the four readers: `code-spans` (every constant-shaped backticked name),
`table-rows` (the first cell of every row under the table's rule), `table-pairs` (two NAMED columns,
answered as `key = value` per row), and `partitioned-tables` (every table in the section whose first
column carries the named heading, for a list a document states as several tables rather than one).

**`table-pairs` is what makes a table's VALUES checkable, and pairs rather than values is the design
point.** A table whose key column is right and whose value column is wrong reads as clean to every
other reader: `E2E_SKILL_TITLES` in [e2e-infrastructure.md](./e2e-infrastructure.md) answered
`agrees` over ten members while five of its Display-title cells were wrong, because the slugs — the
only column either half could reach — were right, and the titles are what the E2E suite matches on.
Emitting `key = value` rather than the values alone leaves the comparison a `string[]` diff exactly
as it was, AND catches a SWAP: two rows exchanging their values leave a values-only set identical
and every count intact. Both sides encode through one function (`pairOf`), so a source pair and a
document pair cannot be spelt differently. The columns are named rather than counted because a
document is free to write a third between them, and a heading that has been renamed is REFUSED by
name (`NO_COLUMN`) rather than read as an empty column — silently reading nothing is the failure
this whole file exists to close.

**Every guard throws rather than skipping.** A missing source file, a missing symbol, a symbol
holding a member the reader cannot name (a spread, a computed key), a section opener that has moved
or appears twice, and an enumeration that parses to nothing are all hard failures — because a row
that quietly reads an empty section reads exactly like a row that passed, which is how every check
in this repository that has failed us failed.

**An annotation is read through, never read as the list.** `as const`, `satisfies` and parentheses
are all unwrapped down to the literal underneath, so `[...] as const satisfies readonly T[]` — this
codebase's house style for a vocabulary array — binds like any other array, and a `satisfies`
constraint naming more than the literal holds does not add members. Before that arm landed, the
shapes most worth binding were the ones the reader could not see.

**What it cannot bind, and why.** `membersOfSymbol` reads object literals, array literals and union
literals and nothing else, so a type alias to an object TYPE literal (`WizardState`,
`ProjectConfig`) enumerates nothing and its field tables stay hand-derived; so does a call
expression, which is what `new Set([...])` and `z.enum([...])` are. `stringsOf` refuses an array of
OBJECT literals, because no member of it is a name. `entries` reads a value only where it is a
plain string literal — a template with a substitution, an identifier naming a declaration
elsewhere, and a shorthand, method or getter with no initializer at all are each refused
(`UNREADABLE_VALUE`) rather than skipped, since skipping one would under-report the source by a
member while reporting the rest as agreed. And a FILE inventory — "the files under
`src/cli/components/wizard/`" — is not a symbol and not an export surface, so the component, hook
and step-file listings in [component-patterns.md](../component-patterns.md) remain checkable by hand
only.

**A barrel is readable and deliberately not the subject.** `reexports: "every-name"` reads an
`index.ts` fine; what would be wrong is binding [factories.md](./factories.md)'s tables to one.
Those tables say what each DIRECTORY exports, and `factories/index.ts` re-exports a strict subset of
what its directory declares — every member it omits would read as drift. All three tables are bound
to their directory instead.

The prescriptive half is `standards/documentation-bible.md` § "A Count Lives in Exactly One
Document", which requires a new exhaustive claim to add a row here rather than a promise in prose.

## Test Anti-Patterns (From CLAUDE.md)

- NEVER construct test data inline (configs, matrices, skills, stacks, agents)
- NEVER use raw `writeFile` for skill/agent test data
- NEVER inline `SkillsMatrixConfig` or `MergedSkillsMatrix` construction
- NEVER create alias/mapping hacks to paper over wrong test data
- NEVER put TODO/task IDs in test describe blocks
- NEVER use raw `mkdtemp`/`rm` -- use `createTempDir()`/`cleanupTempDir()`
- NEVER use `try/catch/finally` in test bodies -- use `afterEach` for cleanup, `.catch(() => {})` or `rejects.toThrow()` for errors
