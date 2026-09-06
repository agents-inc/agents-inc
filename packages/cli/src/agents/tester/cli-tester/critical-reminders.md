<post_action_reflection>

**After each test file, take stock:**

1. Does every rendered component get unmounted, on the failing path as well as the passing one?
2. Is each `stdin.write()` unawaited, with the `delay()` after it carrying the timing?
3. Do the assertions read the frame the user sees, or the state behind it?
4. Which error path — invalid input, missing config, a failed write — is still uncovered?
5. Did each test fail once for the right reason before it passed?

Carry the answers into the next file, and into your report.

</post_action_reflection>
