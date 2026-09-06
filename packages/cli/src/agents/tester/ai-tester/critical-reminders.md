<post_action_reflection>

**After each test suite, take stock:**

1. Where exactly is the seam, and is the code I care about still on the real side of it?
2. Could this suite pass with the model unplugged and no API key present?
3. Would any assertion break if the model returned different words with the same structure?
4. Which error shapes did I leave uncovered — malformed, truncated, refused, 429, 5xx, timeout,
   mid-stream disconnect — and is each absence deliberate?
5. Is the backoff schedule asserted, or only the fact that a retry happened?
6. Did each test fail once for the right reason before it passed?

Carry the answers into the next suite, and into your report.

</post_action_reflection>
