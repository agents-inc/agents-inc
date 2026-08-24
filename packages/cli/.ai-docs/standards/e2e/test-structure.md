---
last_validated: 2026-07-30
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
2. **Interaction** -- Launch a wizard or run a CLI command
3. **Assertion** -- Verify outcomes through matchers or output checks

```typescript
// Phase 1: Setup (in beforeEach or inline fixture call)
const project = await ProjectBuilder.minimal();

// Phase 2: Interaction
const { exitCode, output } = await CLI.run(["compile"], project);

// Phase 3: Assertion
expect(exitCode).toBe(EXIT_CODES.SUCCESS);
await expect(project).toHaveCompiledAgents();
```

For wizard tests:

```typescript
// Phase 1: Setup (implicit -- launchInProject creates temp dir, source, and a global HOME)
const wizard = await InitWizard.launchInProject();

// Phase 2: Interaction
const result = await wizard.completeWithDefaults();

// Phase 3: Assertion -- config is project-side, installed content is scope-side
expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
await expect(result.project).toHaveConfig({ skillIds: ["web-framework-react"] });
await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("web-developer");
```

Skills and agents default to GLOBAL scope, so a project install's `.claude/` content lands under `wizard.globalHome`, not `projectDir`. Choose the launcher by what the test does — see [anti-patterns.md § Choosing the Wizard Launcher by Scope](./anti-patterns.md#choosing-the-wizard-launcher-by-scope).

The three phases should be visually distinct. Mixing setup, interaction, and assertion within a single block makes tests harder to read and maintain.

**Phase 3 must cover both sides.** Any test that completes a wizard flow, or runs a command that creates, modifies, or removes files or config entries, MUST assert the resulting state of config AND filesystem. If the operation should NOT change something, snapshot it before and assert it is identical after. Never check only one side — a config write with no corresponding install, or an install with no config entry, are both real failure modes that a one-sided assertion passes.

---

## Lifecycle Hooks

### `beforeAll`

Use for:

- `ensureBinaryExists()` -- required in every test file, refuses one that begins with no `dist/` under it
- Expensive fixtures a spec builds for ITSELF — a source that differs in what it ships
  (`createE2ESource(options)`), or one the spec writes into (`createE2EPluginSource({ owned: true })`)

```typescript
beforeAll(async () => {
  await ensureBinaryExists();
}, TIMEOUTS.SETUP);
```

**Do NOT build a plain source here.** `E2E_SOURCE` is that tree, written once per run by `globalSetup`
and frozen, and `InitWizard` defaults to it — so a spec wanting the ordinary source names nothing and
builds nothing. About seventy files carried a `beforeAll` calling `createE2ESource()` into two
suite-level `let`s plus an `afterAll` cleaning them up; every one of them was building the same tree,
at ~10ms each, so the sharing bought nothing and the ceremony cost ten lines a file.

### `beforeEach`

Use for:

- Per-test project creation via `ProjectBuilder`
- Any state that must be fresh for each test

### `afterEach`

Use for:

- `wizard.destroy()` -- cleans up PTY session and temp dirs
- Temp dir cleanup: `cleanupTempDir(tempDir)`
- Resetting variables: `tempDir = undefined!`

```typescript
afterEach(async () => {
  await wizard?.destroy();
  wizard = undefined;
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

**Exception:** Extracted lifecycle helpers (like `initGlobal()` in `dual-scope-helpers.ts`) may use `try/catch` internally because they manage sessions within a single function scope and need to destroy on error before re-throwing.

### Session ownership

The `afterEach` above is the convention where the TEST owns the session. A shared helper that launches its own wizard is the other convention, and the two cannot be mixed silently — adopting a helper-owned session at a test-owned call site leaves the outer `let wizard` pointing at an already-destroyed session, and the `afterEach` then double-destroys. Five near-identical "open a wizard, read rendered state, abort without saving" blocks sat one extraction apart from each other, byte-similar enough that consolidating them reads as pure copy-paste dedup, which is exactly why it is easy to get wrong.

Four rules, and `e2e/fixtures/dual-scope-helpers.ts` carries all four on its two shared helpers:

1. **A shared helper in `e2e/fixtures/` or `e2e/helpers/` that launches a wizard fully owns that session** — `destroy()` in a `finally` — **and states the ownership contract in its doc comment.** `readSkillBadgesViaEdit` says it: _"Owns the whole session — it launches, aborts, waits for exit and destroys, so callers must NOT also track the wizard for afterEach cleanup."_ A contract nobody can read at the call site is not a contract.
2. **A call site adopting such a helper drops its own `let wizard` tracking and the matching `afterEach` destroy for that session.** Never leave both. `dual-scope-collapse-and-restore-via-s.e2e.test.ts` and `edit-wizard-dual-scope-indicator.e2e.test.ts` are the adopted sites.
3. **A helper returning wizard output names which accessor it read.** `rawOutput` and `output` are different surfaces — raw PTY output is append-only, the processed buffer overwrites in place — and the choice is invisible at the call site. Neither is the suite's default: `e2e/` currently holds roughly as many `result.output` reads as `result.rawOutput` ones, so a shared extractor returning one of them is a drop-in at only about half the sites it looks interchangeable with. `finishWizard` says which it reads and tells callers needing the sanitized form to take it **before** destroying; `edit-global-source-toggle-propagation-compiled-ref.e2e.test.ts` does exactly that, and says so at the call.
4. **A shared finalize helper does not assert the exit code.** Failure-path flows return non-success codes and must be able to use the same helper, so the assertion stays at the call site. `finishWizard` returns the code and states that it deliberately does not judge it.

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

- `BaseStep.pressEnter()` includes an internal `STEP_TRANSITION` delay (500ms)
- `BaseStep.pressSpace()` includes an internal `KEYSTROKE` delay (150ms)
- `TerminalScreen.waitForText()` polls with auto-retry
- `TerminalScreen.waitForWizardFooter()` waits for the wizard footer to render (wizard screens only)

The only timing concern in tests is per-test timeouts for tests that take longer than the default 30 seconds:

```typescript
it("full lifecycle", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
  // ...
});
```

**Timeout contract:** `TerminalScreen.waitForText()` uses whatever `timeoutMs` is passed -- there is no built-in default or CI multiplier at that layer. `BaseStep`'s waits DO have a default: `BaseStep.defaultTimeout` is `TIMEOUTS.WIZARD_LOAD`, raised from 15s to **45s**, so every unqualified step wait is now a 45s upper bound. That also raises the cost of misapplying `waitForWizardFooter` to a footer-less screen: the call burns 45s before giving up, rather than 15s.

**Parallelism is capped at `maxWorkers: Math.min(16, os.availableParallelism())`.** PTY-driven wizard tests are load-sensitive — at one worker per core (21+ on dev machines) keystrokes get dropped and installs slow enough to produce failures that never reproduce solo. Taking the **lower** of the two bounds both ends: a 4-core CI runner gets 4, where a flat 16 would put four PTY workers on every core. The cap is also the reason the page-object keypress rule exists at all: the PTY-write-vs-React-commit race is invisible in isolation and only surfaces under contention.

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
it("should complete init with defaults and produce config", async () => {
  const wizard = await InitWizard.launch();
  const result = await wizard.completeWithDefaults();

  expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
  await expect(result.project).toHaveConfig();
});

// Bad: implementation details obscure the intent
it("should work", async () => {
  session = new TerminalSession(["init", "--marketplace", dir], tempDir, {});
  await session.waitForText("Choose a stack", 10000);
  await delay(500);
  session.enter();
  // ... 20 more lines of keystrokes
  const configPath = path.join(tempDir, ".claude-src", "config.ts");
  expect(await fileExists(configPath)).toBe(true);
});
```

---

## What Makes a Test E2E

A test belongs in `e2e/` if it:

1. **Spawns the CLI binary** — via `CLI.run()` for non-interactive or `InitWizard.launch()` / `EditWizard.launch()` for interactive
2. **Sends input the way a user would** — command-line args or wizard step methods
3. **Asserts on what the user sees** — terminal output, exit codes, file-system state through matchers
4. **Never calls production functions directly** — no importing `recompileAgents()`, `writeProjectConfig()`, or `splitConfigByScope()`

If a test calls production functions directly, it belongs in `src/cli/lib/__tests__/`, not in `e2e/`.

---

## Related

- [test-data.md](./test-data.md) -- How to set up project fixtures
- [assertions.md](./assertions.md) -- How to verify outcomes
- [anti-patterns.md](./anti-patterns.md) -- What not to do
