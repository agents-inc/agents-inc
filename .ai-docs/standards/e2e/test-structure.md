---
last_validated: 2026-04-21
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
// Phase 1: Setup (implicit -- InitWizard.launch creates temp dir and source)
const wizard = await InitWizard.launch();

// Phase 2: Interaction
const result = await wizard.completeWithDefaults();

// Phase 3: Assertion
expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
await expect(result.project).toHaveConfig();
```

The three phases should be visually distinct. Mixing setup, interaction, and assertion within a single block makes tests harder to read and maintain.

---

## Lifecycle Hooks

### `beforeAll`

Use for:

- `ensureBinaryExists()` -- required in every test file, verifies `bin/run.js` exists
- Expensive shared fixtures: source creation (`createE2ESource()`), which is read-only across tests

```typescript
beforeAll(async () => {
  await ensureBinaryExists();
  source = await createE2ESource();
}, TIMEOUTS.SETUP);
```

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

- `BaseStep.pressEnter()` includes an internal `STEP_TRANSITION` delay
- `BaseStep.pressSpace()` includes an internal `KEYSTROKE` delay
- `TerminalScreen.waitForText()` polls with auto-retry
- `TerminalScreen.waitForStableRender()` waits for the footer to render

The only timing concern in tests is per-test timeouts for tests that take longer than the default 30 seconds:

```typescript
it("full lifecycle", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
  // ...
});
```

**Timeout contract:** `TerminalScreen.waitForText()` uses whatever `timeoutMs` is passed -- there is no built-in default or CI multiplier. Callers are responsible for passing an appropriate timeout (typically via `TIMEOUTS.*` constants). For operations that may be slow in CI (e.g., plugin installs), pass a generous timeout.

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
  session = new TerminalSession(["init", "--source", dir], tempDir, {});
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
4. **Never calls production functions directly** — no importing `installEject()`, `compileAllAgents()`, or `splitConfigByScope()`

If a test calls production functions directly, it belongs in `src/cli/lib/__tests__/`, not in `e2e/`.

---

## Related

- [test-data.md](./test-data.md) -- How to set up project fixtures
- [assertions.md](./assertions.md) -- How to verify outcomes
- [anti-patterns.md](./anti-patterns.md) -- What not to do
