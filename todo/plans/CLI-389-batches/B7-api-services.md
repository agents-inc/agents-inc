# B7 — api services (16 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B7, §2a groups #11/#12/#13, §4; relationship-coverage decisions 2/3; D-306 for
anything the vocabulary cannot express. Skill bodies read at
`/home/vince/dev/skills/src/skills/api-{vector-db,search,cms,analytics,flags,observability,email}-*`;
current rules verified in `packages/cli/src/cli/lib/configuration/default-rules.ts` (three
conflict groups touch this batch — `{pinecone, qdrant, chroma, weaviate}` at 52-54,
`{elasticsearch, meilisearch}` at 56-58, `{payload, sanity, strapi}` at 60-62 — plus exactly one
`requires` among the 16: `resend-react-email needsAny [react, nextjs, remix]` at 630-634, with
its parity `compatibleWith` group at 319-321, and the three `alternatives` purpose groups at
911-913). Categories verified in `default-categories.ts` and the generated matrix: all six B7
categories are `exclusive: false` today. Product claims verified 2026-08-07 via Context7
(`/payloadcms/payload`, `/websites/posthog_libraries`) and web search.

**Headline: the three flag flips are confirmed correct and complete — each group is exactly its
whole category, nothing is queued to join, and the one-provider fence survives the coexistence
attack as a steady-state default (B6-verifier precedent). The setup/usage pairs need NO
`requires` in either direction — the product's own default stacks select every usage skill
without its setup skill, so a hard link would put the shipped defaults in violation. The batch's
real news is in the bindings: setup-resend silently carries the identical React Email binding
its usage sibling already declares (one missing `requires`), and the "class-C proving case"
setup-axiom-pino-sentry binds `requires needsAny [nextjs]` because stripping its Next slice
leaves nothing followable (SKILLS-09's finding, now with a rules consequence). The batch's
original third binding — payload → `requires [nextjs]` — was **OVERTURNED in verification**
(verify-B7-B11 item 3, the wave's one overturn): the taught surface is host-neutral and the
worksheet's class-C payload row stands.** Net rules delta: 3 `exclusive: true` flips,
**2** adopted `requires` (setup-resend, setup-axiom-pino-sentry), 1 kept `requires`
(resend-react-email), 0 links between setup/usage pairs.

## 1. The three flag flips — groups #11/#12/#13 (§2a) CONFIRMED

Membership reverified against the generated matrix: `api-vector-db` has exactly
{pinecone, qdrant, chroma, weaviate} (4/4), `api-search` exactly
{elasticsearch, meilisearch} (2/2), `api-cms` exactly {payload, sanity, strapi} (3/3). Group ==
whole category holds for all three, so `exclusive: true` reproduces each fence exactly and the
three conflict groups become redundant-inside-an-exclusive-category, dying free in Phase C.
Nothing is queued to join: zero tracker items for typesense/algolia/pgvector/milvus/contentful/
directus/keystone in `todo/`, and the only lookalikes in the marketplace are two empty husk
directories (F1) that are not catalog members.

Each radio attacked the way verify-B6 attacked api-kv (radio = steady-state default;
dual-during-migration is acceptable to fence):

- **`api-vector-db` — one vector store per service. Radio right.** The strongest coexistence
  pattern is Chroma-in-development → Pinecone-in-production, which the RAG literature documents
  as a _graduation/migration path_ ("just have a migration path ready"), not a steady state of
  one codebase — and where the split persists, the code goes through an abstraction layer
  (LangChain/LlamaIndex vector-store interfaces, which are `ai-orchestration`'s skills, not
  these), so the two stores' native SDK patterns don't both live in the service. Multi-store
  RAG with role splits (one store for hybrid search, another for scale) is exotic and nowhere
  documented as a recommended architecture. Recorded as D-306 residue:
  chroma↔pinecone dev/prod split (the one real minority pattern).
  Sources: [vector DB comparison 2025](https://latenode.com/blog/ai-frameworks-technical-infrastructure/vector-databases-embeddings/best-vector-databases-for-rag-complete-2025-comparison-guide),
  [RAG vector DB selection](https://customgpt.ai/rag-vector-database-selection/).
- **`api-search` — one application-search engine. Radio right, one real dual-role residue.**
  For the category's purpose (product/content search — its description says "Search engines"),
  picking both is not a steady state; Meilisearch's own comparison frames them as alternatives
  for that job. The genuine coexistence is _role-split_: Elasticsearch running as log/analytics
  infrastructure beside Meilisearch driving product search — real and documented-adjacent
  ("teams already run ES for logs" is the canonical situation). Within this catalog the logs
  role belongs to `api-observability` (Axiom), which steers that use away from the search
  category and softens the over-fence — but a team standardized on ES for logs who wants the ES
  skill _and_ Meili for search is legitimately blocked. Recorded as D-306 residue:
  elasticsearch↔meilisearch dual-role (search-vs-analytics), same shape as B6's
  redis↔upstash note. Sources:
  [Meilisearch vs Elasticsearch (official docs)](https://www.meilisearch.com/docs/resources/comparisons/elasticsearch),
  [Meilisearch's ES review](https://www.meilisearch.com/blog/elasticsearch-review).
- **`api-cms` — one CMS per project. Radio right, cleanest of the three.** Two full CMS
  platforms in one service is architecturally incoherent (each owns content modeling, admin UI,
  and delivery APIs); dual-running is a migration window. Multi-property setups (marketing site
  on Sanity, app on Payload) are separate projects in this catalog's per-project frame. No
  residue worth recording.

Cross-category note (not a defect): the elasticsearch skill teaches kNN/`dense_vector` search
(`examples/vector-search.md`), so ES doubles as a vector store. ES-instead-of-a-dedicated-
vector-DB and ES-beside-one both stay selectable across the two categories — correctly (F6).

## 2. The setup/usage pairs — usage does NOT `require` setup (all three pairs)

The question (worksheet §B7): do posthog-flags/posthog-analytics require setup-posthog,
resend-react-email require setup-resend, axiom-pino-sentry require its setup skill? **No —
the binding is advisory in every case, and adopting it would break the product's own data.**

Four convergent pieces of evidence — the first corroborating, grounds 2-4 carrying the
verdict alone (demoted per verification: it is contingent on the stacks staying as curated):

1. **(Corroborating.) The default stacks already select usage without setup, everywhere.**
   `default-stacks.ts` stacks `api-analytics-posthog-analytics`,
   `api-email-resend-react-email` and `api-observability-axiom-pino-sentry` into every
   full-stack agent roster; **no default stack contains any setup-\* skill at all** (F5). A
   `usage requires setup` rule would put every shipped default in violation on day one —
   though if F5 ever resolves by adding setup skills to stacks, this evidence evaporates while
   grounds 2-4 stand.
2. **The usage bodies are self-sufficient on the setup surface they need.**
   posthog-analytics carries its own provider/client wiring (`examples/client-tracking.md` —
   "React hooks, provider setup"; `examples/server-tracking.md` — posthog-node singleton);
   posthog-flags carries bootstrapping and client init (`examples/development.md`);
   resend-react-email carries client setup in `examples/core.md`. An agent doing usage work is
   not blocked by the setup skill's absence.
3. **Usage-in-an-existing-project is the dominant mode.** A project that ran setup once (or was
   born instrumented) selects only the usage skill forever after; `requires` would gray the
   usage skill in exactly the steady state it serves. This is the reasoning decision 3 already
   applied when it un-radioed `api-email` ("setup + usage are a pair" — they compose).
4. **The setup bodies define the boundary themselves.** setup-posthog's "When NOT to use":
   "Event tracking patterns after setup (use analytics event tracking skill); Feature flag
   usage patterns (use feature flags skill)" — complementary halves, neither depending on the
   other being _selected_. The observability usage skill's "When NOT to use" points setup work
   at "official docs" (a cross-reference gap, F7, but further evidence it does not assume the
   setup skill).

The pairing is real as a _recommendation_ (greenfield projects genuinely want setup + usage
together) — exactly the semantics `recommends` had before it was deleted. Handed to D-306:
"pairs-with/recommends for setup+usage skill pairs (posthog, resend, axiom-pino-sentry)" rather
than mis-encoded as `requires`, which would also impose wizard ordering UX for no gain. Reverse
direction (setup requires usage): no, trivially — setup stands alone for greenfield.

Also verified per the brief: `api-analytics` and `api-observability` are `exclusive: false` in
`default-categories.ts` and the generated matrix, and the decision-3 slice records flipping only
`shared-monorepo` and `api-email` — nothing indicates these two were ever exclusive. The pairs
(and the posthog trio) have always composed.

## 3. Framework bindings — the batch's real work

### payload — NO binding (question d): the proposed `requires [nextjs]` was OVERTURNED in verification

The batch as first written adopted `requires [nextjs]` from the product's install story — the
exact move the wave's doctrine forbids — and verify-B7-B11 item 3 overturned it. The taught
surface, censused in full, is host-neutral: the entire `api-cms-payload` directory contains
**one** `next` token (SKILL.md:344, a monorepo version-mismatch gotcha); zero
`@payloadcms/next`, zero `create-payload-app`, zero app-router/admin-mounting/instrumentation
content; **0/5 MUSTs** are Next-keyed (one actively mandates keeping JSX/React imports OUT of
the config); and all 6 patterns plus the decision frameworks are
`buildConfig`/collections/access/hooks/`getPayload` Local API — precisely the surface Payload
documents **outside** Next. The two facts the batch first filed as "counterweights" are the
load-bearing evidence:

- **Headless/Local-API use outside Next is officially documented, and it IS the taught
  surface** — standalone scripts, separate backend services, and Local API calls from
  SvelteKit/Remix/Nuxt ("Payload can be used completely outside of Next.js … running scripts,
  a separate backend service, or … SvelteKit, Remix, Nuxt" —
  [docs: outside Next.js](https://payloadcms.com/docs/local-api/outside-nextjs)); the core
  `payload` package has no runtime Next dependency.
- **The framework-adapter era is arriving**: Payload 4.0 is decoupling exactly the Next-hosted
  pieces — admin rendering, RSC, loaders, API mounting — from the core the skill teaches
  ([Payload 4.0 announcement](https://payloadcms.com/posts/blog/payload-40-admin-ui-redesign-tanstack-mcp-and-more);
  [payload-tanstack-demo](https://github.com/payloadcms/payload-tanstack-demo), payload PR
  #16139).

The admin panel — Next-hosted today, and the ground the batch leaned on — is a **separate
deployable the skill does not teach**: the identical shape as Sanity Studio, which this
batch's own sanity row ruled "a separate deployable, not a constraint on the consuming
service". The sanity row was the template. In-catalog victims seal it: `requires [nextjs]`
plus the `web-framework` radio would make payload unreachable for every remix and nuxt
headless consumer — the maestro shape. Self-scope is absent too: the body never names Next as
its scope, and "When NOT to use: … only need a REST API without an admin panel" is product
steering (when to pick a CMS at all), not framework self-scope. Honest concessions kept: the
standard install IS Next-only (`@payloadcms/next` mandatory) and the admin panel runs only on
Next today — but that is the electron-testing/apollo package-fact shape, and the followability
test runs on demonstrated content, never on the upstream product's install story.

**Disposition: no rule.** Class **C**, adapters-today `[nextjs]` (the untaught
admin/HTTP-mounting host slice), derived-requires **none**; verdict stays
`constrained-via-exclusivity-or-requires` via the `api-cms` flip — the radio is payload's only
fence, which the flip already delivers. D-306 line: "payload's full surface (admin panel,
mounted REST/GraphQL) is Next-hosted today; the taught surface (config, collections, access
control, hooks, Local API) is the documented headless mode and host-neutral — nextjs pairing
is `recommends`-shaped; re-derive if the body ever grows Next mounting content, or when 4.0
framework adapters land."

### resend-react-email — class B (react) CONFIRMED (question c); keep the existing rule

The worksheet row is right. React Email templates are React components by identity — JSX,
typed props, `PreviewProps`, `@react-email/components` peer-depending on react/react-dom
([react.email docs](https://react.email/docs/components)). The existing rule
(`needsAny [react, nextjs, remix]`, default-rules.ts:630-634) stays; note that nextjs and remix
both `require react`, so post-EDITOR-11-closure the rule collapses to `[react]` — the 3-member
form is a no-closure-era artifact, harmless either way. Class B, frameworks `[react]`.

D-306 nuance worth recording once for the catalog: **React-as-template-renderer is not
React-as-app-framework.** React Email runs in any Node backend (a Hono/Express service, even
one serving a Vue frontend, can render and send React Email), but because `react` sits in the
exclusive `web-framework` radio, `requires react` fences every Vue/Svelte/Angular project out
of the catalog's only email-usage skill. The `requires` vocabulary cannot distinguish
"framework as dependency" from "framework as identity". Steady-state-default reading keeps the
rule; the residue names the cost.

### setup-resend — the SAME binding, currently missing (asymmetry, F3)

setup-resend's body is not a neutral Resend skill: it is titled "Resend Email & React Email
Setup", its primary pattern is `resend.emails.send({ react: MyTemplate(props) })`, its monorepo
structure is `.tsx` templates, and its own "When NOT to use" says "this skill covers React
Email templates". Resend-the-product is framework-agnostic (plain HTML/text over HTTP), but
this skill as written is React Email-bound — identical in kind to its usage sibling, which the
catalog already fences. Adopt the mirrored rule
(`setup-resend needsAny [react, nextjs, remix]`); class B (react) as written. If the skills
repo ever recuts it (neutral Resend core + react-email adapter — a SKILLS-09-style split), it
becomes class C and the rule regenerates from the adapter surface.

### setup-axiom-pino-sentry — class C by intent, single-adapter in fact → `requires needsAny [nextjs]`

SKILLS-01 names this a class-C proving case and migrates it "as-is; its non-Next branch
question stays SKILLS-09". As-is means: every pattern is Next-specific — `next-axiom`,
`@sentry/nextjs`, `next.config.ts` wrapped `withAxiom(withSentryConfig(...))`,
`instrumentation.ts`, sentry.{client,server,edge}.config.ts. SKILLS-09 already records
"Next-only in all but name". The binding's authority is the adjudicated **conditional**
derivation rule (verify-B7-B11's CLI-405 ruling, which supersedes SKILLS-01's unconditional
"only adapter derives needsAny" sentence — B11's setup-env already proved that sentence wrong
as written): the test is followability of the remainder, and stripping the Next slice leaves
nothing followable — every pattern presumes the Next host. The honest audit row today is:
class C, adapter surface `[nextjs]`, **derived `requires needsAny [nextjs]` — adopt it now**.
No default stack contains the skill, so nothing breaks. When SKILLS-09 grows a non-Next branch,
the adapter set widens and the rule regenerates. Recording it as an open-surface class C with
no binding would re-create exactly the "empty = audited or nobody looked?" ambiguity this audit
exists to kill.

### The no-binding calls: PostHog trio, axiom-pino-sentry usage, sanity — and payload (above)

All five have React-flavoured client slices over a self-sufficient neutral core, and the core
is why none gets a `requires`:

- **posthog-flags / posthog-analytics / setup-posthog**: PostHog is SKILLS-01's own named
  class-C exemplar, and the product is genuinely multi-framework — posthog-js is plain JS with
  official Vue/Svelte/Angular wiring ([Vue](https://posthog.com/docs/libraries/vue-js),
  [Svelte](https://posthog.com/docs/libraries/svelte)), and **feature flags evaluate fully
  server-side via posthog-node local evaluation with no frontend framework at all**
  ([Node local evaluation](https://posthog.com/docs/libraries/node)). The skills' client
  examples teach `posthog-js/react` hooks (`useFeatureFlagEnabled`, `PostHogProvider`) — a
  react adapter surface — but the server halves (posthog-node, GDPR/naming/group-analytics
  patterns) stand alone; a Hono-only backend using server-side flags is a first-class use.
  Class C, adapters today `[react]`, derived-requires **none** (the neutral core is
  self-sufficient, so deriving `needsAny [react]` from the adapter listing would over-fence —
  a SKILLS-01 derivation nuance worth naming: adapters that _extend_ a self-sufficient core
  must not become constraints; contrast setup-axiom-pino-sentry, where the core itself is
  Next-shaped).
- **axiom-pino-sentry (usage)**: Pino structured logging, correlation IDs, OpenTelemetry
  spans, Axiom monitors, Sentry filtering — neutral, any-Node-service patterns. The React
  slice (`examples/error-boundaries.md`, `global-error.tsx`) is an adapter surface. Class C,
  adapters today `[react]` (arguably nextjs for global-error), derived-requires none.
- **sanity**: `@sanity/client`, GROQ, schemas, mutations, TypeGen — all framework-agnostic;
  the one React-wired slice is Portable Text rendering via `@portabletext/react`, and official
  Vue/Svelte renderers exist ([portabletext org](https://github.com/portabletext)). Class C,
  adapters today `[react]`, derived-requires none. (Sanity Studio is itself a React app, but
  it is a separate deployable, not a constraint on the consuming service — the ruling that
  became payload's template in verification.)

strapi and the six vector/search skills are pure server SDKs — class A, no mentions to
neutralize beyond example flavor (weaviate's v3 client is explicitly server-only).

## 4. posthog-analytics + posthog-flags coexistence (question e) — CONFIRMED free

No conflict group touches any posthog skill (the three B7 groups at default-rules.ts:52-62 are
vector/search/cms only); `api-analytics` is `exclusive: false`; all three skills carry
`category: api-analytics` in metadata (including posthog-flags, whose _id prefix_ is
`api-flags-` — F4). One platform, one SDK install, two concerns: setup-posthog's own body says
"PostHog handles both analytics AND feature flags", and posthog-analytics lists "A/B testing
analysis (in conjunction with feature flags)" as a use. Nothing fences them today; nothing in
this batch's dispositions (no flip for `api-analytics`) introduces a fence. Confirmed compose.

## Manifest rows

Batch id `api-services`, audited `2026-08-07`. 12 constrained / 4 universal.

| skill (current id)                                                  | category (disposition)                 | verdict                                                | class                       | frameworks              | derived-requires                                                                                              | sources                                                                                                                                                                                                                        | notes                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ | --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pinecone (api-vector-db-pinecone)                                   | api-vector-db (flip `exclusive: true`) | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (@pinecone-database/pinecone v7, namespaces, hybrid); https://docs.pinecone.io                                                                                                                                      | Serverless SaaS, server SDK.                                                                                                                                                                                                                                                              |
| qdrant (api-vector-db-qdrant)                                       | api-vector-db (flip)                   | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (@qdrant/js-client-rest v1.17, payload indexes, quantization); https://qdrant.tech/documentation                                                                                                                    |                                                                                                                                                                                                                                                                                           |
| chroma (api-vector-db-chroma)                                       | api-vector-db (flip)                   | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (chromadb v3, auto-embedding); https://docs.trychroma.com                                                                                                                                                           | D-306 residue: chroma↔pinecone dev/prod graduation split.                                                                                                                                                                                                                                 |
| weaviate (api-vector-db-weaviate)                                   | api-vector-db (flip)                   | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (weaviate-client v3, gRPC, generative search); https://docs.weaviate.io                                                                                                                                             | v3 client server-only (no browser).                                                                                                                                                                                                                                                       |
| elasticsearch (api-search-elasticsearch)                            | api-search (flip `exclusive: true`)    | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (@elastic/elasticsearch v8/v9, mappings, PIT, bulk); https://www.meilisearch.com/docs/resources/comparisons/elasticsearch                                                                                           | D-306 residue: ES-for-logs beside Meili-for-search (dual-role). Also covers kNN vector search — overlaps api-vector-db cross-category, unfenced, correct (F6).                                                                                                                            |
| meilisearch (api-search-meilisearch)                                | api-search (flip)                      | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (meilisearch v0.56, async tasks, tenant tokens); https://www.meilisearch.com/blog/meilisearch-vs-elasticsearch                                                                                                      |                                                                                                                                                                                                                                                                                           |
| payload (api-cms-payload)                                           | api-cms (flip `exclusive: true`)       | constrained-via-exclusivity-or-requires (via the flip) | **C**                       | adapters today [nextjs] | **none — proposed `requires [nextjs]` OVERTURNED in verification**                                            | skill body (one `next` token in the directory; 0/5 MUSTs, 0/6 patterns Next-keyed); https://payloadcms.com/docs/local-api/outside-nextjs; https://payloadcms.com/posts/blog/payload-40-admin-ui-redesign-tanstack-mcp-and-more | Taught surface is the documented headless mode, host-neutral; admin panel is a separate deployable (the sanity-Studio ruling). D-306: nextjs pairing is recommends-shaped; re-derive if Next mounting content lands or when 4.0 adapters ship. The api-cms radio is payload's only fence. |
| sanity (api-cms-sanity)                                             | api-cms (flip)                         | constrained-via-exclusivity-or-requires                | C                           | adapters today [react]  | none                                                                                                          | skill body (@sanity/client, GROQ, TypeGen; @portabletext/react); https://www.sanity.io/docs; https://github.com/portabletext                                                                                                   | Neutral core self-sufficient; PortableText rendering is the react adapter; official vue/svelte renderers exist.                                                                                                                                                                           |
| strapi (api-cms-strapi)                                             | api-cms (flip)                         | constrained-via-exclusivity-or-requires                | A                           | []                      | none                                                                                                          | skill body (v5 Document Service, qs, flat REST format); https://docs.strapi.io                                                                                                                                                 | Standalone Node CMS server — fully framework-agnostic.                                                                                                                                                                                                                                    |
| setup-posthog (api-analytics-setup-posthog)                         | api-analytics (stays open)             | universal                                              | C                           | adapters today [react]  | none                                                                                                          | skill body (posthog-js + posthog-node, PostHogProvider); https://posthog.com/docs/libraries                                                                                                                                    | Setup half of the pair; no default stack carries it (F5).                                                                                                                                                                                                                                 |
| posthog-flags (api-flags-posthog-flags)                             | api-analytics (stays open)             | universal                                              | C                           | adapters today [react]  | none                                                                                                          | skill body (useFeatureFlagEnabled + posthog-node local evaluation); https://posthog.com/docs/libraries/node                                                                                                                    | Server-side flags need no frontend framework — no binding. Id prefix `api-flags-` diverges from category (F4).                                                                                                                                                                            |
| posthog-analytics (api-analytics-posthog-analytics)                 | api-analytics (stays open)             | universal                                              | C                           | adapters today [react]  | none                                                                                                          | skill body (category:object_action taxonomy, posthog-node, GDPR); https://posthog.com/docs/libraries/vue-js                                                                                                                    | Composes with posthog-flags (§4). In every full-stack default stack without setup-posthog.                                                                                                                                                                                                |
| setup-axiom-pino-sentry (api-observability-setup-axiom-pino-sentry) | api-observability (stays open)         | constrained-via-exclusivity-or-requires                | C                           | adapters today [nextjs] | **ADOPT `requires needsAny [nextjs]`**                                                                        | skill body (next-axiom, @sentry/nextjs, withAxiom/withSentryConfig, instrumentation.ts); SKILLS-09 (todo/skills.md)                                                                                                            | SKILLS-01 class-C proving case whose Next slice is the whole followable surface — the adjudicated CONDITIONAL derivation rule produces the binding (strip Next; nothing remains). Widens when SKILLS-09 adds a non-Next branch.                                                           |
| axiom-pino-sentry (api-observability-axiom-pino-sentry)             | api-observability (stays open)         | universal                                              | C                           | adapters today [react]  | none                                                                                                          | skill body (Pino, correlation IDs, OTel spans, Axiom monitors; React error boundaries as the adapter slice)                                                                                                                    | Neutral core self-sufficient — no binding. Does not require its setup skill (§2).                                                                                                                                                                                                         |
| setup-resend (api-email-setup-resend)                               | api-email (stays open)                 | constrained-via-exclusivity-or-requires                | **B**                       | [react]                 | **ADOPT `requires needsAny [react, nextjs, remix]`** (mirror of sibling)                                      | skill body ("Resend Email & React Email Setup", react prop, .tsx templates); https://react.email/docs                                                                                                                          | Same React Email binding as the usage sibling, currently undeclared (F3). Class C if the skills repo ever splits a neutral Resend core.                                                                                                                                                   |
| resend-react-email (api-email-resend-react-email)                   | api-email (stays open)                 | constrained-via-exclusivity-or-requires                | **B** (worksheet CONFIRMED) | [react]                 | KEEP `requires needsAny [react, nextjs, remix]` (default-rules.ts:630-634); collapses to [react] post-closure | skill body; https://react.email/docs/components; https://resend.com/docs/send-with-nodejs                                                                                                                                      | D-306: react-as-dependency vs react-as-app-identity — the rule fences Vue/Svelte projects out of the email category (§3). Parity `compatibleWith` at 319-321 dies with decision 4a.                                                                                                       |

## Findings

- **F1 — two empty husk directories in the skills repo:** `api-search-getxapi` and
  `api-search-xquik` (each just an empty `examples/` dir, dated Jul 17; no SKILL.md, no
  metadata.yaml). Not catalog members — absent from the generated matrix and outside the 237
  count (which tallies metadata.yaml files). They are abandoned scaffolding with
  placeholder-looking names; recommend deletion in the skills repo. If ever completed they
  would silently join `api-search` and land inside the newly exclusive radio unaudited.
- **F2 — setup-axiom-pino-sentry's Next-only content now has a rules consequence.** SKILLS-09
  already records the content problem; this batch adds the binding
  (`requires needsAny [nextjs]`) so the fence exists while the content question is settled.
  The two must stay linked: if SKILLS-09 resolves by renaming (declared Next-only), the rule is
  permanent; if by adapters, it regenerates wider.
- **F3 — setup-resend / resend-react-email binding asymmetry.** Both bodies are React
  Email-bound; only the usage skill declares it. One missing `requires`, adopted here.
- **F4 — posthog-flags id prefix diverges from its category** (`api-flags-posthog-flags`,
  `category: api-analytics`; no `api-flags` category exists). Cosmetic; live precedent already
  in the tree (`api-framework-*` ids in `api-api`, `web-mocks-msw` in `web-mocking`). No
  action for this batch; renaming is a skills-repo hygiene call.
- **F5 — no default stack contains any setup-\* skill** (setup-posthog, setup-resend,
  setup-axiom-pino-sentry all absent from `default-stacks.ts`; every full-stack roster carries
  the usage skills). This is what makes the no-requires call for the pairs safe, and it is
  also a product question worth surfacing: greenfield stack users never receive setup
  guidance. Not a rules defect.
- **F6 — elasticsearch doubles as a vector store** (kNN/dense_vector patterns in the skill).
  Cross-category with `api-vector-db`, unfenced in both directions — correct: ES-instead-of-a-
  dedicated-store and ES-beside-one are both real.
- **F7 — the observability usage skill's "When NOT to use" points setup work at "official
  docs", not at its setup sibling.** Cross-reference gap in the skills repo (both resend and
  posthog setup/usage bodies reference each other's territory; the observability pair does so
  only one way). Editorial note, out of scope here.

## Contradicts-the-worksheet

1. **The worksheet's class-C payload row was RIGHT, and this batch's class-B call is the
   recorded error (inverted per verification).** The batch reached past the taught surface to
   the product's install story; verify-B7-B11 item 3 overturned the proposed
   `requires [nextjs]`. No CMS carries a framework binding (payload/sanity/strapi all
   unbound); payload's only fence is the api-cms radio the flip delivers.
2. **"setup-axiom-pino-sentry is a named class-C proving case" needs a today-vs-intent split.**
   Class C is the SKILLS-01 destination; the _audit row today_ must record a single-adapter
   surface (`[nextjs]`) and its derived `requires needsAny [nextjs]`. Recording an unbound
   class C would re-open the exact ambiguity the manifest exists to close.
3. **setup-resend is not a plain unfenced orphan.** The worksheet's coverage flags (`setup-resend –`)
   read as "states nothing, probably fine"; body inspection shows it carries the identical
   React Email binding its sibling declares. One missing `requires` the worksheet's mechanism
   (conflict/requires reachability) could not see.
4. **The three flag flips are confirmed as billed** — genuinely one-line, group == whole
   category (4/4, 2/2, 3/3), nothing queued to join. No contradiction, but now attacked and
   verified rather than assumed, with two named D-306 residues (chroma↔pinecone dev/prod,
   elasticsearch↔meilisearch dual-role).
5. **The setup/usage pairs need no `requires` link — confirmed with product-internal
   evidence** (the worksheet asked; the answer is no, per §2: default stacks would violate the
   rule, usage bodies are self-sufficient, existing-project mode dominates). The pairing
   semantics go to D-306 as recommends-shaped residue.

## Rules delta (apply-phase summary)

- `default-categories.ts`: `api-vector-db`, `api-search`, `api-cms` → `exclusive: true`
  (3 one-line flips). Editor renders these as radios thereafter.
- `default-rules.ts` adds 2 `requires`: setup-resend → needsAny [react, nextjs, remix];
  setup-axiom-pino-sentry → needsAny [nextjs]. (The proposed payload → [nextjs] was OVERTURNED
  in verification — no rule; payload's fence is the api-cms radio alone.)
- Conflict groups at 52-62 become redundant-inside-exclusive-category; die in Phase C with the
  rest (no action now). `alternatives` purpose groups at 911-913 stay (editorial, slug-based).
- Regen round: `generate:types` + `generate:matrix` (+ `generate:schemas` untouched — no
  category ids change).
- D-306 residue from this batch: chroma↔pinecone dev/prod split;
  elasticsearch↔meilisearch dual-role; payload's nextjs pairing as `recommends`-shaped (taught
  surface is the documented headless mode; re-derive on Next mounting content or when 4.0
  adapters land); react-as-dependency vs react-as-app-identity (the
  email skills fencing Vue/Svelte projects); recommends-shaped setup↔usage pairing for all
  three pairs; SKILLS-01 derivation nuance — adapters extending a self-sufficient neutral core
  (PostHog, sanity, axiom usage) must not derive `requires`, unlike adapters that ARE the core
  (setup-axiom-pino-sentry).
