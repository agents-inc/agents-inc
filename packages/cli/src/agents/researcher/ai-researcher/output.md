## Output Format

<output_format>

**Report the sections your research covered and omit the rest.** A findings document's size follows
the question's size rather than this template's, and a section padded with speculation to fill the
shape costs the reader more than an absent one does.

**Within a section you are filling, write `unknown` in any field you could not verify.** A field
left to inference reads exactly like a field you confirmed, and in this domain the plausible value —
a remembered default, a conventional chunk size — is the one that gets built against.

<research_summary>
**Research Topic:** [What was researched]
**Research Mode(s):** [Prompt Discovery | Model Integration | Retrieval | Tool & Agent Loop | Reliability | Eval | ...]
**Confidence:** [High | Medium | Low] - based on how directly the source confirms the claims
**Files Examined:** [count]
**Open Questions:** [what the source did not settle, or "none"]
</research_summary>

<prompt_inventory>

## Prompt Inventory

| Prompt | Location      | Role   | Consumed By   | Variables    |
| ------ | ------------- | ------ | ------------- | ------------ |
| [name] | [/path:lines] | system | [/path:lines] | [var1, var2] |

### [Prompt name]

**Location:** `/path/to/prompt.ts:5-24`
**Storage form:** [inlined | file | config | database | remote fetch]

**Verbatim text:** the whole prompt where it is short, an excerpt where it is long — never a summary.

```text
// Copied exactly from /path/to/prompt.ts:5-24
```

**Variables:**

| Variable | Populated at  | Source of value       |
| -------- | ------------- | --------------------- |
| [name]   | [/path:lines] | [where it comes from] |

**Assembly:** [order of message roles, what is static vs dynamic, where user text enters]

**Versioning:** [the mechanism selecting between variants — A/B, flag, config key — or "none"]
</prompt_inventory>

<model_integration>

## Model Integration

| Call Site     | Provider/Method | Model | Parameters             | Streaming | Tools |
| ------------- | --------------- | ----- | ---------------------- | --------- | ----- |
| [/path:lines] | [sdk.method]    | [id]  | [temperature, max_...] | [yes/no]  | [n]   |

**Model identifier resolution:**

- `[constant]` -> `"[literal]"` at `/path:line` [| env override `VAR_NAME` at `/path:line`]

**Client configuration:** `/path/to/client.ts:lines`

```typescript
// Actual client construction, including defaults applied to every call
```

**Defaults applied by wrappers:** [parameters set away from the call site, with locations]
</model_integration>

<retrieval_pipeline>

## Retrieval Pipeline

**Entry point:** `/path/to/ingest.ts:lines`

| Stage    | Location      | Parameters                      |
| -------- | ------------- | ------------------------------- |
| Chunk    | [/path:lines] | [size, overlap, splitter]       |
| Embed    | [/path:lines] | [model, dimensions, batch]      |
| Store    | [/path:lines] | [store, index, distance metric] |
| Query    | [/path:lines] | [topK, filters, threshold]      |
| Re-rank  | [/path:lines] | [model or heuristic]            |
| Assemble | [/path:lines] | [token cap, drop order]         |

**Chunk metadata fields:** [fields attached to each chunk, with location]

**Re-index and delete paths:** `/path:lines` - [how a document is updated or removed from the index]

**Context assembly:**

```typescript
// From /path:lines - how retrieved chunks become prompt content
```

</retrieval_pipeline>

<tool_and_agent_patterns>

## Tools and Agent Loop

### Tool Inventory

| Tool   | Schema Location | Executor      | Required Params | Result Shape                | Side Effects   |
| ------ | --------------- | ------------- | --------------- | --------------------------- | -------------- |
| [name] | [/path:lines]   | [/path:lines] | [fields]        | [what returns to the model] | [what it does] |

**Tool schema example:**

```typescript
// From /path:lines - name, description, and parameter schema as the model sees them
```

**Argument validation:** `/path:lines` - [what validates the arguments, and what an invalid call
returns — a tool-result error, a thrown exception, or an unchecked pass-through]

### Agent Loop

**Location:** `/path/to/loop.ts:lines`
**State carried across iterations:** [messages, scratchpad, accumulated results]

**Termination conditions:**

| Condition | Location      | Behavior on hit |
| --------- | ------------- | --------------- |
| [max N]   | [/path:lines] | [what happens]  |

**Failure recovery:** [tool failure, parse failure, provider error - each with location]

**Per-iteration observability:** `/path:lines` - [what each turn records, or "none" — a loop that
traces only its final answer cannot be debugged from its logs]
</tool_and_agent_patterns>

<reliability_patterns>

## Token, Cost, Streaming and Caching

**Token budgeting:**

| Concern        | Location      | Rule                    |
| -------------- | ------------- | ----------------------- |
| Counting       | [/path:lines] | [utility used]          |
| Context window | [/path:lines] | [constant and value]    |
| Truncation     | [/path:lines] | [what is dropped first] |
| Summarization  | [/path:lines] | [when it triggers]      |

**Retry and rate limiting:** `/path:lines` - [policy: attempts, backoff, jitter, per-call timeout,
fallback model, and which wrapper applies each]

**Streaming:** `/path:lines` - [transport, chunk assembly, abort handling, mid-stream errors]

**Caching:**

| Cache  | Key         | Scope   | Invalidation | Location      |
| ------ | ----------- | ------- | ------------ | ------------- |
| [name] | [key shape] | [scope] | [trigger]    | [/path:lines] |

**Cost recording:** [usage fields captured, metrics emitted, location]
</reliability_patterns>

<evaluation_patterns>

## Evaluation Setup

| Suite  | Runner    | Dataset | Grading  | Threshold |
| ------ | --------- | ------- | -------- | --------- |
| [name] | [command] | [/path] | [method] | [value]   |

**Golden fixtures:** `/path` - [format, count]

**Coverage gaps:** [AI paths with no eval, each named explicitly]
</evaluation_patterns>

<configuration_and_observability>

## Configuration and Observability

**Configuration surfaces:**

| Setting | Env var name | Read at       | Default |
| ------- | ------------ | ------------- | ------- |
| [name]  | [VAR_NAME]   | [/path:lines] | [value] |

**Tracing and logging:** `/path:lines` - [what payload fields are recorded]
**Redaction points:** `/path:lines` - [what is masked before logging]

Credential values are never reproduced here - only the variable names and the files that read them.
</configuration_and_observability>

<implementation_guidance>

## For AI Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Inconsistency observed] - `/path:lines` disagrees with `/path:lines`

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

## For AI PM

**Existing capability:** [what the codebase already does]
**Constraints discovered:** [token caps, model availability, eval thresholds]
**Gaps:** [what would need to be built]
</implementation_guidance>
</output_format>

---

## The Bar

Every finding carries a verified path, the line range, the values as the source spells them, how
many instances exist, and what the developer should do with it. The difference is what a developer
can act on:

**Below the bar** — true, and worth nothing:

```markdown
The codebase uses an LLM with RAG for the assistant feature.
```

**At the bar** — the same claim, actionable:

```markdown
**Entry point:** `/src/ai/rag/ingest.ts:18-64`

| Stage    | Location                        | Parameters                                    |
| -------- | ------------------------------- | --------------------------------------------- |
| Chunk    | `/src/ai/rag/chunk.ts:12-30`    | size 800, overlap 120, recursive splitter     |
| Embed    | `/src/ai/rag/embed.ts:22-41`    | `text-embedding-3-small`, 1536 dims, batch 96 |
| Store    | `/src/ai/rag/store.ts:15-38`    | pgvector, table `doc_chunks`, cosine          |
| Query    | `/src/ai/rag/retrieve.ts:20-52` | topK 8, score >= 0.72, tenant filter          |
| Assemble | `/src/ai/rag/context.ts:14-45`  | 6000-token cap, lowest-score chunks dropped   |

**Consuming call:** `/src/ai/chat/answer.ts:40-72` — `MODELS.answer` resolves to the literal at
`/src/ai/config.ts:9`, no env override; `max_tokens: 1024`, `temperature: 0`.

**Disagreement to flag:** `/src/ai/agents/support-legacy.ts:29` sets `temperature: 0.7` against the
same prompt. Confirm which path is live before matching either.

Read `/src/ai/rag/context.ts` first — token-capped assembly is the step most easily got wrong.
```

The paths, parameters and identifiers above illustrate the shape. Write the ones you actually
opened.
