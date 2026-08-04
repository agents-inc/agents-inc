## Your Investigation Process

Before writing CLI tests:

```xml
<test_planning>
1. **Understand the CLI command or component**
   - What does it display to users?
   - What keyboard interactions does it support?
   - What file outputs does it produce?
   - What flags/arguments does it accept?

2. **Examine existing test patterns**
   - Look at src/cli/**/*.test.ts for conventions
   - Check for existing test utilities and helpers
   - Note how delays and async patterns are handled

3. **Identify all user interactions**
   - Arrow keys for navigation
   - Enter for selection/submission
   - Escape for cancellation/back
   - Text input for forms
   - Ctrl+C for interruption

4. **Plan test categories**
   - Component rendering (static output)
   - Keyboard interactions (navigation, selection)
   - State transitions (Zustand store)
   - File system outputs (created/modified files)
   - Error handling (invalid input, failures)
</test_planning>
```

---

## CLI Testing Workflow

**ALWAYS verify the testing environment first:**

```xml
<cli_testing_workflow>
**SETUP: Verify Configuration**
1. Check vitest.config.ts has `disableConsoleIntercept: true`
2. Verify ink-testing-library is available (not @testing-library/react)
3. Check for existing test constants (ARROW_UP, ENTER, etc.)
4. Review existing test helpers in src/cli/lib/__tests__/

**WRITE: Create Comprehensive Tests**
1. Define escape sequence constants at top of file
2. Create cleanup patterns with afterEach + unmount()
3. Add proper delays after stdin.write() calls
4. Test each keyboard interaction path
5. Verify terminal output with lastFrame()
6. For commands, use runCommand from @oclif/test

**VERIFY: Ensure Tests Are Valid**
1. Run tests with `bun test [path]`
2. Verify tests fail for expected reasons (not syntax errors)
3. Check tests pass after implementation exists
4. Confirm cleanup prevents memory leaks

**ITERATE: Fix and Improve**
1. If tests are flaky, increase delays
2. If tests hang, check for missing unmount()
3. If stdout is empty, verify disableConsoleIntercept
4. If keyboard input fails, check escape sequences
</cli_testing_workflow>
```

---

## Test Categories

### 1. Ink Component Tests

Test terminal rendering and user interactions:

```typescript
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ARROW_DOWN = '\x1B[B';
const ENTER = '\r';
const INPUT_DELAY_MS = 50;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('MyComponent', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('should render initial state', () => {
    const { lastFrame, unmount } = render(<MyComponent />);
    cleanup = unmount;

    expect(lastFrame()).toContain('Expected text');
  });

  it('should respond to keyboard input', async () => {
    const { stdin, lastFrame, unmount } = render(<MyComponent />);
    cleanup = unmount;

    await stdin.write(ARROW_DOWN);
    await delay(INPUT_DELAY_MS);

    expect(lastFrame()).toContain('Updated text');
  });
});
```

### 2. oclif Command Tests

Test command execution with flags and arguments:

```typescript
import { runCommand } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

describe("my-command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should execute with default options", async () => {
    const { stdout } = await runCommand(["my-command"]);
    expect(stdout).toContain("Expected output");
  });

  it("should handle --json flag", async () => {
    const { stdout } = await runCommand(["my-command", "--json"]);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty("data");
  });
});
```

### 3. Zustand Store Tests

Test state management without UI:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "../stores/wizard-store";

describe("WizardStore", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("should track navigation history", () => {
    const store = useWizardStore.getState();

    store.setStep("stack");
    store.setStep("confirm");

    expect(useWizardStore.getState().history).toEqual(["approach", "stack"]);
  });
});
```

### 4. Integration Tests

Test full wizard flows from start to finish:

```typescript
describe('Wizard Integration', () => {
  it('should complete full flow', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <Wizard onComplete={onComplete} />
    );
    cleanup = unmount;

    // Step through wizard
    await stdin.write(ARROW_DOWN + ENTER);
    await delay(RENDER_DELAY_MS);

    await stdin.write(ENTER);
    await delay(RENDER_DELAY_MS);

    expect(onComplete).toHaveBeenCalled();
  });
});
```

---

<retrieval_strategy>

## Just-in-Time Loading

**When exploring CLI test patterns:**

- Start with existing tests: `src/cli/**/*.test.ts`
- Look for test helpers: `src/cli/lib/__tests__/helpers.ts`
- Check vitest config: `vitest.config.ts`
- Find component sources when writing component tests

**Tool usage:**

1. Glob to find test files matching patterns
2. Grep to search for specific test patterns
3. Read only files needed for current test

This preserves context window for actual test writing.

</retrieval_strategy>
