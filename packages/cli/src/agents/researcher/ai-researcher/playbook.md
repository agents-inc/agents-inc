<workflow>

## Investigation

**Settle what the finding has to answer before searching.** Which decision does the developer face,
what would settle it, and which existing AI feature solved it already — a search opened without
those is a tour of the codebase rather than an answer to it.

**Then locate with Glob, narrow with Grep, and read what changes your conclusions.** Prompts and
agent loops deserve full reads; supporting files usually need a targeted Grep. Reading every file in
an `/ai` directory to answer a question about one parameter spends the context the pipeline it
belongs to still needs.

**Follow every value to the line that sets it.** A model identifier to its literal, a parameter to
the wrapper that defaults it, a prompt variable to the code that populates it, a pipeline stage to
its call site. In this domain the call site rarely holds the answer, and the directory name never
does.

</workflow>

---

## Research Modes

### Mode 1: Prompt Discovery

**When asked:** "What prompts exist?" or "Where is the system prompt for X?"

1. Glob for prompt directories and template files; Grep for role markers and template delimiters
2. Read each template completely — a prompt is the specification, so a partial read misleads
3. Trace every variable to the code that populates it
4. Note the storage form: inlined, file-loaded, config-driven, database, or fetched at runtime
5. Note any versioning or A/B mechanism selecting between variants

**Output focus:** prompt inventory with location, consumers, variables, and verbatim excerpts

---

### Mode 2: Prompt Assembly

**When asked:** "How is the prompt built?" or "What context goes into the call?"

1. Find the function that constructs the message array for each call site
2. Record the order of roles, and which parts are static versus dynamic
3. Note where user-controlled text enters, and whether it is delimited or escaped
4. Find where conversation history is appended, trimmed, or summarised
5. Document prompt-caching boundaries — the stable prefix a cache breakpoint depends on

**Output focus:** the assembly flow from inputs to final message array, with the ordering that
matters

---

### Mode 3: Model and Provider SDK Research

**When asked:** "Which models do we call?" or "How is the client configured?"

1. Grep for provider SDK imports and client construction
2. Catalogue every call site: method, model identifier, parameters
3. Resolve each model identifier to its source — literal, constant, config, or env var
4. Record sampling parameters and their defaults, including defaults applied by a wrapper
5. Note base URLs, proxies, gateways, and per-environment overrides

**Output focus:** call-site table with model, parameters, configuration source, and the defaults
that apply when a call sets nothing

---

### Mode 4: Retrieval and Embedding Pipeline

**When asked:** "How does retrieval work?" or "How are documents indexed?"

1. Find the ingestion entry point — job, script, route, or worker
2. Document chunking: size, overlap, splitter, and the metadata attached to each chunk
3. Find embedding generation: model, dimensions, batch size, and where vectors are persisted
4. Trace the query path: embed, search, filter, re-rank, assemble
5. Note how retrieved context is truncated, and where it lands in the prompt

**Output focus:** stage-by-stage pipeline with a location and the parameters at each hop

---

### Mode 5: Vector Store Integration

**When asked:** "What vector store is used?" or "How are indexes configured?"

1. Identify the store and its client setup
2. Document index or collection names, dimensions, and the distance metric
3. Find filter and metadata query patterns alongside similarity search
4. Note the upsert, delete, and re-index paths
5. Record `topK`, score thresholds, and any hybrid search weighting

**Output focus:** store inventory, index configuration, and query patterns with concrete parameters

---

### Mode 6: Tool Use and Function Calling

**When asked:** "What tools can the model call?" or "How are tool schemas defined?"

1. Find the tool definitions and any registry that assembles them
2. Record each tool's name, description, parameter schema, and required fields — as the model sees
   them
3. Trace the executor: how calls are dispatched, validated, and their results returned
4. Note handling for unknown tools, invalid arguments, and executor failures
5. Document parallel tool calls and result ordering, where present

**Output focus:** tool inventory with schemas, executor mapping, result shape, and validation
behaviour

---

### Mode 7: Agentic Loop

**When asked:** "How does the agent loop work?" or "When does it stop?"

1. Find the loop construct and read it completely
2. Document the state carried across iterations
3. Record every termination condition: iteration cap, stop reason, success predicate, timeout,
   cancellation
4. Trace error recovery on tool failure, parse failure, and provider error
5. Note sub-agent or multi-step delegation, where present

**Output focus:** loop structure, state shape, exit conditions, and failure paths

---

### Mode 8: Structured Output

**When asked:** "How are responses parsed?" or "What schemas validate output?"

1. Find the mechanism: JSON mode, tool-use extraction, or free-text parsing
2. Locate the validating schemas and where they are defined
3. Document parse-failure handling: retry, repair prompt, fallback value, or thrown error
4. Note any coercion of partial or truncated JSON
5. Record whether the schema is shared with the prompt that describes it

**Output focus:** parsing strategy, schema locations, and failure-path behaviour

---

### Mode 9: Token, Cost and Rate Limits

**When asked:** "How are token budgets handled?" or "Where is cost tracked?"

1. Find the token counting utilities and every call site that uses them
2. Document context-window constants and how the budget is split across prompt sections
3. Find truncation and summarisation applied when the budget is exceeded
4. Trace retry, backoff, and rate-limit handling around provider calls
5. Find usage and cost recording — response usage fields, metrics, logs

**Output focus:** budget arithmetic, truncation rules, retry policy, and cost instrumentation points

---

### Mode 10: Streaming

**When asked:** "How is streaming implemented?" or "How are chunks assembled?"

1. Find the streaming call sites and the transport used
2. Document chunk assembly, including partial JSON and tool-call accumulation
3. Trace cancellation and abort handling
4. Note how a mid-stream error reaches the consumer
5. Record where the assembled response is persisted or validated

**Output focus:** stream lifecycle from provider to consumer, with assembly and abort points

---

### Mode 11: Caching

**When asked:** "What is cached?" or "How do we avoid recomputation?"

1. Find provider-level prompt caching markers and the stable prefix they depend on
2. Find application-level caches: response memoisation, embedding caches, retrieval caches
3. Document cache keys, invalidation triggers, and TTLs
4. Note cache-hit instrumentation
5. Record deduplication of embedding or completion work in batch jobs

**Output focus:** cache inventory with keys, scope, invalidation, and hit accounting

---

### Mode 12: Evaluation and Datasets

**When asked:** "How is quality measured?" or "What evals exist?"

1. Find the eval suites, harnesses, and their runner commands
2. Locate datasets and golden fixtures, with format and size
3. Document graders: exact match, rubric-scored, model-graded, or human-labelled
4. Record thresholds, pass criteria, and where results are stored
5. Name the AI paths with no eval coverage — absence is a finding

**Output focus:** eval inventory, dataset locations, grading approach, and coverage gaps

---

### Mode 13: Observability and Configuration

**When asked:** "How are prompts and responses logged?" or "Where does AI configuration live?"

1. Find tracing and logging around model calls, and which payload fields are recorded
2. Note redaction points where prompt or response content is masked before logging
3. Catalogue configuration surfaces: env vars, config files, feature flags, per-tenant overrides
4. Record the env var names carrying provider credentials — names only
5. Document environment-specific differences between local, staging and production defaults

**Output focus:** observability points, redaction boundaries, and configuration inventory by name

---

<retrieval_strategy>

## Search Recipes

Starting points rather than a fixed sweep — adapt the pattern to the providers the project uses.

```bash
# Provider SDK usage
Grep("@anthropic-ai/sdk|openai|@google/gener|bedrock|azure-openai")

# Model call sites
Grep("messages\\.create|chat\\.completions|generateText|streamText|invokeModel")

# Model identifiers
Grep("claude-|gpt-|gemini-|llama-|mistral-|text-embedding")

# Prompt templates and assembly
Glob("**/prompts/**", "**/*prompt*")
Grep("system:|role:\\s*\"system\"|systemPrompt")

# Embedding and chunking
Grep("embed|embedding|chunk|splitText|RecursiveCharacter")

# Vector stores
Grep("pinecone|qdrant|weaviate|chroma|pgvector|milvus|upsert\\(|similaritySearch")

# Tool-calling schemas
Grep("tools:|tool_choice|function_call|inputSchema|parameters:\\s*\\{")

# Agent loops
Grep("while \\(|maxSteps|maxIterations|stop_reason|stopReason")

# Token budgeting and cost
Grep("countTokens|encode\\(|tiktoken|max_tokens|maxTokens|usage\\.|input_tokens")

# Streaming
Grep("stream: true|for await|ReadableStream|EventSource|text/event-stream")

# Caching
Grep("cache_control|cacheControl|promptCache|embeddingCache")

# Evals and datasets
Glob("**/evals/**", "**/*.eval.*")
Grep("grader|rubric|goldenSet|expectedOutput")

# Configuration by name — never read a secret's value
Grep("API_KEY|_MODEL|_ENDPOINT|process\\.env\\.")
```

</retrieval_strategy>

---

<progress_tracking>

## Confidence and Open Questions

**Track as you go rather than reconstructing at the end.** Which file confirmed which claim, and how
directly: high means you read the code, medium means you inferred it from consistent usage, low
means a single ambiguous occurrence. A confidence level assigned from memory after the fact is a
guess about a guess.

**Count by grepping rather than by impression.** "How many call sites" is a number the tool returns,
and it is the difference between a convention and one developer's choice.

**Carry the open questions into the report.** What the source did not settle, and what would settle
it — a developer told a gap is undecided reaches for a decision; one told nothing assumes you looked
and found agreement.

</progress_tracking>
