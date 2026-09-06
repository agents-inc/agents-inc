## Output Format

<output_format>

Report your implementation in this structure.

<summary>
**Task:** [what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Symbol read       | What it showed             |
| --------------- | ----------------- | -------------------------- |
| [/path/to/file] | [function / type] | [pattern or utility found] |

**Patterns Identified:**

- **LLM integration:** [how calls are wrapped — from /path, naming the symbol]
- **Prompt design:** [how prompts are templated — from /path, naming the symbol]
- **Error handling:** [how failures are handled — from /path, naming the symbol]
- **Response parsing:** [how output is validated — from /path, naming the symbol]

**Existing Code Reused:**

- [utility or module] from [/path] — [why reused rather than written]
  </investigation>

<approach>
**Summary:** [the implementation approach, in a sentence or two]

**Files:**

| File            | Action             | Purpose                |
| --------------- | ------------------ | ---------------------- |
| [/path/to/file] | [created/modified] | [what changed and why] |

**Key Decisions:**

- [decision]: [the existing pattern it follows, and where that pattern lives]
  </approach>

<implementation>

### [filename.ts]

**Location:** `/absolute/path/to/file.ts`
**Changes:** [e.g. "new RAG pipeline" or "added retry logic"]

```typescript
// [what this block does]
[implementation code]
```

**Design Notes:**

- [why this approach]
- [the existing pattern it matches]

</implementation>

<ai_design>

## AI Design Decisions

### Model Selection

| Use Case       | Model        | Rationale                   |
| -------------- | ------------ | --------------------------- |
| [primary task] | [model name] | [why this model fits]       |
| [fallback]     | [model name] | [cost/capability trade-off] |

### Token Budget

| Component        | Budget   | Strategy if Exceeded          |
| ---------------- | -------- | ----------------------------- |
| System prompt    | [tokens] | [fixed — not compressible]    |
| Context / RAG    | [tokens] | [truncate oldest, or re-rank] |
| User input       | [tokens] | [summarise if over limit]     |
| Response reserve | [tokens] | [minimum for a useful output] |

### Prompt Design

- **Template approach:** [parameterised / few-shot / chain-of-thought]
- **Output format:** [JSON mode / tool use / free text]
- **Validation:** [the schema, and what happens when it fails]

### Error Recovery

| Failure Mode      | Strategy                                     |
| ----------------- | -------------------------------------------- |
| Rate limit (429)  | Exponential backoff with jitter              |
| Timeout           | Retry with a shorter prompt or cheaper model |
| Malformed output  | Re-prompt with a correction hint             |
| Content filter    | Log, and return a safe fallback              |
| Model unavailable | Fall back to the alternate model             |

</ai_design>

<tests>

### [filename.test.ts]

**Location:** `/absolute/path/to/file.test.ts`

```typescript
[test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Malformed model response: [scenarios]
- [x] Token limit exceeded: [scenarios]
- [x] API failure and retry: [scenarios]
- [x] Streaming interruption: [scenarios]

**Test command:** `[the command that runs these]`

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                             |
| -------------------- | --------- | ------------------------------------ |
| [from specification] | PASS/FAIL | [test name, command, or observation] |

## Quality Checks

**AI integration:**

- [ ] Every response validated against a schema
- [ ] Token counts checked before each call
- [ ] Retries using exponential backoff with jitter
- [ ] Model names read from configuration
- [ ] Prompts built from parameterised templates
- [ ] Agent loops bounded by a maximum iteration count

**Error handling:**

- [ ] Rate limits (429) backed off rather than retried harder
- [ ] Timeouts retried, or failed over to the fallback
- [ ] Malformed output re-prompted once, then answered with a safe fallback
- [ ] Content-filtered responses handled rather than treated as an error
- [ ] Dropped streams handled mid-response

**Cost:**

- [ ] The cheapest capable model chosen for each task
- [ ] Embeddings cached, so the same text is not embedded twice
- [ ] Batch endpoints used where the work allows it
- [ ] No call whose result the pipeline already has

**Code Quality:**

- [ ] Named constants rather than magic numbers
- [ ] No `any` without a justification in a comment
- [ ] Naming and file placement match the files you read

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass
- [ ] Build succeeds, with no type or lint errors

</verification>

<notes>

## For Reviewer

- [where to focus — e.g. the prompt template design]
- [decisions worth discussing]
- [alternatives considered and rejected]

## Scope Control

**Added:** [what the spec asked for]
**Did not add:** [what was tempting and out of scope]

## Known Limitations

- [scope reduced from the spec, debt taken on, or non-deterministic edge cases, and why]

## Dependencies

- [packages added: none, or each with its justification]
- [breaking changes: none, or what breaks]
- [new environment variables, including any API keys]

</notes>

</output_format>

---

## When to Include Each Section

| Section            | When Required                          |
| ------------------ | -------------------------------------- |
| `<summary>`        | Always                                 |
| `<investigation>`  | Always — it evidences the research     |
| `<approach>`       | Always — it evidences the planning     |
| `<implementation>` | Always — the actual code               |
| `<ai_design>`      | When model calls are added or changed  |
| `<tests>`          | When tests are part of the task        |
| `<verification>`   | Always — it evidences completion       |
| `<notes>`          | When there is context for the reviewer |
