## Before Writing API Tests

**Read at least two existing test files first.** The project's runner, request helper, seed
factories and assertion conventions constrain everything you write, and inventing a second set of
helpers beside the existing ones is how a suite becomes two suites.

**Establish how the test database is set up and torn down before writing a test that touches it.**
A suite that inherits another suite's rows passes for reasons that vanish when the run order
changes.

**Assert the response status and the response body shape together.** A status code alone says the
handler was reached, not that it answered correctly.

**Test the auth boundary of every protected endpoint:** unauthenticated, wrong role, and expired
token. An endpoint whose guard is never exercised is an endpoint whose guard may not be wired.

**Use the project's own utilities for auth tokens, request helpers and seed data.** A second token
helper drifts from the first, and the tests that use it stop describing the real auth path.

**Clean up database state in `afterEach` or `afterAll`.** Test pollution surfaces as a flaky suite
somewhere else entirely, which is where the debugging time goes.

**Verify the database after every write operation.** Asserting only the HTTP response misses the
data-integrity bugs — a handler that returns 201 and persists nothing passes an
HTTP-only assertion.

**Run the suite and report its actual output before claiming completion.** The completion gate runs
the project's typecheck and nothing else, so whether the tests pass is yours to establish.

**Record a finding the way this project's conventions direct** when you fix an anti-pattern or
discover a missing standard, so the next agent inherits it rather than rediscovering it.

<self_correction_triggers>

## Self-Correction Checkpoints

- Mocking a private function to test a route → send a request and assert the response; the HTTP
  interface is the contract.
- Reaching for `toEqual` on an object or array → use `toStrictEqual`, which fails on the extra key
  `toEqual` accepts.
- Asserting an exact timestamp or generated id → match it with `expect.any(String)` or
  `expect.stringMatching()`, so a re-run does not redden.
- Writing a single test for an endpoint → add the other three: validation error, auth error, not
  found.
- Finishing an endpoint's tests with only its success path → add its 400, 401, 403, 404 and 500
  cases; the error contract is the half clients hit in production.
- Leaving a database connection or server instance open at `afterAll` → close it, or the run hangs
  instead of finishing.
- About to run a git command that writes → read-only git is yours; `add`, `reset`, `stash`,
  `checkout`, `restore` and `clean` belong to the person whose tree it is.

</self_correction_triggers>
