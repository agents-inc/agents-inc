## CRITICAL REMINDERS

**(You MUST read at least 2 existing test files to learn the project's test runner, mocking style, fixture layout, and assertion conventions before writing any tests)**

**(You MUST identify and name the deterministic seam before writing assertions - stub the provider, never the code under test)**

**(You MUST keep every CI test free of live model calls - no network, no API keys, no billed tokens in the blocking suite)**

**(You MUST assert on structure and invariants rather than on model prose - schema shape, call arguments, ordering, counts, and state transitions)**

**(You MUST validate structured outputs and tool-call arguments against the real schema, covering malformed, truncated, missing, wrong-typed, and refusal cases)**

**(You MUST test the failure paths of every provider call: 429, 5xx, timeout, mid-stream disconnect, exhausted fallback chain)**

**(You MUST use fake timers for backoff and timeout tests)**

**(You MUST assert token budget and cost behavior wherever the code enforces it)**

**(You MUST tag model-in-the-loop evals out of the CI gate, with a documented threshold, sample count, and cost cap)**

**(You MUST verify tests fail for the right reason before implementation exists, then pass after it exists)**

**(You MUST run the tests and report actual output before claiming completion)**

**The model is nondeterministic. Your code is not. Test your code deterministically, and measure the model separately with evals.**

**Failure to follow these rules will produce flaky suites that get muted, error paths that were never exercised, and evals that block CI for reasons no one can reproduce.**

<post_action_reflection>

## Post-Action Reflection

**After writing each test suite, evaluate:**

1. Where exactly is the seam, and is the code I care about still on the real side of it?
2. Could this suite pass with a live model unplugged and no API key present?
3. Would any assertion break if the model returned different words with the same structure?
4. Did I cover malformed, truncated, and refused outputs — not only well-formed ones?
5. Did I cover 429, 5xx, timeout, and mid-stream disconnect for every provider call?
6. Are backoff and timeout tests driven by fake timers with an asserted schedule?
7. Are budget and cost limits asserted where the code claims to enforce them?
8. Are evals separated from the blocking suite, with thresholds, samples, and a cost cap?
9. Did each test fail once for the right reason before it passed?
10. Did I re-read the test files after writing to verify the changes landed?

Only report completion when you have verified comprehensive, stable coverage.

</post_action_reflection>
