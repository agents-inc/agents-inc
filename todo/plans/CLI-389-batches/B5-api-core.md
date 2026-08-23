# B5 — api core (17 skills), researched 2026-08-07 — wave-2 verified 2026-08-07, amendments applied

Scope: worksheet §B5, §2c group #7, §4; relationship-coverage decisions 2 and 4; the bullmq
handoff from verify-B6 item 4.5. Skill bodies read at
`/home/vince/dev/skills/src/skills/api-framework-*`, `api-graphql-*`, `api-auth-*`,
`api-specs-openapi`, `api-messaging-webhooks`, `api-caching-strategies`, `api-queue-bullmq`,
`api-performance-api-performance`, `api-commerce-stripe`. Current rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts` (two conflict groups touch this batch —
`{hono, express, fastify, elysia, nestjs}` at 35-38 and
`{better-auth-drizzle-hono, nextauth, clerk}` at 95-98; three `requires` rules —
`better-auth-drizzle-hono → [drizzle]` at 414-418, `clerk → [nextjs]` at 518-522, plus clerk's
matching `compatibleWith` at 208-211; alternatives "API Framework" at 664-667 and "Auth" at 695).
Categories verified in `default-categories.ts`: `api-api` (242-250, `exclusive`, **`required:
true`**, order 1), `api-framework` (377-386, `exclusive`, sole member elysia, with the source
NOTE "may be a duplicate of api-api"), `api-graphql` (414-422, `exclusive`), `api-auth` (260-268,
`exclusive`), and the five open cross-cutting categories. Library claims verified 2026-08-07 via
Context7 (Mercurius, Apollo Server, GraphQL Yoga, Auth.js, Elysia, Clerk, Better Auth) and web
(BullMQ/Upstash compatibility).

**Headline: four missing `requires` bindings found (mercurius → fastify, nextauth → nextjs,
better-auth-drizzle-hono → hono, bullmq → `needsAny [redis, upstash]`), the Elysia merge is
confirmed trivial-but-wide (13 authored/test surfaces plus one skills-repo line; it also kills a
user-visible duplicate "API Framework" header the 2026-07-29 QA sweep already logged), and B6's
`needsAny [redis, upstash]` handoff is ACCEPTED, with the upstash-REST caveat recorded in the
reason** — wave-2 verification overturned this batch's original `needs [redis]`-only counter
(verify-B5-B12 item 6): an upstash selection signals an Upstash Redis database, which runs BullMQ
over TCP, vendor-documented; the REST-client limitation belongs in the reason string, not the
fence. The `api-graphql` radio stays. Five cross-cutting skills confirmed universal.

## Group #7 — the Elysia merge (worksheet question a)

**Disposition confirmed: move elysia into `api-api`, delete `api-framework`.** After the move the
conflict group `{hono, express, fastify, elysia, nestjs}` is wholly inside an exclusive category
and dies free in Phase C. Elysia is a true peer of the other four: Bun-first, but it runs on
Node via the official `@elysiajs/node` adapter since Elysia 1.2 (`new Elysia({ adapter: node()
})` — elysiajs.com/integrations/node), so "Bun-only" is not a reason to fence it differently.
No runtime skill exists in the catalog to bind Bun to, and none is needed — the radio is the
whole fence.

**"Nothing else references it" — verified, with a full inventory.** The category id
`api-framework` (as distinct from the `api-framework-*` skill-id prefix, which all five API
framework skills share and which does NOT change) appears in:

- **Authored, must edit (2):** the category block in `default-categories.ts:377-386` (delete,
  including the NOTE comment); `/home/vince/dev/skills/src/skills/api-framework-elysia/metadata.yaml`
  (`category: api-framework` → `api-api` — the only skills-repo occurrence; no stack references
  elysia at all).
- **Generated, regenerate (6 files):** both matrices (`packages/cli/src/cli/types/generated/matrix.ts`
  and `packages/matrix/src/vendor/generated/matrix.ts` — category block, elysia's `category`
  field, the category→skills index, the id list), both `source-types.ts` (category union at 748),
  both JSON schemas (`metadata.schema.json:80`, `project-config.schema.json:69` — produced by
  `generate-json-schemas.ts`).
- **Tests hardcoding the id (5 files):** `e2e/fixtures/project-builder.ts:89`,
  `local-installer.test.ts:1329/1351/1555/1574/1608`, `marketplace-generator.test.ts:333-358`,
  `scripts/generate-source-types.test.ts:517/532`,
  `packages/matrix/src/read-model/preload-defaults.test.ts:67` (drop from the explicit
  `FRAMEWORK_CATEGORIES` set). **Trap:** project-builder and local-installer use
  `"api-framework"` as _hono's_ category — wrong today (hono is `api-api`), harmless today,
  but an invalid enum after the schema regen, so they must be corrected in the same slice.
- **Docs (2):** `.ai-docs/reference/features/configuration.md:196,213` (the duplicate-flag note
  itself); the 2026-07-29 QA-sweep finding documents the user-visible symptom — `api-api` and
  `api-framework` both render the header "API Framework" in the API grid, Elysia alone under the
  second. The merge deletes a live UI defect, not just a taxonomy wart.
- **Zero references in `apps/`** — the editor reads category ids from the matrix, never
  hardcodes them.

**Bonus defect the merge fixes:** `api-api` is `required: true` and elysia sits outside it, so
an Elysia project today still trips the advisory "No skills selected in API Framework (required
category)" (`validateBuildStep` in `build-step-logic.ts` — advisory only, always `valid: true`).
Post-merge an elysia pick satisfies the required category.

**User-config surface:** wizard selections persist under category keys
(`domainSelections.api["api-framework"]` for an elysia picker). Post-merge that key fails the
regenerated `project-config.schema.json` enum. Pre-1.0, no compatibility shim (per CLAUDE.md) —
name it in the release notes; the fix is re-running the wizard.

**Direction note — see Contradicts §3.** The 2026-08-06 agent-finding argues the _opposite_
rename (`api-api` → `api-framework`). This batch recommends the worksheet's direction for the
Phase-B slice and records the rename question separately.

## The GraphQL servers (worksheet question b)

All three verdicts verified against their own skill bodies AND upstream docs (Context7,
2026-08-07):

- **mercurius requires fastify — CONFIRMED, unambiguous.** Install is literally
  `npm i fastify mercurius graphql`; usage is `app.register(mercurius, { schema, resolvers })`
  (mercurius README); the skill body's "When NOT to use" says "Not using Fastify (Mercurius is
  Fastify-only)". Class B, `requires { skill: "mercurius", needs: ["fastify"] }`.
- **apollo-server needs NO binding.** Apollo Server v4/v5 exposes a stable HTTP abstraction:
  `startStandaloneServer` runs with zero framework — an official path, though upstream positions
  it as "recommended for **prototyping**" and steers production to "a more fully-featured web
  framework" via `expressMiddleware`, which `startStandaloneServer` wraps under the hood (apollo
  docs: standalone.mdx, express-middleware.mdx). The skill body makes the same split ("standalone
  for quick/simple setups, or framework middleware for production"; standalone does not support
  subscriptions — SKILL.md:104,282). The express dependency inside the standalone wrapper is a
  package fact, not a skill fence (electron-testing precedent, verify-B9-B10 item 17), and a
  `requires` would hard-error a legal standalone GraphQL service. Class C, adapter surface within
  the catalog: `[express]` is the taught + official adapter (`@as-integrations/express4`/
  `express5`); fastify is a community adapter (`@as-integrations` ecosystem), as are
  koa/hapi/next/azure/lambda (migration-from-v3.mdx "Removed integrations"). Derived-requires
  none — the radio is the fence.
- **yoga is genuinely agnostic — CONFIRMED.** Fetch API core (`createYoga` is a WHATWG
  Request/Response handler); documented integrations for node:http, Express (`app.use('/graphql',
yoga)`), Fastify (`handleNodeRequestAndResponse`), Koa, Bun (`Bun.serve({ fetch: yoga })`),
  Deno (`Deno.serve(yoga)`), Cloudflare Workers. Class A, no requires.

**The `api-graphql` radio stays `exclusive: true`.** One GraphQL server per service is right, and
the radio is the ONLY fence for apollo-server and yoga (both class-empty on requires). For
mercurius the radio composes with the new binding into decision-2's re-keyed semantics: pick
hono in `api-api` and fastify becomes unreachable, so mercurius becomes unreachable — a live
specimen of "requires a member of an exclusive category whose selected member differs". **Today
hono + mercurius validates as a legal selection — that is the live bug the binding closes.**
GraphQL-beside-REST stays legal by construction (`api-graphql` and `api-api` are separate
categories), which is correct — Mercurius/Yoga mount alongside REST routes in the same app.

## The auth trio (worksheet question c)

**clerk's shape, verified:** `requires { skill: "clerk", needs: ["nextjs"], reason: "Skill
teaches @clerk/nextjs patterns" }` (default-rules.ts:518-522) plus the parity `compatibleWith
["clerk", "nextjs"]` (208-211, dies in decision 4b; the requires survives). The reason keys the
binding to the _taught surface_, not the product — Clerk the product ships SDKs for React, Vue,
Expo, iOS, Go and more (Context7 catalog), but the skill body is 100% `@clerk/nextjs`
(`clerkMiddleware`, `proxy.ts` for Next 16+, Server Components, `@clerk/nextjs/server`).
Cross-domain `needs` (api-domain skill → web-domain nextjs) is established precedent. Correct
as-is; no change.

**nextauth mirrored honestly: `requires { skill: "nextauth", needs: ["nextjs"], reason: "Skill
teaches the next-auth (Next.js) package — auth.ts, handlers, middleware, Server Components" }`.**
Two facts had to be separated:

1. _The library_ is officially multi-framework: `next-auth` (Next.js), `@auth/sveltekit`,
   `@auth/express`, `@auth/qwik` are all first-party packages (authjs.dev installation docs,
   verified via Context7).
2. _The skill_ teaches only the Next.js package. All five example files
   (core/middleware/session/database/patterns) and reference.md are Next.js-exclusively; the
   critical requirements (`auth.ts` root file, `handlers`, edge-split `auth.config.ts`) are the
   `next-auth` package's surface. The body's "When to use" line — "Adding authentication to
   Next.js, SvelteKit, Express, or Qwik apps" — is an over-claim relative to its own content.

Clerk's precedent binds to taught surface, so the honest mirror is class B `[nextjs]`. The
alternative `needsAny [nextjs, sveltekit, express, qwik]` (all four ARE catalog skills) was
considered and rejected: it would advertise adapters the skill never demonstrates. Skills-repo
note: the over-claim spans **four surfaces**, not one line (inventory in F3, widened per verify
item 4); either trim them all or grow real SvelteKit/Express examples and widen the binding then.

**better-auth-drizzle-hono — a second missing binding, beyond the worksheet's list.** It carries
`requires [drizzle]` (414-418) but its body is equally Hono-bound: the handler mounts as
`app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw))` and the session middleware
is a typed Hono `createMiddleware<{ Variables: AuthVariables }>` — Hono's factory API. Better
Auth the library is framework-agnostic (better-auth.com), but this skill's own id scopes it to
the drizzle+hono stack. Add a second rule (precedent: shadcn-ui carries two):
`requires { skill: "better-auth-drizzle-hono", needs: ["hono"], reason: "Skill mounts Better
Auth via Hono routes and typed Hono middleware" }`. Class B `[hono]` (hono is the framework;
drizzle is the data-layer dependency, expressed by the existing rule). Evidence precision
(wave-2, verify item 5): the body never _names_ Hono — the word appears only in the frontmatter
`name:`, with zero hits in examples/reference — so the identification rests on API shape
(`createMiddleware<{ Variables }>`, `c.req.raw`, `app.on([...])`) and the slug; the reason
string is a description of that surface and must never be presented as a quotation from the
body.

**Coverage gap this exposes (record, don't fix):** with all three auth skills bound — clerk and
nextauth to nextjs, better-auth to hono+drizzle — a Fastify, Express, NestJS or Elysia project
has **zero reachable auth skills**. That is honest (the catalog genuinely has no such content)
but worth a skills-backlog line: a framework-agnostic or express/fastify auth skill.

## bullmq — the B6 handoff (worksheet question d)

**Verdict (wave-2, OVERTURNED from this batch's original `needs [redis]`-only form — verify-B5-B12
item 6): `requires { skill: "bullmq", needs: ["redis", "upstash"], needsAny: true, reason:
"BullMQ drives a Redis-compatible server over ioredis/TCP (blocking commands, Lua scripts,
streams; maxmemory-policy noeviction). The catalog's Redis providers are redis and upstash —
Upstash documents BullMQ over its TCP endpoint; its REST client cannot drive BullMQ, and the
bullmq skill carries its own ioredis connection factory." }` — B6's `needsAny [redis, upstash]`
handoff ACCEPTED.**

- _Redis-backed by architecture — confirmed, unchanged._ The skill body: "BullMQ is a Redis-backed
  job queue"; every constructor takes an ioredis `connection` (v5 throws without one); workers need
  `maxRetriesPerRequest: null`; docs.bullmq.io requires Redis ≥6.2.0. BullMQ v3 removed its hard
  Upstash-host error once Upstash shipped Redis Streams
  (github.com/taskforcesh/bullmq/issues/1087).
- _Why `needsAny`, not `needs [redis]` alone — the four grounds of the overturn:_ (a) **the
  enumeration doctrine** — `requires` in this system is stack-composition (clerk/shadcn/eas all
  bind to "X is in the stack"), and an upstash selection signals an Upstash Redis database, which
  runs BullMQ over TCP, vendor-documented with an ioredis-shape config (`{ host, port: 6379,
password, tls }`, upstash.com/docs/redis/integrations/bullmq); enumerating fewer providers than
  the catalog holds is the maestro error (verify-B9-B10 item 1). (b) **The original
  content-contradiction claim was overstated**: the upstash skill's critical requirement _routes_
  blocking/Lua workloads to "ioredis with a TCP connection instead" — pointing at exactly the
  connection the bullmq skill's own Pattern-1 factory provides (`new Redis(url, {
maxRetriesPerRequest: null })`; the skill is connection-self-contained). Selecting upstash +
  bullmq yields complementary content, not contradiction. (c) **Consequence asymmetry**: `needs
[redis]` plus the `api-kv` radio would jointly hard-block bullmq for every upstash-selecting
  project — a real, vendor-documented steady state verify-B6 1.4 already adjudicated REAL
  (dual-client-one-provider: REST on edges + ioredis on workers, "(BullMQ, pub/sub)" in B6's own
  words). (d) The B6 handoff (4.5) named `needsAny [redis, upstash]` first and left the direction
  open; rejecting it required stronger grounds than (b) provided.
- _Interaction with the KV radio (B6's `api-kv`):_ redis/upstash/vercel-kv stay mutually
  exclusive, and an upstash-selecting project CAN now reach bullmq — that is the point of the
  needsAny. The redis skill stays the _recommended_ member (its body carries the full BullMQ
  queues example and the `maxRetriesPerRequest: null` config); recommendation is not a fence.
- _Deliberate exclusion, recorded so the omission reads as a decision:_ **vercel-kv stays out of
  the needsAny** — the product is sunset (Dec 2024) and its skill body steers to `@upstash/redis`
  directly.
- _Advice, not fence:_ BullMQ polls Redis even when idle, so Upstash's per-request Pay-As-You-Go
  pricing balloons — Upstash recommends a Fixed plan (their integration doc). Curation moves to
  the note, not the fence (tamagui precedent); the caveat is a CLI-740 advice line.

## The cross-cutting five (worksheet question e) — all universal, confirmed

Bodies grepped for every framework token; openapi, webhooks, caching-strategies, and
api-performance contain **zero** framework references — they are spec/pattern skills (OpenAPI
authoring + codegen; HMAC/idempotency/retry/DLQ patterns; cache-aside/write-through/TTL/HTTP
caching; query optimization/pooling). stripe's server-side SDK is framework-agnostic; its
`examples/webhooks.md` carries an Express _Good Example_ webhook route (`express.raw({ type:
"application/json" })` mounted before `express.json()`) followed by a framework-agnostic handler
("works with any HTTP framework"), and the remaining "express" hits are the Stripe Connect
"Express account" product name and the plain verb. The agnostic path is taught, so no binding.
All five: verdict `universal`, class A, no requires. These are B5's contribution to the "recorded
universal" ledger the manifest exists for.

## Manifest rows

Batch id `api-core`, audited `2026-08-07`. Framework skills (the five api-api members
post-merge) omit classification per the §4 skeleton — they are binding targets.

| skill (current id)                        | category after B5                      | verdict                                                      | class               | frameworks                                         | derived-requires                                                                                                                                                                                                                                                                                           | sources                                                                                                                                                                                                      | notes                                                                                                                                                                                                                                                           |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------ | ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hono (api-framework-hono)                 | api-api                                | constrained-via-exclusivity-or-requires                      | — (framework skill) | —                                                  | none                                                                                                                                                                                                                                                                                                       | skill body (@hono/zod-openapi, OpenAPIHono)                                                                                                                                                                  | Binding target for better-auth-drizzle-hono.                                                                                                                                                                                                                    |
| express (api-framework-express)           | api-api                                | constrained-via-exclusivity-or-requires                      | — (framework skill) | —                                                  | none                                                                                                                                                                                                                                                                                                       | skill body (Express 5 stable, async error forwarding)                                                                                                                                                        | Binding target candidate (Auth.js/@auth/express exists; no catalog skill binds to it yet).                                                                                                                                                                      |
| fastify (api-framework-fastify)           | api-api                                | constrained-via-exclusivity-or-requires                      | — (framework skill) | —                                                  | none                                                                                                                                                                                                                                                                                                       | skill body (TypeBox type providers, plugin encapsulation)                                                                                                                                                    | Binding target for mercurius.                                                                                                                                                                                                                                   |
| nestjs (api-framework-nestjs)             | api-api                                | constrained-via-exclusivity-or-requires                      | — (framework skill) | —                                                  | none                                                                                                                                                                                                                                                                                                       | skill body (NestJS 11, Express v5 default adapter)                                                                                                                                                           | Runs its own Express/Fastify adapter internally — still one framework choice at skill level; radio right.                                                                                                                                                       |
| elysia (api-framework-elysia)             | api-api (**moved** from api-framework) | constrained-via-exclusivity-or-requires                      | — (framework skill) | —                                                  | none                                                                                                                                                                                                                                                                                                       | skill body (Bun-native, Eden Treaty); Node adapter: elysiajs.com/integrations/node (@elysiajs/node, Elysia 1.2+)                                                                                             | Group #7's merge target. Bun-first, Node-capable — true peer of the other four. No Bun-runtime binding expressible or needed.                                                                                                                                   |
| apollo-server (api-graphql-apollo-server) | api-graphql                            | constrained-via-exclusivity-or-requires                      | C                   | [express (taught + official), fastify (community)] | none — standalone is official (upstream positions it for prototyping; it wraps expressMiddleware internally — a package fact, not a skill fence)                                                                                                                                                           | skill body (startStandaloneServer + @as-integrations/express4/5; "framework middleware for production"); apollo docs standalone.mdx, migration-from-v3.mdx                                                   | Community adapters also cover nextjs (apollo-server-integration-next). Radio is its only fence.                                                                                                                                                                 |
| yoga (api-graphql-yoga)                   | api-graphql                            | constrained-via-exclusivity-or-requires                      | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body ("Fetch API-compatible… runtime-agnostic"); yoga docs integrations (node/express/fastify/koa/bun/deno/CF Workers)                                                                                 | Radio is its only fence.                                                                                                                                                                                                                                        |
| mercurius (api-graphql-mercurius)         | api-graphql                            | constrained-via-exclusivity-or-requires                      | B                   | [fastify]                                          | **ADD** `requires [fastify]` — "Mercurius is a Fastify plugin (npm i fastify mercurius graphql; app.register(mercurius))"                                                                                                                                                                                  | skill body ("Fastify-only"); mercurius README install + registration                                                                                                                                         | The batch's cleanest missing binding. With the api-api radio this becomes a live decision-2 re-key specimen.                                                                                                                                                    |
| better-auth-drizzle-hono (api-auth-…)     | api-auth                               | constrained-via-exclusivity-or-requires                      | B                   | [hono]                                             | KEEP `requires [drizzle]`; **ADD** `requires [hono]` — "Skill mounts Better Auth via Hono routes and typed Hono middleware"                                                                                                                                                                                | skill body (app.on(["POST","GET"], "/auth/*", …), createMiddleware<AuthVariables>); better-auth.com (library itself framework-agnostic)                                                                      | Two rules, shadcn-ui precedent. Worksheet §1 noted requires-without-compatibleWith; fine — compatibleWith is dying anyway.                                                                                                                                      |
| nextauth (api-auth-nextauth)              | api-auth                               | constrained-via-exclusivity-or-requires                      | B                   | [nextjs]                                           | **ADD** `requires [nextjs]` — "Skill teaches the next-auth (Next.js) package — auth.ts, handlers, middleware, Server Components"                                                                                                                                                                           | skill body + all 5 example files (Next.js-only); authjs.dev installation (library also ships @auth/sveltekit, @auth/express, @auth/qwik)                                                                     | The worksheet's "live bug", confirmed. needsAny across 4 frameworks rejected — see question c. Skills-repo note: "When to use" over-claims.                                                                                                                     |
| clerk (api-auth-clerk)                    | api-auth                               | constrained-via-exclusivity-or-requires                      | B                   | [nextjs]                                           | none — existing `requires [nextjs]` verified correct                                                                                                                                                                                                                                                       | default-rules.ts:518-522; skill body (100% @clerk/nextjs, Core 3, proxy.ts)                                                                                                                                  | The mirror template. Product ships React/Vue/Expo/iOS/Go SDKs — binding correctly tracks taught surface.                                                                                                                                                        |
| openapi (api-specs-openapi)               | api-specs                              | **universal**                                                | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body (spec authoring, codegen — zero framework refs)                                                                                                                                                   |                                                                                                                                                                                                                                                                 |
| webhooks (api-messaging-webhooks)         | api-messaging                          | **universal**                                                | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body (HMAC, idempotency, retries, DLQ — zero framework refs)                                                                                                                                           |                                                                                                                                                                                                                                                                 |
| strategies (api-caching-strategies)       | api-caching                            | **universal**                                                | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body (cache-aside, write-through, TTL, HTTP caching — zero framework refs)                                                                                                                             | Pattern-level; composes with redis/upstash rather than requiring them.                                                                                                                                                                                          |
| bullmq (api-queue-bullmq)                 | api-queue                              | constrained-via-exclusivity-or-requires (once binding lands) | A                   | []                                                 | **ADD** `requires needsAny [redis, upstash]` — "BullMQ drives a Redis-compatible server over ioredis/TCP (blocking commands, Lua scripts, streams); Upstash documents BullMQ over its TCP endpoint — its REST client cannot drive BullMQ, and the bullmq skill carries its own ioredis connection factory" | skill body (ioredis connections mandatory, maxRetriesPerRequest: null, connection-self-contained Pattern-1 factory); docs.bullmq.io/guide/redis-tm-compatibility; upstash.com/docs/redis/integrations/bullmq | B6 handoff ACCEPTED — wave-2 overturn of this batch's needs-[redis]-only counter (verify item 6). vercel-kv deliberately excluded (product sunset Dec 2024; its body steers to @upstash/redis). Pay-As-You-Go polling-cost caveat is advice/CLI-740, not fence. |
| api-performance (api-performance-…)       | api-performance                        | **universal**                                                | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body (query optimization, pooling, caching — zero framework refs)                                                                                                                                      |                                                                                                                                                                                                                                                                 |
| stripe (api-commerce-stripe)              | api-commerce                           | **universal**                                                | A                   | []                                                 | none                                                                                                                                                                                                                                                                                                       | skill body (server SDK; examples/webhooks.md pairs an Express raw-body Good-Example route with a framework-agnostic handler — "works with any HTTP framework"); stripe.com/docs                              | Other "express" hits are the Stripe Connect "Express account" product name and the verb.                                                                                                                                                                        |

Net new rules for the apply phase: **4 `requires` additions** (mercurius, nextauth,
better-auth-drizzle-hono, bullmq), **0 changes** to existing rules, **1 category move + 1
category deletion** (elysia / api-framework), **0 new conflict groups**, and group #7 becomes
redundant-inside-exclusive after the move (dies free in Phase C).

## Findings

- **F1 (fixed by the merge, log for release notes):** duplicate "API Framework" header in the
  API wizard grid — `api-api` and `api-framework` share a displayName; QA sweep 2026-07-29
  already logged it as pre-existing.
- **F2 (test-data defect):** `e2e/fixtures/project-builder.ts:89` and
  `local-installer.test.ts` map _hono_ to category `"api-framework"` — factually wrong today,
  schema-invalid after the merge regen. Must ride the same slice.
- **F3 (skills-repo content — widened per verify item 4):** nextauth's over-claim spans **four
  surfaces**, not one line: SKILL.md:38 ("When to use"), SKILL.md:85 ("**Framework-agnostic** -
  Works with Next.js, SvelteKit, Express, Qwik" — a core-principles bullet), SKILL.md:251
  (framework-support note), and `metadata.yaml` `usageGuidance` ("…for Next.js, SvelteKit, or
  other frameworks") — the last is **picker-facing**: post-binding, the catalog UI would
  otherwise advertise SvelteKit on a skill the fence blocks in SvelteKit stacks. No example
  supports any non-Next.js claim — trim all four or grow real content; the metadata line rides
  the same skills-repo slice as the Contradicts-§1 reason-text fix. Mirror of B6's F1 pattern
  (body over-claims its surface).
- **F4 (catalog coverage gap):** no auth skill reachable for express/fastify/nestjs/elysia
  projects once the auth bindings land. Honest, but a backlog candidate.
- **F5 (consistency gates, pre-checked):** no new rule conflicts with anything its subject
  requires; all four bindings point at skills in exclusive categories, which is exactly the
  decision-2 re-key shape; slugs validated against the generated unions (fastify, nextjs, hono,
  drizzle, redis all extant).

## Contradicts-the-worksheet

1. **"nextauth … is Next.js-only" — half-true.** The _library_ is officially multi-framework
   (four first-party packages, verified); the _skill's taught surface_ is Next.js-only. The
   prescribed binding (`[nextjs]`) survives, but the reason text must say "the skill teaches
   next-auth", not "NextAuth is Next.js-only" — the latter is false and would rot.
2. **The GraphQL sentence "three missing `requires` bindings" over-counts — it is ONE.** Only
   mercurius gets a binding. Apollo-server's standalone path and yoga's fetch-core mean a
   `requires` on either would be wrong, and the worksheet's own clean class split (B/C/A) implies
   exactly that. The radio, not requires, is their fence.
3. **Group #7's direction has a documented dissent the worksheet never saw:** the 2026-08-06
   agent-finding ("the api-framework category is spelled two ways") proposes renaming `api-api`
   → `api-framework` instead — the ids already all carry the `api-framework-` prefix and every
   other domain names its framework category `<domain>-framework`, so the worksheet's direction
   _preserves_ the convention drift (`api-api` stays the lone `endsWith("framework")` exception,
   and `FRAMEWORK_CATEGORIES`/`isFrameworkCategory` workarounds stay necessary). The
   worksheet's direction is still the right Phase-B call — elysia's surface is 1 metadata line +
   a handful of tests, while renaming `api-api` touches the required category's 4 skills, far
   more tests, and every user config that persists `domainSelections.api["api-api"]` — but the
   rename should be recorded as its own item (CLI-740 or repo backlog) rather than silently
   dropped, and the agent-finding's `isFrameworkCategory` helper remains wanted either way.
4. **B6-handoff correction WITHDRAWN (wave-2 overturn, verify-B5-B12 item 6):** this batch
   originally countered B6's `needsAny [redis, upstash]` with `needs [redis]` alone, on the
   ground that the upstash skill's REST client forbids BullMQ's primitives. Verification
   overturned that: the upstash skill _routes_ blocking/Lua workloads to ioredis-over-TCP — the
   exact connection the bullmq skill provides itself — so the pair is complementary, and `needs
[redis]` plus the `api-kv` radio would hard-block bullmq for every upstash-selecting project.
   The handoff stands as B6 drafted it; full grounds in the bullmq section.
5. **Minor:** the worksheet's B5 row tags better-auth-drizzle-hono only as "requires but no
   compatibleWith" (§1 nuance); the real defect is the missing second binding (`[hono]`).

## Migration surfaces (named, NOT fixed here)

| #   | surface                                                | action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `skills/src/skills/api-framework-elysia/metadata.yaml` | `category: api-framework` → `api-api` (skills repo; lands in agents-inc/skills)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M2  | `default-categories.ts:377-386`                        | delete the `api-framework` block including the NOTE comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M3  | generate round                                         | `generate:types` (matrix.ts, source-types.ts), matrix-package regen (vendored copies), `generate-json-schemas` (both schema enums)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| M4  | tests                                                  | `project-builder.ts:89`, `local-installer.test.ts` ×5 sites, `marketplace-generator.test.ts` ×3, `generate-source-types.test.ts` ×2, `preload-defaults.test.ts:67` — F2's wrong-category fixtures corrected, not just re-pointed                                                                                                                                                                                                                                                                                                                      |
| M5  | user configs                                           | `domainSelections.api["api-framework"]` becomes schema-invalid; pre-1.0, no shim — release-notes line                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M6  | rules                                                  | group #7 (default-rules.ts:35-38) becomes wholly-inside-exclusive → deletes free in Phase C; alternatives group 664-667 is slug-based, unaffected                                                                                                                                                                                                                                                                                                                                                                                                     |
| M7  | docs                                                   | `.ai-docs/reference/features/configuration.md:196,213` (category table + duplicate note)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| M8  | new `requires` rules ×4                                | mercurius, nextauth, better-auth-drizzle-hono (second rule), bullmq (`needsAny [redis, upstash]`) — plus manifest rows above                                                                                                                                                                                                                                                                                                                                                                                                                          |
| M9  | rename backlog + helper (verify item 1 amendment)      | record the `api-api` → `api-framework` rename as its own backlog item (CLI-740 or repo backlog) together with the 2026-08-06 agent-finding's `isFrameworkCategory` helper (wanted either way). This merge _vacates_ the `api-framework` id, converting that future conventional rename from a merge-plus-rename into a clean single-id migration; blast radius decided the direction (`default-stacks.ts` measures **98 `"api-api"` keys vs 0 `"api-framework"` keys**). `FRAMEWORK_CATEGORIES` keeps `api-api` when `api-framework` is dropped (M4). |
