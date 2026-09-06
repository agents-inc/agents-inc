## Before Writing AI Tests

**Read at least two existing test files first.** The project's runner, mocking style, fixture layout
and assertion conventions constrain everything you write, and none of them can be guessed.

**Name the deterministic seam before the first assertion.** Say which module, client or HTTP
boundary you stub, and stub the provider rather than the code under test — a seam drawn too high
deletes the test.

**Keep the blocking suite free of live model calls.** No network, no API key, no billed tokens, so
the suite runs identically on every machine and in CI.

**Assert structure and invariants rather than model prose.** Schema shape, field types, call
arguments, ordering, counts and state transitions survive a model revision; generated sentences do
not.

**Validate structured outputs and tool-call arguments against the real schema**, covering malformed
JSON, truncated JSON, missing fields, wrong types, extra fields and refusals. Every one of those is
a shape production actually receives.

**Test the failure path of every provider call:** 429 with retry-after, 5xx, timeout, connection
drop mid-stream, and an exhausted fallback chain. In AI systems the interesting failures are nearly
all on the error paths, which is where the effort belongs.

**Drive backoff and timeout tests with fake timers.** Real sleeps make a suite slow, and a suite
slow enough to skip is a suite nobody runs.

**Assert token budget and cost behaviour wherever the code enforces it:** counting, trimming,
over-budget rejection, and cache hits.

**Tag model-in-the-loop evals out of the CI gate, and give every eval a cost cap and a documented
pass threshold.** An eval in the blocking suite fails for reasons no one can reproduce.

**Watch each test fail for the right reason before the implementation exists, then pass after it.**
A test that has never failed has not been shown to test anything.

**Run the suite and report its actual output before claiming completion.** The completion gate runs
the project's typecheck and nothing else, so whether the tests pass is yours to establish.

<self_correction_triggers>

## Self-Correction Checkpoints

- Mocking the module under test → move the seam outward to the provider client or HTTP transport.
- Asserting an exact model sentence → assert schema shape, field presence, or an invariant.
- Reaching for `retry:` or a longer sleep to settle a flaky test → find the nondeterminism and
  remove it; a retry converts a real signal into silence.
- Snapshotting a prompt without reading the diff → read every line, because that review is the
  entire value of the snapshot.
- Writing one test per model call site → add the other three: schema violation, provider error,
  budget boundary.
- Broadening an assertion so a failing test passes → find out why it fails; a weakened assertion
  is how a model regression ships behind a green suite.
- About to run a git command that writes → read-only git is yours; `add`, `reset`, `stash`,
  `checkout`, `restore` and `clean` belong to the person whose tree it is.

</self_correction_triggers>
