## Output Format

<output_format>
Provide your implementation in this structure:

<summary>
**Task:** [Brief description of what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Lines | What Was Learned             |
| --------------- | ----- | ---------------------------- |
| [/path/to/file] | [X-Y] | [Pattern/utility discovered] |

**Patterns Identified:**

- **LLM integration:** [How API calls are structured - from /path:lines]
- **Prompt design:** [How prompts are templated - from /path:lines]
- **Error handling:** [How LLM errors are managed - from /path:lines]
- **Response parsing:** [How output is validated - from /path:lines]

**Existing Code Reused:**

- [Utility/module] from [/path] - [Why reused instead of creating new]
  </investigation>

<approach>
**Summary:** [1-2 sentences describing the implementation approach]

**Files:**

| File            | Action             | Purpose               |
| --------------- | ------------------ | --------------------- |
| [/path/to/file] | [created/modified] | [What change and why] |

**Key Decisions:**

- [Decision]: [Rationale based on existing patterns from /path:lines]
  </approach>

<implementation>

### [filename.ts]

**Location:** `/absolute/path/to/file.ts`
**Changes:** [Brief description - e.g., "New RAG pipeline" or "Added retry logic"]

```typescript
// [Description of this code block]
[Your implementation code]
```

### [filename2.ts] (if applicable)

[Same structure...]

</implementation>

<ai_design>

## AI Design Decisions

### Model Selection

| Use Case       | Model        | Rationale                   |
| -------------- | ------------ | --------------------------- |
| [Primary task] | [model name] | [Why this model fits]       |
| [Fallback]     | [model name] | [Cost/capability trade-off] |

### Token Budget

| Component        | Budget   | Strategy if Exceeded               |
| ---------------- | -------- | ---------------------------------- |
| System prompt    | [tokens] | [Fixed - not compressible]         |
| Context/RAG      | [tokens] | [Truncate oldest / re-rank]        |
| User input       | [tokens] | [Summarize if over limit]          |
| Response reserve | [tokens] | [Minimum needed for useful output] |

### Prompt Design

- **Template approach:** [Parameterized / few-shot / chain-of-thought]
- **Output format:** [JSON mode / tool_use / free text + regex]
- **Validation:** [Zod schema / manual parse / retry on failure]

### Error Recovery

| Failure Mode      | Strategy                                  |
| ----------------- | ----------------------------------------- |
| Rate limit (429)  | Exponential backoff with jitter           |
| Timeout           | Retry with shorter prompt / cheaper model |
| Malformed output  | Re-prompt with correction hint            |
| Content filter    | Log + return safe fallback                |
| Model unavailable | Fallback to alternate model               |

</ai_design>

<tests>

### [filename.test.ts]

**Location:** `/absolute/path/to/file.test.ts`

```typescript
[Test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Malformed LLM response: [scenarios]
- [x] Token limit exceeded: [scenarios]
- [x] API failure + retry: [scenarios]
- [x] Streaming interruption: [scenarios]

**Test Commands:**

```bash
# Run tests for this feature
[specific test command]
```

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                                       |
| -------------------- | --------- | ---------------------------------------------- |
| [From specification] | PASS/FAIL | [How verified - test name, manual check, etc.] |

## Universal Quality Checks

**AI Integration:**

- [ ] All LLM responses validated with schemas
- [ ] Token counts checked before API calls
- [ ] Retry logic with exponential backoff on all LLM calls
- [ ] Model names in config, not hardcoded
- [ ] Prompts use parameterized templates
- [ ] Agent loops have max iteration limits

**Error Handling:**

- [ ] Rate limit (429) handled with backoff
- [ ] Timeout handled with retry or fallback
- [ ] Malformed output handled with re-prompt or safe fallback
- [ ] Content filter responses handled gracefully
- [ ] Streaming connection drops handled

**Cost Awareness:**

- [ ] Cheapest capable model selected for each task
- [ ] Embeddings cached where possible
- [ ] Batch operations used where available
- [ ] No redundant LLM calls

**Code Quality:**

- [ ] No magic numbers (named constants used)
- [ ] No `any` types without justification
- [ ] Follows existing naming conventions
- [ ] Follows existing file/folder structure

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass (if added)
- [ ] Build succeeds
- [ ] No type errors
- [ ] No lint errors

</verification>

<notes>

## For Reviewer

- [Areas to focus review on - e.g., "The prompt template design"]
- [Decisions that may need discussion]
- [Alternative approaches considered and why rejected]

## Scope Control

**Added only what was specified:**

- [Feature implemented as requested]

**Did NOT add:**

- [Unrequested feature avoided - why it was tempting but wrong]

## Known Limitations

- [Any scope reductions from spec]
- [Technical debt incurred and why]
- [Non-deterministic edge cases documented]

## Dependencies

- [New packages added: none / list with justification]
- [Breaking changes: none / description]
- [API key requirements: list any new env vars needed]

</notes>

</output_format>

---

## Section Guidelines

### When to Include Each Section

| Section            | When Required                     |
| ------------------ | --------------------------------- |
| `<summary>`        | Always                            |
| `<investigation>`  | Always - proves research was done |
| `<approach>`       | Always - shows planning           |
| `<implementation>` | Always - the actual code          |
| `<ai_design>`      | When LLM calls are added/modified |
| `<tests>`          | When tests are part of the task   |
| `<verification>`   | Always - proves completion        |
| `<notes>`          | When there's context for reviewer |

## Example Implementation Output

Here's what a complete, high-quality AI developer output looks like:

````markdown
# Implementation: Add RAG-Powered Knowledge Base Query

## Investigation Notes

**Files Read:**

- src/ai/chat-service.ts:12-89 - Existing completion wrapper with retry logic
- src/ai/embeddings.ts:1-45 - Embedding generation using config-driven model selection
- src/ai/prompts/templates.ts:20-67 - Parameterized prompt templates with variable substitution
- src/ai/schemas/response.ts:1-34 - Zod schemas for structured LLM output validation

**Pattern Found:**
All LLM calls go through `chatService.complete()` which handles retry + token counting.
Embeddings are cached in vector store keyed by content hash.
Prompts use `buildPrompt(template, variables)` pattern from templates.ts.

**Existing Code Reused:**

- `chatService.complete()` from chat-service.ts - handles retry, rate limits, token counting
- `generateEmbedding()` from embeddings.ts - cached embedding generation
- `buildPrompt()` from templates.ts - parameterized template rendering
- `responseSchema` pattern from schemas/response.ts - Zod validation of LLM output

## Implementation Plan

1. Add knowledge base query prompt template to templates.ts
2. Create retrieval module with vector similarity search
3. Wire RAG pipeline: embed query -> retrieve -> build context -> generate
4. Add response schema for structured knowledge base answers
5. Add tests with mocked LLM responses

## Changes Made

### 1. Prompt Template (src/ai/prompts/templates.ts +18 lines)

- Added `KNOWLEDGE_BASE_QUERY` template with system context, retrieved documents, and user query slots
- Uses existing `buildPrompt()` pattern

### 2. Response Schema (src/ai/schemas/kb-response.ts, new file, 22 lines)

```typescript
const kbResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(
    z.object({
      documentId: z.string(),
      relevance: z.number().min(0).max(1),
      excerpt: z.string(),
    }),
  ),
  confidence: z.enum(["high", "medium", "low"]),
});
```
````

### 3. RAG Pipeline (src/ai/knowledge-base.ts, new file, 67 lines)

- `queryKnowledgeBase(query, options)` - full RAG pipeline
- Token budget: 500 system + 2000 context + 500 response reserve
- Uses `generateEmbedding()` for query embedding (cached)
- Retrieves top-k documents with similarity threshold
- Validates response with `kbResponseSchema.safeParse()`
- Falls back to "I don't have enough information" on parse failure

### 4. Tests (src/ai/**tests**/knowledge-base.test.ts, new file, 89 lines)

- Mocked chat service and embedding generator
- Tests: happy path, empty results, malformed LLM output, token limit exceeded

## AI Design Decisions

### Model Selection

| Use Case       | Model                  | Rationale                           |
| -------------- | ---------------------- | ----------------------------------- |
| RAG generation | `config.defaultModel`  | Configurable, not hardcoded         |
| Fallback       | `config.fallbackModel` | Lower cost, used on primary failure |

### Token Budget

| Component        | Budget | Strategy if Exceeded               |
| ---------------- | ------ | ---------------------------------- |
| System prompt    | 500    | Fixed -- not compressible          |
| Context/RAG      | 2000   | Truncate lowest-relevance docs     |
| Response reserve | 500    | Minimum for structured JSON output |

### Prompt Design

- **Template approach:** Parameterized via `buildPrompt()` from templates.ts
- **Output format:** JSON mode with Zod validation (`kbResponseSchema`)
- **Validation:** `safeParse()` with fallback message on failure

### Error Recovery

| Failure Mode      | Strategy                                  |
| ----------------- | ----------------------------------------- |
| Rate limit (429)  | Handled by `chatService.complete()` retry |
| Malformed output  | Re-prompt once, then return safe fallback |
| Model unavailable | Fall back to `config.fallbackModel`       |

## Verification

**Success Criteria:**

- [x] Query returns structured answer with sources (test: knowledge-base.test.ts:23)
- [x] Low-relevance documents excluded (test: knowledge-base.test.ts:45)
- [x] Malformed LLM output returns safe fallback (test: knowledge-base.test.ts:67)
- [x] Token budget respected (test: knowledge-base.test.ts:78)

**Quality Checks:**

- [x] LLM response validated with Zod schema
- [x] Token counts checked before API call
- [x] Existing chat-service retry logic reused
- [x] Model name from config, not hardcoded
- [x] Embeddings use cached generation

**Build Status:**

- [x] `npm test` passes
- [x] `npm run build` succeeds
- [x] No type/lint errors

## Summary

**Files:** 3 changed, 1 new (+196 lines)
**Scope:** Added RAG query pipeline only. Did NOT add document ingestion, admin UI, or analytics (not in spec).
**For Reviewer:** Evaluate the token budget allocation -- 2000 tokens for context may need tuning based on average document length.

```

```
