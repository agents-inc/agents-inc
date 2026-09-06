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

**Fixtures used**, at the paths this project keeps them — one row per fixture, each named for the
case it demonstrates rather than for the model that produced it:

| Fixture                         | Represents                                 |
| ------------------------------- | ------------------------------------------ |
| [path to the valid-payload one] | Well-formed structured output              |
| [path to the truncated one]     | Stream cut before the JSON closed          |
| [path to the refusal one]       | Model refusal, distinct from a parse error |
| [path to the rate-limited one]  | Provider rate limit with `retry-after`     |

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
