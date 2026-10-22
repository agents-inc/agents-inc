---
last_validated: 2026-10-15
---

# Test Structure

How E2E tests are organized within a file.

---

## The Golden Rule: Tests Never Touch the Filesystem

The single most important constraint. An `it()` block must never create, modify, or read files directly. No `writeFile`, no `mkdir`, no `readFile`, no `path.join` to construct paths to implementation files.

File operations belong in exactly two places:

1. **Setup fixtures** (`ProjectBuilder`, `createE2ESource`) -- run before the test in `beforeAll`/`beforeEach`.
2. **Custom matchers** (`toHaveConfig`, `toHaveCompiledAgents`) -- run inside `expect()` calls. The file-reading logic lives inside the matcher, not in the test.

**Why:** Every `writeFile` or `readFile` in a test body couples the test to the implementation. When the config format changes, directory structures change, or file naming conventions change, these tests break -- but the CLI's behavior didn't change. The test was testing implementation, not behavior.

---

## Three-Phase Pattern

Every E2E test follows three phases:

1. **Setup** -- Create project state through fixtures
2. **Interaction** -- Run a CLI command
3. **Assertion** -- Verify outcomes through matchers or output checks

```typescript
// Phase 1: Setup (in beforeEach or inline fixture call)
const project = await ProjectBuilder.minimal();

// Phase 2: Interaction
const { exitCode, output } = await CLI.run(["compile"], project);

// Phase 3: Assertion
expect(exitCode).toBe(EXIT_CODES.SUCCESS);
await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
  contains: ["name: web-developer"],
});
```

Skills and agents default to GLOBAL scope, so a project install's `.claude/` content lands under the global HOME, not `projectDir` — see [anti-patterns.md § Never check the wrong scope directory](./anti-patterns.md#never-check-the-wrong-scope-directory). The example reads `project` because `ProjectBuilder.minimal()` scopes its agents there.

The three phases should be visually distinct. Mixing setup, interaction, and assertion within a single block makes tests harder to read and maintain.

**Phase 3 must cover both sides.** Any test that runs a command that creates, modifies, or removes files or config entries, MUST assert the resulting state of config AND filesystem. If the operation should NOT change something, snapshot it before and assert it is identical after. Never check only one side — a config write with no corresponding install, or an install with no config entry, are both real failure modes that a one-sided assertion passes.

---

## Lifecycle Hooks

### `beforeAll`

Use for:

- Expensive fixtures a spec builds for ITSELF — a source that differs in what it ships
  (`createE2ESource(options)`), or one the spec writes into (`createE2EPluginSource({ owned: true })`)

**Most spec files need no `beforeAll` at all.** `e2e/setup.ts` registers the dist door once, in a `beforeAll`, so it runs before every spec file in the suite. It was `ensureBinaryExists()` called from each file's own `beforeAll` until 2026-08-24 — per-file discipline with no checker over it, where forgetting the call bought a 45-second timeout naming nothing and no reader could tell a spec that omitted it correctly from one that forgot.

**Do NOT build a plain source here.** `E2E_SOURCE` is that tree, written once per run by `globalSetup`
and frozen — so a spec wanting the ordinary source names `E2E_SOURCE` and builds nothing. About
seventy files carried a `beforeAll` calling `createE2ESource()` into two suite-level `let`s plus an
`afterAll` cleaning them up; every one of them was building the same tree, at ~10ms each, so the
sharing bought nothing and the ceremony cost ten lines a file.

### `beforeEach`

Use for:

- Per-test project creation via `ProjectBuilder`
- Any state that must be fresh for each test

### `afterEach`

Use for:

- `destroy()` -- kills the PTY session, and removes HOME only when the spec passed none
- Temp dir cleanup: `cleanupTempDir(tempDir)`
- Resetting variables: `tempDir = undefined!`

```typescript
afterEach(async () => {
  await prompt?.destroy();
  prompt = undefined;
});
```

### `afterAll`

Use for:

- Shared source cleanup: `cleanupTempDir(source.tempDir)`
- Lifecycle tests where phases share state across a single `it()` block

```typescript
afterAll(async () => {
  if (sourceTempDir) await cleanupTempDir(sourceTempDir);
});
```

---

## Cleanup Conventions

**Do not use `try/finally` for cleanup in test bodies.** `afterEach` runs even when tests throw. This is sufficient for cleanup.

### Session ownership

The `afterEach` above is the convention where the TEST owns the session. A shared helper that launches its own session is the other convention, and the two cannot be mixed silently — adopting a helper-owned session at a test-owned call site leaves the outer `let` pointing at an already-destroyed session, and the `afterEach` then double-destroys. Near-identical session blocks sit one extraction apart, byte-similar enough that consolidating them reads as pure copy-paste dedup, which is exactly why it is easy to get wrong.

Four rules:

1. **A shared helper in `e2e/fixtures/` or `e2e/helpers/` that launches a session fully owns that session** — `destroy()` in a `finally` — **and states the ownership contract in its doc comment.** A contract nobody can read at the call site is not a contract.
2. **A call site adopting such a helper drops its own `let` tracking and the matching `afterEach` destroy for that session.** Never leave both.
3. **A helper returning session output names which accessor it read.** `getRawOutput()` and `getOutput()` are different surfaces — raw PTY output is append-only, the processed buffer overwrites in place — and the choice is invisible at the call site.
4. **A shared finalize helper does not assert the exit code.** Failure-path flows return non-success codes and must be able to use the same helper, so the assertion stays at the call site.

**The `tempDir = undefined!` pattern:** Variables are declared as `let tempDir: string` (not `string | undefined`) and assigned in setup before use. After cleanup, they are reset with `tempDir = undefined!`. The non-null assertion is intentional -- TypeScript sees it as `string`, which is correct during test execution. The `undefined!` in cleanup prevents stale references.

```typescript
let tempDir: string;

afterEach(async () => {
  if (tempDir) {
    await cleanupTempDir(tempDir);
    tempDir = undefined!;
  }
});
```

---

## Timing Philosophy

**Tests do not manage timing.** No `delay()`, no `setTimeout`, no `INTERNAL_DELAYS` in test files.

All delays are encapsulated inside the framework:

- `InteractivePrompt` / `DashboardSession` key methods wait `KEYSTROKE` (150ms) after a key; Enter in `InteractivePrompt`'s `pressEnter()`, `confirm()` and `deny()` waits `STEP_TRANSITION` (500ms) instead
- `TerminalScreen.waitForText()` polls with auto-retry

The only timing concern in tests is per-test timeouts for tests that take longer than the default 30 seconds:

```typescript
it("full lifecycle", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
  // ...
});
```

**Timeout contract:** `TerminalScreen.waitForText()` uses whatever `timeoutMs` is passed -- there is no built-in default or CI multiplier at that layer. `InteractivePrompt`'s text waits DO have a default: `TIMEOUTS.WIZARD_LOAD`, **45s**.

**Parallelism is capped at `maxWorkers: Math.min(16, os.availableParallelism())`.** PTY-driven tests are load-sensitive — at one worker per core (21+ on dev machines) keystrokes get dropped and installs slow enough to produce failures that never reproduce solo. Taking the **lower** of the two bounds both ends: a 4-core CI runner gets 4, where a flat 16 would put four PTY workers on every core. The cap is also the reason the page-object keypress rule exists at all ([page-objects.md § InteractivePrompt](./page-objects.md#interactiveprompt): wait for a sentinel before the first key on a screen): the PTY-write-vs-React-commit race is invisible in isolation and only surfaces under contention.

**Why:** Timing scattered across test files is the primary cause of flaky tests. Centralizing it in the framework means timing changes require editing one file, not dozens.

---

## No Production Imports in Tests

E2E test files (`*.e2e.test.ts`) import only from `e2e/` -- never from `src/cli/`.

**Acceptable:** `import type { SkillId } from "../../src/cli/types/index.js"` -- type-only imports have no runtime effect.

**Not acceptable:** `import { CLAUDE_DIR } from "../../src/cli/consts.js"` -- use `DIRS.CLAUDE` from `e2e/pages/constants.ts` instead.

**Framework files** (page objects, fixtures, helpers) may import from `src/cli/` because they are infrastructure, not tests. For example, `test-utils.ts` imports `CLAUDE_DIR` from `consts.js` and `renderConfigTs` from `content-generators.ts`.

**Why:** An E2E test should exercise the CLI binary as a black box. Importing production code means the test is testing internal implementation, not user-visible behavior.

---

## Test Readability

Tests should read like user stories. A developer who doesn't know the codebase should understand what user journey is being tested by reading the `it()` block.

```typescript
// Good: reads as a user story
it("should produce valid compiled agent files with frontmatter", async () => {
  const project = await ProjectBuilder.minimal();
  const { exitCode } = await CLI.run(["compile"], project);

  expect(exitCode).toBe(EXIT_CODES.SUCCESS);
  await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
    contains: ["name: web-developer", "description:", "tools:", "model:"],
  });
});

// Bad: implementation details obscure the intent
it("should work", async () => {
  session = new TerminalSession(["init", "--from", id, "--marketplace", dir], tempDir, {});
  await session.waitForText("Install this configuration?", 10000);
  await delay(500);
  session.write("y");
  session.enter();
  const configPath = path.join(tempDir, ".agents-inc", "claude", "config.ts");
  expect(await fileExists(configPath)).toBe(true);
});
```

---

## What Makes a Test E2E

A test belongs in `e2e/` if it:

1. **Spawns the CLI binary** — via `CLI.run()` or `runCLI()`, or `InteractivePrompt` / `DashboardSession` where a terminal is needed
2. **Sends input the way a user would** — command-line args, and keys at a prompt
3. **Asserts on what the user sees** — terminal output, exit codes, file-system state through matchers
4. **Never calls a production function to PERFORM the work under test** — no `recompileAgents()` standing in for a `compile` run, no `writeProjectConfig()` standing in for an install, no `splitConfigByScope()` standing in for the gate

If a production function performs the operation, the test belongs in `src/cli/lib/__tests__/`, not in
`e2e/`. What makes it an e2e test is that the binary did the work; a spec where an import did it is a
unit test with a temp directory.

### The test rule 4 answers to

**Refactor the whole codebase, leave the behaviour identical: a test worth having still passes.** A
test that reddens on that refactor was pinning the implementation, not the behaviour, and rule 4 is
one instance of that principle rather than a rule of its own — a spec that imports a production
function to perform the work has bound itself to that function's name, signature and location, none
of which a user can observe.

Owner ruling, 2026-08-26. It is the discriminator for everything below, and it replaces an earlier
attempt at this section that carved out an exemption for "harness self-tests" — a category invented
to hold four files rather than derived from anything, which grouped one sound test with three that
this principle refuses.

#### What this principle governs, and what it does not

**It governs INTEGRATION and END-TO-END tests.** Those are the suites that claim to describe what
the product does, so a refactor that preserves what the product does must leave them green. Extended
by owner ruling the same day, because the first draft of this section read as though it governed
every test in the repository, which would have condemned the unit suite.

**Unit tests of pure functions are wanted and are unaffected.** A pure function's name, signature and
return value ARE its behaviour — there is no layer beneath it to refactor without changing it — so a
unit test binding to them is not pinning an implementation. This is where an assertion about a
specific algorithm, a boundary value or an error shape belongs, and moving such an assertion up into
an e2e spec to satisfy the principle would be the wrong reading of it: the principle removes
implementation assertions from the wrong LAYER, it does not delete them.

The practical split:

| Layer               | Binds to                                       | A behaviour-preserving refactor of the internals         |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| unit                | the function under test, by name and signature | may legitimately redden it — the function IS the subject |
| integration and e2e | what a user does and sees                      | must leave it green                                      |

**And every feature must have end-to-end coverage behind it.** A feature with only unit tests has
been shown to have working parts and has never been shown to work. This is not satisfied by an
adjacent spec that happens to touch the surface — the feature needs a spec that drives it the way a
user drives it and asserts on what a user sees. The unit tests are additional to that, never instead
of it.

#### The one deliberate implementation test, and why it is allowed

`lifecycle/preview-matches-install` runs a real `init --from` install, then re-renders the same
configuration through `@workspace/compile` and compares against what landed on disk. It imports
`generateConfigSource`, `generateConfigTypesSource` and `splitConfigByScope` to do it, and **it would
redden if those were refactored away with behaviour unchanged. That is deliberate.**

It is allowed because the thing it pins is a REQUIREMENT rather than an implementation detail: the
editor's preview and the CLI's writers must render from one source. The design's constraint is
explicit — _"generate it from the actual installer, not from a client-side reconstruction. The moment
someone diffs it against reality and it is off, they stop trusting the configurator"_ — so "both
front doors reach the same renderer" is a property the product is required to have, and a test may
pin a required property by name.

**Its circularity is real and does not weaken it.** Both sides of the comparison reach the same
renderer, so it cannot catch a renderer that is WRONG — `packages/compile`'s own runner pins the
bytes and does that job. What it catches is the write path silently LEAVING the shared renderer: a
surviving private copy, an option the writer passes that the preview does not, a canonicalisation
applied on the way to disk and nowhere else. Each keeps the pinned scenarios green and makes the
preview a lie.

The bar for adding another: name the requirement the import pins, and say why a user-visible
assertion cannot reach it. "It was easier" is not that.

#### Specs in `e2e/` that spawn nothing

Re-judged under the layer split above. They are recorded rather than exempted, but only ONE is
refused by the principle.

| Spec                                     | What it really is                                                     | Verdict                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matchers/project-matchers`              | a unit test of an assertion matcher                                   | **Sound, misfiled.** Refactoring the product cannot redden it                                                                                       |
| `integration/fixture-configs-round-trip` | an integration spec — it sits in `integration/` and claims that layer | **Refused.** The principle governs this layer, and the spec imports `generateConfigSource` and `loadInstalledConfig` by name while spawning nothing |

**The first is a NAMING defect, not a testing defect**, and the distinction matters because the
fixes are unrelated: one file claims a layer it does not belong to, and the other belongs to its
layer and breaks that layer's rule. A spec that can only exist as a unit test is not a spec that
failed to become an e2e test.

**Do not start by renaming.** `vitest.config.ts`'s unit project reads `src/**` and `scripts/**`; the
e2e project reads `e2e/**/*.e2e.test.ts`. A spec renamed off that suffix while still under `e2e/` is
collected by NOTHING and vanishes silently — a worse failure than the misfiling. Decide the
destination first.

**Neither rule 4 nor the exception is mechanically checked.** The `no-restricted-imports` group
banning `generateConfigSource` is scoped to `CLI_SOURCES` (`src/**`) and additionally ignores
`TEST_FILES`, which lists `**/e2e/**` — so no lint rule, type or gate has ever reached an `e2e/`
import, in either direction. This is enforced at review and by nothing else.

---

## Related

- [test-data.md](./test-data.md) -- How to set up project fixtures
- [assertions.md](./assertions.md) -- How to verify outcomes
- [anti-patterns.md](./anti-patterns.md) -- What not to do
