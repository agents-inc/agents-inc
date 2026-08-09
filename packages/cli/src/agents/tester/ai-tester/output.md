## Output Format

<output_format>
Provide your AI test output in this structure:

<test_summary>
**Feature:** [What's being tested - e.g., "Support agent loop with order lookup tool"]
**Test File:** [/path/to/feature.test.ts]
**Test Count:** [X] deterministic tests across [Y] categories, [Z] evals
**Seam:** [Exact module or boundary stubbed - e.g., "provider SDK client via `createScriptedModel`"]
**Status:** [All deterministic tests failing - ready for implementation | All passing - verified]
</test_summary>

<determinism_report>

## Determinism Classification

| Behavior                       | Classification  | Suite              | Gate          |
| ------------------------------ | --------------- | ------------------ | ------------- |
| [Prompt assembly]              | Deterministic   | `src/ai/*.test.ts` | Blocking (CI) |
| [Schema validation of output]  | Deterministic   | `src/ai/*.test.ts` | Blocking (CI) |
| [Retry and fallback paths]     | Deterministic   | `src/ai/*.test.ts` | Blocking (CI) |
| [Answer quality / tool choice] | Model-dependent | `evals/*.eval.ts`  | Reported only |

**Live model calls in the blocking suite:** 0
**Network access in the blocking suite:** none (transport stubbed)

</determinism_report>

<test_suite>

## Test Coverage Summary

| Category                | Count   | Description                                            |
| ----------------------- | ------- | ------------------------------------------------------ |
| Prompt Assembly         | [X]     | Message order, templates, truncation, escaping         |
| Context Construction    | [X]     | Chunking, retrieval order, dedupe, budget trimming     |
| Request Assertions      | [X]     | Model id, params, tool definitions, redaction          |
| Structured Output       | [X]     | Valid, malformed, truncated, missing fields, refusals  |
| Tool Calls & Agent Loop | [X]     | Dispatch, bad arguments, unknown tools, iteration caps |
| Resilience              | [X]     | 429, 5xx, timeout, backoff schedule, fallback chain    |
| Streaming               | [X]     | Chunk assembly, partial JSON, disconnect, abort        |
| Token & Cost Budgets    | [X]     | Counting, trimming, ceilings, cache hits               |
| Prompt Regression       | [X]     | Rendered-prompt snapshots under review                 |
| Safety (deterministic)  | [X]     | Trust boundaries, escaping, redaction, sanitization    |
| **Total (blocking)**    | **[X]** |                                                        |
| Evals (non-blocking)    | [Z]     | Golden dataset, graders, thresholds                    |

</test_suite>

<mocking_setup>

## Seam and Fixtures

**Seam:** [Module stubbed and why that level was chosen]

| Dependency        | Stub                         | Why stubbed                         |
| ----------------- | ---------------------------- | ----------------------------------- |
| [Provider client] | `createScriptedModel([...])` | Deterministic turns, captured calls |
| [Embedder]        | `createStubEmbedder({...})`  | Fixed vectors, no network           |
| [Vector store]    | [In-memory fixture store]    | Deterministic retrieval order       |
| [Clock / timers]  | `vi.useFakeTimers()`         | Backoff and timeout without waiting |

**Fixtures used:**

| Fixture                                 | Represents                                 |
| --------------------------------------- | ------------------------------------------ |
| `fixtures/ai/extraction-valid.json`     | Well-formed structured output              |
| `fixtures/ai/extraction-truncated.json` | Stream cut before the JSON closed          |
| `fixtures/ai/refusal.json`              | Model refusal, distinct from a parse error |
| `fixtures/ai/rate-limit-429.json`       | Provider rate limit with `retry-after`     |

**Recording provenance:** [Where fixtures came from, what was redacted, when re-recorded]

</mocking_setup>

<test_code>

## Test File

**File:** `/path/to/feature.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// ... project helpers, fixtures, scripted model factory

describe("[AI Feature]", () => {
  beforeEach(() => {
    // Reset stubs, fixtures, and any shared cache
  });

  describe("Prompt Assembly", () => {
    it("[places system prompt first and user content last]", () => {});
  });

  describe("Structured Output", () => {
    it("[returns typed data for a valid payload]", () => {});
    it("[returns a typed error for truncated JSON]", () => {});
  });

  describe("Tool Calls & Agent Loop", () => {
    it("[dispatches the tool and feeds the result back]", async () => {});
    it("[stops at the iteration cap]", async () => {});
  });

  describe("Resilience", () => {
    it("[retries a 429 after the advertised delay]", async () => {});
    it("[falls back once the primary model is exhausted]", async () => {});
  });

  describe("Streaming", () => {
    it("[returns partial text when the stream drops]", async () => {});
  });

  describe("Budgets", () => {
    it("[rejects a request that cannot fit after trimming]", () => {});
  });
});
```

</test_code>

<coverage_analysis>

## Behaviors Covered

### Prompt & Context

- [Message ordering and role assignment]
- [History truncation at the configured limit]
- [Retrieved passages ordered by score and deduplicated]
- [Context trimmed to the token budget, system prompt preserved]

### Output Handling

- [Valid payload parses to the declared type]
- [Malformed, truncated, and prose-wrapped JSON produce typed errors]
- [Refusals are distinguishable from parse failures]

### Loop & Tools

- [Tool arguments validated before dispatch]
- [Unknown tool reported back rather than crashing]
- [Iteration cap terminates the loop with a stop reason]

### Resilience

- [429 retried after `retry-after`; 400 not retried]
- [Backoff schedule asserted with fake timers]
- [Fallback model used after the primary is exhausted]
- [Timeout aborts the in-flight request]

### Budgets

- [Token counting covers the full request]
- [Cost ceiling halts the loop]
- [Cache prevents a duplicate model call]

## What's NOT Covered (Intentionally)

- [Answer quality] - measured in `evals/*.eval.ts`, not asserted here
- [Provider SDK internals] - covered by the SDK's own tests
- [Exact generated wording] - unstable across model revisions

</coverage_analysis>

<eval_report>

## Evals (Non-Blocking)

| Eval                  | Dataset                       | Grader           | Threshold | Samples |
| --------------------- | ----------------------------- | ---------------- | --------- | ------- |
| [Schema validity]     | `datasets/support.jsonl` (v3) | Schema parse     | ≥ 0.98    | 1       |
| [Tool selection]      | `datasets/support.jsonl` (v3) | Exact match      | ≥ 0.90    | 3       |
| [Answer groundedness] | `datasets/support.jsonl` (v3) | Pinned LLM judge | ≥ 0.85    | 3       |

**Cost cap:** [$X per run] | **Excluded from CI by:** [tag / path / config flag]
**Provenance recorded:** model id, model version, dataset revision, run date

</eval_report>

<test_status>

## Current Status

**Deterministic tests:** [FAILING - expected, no implementation yet | PASSING]

**Verification:**

- [ ] Tests fail for the RIGHT reasons (not import or setup errors)
- [ ] Suite run twice with identical results
- [ ] Zero live model calls, zero network access, zero API keys required
- [ ] No unclosed streams, timers, or handles
- [ ] Evals excluded from the default test command

**Ready for:** [ai-developer implementation | review]

</test_status>

<verification_commands>

## Verification

```bash
# Run the deterministic suite (use the project's test command)
npm test -- [path/to/feature.test.ts]

# Run twice to confirm stability
npm test -- [path/to/feature.test.ts] && npm test -- [path/to/feature.test.ts]

# Run the evals explicitly (never part of CI)
npm run eval -- [path/to/feature.eval.ts]
```

**Expected results:**

- Deterministic suite: all pass, identical on every run, no network
- Evals: report rates against thresholds and actual cost

</verification_commands>

<test_patterns_used>

## Patterns Applied

| Pattern                     | Usage                                                        |
| --------------------------- | ------------------------------------------------------------ |
| Scripted provider stub      | Ordered responses per call; script exhaustion asserted       |
| Captured request assertions | Model id, params, and tool definitions verified on each call |
| Fixture-driven parsing      | Recorded and hand-written payloads for every malformed shape |
| Fake timers                 | Backoff schedule and timeout without real delays             |
| File snapshots              | Rendered prompts reviewed as diffs                           |
| Invariant assertions        | Ordering, counts, schema shape - never generated prose       |
| Eval separation             | Model-in-the-loop suite tagged out of the CI gate            |

</test_patterns_used>

</output_format>

---

## Section Guidelines

### AI Test Quality Requirements

| Requirement                       | Description                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| **Named seam**                    | Every suite states where the model was stubbed and why           |
| **No live calls in CI**           | Blocking tests need no key, no network, no billed tokens         |
| **Error paths first-class**       | Malformed output, 429, timeout, and stream drop each have a test |
| **Structural assertions**         | Shape, arguments, ordering, and state - never model prose        |
| **Deterministic by construction** | Fake timers, injected clock, seeded RNG, isolated fixtures       |
| **Evals separated and capped**    | Tagged out of CI, with thresholds, sample counts, and a cost cap |
| **Red before green**              | Every test observed failing for the right reason at least once   |

### Minimum Coverage Per Model Call Site

| Case             | What it proves                                               |
| ---------------- | ------------------------------------------------------------ |
| Success          | Request parameters are correct and the response is parsed    |
| Schema violation | Bad output produces a typed error, not a crash or silent nil |
| Provider error   | Retry, fallback, or a clear typed failure                    |
| Budget boundary  | Trimming or rejection happens before the call is billed      |

### Assertion Style

```typescript
// Good - stable across model revisions
expect(result.ok).toBe(true);
expect(result.value).toStrictEqual({ name: "Ada", role: "engineer" });
expect(model.calls[0]).toMatchObject({ model: SUPPORT_MODEL_ID, temperature: 0 });
expect(result.stopReason).toBe("max_steps");

// Bad - asserts the model's wording, not your code
expect(result.text).toBe("Your order will arrive tomorrow.");
expect(result.text).toContain("I'd be happy to help");
```

### Red-Green Contract

1. **RED:** deterministic tests fail for the right reason, with the seam and fixtures in place
2. **GREEN:** ai-developer implements until they pass, without editing the tests
3. **VERIFY:** suite is stable across repeated runs; evals report separately

## Example Test Output

Here's what a complete, high-quality AI test handoff looks like:

```markdown
# Test Suite: Support Agent Loop

## Test File

`src/ai/support/__tests__/support-agent.test.ts`

## Seam

Provider SDK client, stubbed with `createScriptedModel([...])` from `tests/helpers/scripted-model.ts`.
Prompt builder, parser, tool dispatcher, retry wrapper, and budget logic all run for real.

## Coverage Summary

- Prompt Assembly: 4 tests
- Context Construction: 5 tests
- Request Assertions: 3 tests
- Structured Output: 8 tests
- Tool Calls & Agent Loop: 6 tests
- Resilience: 6 tests
- Streaming: 5 tests
- Token & Cost Budgets: 4 tests
- Safety (deterministic): 3 tests
- **Total blocking: 44 tests**
- Evals: 3 (excluded from CI)

## Determinism Classification

Blocking: everything above. Zero live model calls; the HTTP transport throws if reached.
Reported only: answer groundedness, tool-selection accuracy, schema-validity rate.

## Test Categories

### Structured Output

- valid payload parses to Extraction
- malformed JSON returns invalid_model_output
- truncated JSON returns invalid_model_output
- prose-wrapped JSON returns invalid_model_output
- missing required field rejected
- wrong field type rejected
- unknown field rejected
- refusal returns kind "refusal", not a parse error

### Resilience

- 429 retried after retry-after (2s, fake timers)
- backoff schedule is [500ms, 1000ms] across two 5xx failures
- retry ceiling produces model_unavailable
- 400 is not retried
- fallback model answers after the primary is exhausted
- timeout aborts the in-flight request and propagates the abort signal

### Streaming

- chunks assemble in order
- partial JSON is not parsed until complete
- mid-stream disconnect returns stop_reason "stream_error" plus partial text
- abort stops chunk delivery immediately
- usage recorded from the terminal event

## Evals

`evals/support-agent.eval.ts` against `evals/datasets/support.jsonl` (v3, 120 cases).
Thresholds: schema validity ≥ 0.98 (1 sample), tool selection ≥ 0.90 (3 samples),
groundedness ≥ 0.85 (3 samples, pinned judge model and snapshotted judge prompt).
Cost cap $4.00 per run. Excluded from CI by the `*.eval.ts` path exclusion in the test config.

## Test Status

All 44 blocking tests: FAILING (ready for implementation)
Verified failing for the right reasons; no import or setup errors.

## Investigation Findings

- Test runner: vitest; fake timers available and already used elsewhere
- Existing helper `createScriptedModel` reused from tests/helpers (not rebuilt)
- Fixtures recorded from the provider and redacted; stored in tests/fixtures/ai/
- Tokenizer: the project's `countTokens` wrapper; budget logic asserted around it

## For ai-developer

- Parser must return a typed Result, never throw, and must distinguish refusals
- Retry wrapper must read `retry-after` and skip retries for 4xx other than 429
- Loop must terminate with an explicit stop reason: "done", "max_steps", or "cost_ceiling"
- Reuse the existing budget helper; do not add a second token counter
```
