# B8 — ai (20 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B8, §4; relationship-coverage decisions 2/4; CLI-740 for anything the vocabulary
cannot express. Skill bodies read at `/home/vince/dev/skills/src/skills/ai-{provider,infrastructure,orchestration,observability,patterns}-*`
(all 20 SKILL.md files plus example files where the binding question demanded it); current rules
verified in `packages/cli/src/cli/lib/configuration/default-rules.ts` — exactly two `requires`
touch this batch (`claude-vision needs [anthropic-sdk]` at 503-507, `openai-whisper needs
[openai-sdk]` at 508-512), zero conflict groups, zero `compatibleWith` (the worksheet §1 nuance:
these two are among the five with `requires` but no `compatibleWith` — reconfirmed), and three
`alternatives` purpose groups ("AI SDK" at :924, the 10-member "AI Provider SDK" at :928-941,
"AI Evaluation / Observability" at :957 — line numbers refreshed in verification). All five ai categories verified `exclusive: false` in
`default-categories.ts:296-337`. Product claims verified 2026-08-07 via Context7
(`/websites/ai-sdk_dev`) and web search (langfuse/promptfoo first-party integration docs,
langchain+llamaindex combined-use guides).

**Headline: the whole domain stays exactly as it is — zero rules changes. Multi-provider is
genuinely normal (two catalog skills, litellm and vercel-ai-sdk, exist specifically to make it
so, and the catalog's own Next.js AI SaaS stack pairs vercel-ai-sdk with anthropic-sdk in seven
rosters), so all five open categories are confirmed open, the 10-member alternatives group is
confirmed correct with no conflict group, and the audit's product is 20 manifest rows: 18
`universal`, 2 `constrained-via-exclusivity-or-requires` (claude-vision, openai-whisper — both
existing `requires` verified against their bodies and preserved verbatim). The only class-C in
the batch is vercel-ai-sdk (neutral core, react adapter taught), which derives no `requires`
under B7's adapters-extending-a-self-sufficient-core precedent. No missing bindings found — the
one candidate attacked (litellm's client literally being the `openai` npm package) resolves to
no-requires with a named CLI-740 nuance: wire-protocol reuse is not a skill dependency.**

## 1. Multi-provider is normal — `ai-provider` stays open (question a) CONFIRMED

Four convergent pieces of evidence, two of them product-internal:

1. **Two skills in this very batch exist to make multi-provider routine.** litellm is "a unified
   LLM gateway that routes to multiple providers (OpenAI, Anthropic, Azure, Bedrock)" — its whole
   reason to exist is a project that talks to several providers at once. vercel-ai-sdk's
   first-party pitch is "multi-provider support" with per-call model switching
   ([ai-sdk.dev](https://ai-sdk.dev/)). An exclusive `ai-provider` radio would declare the
   architecture these two skills serve to be invalid.
2. **The two existing `requires` are an in-catalog proof.** claude-vision needs anthropic-sdk;
   openai-whisper needs openai-sdk. An app doing Claude-based document analysis _and_ Whisper
   transcription — a mundane combination — must select both provider SDKs. A radio would make
   the catalog's own capability skills mutually unreachable.
3. **The provider bodies themselves treat multi-provider as a normal adjacent architecture.**
   Every LLM-provider skill's "When NOT to use" says the same thing: "Multi-provider
   applications where you need to switch between providers — use a unified provider SDK". They
   fence their own _teaching scope_ to one provider, not the project's provider count.
4. **Cross-purpose providers are orthogonal, not substitutes.** elevenlabs (TTS) beside
   anthropic-sdk (LLM) beside openai-whisper (STT) is one voice-agent app, three `ai-provider`
   members. Even within LLM SDKs, per-task splits (Claude for reasoning, GPT for embeddings,
   Gemini for video input) are ordinary; a documented promptfoo use is comparing model
   outputs side-by-side (GPT vs Claude vs Gemini — officially documented, though the homepage
   now leads with red-teaming/security), which requires multiple providers configured
   in one repo.

`ai-provider` (and the other four ai categories) stay `exclusive: false`. The one-of-N purpose
relationship the domain does have is already recorded where it belongs — editorially, in
`alternatives` (§2).

## 2. The 10-member "AI Provider SDK" alternatives group (question b) — CORRECT AS-IS

Members reverified at `default-rules.ts:928-941`: the five LLM-provider SDKs (anthropic-sdk,
openai-sdk, google-gemini-sdk, mistral-sdk, cohere-sdk) plus five infrastructure routes to LLM
inference (together-ai, replicate, huggingface-inference, ollama, litellm). `alternatives` is
editorial/display vocabulary (consumed by search output and generators, no resolver fencing),
and "ways to get LLM inference" is exactly the purpose-substitutability it should record — while
§1 shows why no conflict group should mirror it. Confirmed correct with three notes, none a
defect:

- **Correctly excluded:** elevenlabs (voice, not LLM), claude-vision and openai-whisper
  (capability specializations, not providers), vercel-ai-sdk/langchain/llamaindex (the
  orchestration layer, correctly in their own "AI SDK" group at :924).
- **Borderline absence:** modal is also a route to open-model inference (deploy vLLM, call the
  endpoint), so it could arguably join — but its skill is deployment-shaped, not
  inference-API-shaped, and the group name says "Provider SDK". Leaving it out is defensible;
  recorded as an editorial note only.
- The group spans two categories (ai-provider + ai-infrastructure) — fine for `alternatives`,
  which is slug-based and category-agnostic, and one more reason no category radio could ever
  have expressed this grouping.

## 3. The two existing `requires` (question a, second half) — shape VERIFIED, preserve verbatim

Both are **specialization-over-carrier** bindings: the skill is a deeper surface of the exact
client its target skill sets up, verified in the bodies:

- **claude-vision → anthropic-sdk.** Every example is Anthropic-SDK code: `import Anthropic from
"@anthropic-ai/sdk"`, `new Anthropic()` (`examples/core.md:14-17`, `examples/extraction.md`),
  `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` (SKILL.md:246). Its own "When NOT to
  use" completes the shape: "General Claude API usage without images — use the general Anthropic
  SDK patterns instead". The rule's reason ("Claude Vision uses the Anthropic SDK") is accurate.
- **openai-whisper → openai-sdk.** Every pattern is `client.audio.transcriptions.create()` /
  `client.audio.translations.create()` on `new OpenAI()` (`examples/core.md:11-14`, SKILL.md
  quick guide). Reason ("Whisper API uses the OpenAI SDK") accurate.

**Decision-2 consequence the apply phase must honor (the worksheet's exact caution):** these two
rules point into an _open_ category. After Phase C re-keys out-of-reach as "requires a member of
an exclusive category whose selected member differs", these two are pure prerequisite links that
can never produce an incompatibility verdict — they gate availability, nothing else. They are
not conflict-reachability artifacts and must survive the re-key untouched, not be reclassified
or folded into exclusivity. Verdict for both: `constrained-via-exclusivity-or-requires` (they
carry `requires`), class A (the constraint is a skill-prerequisite, not a framework binding —
`frameworks: []`).

## 4. vercel-ai-sdk (question c) — class C, adapters today [react], NO derived `requires`

The worksheet asked whether the body teaches the React hooks: **yes** — `useChat` /
`useCompletion` from `@ai-sdk/react` are taught directly (SKILL.md:225, 251, plus
`examples/chat.md`), including v6 migration notes ("import from `@ai-sdk/react` not
`ai/react`"). But the body _also_ states its own class-C shape: "Framework-agnostic UI hooks —
`useChat` and `useCompletion` work with React, Svelte, Vue, and Angular" (SKILL.md:81) and
"frontend hooks … with framework-specific variants for Svelte, Vue, and Angular" (SKILL.md:323).
First-party docs confirm both halves: AI SDK Core "is compatible with all environments including
Node.js, Deno" ([navigating the library](https://ai-sdk.dev/docs/getting-started/navigating-the-library));
AI SDK UI supports React, Svelte, Vue.js and Angular first-party, with **SolidJS
community-maintained** ([AI SDK UI overview](https://ai-sdk.dev/docs/ai-sdk-ui/overview) — the
overview is the citation; the navigating-the-library page still names only React/Svelte/Vue —
precision corrected in verification).

The core surface (generateText, streamText, `tool()`, `Output.object`, `embed`,
`cosineSimilarity`) is pure server TypeScript and the majority of the skill; the hooks are an
adapter slice over it. This is precisely B7's PostHog derivation nuance — **adapters that extend
a self-sufficient core must not become constraints** — so: class C, adapters today `[react]`
(the taught variant), derived-requires **none**. A Hono-only backend using streamText + tools is
a first-class use the binding would wrongly fence. Skills-repo nit worth a line (verification):
SKILL.md:248 points `useCompletion` readers at examples/core.md, which contains no
useCompletion content. (Product-internal corroboration: the Next.js
AI SaaS stack assigns vercel-ai-sdk to `api-developer` rosters whose own category rows carry no
web framework — `default-stacks.ts` ~:1447-1452.) If the skills repo ever splits per-framework hook
examples, the adapter set widens; the manifest row regenerates, still with no `requires`.

## 5. langchain + llamaindex (question d) — COMPOSE; the radio would be wrong

Both in `ai-orchestration` (open), both in the "AI SDK" alternatives group — substitutes for the
_whole-framework_ purpose, which the group records editorially. But combined use in one project
is documented-real, not exotic: the canonical split is LlamaIndex for ingestion/indexing/
retrieval with LangChain (or LangGraph) for the agent loop and tool routing — a LlamaIndex query
engine wrapped as a LangChain tool. LangChain's own comparison page frames them as composable
layers rather than an either/or and now carries the combined-use pattern itself — it opens
"Most teams… do not have to pick just one" and its FAQ names the exact pattern ("wraps a
LlamaIndex query engine as a tool that a LangGraph node invokes")
([langchain.com: LangChain vs LlamaIndex](https://www.langchain.com/resources/langchain-vs-llamaindex));
the official LlamaIndex `LangChainLLM` integration page documents the bridge from the other
side ([developers.llamaindex.ai](https://developers.llamaindex.ai/python/framework/integrations/llm/langchain/)).
(Citations upgraded in verification: the earlier Medium guide is dropped, and the classic
docs.llamaindex.ai "Using with Langchain" page has been retired — it 301s — so it is not
cited.) One honest fact the record must carry: **the two skill bodies never mention each
other** (grep zero, both directions) — the coexistence is externally documented, not
body-documented. The skills' scopes also divide cleanly: llamaindex's body is data-framework-shaped (loading,
chunking, indexes, query engines; "Node.js >= 20, server-side"), langchain's is
composition-shaped (LCEL, agents, provider switching). Honesty note: the richest combined-use
documentation is Python-ecosystem; the TS-specific pairing (LlamaIndex.TS + LangChain.js) is
plausible and unblocked but thinner on citations — recorded in the confidence notes, not as a
reason to fence. No conflict group, no exclusivity flip. Same logic pairwise with vercel-ai-sdk
(e.g., LlamaIndex retrieval inside a streamText tool): the three orchestrators compose at
different layers; `alternatives` already says "same purpose" for the whole-framework decision.

## 6. langfuse + promptfoo (question e) — COMPOSE, first-party-documented, no fence

Different concerns with an official bridge in both directions of the docs: promptfoo evaluates
pre-deployment (test suites, model-graded evals, red teaming, CI gates); langfuse observes
production (tracing, costs, sessions, prompt management). Each body's "When NOT to use" points
at the other's territory — promptfoo: "Runtime monitoring of production LLM calls (use
observability tooling)"; langfuse: nothing eval-suite-shaped beyond its own datasets. And the
two products integrate by name: promptfoo configs can reference Langfuse-managed prompts via the
`langfuse://` prefix ([promptfoo docs](https://www.promptfoo.dev/docs/integrations/langfuse/),
[langfuse docs](https://langfuse.com/integrations/other/promptfoo)) — a supported workflow that
_requires_ both in one repo. `ai-observability` stays open; no conflict group. (Overlap exists —
langfuse also does scores/datasets/experiments — but overlap-with-different-center-of-mass is
compose territory, same as B7's elasticsearch/vector-db note.)

## 7. ollama vs the hosted providers (question f) — local-vs-hosted COMPOSES

ollama's own body draws the line: local for "development, testing, or privacy-sensitive
workloads" and "prototyping AI features before committing to a cloud provider"; When-NOT: cloud
providers for production SLAs and latest proprietary models. Dev-local/prod-hosted in one
codebase is the _expected_ pattern, not a migration accident — and the skill even carries an
OpenAI-compatible-endpoint section specifically for running OpenAI-SDK-shaped code against
local models. No fence against any provider or infrastructure skill; ollama's membership in the
alternatives group records the purpose-substitutability side.

## 8. Preloads (question g) — CONFIRMED no relationship consequence

`packages/matrix/src/read-model/preload-defaults.ts:206-222` carries 15 ai rows (providers,
infrastructure minus litellm/modal, orchestration, patterns → `["developer", "planning",
"researcher"]`; langfuse/promptfoo → `["tester"]`). Five ai skills have no row — claude-vision,
openai-whisper, elevenlabs, litellm, modal — and the module header documents absence-as-lazy as
the owner's ruling ("Skills the table does not name are lazy on purpose"). This batch proposes
zero category moves, zero id changes and zero rule edits, so no preload key is touched and no
row needs adding. Pure audit, as the brief predicted.

## Manifest rows

Batch id `ai`, audited `2026-08-07`. 2 constrained / 18 universal.

| skill (current id)                                              | category (disposition)         | verdict                                     | class | frameworks             | derived-requires                                               | sources                                                                                                                                                                                                       | notes                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------ | ------------------------------------------- | ----- | ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| anthropic-sdk (ai-provider-anthropic-sdk)                       | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (@anthropic-ai/sdk: messages, streaming, tool use, extended thinking, caching, batch); https://docs.anthropic.com                                                                                  | Server SDK, framework-agnostic; the sole react mention is a When-NOT redirect. Target of claude-vision's `requires`. In AI Provider SDK alternatives group.                                                                                                                             |
| openai-sdk (ai-provider-openai-sdk)                             | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (openai: chat completions, Responses API, embeddings, vision/audio, batch); https://platform.openai.com/docs                                                                                       | Same shape. Target of openai-whisper's `requires`.                                                                                                                                                                                                                                      |
| google-gemini-sdk (ai-provider-google-gemini-sdk)               | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (@google/genai: generateContent, multimodal, function calling, context caching); https://ai.google.dev/gemini-api/docs                                                                             |                                                                                                                                                                                                                                                                                         |
| mistral-sdk (ai-provider-mistral-sdk)                           | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (@mistralai/mistralai: chat.complete/parse, Codestral FIM, embeddings, vision); https://docs.mistral.ai                                                                                            |                                                                                                                                                                                                                                                                                         |
| cohere-sdk (ai-provider-cohere-sdk)                             | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (CohereClientV2: chat, embed, rerank, RAG citations); https://docs.cohere.com                                                                                                                      | Zero frontend mentions at all — cleanest body in the batch.                                                                                                                                                                                                                             |
| elevenlabs (ai-provider-elevenlabs)                             | ai-provider (stays open)       | universal                                   | A     | []                     | none                                                           | skill body (@elevenlabs/elevenlabs-js: TTS convert/stream, voice cloning, SSML, WebSocket input); https://elevenlabs.io/docs                                                                                  | Voice provider, orthogonal to the LLM SDKs (§1.4). `@elevenlabs/react` appears once in SKILL.md's decision tree (:432) plus a non-teaching install line at reference.md:16-17 — pointers, not a taught surface (F5). Correctly outside the Provider SDK alternatives group.             |
| claude-vision (ai-provider-claude-vision)                       | ai-provider (stays open)       | **constrained-via-exclusivity-or-requires** | A     | []                     | **KEEP `requires [anthropic-sdk]`** (default-rules.ts:503-507) | skill body (new Anthropic(), @anthropic-ai/sdk imports throughout); https://docs.anthropic.com/en/docs/build-with-claude/vision                                                                               | Specialization-over-carrier (§3). Survives decision 2's re-key untouched — targets an open category, pure prerequisite (F6). No preload row → lazy by design.                                                                                                                           |
| openai-whisper (ai-provider-openai-whisper)                     | ai-provider (stays open)       | **constrained-via-exclusivity-or-requires** | A     | []                     | **KEEP `requires [openai-sdk]`** (default-rules.ts:508-512)    | skill body (client.audio.transcriptions/translations on new OpenAI()); https://platform.openai.com/docs/guides/speech-to-text                                                                                 | Same shape as claude-vision (§3). No preload row → lazy by design.                                                                                                                                                                                                                      |
| huggingface-inference (ai-infrastructure-huggingface-inference) | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (@huggingface/inference: InferenceClient, chat completion, embeddings, ASR, inference providers); https://huggingface.co/docs/huggingface.js                                                       |                                                                                                                                                                                                                                                                                         |
| together-ai (ai-infrastructure-together-ai)                     | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (together-ai: chat, streaming, JSON schema output, FLUX images, fine-tuning); https://docs.together.ai                                                                                             | OpenAI-compat section is protocol reuse, not a binding (F3).                                                                                                                                                                                                                            |
| litellm (ai-infrastructure-litellm)                             | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (proxy config.yaml, fallbacks, load balancing, virtual keys; TS client = OpenAI SDK at baseURL); https://docs.litellm.ai/docs/proxy                                                                | Exists to make multi-provider normal (§1.1). Its client IS `new OpenAI({ baseURL })` — resolved as wire-protocol reuse, no `requires [openai-sdk]` (F3, CLI-740). No preload row → lazy by design.                                                                                      |
| replicate (ai-infrastructure-replicate)                         | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (replicate.run/stream, webhooks + signature validation, deployments, training); https://replicate.com/docs                                                                                         |                                                                                                                                                                                                                                                                                         |
| modal (ai-infrastructure-modal)                                 | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (@modal.fastapi_endpoint Python apps + TS consumers via fetch and `modal` npm SDK); https://modal.com/docs                                                                                         | Python-majority body — 7 python vs 3 typescript blocks in SKILL.md (F2). Not in the alternatives group; defensible (§2). No preload row → lazy by design.                                                                                                                               |
| ollama (ai-infrastructure-ollama)                               | ai-infrastructure (stays open) | universal                                   | A     | []                     | none                                                           | skill body (ollama npm: chat, structured output via zodToJsonSchema, tools, vision, model mgmt, OpenAI-compat endpoint); https://github.com/ollama/ollama-js                                                  | Local-vs-hosted composes (§7); dev-local/prod-cloud is the expected pattern, unfenced.                                                                                                                                                                                                  |
| langchain (ai-orchestration-langchain)                          | ai-orchestration (stays open)  | universal                                   | A     | []                     | none                                                           | skill body (LangChain.js: LCEL, createAgent, withStructuredOutput, RAG, LangSmith); https://js.langchain.com; https://www.langchain.com/resources/langchain-vs-llamaindex                                     | Composes with llamaindex (§5) and with providers (its own value is provider switching).                                                                                                                                                                                                 |
| llamaindex (ai-orchestration-llamaindex)                        | ai-orchestration (stays open)  | universal                                   | A     | []                     | none                                                           | skill body (LlamaIndex.TS: Settings, VectorStoreIndex, query/chat engines, agents; Node >= 20 server-side); https://ts.llamaindex.ai                                                                          | Composes with langchain (§5). Server-side only — still class A (server-bound, not framework-bound).                                                                                                                                                                                     |
| vercel-ai-sdk (ai-orchestration-vercel-ai-sdk)                  | ai-orchestration (stays open)  | universal                                   | **C** | adapters today [react] | none                                                           | skill body (generateText/streamText/tool/Output/embed core + @ai-sdk/react useChat/useCompletion); https://ai-sdk.dev/docs/getting-started/navigating-the-library; https://ai-sdk.dev/docs/ai-sdk-ui/overview | The batch's only class C (§4). Core runs in plain Node; hooks have first-party React/Svelte/Vue/Angular variants (SolidJS community-maintained); body teaches the react one. No derived `requires` — B7 PostHog precedent. Ships to api-developer rosters in the AI SaaS default stack. |
| langfuse (ai-observability-langfuse)                            | ai-observability (stays open)  | universal                                   | A     | []                     | none                                                           | skill body (OTel LangfuseSpanProcessor, observe/startActiveObservation, observeOpenAI, prompt mgmt, scores/datasets); https://langfuse.com/integrations/other/promptfoo                                       | Composes with promptfoo, first-party-documented (§6). Preload row `["tester"]`.                                                                                                                                                                                                         |
| promptfoo (ai-observability-promptfoo)                          | ai-observability (stays open)  | universal                                   | A     | []                     | none                                                           | skill body (promptfooconfig.yaml, assertions, model-graded evals, red teaming, CI); https://www.promptfoo.dev/docs/integrations/langfuse/                                                                     | Composes with langfuse via `langfuse://` prompt references (§6). Multi-provider comparison is a documented use — more §1 evidence.                                                                                                                                                      |
| tool-use-patterns (ai-patterns-tool-use-patterns)               | ai-patterns (stays open)       | universal                                   | A     | []                     | none                                                           | skill body ("Provider-agnostic — generic TypeScript patterns, not provider-specific SDK code"; tool loop, parallel calls, HITL, tool choice)                                                                  | Deliberately unbound; its When-NOT routes SDK specifics to the provider skills. A `needsAny` across providers would over-fence pattern knowledge.                                                                                                                                       |

## Findings

- **F1 — five ai skills have no preload row, and that is the documented design.** claude-vision,
  openai-whisper, elevenlabs, litellm, modal are absent from `preload-defaults.ts`; the header
  rules absence = lazy on purpose. No action; recorded so the next reader doesn't "fix" it.
- **F2 — modal is the catalog's Python-majority skill body** (7 `python` vs 3 `typescript`
  fenced blocks in SKILL.md — Modal apps are defined in Python; the TS surface is the consumer
  side, which the metadata honestly scopes: "focuses on the TypeScript interaction surface").
  Not a rules defect; an editorial oddity worth the skills repo knowing about. Verdict
  unaffected.
- **F3 — wire-protocol reuse is not a skill dependency (CLI-740 nuance, named once for the
  catalog).** litellm's TypeScript client literally is `new OpenAI({ baseURL: PROXY_URL })`, and
  together-ai/ollama/huggingface-inference all carry OpenAI-compatible-endpoint sections. None
  derives `requires [openai-sdk]`: the `openai` package there is a wire client pointed away from
  OpenAI, the bodies carry their own complete client setup (litellm SKILL.md:130-142 — the
  fuller examples version at core.md:76-88; citation corrected in verification), and the
  binding would gray out litellm for exactly the projects it exists to serve
  (provider-independence). Contrast the claude-vision/openai-whisper shape, where the skill is a
  deeper surface of the same provider's API and the carrier's patterns (client config, retries,
  streaming) directly apply — that is `requires`; protocol reuse is not. **The discriminator,
  stated at body level (verification):** claude-vision and openai-whisper open on a bare
  `client` they never instantiate — zero `new Anthropic`/`new OpenAI`, zero installs in
  SKILL.md + reference.md (setup lives only in examples) — and each self-defers general usage
  to the carrier ("use the general Anthropic SDK patterns instead"). A body that _presumes_
  its carrier's setup and self-defers to it earns `requires` (specialization-over-carrier); a
  body that carries its own complete client pointed _away_ from the provider earns none
  (wire-protocol reuse — litellm self-carries, three times, and defers to no one).
- **F4 — claude-vision and openai-whisper are capability skills housed in `ai-provider`.** They
  are not providers; a stricter taxonomy might carve an `ai-capability` category. In an open
  category the placement has zero fencing consequence and the ids are stable — note only, no
  proposal (precedent: B7's F4 tolerance for id/category cosmetics).
- **F5 — elevenlabs' react client is a pointer, not a surface.** `@elevenlabs/react` appears in
  one decision-tree line in SKILL.md (:432), plus a non-teaching optional install line at
  reference.md:16-17 (scope precision from verification); no hook is taught. Class A stands; if the skills repo
  ever adds a conversational-AI react example, the row regenerates as class C adapters [react] —
  still no `requires` (F3/§4 logic).
- **F6 — the batch's two `requires` must survive Phase C's re-key verbatim.** They target
  members of an open category, so under the re-keyed vocabulary they are pure prerequisite
  gating and can never yield an incompatibility verdict. Any sweep that deletes or re-keys
  `requires` rules by conflict-reachability must special-case… nothing: it must simply not touch
  rules whose targets sit in open categories. Stated here because the worksheet explicitly
  flagged silent reclassification as the risk.
- **F7 — the provider bodies are vocabulary-consistent with the open category.** All five LLM
  SDK skills carry the identical When-NOT line routing multi-provider work to "a unified
  provider SDK" — the skills themselves encode "one skill per provider, many providers per
  project". The rules layer now matches the bodies by doing nothing.

## Contradicts-the-worksheet

1. **Nothing contradicts it — B8 is the worksheet's first zero-delta batch.** The predicted
   "universal across the board, two requires preserved" is exactly what body inspection and
   external verification produced: 18 universal, 2 constrained, 0 flips, 0 new rules, 0 category
   moves. The worksheet's questions are all answered in the affirmative direction it leaned.
2. **One refinement, not a contradiction: the two `requires` holders are class A, not class B.**
   The worksheet's class vocabulary maps class B to a _framework_ binding; claude-vision and
   openai-whisper are bound to a _sibling skill_ (a provider SDK), which the manifest expresses
   in `derived-requires`, not in `classification.frameworks`. Recording them as class B
   [anthropic-sdk] would corrupt the frameworks column's meaning (it holds framework slugs the
   support-surface machinery consumes).
3. **vercel-ai-sdk answers its worksheet question with both halves true:** yes the body teaches
   React hooks, and yes the SDK is framework-agnostic core + multi-framework UI — resolved as
   class C adapters-today [react] with no derived `requires` (B7's PostHog precedent), not as
   the class-B react binding a hook-teaching body might suggest at first glance.
4. **The one missing-binding candidate the worksheet couldn't see resolves to no-binding.**
   litellm's client being the `openai` package is invisible to coverage flags (litellm states
   nothing) and looks exactly like B7's setup-resend asymmetry — but the analysis lands opposite
   (F3): protocol reuse, not dependency. The distinction is now named for the catalog.

## Rules delta (apply-phase summary)

- `default-rules.ts`: **no changes.** Both existing `requires` (503-512) kept verbatim; no new
  rules; no conflict groups (there are none to delete in this domain); `alternatives` groups at
  :924, :928-941 and :957 stay as-is.
- `default-categories.ts`: **no changes.** All five ai categories confirmed `exclusive: false`.
- Preloads (`packages/matrix/src/read-model/preload-defaults.ts`): **no changes** (§8).
- Regen round: none needed for this batch (nothing feeds `generate:types`/`generate:matrix`).
- The batch's entire product is the 20 audit-manifest rows above.
- CLI-740 residue from this batch: wire-protocol reuse ≠ skill dependency (litellm/together-ai/
  ollama/huggingface OpenAI-compat surfaces, F3); modal's Python-first body as a catalog-shape
  question (F2); `ai-capability` as a possible future carve-out for claude-vision/openai-whisper
  (F4, note only); recommends-shaped pairing candidates the vocabulary cannot express —
  langfuse↔promptfoo (integrated by name) and orchestrator↔provider (vercel-ai-sdk pairs with
  any provider SDK) — same shape as B7's setup/usage residue.
