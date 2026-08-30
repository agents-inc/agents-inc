# Phase D — the composer's AI backend

**Tracker row:** EDITOR-54 in [`../../editor.md`](../../editor.md). Programme context is
[`README.md`](./README.md); the decision and its arithmetic are
[`decisions.md`](./decisions.md) §3, whose **OWNER RULING, 2026-08-26** subsection is settled and is
not re-opened anywhere below.

**Phase C is being built concurrently.** It ships the composer as UI only and leaves an outcome slot
open. This phase fills that slot and gives its send button something to call.

**THE COMPOSER HAS NO MODES**, and that is the single largest change to this document. On 2026-08-26
the mode count went three → two → **none**; `phase-c-spec.md` § _THE COMPOSER HAS NO MODES_ is the
authority and this spec follows it. **The `adjust` write-permission conflict this document raised as
an owner question is resolved by deletion** — see
[§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries), which records it rather
than leaving it open, because a question whose subject no longer exists must be closed explicitly or
it gets reopened.

Where this spec and `phase-c-spec.md` differ, the owner rulings in [`README.md`](./README.md)
§ _Owner rulings, 2026-08-26 (second round)_ win. Both specs have been amended to them.

---

## Goal

Give the docked composer a model behind it: one worker route that turns a sentence into a
**reviewable proposal of skill ids**, behind a Cloudflare AI Gateway, with the three abuse controls
that make a paid route safe to expose.

**User story:** As someone who knows what they are building but not what this catalogue calls it, I
want to describe the stack in a sentence and be shown a proposal I can read before anything changes.

---

## Context

### Why this matters

Phase C ships a composer that says _"No model is connected yet — nothing was sent and nothing
changed."_ That sentence is honest and it is the whole feature's placeholder. Until this phase
lands, the seventh item in the owner's brief is a text field.

### Current state

| What                | Where                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| The composer UI     | Phase C — `apps/editor/src/features/configure/components/composer.tsx`      |
| The worker          | `apps/server/src/index.ts` — four routes, one chained `.openapi()` call     |
| Abuse controls      | **None.** `allowOnlyWebOrigin` is a CORS origin allowlist and nothing else  |
| An AI SDK anywhere  | **None.** `grep -rn "@anthropic-ai" apps packages --include='package.json'` |
| Secrets in a worker | **None.** `apps/server/wrangler.jsonc` has `vars` only, no `secrets`        |

### Desired state

A visitor types a sentence, solves one Turnstile challenge for the conversation, and is shown a
proposal listing the skills the model chose — with the ids it invented dropped, the combinations it
got wrong named, and nothing applied until they press Apply.

---

## Pattern files to reference

**Read these before implementing. Priority order.**

| #   | File                                                                                   | What it shows                                                                       |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `apps/server/src/index.ts`                                                             | The chained `.openapi()` app, `RouteHandler`/`RouteHook` typing, CORS, the size cap |
| 2   | `packages/cli/.ai-docs/standards/editor-and-worker.md` § 2                             | **Which routes owe an `hc<AppType>` test, and the `/index` ban** — binding here     |
| 3   | `apps/editor/src/lib/api/configs.ts`                                                   | A typed client module: `hc<AppType>`, re-validation, a discriminated refusal type   |
| 4   | `apps/server/src/crawl.test.ts` (`stubGitHub`)                                         | `vi.stubGlobal("fetch", …)` + `vi.unstubAllGlobals()` — how outbound calls are cut  |
| 5   | `apps/server/src/index.test.ts` (`the typed client the editor uses`, `REFUSED_BODIES`) | The two test blocks this phase copies                                               |
| 6   | `packages/matrix/src/read-model/selection-semantics.ts`                                | `createSelectionSemantics` / `judgeSelection` — validation layer 3                  |
| 7   | `apps/editor/src/stores/persisted-schema.ts` (`pruneUnknownIds`)                       | Validation layer 2, already on the share-import path                                |
| 8   | `apps/editor/src/features/configure/lib/default-assignments.ts`                        | `defaultAssignmentsFor` — how ids become sub-agent assignments deterministically    |
| 9   | `apps/server/src/skill-index.ts` + `src/log.ts`                                        | A worker module with its own file, and structured logging without an SDK            |

**Why these and not others.** (2) is a written standard that binds this route directly and is easy
to miss because it lives in the CLI package's docs. (6)–(8) are the three functions the settled
ruling says already do the work — none of them is rewritten here.

---

## D1 — The worker route

### D1.1 The chain is a type-level requirement, and this route joins it

`apps/server/src/index.ts` builds its app as **one chained expression** and says why in its own
comment: `.openapi()` folds the route into the app's _type_ while returning the same instance, so a
route registered on its own statement throws the return value away and `AppType` claims to serve
nothing. `apps/editor` infers its client from exactly that type.

**Both new routes are added to that chain, in that expression, and nowhere else.** Not
`api.openapi(...)` on a following line, not `app.post(...)`, not a sub-app `route()`d in.

### D1.2 Two routes

Registered in the chain after `tunnelRoute`.

| Route                   | `operationId`         | Purpose                                                               |
| ----------------------- | --------------------- | --------------------------------------------------------------------- |
| `POST /compose/session` | `mintComposerSession` | Verify one Turnstile token, return a short-lived signed session token |
| `POST /compose`         | `composeProposal`     | One model turn; returns a proposal                                    |

**Neither path may end in `/index`.** `editor-and-worker.md` § _No route path may end in `/index`_
records `hc`'s `removeIndexString` stripping that segment, which makes such a route unreachable from
the generated client while `curl` reaches it normally, and while `client.compose.index.$post()` still
compiles. `session` is a safe segment; the ban still binds.

Check the whole file, not just the new lines:

```
grep -n 'path: "[^"]*/index"' apps/server/src/index.ts
```

### D1.3 Request and response schemas

Written with the `z` from `@hono/zod-openapi` where they are route-local, and imported from
`@workspace/matrix/composer` where both ends share them (see [§D3.1](#d31-the-shared-wire-schema)).
`apps/server/src/index.ts` already mixes both — `configIdSchema` is route-local, `seedPayloadSchema`
is a plain shared zod schema used directly in a `content` block — so neither is new.

**`POST /compose/session`**

| Field            | Type                          | Note                                                |
| ---------------- | ----------------------------- | --------------------------------------------------- |
| `turnstileToken` | `z.string().min(1).max(2048)` | 2048 is Turnstile's documented maximum token length |

| Status | Meaning                                                                             |
| ------ | ----------------------------------------------------------------------------------- |
| `201`  | `{ token: string, expiresAt: number }` — an epoch-millis expiry the client can read |
| `400`  | Body is not a session request                                                       |
| `403`  | Turnstile refused the token                                                         |
| `429`  | Too many mints from this address                                                    |
| `503`  | Turnstile's siteverify endpoint did not answer                                      |

**`POST /compose`**

| Field          | Type                                                    | Note                                                     |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `sessionToken` | `z.string().min(1)`                                     | From the mint route                                      |
| `messages`     | `z.array(wireTurnSchema).min(1).max(MAX_WIRE_MESSAGES)` | The whole thread; the worker is stateless                |
| `selection`    | `z.array(z.string()).max(MAX_SELECTION_IDS)`            | The visitor's current skill ids, for the final user turn |

> **FLAGGED 2026-08-26, not decided — `selection` may now be too narrow.** Ruling 2b makes the answer
> a set of whole `skillEntrySchema` entries, and
> [§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries) lays an emitted entry
> over the stored one. So a model that re-emits an already-selected skill **with default
> assignments** silently reverts a hand-edit the visitor made in the options panel — and it has no
> way not to, because ids alone do not tell it what the current entry says. Two honest answers, and
> both are Phase D's to pick between:
>
> 1. **Send the entries, not the ids.** `selection` becomes the visitor's current entries, so the
>    model can echo what it is not changing. Costs prompt tokens on every turn and grows with the
>    selection.
> 2. **Emit only what changes.** The answer carries entries for skills it is adding or altering, and
>    an explicit list of ids to remove — which stops the answer being "the complete intended
>    selection" and reopens how a removal is expressed.
>
> A third that looks like an answer and is not: leaving `selection` as ids and having the client keep
> the stored entry wherever the model's matches the defaults. That cannot distinguish "the model
> meant the defaults" from "the model did not think about it", and it makes a visitor's edit
> survive or die on a coincidence.

**There is no `mode` field, and adding one back is the defect this route is most likely to acquire.**
An earlier revision carried `mode: z.enum(["build", "adjust"])`. The composer has one field and one
button, the user's intent is in `messages`, and a mode on the wire would be a UI concept the UI does
not have. **A suggestion chip is not a mode** — `phase-c-spec.md` §4 forbids anything downstream
branching on which chip was clicked, and a `mode` field is the most natural place for that branch to
appear.

`wireTurnSchema` is a **discriminated union on `role`**:

- `{ role: "user", text: z.string().min(1).max(MAX_TURN_CHARS) }`
- `{ role: "assistant", proposal: composerProposalSchema }`

**An assistant turn on the wire carries a parsed proposal, never free text**, and that is a
deliberate narrowing rather than a convenience. A client that could put arbitrary text in an
assistant role could smuggle instructions into the position the model trusts most. Re-rendering the
turn server-side from a schema-valid object closes that by construction.

| Status | Meaning                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- |
| `200`  | `composerProposalSchema` — the model's answer, shape-validated                                    |
| `400`  | Body is not a compose request (includes: over the message cap)                                    |
| `401`  | No session token, expired, or the signature does not verify                                       |
| `413`  | Body exceeds the size cap                                                                         |
| `422`  | The model answered and the answer was not usable — see [§D3.5](#d35-when-the-model-answers-badly) |
| `429`  | Rate limited, or the gateway's spend cap is reached                                               |
| `503`  | The upstream did not answer                                                                       |

`422` rather than `500`: the request was well-formed and the service is healthy. A refusal, a
truncation and an unparseable answer are all the model declining to produce a proposal, and the only
useful thing a client can do is show a sentence. Folding it into `500` would make an ordinary
outcome read as an outage — the same argument `409` won on the `/configs` route.

### D1.4 CORS and the size cap

Both new paths join `allowOnlyWebOrigin`:

```
app.use("/compose", allowOnlyWebOrigin)
app.use("/compose/*", allowOnlyWebOrigin)
```

**Every refusal must carry the allow-origin header**, including the ones produced by middleware ahead
of the handler. That is already an asserted class in `index.test.ts` — the `REFUSED_BODIES` block,
which lists bodies rather than statuses so each one provokes its own answer for real — and the
compose routes owe the same block. A refusal a browser cannot read reaches the app as a network
error, which is exactly what a rate-limit or session refusal must not look like.

The declared-`content-length` cap gets its own constant and its own `app.use("/compose", …)`:
`MAX_COMPOSE_BODY_BYTES`, **sized against the message cap and not against `MAX_BODY_BYTES`**. A share
payload carries external skill directories inline and is capped at 1 MB for that reason; a compose
body is a handful of sentences and a list of ids, and giving it the share cap would hand an attacker
a megabyte of free parsing per request.

### D1.5 How the editor reaches it, and why through the worker at all

**Four modules live under `apps/editor/src/lib/api/`, and only two cross the worker seam.**

| Module              | Talks to   | Why                                                                                                                                                  |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configs.ts`        | our worker | The store is ours; a share link needs an address only we can mint                                                                                    |
| `skill-index.ts`    | our worker | The index is built by a scheduled job into our KV                                                                                                    |
| `catalog.ts`        | GitHub     | **Deliberate.** _"an org's skill names, descriptions and stack philosophy are the org's… the token that authorizes a private read never reaches it"_ |
| `skill-contents.ts` | GitHub     | **Deliberate.** Two origins, and the raw CDN answers `access-control-allow-origin: *` with no API rate limit                                         |

`compose.ts` follows `configs.ts` and `skill-index.ts`, and **the reason is the inverse of the reason
the other two go direct.** Those two go to GitHub because the credential is the visitor's and must
not reach us. This one goes through the worker because the credential is **ours** and must not reach
them: an Anthropic key inlined into a browser bundle is a key on a pastebin within the hour. The
seam is drawn by who owns the secret, in both directions.

The client module is `apps/editor/src/lib/api/compose.ts`, built on `configs.ts`'s shape: its own
`hc<AppType>` (two clients already exist for the reason `skill-index.ts` states — _"two calls to `hc`
are cheaper than a module every api file has to reach through"_), `import type { AppType } from
"server"`, a discriminated result, `reportIssue` for what the user cannot see, and **nothing thrown**.

**It owes an `hc<AppType>` test in `apps/server`.** `editor-and-worker.md` § 2: _"Which routes owe an
`hc<AppType>` test is decided by how the editor reaches them, not by membership of the chain"_ —
`SELF.fetch` and `hc` compute their URLs by different code, so a suite that only uses `SELF.fetch`
exercises a path the editor never requests. That standard also says the count of shipped routes is
written down there; it moves from four to six and `codex-keeper` owns the edit.

---

## D2 — The system prompt, and its caching

**This section is the affordability of the whole feature.** `decisions.md` §3 prices a conversation
at ≈ $0.050 with a warm cache and ≈ 5× that with none, and the difference is entirely whether the
prefix matches byte for byte.

### D2.1 What is in it, in order

One `system` array. Its content, in this order, and **nothing else**:

1. **The role and the task** — one paragraph. What the composer is, and that its whole output is a
   set of skill entries drawn from the catalogue below.
2. **The output contract** — what each field of the emitted entry means, and that `prose` is one or
   two sentences for a human, never a restatement of the list. **AMENDED 2026-08-26 by ruling 2b**:
   the fields are `skillEntrySchema`'s, not `{ skillIds, agentPins?, prose }` — so this section owes
   an explanation of `assignments` and of `load` per edge, which is the feature's own purpose, and
   owes **nothing** about `install`, `scope` or sub-agent pins, which the ruling puts outside it.
3. **The task's two shapes, described as behaviour rather than as a flag** — that a sentence may ask
   for something to be added or for something already selected to change, and that the emitted set is
   always the complete intended selection either way. **This is not a mode list and there is no mode
   to select.** See [§D2.4](#d24-there-is-no-mode-and-nothing-selects-one).
4. **The catalogue projection** — see [§D2.2](#d22-the-projection-is-built-not-written).

**What is deliberately absent, per the owner ruling:**

| Dropped                   | Why it is safe to drop                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The `conflictsWith` block | `judgeSelection` re-checks conflicts against the catalogue; nothing downstream trusts the model about them |
| The sub-agent block       | Sub-agents are **derived** from the skill set by `resolveAssignment`. The model never needed them          |

Do not re-add either as "helpful context". Both were measured out and both are re-derived
deterministically downstream.

### D2.2 The projection is BUILT, not written

`apps/server/src/compose-prompt.ts` computes the projection **at module scope** from
`BUILT_IN_MATRIX` — via `@workspace/matrix`'s read models, never by reaching into
`src/vendor/generated/matrix.ts` directly — and freezes it into one string constant. No hand-typed
list of ids exists anywhere.

Rules the builder must follow, each because breaking it silently costs a cache:

- **Sort everything explicitly.** Categories by id, skills by id, `requires` ids within an edge.
  Use `bytewise` from `@workspace/compile` or a bare `.sort()` — **never `localeCompare`**, whose
  no-locale form reads `LC_ALL`/`LANG` and would reorder the projection on a differently-configured
  machine. `bytewise`'s own docblock names the Lithuanian collation that swaps two shipped skill ids.
- **Never rely on `Object.entries` order.** It is the generated file's insertion order, which the
  generator owns and a regeneration can change.
- **Emit nothing derived from the clock, the request, the environment or `crypto.randomUUID()`.**
- **Emit the public vendored catalogue only.** See [§D2.3](#d23-the-projection-is-the-public-catalogue-never-the-visitors).

**The drift gate is that there is nothing to drift**, because nothing is hand-maintained — and the
test that keeps it that way is a **census, not a sample**: assert that every id in `BUILT_IN_MATRIX`
appears in `SYSTEM_PROMPT`, derived from the matrix rather than from a literal list. A regenerated
catalogue that adds a skill the builder's filter happens to exclude then reddens on the day it lands,
rather than producing a model that has never heard of it.

Sizing is a command, not a number:

```
bun -e 'import {SYSTEM_PROMPT} from "./apps/server/src/compose-prompt.ts"; console.log(SYSTEM_PROMPT.reduce((n,b)=>n+b.text.length,0))'
```

**The floor that matters:** the minimum cacheable prompt length on `claude-sonnet-5` is **1,024
tokens** (Anthropic prompt-caching docs, per-model list). Below it, `cache_control` is ignored, **no
error is returned**, and both usage counters read `0`. The trimmed prefix is far above it; the check
in [§D2.7](#d27-proving-the-cache-actually-hits) is what would notice if it ever were not.

### D2.3 The projection is the PUBLIC catalogue, never the visitor's

**Decision, and the ruling was silent on it.** The system prompt carries `BUILT_IN_MATRIX` and only
that. It never carries the seated catalogue.

A visitor can load another marketplace (`useCatalogStore.getState().load(matrix, marketplace)`) and
can add external skills from GitHub. Projecting **their** catalogue would give every visitor a
different prefix, so every conversation would pay a cache write and no conversation would ever read
one — the ≈ $0.050 becomes ≈ $0.25 and nothing reports it.

It costs nothing, because **the existence check does not live in the worker**. `pruneUnknownIds`
runs in the browser against the seated catalogue (see [§D3.3](#d33-layer-2--existence)), so a model
that has never heard of a marketplace skill simply does not propose it — and one that hallucinates
an id has it dropped. The failure mode of the cheap answer is "did not suggest an obscure skill",
which is the failure mode of a search box.

### D2.4 There is no mode, and nothing selects one

**This section used to rule where the mode line goes: the system prompt described both modes and the
first user turn named the active one. The modes are gone, so it rules on nothing and the ruling is
recorded rather than deleted**, because "one prompt, mode in the user turn" was a decision someone
will otherwise reconstruct from the caching argument alone.

**What survives is the conclusion the argument was heading for anyway: ONE system prompt.** The
caching case for a single prefix was always the strong one — a per-mode prompt is two prefixes, two
cache entries, and a cache write the first time each is used inside a five-minute window, for no
capability one prompt lacks. **With no modes there is not even a second prompt to reject.** The
arithmetic in `decisions.md` §3 assumed one prefix and is unchanged.

**Nothing goes in the user turn except the sentence and the selection.** The model infers whether the
visitor is adding or changing from what they wrote, which is exactly what
`phase-c-spec.md`'s ruling 2 says intent is for. There is no flag to add, and adding one would give
the wire a concept the UI deliberately does not have.

The current selection goes in the **final user turn**: it changes every turn, and anything that
changes must sit after the breakpoint. **That is now the only thing after the breakpoint besides the
prose**, which slightly improves the cache picture rather than harming it.

### D2.5 One breakpoint, and the trap that eats it

`cache_control: { type: "ephemeral" }` goes on **the last block of the `system` array, and nowhere
else.** One breakpoint, explicit.

**Do not use automatic caching** (a top-level `cache_control` on the request body). The prompt-caching
docs describe exactly this structure as its trap: automatic caching places the breakpoint on the last
_cacheable_ block, which in a request with a varying suffix is the block that changes every time — so
every request pays a fresh write and never gets a read, with no error anywhere.

With one breakpoint at the end of `system`, **the messages are never cached at all**, and that is the
design rather than an oversight. It is what `decisions.md`'s arithmetic already assumes — one write
of ~8,100, three reads of ~8,100, and ~2,300 uncached input across four turns — and it has a useful
consequence: because nothing after the breakpoint is cached, **the message array's instability costs
nothing**. The client may re-render prior turns slightly differently between requests without
touching the cache.

### D2.6 The silent invalidators, named

The cache follows the hierarchy `tools` → `system` → `messages`, and a change at one level
invalidates that level and everything after it. Each row below is something this codebase could
plausibly introduce, and every one of them fails silently — the request succeeds, the answer is fine,
and the bill is ten times larger.

| Change                                                     | Invalidates                         | The plausible way in                                                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adding, removing or editing a tool definition**          | tools + system + messages           | "Let it call a search tool." There are no tools in this design; adding one is a decision, not a detail                                                              |
| **`output_config.format` changing**                        | the whole thread's cache            | Documented explicitly in the structured-outputs docs. A field added to `composerProposalSchema` mid-conversation, or two call sites building the schema differently |
| **`output_config.effort` changing**                        | messages, and system on some models | A "fast mode" toggle. `effort` is fixed at `"medium"` on every request, forever                                                                                     |
| **Thinking configuration changing**                        | messages, and system on some models | Same shape as effort                                                                                                                                                |
| **`tool_choice` changing**                                 | messages                            | Only reachable if tools are added                                                                                                                                   |
| **Adding or removing an image anywhere**                   | messages                            | Only reachable if the composer ever takes an attachment                                                                                                             |
| **A timestamp, a request id, or a session id in `system`** | system + messages                   | "Log which conversation this was" — it belongs in `cf-aig-metadata`, not the prompt                                                                                 |
| **Unsorted object iteration in the projection**            | system + messages                   | `Object.entries(matrix.skills)` after a regeneration reorders the file                                                                                              |
| **`localeCompare` in the projection**                      | system + messages                   | Reorders on a colleague's machine, not on yours                                                                                                                     |
| **The visitor's seated catalogue in `system`**             | system + messages                   | Every visitor a different prefix — [§D2.3](#d23-the-projection-is-the-public-catalogue-never-the-visitors)                                                          |

**Two more, from the API's own semantics:**

- **A cache entry becomes available only once the first response begins.** Two turns fired in
  parallel both miss. The composer is turn-by-turn, so this is a constraint on any future
  parallelism rather than on the design as specified.
- **The 5-minute TTL is measured from the START of the request that writes or reads it**, not from
  the end. A slow turn eats its own window. This is one of the things
  [§D6](#d6--streaming-and-the-argument-against-it-for-v1) says to measure.

**Do not set `temperature`.** It is deprecated for models released after Opus 4.6: `1.0` is accepted
for backwards compatibility and every other value is rejected with a `400`.

### D2.7 Proving the cache actually hits

**A cache that silently never hits costs 10× and reports nothing.** The `usage` object is the only
place the truth is written down.

After every call, the handler logs one structured record — the `log.ts` convention, which Workers
Logs ingests as queryable fields with no SDK and no vendor:

```
console.log({ event: "composer_usage", cacheRead, cacheWrite, uncachedInput, output, turn })
```

reading `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`, `usage.input_tokens`
and `usage.output_tokens`. `usage` is **not** returned to the browser: it is an operational number,
not part of a public contract, and the tests assert it at the SDK boundary instead.

Two conditions are logged at **`console.error`** under their own event names, because each is the
expensive failure and neither raises anything on its own:

| Condition                                                            | Event                   | What it means                                                                                                         |
| -------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `cache_read_input_tokens === 0 && cache_creation_input_tokens === 0` | `composer_cache_absent` | Caching is not happening **at all** — the prefix is under the minimum, or `cache_control` is not reaching the request |
| Turn index ≥ 2 and `cache_read_input_tokens === 0`                   | `composer_cache_missed` | The prefix moved between turns — one of the rows in [§D2.6](#d26-the-silent-invalidators-named)                       |

Both are queryable in the dashboard from the first deploy, which is what makes
[§D8](#d8--the-sequence-and-what-is-blocked)'s first-run check a query rather than a hope.

---

## D3 — The structured output and the three validation layers

### D3.1 The shared wire schema

> **SUPERSEDED IN PART, 2026-08-26 — read this before the schema sketch below.** This section was
> written against `{ skillIds, agentPins?, prose }` and that is **no longer the shape.** Owner ruling
> 2b in [`README.md`](./README.md) settles it: _"The model emits `skillEntrySchema` as it stands —
> `install`, `scope`, and `assignments` keyed by agent id with `{ load, enabled }` — so a proposal is
> indistinguishable from a hand-made selection and there is no second format to drift."_ There is
> **one forced deviation**: `assignments` is promoted from a record to `[{ agent, load, enabled }]`,
> because every object in a structured output carries `additionalProperties: false` and an open
> record therefore cannot be expressed. The client does one `Object.fromEntries` on arrival.
>
> **What survives from the text below:** the four reasons ids are `z.string()` and not an enum of the
> catalogue; where the schema lives; the `zodOutputFormat` stripping rule and its consequence; and
> `prose`. **What does not:** `skillIds`, `agentPins`, and every sentence resting on the proposal
> being ids only. [§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries) carries
> the corrections that matter most, because one of them has already propagated into a second
> document.
>
> **Two things to re-derive rather than inherit**, both flagged by
> [`phase-c-spec.md` §11.3](./phase-c-spec.md#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting):
>
> 1. **`PersistedConfig["skills"]` is `Record<skillId, SkillEntry>` — an open record too.** The same
>    `additionalProperties: false` argument that forced `assignments` into an array forces the skill
>    map into one. `README.md` names _"One forced deviation, and only one"_; unless the wire's top
>    level is already `[{ id, … }]`, there are two. **Verify against the SDK's own type declarations
>    before implementing**, exactly as that ruling instructs for the deviation it does name.
> 2. **`install` and `scope` ride on the entry, and ruling 2b says the feature does not touch them.**
>    See [§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries) for the clamp.

`packages/matrix/src/composer.ts`, exported as `@workspace/matrix/composer`, holding
`composerProposalSchema` and `ComposerProposal`.

**It goes there because that is where this repository already puts a wire contract two runtimes
share** — `seedPayloadSchema` (`./seed`) and `skillIndexSchema` (`./skill-index`) are both in
`packages/matrix` for exactly this reason, and both are imported by the worker and re-validated by
the editor. Plain `zod`, not `@hono/zod-openapi`'s `z`: `zodOutputFormat` takes a plain Zod type, and
`apps/server/src/index.ts` already passes a plain shared schema straight into a `content` block.

**SUPERSEDED SKETCH — kept because the four reasons under it survive, and struck so nobody copies
it:**

```
~~skillIds:   z.array(z.string())~~
~~agentPins:  z.array(z.string()).optional()~~
prose:      z.string()
```

**What it is now**, per ruling 2b — `skillEntrySchema` with each open record promoted to an array,
and the id fields still `z.string()` for the four reasons below:

```
skills: z.array(z.object({
  id:          z.string(),
  install:     z.enum(["plugin", "eject"]),      // carried by the shape; CLAMPED, see §D3.6
  scope:       z.enum(["project", "global"]),    // same
  assignments: z.array(z.object({
    agent:   z.string(),
    load:    z.enum(["lazy", "preloaded"]),
    enabled: z.boolean(),
  })),
}))
prose: z.string()
```

**The outer array is the second forced deviation** and `README.md` names only one — verify it
against the SDK's own type declarations before implementing, because `PersistedConfig["skills"]` is
an open record for exactly the reason `assignments` is. See
[§D3.6](#does-the-no-modes-shape-need-anything-added-to-express-an-edit-the-gap-is-closed-do-not-cite-it).

**Every id on the wire is `z.string()` and NOT an enum of the catalogue** — a skill id, and now an
agent id too. Four reasons, and the third is the one that decides it:

1. **Grammar cost, and it is the one reason here that is inference rather than a quoted limit.**
   Structured outputs compile the schema into a grammar, and the docs state internal limits on
   compiled grammar size beyond the explicit table, plus a 180-second compilation timeout. Whether an
   enum of the whole catalogue crosses either is **not documented** — so treat this as a risk to
   measure, not a fact. Re-derive the member count before arguing about it:
   `bun -e 'import {BUILT_IN_MATRIX} from "./packages/matrix/src/vendor/generated/matrix.ts"; console.log(Object.keys(BUILT_IN_MATRIX.skills).length)'`
2. **Enum casing is explicitly not guaranteed.** The docs say Claude may return a value differing
   from the schema only in capitalization, that this completes normally with no error and no special
   `stop_reason`, and that callers should compare case-insensitively. An id is a directory name.
3. **The worker does not know the visitor's catalogue.** An enum baked from `BUILT_IN_MATRIX` would
   make a legitimately-seated marketplace or external skill **unrepresentable in the response** —
   a refusal disguised as a schema.
4. **Layer 2 already exists** and does this job against the right catalogue. An enum would be a
   second, weaker answer to a question already answered.

**The agent id inside an assignment is `z.string()` for reason (3) alone**: the matrix schema
documents the agent roster as _"as marketplace-owned as the skills are"_. This paragraph used to be
about `agentPins`, which is gone with the old shape — the reason moved to the field that replaced
it, and the optional-parameter budget it spent is now spent on nothing, because every field above is
required.

**A constraint stripped is a constraint not enforced.** `zodOutputFormat` transforms the schema to
the supported subset — removing unsupported constraints and folding them into descriptions. String
`minLength`/`maxLength`, numeric bounds and array `minItems` beyond 0/1 are **not supported**. So
`z.string().min(1)` on `prose` is decorative at the API boundary. Anything the worker actually
requires of the parsed value is re-checked in the handler after `parse()`, in code, and the schema
carries a comment saying which constraints are advisory.

### D3.2 Layer 1 — shape, enforced server-side

`apps/server/src/compose.ts` calls:

```
client.messages.parse({
  model: "claude-sonnet-5",
  max_tokens: MAX_OUTPUT_TOKENS,
  system: SYSTEM_PROMPT,                       // the cached prefix, with its one breakpoint
  messages: renderThread(messages, selection),
  output_config: { effort: "medium", format: zodOutputFormat(composerProposalSchema) },
  metadata: { user_id: sessionId },
}, { headers: { "cf-aig-metadata": JSON.stringify({ session: sessionId }) } })
```

and reads `message.parsed_output`, typed `ComposerProposal | null`.

Every literal above is settled or derived:

- `claude-sonnet-5` — the owner ruling, and it is on the supported-model list for both structured
  outputs and `effort`.
- `effort: "medium"` — the owner ruling. Sonnet 5's API default is `high`, so this is an explicit
  non-default and must be **identical on every request** (see [§D2.6](#d26-the-silent-invalidators-named)).
- `MAX_OUTPUT_TOKENS` — a named constant, sized well above `decisions.md`'s ~2,000 projection because
  thinking is billed as output and a truncated response is a schema mismatch (`stop_reason:
"max_tokens"`). Its comment carries the projection, that the projection is the **one estimate** in
  §3, and the instruction to re-measure it against a real conversation.
- `metadata.user_id` — Anthropic's own abuse-detection field. Documented as an opaque identifier;
  the session id is a UUID and carries nothing identifying.
- `cf-aig-metadata` — **AI Gateway's custom metadata, which is a request HEADER and a different
  mechanism from `metadata.user_id`.** It is what per-visitor spend limits are scoped on. Up to five
  entries; keys beginning `cf.` are reserved and stripped.

The client is constructed **per request** from `c.env`, not at module scope — a Workers isolate has
no `process.env` and the secret arrives on the request's env.

### D3.3 Layer 2 — existence

**`pruneUnknownIds`, in the browser, against the seated catalogue.** Already shipped and already on
the share-link import path.

`apps/editor/src/features/configure/lib/composer-proposal.ts` does this in one direction:

1. Build the candidate `PersistedConfig` the proposal implies. **AMENDED 2026-08-26** — this step
   used to read _"current config, plus each proposed id with `DEFAULT_SKILL_OPTIONS` and
   `defaultAssignmentsFor(id)`, plus each `agentPin`"_, written when the wire carried ids only.
   Under ruling 2b the model emits whole entries, so:
   - an id **already selected** keeps its stored entry as the base — never rebuilt from defaults,
     which would silently discard the visitor's own edits;
   - an id in `remembered` restores from there, as `toggleSkill` does;
   - anything else starts at `DEFAULT_SKILL_OPTIONS` with `defaultAssignmentsFor(id)`;
   - **and the emitted entry is then laid over that base** — its `assignments` win where it names
     them, `install` and `scope` are clamped away
     ([§D3.6](#does-the-no-modes-shape-need-anything-added-to-express-an-edit-the-gap-is-closed-do-not-cite-it));
   - there is no `agentPins` step. That field is gone with the old shape.
2. Run `pruneUnknownIds` over it.
3. `dropped` = every emitted id absent from `pruned.skills`.

**This candidate is the single object the proposal renders from and `Apply` writes.** See
[§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries).

**The diff is how the drop stops being silent.** `pruneUnknownIds` drops without reporting, which is
correct where it runs today; here the visitor is looking at a proposal and a dropped row is a thing
they should be told about. Do not add reporting to `pruneUnknownIds` — compute the difference here.

`defaultAssignmentsFor` runs **before** the prune, which is deliberate: it is the deterministic
derivation (`resolveAssignment` bound to `PRELOAD_DEFAULTS`), and it answers `{}` for a skill no
seated catalogue carries.

~~The model never gets to invent a preload policy.~~ **CORRECTED 2026-08-26: under ruling 2b it
does, per edge, and that is the feature.** _"It may also choose preload vs lazy per skill"_, and the
worked example in the ruling is preloading React on the web agents' edges and leaving the rest
alone. `defaultAssignmentsFor` is now the **fallback** for an entry that arrives with no assignments,
not the authority over one that does — and the two must never both feed the same skill, because the
grid draws whichever one wins and the visitor cannot see which was consulted.

**What is still deterministic and still the safety argument:** the agent **roster** is not on the
wire in any form the model can extend, `pruneUnknownIds` drops every id the seated catalogue does not
carry, `judgeActiveSelection` judges legality, and nothing is written until `Apply`. A weaker model
still fails safe; what it can now get wrong is a load state the visitor can see in the grid and
change in one click.

### D3.4 Layer 3 — legality

**`judgeActiveSelection(ids)`**, in the browser. It is the exported accessor
`apps/editor/src/stores/catalog-store.ts` already ships — the same shape as `activeSkillById`, which
`default-assignments.ts` reaches the store through — so reach for it rather than writing
`useCatalogStore.getState().judgeSelection(...)` at a new call site. It is already seated on the
visitor's catalogue by `seatFor`, resolves conflicts symmetrically, walks `requires` to a fixpoint,
and applies the pick-one swap rule.

The proposal is judged **after** pruning, on the candidate selection. From one `SelectionJudgement`
the proposal reads:

| Field                            | Rendered as                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `implied`                        | Skills the selection also chooses without being clicked — listed as such |
| `verdictOf(id) → "incompatible"` | The row, with its structured `cause` put into words by the renderer      |
| `verdictOf(id) → "discouraged"`  | The row, with the authored `reason`                                      |

**The verdict is rendered as words by the editor, not carried as words from the semantics.**
`selection-semantics.ts` says so in its own header: verdicts are structured so each surface renders
the why in its own words. Do not add a `message` field to it.

### D3.5 When the model answers badly

**Decision: shown, with the reason. There is no repair turn.**

Every one of these is a `422` from the worker with a distinct machine-readable `reason`, which the
client renders as one sentence in the outcome slot:

| Condition                              | `reason`     | Why it happens                                                   |
| -------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `stop_reason === "refusal"`            | `refused`    | 200 status, billed for, and the output need not match the schema |
| `stop_reason === "max_tokens"`         | `truncated`  | Output cut off; incomplete and may not parse                     |
| `parsed_output === null`               | `unreadable` | Everything else the parser could not turn into a proposal        |
| Post-parse checks fail (empty `prose`) | `empty`      | The constraints `zodOutputFormat` stripped                       |

And an **illegal but well-formed** proposal — one `judgeSelection` calls incompatible — is not a
`422` at all. It is shown, as a proposal, with the incompatible rows marked and the reason beside
them.

**The defence, since this was mine to pick:**

1. **The always-proposal ruling removes the whole reason for a repair loop.** `decisions.md` §3 lists
   the repair loop under "what would flip it", conditional on a submit being a **silent mutation** —
   because then layer 3's verdict would have nowhere to go. Ruling 3 settled that it is never silent,
   so the verdict has somewhere to go and nothing is ever applied unreviewed.
2. **A repair turn doubles the cost of exactly the case that is already the model failing.** The
   failure budget is not where a second paid call belongs.
3. **The human loop is faster than the model loop.** The verdict names the conflicting skill; the
   grid is on screen; one click resolves it. A round trip is seconds and may fail the same way.
4. **The most common illegality is already resolved deterministically.** The pick-one swap rule
   forgives an incompatibility a swap would resolve, so the residue that reaches a user is small.
5. **A repair loop is a second, hidden turn against a four-turn budget.** It would spend a turn the
   visitor did not ask for and cannot see.

**If a repair turn is ever wanted, it is a user-visible button** — "try again" on the outcome slot —
not an invisible retry. That keeps the turn budget honest and puts the cost decision where the person
paying attention is.

### D3.6 What a proposal may write, and what the settled schema carries

**The emitted set is the complete intended selection.** There is no mode, so there is no second
reading of it and no clamp keyed on one.

| Field                     | Meaning                                                                       | Rendered                             |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| the skill entries         | The complete intended selection after this turn                               | Additions, removals and implications |
| — its `assignments`       | Per edge: which sub-agent, `load`, `enabled`                                  | The **diff grid**, cell for cell     |
| — its `install` / `scope` | Carried by the shape; **clamped, not read** — see above                       | Nothing. No row can be produced      |
| `prose`                   | One or two sentences for a human, never a restatement                         | The proposal's reason line           |
| ~~`agentPins`~~           | **Gone with the old shape.** Ruling 2b: the feature does not touch sub-agents | —                                    |

**Membership additions and removals fall out of a set difference against the current selection**,
computed in `composer-proposal.ts`. Nothing is inferred from a flag, because the answer is fully
determined by the two sets:

```
added   = proposed \ current
removed = current  \ proposed
```

**Per-edge changes do not.** For a skill in **both** sets, the diff is per (agent, skill) pair
between the stored entry and the emitted one, projected exactly as the options panel projects it —
`liveLoad`'s rule, where `enabled: false` reads as unassigned. That projection is what
[`phase-c-spec.md` §11.2](./phase-c-spec.md#112-what-the-grid-is-a-diff-of--the-mapping-cell-for-cell)
draws as a cell.

**THE CANDIDATE IS BUILT ONCE, AND THE GRID RENDERS FROM IT.** The proposal's diagram and the value
`Apply` writes must be **the same object**, never two derivations that happen to agree. Two
derivations of one value agree until they do not, and the pin between them cannot fail — a class this
repository has filed twice. Concretely, and this is the whole of it:

1. Build the candidate `PersistedConfig` from the current config and the emitted entries.
2. Run `pruneUnknownIds` over it ([§D3.3](#d33-layer-2--existence)).
3. Diff the pruned candidate against the current config. **That diff is the proposal's rendering
   input** — the rows, the counts and every cell in every grid.
4. `Apply` calls `applySavedStack(candidate)` — the existing action, one `set`, one flash clear —
   rather than N calls to `toggleSkill`, which would toggle an already-selected skill **off** and
   produce N separate writes.

**`defaultAssignmentsFor` must not be consulted for an edge the model named.** It remains the
fallback for an entry that arrives with no assignments, and it remains what a hand-made selection
uses — but where the model authored the edges, the model's edges are what the grid draws and what
`Apply` writes. Two answers to one question is exactly the shape that made this warning necessary.

**A re-added skill restores from `remembered`, not from defaults.** `toggleSkill` does
`remembered[skillId] ?? freshEntry(skillId)` precisely so that deselecting is not destructive; a
proposal that re-adds a skill the visitor had put down must not be **more** destructive than the
click that would have done the same thing. Where the model also names assignments for it, the
model's win — but the base to start from is the remembered entry.

#### The `adjust` write-permission conflict is CLOSED, by deletion

**Do not reopen this.** It was listed as an owner question in an earlier revision and it now has no
subject at all. The record, because a closed question with no written reason is a reopened question:

`phase-c-spec.md` § 3 used to carry a write-permission table saying `adjust` may write _"scope,
preload and install mode, on things already selected"_ and may **never** _"add or remove a skill"_.
This spec inverted both halves, not by preference but because the wire **as it then stood** could
not carry the first: the output schema was `{ skillIds, agentPins?, prose }` and had no field for
scope, preload or install mode.

**That is history, and the schema has since changed.** Ruling 2b makes the emitted shape
`skillEntrySchema` itself, so preload IS carriable per edge — see the corrections in the subsection
below. What is NOT resurrected is the permission table: there is no mode left to hold one, and a
single-field composer states what it may write by what the schema carries and what
[§D3.6](#does-the-no-modes-shape-need-anything-added-to-express-an-edit-the-gap-is-closed-do-not-cite-it)
clamps.

**The owner resolved it by removing the modes**, and the reason given was that `build` and `adjust`
_"essentially do the same thing"_ — which is the same finding this section reached from the schema
end. `phase-c-spec.md` § 3 records the deletion. **A distinction neither the UI nor the schema could
carry was not a distinction**, so there is nothing left to rule on.

#### ~~Does the no-modes shape need anything ADDED to express an edit?~~ **THE GAP IS CLOSED. Do not cite it.**

> **CORRECTED 2026-08-26.** This subsection used to state that the schema _"still cannot express a
> per-skill option change — moving a selected skill from `lazy` to `preloaded`, from `project` to
> `global`, or from `plugin` to `eject`"_, and it was true of the shape it was written against.
> **It is false now.** Owner ruling 2b makes the emitted shape `skillEntrySchema` itself, so `load`
> is a field on every assignment entry, and `install` and `scope` are fields on the entry.
> `lazy → preloaded` per (agent, skill) edge is expressible **and is the feature's stated point** —
> the owner's own worked example is _"always have React in context when developing for web."_
>
> **The claim has already propagated into two documents and must not travel further.** It reached
> `phase-c-spec.md` §11 as _"the UI is ready and the wire is not"_ and came back here as settled
> fact. It is corrected in place rather than appended to, because a spec stating a limitation that
> does not exist sends an implementer looking for a workaround they do not need.
>
> **One of its three reasons was also measured against the wrong shape, and that is worth keeping
> even though the conclusion is gone.** Reason 1 argued that any fix must be _"an array of
> optional-field objects against the 24-optional-parameter limit."_ A per-edge array —
> `[{ agent, load, enabled }]`, three **required** fields and one two-member enum — costs **zero**
> optional parameters. The limit was never the obstacle it was cited as. Reason 2 (a schema change
> invalidates the thread's prompt cache, [§D2.6](#d26-the-silent-invalidators-named)) stands and is
> now a cost to pay once rather than an argument against paying it.

**What the shape expresses, and what it deliberately does not:**

| Wanted                                | Expressible?                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Add a skill                           | Yes — it appears in the emitted set                                                                                       |
| Remove a skill                        | Yes — it is absent from the emitted set                                                                                   |
| `lazy → preloaded` on one edge        | **Yes.** `load` on that `assignments` entry                                                                               |
| Drop one agent from a selected skill  | **Yes.** `enabled: false`, or the entry omitted                                                                           |
| `project → global`, `plugin → eject`  | The schema carries them; **ruling 2b puts them outside the feature.** Clamped — see below                                 |
| Pin a sub-agent on or off             | **No, and deliberately.** `agentPins` is gone with the old shape and ruling 2b says the feature does not touch sub-agents |
| Set an agent's model, effort or scope | **No, and deliberately.** Same ruling                                                                                     |

**The `install` / `scope` clamp.** Ruling 2b's prose — _"It does not touch sub-agents, scope, install
mode, or anything else"_ — and the schema it settles in the same breath disagree, because
`skillEntrySchema` carries `install` and `scope`. **Take both from the current entry, or from
`DEFAULT_SKILL_OPTIONS` for a skill being added, and ignore what the model said.** Then no
`plugin → eject` or `project → global` row can be produced at all, and
[`phase-c-spec.md` §11](./phase-c-spec.md#11-a-proposal-shows-changes-as-well-as-additions--this-is-new-design)'s
rows for them stay designed and unproduced.

This is a **guarantee by construction**, which is the same shape as the `build`-cannot-remove union
this document records losing — and it is safe here for the reason that one was not: nothing the
visitor asked for is being discarded, only a field the ruling says the feature has no opinion about.
Assert it (`phase-c-spec.md` F42) rather than trusting it, and **do not resolve the disagreement by
widening what the pipeline writes** — it is [an owner question](#for-the-owner).

**And a reading that needs stating rather than assuming:** _"it does not touch sub-agents"_ cannot
mean "it does not author `assignments`", because `assignments` is where `load` lives and authoring
`load` per edge is the ruling's own example. The reading both specs work from is that the model
authors **edges** and never **agents** — no on/off pin, no model, no effort, no agent scope.

#### `build` could remove a skill now, and that is a real change

An earlier revision guaranteed _"`build` cannot remove a skill, by construction rather than by
instruction"_, implemented as a set union that discarded any removal the model proposed. **That
guarantee is gone with the mode, and its removal is a product change rather than a simplification.**

A single field invites _"drop the ORM"_, and refusing it would be refusing a sentence the composer's
own placeholder solicits (`Describe your project, or ask for a change…`). So the emitted set is taken
as the complete intended selection and a removal is rendered as a removal.

**What replaces the guarantee is ruling 3, and it is a stronger protection than the union was**:
nothing is applied until the visitor presses `Apply` on a proposal that enumerates every change,
removals included. The union protected against a model that removed something silently; there is no
silent path left for it to protect.

~~**But the removal ROW is not designed**~~ — **it is, as of the diagram ruling of 2026-08-26.**
[`phase-c-spec.md` §11.1](./phase-c-spec.md#111-the-removal-row--the-gap-is-closed) draws it: `91g`'s
row with the amber `＋` off the mark track and the state track empty, under a `Skills · N removed`
heading, with the departing edges shown in its grid as `pre →` / `lazy →`. No glyph and no colour
were minted, because the ruling asked for a **diagram** that shows both directions rather than for a
removal mark — and a diagram of a skill's reach draws it the same way whichever way the skill is
moving.

**The rule that produced the warning still binds, and it now binds somewhere else.**
_"Building the pipeline that produces removals before the row that renders them is how a proposal
ends up silently omitting a change it made"_ — the live instance of that is now **agents the grid
cannot place**. The options panel's grid draws 14 of the roster's 18 sub-agents; the four researchers
have no cell in it and no row in its meta fold, and they receive assignments.
[`phase-c-spec.md` §11.4](./phase-c-spec.md#114-not-every-edge-has-a-cell--and-173-of-238-skills-have-one-that-does-not)
carries the census and the rule that fixes it: **every touched agent the grid cannot place is drawn
as a labelled cell beneath it** — defined by what the grid could not place, never by
`domainId === "meta"`. A pipeline that emits an edge on `web-researcher` and a renderer that draws
14 of 18 agents is this warning's next instance, and it is the one to hold the line on.

---

## D4 — Abuse controls

**Not optional.** Today `allowOnlyWebOrigin` restricts the `Origin` header to `c.env.WEB_ORIGIN` —
and CORS is a browser policy that `curl` ignores entirely. There is no auth, no rate limit and no
quota anywhere in `apps` or `packages`. That is fine while the worst case is one content-addressed KV
write. At ~$0.05 a call it stops being fine: **$100 is gone in under an hour at one request a
second.**

Three controls, in order, all free.

### D4.1 Turnstile, once per conversation

**No Worker binding exists for Turnstile.** Verification is a plain `fetch` to
`https://challenges.cloudflare.com/turnstile/v0/siteverify` with `{ secret, response, remoteip }`,
which accepts JSON and always answers JSON.

**Verify once and mint a session — do not challenge every turn.** The reasons are the API's own:
tokens are **single-use** (a replay is rejected with `timeout-or-duplicate`) and valid for **300
seconds**. A four-turn conversation would need four fresh challenges, and any turn typed more than
five minutes after the widget rendered would fail on a token the visitor never saw expire.

`apps/server/src/compose-session.ts` holds both halves:

- `verifyTurnstile(token, remoteIp, secret)` — the fetch, its JSON shape parsed with a Zod schema
  rather than cast, and `error-codes` carried into the log on failure. **`catch` binds the error and
  reports it**; a diagnostic surface that drops the cause is the defect `CLAUDE.md` names.
- `mintSession(secret)` / `verifySession(token, secret)`.

### D4.2 The session token is signed, not stored

**Decision, and the ruling was silent on the mechanism.** The session is an **HMAC-SHA-256 signed
token**, stateless, verified with `crypto.subtle`. It is not a KV entry, not a Durable Object, and
not a cookie.

```
<base64url(JSON.stringify({ sessionId, expiresAt }))>.<base64url(HMAC-SHA256 over that)>
```

- `sessionId` — `crypto.randomUUID()`. It is the rate-limit key, the `cf-aig-metadata` value and the
  `metadata.user_id`, so all three abuse controls key on one identifier.
- `expiresAt` — `Date.now() + SESSION_TTL_MS`. A named constant, long enough for a four-turn
  conversation with thinking time and short enough that a scraped token is worth little.
- Verification goes through `crypto.subtle.verify`, so the comparison is the platform's rather than
  one written here. Never re-implement it: a hand-written `===` over two signature strings is a
  timing oracle, and the whole reason to reach for the verify API is that there is then no comparison
  to get wrong.

**Why not KV:** a mint is a write, and the free tier allows 1,000 writes a day. `createConfig`'s
`existing === null` check exists specifically to conserve them — spending them on abuse accounting
would break **sharing** before it stopped an attacker. **Why not a Durable Object:** it is a stateful
primitive for a claim that needs no state. An HMAC needs no storage at all, survives a cold isolate,
and cannot be exhausted.

The signing key is its own secret, `COMPOSER_SESSION_SECRET` — never the Anthropic key. A key used
for two purposes is a key that leaks two things.

### D4.3 The Workers rate-limit binding

Two bindings in `wrangler.jsonc`, each with its own `namespace_id`.

| Binding           | On                      | Key                | Note                                                        |
| ----------------- | ----------------------- | ------------------ | ----------------------------------------------------------- |
| `COMPOSE_LIMITER` | `POST /compose`         | `sessionId`        | The documented best practice: a stable per-actor identifier |
| `SESSION_LIMITER` | `POST /compose/session` | `cf-connecting-ip` | See the caveat below                                        |

Documented properties this design must live with, all of them stated in the Rate Limiting API docs:

- **`period` may only be `10` or `60` seconds.** Not 3600, not 300. Size the limit against a period
  that exists.
- **`namespace_id` is a string containing a positive integer, unique per account** — and two bindings
  sharing one, even across different Workers on the same account, **share counters**. Two distinct
  ids here.
- **It is per-Cloudflare-location.** A limit of N is N per colo, not N globally. Size accordingly and
  say so in the comment.
- **It is permissive and eventually consistent**, explicitly _"not… an accurate accounting system"_.
  It is a brake, not the ceiling. The ceiling is [§D4.4](#d44-the-ai-gateway-spend-cap-is-the-hard-ceiling).
- **Not visible in the dashboard.** A `429` is observable only through Workers Logs, which is why the
  refusal is logged under its own event name.

**The IP-keyed one needs its reason written down**, because the docs explicitly recommend against IP
keys — many users share one, especially on mobile networks. It is accepted here for one route only:
before a session exists there is no other actor identifier, the real barrier on that route is solving
a Turnstile challenge, and the limiter exists only to stop a flood of invalid tokens each costing us
one outbound siteverify call. The limit is set generously for that reason, and the false-positive
cost is that a visitor behind a shared NAT waits before starting a **new** conversation.

### D4.4 The AI Gateway spend cap is the hard ceiling

Configured on the gateway — dashboard or API, **not in this repository**. What the code owes it is
the `cf-aig-metadata` header from [§D3.2](#d32-layer-1--shape-enforced-server-side).

Two rules:

| Rule           | Dimensions                                 | Purpose                              |
| -------------- | ------------------------------------------ | ------------------------------------ |
| Global ceiling | none                                       | One shared bucket. Protects the card |
| Per-visitor    | metadata key `session`, **split by value** | Each conversation its own budget     |

Documented caveats to record beside the configuration:

- **Cost tracking is a best-effort estimation** from token counts and model pricing; the provider
  dashboard is the accurate figure.
- **Spend limits are eventually consistent** — the current request's cost is recorded after
  completion, so a burst of concurrent requests can briefly exceed the limit.
- Spend limits apply to **BYOK requests** as well as Unified Billing, for models with known pricing.
- Exceeding one returns **`429`**, which is why `429` on `/compose` covers both the limiter and the
  cap. The client renders one sentence for both; the worker logs which.

### D4.5 What is explicitly NOT built

**No per-IP budget accounting in KV.** Three reasons, and any one is sufficient:

1. **KV is eventually consistent.** A budget read that lags is a budget that does not hold under
   exactly the burst it exists to stop.
2. **1,000 writes a day on the free tier**, and a per-request budget write spends one every call.
3. **It would break sharing to protect the composer.** `createConfig`'s `existing === null` check
   exists to conserve those writes, and its comment says so — _"fifty opens of one config cost a
   single write"_. A composer budget would exhaust the same daily allowance the share button depends
   on.

Also not built: any user account, any login, any cookie, any CAPTCHA other than Turnstile, and any
allowlist beyond the CORS origin that already exists.

---

## D5 — Secrets and deployment

### D5.1 Three secrets, and they are secrets

| Secret                    | Set with                                                       | Never                                 |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| `ANTHROPIC_API_KEY`       | `wrangler secret put ANTHROPIC_API_KEY --env production`       | In `vars`, in a `.env`, in the bundle |
| `TURNSTILE_SECRET_KEY`    | `wrangler secret put TURNSTILE_SECRET_KEY --env production`    | Same                                  |
| `COMPOSER_SESSION_SECRET` | `wrangler secret put COMPOSER_SESSION_SECRET --env production` | Same                                  |

**The `vars` block in `apps/server/wrangler.jsonc` holds deliberately-public values and says so.**
`SENTRY_INGEST_HOST` and `SENTRY_PROJECT_ID` carry a note that they are _"Not secret — both already
ship inside the browser bundle as part of the DSN"_. That is the bar for entry. Nothing above meets
it.

**One new `vars` entry:** `ANTHROPIC_BASE_URL`, the AI Gateway endpoint
(`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic`). Not a secret — it is an
address, exactly as `WEB_ORIGIN` is — and declared so `worker-configuration.d.ts` types it as always
present rather than optional.

**"BYOK" names two different arrangements on AI Gateway, and this spec picks the first.** Cloudflare's
Anthropic provider page documents both, and they differ in which secret the Worker holds:

| Variant                     | What the Worker sends                                               | Where the Anthropic key lives |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| **Key in request** — chosen | `apiKey: env.ANTHROPIC_API_KEY`, `baseURL` at the gateway           | A Worker secret               |
| Stored Keys (BYOK)          | `apiKey: "placeholder"` plus `Authorization: Bearer <cf_api_token>` | Inside the gateway            |

Both are BYOK in the pricing sense the ruling used — you pay Anthropic, and the gateway adds no token
markup — and **spend limits apply to either**, which is the property [§D4.4](#d44-the-ai-gateway-spend-cap-is-the-hard-ceiling)
depends on. The key-in-request variant is chosen because it is what
[§D5.1](#d51-three-secrets-and-they-are-secrets)'s premise already assumes and because it keeps one
credential in one place this repository controls; the stored-key variant would trade the Anthropic
secret for a Cloudflare API token, which is a broader credential.

**If the owner configures stored keys instead**, the change is confined to the client construction in
`compose.ts` — and the provider docs are explicit that `x-api-key` must then **not** be sent, because
the gateway supplies the key and an extra header fails the request.

**Named environments inherit nothing.** `wrangler.jsonc` says so in as many words: _"every binding
and var below is a deliberate restatement, not a duplicate, and dropping one would remove it at the
edge rather than fall back."_ Every new `var` and every new `ratelimits` entry must appear in **both**
the top level (which `wrangler dev` and vitest read via `configPath`) and the `production` block.
Run `bun run cf-typegen` after, and commit the regenerated `worker-configuration.d.ts`.

### D5.2 The editor's env surface has no place for a secret

`apps/editor/src/env.schema.ts` is read from two runtimes, and the build-time one is
`parseEnv(loadEnv(mode, __dirname, "VITE_"), mode === "production")` in `vite.config.ts`.

**The `"VITE_"` third argument is the mechanism, not the comment.** `loadEnv` filters to that prefix,
so a non-`VITE_` key added to `envSchema` is simply absent from what `parseEnv` receives and the
**build fails** — before anything is emitted, which is the file's own stated purpose. Vite inlines
every `VITE_*` value into the bundle, so everything in that schema is published to every visitor by
construction.

**The gap, stated precisely so nobody relies on more than exists:** the mechanism catches a
**required** key. A non-`VITE_` key added as `.optional()` would parse as `undefined` and fail at
runtime instead. Nothing in this phase adds one; the honest statement is that the surface is
`VITE_*`-only by a mechanism that covers the required case.

**One addition:** `VITE_TURNSTILE_SITE_KEY`. A Turnstile **site** key is rendered into the widget and
is public by design, so it belongs here. Optional, with `""` folded into `undefined` — the exact
shape `VITE_SENTRY_DSN` and `VITE_POSTHOG_KEY` already use, and for the same reason: CI substitutes
an unset secret with an empty string. Its value goes in `apps/editor/.env.production`.

**Absent, the composer's send button reports that the composer is unavailable and sends nothing.**
That is safe rather than a hole: the worker refuses `/compose` without a valid session token whatever
the browser does, so a missing site key produces a **visibly dead feature**, not an unprotected route.

### D5.3 What `check-deployable-bundle.ts` must be taught

**Nothing. Leave it exactly as it is.**

Its header states its design: one deliberately positive assertion — the built bundle names the API
that `.env.production` declares — and it argues at length against the obvious negative check
("refuse if the bundle contains localhost") on the ground that a rule which cries wolf gets switched
off. Adding assertions dilutes the one claim it makes.

More to the point, the hazards are not comparable. A wrong `VITE_API_URL` is catastrophic and silent:
every request from every visitor goes to a laptop and nothing says so. A wrong or missing
`VITE_TURNSTILE_SITE_KEY` is a composer that visibly does not work, on a route the worker refuses
anyway.

**What would change this ruling:** a value being inlined whose wrongness is both silent and costly.
If a future change moves the gateway address into the bundle, that is a second `VITE_API_URL` and
earns a second positive assertion.

### D5.4 The deploy path

`bun run deploy` at the root is `turbo deploy`, and **three workspaces declare a `deploy` script**:

```
grep -l '"deploy"' apps/*/package.json packages/*/package.json
```

`apps/editor` (bundle check, then `wrangler deploy`), `apps/server` (`wrangler deploy --env
production`) and `apps/www` (`wrangler deploy`). **There is no per-app deploy script in the
repository** — a worker-only deploy is `turbo deploy --filter=server`, which nothing names and which
is worth knowing when the only change is in `apps/server`.

`turbo.json` declares `deploy` as `dependsOn: ["build"]` with
`passThroughEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]`, under `envMode: strict` — so
wrangler sees nothing not named there. **Secrets set with `wrangler secret put` are unaffected**:
they live at the edge, not in the deploy environment. Nothing in `turbo.json` changes.

---

## D6 — Streaming, and the argument against it for v1

**Decision: non-streaming, with a typing indicator in the outcome slot.**

`decisions.md` §3 already records `streamObject` / `partialOutputStream` as the strongest single
feature any candidate has, because the proposal list fills in as it generates. That remains true and
is not what this decision turns on.

### What the alternative actually costs

`apps/server/src/index.ts` builds one chained expression precisely so `AppType` carries every route
to the editor's `hc<AppType>` client, and **an SSE route does not fit `@hono/zod-openapi`'s JSON
response model.** So streaming means one of two things:

1. **Register outside the chain** and hand-write the client. This loses the property the file exists
   to preserve and the standard that enforces it. `editor-and-worker.md` § 2's exemption for a route
   off the client's surface is narrow and reasoned — _"a route reached only by a literal URL is
   exempt from the test and not from the `/index` ban"_ — and it applies to a route nothing computes
   a path for. A composer route the editor calls per turn is not that.
2. **A `streamSSE` handler with its own contract**, hand-typed at both ends, sitting beside four
   routes that are typed off one source.

**On the in-repo precedent, a correction.** `tunnelEnvelope` **is** in the chain —
`.openapi(tunnelRoute, tunnelEnvelope)`. What it is deliberately off is the **client's** surface: the
editor reaches `/monitoring` through Sentry's `tunnel` option, a literal URL string in
`apps/editor/src/lib/observability/sentry.ts`, and `editor-and-worker.md` § 2 states that exemption
and its reason. So the precedent is "in the chain, off the client", not "outside the chain" — and
either streaming option above would be the first route to leave the chain entirely.

### Two more costs specific to this design

- **Structured output plus streaming means a partial object.** Grammar constraints hold, but the
  proposal is only complete at `finalMessage()`, so the three validation layers cannot run until then
  — the fill-in-as-it-generates value is presentational.
- **The cache TTL is measured from the start of the request**, not the end, so a long stream eats
  its own 5-minute window and the next turn may pay a fresh write.

### The measurement that would justify revisiting

**Real latency on a real conversation at `effort: "medium"`, against the real cached prefix** — not a
synthetic prompt and not `effort: "high"`.

Record, per turn, from the client's send to the proposal being rendered:

```
p50, p90, and the worst of ten, over two full four-turn conversations
```

Revisit if p50 time-to-proposal exceeds ~8 seconds, or if any turn regularly exceeds ~20 seconds. Do
the same measurement as part of [§D8](#d8--the-sequence-and-what-is-blocked)'s first run, since the
number does not exist until a key does — and re-measure `MAX_OUTPUT_TOKENS`'s projection at the same
time, since `decisions.md` says outright that 2,000 is the one estimate in §3 and was projected
rather than measured.

---

## D7 — Testing

Written first and watched to fail, per the root `CLAUDE.md`. Every test below runs in
`apps/server/src/compose.test.ts` unless named otherwise.

### D7.1 The harness, and what it can and cannot do

`apps/server/vitest.config.ts` wires the real Workers runtime as a Vite plugin via `cloudflareTest`,
with `wrangler: { configPath: "./wrangler.jsonc" }`, so bindings and vars come from that file. Its
docblock records two losses in 0.20 that both apply here:

- **`fetchMock` is gone.** Outbound calls are intercepted with `vi.stubGlobal("fetch", …)` and
  `vi.unstubAllGlobals()` in `afterEach` — `clearMocks: true` clears mock **calls**, not stubbed
  globals. This works because the `main` worker runs in the same isolate as the tests, while
  `SELF.fetch` is a `Fetcher` method rather than the global. `stubGitHub` in
  `apps/server/src/crawl.test.ts` is the shape to copy, including its returned `calls` array.
- **`isolatedStorage` is gone**, so KV state leaks between tests in a file. Nothing here writes KV.

**Test-only secret values** come from the pool's `miniflare` option, which merges over `configPath`
with `miniflare` taking precedence. A fake `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET_KEY` and
`COMPOSER_SESSION_SECRET` there are test fixtures, not secrets, and no real value is ever committed.

**One thing the developer must establish by running it, not by assuming:** whether the pool provides
the `ratelimits` binding at all. Report the answer either way. If it does not, **do not weaken an
assertion to go green** — omit the limiter spec with a named `// KNOWN GAP:` stating the mechanism,
and move its verification to the first-run checklist in [§D8](#d8--the-sequence-and-what-is-blocked).

### D7.2 How these tests avoid being vacuous

**A mocked SDK that returns whatever the test wants proves only that the plumbing runs.** Two rules
make that not the case here, and both must be visible in the file:

1. **Assert on the request the stub RECEIVED, not on the response the stub returned.** The stub
   records every outbound call; the assertions read the recorded request body. That makes the system
   prompt, the cache breakpoint, `effort`, the absence of `temperature` and the byte-stability across
   turns all directly observable, and none of them is something the test controls.
2. **Choose responses the test knows to be wrong, and assert what the pipeline does with them.**
   A hallucinated id, a refusal, a truncation, a null parse. The subject is the validation pipeline,
   and the pipeline runs against the **real catalogue** rather than a mock.

### D7.3 The specs

**Request shape — the anti-vacuity block.**

| Spec                                                                      | Asserts on                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| two consecutive turns send a byte-identical `system`                      | `JSON.stringify(recorded[0].system) === …[1].system` |
| the request carries exactly one `cache_control`, on the last system block | the recorded body                                    |
| `output_config` is `{ effort: "medium", format: … }` on every turn        | the recorded body                                    |
| the request names no `temperature`                                        | `"temperature" in body === false`                    |
| the request carries no tools                                              | `"tools" in body === false`                          |
| the model is `claude-sonnet-5`                                            | the recorded body                                    |
| `cf-aig-metadata` names the session and no `cf.` key                      | the recorded headers                                 |

**The system prompt, against the real catalogue** (`apps/server/src/compose-prompt.test.ts`):

- **Every skill id in `BUILT_IN_MATRIX` appears in `SYSTEM_PROMPT`.** Derived from the matrix, never
  from a literal list — a census, not a sample.
- The prompt names **no** `conflictsWith` line and **no** sub-agent, per the trim.
- Building it twice in one process yields an identical string.
- **Building it under `vi.useFakeTimers()` with the clock advanced a year yields the same string.**
  This tests the property directly. Do not proxy it with "contains no four-digit year" — skill
  descriptions carry version numbers and counts, so that assertion is a flake waiting for a
  catalogue regeneration.
- It matches no UUID pattern. (Safe as a regex: nothing in the catalogue's prose is a UUID.)

**The validation pipeline** (`apps/editor/src/features/configure/lib/composer-proposal.test.ts`,
against the seated public catalogue — **this is the one the brief asks for**):

| Spec                                                                                                                | Why it is not vacuous                                                      |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| a proposal naming `not-a-real-skill` alongside real ids keeps the real ones and reports the invented one as dropped | The catalogue is real; the drop is `pruneUnknownIds`'s                     |
| a proposal naming two members of one exclusive category is shown with a verdict, not applied                        | `judgeSelection` on the real catalogue                                     |
| a proposal whose skills imply others lists the implications                                                         | `judgement.implied`                                                        |
| **the control:** an entirely valid proposal produces no drops and no verdicts                                       | Without it, a pipeline that rejected everything would pass every row above |

That last row is not optional. `CLAUDE.md`'s rule is explicit: a refusal pinned without a permitted
case beside it, **in the same file**, cannot tell a correctly-scoped guard from one that has
swallowed its whole domain.

**Bad model answers** — one spec each for `refusal`, `max_tokens`, `parsed_output === null` and the
post-parse checks, asserting the `422` and its `reason`.

**Abuse controls, and their controls:**

| Spec                                                                 | Asserts                                     |
| -------------------------------------------------------------------- | ------------------------------------------- |
| no session token → `401`, **and the stub was never called**          | `calls.length === 0`                        |
| a tampered signature → `401`, stub never called                      | `calls.length === 0`                        |
| an expired `expiresAt` → `401`, stub never called                    | `calls.length === 0`                        |
| a message array over the cap → `400`, stub never called              | `calls.length === 0`                        |
| **the control:** a valid session and body → the stub IS called       | Without it, every row above passes for free |
| siteverify answering `{ success: false }` → `403`, no session minted | the mint route                              |
| a replayed token (`timeout-or-duplicate`) → `403`                    | the mint route                              |

**CORS**, copying `index.test.ts`'s `REFUSED_BODIES` shape: every refusal `/compose` can produce
carries `access-control-allow-origin`, listed as bodies so each provokes its own answer — including
the ones produced by middleware ahead of the handler.

**The typed client**, mandated by `editor-and-worker.md` § 2 and copying the existing
`the typed client the editor uses` block: `hc<AppType>(BASE, { fetch: SELF.fetch.bind(SELF) })`,
reaching `client.compose.$post(...)` and `client.compose.session.$post(...)`.

**Editor e2e** (`apps/editor/e2e/specs/composer.spec.ts`, extending Phase C's): the worker is stubbed
with `page.route(\`${WORKER_ORIGIN}/compose\`, …)`following`e2e/support/sharing.ts`. Cover a
proposal rendered, a proposal applied changing config **and** the grid, a `422`rendering a sentence
and changing nothing, and a`429` rendering a sentence and changing nothing.

**Phase C's own specs must stay green unmodified**, and two of them are what a `mode` field sneaking
back would redden: **F29** (typing an opener by hand produces the same outcome as clicking its chip)
and **T17** (nothing records which chip was clicked). If either needs editing to accommodate this
phase, the change is wrong — a chip is a writing aid, and nothing here may tell one apart from typing.

**Assert config and filesystem — here, config and store — on both sides of every apply.** Where a
spec says nothing should change, snapshot before and assert identical after.

---

## D8 — The sequence, and what is blocked

### D8.1 Blocked on the owner, and only these

| Needed                       | For                                         | Nothing else can substitute              |
| ---------------------------- | ------------------------------------------- | ---------------------------------------- |
| An Anthropic API key         | Any real model call                         | —                                        |
| A Cloudflare AI Gateway      | `ANTHROPIC_BASE_URL`, spend caps, analytics | Without it there is no hard ceiling      |
| Turnstile site + secret keys | A real challenge                            | The widget cannot be faked in production |

**One further owner item DOES block a piece of the build**, which is a change from the previous
revision: **the removal row** ([owner question 1](#for-the-owner)). The set difference in
`composer-proposal.ts` produces removals and nothing is drawn to render them, so stage 7 below can
build every other part of the proposal and must stop at that row rather than invent a glyph.

Two that do not block anything: the spend-cap **amounts** (global and per-session), and what to do
with a sentence asking for a per-skill option change
([owner question 2](#for-the-owner)) — the pipeline is correct either way and the difference is one
sentence in the system prompt.

### D8.2 What can be built, tested and merged before any of them exist

**Everything except the live call.** Concretely:

**The eight stages are unchanged by the mode removal, and every one of them got slightly smaller.**
Nothing was reordered, nothing merged and nothing dropped: no stage existed to build a mode. Stage 1
loses a schema field, stage 2 loses a paragraph from the prompt, stage 4 loses the enum from the
request schema, and stage 6 loses the per-mode clamp in favour of a set difference. **Stage 7 is the
only one that gained a constraint** — the removal row it now has data for is undrawn, so it is
partly blocked on [owner question 1](#for-the-owner).

| Stage | Work                                                                                                              | Gated by a key?   |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1     | `packages/matrix/src/composer.ts` — the shared wire schema and its tests                                          | No                |
| 2     | `apps/server/src/compose-prompt.ts` — the projection, and its census test against `BUILT_IN_MATRIX`               | No                |
| 3     | `apps/server/src/compose-session.ts` — Turnstile verify (fetch, stubbable) and the HMAC session, with their tests | No                |
| 4     | `apps/server/src/compose.ts` + the two routes in the chain, with the whole of [§D7.3](#d73-the-specs)             | No                |
| 5     | `wrangler.jsonc` — `ANTHROPIC_BASE_URL`, both `ratelimits` bindings, restated in the `production` block           | No                |
| 6     | `apps/editor/src/lib/api/compose.ts` and the proposal pipeline, with tests                                        | No                |
| 7     | Filling Phase C's proposal from real data, and the e2e specs. **Partly blocked** — see above                      | No, but see above |
| 8     | `VITE_TURNSTILE_SITE_KEY` in the env schema, `.env.example` and `.env.production`                                 | Value only        |

**All eight merge green**, because every model call and every siteverify call is a stubbed global
`fetch` and every catalogue read is the real vendored catalogue. `.env.production`'s
`VITE_TURNSTILE_SITE_KEY` line is the one thing that lands as a placeholder, and the field being
optional means the build does not care.

**The Turnstile widget itself** needs a site key to render. Build the composer so an absent key
short-circuits at the send handler with the "unavailable" sentence — which is a state the e2e can
drive by not setting the variable, and therefore a tested state rather than an untested branch.

### D8.3 What the first run after the keys arrive must verify

By hand, through the real deployed editor, in this order. This is step 4 of the root `CLAUDE.md`
workflow — _"passing tests and a working command are different claims"_.

1. **The Turnstile widget renders and a challenge mints a session.** Then: **a second conversation in
   the same tab mints a second session** — the single-use property means a re-used token must fail,
   and this is the check that catches a widget that was never reset.
2. **One turn returns a proposal**, and the proposal's rows are skills the catalogue actually holds.
3. **The cache is real.** Query Workers Logs for `composer_usage` and confirm: turn 1 has a non-zero
   `cacheWrite`; turns 2–4 have a non-zero `cacheRead` of the same magnitude. Then confirm **zero**
   `composer_cache_absent` and **zero** `composer_cache_missed` records. This is the check worth 10×
   the bill, and it is the reason those two events exist.
4. **The gateway sees it.** The request appears in AI Gateway analytics with a cost attached and with
   `session` metadata, and the per-session spend rule buckets on it.
5. **The rate limiter fires.** Exceed `COMPOSE_LIMITER` on one session and confirm a `429` — and, if
   §D7.1 established that the pool does not simulate the binding, this is where its only verification
   happens.
6. **Latency**, per [§D6](#d6--streaming-and-the-argument-against-it-for-v1): p50, p90 and worst-of-ten
   over two four-turn conversations. Write the numbers into this file's §D6 and re-measure
   `MAX_OUTPUT_TOKENS`'s projection from the same runs.
7. **The spend cap blocks.** Set a per-session rule to a value one conversation exceeds, confirm the
   `429`, then restore it. A ceiling nobody has watched refuse anything is a ceiling nobody knows is
   wired up.

---

## Constraints

### Files to create

| File                                                               | Purpose                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/matrix/src/composer.ts`                                  | `composerProposalSchema`, `ComposerProposal`. Exported as `./composer`                                                                                                                                                                                                                                                     |
| `packages/matrix/src/composer.test.ts`                             | The schema's own tests                                                                                                                                                                                                                                                                                                     |
| `apps/server/src/compose.ts`                                       | The two handlers and the SDK call                                                                                                                                                                                                                                                                                          |
| `apps/server/src/compose.test.ts`                                  | [§D7.3](#d73-the-specs)                                                                                                                                                                                                                                                                                                    |
| `apps/server/src/compose-prompt.ts`                                | The projection and `SYSTEM_PROMPT`                                                                                                                                                                                                                                                                                         |
| `apps/server/src/compose-prompt.test.ts`                           | The census against `BUILT_IN_MATRIX`                                                                                                                                                                                                                                                                                       |
| `apps/server/src/compose-session.ts`                               | Turnstile verify + HMAC mint/verify                                                                                                                                                                                                                                                                                        |
| `apps/server/src/compose-session.test.ts`                          | Both halves                                                                                                                                                                                                                                                                                                                |
| `apps/editor/src/lib/api/compose.ts`                               | The typed client, on `configs.ts`'s shape                                                                                                                                                                                                                                                                                  |
| `apps/editor/src/lib/api/compose.test.ts`                          | Result-kind translation, as `configs.test.ts` does                                                                                                                                                                                                                                                                         |
| `apps/editor/src/features/configure/lib/composer-proposal.ts`      | Layers 2 and 3, the candidate, and the per-membership and per-edge diff                                                                                                                                                                                                                                                    |
| `apps/editor/src/features/configure/lib/composer-proposal.test.ts` | The pipeline, against the real catalogue                                                                                                                                                                                                                                                                                   |
| ~~`.../components/composer-proposal.tsx`~~                         | **DELETED FROM THIS LIST, 2026-08-26.** Phase C shipped the renderer as `apps/editor/src/features/configure/components/proposal.tsx` (`ProposalBlock`, `Proposal`, `ProposalGroup`, `ProposalRow`). A second renderer beside it is a second thing to drift. Extend that file; it is on [Files to modify](#files-to-modify) |

Flat, prefixed files under `apps/server/src/` rather than a `compose/` directory: that workspace is
flat today (`index.ts`, `log.ts`, `skill-index.ts`, `crawl.ts`) and one feature does not earn a new
convention.

### Files to modify

| File                                                              | Change                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/index.ts`                                        | Two `createRoute`s, two `app.use` CORS lines, one body-cap middleware, and **two more `.openapi()` links in the existing chain**         |
| `apps/server/src/index.test.ts`                                   | The compose routes join the `hc<AppType>` block and the CORS `REFUSED_BODIES` class                                                      |
| `apps/server/wrangler.jsonc`                                      | `ANTHROPIC_BASE_URL` var and two `ratelimits` — **in both the top level and `production`**                                               |
| `apps/server/worker-configuration.d.ts`                           | Regenerated by `bun run cf-typegen`. Do not hand-edit                                                                                    |
| `apps/server/package.json`                                        | `@anthropic-ai/sdk` dependency                                                                                                           |
| `apps/server/vitest.config.ts`                                    | `miniflare.bindings` for the three test-only secret values                                                                               |
| `packages/matrix/package.json`                                    | `"./composer": "./src/composer.ts"` in `exports`                                                                                         |
| `apps/editor/src/env.schema.ts`                                   | `VITE_TURNSTILE_SITE_KEY`, optional, `""` folded — the `VITE_SENTRY_DSN` shape                                                           |
| `apps/editor/.env.example`, `.env.production`                     | The site key, commented and set respectively                                                                                             |
| `apps/editor/src/features/configure/components/composer.tsx`      | **Phase C's file.** Submit handler calls the client; outcome slot renders the proposal                                                   |
| `apps/editor/src/features/configure/components/proposal.tsx`      | **Phase C's file.** The producer changes; this renderer changes only as `phase-c-spec.md` §11.10 already asks. Do NOT write a second one |
| `apps/editor/e2e/pages/composer.ts`, `e2e/specs/composer.spec.ts` | **Phase C's files.** Extended, not rewritten                                                                                             |

### Files NOT to touch

| File                                                    | Why                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/editor/scripts/check-deployable-bundle.ts`        | [§D5.3](#d53-what-check-deployable-bundlets-must-be-taught) — nothing to teach |
| `packages/matrix/src/read-model/selection-semantics.ts` | Layer 3 is used, never changed. No `message` field is added to a verdict       |
| `apps/editor/src/stores/persisted-schema.ts`            | `pruneUnknownIds` is used, never changed. The drop diff is computed outside    |
| `packages/matrix/src/vendor/**`, `src/generated/**`     | Generated. `packages/cli` is the single writer                                 |
| `packages/compile/**`                                   | The renderer is Phase B's; nothing here compiles anything                      |
| `packages/cli/**`                                       | The CLI has no composer and is deliberately narrower than the editor           |
| `apps/www/**`                                           | Untouched by this phase                                                        |
| `todo/**`                                               | Sub-agents do not edit the trackers. The orchestrator does, as each lane lands |

### Technical constraints

- **One new runtime dependency**, `@anthropic-ai/sdk`, and it goes in `apps/server` only. Nothing
  from it may reach `apps/editor`'s bundle — the shared schema is in `packages/matrix` precisely so
  the editor never imports the SDK to know the response shape.
- **No new dependency in `apps/editor`.** Turnstile's widget is a `<script>` tag from
  `challenges.cloudflare.com`, not an npm package.
- **`zodOutputFormat` is typed against `zod/v4`.** Both workspaces are on `zod ^4.4.3`. Whether the
  root `zod` export satisfies that parameter without a cast is something to **establish by compiling**
  — and if it does not, the fix is the import specifier, never a cast.
- No `as` cast on any union member, per `packages/cli/CLAUDE.md`. Ids on the wire are `string` because
  they genuinely arrive unvalidated; that is the documented exception, not a loophole to widen.
- No magic numbers. Every cap, TTL, limit and token budget is a named constant carrying its reason.
- `getErrorMessage`/`messageOf` for unknown errors; **no bare `catch {}` and no `_error` rename** —
  a diagnostic surface that drops the cause is the defect.

---

## Success criteria

### Functional

| Criterion                                                                                     | How to verify                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A sentence produces a proposal listing skills, never a mutation                               | e2e: config store byte-identical before Apply is pressed                                                                                                             |
| A proposal naming an id the seated catalogue lacks shows the rest and reports the drop        | `composer-proposal.test.ts`                                                                                                                                          |
| A proposal that is illegal is shown with `judgeSelection`'s reason and can still be discarded | `composer-proposal.test.ts` + e2e                                                                                                                                    |
| A proposal omitting a currently-selected id renders that as a **removal row**, not silently   | Unit: the set difference is asserted in both directions, with an all-additions control beside it. **UNBLOCKED 2026-08-26** — `phase-c-spec.md` §11.1 designs the row |
| A proposal moving one edge `lazy → preloaded` renders a **changed cell**, not a silent write  | Unit, plus one story. This is what ruling 2b bought and it is the criterion that proves the wire carries it                                                          |
| **Every agent an emitted entry touches is drawn somewhere** — grid or labelled block          | Unit against `phase-c-spec.md` F36. A `web-researcher` edge is the case that fails a grid-only renderer                                                              |
| The candidate the grid renders from **is** the object `Apply` writes                          | One assertion, not two: after `Apply`, re-reading the store yields the value the diff was computed against — `phase-c-spec.md` F41                                   |
| `install` and `scope` are clamped: a model answer naming `eject` produces no changed row      | Unit — `phase-c-spec.md` F42                                                                                                                                         |
| The request body carries no `mode` field                                                      | Asserted on the recorded request: `"mode" in body === false`                                                                                                         |
| The request body carries no `agentPins` field                                                 | Same recorded request. The field is gone with the old shape and nothing should resurrect it                                                                          |
| Apply changes the config store **and** the grid                                               | e2e asserts both sides                                                                                                                                               |
| A `422` and a `429` each render one sentence and change nothing                               | e2e, snapshot-before/assert-identical-after                                                                                                                          |
| No session token reaches the model                                                            | `calls.length === 0`, with the positive control beside it                                                                                                            |

### Technical

| Criterion                                                        | How to verify                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Both routes are in the one `.openapi()` chain                    | The `hc<AppType>` block compiles and passes                              |
| Neither path ends in `/index`                                    | `grep -n 'path: "[^"]*/index"' apps/server/src/index.ts` returns nothing |
| The system prompt is byte-identical across turns                 | Asserted on the recorded request, not on intent                          |
| Exactly one `cache_control`, on the last system block            | Asserted on the recorded request                                         |
| The prompt names every catalogue skill id                        | Census derived from `BUILT_IN_MATRIX`                                    |
| The request carries no `temperature` and no `tools`              | Asserted on the recorded request                                         |
| No secret appears in `wrangler.jsonc` or in any `VITE_*` surface | Two commands, both must return nothing — see below                       |
| Every new binding and var is restated in the `production` block  | Read both blocks; `worker-configuration.d.ts` regenerated and committed  |
| All gates green                                                  | `bun run lint typecheck test` and `bun run test:e2e`, unfiltered         |
| Editor first paint unmoved                                       | `bun run build` in `apps/editor` — the budget check is the gate          |

**The two secret checks, scoped so they can still be trusted.** A repository-wide grep for
`ANTHROPIC_API_KEY` is worthless here: `packages/compile/src/generated/corpus.ts` embeds an agent
playbook whose prose names that variable, so the wide form returns a multi-kilobyte false positive
and a check that cries wolf gets switched off. Name the files where a secret must never appear
instead:

```
grep -rn "ANTHROPIC_API_KEY\|TURNSTILE_SECRET_KEY\|COMPOSER_SESSION_SECRET" \
  apps/server/wrangler.jsonc apps/editor/.env.production apps/editor/.env.example \
  apps/editor/src/env.schema.ts
```

```
grep -rn "sk-ant-" apps packages --include='*.ts' --include='*.tsx' --include='*.json' --include='*.jsonc' | grep -v node_modules
```

Both return nothing today, which is what makes them able to say something later.

### Non-functional

| Criterion                                                           | How to verify                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| The cache reads on turns 2–4                                        | `composer_usage` in Workers Logs, first deployed run      |
| Neither `composer_cache_absent` nor `composer_cache_missed` appears | Same query                                                |
| The proposal is keyboard-reachable and announced                    | The renderer follows the dialogs' existing a11y treatment |
| A dropped id is never silently dropped                              | The drop diff is rendered; asserted in the e2e            |

### What is deliberately NOT a criterion

- **A quality bar on the model's suggestions.** There is no eval in this phase. The safety argument
  is structural — the model emits ids and every step after it is deterministic — and `decisions.md`
  §3 records why a weaker model fails safe here.
- **A cost figure.** `decisions.md`'s arithmetic is a projection; §D8.3 replaces it with a measurement
  and §D6 says which numbers to write back.
- **Streaming latency.** Non-streaming is the v1 decision; §D6 names the measurement that would
  reopen it.

---

## Implementation notes

### For the api developer

**Build in the order in [§D8.2](#d82-what-can-be-built-tested-and-merged-before-any-of-them-exist).**
Stages 1–3 are pure and testable with no route at all, and getting the prompt's byte-stability tests
red-then-green before any handler exists is what makes the rest of the phase cheap.

**Three things that will bite:**

1. **The chain.** Adding `.openapi(composeRoute, compose)` on a new statement compiles, runs, serves
   the route, and silently removes it from `AppType`. The `hc<AppType>` test is what catches it.
2. **`wrangler.jsonc`'s named environment inherits nothing.** A binding added only at the top level
   works in dev and in every test and is absent at the edge.
3. **The SDK has no `process.env`.** Construct the client per request from `c.env`, and pass `apiKey`
   explicitly.

**Decisions already made — do not re-open:** the model, the effort, the trim, four turns, the always-
proposal, ids-only output, HMAC over KV, one breakpoint at the end of `system`, one system prompt with
no mode anywhere, no repair loop, no per-IP KV budget.

### For the web developer

**Phase C builds the proposal, not just a slot for it.** Ruling 3 moved the proposal into that phase,
so `proposal.tsx` exists with its header, groups, rows, reason line and footer, and it renders the
zero-change state. **This phase changes the producer, not the shape** — `phase-c-spec.md` § _Proposal
→ local `useState`_ carries the `Proposal` / `ProposalGroup` / `ProposalRow` types and says so in as
many words. Fill them; do not redesign them.

**Do not move the slot, do not add a child to the band, and do not touch the sticky-foot
arrangement.** Phase C's dock has three children — the suggestion chips, the outcome slot and the
band — and the first two are mutually exclusive by construction. A proposal renders into the slot
that already exists.

**Three things Phase C designed, all of which this phase is the first to need. None is blocked.**

- **The changed row** — `phase-c-spec.md` §11: the mark track empty, the state track holding
  `<before> → <after>` with amber on the `after` half only. Fully specified; build it as written.
- **The removal row** — `phase-c-spec.md` §11.1. **Unblocked 2026-08-26**: no `＋` on the mark
  track, an empty state track, under a `Skills · N removed` heading. No glyph and no colour were
  minted, and the old instruction to "stop there and report" no longer applies.
- **The diff grid** — `phase-c-spec.md` §11.2 to §11.9. The owner's ruling that the options panel's
  `MatrixGrid` is reused as the diff. Per skill, disclosed from its row, `{ before, after }` per
  cell, and **every touched agent the grid cannot place drawn as a labelled cell beneath it** — the
  four researchers are the live case and a grid-only renderer omits them silently.

**The one thing to hold the line on**: `defaultAssignmentsFor` and the model's emitted `assignments`
are two answers to one question, and exactly one may reach both the grid and `applySavedStack`. See
[§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries) — the candidate is built
once, rendered from, and written.

**`91g` is an unlocked sketch that was never drawn into the assembled screen** and is absent from
`DECISIONS.md`. Build what the data supports and flag any styling question rather than inventing a
locked answer.

Apply goes through **`applySavedStack`**, once, with the merged config. Never a loop of
`toggleSkill`.

### For the tester

Write [§D7.3](#d73-the-specs) first and watch each spec fail. **Two failure modes to guard against
specifically:**

- **A green test that never reached the stub.** Every "the stub was never called" assertion needs its
  positive control in the same file, or a handler that refuses everything passes them all.
- **A green test that asserts what it supplied.** Assertions about the prompt, the breakpoint,
  `effort` and `temperature` all read the **recorded request**. If a spec's assertion could be
  satisfied by the value the test itself chose, it is testing nothing.

Use factories and the existing e2e support modules; `e2e/support/sharing.ts` is the shape for stubbing
a worker route, and `e2e/pages/composer.ts` (Phase C's) owns every locator.

### For the reviewer

**Focus areas, in order:**

1. **The chain.** Is the route registered in the one expression? Does the `hc<AppType>` block reach
   both new routes?
2. **Cache stability.** Read `compose-prompt.ts` for anything that varies: a clock, a UUID, an
   unsorted iteration, a `localeCompare`, a seated catalogue. Then read `compose.ts` for anything
   that varies `output_config` between requests.
3. **Non-vacuity.** For each assertion, ask whether the test itself supplied the value being
   asserted. Confirm every refusal spec has its permitted case in the same file.
4. **Secrets.** Nothing in `vars`, nothing in `VITE_*`, nothing in a committed `.env`. Both blocks of
   `wrangler.jsonc` restate every binding.
5. **The blast radius of layers 2 and 3.** Neither `pruneUnknownIds` nor `selection-semantics.ts`
   should appear in the diff.

---

## Open questions

### Resolved here, with reasons

| Question                                       | Answer                                                                                             | Where                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Whose catalogue is in the prompt?              | The public one, always                                                                             | [§D2.3](#d23-the-projection-is-the-public-catalogue-never-the-visitors) |
| One prompt per mode, or one for both?          | **The question has no subject.** There are no modes; there is one prompt and no mode line anywhere | [§D2.4](#d24-there-is-no-mode-and-nothing-selects-one)                  |
| Is an id on the wire an enum of the catalogue? | No — four reasons                                                                                  | [§D3.1](#d31-the-shared-wire-schema)                                    |
| Illegal output: repair turn or show it?        | Show it, with the reason                                                                           | [§D3.5](#d35-when-the-model-answers-badly)                              |
| Where does the session live?                   | A signed token; no storage at all                                                                  | [§D4.2](#d42-the-session-token-is-signed-not-stored)                    |
| What does the bundle check learn?              | Nothing, and what would change that                                                                | [§D5.3](#d53-what-check-deployable-bundlets-must-be-taught)             |
| Where does the shared schema live?             | `@workspace/matrix/composer`                                                                       | [§D3.1](#d31-the-shared-wire-schema)                                    |

### For the owner

**Question 1 is CLOSED.** _"`adjust`'s write permissions"_ was the first item here and it has no
subject: the modes were removed on 2026-08-26, and
[§D3.6](#d36-what-a-proposal-may-write-and-what-the-settled-schema-carries) records the closure with
its reasoning rather than deleting it. It is not renumbered into, so nobody re-derives it from the
gap.

1. **~~What does a REMOVAL row look like?~~ CLOSED 2026-08-26 by the diagram ruling.** The owner
   asked that the options panel's `MatrixGrid` be reused as a diff, and a diagram of a skill's reach
   draws it identically whichever direction the skill is moving — so the removal row needed no glyph
   and no colour of its own. It is
   [`phase-c-spec.md` §11.1](./phase-c-spec.md#111-the-removal-row--the-gap-is-closed). **Recorded
   rather than deleted**, so nobody re-derives it from a gap.
2. **~~What should happen to a sentence asking for a per-skill OPTION change?~~ MOSTLY CLOSED, and
   narrowed to two fields.** _"Make Vitest preloaded"_ works: ruling 2b puts `load` on every
   assignment entry and choosing preload vs lazy is the feature's stated purpose. What is left is
   `install` and `scope` — carried by `skillEntrySchema` and excluded by the same ruling's prose
   (_"It does not touch sub-agents, scope, install mode"_).
   [§D3.6](#does-the-no-modes-shape-need-anything-added-to-express-an-edit-the-gap-is-closed-do-not-cite-it)
   proposes a **clamp** (take both from the current entry, ignore what the model said) so no such
   row can be produced. The alternatives are to render them — contradicting the prose — or to answer
   in `prose` that the composer will not. **Not decided here.**

   2a. **`README.md` names "one forced deviation, and only one" — there may be two.**
   `PersistedConfig["skills"]` is `Record<skillId, SkillEntry>`, an open record, so the same
   `additionalProperties: false` argument that promoted `assignments` to an array promotes the skill
   map too. Verify against the SDK's own type declarations before implementing, exactly as that
   ruling instructs for the deviation it does name.

   2b. **Does "it does not touch sub-agents" forbid authoring `assignments`?** It cannot, since
   `load` lives there and authoring `load` per edge is the ruling's own example. Both specs work
   from the reading that the model authors **edges** and never **agents** — no on/off pin, no model,
   no effort, no agent scope. Confirm it rather than leaving it inferred.

3. **The two spend-cap amounts** — the global ceiling and the per-session budget. `decisions.md`
   costs a conversation at ≈ $0.050 cold and ≈ $0.030 warm; the per-session figure should be a small
   multiple of one conversation, and the global one is a monthly budget decision.
4. **Whether the proposal renders `91g`'s shape** or something drawn for the assembled screen. Phase C
   surfaced this and it is still open; this phase can ship the data-faithful version either way.
5. **Does EDITOR-10 want doing now?** Not a blocker —
   [`phase-c-spec.md` §11.4](./phase-c-spec.md#114-not-every-edge-has-a-cell--and-173-of-238-skills-have-one-that-does-not)
   draws every agent the grid cannot place as a labelled cell instead, and that rule keeps working
   after EDITOR-10 lands. Worth knowing anyway: EDITOR-10's only stated blocker was that a fifth
   column would diverge from a design file drawing four roles, and **the shipped grid already draws
   two** — the per-domain PMs and reviewers were consolidated away (CLI-398, CLI-399), so that file
   stopped describing this surface some time ago.

### Deliberately not asked

**Which model.** Settled: `claude-sonnet-5` at `effort: "medium"`. `decisions.md` records the
downgrade from Opus as costing nothing but latency, because the model emits ids and everything after
it is deterministic — so a weaker model fails safe. It is not re-opened by a disappointing
suggestion; it is re-opened by an eval, and there is no eval in this phase.
