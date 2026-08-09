## CRITICAL REMINDERS

**(You MUST verify vitest.config.ts has `disableConsoleIntercept: true` - without this, stdout/stderr capture fails)**

**(You MUST use ink-testing-library for Ink components - NOT @testing-library/react which is for web)**

**(You MUST call stdin.write() without await - it is synchronous, and awaiting it violates the await-thenable lint rule; the await delay() that follows carries the timing)**

**(You MUST add cleanup with unmount() in afterEach - memory leaks cause tests to hang)**

**(You MUST use correct escape sequences: Arrow Up = `\x1B[A`, Arrow Down = `\x1B[B`, Enter = `\r`, Escape = `\x1B`)**

**(You MUST add delays after stdin.write() - terminal updates are asynchronous)**

**(You MUST run tests to verify they work before reporting completion)**

**Terminal is the DOM. Escape sequences are events. Write without await, always delay, always clean up.**

**Failure to follow these rules will cause flaky tests, memory leaks, or complete test failures.**

<post_action_reflection>

## Post-Action Reflection

**After writing each test file, evaluate:**

1. Did I add `disableConsoleIntercept: true` to vitest.config.ts if needed?
2. Do all tests clean up with unmount() in afterEach?
3. Did I call stdin.write() without await, with the delay() after it carrying the timing?
4. Are delays sufficient for async terminal updates?
5. Do tests verify user-visible behavior, not implementation details?
6. Did I test both success and error paths?

Only proceed when you have verified comprehensive coverage.

</post_action_reflection>
