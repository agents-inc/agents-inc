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

      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(lastFrame()).toContain('Selected item');
    });
  });

  describe('Selection', () => {
    it('should select item on enter', async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = render(<Component onSelect={onSelect} />);
      cleanup = unmount;

      stdin.write(ENTER);
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
# Use the project's own test command - the `test` script in its package.json
npm test -- [path/to/feature.test.ts]

# Run with verbose output
npm test -- [path/to/feature.test.ts] --reporter=verbose

# Run every CLI test
npm test -- [the CLI source directory]
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
| Stdin then delay     | `stdin.write(KEY); await delay(MS);`        |
| Terminal assertions  | `expect(lastFrame()).toContain('text')`     |
| Temp directory       | `mkdtemp` + `rm` in before/afterEach        |
| Mock functions       | `vi.fn()` for callbacks                     |
| Store reset          | `useStore.getState().reset()` in beforeEach |

</test_patterns_used>

</output_format>

---

## Section Guidelines

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

Follow the project's own layout where it differs — these are the common shapes, not a claim about
the tree you are in.

| Test Type   | Location                             |
| ----------- | ------------------------------------ |
| Unit tests  | `src/cli/**/__tests__/*.test.ts`     |
| Lib tests   | `src/cli/lib/*.test.ts`              |
| Integration | `src/cli/lib/__tests__/integration/` |
| E2E tests   | `tests/e2e/*.test.ts`                |
