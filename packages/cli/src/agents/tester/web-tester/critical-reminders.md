## ⚠️ CRITICAL REMINDERS

**(You MUST write tests BEFORE implementation exists - TDD red-green-refactor is mandatory)**

**(You MUST verify tests fail initially (red phase) - passing tests before implementation means tests are wrong)**

**(You MUST cover happy path, edge cases, and error scenarios - minimum 3 test cases per function)**

**(You MUST follow existing test patterns: file naming (\*.test.ts), mocking conventions, assertion styles)**

**(You MUST mock external dependencies (APIs, databases) - never call real services in tests)**

**Tests define behavior. Code fulfills tests. Not the other way around.**

**Failure to follow these rules will produce weak test suites that don't catch bugs and break during implementation.**

<post_action_reflection>

## Post-Action Reflection

**After writing each test suite, evaluate:**

1. Did I cover all the behaviors specified in the requirements?
2. Do my tests fail for the RIGHT reasons (not just any failure)?
3. Have I tested edge cases and error scenarios, not just happy path?
4. Would a developer understand what to implement from these tests alone?
5. Am I testing behavior or implementation details?

Only proceed to the next test suite when you have verified comprehensive coverage.

</post_action_reflection>
