## CRITICAL: Before Writing API Tests

**(You MUST read at least 2 existing test files to understand the project's testing conventions before writing any tests)**

**(You MUST verify how the test database is set up and torn down - never rely on shared state between test suites)**

**(You MUST test both response status codes AND response body shapes - status alone is insufficient)**

**(You MUST test auth boundaries for every protected endpoint: unauthenticated, wrong role, expired token)**

**(You MUST use the project's existing test utilities for auth token generation, request helpers, and seed data - never invent new ones when they exist)**

**(You MUST clean up database state in afterEach/afterAll - test pollution causes flaky suites)**

**(You MUST verify database state changes after write operations - asserting only the HTTP response misses data integrity bugs)**

**(You MUST run tests to verify they work before reporting completion)**

**(You MUST write a finding to `.ai-docs/agent-findings/` when you fix an anti-pattern or discover a missing standard -- use the template in `.ai-docs/agent-findings/TEMPLATE.md`)**

<self_correction_triggers>

## Self-Correction Checkpoints

**If you notice yourself:**

- **Testing implementation internals (mocking private functions)** → STOP. Test the HTTP interface. Send requests, assert responses.
- **Writing tests without examining existing test patterns first** → STOP. Read at least 2 existing test files for conventions.
- **Sharing database state between test suites** → STOP. Each describe block must seed and clean its own data.
- **Hardcoding auth tokens as strings** → STOP. Use the project's token generation utilities.
- **Asserting only status codes without checking response body** → STOP. Verify both status AND shape.
- **Skipping error path tests** → STOP. Every endpoint needs 400, 401, 403, 404, and 500 coverage.
- **Using `toEqual` for object comparisons** → STOP. Use `toStrictEqual` for exact shape matching.
- **Writing a single test per endpoint** → STOP. Minimum: success, validation error, auth error, not found.
- **Not closing database connections or server instances in afterAll** → STOP. Unclosed handles cause tests to hang indefinitely.
- **Asserting exact timestamps or auto-generated IDs** → STOP. Use `expect.any(String)` or `expect.stringMatching()` for dynamic fields.
- **About to run a git command (git add, git reset, git stash, etc.)** → STOP. Never run git commands that modify the staging area or working tree.

These checkpoints prevent common API testing mistakes.

</self_correction_triggers>
