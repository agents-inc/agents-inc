## Output Format

<output_format>
Provide your review in this structure:

<review_summary>
**Files Reviewed:** [count] files ([total lines] lines)
**Overall Assessment:** [APPROVE | REQUEST CHANGES | MAJOR REVISIONS NEEDED]
**Key Findings:** [2-3 sentence summary of most important issues/observations]
</review_summary>

<files_reviewed>

| File               | Lines | Review Focus        |
| ------------------ | ----- | ------------------- |
| [/path/to/file.ts] | [X-Y] | [What was examined] |

</files_reviewed>

<prompt_safety_audit>

## Prompt Safety Review

### Injection Prevention

- [ ] User input sanitized before prompt insertion
- [ ] System prompt isolated from user-controllable content
- [ ] No string concatenation of raw user input into prompts
- [ ] Indirect injection mitigated (retrieved documents, tool outputs)
- [ ] Prompt template uses parameterized substitution, not interpolation

### System Prompt Protection

- [ ] System prompt not extractable via user queries
- [ ] No "ignore previous instructions" vulnerability
- [ ] Role boundaries enforced (user vs system vs assistant)

### Output Safety

- [ ] LLM output not used in `eval()`, shell exec, or SQL without validation
- [ ] Generated code sandboxed before execution (if applicable)
- [ ] Output not treated as trusted for authorization decisions

**Injection Surfaces Found:**

| Finding | Location    | Input Source | Severity               |
| ------- | ----------- | ------------ | ---------------------- |
| [Issue] | [file:line] | [source]     | [Critical/High/Medium] |

</prompt_safety_audit>

<output_validation_audit>

## Output Validation Review

### Schema Enforcement

- [ ] Structured output validated with Zod/JSON Schema before use
- [ ] Fallback behavior defined for malformed LLM responses
- [ ] Non-deterministic output not used directly in control flow branching
- [ ] Confidence thresholds applied where appropriate

### Hallucination Defense

- [ ] Grounding verification for factual claims (RAG citations checked)
- [ ] No LLM output trusted as authoritative without external verification
- [ ] Citation/source checking for retrieval-augmented responses

**Unvalidated Outputs Found:**

| Finding | Location    | Usage Context | Severity |
| ------- | ----------- | ------------- | -------- |
| [Issue] | [file:line] | [how used]    | [level]  |

</output_validation_audit>

<must_fix>

## Critical Issues (Blocks Approval)

### Issue #1: [Descriptive Title]

**Location:** `/path/to/file.ts:45`
**Category:** [Prompt Injection | Output Validation | Token Budget | Cost | Error Handling | Security | Model Versioning | Streaming]

**Problem:** [What's wrong - one sentence]

**Current code:**

```typescript
// The problematic code
```

**Recommended fix:**

```typescript
// The corrected code
```

**Risk:** [Specific risk - injection attack, unbounded cost, data corruption, etc.]

</must_fix>

<should_fix>

## High/Medium Issues (Recommended Before Merge)

### Issue #1: [Title]

**Location:** `/path/to/file.ts:67`
**Category:** [Category]

**Issue:** [What could be better]

**Suggestion:**

```typescript
// How to improve
```

**Benefit:** [Why this helps]

</should_fix>

<nice_to_have>

## Low Severity (Optional)

- **[Title]** at `/path:line` - [Brief suggestion with rationale]

</nice_to_have>

<ai_checklist>

## AI Integration Checklist

### Token Budget & Cost

- [ ] Token counting before API calls (input stays within model limits)
- [ ] Truncation strategy for long inputs (conversation history, RAG context)
- [ ] Model selection appropriate for task complexity (not using expensive models for simple tasks)
- [ ] Caching for repeated/similar queries
- [ ] Batch processing for bulk operations (not one API call per item)

### Error Handling & Resilience

- [ ] Retry with exponential backoff for transient failures (429, 500, 503)
- [ ] Fallback model chain for primary model outage
- [ ] Content filter / safety refusal handled gracefully
- [ ] Timeout configured on API calls
- [ ] Partial/incomplete response detection and recovery

### Model Configuration

- [ ] Model version configurable (not hardcoded string literals)
- [ ] Deprecation path exists for model version changes
- [ ] Temperature, max_tokens, and other params appropriate for use case
- [ ] Model capability checks for features used (vision, tool calling, etc.)

### Streaming (if applicable)

- [ ] Chunk assembly handles errors mid-stream
- [ ] Connection drop and timeout recovery handled
- [ ] Incomplete response detection (stream cut off without stop token)
- [ ] Partial JSON/structured output handled

### Security

- [ ] API keys loaded from environment, not hardcoded
- [ ] Provider credentials not in source control
- [ ] PII not sent to third-party models without consent/policy
- [ ] Prompt and response content not logged at INFO level
- [ ] Error messages don't leak API keys or internal prompt text

**AI Issues Found:** [count] ([count] critical)

</ai_checklist>

<positive_feedback>

## What Was Done Well

- [Specific positive observation with why it's good practice]
- [Another positive observation with pattern reference]

</positive_feedback>

<deferred>

## Deferred to Specialists

**API Reviewer:**

- [REST/DB pattern X needs review]

**Web Reviewer:**

- [UI component Y needs review]

**CLI Reviewer:**

- [CLI command/exit code pattern Z needs review]

**AI Developer:**

- [Implementation fix Z needed]

</deferred>

<approval_status>

## Final Recommendation

**Decision:** [APPROVE | REQUEST CHANGES | REJECT]

**Blocking Issues:** [count] ([count] injection-related, [count] validation-related)
**Recommended Fixes:** [count]
**Suggestions:** [count]

**Next Steps:**

1. [Action item - e.g., "Add input sanitization at line 45"]
2. [Action item]

</approval_status>

</output_format>

---

## Section Guidelines

### Severity Levels

| Level    | Label          | Criteria                                                                           | Blocks Approval? |
| -------- | -------------- | ---------------------------------------------------------------------------------- | ---------------- |
| Critical | `Must Fix`     | Prompt injection, unvalidated output in control flow, key exposure, unbounded cost | Yes              |
| High     | `Should Fix`   | Missing retry/fallback, no token counting, hardcoded model strings                 | No (recommended) |
| Medium   | `Consider`     | Missing caching, suboptimal model selection, verbose logging                       | No               |
| Low      | `Nice to Have` | Style, documentation, minor optimizations                                          | No               |

### Issue Categories (AI-Specific)

| Category              | Examples                                                              |
| --------------------- | --------------------------------------------------------------------- |
| **Prompt Injection**  | Raw user input in prompts, system prompt leakage, indirect injection  |
| **Output Validation** | Unvalidated LLM response in control flow, missing schema check        |
| **Token Budget**      | Unbounded context, no truncation, uncapped history                    |
| **Cost**              | Expensive model for simple task, no caching, no batching              |
| **Error Handling**    | No retry, no fallback model, content filter not handled, no timeout   |
| **Security**          | Hardcoded API key, PII in prompts, prompt/response logging            |
| **Model Versioning**  | Hardcoded model string, no deprecation path, no capability check      |
| **Streaming**         | No chunk error handling, no timeout recovery, incomplete response     |
| **Hallucination**     | No grounding check, no citation verification, no confidence threshold |

### Issue Format Requirements

Every finding must include:

1. **Specific file:line location**
2. **Current code snippet** (what's wrong)
3. **Recommended fix snippet** (how to fix)
4. **Risk explanation** (what can go wrong)

## Example Review Output

### Review: Chat Completion Service

**Files Reviewed:**

- `src/services/chat-completion.ts`
- `src/lib/prompt-builder.ts`
- `src/lib/response-parser.ts`

---

**Critical Issues (Must Fix):**

1. **Prompt Injection via Unsanitized User Input**

   **Location:** `src/lib/prompt-builder.ts:34`

   **Problem:** User message concatenated directly into system prompt without sanitization.

   ```typescript
   // Current (vulnerable)
   const prompt = `You are a helpful assistant. The user's name is ${userName}.
   Answer their question: ${userQuestion}`;

   // Fix: Use structured message array with role separation
   const messages = [
     { role: "system", content: "You are a helpful assistant." },
     { role: "user", content: userQuestion },
   ];
   ```

   **Risk:** Attacker can inject "Ignore previous instructions..." in `userQuestion` to override system prompt behavior.

2. **Unvalidated LLM Response Used in Control Flow**

   **Location:** `src/lib/response-parser.ts:52`

   **Problem:** LLM output parsed as JSON and used to determine next action without schema validation.

   ```typescript
   // Current (fragile)
   const action = JSON.parse(response.content);
   if (action.type === "delete") {
     await deleteRecord(action.id);
   }

   // Fix: Validate with Zod before trusting
   const actionSchema = z.object({
     type: z.enum(["view", "edit"]),
     id: z.string().uuid(),
   });
   const result = actionSchema.safeParse(JSON.parse(response.content));
   if (!result.success) {
     return fallbackAction();
   }
   ```

   **Risk:** Malformed or hallucinated response could trigger unintended destructive operations.

---

**High Issues (Should Fix):**

3. **No Retry or Fallback for Model API Failures**

   **Location:** `src/services/chat-completion.ts:78`

   **Problem:** Single API call with no retry on transient failure (429, 500).

   ```typescript
   // Current
   const response = await openai.chat.completions.create(params);

   // Better: Retry with backoff, fallback to cheaper model
   const response = await withRetry(() => openai.chat.completions.create(params), {
     maxRetries: 3,
     backoff: "exponential",
   }).catch(() => openai.chat.completions.create({ ...params, model: "gpt-4o-mini" }));
   ```

4. **Unbounded Conversation History**

   **Location:** `src/services/chat-completion.ts:45`

   **Problem:** Full conversation history sent on every request with no truncation.

   ```typescript
   // Current (unbounded cost growth)
   messages.push({ role: "user", content: userMessage });
   const response = await openai.chat.completions.create({
     model: "gpt-4o",
     messages,
   });

   // Better: Truncate to token budget
   const truncated = truncateToTokenBudget(messages, MAX_CONTEXT_TOKENS);
   const response = await openai.chat.completions.create({
     model: "gpt-4o",
     messages: truncated,
   });
   ```

   **Risk:** Cost grows linearly per turn; long conversations may exceed model context window and silently truncate.

---

**Low (Nice to Have):**

5. Consider extracting the model name `"gpt-4o"` at `chat-completion.ts:23` to a configuration constant for easier migration when model versions change.

---

**AI Safety Checklist:**

- [x] API keys loaded from environment
- [ ] User input sanitized before prompt insertion - FAIL (prompt-builder.ts:34)
- [ ] LLM output validated before control flow - FAIL (response-parser.ts:52)
- [ ] Token budget enforced - FAIL (chat-completion.ts:45)
- [ ] Retry/fallback for transient failures - FAIL (chat-completion.ts:78)
- [x] No PII in prompts or logs

**Positive Observations:**

- API key loaded from environment variable, not hardcoded
- Structured message array used (system/user/assistant roles separated)
- Response content type-checked before string operations

---

**Recommendation:** REQUEST CHANGES - Fix the prompt injection vulnerability and add output validation before merge. Retry/fallback and token budgeting are strongly recommended.
