# B1 — web core (20 skills), researched 2026-08-07 — the anchor batch (verified 2026-08-07, amendments applied)

Scope: worksheet §B1, §4; relationship-coverage decisions 2 and 4a. Skill bodies read at
`/home/vince/dev/skills/src/skills/` (all 20 directories); rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts` (six conflict groups touch this batch —
base frameworks, meta-frameworks, `{react-query, swr}`, `{graphql-apollo, graphql-urql}`,
`{react-router, tanstack-router}`, `{docusaurus, vitepress}` — and thirteen `requires` rules with
a B1 skill as subject); categories verified in `default-categories.ts` (`web-framework`
exclusive + required, order 1; `web-meta-framework` exclusive, order 2; `web-routing` exclusive,
order 3; `web-server-state` exclusive, order 6). Stack surfaces measured in `default-stacks.ts`.
External claims verified 2026-08-07 via Context7 (tRPC, urql) and web search (Remix v3, TanStack
Solid Router, Apollo Client 4, VitePress adoption). No git commands run.

**Headline: the anchors hold — all eleven binding targets (react, vue-composition-api,
angular-standalone, solidjs, svelte, nextjs, remix, nuxt, sveltekit, astro, qwik) are correctly
ruled and safe to bind against — but the worksheet's "verify all 8 meta-framework requires are
correct" comes back 6-of-8: docusaurus and vitepress carry `requires` bindings that are wrong
fences and must be DROPPED alongside the category move the worksheet predicts. Two category
restructures come out of this batch (both owner decisions): doc-site generators leave the
meta-framework radio into a new exclusive `web-docs`, and `web-server-state` splits by kind
(data-fetching radio, GraphQL-client radio, trpc out on its own `requires` — Variant A, adjudicated
in verification; Variant B closed). Together: 49 current
pairwise fences over the 20 skills become 29 — 19 removals flatly wrong, 1 knowingly conceded,
zero new fences, zero new `requires`, two `requires` deleted, one edited.**

## The anchors — question (a), verified skill by skill

| anchor                                                          | rule                                                                                                                | verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| react, vue-composition-api, angular-standalone, solidjs, svelte | no `requires` (targets only); fenced by `web-framework` [X, required] + the redundant base-framework conflict group | **CORRECT.** Slugs confirmed in metadata and the generated matrix; every inbound binding in the tree uses these exact slugs. Note for the apply phase (worksheet §1 caveat re-confirmed): the five have _resolved_ `compatibleWith` arrays from symmetric group expansion but no `requires` — grep-zero at Phase C must cover the generated arrays.                                                                                                                                                                                                                                                                                                                                                                                |
| nextjs → `[react]`                                              | plain needs                                                                                                         | **CORRECT.** Body is App Router / Server Components — React throughout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| remix → `[react]`                                               | plain needs                                                                                                         | **CORRECT for the taught surface.** The body is titled "Remix / React Router v7 Framework Patterns" and carries a migration notice: "Remix has merged into React Router v7. What was planned as Remix v3 is now React Router v7 'framework mode'." That was true when written and is now stale as a statement about _Remix v3_: the product named Remix v3 re-emerged (announced 2025-05-28, beta previews through 2026) as a **React-less framework on a forked Preact runtime** (remix.run/blog/wake-up-remix; infoq.com/news/2026/07/remix-3-beta-preview). The skill teaches Remix v2 + RR v7 — both React — so the binding stands; the v3 divergence is a content-freshness note for the skills repo (F2), not a rule change. |
| nuxt → `[vue-composition-api]`                                  | plain needs                                                                                                         | **CORRECT.** Body is Nuxt 3 composables/server routes on Vue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| sveltekit → `[svelte]`                                          | plain needs                                                                                                         | **CORRECT.** Body is +page.server.ts / form actions on Svelte 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| astro — **no requires, deliberate**                             | —                                                                                                                   | **CONFIRMED CORRECT.** Body teaches islands architecture with React/Vue/Svelte/Solid integrations as peer options (`client:*` directives, `@astrojs/react` / `@astrojs/vue` / `@astrojs/svelte` in auto-detection; "Multi-framework projects mixing React, Vue, Svelte, or Solid components" in When-to-use) and `.astro` components that need **no** framework at all. Any single-framework binding would be a wrong fence; the absence is the rule. Astro + react (or + vue, etc.) stays co-selectable cross-category for islands — correct.                                                                                                                                                                                     |
| qwik — **no requires, deliberate**                              | —                                                                                                                   | **CONFIRMED CORRECT.** Body is Qwik's own component model end to end (`component$`, signals, Qwik City, `routeLoader$`, resumability); React appears only in When-NOT ("teams deeply invested in React ecosystem libraries"). Qwik is not built on React; independence is the rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| docusaurus → `[react]`                                          | plain needs                                                                                                         | **EXISTS but WRONG — drop with the category move.** See the web-docs disposition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| vitepress → `[vue-composition-api]`                             | plain needs                                                                                                         | **EXISTS but WRONG — drop with the category move.** See the web-docs disposition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

`web-framework` being `required: true` is advisory only (`validateBuildStep` returns
`valid: true` always — verified in verify-B5-B12's structural pass), so a docs-only selection
(vitepress alone) nags but does not block. Recorded, nothing to change.

## Disposition 1 — the docs-generator problem (question b): new exclusive `web-docs` + two requires deletions — OWNER DECISION

**The category change the worksheet predicts, confirmed with one addition it missed: the
category move alone does not fix the named scenario. The `requires` must go too.**

Today docusaurus and vitepress sit in `web-meta-framework` [X], radio-excluded from Next.js,
Remix, Nuxt, SvelteKit, Astro and Qwik — 12 cross-pair fences. The tree's own structure says
this was accidental:

- the meta-framework **conflict group** is `{nextjs, remix, nuxt, sveltekit, astro, qwik}` — six
  members; the conflict layer **never** fenced the doc tools against the meta-frameworks;
- the **alternatives** layer already isolates them as their own purpose group "Documentation
  Framework" `[docusaurus, vitepress]`, separate from "Meta-Framework";
- the `web-meta-framework` **description** reads "Full-stack meta-framework (Next.js, Remix,
  Nuxt, SvelteKit)" — the doc tools are not in the category's own self-description.

Only the category radio produces the exclusion, and it is wrong in practice: a docs site is a
second app in the repo, not a competing app framework. VitePress powers the docs of projects
that are not Vue apps — hono.dev is built with VitePress (github.com/honojs/website), as are
D3's docs (vitepress.dev showcase) — and Docusaurus's own When-NOT list names VitePress, Nextra
and Starlight as _separate ecosystems_, i.e. same-kind substitutes for each other, not for
Next.js.

**But moving the category is not enough.** vitepress carries `requires [vue-composition-api]`
and docusaurus carries `requires [react]`. In a Next.js project react is selected, vue is
radio-blocked by `web-framework` [X], so vitepress stays hard-blocked _transitively_ even after
the move — the worksheet's exact named scenario ("a Next app ships a VitePress docs site")
survives the category fix. Both requires must be deleted with the move:

- **The separate-deployable rule decides this — the controlling precedents are sanity Studio
  and the payload-admin overturn, not electron-testing (re-grounded in verification).**
  Taught-surface derivation asks what a skill's patterns presume about the _project's app
  stack_, and the followability test must run against the skill's actual host. Run against
  VitePress-as-host explicitly: every one of vitepress's 8 patterns and 5 MUSTs executes in a
  project whose `web-framework` selection is React or absent — `npm i vitepress` vendors Vue
  into the docs deployable, and nothing in the body presumes vue-composition-api _in the app
  stack_. The framework is internal to a self-contained deployable the skill itself installs —
  a package fact at one remove — and derives nothing, exactly as Sanity Studio ("a separate
  deployable, not a constraint on the consuming service", verify-B7-B11 item 10) and the
  payload admin panel (verify-B7-B11 item 3) were ruled. The electron-testing /
  apollo-standalone package-fact doctrine stays as the secondary ground.
- **This holds even though vitepress genuinely _teaches_ Vue** — Pattern 3's consume-in-Vue
  SFC, Pattern 4 "Vue Components in Markdown", Pattern 5 theme extension are real taught
  content, not an internal dependency mention, so the bare package-fact framing under-fits.
  The content is still **correct in any repo**: a VitePress theme is Vue no matter what the
  app is, so selecting vitepress in a React monorepo surfaces exactly the content that docs
  site needs. Docusaurus is the plainer case — its own When-NOT self-scopes ("Docusaurus uses
  React internally but this skill covers Docusaurus APIs, not React fundamentals"), all 5
  MUSTs are Docusaurus-internal, 19 react tokens in the whole directory. Distinguish
  nextauth/setup-axiom: their content executes in the project's own app tree — same
  deployable — so taught surface binds there and not here. The axis is never "is the content
  framework-flavored" but "which deployable runs it". And the live specimen is stronger than
  first cited: hono.dev's repo README says "Built with VitePress" **and "Not using Hono :)"**
  — the docs site is a separate deployable even from its own product.

**Proposed:** new category `web-docs`, displayName "Documentation Framework" (matching the
alternatives purpose group), `exclusive: true`, `required: false`, domain web, members
{docusaurus, vitepress}; two `metadata.yaml` `category:` edits; **delete both requires rules**.
The `{docusaurus, vitepress}` conflict group — today redundant inside `web-meta-framework` —
stays redundant inside `web-docs` and dies free at Phase C. The radio between the two survives
(one docs generator per repo is the steady state; Docusaurus's When-NOT fences the pair in its
own words). Removed: 12 doc×meta category fences plus the two transitive ecosystem blocks the
requires produced — all documented-wrong or incoherent-to-keep. Zero stack surface: grep
confirms **no stack in `default-stacks.ts` references docusaurus or vitepress** (the 70
`"web-meta-framework"` stack values are exactly the six real meta-frameworks: 42 nextjs + 7 each
astro/nuxt/remix/sveltekit).

Skill ids (`web-meta-framework-docusaurus`, `web-meta-framework-vitepress`) stay — id/category
decoupling is live precedent (verify-B6 5.1: api-framework/api-api, web-mocks/web-mocking, and
this batch's own web-data-fetching-*/web-server-state below). Rename is a separable hygiene
decision; not proposed.

## Disposition 2 — the `web-server-state` radio (questions d, e): split by kind — OWNER DECISION

Five members, C(5,2) = 10 pairwise fences. Same-kind analysis, the B6 way:

- **react-query ↔ swr: fence RIGHT.** Two stale-while-revalidate hook caches for the same job;
  same-kind substitutes, and the conflict group `{react-query, swr}` ("Both solve server state
  caching") already said so.
- **graphql-apollo ↔ graphql-urql: fence RIGHT.** Two GraphQL clients; group
  `{graphql-apollo, graphql-urql}` already said so.
- **The 4 REST×GraphQL cross pairs (react-query/swr × apollo/urql): fences WRONG — the
  catalog's own content says so.** react-query's When-NOT: "GraphQL API (use a GraphQL
  client)". apollo's and urql's When-NOT, verbatim in both: "REST APIs (use your data fetching
  solution instead)". The catalog itself directs a project with both API types to select one of
  each kind — and mixed REST+GraphQL apps are a documented-real steady state, not a migration
  window. The radio hard-errors what the skill bodies instruct.
- **trpc ↔ react-query: fence WRONG — the pair composes by design.** The trpc skill's
  recommended integration is `@trpc/tanstack-react-query`, whose install line is
  `npm install @trpc/tanstack-react-query @tanstack/react-query` (published peer dep
  `@tanstack/react-query ^5.80.3` — npm, re-fetched in verification; the earlier ≥5.62.8
  floor has moved upstream); its whole v11 architecture is `queryOptions`/`mutationOptions`
  factories feeding a shared QueryClient alongside any other queryOptions source. And
  trpc.io's own TanStack setup page anticipates the co-selection in first-party words:
  **"If you already use React Query in your application, you should re-use the `QueryClient`
  and `QueryClientProvider` you already have"** — the exact pairing the radio hard-errors.
  The radio blocks a co-selection whose upstream is a hard package dependency and whose
  composition (tRPC procedures + hey-api-generated REST options in one QueryClient) is the
  integration's design intent.
- **trpc ↔ apollo / trpc ↔ urql: fences WRONG (mildly).** tRPC internal API + a GraphQL
  external API is coherent polyglot; trpc's When-NOT ("GraphQL requirements with partial
  queries") positions them as alternatives _for the same API_, and different APIs coexist.
- **trpc ↔ swr: fence arguable — knowingly conceded.** tRPC-as-taught rides TanStack Query;
  adding SWR beside it is two async-cache layers in one app. Dubious steady state; under the
  split it goes unfenced. CLI-740 residue.

**Variant A — THE DECISION (adjudicated in verification; the category split itself still goes
to the owner, but the A-vs-B choice is closed):** three categories, all category-`:` edits only,
zero id renames —

| id                         | displayName                  | exclusive | members                      |
| -------------------------- | ---------------------------- | --------- | ---------------------------- |
| `web-server-state` (kept)  | Server State / Data Fetching | true      | react-query, swr             |
| `web-graphql-client` (new) | GraphQL Client               | true      | graphql-apollo, graphql-urql |
| `web-rpc` (new)            | Type-Safe RPC                | false     | trpc                         |

trpc's fence is its `requires` (needsAny into `web-framework` — the decision-2 re-key shape),
not a radio; single-member open categories are live precedent (api-commerce/stripe,
web-mocking/msw). Kept fences 2, removed 8 (7 flatly wrong + trpc↔swr conceded), new fences 0.
`web-graphql-client` matches the existing alternatives purpose group "GraphQL Client" — the
taxonomy already knew, the B6 "Managed Database" pattern again.

**Variant B — REJECTED (recorded alternative, closed in verification).** Its shape: split only
GraphQL out; trpc stays in the `web-server-state` radio `{react-query, swr, trpc}`. Its
defense was the alternatives layer grouping exactly those three as "Server State / Data
Fetching", and the _skills as catalogued_ being approach-level substitutes — the react-query
skill is specifically the hey-api/OpenAPI-codegen methodology ("no OpenAPI spec → consider
tRPC", its own When-NOT). Closed on three grounds (verify-B1-B2 item 3): (a) as catalogued the
pair yields **no contradictory unconditional MUSTs** — trpc's four MUSTs are tRPC-internal, and
react-query's hey-api MUST quantifies over hook-writing, which tRPC's generated-options design
honors; (b) the pair's own texts route users _across_ the boundary (react-query's When-NOT
names tRPC; upstream's re-use-the-QueryClient sentence above) — the bullmq/upstash shape that
overturns fences; (c) alternatives groups are advisory by the wave's own doctrine (drizzle
precedent; purpose groups never fence) and cannot carry a hard error. Variant B's only real
value (trpc↔swr) is advice-level and already conceded. (Alternatives groups survive either
variant unchanged.)

**trpc's bindings (question e), researched:** keep
`requires needsAny [react, nextjs, remix]` — the body's client surface is React
(`createTRPCContext`, `useTRPC`, TanStack hooks; server patterns are framework-agnostic).
Candidates examined and rejected:

| candidate                                        | verdict                 | why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trpc → requires [react-query]                    | **REJECTED**            | Package fact, not a skill fence (electron-testing doctrine) — the trpc skill is integration-self-contained (Patterns 5–7 teach the TanStack wiring themselves). Worse, it would be actively wrong: the react-query _skill_ is hey-api methodology whose critical requirement reads "You MUST use generated query options from hey-api — NEVER write custom React Query hooks", and its When-to-use is OpenAPI codegen — forcing it into every tRPC stack injects OpenAPI-first MUSTs where tRPC's own When-NOT excludes them (the nativewind-veto shape). Under Variant A the pair _composes_; it must never be _required_. |
| trpc → requires [typescript / typescript-config] | **REJECTED**            | TypeScript is inherent ("Requires TypeScript on both ends" — a language fact with no catalog skill to bind to; `shared-tooling-typescript-config` is a config-authoring skill, the wrong kind of target — binding it would be a package-fact fence on a craft skill).                                                                                                                                                                                                                                                                                                                                                       |
| add react-native to the needsAny                 | **PROPOSED, editorial** | tRPC in Expo/RN is canonical (create-t3-turbo); react-query and swr both list react-native, trpc doesn't. Reachability is unchanged either way (react-native ⇒ react through the anchor rule), so this is self-description consistency, not a fence change.                                                                                                                                                                                                                                                                                                                                                                 |

## Disposition 3 — `web-routing` (question c): radio right, one binding edited

CLI-406's probe verified: both routers carry `requires`. Shapes, checked against bodies:

- **Radio `web-routing` [X] {react-router, tanstack-router}: KEEP.** One mounted client router
  per app — the mobile-navigation precedent (verify-B9-B10 item 6). The conflict group is wholly
  inside the category and dies free.
- **tanstack-router → `needs [react]`: KEEP.** Body is `@tanstack/react-router` end to end
  (Vite plugin, `declare module "@tanstack/react-router"`). Upstream now ships an **official
  Solid adapter** — `@tanstack/solid-router` is stable on npm with Solid 2.0-beta support
  (tanstack.com/blog/tanstack-start-solid-v2) — but the skill contains zero Solid content, so
  the nextauth taught-surface precedent keeps `[react]`. Re-derive trigger recorded (maestro
  pattern): if Solid-router content lands in the body, widen to `needsAny [react, solidjs]`.
- **react-router → `needsAny [react, remix]`: EDIT to `needs [react]` — drop the remix
  member.** The skill teaches React Router v7 **Data Mode** for SPAs, self-scoped in its own
  text ("without a full framework"; When-NOT: "Full-stack SSR apps (use Framework Mode or an SSR
  framework instead)"), with MUSTs mandating `createBrowserRouter` + `<RouterProvider>`. The
  remix skill _is_ the Framework Mode skill (its own title: "Remix / React Router v7 Framework
  Patterns"). Inside a Remix/framework-mode app the router is framework-owned — you never call
  `createBrowserRouter` — so the remix member doesn't just sit redundant (remix ⇒ react makes it
  a reachability no-op), it _invites_ a co-selection whose critical requirements are actively
  wrong there, and the parity `compatibleWith` group `{react-router, react, remix}` advertises
  it. Two records verification requires: (1) **this edit is the one principled exception to
  B2's apply-phase caution** ("do not 'simplify' the meta-framework members before the shared
  closure lands") — it is an active-harm removal, not a redundancy simplification; stated so
  the two batches do not read as contradicting each other. (2) Reachability is unchanged **at
  the validation layer** (remix requires [react], so react is in every valid remix selection) —
  but pre-closure the editor's `outOfReach` derivation may gray react-router in a remix-first
  intermediate selection state. That graying is desirable (it stops advertising the incoherent
  pair) and is a knowing picker-level behavior change, recorded here. The parity
  `compatibleWith` group must shed remix in the same edit (M4). The remix↔react-router
  mode-incoherence itself is inexpressible post-decision-2 (different categories, requires
  cannot demand absence) — recorded for CLI-740, cost is advice-level.
- Neither router is fenced against the meta-frameworks (react-router beside nextjs is
  selectable today and stays so; Next.js ships its own router). Same inexpressible shape, same
  CLI-740 record, advice-level.
- Editorial: `web-routing`'s description reads "Client-side routing (TanStack Router)" — stale,
  never names React Router. M-surface.

## Disposition 4 — the remaining server-state bindings, verified

- **react-query → `needsAny [react, nextjs, remix, react-native]`: KEEP.** Body is React +
  hey-api; RN rides the same React adapter (the react-native member is the RN-stack path, not a
  second framework surface).
- **swr → `needsAny [react, nextjs, remix, react-native]`: KEEP.** SWR is a React hooks
  library; body confirms.
- **graphql-apollo → `needsAny [react, nextjs, remix]`: KEEP.** Body is React hooks throughout
  (useQuery/useMutation/Suspense hooks, MockedProvider); zero non-React framework content
  (grep-verified). Upstream check: Apollo Client 4.0 (GA September 2025 —
  apollographql.com/blog/announcing-apollo-client-4-0) moved React exports to
  `@apollo/client/react`, exactly as the body's Quick Guide states — content is current; the
  React-free core does not change the taught surface (the skill teaches the hooks). Vue/Svelte
  Apollo integrations are community packages, not this skill.
- **graphql-urql → `needsAny [react, vue-composition-api, solidjs, svelte, nextjs, remix,
nuxt, sveltekit]`: KEEP the wide shape — flagged for the verifier.** The tension: the body's
  non-React content is two lines (a principles bullet naming "React, Vue, Svelte, Solid" and a
  reference-table row) while every example is React hooks — the nextauth narrow-precedent
  pattern. Kept wide anyway on three grounds: (a) urql's multi-framework support is
  **official and first-party** — the project describes itself as "a GraphQL client for React,
  Preact, Vue, Solid, and Svelte" (urql-graphql/urql), unlike nextauth where only claims
  existed against package-specific content; (b) the skill's load-bearing majority (exchange
  ordering, Graphcache, request policies, `preferGetMethod`, authExchange) is Client-level and
  binding-agnostic — it transfers verbatim to `@urql/vue`/`@urql/svelte`/`@urql/solid`, unlike
  nextauth's `next-auth`-package setup files; (c) narrowing to `[react, …]` would strip the
  catalog's **only** reachable GraphQL client from vue/solid/svelte stacks (apollo is
  React-bound) — a wrong fence with named victims, the cli-reviewing/oclif-ink doctrine; and
  (d) the proportion measurement, run in verification, comes out **0/3** — all three of urql's
  MUSTs are Client-level (exchange order, `__typename` in optimistics, `preferGetMethod`),
  zero React-bound, and 5 of 8 core sections are Client-level: strip the hook sections and the
  remainder is a followable skill in a Vue/Solid/Svelte stack (the no-derive branch of the
  CLI-405 rule, pointed keep-wide). The angular omission is correct (no official Angular
  binding). Residue: the React-only example surface is a content gap for the skills repo (F4),
  not a fence. The call is firmer than first recorded — no longer the batch's least-confident.

## Manifest rows

Batch id `web-core`, audited `2026-08-07`. Classification omitted for the eleven framework
skills (binding targets per worksheet §4); the worksheet's "all verdicts here are trivially
'framework skill — not classified'" is wrong for the other nine — see Contradicts §2.

| skill (id)                                        | category (proposed)          | verdict                                 | class | frameworks                                    | derived-requires                                                                                             | sources / notes                                                                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------- | --------------------------------------- | ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| react (web-framework-react)                       | web-framework                | constrained-via-exclusivity-or-requires | —     | —                                             | none (anchor)                                                                                                | Body: React 19. The root binding target.                                                                                                                                                                                  |
| vue-composition-api                               | web-framework                | constrained-via-exclusivity-or-requires | —     | —                                             | none (anchor)                                                                                                | Vue 3.5 composition API.                                                                                                                                                                                                  |
| angular-standalone                                | web-framework                | constrained-via-exclusivity-or-requires | —     | —                                             | none (anchor)                                                                                                | Angular 19 signals/standalone.                                                                                                                                                                                            |
| solidjs                                           | web-framework                | constrained-via-exclusivity-or-requires | —     | —                                             | none (anchor)                                                                                                |                                                                                                                                                                                                                           |
| svelte                                            | web-framework                | constrained-via-exclusivity-or-requires | —     | —                                             | none (anchor)                                                                                                | Svelte 5 runes.                                                                                                                                                                                                           |
| nextjs                                            | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | requires [react] — verified                                                                                  | App Router body.                                                                                                                                                                                                          |
| remix                                             | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | requires [react] — verified                                                                                  | Teaches Remix v2 + RR v7 framework mode; Remix v3 (Preact-based, beta) is a content-freshness note, F2.                                                                                                                   |
| nuxt                                              | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | requires [vue-composition-api] — verified                                                                    |                                                                                                                                                                                                                           |
| sveltekit                                         | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | requires [svelte] — verified                                                                                 |                                                                                                                                                                                                                           |
| astro                                             | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | none — deliberate, verified                                                                                  | Island-agnostic by design; body teaches React/Vue/Svelte/Solid islands + no-framework `.astro`. Any binding would be a wrong fence.                                                                                       |
| qwik                                              | web-meta-framework           | constrained-via-exclusivity-or-requires | —     | —                                             | none — deliberate, verified                                                                                  | Own component model; not built on React.                                                                                                                                                                                  |
| docusaurus (web-meta-framework-docusaurus)        | **web-docs (new)**           | constrained-via-exclusivity-or-requires | A     | []                                            | **DROP requires [react]**                                                                                    | Self-scoped toolchain skill ("covers Docusaurus APIs, not React fundamentals" — its own When-NOT); React is the generator's internal package fact. docusaurus.io.                                                         |
| vitepress (web-meta-framework-vitepress)          | **web-docs (new)**           | constrained-via-exclusivity-or-requires | A     | []                                            | **DROP requires [vue-composition-api]**                                                                      | Vue-in-Markdown content is site-internal and correct in any repo; non-Vue adoption documented (hono.dev — github.com/honojs/website; D3 — vitepress.dev showcase).                                                        |
| react-router (web-routing-react-router)           | web-routing                  | constrained-via-exclusivity-or-requires | B     | [react]                                       | **EDIT: needsAny [react, remix] → needs [react]**                                                            | RR v7 Data Mode SPA skill; the remix member invites a mode-incoherent co-selection (F1). Active-harm exception to B2's do-not-simplify caution; pre-closure picker graying recorded as a knowing change. reactrouter.com. |
| tanstack-router (web-routing-tanstack-router)     | web-routing                  | constrained-via-exclusivity-or-requires | B     | [react]                                       | requires [react] — verified                                                                                  | Official `@tanstack/solid-router` exists upstream; zero Solid content in body — taught-surface keep, re-derive trigger recorded.                                                                                          |
| react-query (web-server-state-react-query)        | web-server-state (kept)      | constrained-via-exclusivity-or-requires | B     | [react]                                       | needsAny [react, nextjs, remix, react-native] — verified                                                     | hey-api/OpenAPI methodology skill; RN member rides the same React adapter. tanstack.com/query.                                                                                                                            |
| swr (web-data-fetching-swr)                       | web-server-state (kept)      | constrained-via-exclusivity-or-requires | B     | [react]                                       | needsAny [react, nextjs, remix, react-native] — verified                                                     | swr.vercel.app.                                                                                                                                                                                                           |
| trpc (web-data-fetching-trpc)                     | **web-rpc (new, open)**      | constrained-via-exclusivity-or-requires | B     | [react]                                       | needsAny [react, nextjs, remix] — kept; requires [react-query] REJECTED; + react-native proposed (editorial) | v11, `@trpc/tanstack-react-query` (published peer `@tanstack/react-query ^5.80.3` — npm, re-verified; trpc.io: "re-use the `QueryClient`… you already have"). Variant A adjudicated. Constrained via requires, not radio. |
| graphql-apollo (web-data-fetching-graphql-apollo) | **web-graphql-client (new)** | constrained-via-exclusivity-or-requires | B     | [react]                                       | needsAny [react, nextjs, remix] — verified                                                                   | Apollo Client 4.0 GA 2025-09 (apollographql.com/blog/announcing-apollo-client-4-0); body current.                                                                                                                         |
| graphql-urql (web-data-fetching-graphql-urql)     | **web-graphql-client (new)** | constrained-via-exclusivity-or-requires | C     | [react, vue-composition-api, solidjs, svelte] | needsAny [react, vue-composition-api, solidjs, svelte, nextjs, remix, nuxt, sveltekit] — KEPT wide, flagged  | Official five-framework client (urql-graphql/urql); React-only examples are a content gap (F4), not a fence. 0/3 MUSTs React-bound (verified) — firmer than first recorded.                                               |

## Fence arithmetic

Current: `web-framework` C(5,2)=10 + `web-meta-framework` C(8,2)=28 + `web-routing` 1 +
`web-server-state` C(5,2)=10 = **49** pairwise fences. Proposed: 10 + C(6,2)=15 + web-docs 1 +
1 + web-server-state 1 + web-graphql-client 1 = **29**. Removed **20**: 12 doc×meta pairs plus
8 server-state cross pairs — **19 flatly wrong, 1 knowingly conceded** (trpc↔swr). New fences:
**zero.** All six conflict groups touching this batch are (and remain) wholly inside exclusive
categories — all die free at Phase C, consistent with the worksheet's 17-redundant count.
**Ordering constraint (stated for B1's own splits, the same sentence B2 states for its):**
"all die free at Phase C" is true only if M1-M2 — the `web-docs` and `web-graphql-client`
categories — land **before** Phase C deletes the conflict layer; otherwise
`{docusaurus, vitepress}` and `{graphql-apollo, graphql-urql}` have a fenceless window.

### CLI-740 residue

- **trpc↔swr** (fence removed, arguable validity): two async-cache layers in one app; the split
  leaves it advice-level.
- **remix↔react-router mode-incoherence** (never fenced; the needsAny edit stops _inviting_ it
  but cannot forbid it): Data Mode inside a framework-mode app contradicts both bodies' MUSTs;
  requires cannot demand absence, categories differ — inexpressible in the current vocabulary.
- **meta-framework's built-in router vs the `web-routing` radio** (never fenced): nextjs +
  react-router / nextjs + tanstack-router select clean today and post-change; the built-in
  router makes a standalone router skill incoherent there. Same inexpressible shape.
- **docusaurus/vitepress internal-framework flavor** (fences removed): a class-A verdict hides
  that customization content is React- resp. Vue-flavored; if CLI-740 ever grows a
  "content-flavor" note field, these two are its first users.
- **tanstack-router Solid trigger**: widen to `needsAny [react, solidjs]` if Solid content
  lands in the body (official adapter already shipped upstream).
- **react-query's hey-api MUST beside tRPC (Variant A residue, verification-required):** the
  MUST reads literally ("generated query options **from hey-api** — NEVER write custom React
  Query hooks") and sits in tension beside tRPC-generated options in a hybrid stack; if that
  MUST is ever re-cut to claim ALL server data, the coexistence rationale reopens — the
  inverse of the zustand trigger.

## Findings

- **F1 — react-router's needsAny actively invites a wrong co-selection.** The remix member (and
  the parity `compatibleWith` group) blesses react-router-beside-Remix, but the skill's own
  MUSTs (`createBrowserRouter` + `RouterProvider`) are wrong inside a framework-mode app, per
  the remix skill's own migration table. Rule edit in this batch; residue above.
- **F2 — the remix skill's migration notice is stale about Remix v3.** "What was planned as
  Remix v3 is now React Router v7" was true in 2024; Remix v3 now exists as a separate
  Preact-based framework (beta 2026). Skills-repo content note; no rule change (taught surface
  is React either way).
- **F3 — the id/category decoupling has a fourth live precedent inside this batch.** Four of
  the five `web-server-state` members carry `web-data-fetching-*` ids (swr, trpc,
  graphql-apollo, graphql-urql); only react-query's id matches the category. The proposed
  splits are category-`:` edits only — 5 metadata edits (2 docs + 3 server-state), zero
  directory renames, zero id changes. Aligning ids is a separable owner hygiene decision.
- **F4 — urql's example surface under-serves its own binding.** The rule (and upstream) claim
  React/Vue/Solid/Svelte; every example is React. Content gap for the skills repo; keeping the
  wide binding is what makes it visible rather than fenced-over.
- **F5 — sibling inconsistency in the needsAny lists.** react-query/swr include react-native;
  trpc/apollo/urql don't. Reachability is identical either way (react-native ⇒ react through
  the anchor rule), so these members are self-description, and they should agree — the trpc
  react-native addition is proposed; apollo/urql RN usage is real but untaught, left alone.

## Contradicts-the-worksheet

1. **"Verify all 8 [meta-framework requires] exist and are correct" — they all exist, but only
   6 are correct.** docusaurus → [react] and vitepress → [vue-composition-api] are wrong fences
   (they transitively block every cross-ecosystem docs pairing, including the worksheet's own
   named scenario) and must be dropped with the move. The worksheet's framing implies
   verification, not deletion.
2. **"All class-A/B/C verdicts here are trivially 'framework skill — not classified'" is wrong
   for 9 of 20.** The routing pair, the server-state five, and the doc pair are library/tool
   skills with real classifications (B ×7, C ×1, A ×2).
3. **The docusaurus/vitepress radio-exclusion is category-only — the conflict layer never
   asserted it.** The meta-framework conflict group has six members; the alternatives layer
   already isolates "Documentation Framework". The taxonomy already knew these were a different
   kind; only the category placement disagrees.
4. **The category-move fix is necessary but not sufficient** — without the two requires
   deletions, nextjs + vitepress (and nuxt + docusaurus) stay hard-blocked transitively. The
   worksheet's placement question has a two-part answer.
5. **trpc's R-flag rides the batch's biggest wrong fence.** The worksheet notes trpc reaches a
   conflict via requires as if the radio covers it; the radio it sits in blocks its own
   substrate (react-query).

## Migration surfaces (named, NOT fixed here)

All tagged **[both]** unless noted; no variant of this batch renames a skill id.

- **M1 — skills repo**: 5 `metadata.yaml` `category:` edits (docusaurus, vitepress → `web-docs`;
  trpc → `web-rpc`; graphql-apollo, graphql-urql → `web-graphql-client`). Variant B drops the
  trpc edit and merges nothing else.
- **M2 — `default-categories.ts`**: add `web-docs`, `web-graphql-client`, `web-rpc`
  (exclusive/exclusive/open, required false); web-domain orders renumber (today 1–3 =
  framework/meta/routing, 6 = server-state; suggest graphql-client and rpc beside server-state,
  web-docs late, after tooling); editorial — fix `web-routing`'s stale description ("(TanStack
  Router)" → name both routers) and narrow `web-server-state`'s description if kept as the
  data-fetching pair.
- **M3 — `default-stacks.ts`**: 7 rows re-keyed `"web-server-state": "web-data-fetching-trpc"`
  → `"web-rpc": …` (Variant A only). Zero docusaurus/vitepress values exist (verified — the 70
  meta-framework keys resolve 42/7/7/7/7 to the six real metas); react-query's 49 rows and the
  7 react-router routing rows survive untouched.
- **M4 — `default-rules.ts`**: delete 2 requires (docusaurus, vitepress); edit react-router's
  requires to plain `needs [react]`; optionally add react-native to trpc's needsAny. Parity
  `compatibleWith` group `{react-router, react, remix}` must shed remix in the same edit (or
  the decision-4a conversion inherits the lie); note for the Phase-C grep: docusaurus and
  vitepress leave the worksheet §1 "requires but no compatibleWith" five-list.
- **M5 — generated artifacts**: one `generate:types` + `generate:matrix` + `generate:schemas`
  round (both JSON schemas enumerate category ids — release-gate blocking, verify-B6 5.3),
  vendored matrix + `source-types.ts` in `packages/matrix`.
- **M6 — matrix package**: `preload-defaults.ts` keys are skill ids — untouched (no id
  changes). `selection-scenarios.ts` and the EDITOR-11 goldens: any scenario asserting a
  conflict/exclusivity verdict across the removed pairs (doc×meta, server-state cross) is data
  and adapts — check at apply.
- **M7 — CLI tests + factories**: category-id literals for `web-meta-framework` /
  `web-server-state` in `mock-categories.ts`, `test-fixtures.ts` and any test asserting these
  memberships — grep at apply (B6's M7 lesson: expect roughly 2× the first count).
- **M8 — rules editorial**: alternatives groups survive as-is (slug-based); "Server State /
  Data Fetching" `[react-query, swr, trpc]` may keep trpc at purpose level even under Variant A
  (advisory, not a fence) — owner's editorial call; "Documentation Framework" and "GraphQL
  Client" groups already match the proposed categories.
- **M9 — docs**: `docs/web/editor-spec.md` and `.ai-docs` reference pages mentioning
  web-meta-framework membership or the server-state radio — re-check at apply.
- **M10 — editor/server/www**: expected clean (editor reads vendored `@repo/matrix`; B6 M11
  precedent) — verify with the same grep at apply.
