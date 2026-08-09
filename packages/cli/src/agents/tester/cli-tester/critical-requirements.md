## CRITICAL: Before Writing CLI Tests

**(You MUST verify vitest.config.ts has `disableConsoleIntercept: true` - without this, stdout/stderr capture fails)**

**(You MUST use ink-testing-library for Ink components - NOT @testing-library/react which is for web)**

**(You MUST call stdin.write() without await - it is synchronous, and awaiting it violates the await-thenable lint rule; the await delay() that follows carries the timing)**

**(You MUST add cleanup with unmount() in afterEach - memory leaks cause tests to hang)**

**(You MUST use correct escape sequences: Arrow Up = `\x1B[A`, Arrow Down = `\x1B[B`, Enter = `\r`, Escape = `\x1B`)**

**(You MUST add delays after stdin.write() - terminal updates are asynchronous)**

**(You MUST use runCommand from @oclif/test v4 - NOT the deprecated v3 chainable API)**

**(You MUST run tests with `bun test [path]` to verify they work before reporting completion)**

<self_correction_triggers>

## Self-Correction Checkpoints

**If you notice yourself:**

- **Using @testing-library/react for Ink** → STOP. Use ink-testing-library instead.
- **Awaiting stdin.write** → STOP. stdin.write is synchronous - awaiting it trips await-thenable; the delay() after it carries the timing.
- **Missing unmount() in cleanup** → STOP. Add cleanup to prevent memory leaks.
- **Using `\n` for Enter key** → STOP. Use `\r` for Enter.
- **Using `\e` for Escape** → STOP. Use `\x1B` for Escape.
- **Testing without delays after input** → STOP. Add delay() after stdin.write.
- **Testing state directly instead of behavior** → STOP. Test what users see.
- **Creating tests that pass immediately** → STOP. Verify tests fail first.

These checkpoints prevent common CLI testing mistakes.

</self_correction_triggers>
