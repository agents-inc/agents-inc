## Output Format

<output_format>
Provide your CLI test output in this structure:

<test_summary>
**Feature:** [What's being tested - e.g., "init command wizard flow"]
**Test File:** [/path/to/feature.test.ts or .test.tsx]
**Test Count:** [X] tests across [Y] categories
**Test Type:** [Component | Command | Store | Integration]
**Status:** [All tests passing | Tests written - ready for verification]
</test_summary>

<test_suite>

## Test Coverage Summary

| Category          | Count   | Description                       |
| ----------------- | ------- | --------------------------------- |
| Rendering         | [X]     | Initial display and static output |
| Keyboard Nav      | [X]     | Arrow keys, selection, navigation |
| Input Handling    | [X]     | Text input, special keys          |
| State Transitions | [X]     | Zustand store changes             |
| File System       | [X]     | Created/modified files            |
| Error Handling    | [X]     | Invalid input, failures           |
| **Total**         | **[X]** |                                   |

</test_suite>

<test_code>

## Test File

**File:** `/path/to/feature.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
// ... other imports

// Escape sequence constants
const ARROW_UP = '\x1B[A';
const ARROW_DOWN = '\x1B[B';
const ENTER = '\r';
const ESCAPE = '\x1B';

// Timing constants
const INPUT_DELAY_MS = 50;
const RENDER_DELAY_MS = 100;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('[Feature Name]', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe('Rendering', () => {
    it('should display initial state', () => {
      const { lastFrame, unmount } = render(<Component />);
      cleanup = unmount;

      expect(lastFrame()).toContain('Expected text');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate with arrow keys', async () => {
      const { stdin, lastFrame, unmount } = render(<Component />);
      cleanup = unmount;

      await stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(lastFrame()).toContain('Selected item');
    });
  });

  describe('Selection', () => {
    it('should select item on enter', async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = render(<Component onSelect={onSelect} />);
      cleanup = unmount;

      await stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      // Test implementation
    });
  });
});
```

</test_code>

<coverage_analysis>

## Behaviors Covered

### Rendering

- [What displays on initial render]
- [How content updates on rerender]

### Keyboard Navigation

- [Arrow up/down behavior]
- [Home/End key behavior if applicable]
- [Tab navigation if applicable]

### Selection & Input

- [Enter key selection]
- [Text input handling]
- [Escape for cancel/back]

### State Transitions

- [Store state after actions]
- [History tracking]
- [Reset behavior]

### File System (for commands)

- [Files created]
- [Files modified]
- [Directory structure]

### Error Handling

- [Invalid input responses]
- [API/network failures]
- [Missing configuration]

## What's NOT Covered (Intentionally)

- [Excluded scenario] - [Reason]
- [Excluded scenario] - [Reason]

</coverage_analysis>

<verification_commands>

## Verification

**Run tests:**

```bash
# Run specific test file
bun test [path/to/feature.test.ts]

# Run with verbose output
bun test [path/to/feature.test.ts] --reporter=verbose

# Run all CLI tests
bun test src/cli/

# Run integration tests only
bun test src/cli/lib/__tests__/integration.test.ts
```

**Expected results:**

- All tests should pass
- No hanging tests (indicates cleanup issues)
- No flaky tests (indicates timing issues)

</verification_commands>

<test_patterns_used>

## Patterns Applied

| Pattern              | Usage                                       |
| -------------------- | ------------------------------------------- |
| Cleanup in afterEach | `cleanup?.(); cleanup = undefined;`         |
| Async stdin          | `await stdin.write(KEY); await delay(MS);`  |
| Terminal assertions  | `expect(lastFrame()).toContain('text')`     |
| Temp directory       | `mkdtemp` + `rm` in before/afterEach        |
| Mock functions       | `vi.fn()` for callbacks                     |
| Store reset          | `useStore.getState().reset()` in beforeEach |

</test_patterns_used>

</output_format>

---

## Section Guidelines

### CLI Test Quality Requirements

| Requirement                   | Description                               |
| ----------------------------- | ----------------------------------------- |
| **Cleanup in afterEach**      | All tests must unmount components         |
| **Async stdin handling**      | All stdin.write calls must be awaited     |
| **Proper escape sequences**   | Use constants, not string literals        |
| **Delays after input**        | Terminal updates are async                |
| **Temp directory isolation**  | Command tests use unique temp directories |
| **Store reset between tests** | Zustand stores reset in beforeEach        |

### Escape Sequence Reference

| Key         | Sequence | Constant      |
| ----------- | -------- | ------------- |
| Arrow Up    | `\x1B[A` | `ARROW_UP`    |
| Arrow Down  | `\x1B[B` | `ARROW_DOWN`  |
| Arrow Left  | `\x1B[D` | `ARROW_LEFT`  |
| Arrow Right | `\x1B[C` | `ARROW_RIGHT` |
| Enter       | `\r`     | `ENTER`       |
| Escape      | `\x1B`   | `ESCAPE`      |
| Tab         | `\t`     | `TAB`         |
| Backspace   | `\x7F`   | `BACKSPACE`   |
| Ctrl+C      | `\x03`   | `CTRL_C`      |

### Test File Location Convention

| Test Type   | Location                                    |
| ----------- | ------------------------------------------- |
| Unit tests  | `src/cli/**/__tests__/*.test.ts`            |
| Lib tests   | `src/cli/lib/*.test.ts`                     |
| Integration | `src/cli/lib/__tests__/integration.test.ts` |
| E2E tests   | `tests/e2e/*.test.ts`                       |

## Example Test Output

Here's what a complete, high-quality CLI test file handoff looks like:

```markdown
# Test Suite: Init Wizard Component

## Test File

`src/cli/commands/init/__tests__/init-wizard.test.tsx`

## Coverage Summary

- Rendering: 3 tests
- Keyboard Navigation: 4 tests
- Input Handling: 3 tests
- State Transitions: 2 tests
- Error Handling: 2 tests
- **Total: 14 tests**

## Test Categories

### Rendering

- displays welcome message on initial render
- shows all available options in selection list
- renders current step indicator

### Keyboard Navigation

- moves selection down with Arrow Down
- moves selection up with Arrow Up
- wraps selection at boundaries
- navigates between wizard steps

### Input Handling

- selects current option on Enter
- cancels wizard on Escape
- handles text input for project name

### State Transitions

- updates store when selection changes
- tracks navigation history for back button

### Error Handling

- displays error when directory already exists
- allows retry after validation failure

## Test Status

All tests: FAILING (ready for implementation)

## Escape Sequences Used

| Key        | Constant     | Value    |
| ---------- | ------------ | -------- |
| Arrow Down | `ARROW_DOWN` | `\x1B[B` |
| Arrow Up   | `ARROW_UP`   | `\x1B[A` |
| Enter      | `ENTER`      | `\r`     |
| Escape     | `ESCAPE`     | `\x1B`   |

## Expected Patterns

Developer should implement to make these tests pass:

- Use Zustand store for wizard state
- Use ink-testing-library for component tests
- Add delays after stdin.write calls
- Implement unmount cleanup in afterEach
```

This handoff gives the developer:

- Clear understanding of what to test
- Specific keyboard interactions to verify
- Pattern references for CLI test implementation
- Escape sequence reference for correct input simulation
