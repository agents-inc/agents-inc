# Editor v6 — the three architecture decisions

Researched against the live tree on 2026-08-26. Each section leads with the decision, then the
option table it was chosen from, then what would flip it. Programme context is
[`README.md`](./README.md).

---

## 1. Syntax highlighting for the output preview

**Decision: Shiki — client-side, fine-grained imports, lazy-loaded behind the dialog, rendered
through `codeToTokens` rather than `codeToHtml`.**

The strongest reason is not bundle size, it is provenance: **the theme already exists in this
repository and has already been ruled on.** `inkRampSyntaxTheme` — with `PALETTE`,
`STRUCTURE_SCOPES`, `LITERAL_SCOPES` and `COMMENT_SCOPES` — lives in `apps/www/astro.config.ts` and
is a Shiki-format TextMate theme built from this exact palette; `todo/www.md` records the owner's
ruling on it. Choosing Shiki means the editor and the documentation site colour the same TypeScript
identically from one definition. Choosing anything else means writing a second syntax identity that
will drift from the first.

The second reason rules out every HTML-emitting alternative. `codeToTokens` returns plain
`{content, color, fontStyle}` objects that render as ordinary React children, so the shipped
rendering-safety decision in `skill-contents-dialog.tsx` — no markdown renderer, no sanitiser, no
`dangerouslySetInnerHTML`, because the tree holds a stranger's bytes — survives verbatim. Shiki's
`codeToHtml`, server-rendered Shiki, Prism and highlight.js all break it.

| Option                                | Cost (gzipped, measured 2026-08-26) | Verdict                                                                                                              |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Shiki, client, fine-grained, lazy** | **≈59 KB**                          | **Chosen**                                                                                                           |
| Hand-rolled tokens from the generator | 0 KB                                | Viable only if the preview never shows a third-party `SKILL.md`                                                      |
| Shiki on the Hono worker              | 0 KB client, ≈59 KB worker          | Right shape for a shared permalink; wrong today, the dialog is live and pre-share                                    |
| Prism                                 | ≈9.7 KB                             | Coarse enough for the design's six token colours; loses TypeScript accuracy on `config-types.ts` and forks the theme |
| highlight.js                          | ≈28 KB                              | No advantage over Prism at 3× the size                                                                               |
| CodeMirror 6                          | ≈200–250 KB                         | Only if the preview ever becomes editable                                                                            |
| **Monaco — the VS Code library**      | **≈745 KB**                         | **Rejected.** Adopting VS Code's look is a design reversal, not a library choice                                     |

**The budget is not at risk.** `apps/editor/scripts/first-paint-budget.ts` sets
`FIRST_PAINT_BUDGET_BYTES` at 330 KiB and explicitly does not count a chunk reached only through
`import()`. A green build after the change is direct proof rather than an argument.

**What flips it:** a ruling that the preview shows only bytes the generator authored, and that an
ejected third-party `SKILL.md` keeps the plain-text treatment — then there is nothing to parse and
Shiki is 59 KB of nothing. What does _not_ flip it is how much highlighting the design asks for: it
asks for six token colours and every option here can produce six.

---

## 2. Where the preview's bytes come from

**Decision: extract the pure renderers into a new workspace package that the CLI's write path and
the editor's preview both import.**

A server endpoint does not solve the correctness problem, it relocates it — the Hono worker would
have to import the very same node-free renderer, so the extraction is a _prerequisite_ for the
endpoint rather than an alternative to it. Once it exists, the network hop buys nothing and costs a
round trip on every open.

**This repository has already had this argument once and ruled on it.**
`packages/matrix/src/contract/selection-scenarios.ts` opens by recording that two implementations —
the CLI's `matrix-resolver.ts` + `build-step-logic.ts` and the editor's `derive.ts` — answered the
same questions and did not always agree, that the CLI's answers were ruled authoritative, and that
the fix was to move the logic into `packages/matrix/src/read-model/selection-semantics.ts` behind a
shared data contract. The output preview is the same problem one layer down. The pattern, the
package boundary and the drift gate all already exist.

**The extraction is smaller than it looks.** Already pure: `generateConfigTypesSource`
(`config-types-writer.ts`), `buildAgentTemplateContext` and `sanitizeCompiledAgentData`
(`compiler.ts`), `stampProvenanceMarker` (`agents/agent-provenance.ts`). Pure except one
`os.homedir()`: `generateConfigSource` (`config-writer.ts`), inside `getGlobalConfigImportPath` —
which, per gotcha 1 below, sits on a branch nothing calls. The impure residue is three named things:
`readAgentFiles` (fs), `createLiquidEngine`'s root layering (fs), and `cliVersion()` (reads its own
`package.json`).

**The acceptance criterion of the first PR, not a follow-up:** the CLI's own writers call the shared
renderer. A shared package the editor imports and the CLI does not is client-side reconstruction
with extra ceremony, and the design's warning applies unchanged.

**It must be a new package, not `packages/matrix`.** The existing `catalog` chunk group in
`vite.config.ts` matches `packages[\\/]matrix[\\/]` and is on the first-paint path at 47.9 KB gz;
putting the corpus there would blow the 330 KiB budget on the first build. Everything the renderer
needs — liquidjs browser build at 31 KB gz, the template set at 9 KB gz, the agent bodies at up to
155 KB gz — has to stay behind `import()`.

### Five things a preview will get wrong unless the spec says otherwise

These came out of the compile-path lane and none of them is fixed by sharing the renderer:

1. **Two reachable writer variants, not three** — corrected 2026-08-26 by the Phase B spec lane.
   Three branches exist, but the import-from-global one has **no production caller**:
   `grep -rn "isProjectConfig" --include='*.ts' src | grep -v __tests__` returns a single line, in
   `writeProjectConfigPair` (`propagate.ts`), which always passes `globalConfig` alongside
   `isProjectConfig: true` and therefore always routes to the inlining branch. The two live shapes
   still differ materially — the inlined form orders its `export default` differently from the
   canonical order — so a preview must still select per root, but it selects between two.
2. **The absolute machine-specific path is not the live one** — corrected 2026-08-26, and the
   original claim was wrong in three ways. `getGlobalConfigImportPath()` is reachable only through
   the dead branch in (1), so the absolute path it produces never reaches a file. The
   machine-specific path that _is_ live is `computeGlobalTypesImportPath(projectDir)` in
   `config-types-writer.ts` — a different function, in the **types** half, producing a **relative**
   path (`path.relative(<project>/.claude-src, $HOME/.claude-src)`), on a branch selected by a disk
   probe (`getGlobalConfigTypesPath()`). A browser has no disk to probe, so the preview renders a
   named placeholder rather than inventing a path.
3. **The emitted bytes depend on ambient state.** `canonicalizeStackOrder` and `isExclusiveCategory`
   read the mutable `matrix` singleton, which `initializeMatrix()` replaces after the local-skill
   merge. A preview passed only the catalogue matrix diverges for anyone with custom skills.
4. **A preview cannot see what an install would merge.** The real path runs
   `resolveEffectiveGlobalConfig`, `reconcileProjectSplitAgainstGlobal`, tombstone masking and
   `registerProjectPath` against the config already on disk. A preview built from editor state alone
   shows the session's view, not the merged result — most visibly for anyone with a global install.
5. **`cliVersion()` leaks into the output.** Every compiled agent carries
   `<!-- Generated by agents-inc v<version> — … -->` as its first body line.

---

## 3. The composer's AI backend

**Decision, proposed and parked: Anthropic API direct from the existing Hono worker, with the SDK's
`baseURL` pointed at a Cloudflare AI Gateway (BYOK), `claude-opus-5`, non-streaming for v1.**

The composer's output is a mutation of a Zod-typed store, and this is the shortest path from a Zod
schema to a server-enforced, already-parsed typed value:
`client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })` returns
`response.parsed_output` typed as `z.infer<typeof schema>`. Every other candidate adds a hop between
the schema we own and the thing that enforces it — OpenRouter's own documentation says some upstreams
"guarantee schema-conforming output, while others translate your schema into their own
structured-output format or treat it as a strong hint" — and this feature's entire failure mode is a
mutation that does not match the catalog.

**The AI Gateway in front is orthogonal and near-free** — BYOK adds no token markup — and it is where
the abuse answer lives rather than in worker code. Do it regardless of which model wins.

### The finding that shrinks every other problem

**The model should emit skill ids and almost nothing else.** `resolveAssignment`
(`packages/matrix/src/read-model/assignment-defaults.ts`, bound to `PRELOAD_DEFAULTS`) already
answers, for a skill's `{id, domainId, categoryId}`, which sub-agents carry it and whether each loads
it preloaded or lazy. The editor wraps it as `defaultAssignmentsFor`; the CLI's config generator
reads the same resolver. So build mode's "creates sub-agents and sets preload defaults" is already a
pure function of the skill set. The structured output is `{ skillIds, agentPins?, prose }` — not a
`PersistedConfig`. That means a much smaller schema, far fewer output tokens, and no way for the
model to invent a preload policy that contradicts the CLI.

### The catalogue fits in the system prompt — measured, not estimated

Counted at `packages/matrix/src/vendor/generated/matrix.ts` → `BUILT_IN_MATRIX`: **238 skills, 102
categories, 9 domains, 18 sub-agents, 17 stacks.** A projection carrying ids, categories, the
`requires` edges, the `conflictsWith` lines and the sub-agent lines is **37,806 bytes ≈ 10,500
tokens**; with instructions and the output contract, ~11,500. Against a 1M context that is 1.2%, and
it is a fixed prefix — exactly the shape prompt caching is for. **Retrieval would be strictly
worse**: it adds a ranking step that can hide the right skill and destroys the cacheable prefix.

### Validation is three layers that already exist

1. **Shape** — the Zod schema, enforced server-side by `output_config.format`, re-parsed client-side
   against `persistedConfigSchema`.
2. **Existence** — `pruneUnknownIds` drops any id the seated catalogue does not carry. Already runs
   on the share-link import path. A hallucinated id is dropped, not crashed on.
3. **Legality** — `judgeSelection` / `createSelectionSemantics`
   (`packages/matrix/src/read-model/selection-semantics.ts`) resolves conflicts symmetrically, walks
   `requires` to a fixpoint and applies the pick-one swap rule.

Because the design leans toward a **reviewable proposal** rather than a silent mutation, layer 3 has
somewhere to put its verdict and no tool-use loop is needed. One structured response per turn.

### Cost, with the arithmetic

One build conversation — four assistant turns, 11,500-token cached system prompt, ~2,300 uncached
input, ~2,750 output including billed thinking — on `claude-opus-5` at $5/$25 per MTok with a 1.25×
cache write and 0.1× cache read:

|                                |             |
| ------------------------------ | ----------- |
| cache write 11,500 × $6.25/M   | $0.0719     |
| cache reads 34,500 × $0.50/M   | $0.0173     |
| uncached input 2,300 × $5.00/M | $0.0115     |
| output 2,750 × $25.00/M        | $0.0688     |
| **per conversation**           | **$0.1695** |

**$169 per 1,000 conversations** cold-cache, **$103** warm. `claude-sonnet-5` is **$68**;
`claude-haiku-4-5` is **$34**. OpenRouter adds its 5.5% credit fee → ~$179. AI Gateway BYOK leaves it
unchanged. **A $100/month budget buys about 590 Opus conversations.**

### Abuse is the real risk and the starting point is zero

`allowOnlyWebOrigin` restricts `Origin` to `c.env.WEB_ORIGIN`, but CORS is a browser policy — `curl`
ignores it. That is fine while the worst case is one content-addressed KV write. It stops being fine
when a route costs $0.17 a call: **$100 is gone in under five minutes at 10 requests/second.** There
is no Turnstile, no rate-limit binding and no auth anywhere in `apps` or `packages`.

Recommended, and all three are free: **Turnstile once per conversation → the Workers rate-limit
binding per session → an AI Gateway spend cap as the hard ceiling.** Do not build per-IP budgets in
KV: it is eventually consistent, the free tier is 1,000 writes/day, and `createConfig`'s
`existing === null` check already exists to conserve them.

### OWNER RULING, 2026-08-26 — the configuration is settled

**`claude-sonnet-5`, `output_config: { effort: "medium" }`, trimmed system prompt, 4 turns.**
Behind a Cloudflare AI Gateway (BYOK, no markup), proxied from the existing Hono worker.

The trim: drop the `conflictsWith` block (3.3 KB) and the sub-agent block (5.2 KB) from the system
prompt. Both are safe to drop for the same reason — nothing downstream trusts the model about them.
`judgeSelection` re-checks conflicts against the catalogue, and sub-agents are _derived_ from the
skill set by `resolveAssignment`, so the model never needed either. That takes the cached prefix
from ~11,500 tokens to **~8,100**.

Cost at this configuration, same 4-turn conversation:

|                                |              |
| ------------------------------ | ------------ |
| cache write 8,100 × $2.50/M    | $0.0203      |
| cache reads 24,300 × $0.20/M   | $0.0049      |
| uncached input 2,300 × $2.00/M | $0.0046      |
| output ~2,000 × $10.00/M       | $0.0200      |
| **per conversation**           | **≈ $0.050** |

**≈ $50 per 1,000 cold-cache, ≈ $30 warm** — against $169 for the Opus baseline this section opened
with. A $100/month budget buys roughly 2,000 conversations cold, 3,300 warm.

**The output figure is the one estimate here.** 2,750 was _measured_ at `effort: "high"`; 2,000 is a
projection for `medium`, since thinking is billed as output. Re-measure it against a real
conversation before quoting it anywhere.

**Why a cheaper model is low-risk here specifically**, and this is what made the ruling easy: the
model emits **skill ids and nothing else**. Every step after it is deterministic —
`resolveAssignment` derives the agents and their preload state, `pruneUnknownIds` drops any id the
seated catalogue does not carry, and `judgeSelection` catches illegal combinations. A weaker model
fails **safe** rather than producing a wrong configuration. That is unusual, and it is why the
downgrade costs nothing but latency.

### STREAMING — owner ruled yes, 2026-08-26, and it costs far less than this section claimed

**Vercel AI SDK v7 on both ends: `streamText` + `Output.object` in the worker, `useObject` from
`@ai-sdk/react` in the editor. The route stays inside the existing `.openapi()` chain.**

Strongest reason: `useObject` consumes a plain chunked-text body and does the incremental JSON
parsing itself, so "prose streams while the proposal fills in" arrives with **no stream-parsing code
written at either end**. It is the only option that does — Anthropic's own documentation states that
structured outputs under streaming must be accumulated and deserialised at the end, so every other
route makes the client a hand-rolled parser, which the owner ruled out.

**Three claims this document made about streaming were wrong.** Corrected against the installed tree
and the published type declarations:

1. **A streaming route does NOT have to leave the `AppType` chain.** `@hono/zod-openapi`'s
   `RouteHandler` permits a raw `Response` whenever any numeric-status response on the route lacks a
   `content` block — and `tunnelRoute` is the live proof, returning `new Response(null, …)` from
   inside the chain today. So the route keeps its place, the OpenAPI document stays complete, and
   the `hc<AppType>` test the standard demands is still writable. Only the response _body shape_ is
   untyped, which for a stream it never had.
2. **`streamObject`/`partialOutputStream` are two different APIs**, and this document named them as
   one feature. `partialObjectStream` belongs to `streamObject`; `partialOutputStream` belongs to
   `streamText` + `Output.object`. Only the second carries prose and a structured object in one call,
   which is what this feature needs.
3. **The "~73 KB gz" figure describes nothing.** Measured un-tree-shaken dist entries:
   `@ai-sdk/react` 10.3 KB, `swr` 9.1 KB, `@ai-sdk/provider-utils` 27.5 KB, and the whole `ai` entry
   103 KB. All four declare `sideEffects: false` so the real slice should be far smaller, but the
   true lazy-chunk size is **unmeasured** — measure it on the first build.

**Two implementation traps, both read out of the compiled `submit`, both able to ship silently:**

- **`object` — the render value — is `DeepPartial<T>` and is NEVER schema-validated.** The validated
  value exists only in `onFinish`. **Applying a proposal from `object` would be a bug**;
  `pruneUnknownIds` and `judgeSelection` must run on `onFinish`'s object.
- **`useObject` discards the HTTP status** — `if (!response.ok) throw new Error(await response.text())`.
  The refusal taxonomy reaches the client as prose only. Either lean on that (the worker already
  answers refusals with sentences) or pass a custom `fetch` mapping status to a discriminated
  refusal, which is what `ShareRefusal` in `configs.ts` already is.

**Pin `structuredOutputMode: "outputFormat"`.** The default is `"auto"`, and `"jsonTool"` changes the
request shape and therefore the prompt cache.

**The real cost is maintenance, and it is the one thing to weigh against all of the above.** `ai` has
shipped **five majors in 29 months** — v7 landed 2026-06-25 and renamed `system`→`instructions`,
`onFinish`→`onEnd`, `fullStream`→`stream`, `experimental_output`→`output`, moved the cache-token
fields, deprecated all five `result.to*StreamResponse()` methods, and went ESM-only. Hono and
`@hono/zod-openapi` are stable by comparison. There is a published codemod. **And context7 serves
`ai_6.0.0` as its newest pinned version — one major stale — so every v6 answer it returns for this
package is wrong. Brief from the npm registry and the published `.d.ts` files instead.**

### OPENROUTER — evaluated 2026-08-26 at the owner's request, and declined

**Not for this feature.** The deciding fact is not cost and not caching, both of which came back fine.

`anthropic/claude-sonnet-5` is served by **nine endpoints** on OpenRouter (Anthropic, Claude on AWS,
Azure ×2, Google Vertex ×3, Bedrock ×2 — read live from its endpoints API). Default routing is
price-weighted load balancing across all nine; **a prompt cache exists on exactly one**, and three of
them (the Vertex ones) do not advertise `structured_outputs` at all. This feature's cost model rests
on hitting the same cached prefix, and its correctness model rests on native structured outputs — so
the only safe configuration is `provider: { only: ["anthropic"], allow_fallbacks: false }`, which
switches off the thing OpenRouter exists to do. A 5.5% fee and an extra hop for a router pinned shut.

**Caching is NOT the problem, contrary to the expectation this was researched under.** OpenRouter
passes explicit `cache_control` breakpoints through, prices them at Anthropic's own 1.25× write /
0.1× read (verified numerically off its models API, not from prose), carries the 1h TTL as a
first-class priced field, and returns cache counters the worker can alarm on. Sticky routing keys on
a `session_id` and holds **within** a conversation. It does not hold **across** visitors, which is
what the warm figure needs.

**Cost is not the problem either:** identical token prices, +5.5% on credit purchases — about
**$5.50/month on a $100 budget**. BYOK-through-OpenRouter is genuinely $0 in fees at this scale, but
hands a third party a copy of the Anthropic key and loses `metadata.user_id`, for nothing measurable.

**The one thing OpenRouter would genuinely add is cross-cloud failover for the same model** — and if
uptime ever becomes the binding constraint, there is a middle configuration worth taking seriously
rather than the pinned-shut one:

```
provider: { order: ["anthropic", "claude-on-aws", "amazon-bedrock"],
            allow_fallbacks: true, require_parameters: true }
```

Cache stays warm on Anthropic in the happy path, fails over on an outage, and pays one fresh cache
write on the rare bad turn. That is the strongest version of the OpenRouter case and the form to
revisit if the composer going dark during an Anthropic incident ever costs more than a slightly less
readable request path.

**One live question, settleable in a single request** if this is ever reopened: OpenRouter nowhere
documents that a JSON-schema request becomes Anthropic's native `output_config.format` — the only
Anthropic mapping it publishes is `verbosity` → `output_config.effort`. Adjacent gateways have
shipped exactly that bug (Helicone #5639 drops `response_format` entirely). `@openrouter/ai-sdk-provider`
exposes `debug: { echo_upstream_body: true }`, which echoes the exact upstream body — that proves or
disproves it outright. By contrast `@ai-sdk/anthropic`'s own compiled `getArgs` builds
`output_config.format` where anyone can read it, which is the difference between a route you can read
and one you have to trust.

**Two corrections to this folder that the evaluation turned up, both real:**

- **`phase-d-spec.md` and this file specify DIFFERENT SDKs.** §D3.2 still says
  `client.messages.parse(...)` from `@anthropic-ai/sdk`, and its dependency table names that package;
  the streaming ruling above says `ai` + `@ai-sdk/anthropic`. Under the AI SDK, `zodOutputFormat` is
  not used at all, so §D3.2's constraint about it being typed against `zod/v4` has no subject.
  Reconcile before building.
- **Nothing in this folder actually specifies the 1h cache TTL**, although the ≈$30 warm figure
  assumes cross-visitor amortisation, which needs it. §D2.6 discusses only the 5-minute default. At
  8,100 tokens the 1h write costs $0.0324 against $0.0203 — it pays for itself once two conversations
  start within the hour. Decide it explicitly.

### What would flip it

- **Wanting to shop models** → the Vercel AI SDK (~73 KB gz), whose Anthropic provider already emits
  native `output_config.format`, so nothing is given up on fidelity.
- **Streaming turning out to be mandatory** → `streamObject` / `partialOutputStream` is the strongest
  single feature any candidate has, because the proposal list fills in as it generates. Note the cost
  either way: `apps/server/src/index.ts` builds its app as one chained expression precisely so
  `AppType` carries every route to the editor's `hc<AppType>` client, and an SSE route does not fit
  `@hono/zod-openapi`'s JSON response model.
- **Build mode being decided as a silent mutation** → layer 3's verdict has nowhere to go, and a
  repair loop and probably tool use become necessary. Still open in the design.
- **A hard ceiling mattering more than answer quality** → `claude-sonnet-5` at 2.5× cheaper. That is
  the owner's call; the model was not downgraded on their behalf.
