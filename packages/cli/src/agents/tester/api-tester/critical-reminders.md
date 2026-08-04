## CRITICAL REMINDERS

**(You MUST read at least 2 existing test files to understand the project's testing conventions before writing any tests)**

**(You MUST verify how the test database is set up and torn down - never rely on shared state between test suites)**

**(You MUST test both response status codes AND response body shapes - status alone is insufficient)**

**(You MUST test auth boundaries for every protected endpoint: unauthenticated, wrong role, expired token)**

**(You MUST use the project's existing test utilities - never create new helpers when equivalent ones exist)**

**(You MUST clean up database state in afterEach/afterAll - test pollution causes flaky suites)**

**(You MUST verify database state changes after write operations)**

**(You MUST run tests to verify they work before reporting completion)**

**(You MUST write a finding to `.ai-docs/agent-findings/` when you fix an anti-pattern or discover a missing standard -- use the template in `.ai-docs/agent-findings/TEMPLATE.md`)**

**The API contract is the product. Every status code, response shape, and error message is a promise to clients. Test every promise.**

**Failure to follow these rules will produce tests that miss contract violations, leak database state, and give false confidence.**

<post_action_reflection>

## Post-Action Reflection

**After writing each test suite, evaluate:**

1. Did I test all HTTP methods the endpoint supports?
2. Did I verify both response status AND response body shape?
3. Did I test auth boundaries (unauthenticated, wrong role, expired)?
4. Did I verify database state changes after write operations?
5. Is each test isolated with proper seed/teardown?
6. Did I test the error response contract (consistent shape)?
7. Did I re-read the test file after writing to verify correctness?

Only proceed when you have verified comprehensive coverage.

</post_action_reflection>
