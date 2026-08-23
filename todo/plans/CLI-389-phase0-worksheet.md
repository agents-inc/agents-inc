# CLI-389 Phase 0 — inventory worksheet (measured 2026-08-07)

Derived from the current tree: `packages/cli/src/cli/lib/configuration/default-rules.ts` (731 lines) and the generated matrix at `packages/cli/src/cli/types/generated/matrix.ts` (`BUILT_IN_MATRIX`, mirrored in sync at `packages/matrix/src/vendor/generated/matrix.ts`). All counts recomputed, none carried over.

## 1. Headline numbers

**The catalog is 237 skills, not 229 and not 233.** `SKILL_MAP` has 237 entries; the marketplace at `/home/vince/dev/skills/src` has 237 `metadata.yaml` files; the generated matrix has 237 skill blocks. 229 + 4 meta-planning + 4 meta-reviewing = 237.

| Bucket                                          | 222 (EDITOR-06) | 237 (now) |
| ----------------------------------------------- | --------------- | --------- |
| Own `conflictsWith`                             | 80              | **80**    |
| Reaches a conflict transitively via `requires`  | 19              | **19**    |
| Neither — invisible to the incompatibility rule | 123             | **138**   |

Every one of the 15 skills added since the 222 measurement landed in the "neither" bucket. The constrained set has not grown at all.

**"Neither" by domain** (the fan-out's actual workload):

| domain    | neither | of which sit in an exclusive category (already fenced) |
| --------- | ------- | ------------------------------------------------------ |
| web       | 31      | 5                                                      |
| mobile    | 22      | 8                                                      |
| ai        | 20      | 0                                                      |
| api       | 19      | 7                                                      |
| desktop   | 14      | 6                                                      |
| meta      | 13      | 0                                                      |
| infra     | 12      | 3                                                      |
| shared    | 6       | 0                                                      |
| cli       | 1       | 0                                                      |
| **total** | **138** | **29**                                                 |

So 109 skills are genuinely unfenced by any mechanism; 29 more read as empty but are covered by their category's radio.

**The 29 orphans in exclusive categories** (EDITOR-06 said seven; it is 29 now, and two of its named seven have moved out — see §5): apollo-server, mercurius, yoga (api-graphql); edgedb, surrealdb (api-database); planetscale, turso (api-baas); pulumi, sst, terraform (infra-iac); leaflet, mapbox (web-maps); lexical, tiptap (web-editor); sse (web-realtime); detox, maestro (mobile-testing); expo-router, react-navigation (mobile-navigation); nativewind, unistyles (mobile-styling); react-native-paper, tamagui (mobile-ui-components); electron-forge, tauri-bundling (desktop-packaging); electron-multiwindow, tauri-multiwindow (desktop-multiwindow); electron-security, tauri-security (desktop-security).

**Rule-file shape**

| Section                 | Count                                                   |
| ----------------------- | ------------------------------------------------------- |
| `conflicts` groups      | 28                                                      |
| `discourages` rules     | **0** (still `[]` at `default-rules.ts:124`)            |
| `compatibleWith` groups | **39**                                                  |
| `requires` rules        | 50, covering 49 distinct skills (shadcn-ui carries two) |
| `alternatives` groups   | 44                                                      |
| Categories              | 90, of which **25** are `exclusive: true`               |

**`compatibleWith` / `requires` parity — REVERIFIED, still clean.** All 39 `compatibleWith` groups have a `requires` rule for the same subject skill whose `needs` set is _set-identical_ to the whitelist. Zero missing, zero mismatched. Decision 4a's "zero new declarations" holds.

One nuance the apply-phase must not trip on: **49** skills carry a _resolved_ non-empty `compatibleWith` array in the matrix (the resolver expands each group symmetrically to all members), against 49 with `requires`. The two sets are not the same 49 — the five base frameworks (react, vue-composition-api, angular-standalone, solidjs, svelte) have resolved `compatibleWith` but no `requires`; claude-vision, openai-whisper, better-auth-drizzle-hono, docusaurus, vitepress have `requires` but no `compatibleWith`. Grep-zero after deletion must target the resolved arrays too, not just the 39 authored groups.

## 2. The non-redundant conflict groups — **11, not 10**

A group is redundant when all its members share one category and that category is `exclusive: true`. 17 of the 28 groups are redundant and die free with decision 2. The remaining 11 need a disposition.

### 2a. Group == whole category, category merely open → one flag flip each (cheapest disposition)

| #   | Group          | Members → category                                                       | Disposition                                                                    |
| --- | -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 11  | Vector DBs     | pinecone, qdrant, chroma, weaviate → `api-vector-db` (open, 4/4 members) | Set `exclusive: true`. Fence is exactly the category; no restructure, no loss. |
| 12  | Search engines | elasticsearch, meilisearch → `api-search` (open, 2/2)                    | Set `exclusive: true`. Same.                                                   |
| 13  | CMS platforms  | payload, sanity, strapi → `api-cms` (open, 3/3)                          | Set `exclusive: true`. Same.                                                   |

### 2b. Group is a strict subset of an open category → split or accept loss

| #   | Group                  | Members → category                                                                                                                                 | Disposition (fan-out decides)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | E2E frameworks         | playwright-e2e, cypress-e2e → `web-testing` (open, 6 members: + vitest, react-testing-library, vue-test-utils, visual-regression)                  | Split an exclusive `web-e2e` category out of `web-testing`; the residue (unit/component/visual) stays composing. Clean taxonomy fix.                                                                                                                                                                                                                                                                                                                |
| 14  | React UI kits          | shadcn-ui, mui, chakra-ui, mantine, ant-design → `web-ui-components` (open, 10 members: + radix-ui, headless-ui, base-ui, tanstack-table, vuetify) | Design-system kits vs. headless primitives vs. a table lib are three different things in one category. Split an exclusive `web-ui-kit`; leave primitives/table composing.                                                                                                                                                                                                                                                                           |
| 15  | Monorepo orchestrators | turborepo, nx → `shared-monorepo` (open since decision 3, 3 members: + pnpm-workspaces)                                                            | The plan's own prescription: exclusive task-runner category `{nx, turborepo}` beside a composing workspaces category. This is the live specimen decision 3 created.                                                                                                                                                                                                                                                                                 |
| 16  | Lint/format            | biome, eslint-prettier → `shared-tooling` (open, 6 members: + git-hooks, stack-detect, changesets, typescript-config)                              | Split an exclusive `shared-lint`; the rest of `shared-tooling` is genuinely additive.                                                                                                                                                                                                                                                                                                                                                               |
| 20  | React forms            | react-hook-form, tanstack-form → `web-forms` (open, 4 members: + vee-validate, zod-validation)                                                     | Overlaps #24 on tanstack-form — see below.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 24  | Vue forms              | vee-validate, tanstack-form → `web-forms` (open, same category)                                                                                    | **The one case category exclusivity structurally cannot express:** tanstack-form is in both groups, so no partition of `web-forms` reproduces both fences. Either accept loss to CLI-740, or note that decision 2's `requires` re-key already covers it — rhf is React-only and vee-validate is Vue-only, so they can never coexist anyway, and tanstack-form is multi-framework. Strong candidate for "the fence was never load-bearing; drop it". |

### 2c. Cross-category groups

| #   | Group                  | Members → categories                                                                                | Disposition                                                                                                                                                         |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | API frameworks         | hono, express, fastify, nestjs → `api-api` (EXCL); **elysia → `api-framework` (EXCL, sole member)** | Move elysia into `api-api` and delete the one-member `api-framework` category. The group's fence then _is_ the category. Trivial, per the plan.                     |
| 26  | Managed Postgres hosts | neon → `api-baas` (EXCL); vercel-postgres, cockroachdb → `api-database` (EXCL)                      | The known **accepted loss to CLI-740**. neon sits with supabase/firebase/appwrite/planetscale/turso for good reason; no non-violent restructure recovers the fence. |

**Disposition summary:** 3 flag flips, 5 category splits, 1 category merge (Elysia), 1 probable drop (#24), 1 accepted loss (#26). The plan's "the 8 subset-groups get per-group calls" over-counts effort: three of those eight are one-line flag flips.

## 3. Batch partition — 12 batches, 237 skills

Flags: **C** = own `conflictsWith`; **R** = reaches a conflict via `requires`; **–** = neither (the audit's real target). `[X]` = category is `exclusive: true`; `[o]` = open. Each row a researcher fills: `class` (SKILLS-01 A/B/C), `frameworks` (support surface: class B → one framework slug, class C → adapter slugs, class A → empty), `derived-requires` (the `requires`/`needsAny` the surface implies), `verdict`, `audited`.

### B1 — web core: frameworks, meta-frameworks, routing, server state (20)

`web-framework[X]`: react C, angular-standalone C, vue-composition-api C, solidjs C, svelte C
`web-meta-framework[X]`: nextjs C, remix C, nuxt C, sveltekit C, astro C, qwik C, docusaurus C, vitepress C
`web-routing[X]`: react-router C, tanstack-router C
`web-server-state[X]`: react-query C, swr C, trpc R, graphql-apollo C, graphql-urql C
**Questions:** these are the anchors every other batch's `requires` points at — verify the anchor slugs before anyone binds to them. Are docusaurus and vitepress correctly in `web-meta-framework`? They are doc-site generators radio-excluded from Next.js/Nuxt today, which is wrong in practice (a Next app can ship a VitePress docs site). Confirm astro and qwik carry no `requires` deliberately. All class-A/B/C verdicts here are trivially "framework skill — not classified".

### B2 — web state, forms, i18n, utilities (19)

`web-client-state[X]`: jotai C, mobx C, redux-toolkit C, zustand C, pinia R, ngrx-signalstore R
`web-forms[o]`: react-hook-form C, tanstack-form C, vee-validate C, zod-validation –
`web-error-handling[o]`: error-boundaries R, result-types –
`web-i18n[X]`: next-intl C, react-intl C, vue-i18n R
`web-utilities[o]`: rxjs –, date-fns –, vueuse R, native-js –
**Questions:** `web-client-state` is exclusive but holds React, Vue and Angular stores — the radio is doing framework-exclusion work that `requires` already does; is the exclusivity flag right, or an artifact? Groups #20/#24 disposition (§2b) is decided here. zod-validation is the canonical SKILLS-01 class-A neutralization case — its verdict must be `universal`. date-fns/rxjs/native-js: confirm universal.

### B3 — web UI, styling, animation, editors (22)

`web-ui-components[o]`: shadcn-ui C, mui C, chakra-ui C, mantine C, ant-design C, radix-ui R, headless-ui R, tanstack-table R, vuetify R, base-ui –
`web-styling[o]`: tailwind –, scss-modules –, cva –, theming –, design-tokens –
`web-animation[o]`: framer-motion R, css-animations –, view-transitions –
`web-editor[X]`: lexical –, tiptap –
`web-3d[o]`: react-three-fiber – ; `web-dnd[o]`: dnd-kit –
**Questions:** group #14's split (§2b). **base-ui has no `requires` and no `compatibleWith` — a missing React binding, high confidence.** react-three-fiber and dnd-kit are React-only and both are unbound — same defect. tailwind is the SKILLS-01 class-C exemplar (multi-framework adapters); cva/theming/design-tokens likely class A. Are lexical/tiptap really mutually exclusive, or is `web-editor`'s radio over-strict (one app, two editors, different surfaces)?

### B4 — web platform, testing, tooling (23)

`web-testing[o]`: playwright-e2e C, cypress-e2e C, react-testing-library R, vue-test-utils R, vitest –, visual-regression –
`web-tooling[o]`: storybook R, vite –, component-library –
`web-realtime[X]`: websockets C, socket-io C, sse –
`web-pwa[o]`: service-workers –, offline-first – ; `web-dataviz[o]`: d3 –, recharts –
`web-maps[X]`: leaflet –, mapbox – ; `web-mocking[o]`: msw –
`web-file-upload[o]`: file-upload-patterns R ; `web-files[o]`: image-handling R
`web-performance[o]`: web-performance – ; `web-accessibility[o]`: web-accessibility –
**Questions:** group #6's split. Is `web-realtime` exclusive correct now that sse is in it — SSE genuinely coexists with WebSockets. recharts is React-only and unbound. vitest/msw/visual-regression: confirm universal. `web-maps` exclusivity: leaflet + mapbox in one app is unusual but not impossible — accepted?

### B5 — API core: frameworks, GraphQL, auth, cross-cutting (17)

`api-api[X]`: hono C, express C, fastify C, nestjs C ; `api-framework[X]`: elysia C
`api-graphql[X]`: apollo-server –, yoga –, mercurius –
`api-auth[X]`: better-auth-drizzle-hono C, nextauth C, clerk C
`api-specs[o]`: openapi – ; `api-messaging[o]`: webhooks – ; `api-caching[o]`: strategies –
`api-queue[o]`: bullmq – ; `api-performance[o]`: api-performance – ; `api-commerce[o]`: stripe –
**Questions:** group #7 (Elysia merge). The GraphQL servers are framework-bound in practice — mercurius requires fastify, yoga is server-agnostic, apollo-server has adapters: three missing `requires` bindings and a clean class-B/C split. nextauth has no `requires` despite being Next.js-only (clerk correctly has one) — a live bug. Confirm stripe/webhooks/openapi universal.

### B6 — API data: databases and BaaS (22)

`api-database[X]`: postgresql C, mysql C, drizzle C, prisma C, sequelize C, typeorm C, knex C, mongodb C, mongoose C, redis C, upstash C, vercel-kv C, vercel-postgres C, cockroachdb C, edgedb –, surrealdb –
`api-baas[X]`: supabase C, firebase C, appwrite C, neon C, planetscale –, turso –
**Questions:** **`api-database` is one exclusive category holding 16 skills spanning SQL engines, ORMs, KV stores and Mongo — the radio says you may pick exactly one of Postgres, Drizzle and Redis, which is plainly wrong.** This is the biggest exclusivity defect in the tree and it must be settled before decision 2 makes exclusivity the sole mechanism, or the conflict-group removal will encode this error as the only fence. Proposal to test: split into `api-sql-engine` [X], `api-orm` [X], `api-kv` [X], `api-document` [X]. Group #26's accepted loss depends on the outcome. planetscale/turso/edgedb/surrealdb are unaudited orphans riding the (broken) radio.

### B7 — API services: vector, search, CMS, analytics, observability, email (16)

`api-vector-db[o]`: pinecone C, qdrant C, chroma C, weaviate C
`api-search[o]`: elasticsearch C, meilisearch C
`api-cms[o]`: payload C, sanity C, strapi C
`api-analytics[o]`: setup-posthog –, posthog-flags –, posthog-analytics –
`api-observability[o]`: axiom-pino-sentry –, setup-axiom-pino-sentry –
`api-email[o]`: setup-resend –, resend-react-email R
**Questions:** groups #11/#12/#13 — the three flag flips (§2a); confirm each group really is the whole category and nothing is queued to join it. The setup/usage pairs (posthog, observability, email) are the pattern decision 3 un-radioed `api-email` for — verify `api-analytics` and `api-observability` were never wrongly exclusive and that the pairs don't need a `requires` link (usage requires setup?). SKILLS-01 exemplars live here: `api-observability-setup-axiom-pino-sentry` is a named class-C proving case; resend-react-email is class B (React).

### B8 — AI (20)

`ai-provider[o]`: anthropic-sdk –, openai-sdk –, google-gemini-sdk –, mistral-sdk –, cohere-sdk –, elevenlabs –, claude-vision – (has `requires`), openai-whisper – (has `requires`)
`ai-infrastructure[o]`: huggingface-inference –, together-ai –, litellm –, replicate –, modal –, ollama –
`ai-orchestration[o]`: langchain –, llamaindex –, vercel-ai-sdk –
`ai-observability[o]`: langfuse –, promptfoo – ; `ai-patterns[o]`: tool-use-patterns –
**Questions:** the entire domain is 20/20 unaudited and 0/20 fenced. `alternatives` already declares a 10-member "AI Provider SDK" purpose group with no matching conflict group and no exclusivity — is multi-provider genuinely normal (yes, via litellm/vercel-ai-sdk) so the verdict is `universal` across the board? claude-vision and openai-whisper are the only two with `requires`, and they reach no conflict — decision 2's re-key must not silently reclassify them.

### B9 — mobile (24)

`mobile-framework[o]`: expo R, react-native R
`mobile-navigation[X]`: expo-router –, react-navigation – ; `mobile-styling[X]`: nativewind –, unistyles –
`mobile-testing[X]`: detox –, maestro – ; `mobile-ui-components[X]`: tamagui –, react-native-paper –
`mobile-animation[o]`: reanimated –, gesture-handler –, skia –
`mobile-storage[o]`: mmkv –, sqlite-powersync –, watermelondb –
`mobile-deployment[o]`: eas – ; `mobile-camera[o]`: vision-camera – ; `mobile-hardware[o]`: ble-nfc –
`mobile-notifications[o]`: push – ; `mobile-background[o]`: tasks – ; `mobile-deep-linking[o]`: app-links –
`mobile-performance[o]`: react-native-performance – ; `mobile-security[o]`: react-native-security –
**Questions:** **22 of 24 mobile skills state nothing, yet every one of them is React-Native-bound — this is the single largest block of missing `requires` in the catalog and EDITOR-06's named priority.** Each needs `requires needsAny [react-native, expo]` (or `[expo]` alone for eas/expo-router). SKILLS-01 class B applies almost universally here (reanimated is the plan's named class-B case). `mobile-framework` is non-exclusive with expo + react-native, which is correct (expo requires react-native) — confirm it stays that way.

### B10 — desktop (16)

`desktop-framework[X]`: electron C, tauri C
`desktop-multiwindow[X]`: electron-multiwindow –, tauri-multiwindow – ; `desktop-packaging[X]`: electron-forge –, tauri-bundling –
`desktop-security[X]`: electron-security –, tauri-security –
`desktop-ipc[o]`: electron-ipc – ; `desktop-storage[o]`: electron-storage – ; `desktop-ui[o]`: electron-ui –
`desktop-testing[o]`: electron-testing – ; `desktop-updates[o]`: electron-updater –
`desktop-backend[o]`: tauri-backend – ; `desktop-plugins[o]`: tauri-plugins – ; `desktop-mobile[o]`: tauri-mobile –
**Questions:** every skill here is named for its host framework yet **not one declares `requires`**. The three paired exclusive categories fence electron-vs-tauri variants by radio, but the six single-vendor open categories (electron-ipc, electron-storage, electron-ui, electron-testing, electron-updater, tauri-backend, tauri-plugins, tauri-mobile) have no fence at all — pick tauri and every electron-* skill stays clickable. Uniform fix: `requires [electron]` / `requires [tauri]`, which makes all the paired radios redundant too. Cleanest batch in the catalog; likely the fastest win.

### B11 — infra + CLI (15)

`infra-ci-cd[o]`: github-actions –, docker –, turborepo-ci – ; `infra-config[o]`: setup-env –
`infra-containers[o]`: kubernetes – ; `infra-iac[X]`: terraform –, pulumi –, sst –
`infra-platform[o]`: vercel –, netlify –, cloudflare-workers –, aws-sdk –
`cli-framework[X]`: cli-commander C, oclif-ink C ; `cli-prompts[o]`: clack –
**Questions:** `infra-iac` exclusive with terraform/pulumi/sst — defensible, but three unaudited orphans riding it. turborepo-ci is bound to turborepo and declares nothing (interacts with group #15's split). `infra-platform` is open with four mutually-substitutable hosts — should it be exclusive, or is multi-cloud normal? setup-env is a named SKILLS-01 class-C proving case. clack pairs with cli-commander/oclif-ink — binding or universal? github-actions is EDITOR-06's canonical "genuinely universal" example — the verdict should say so explicitly.

### B12 — shared + meta (23)

`shared-monorepo[o]`: turborepo C, nx C, pnpm-workspaces –
`shared-tooling[o]`: biome C, eslint-prettier C, typescript-config –, git-hooks –, changesets –, stack-detect –
`shared-security[o]`: auth-security –
`meta-design[o]`: expressive-typescript –, composable-components – ; `meta-methodology[o]`: research-methodology –
`meta-planning[o]`: web-planning –, api-planning –, cli-planning –, ai-planning –
`meta-reviewing[o]`: reviewing –, web-reviewing –, api-reviewing –, cli-reviewing –, infra-reviewing –, ai-reviewing –
**Questions:** groups #15 and #16's splits (§2b) both land here. **All 13 meta skills are new since the last measurement and all state nothing** — they are process skills, so the expected verdict is `universal` across the board, but that must be _recorded_, which is the entire point of the manifest. The 10 planning/reviewing skills mirror the 21-agent roster (one consolidated `reviewer`, so `meta-reviewing-reviewing` is the generalist beside five domain reviewers) — confirm the roster/skill correspondence before asserting universality. composable-components is React-flavoured; check whether it needs a binding.

**Batch totals:** 20 + 19 + 22 + 23 + 17 + 22 + 16 + 20 + 24 + 16 + 15 + 23 = **237**.

## 4. Audit-manifest skeleton

Central, beside the rules, per decision 0/1. Proposed path `packages/cli/src/cli/lib/configuration/skill-audit.ts` (sibling of `default-rules.ts`, same merge story via the source loader if sources ever extend it).

```ts
import type { SkillId, SkillSlug } from "../../types"

/** Post-decision-2 vocabulary: conflict groups no longer exist as a mechanism. */
export type AuditVerdict =
  "constrained-via-exclusivity-or-requires" | "universal"

/** SKILLS-01 phase 4 rides this manifest — one audit, two products. */
export type SkillClass = "A" | "B" | "C"

export type SkillAuditEntry = {
  /** ISO date the verdict was established or last re-confirmed. */
  audited: `${number}-${number}-${number}`
  verdict: AuditVerdict
  /** Worksheet batch that produced it — provenance for the adversarial pass. */
  batch: BatchId
  /**
   * SKILLS-01 classification. Omitted for the framework skills themselves
   * (react, nextjs, react-native, electron, tauri, …) which are the binding targets.
   * class A → frameworks: []; class B → exactly one; class C → the adapter set.
   */
  classification?: { class: SkillClass; frameworks: SkillSlug[] }
  /** Cited sources — required whenever the entry changed a rule, optional for a plain "universal". */
  sources?: string[]
  /** Anything the current vocabulary cannot express, handed to CLI-740 rather than invented here. */
  deferredToD306?: string
}

export type BatchId =
  | "web-core"
  | "web-state"
  | "web-ui"
  | "web-platform"
  | "api-core"
  | "api-data"
  | "api-services"
  | "ai"
  | "mobile"
  | "desktop"
  | "infra-cli"
  | "shared-meta"

/**
 * Total record: the type checker enforces "every SkillId appears" at compile time,
 * so the "empty = unaudited" ambiguity becomes unrepresentable for built-ins.
 */
export const skillAudit: Record<SkillId, SkillAuditEntry> = {
  "web-framework-react": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-forms-zod-validation": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
    sources: ["https://zod.dev"],
  },
  "mobile-animation-reanimated": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://docs.swmansion.com/react-native-reanimated/"],
  },
  // … 234 more
}
```

Two enforcement points, both cheap:

- **Compile time:** `Record<SkillId, SkillAuditEntry>` (not `Partial<…>`) makes a missing skill a `tsc` error. This is the structural closure of EDITOR-06 — no new check needed for built-ins.
- **Runtime:** one assertion in `packages/cli/src/cli/lib/matrix/matrix-health-check.ts` covering source-provided skills, plus the cross-check the plan already specifies (a `universal` verdict on a skill that carries `requires` or sits in an exclusive category is a contradiction and must fail).

YAML variant, if the manifest should be data rather than code — same fields, `packages/cli/src/cli/lib/configuration/skill-audit.yaml`, keyed by skill id, loaded through the existing zod parse boundary. It loses the compile-time exhaustiveness, which is the manifest's main asset, so **TypeScript is the recommendation**.

## 5. Blockers and stale references — corrections for the fan-out briefs

| Where                               | Says                                                                                                                                                    | Reality (2026-08-07)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan title, §Phase 0, §Acceptance   | "229 skills"                                                                                                                                            | **237.** Also the brief's "233" is wrong; 229 + 4 planning + 4 reviewing = 237.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Plan §Where the data lives          | "759 lines"                                                                                                                                             | `default-rules.ts` is **731 lines**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Plan §Where the data lives          | "zero of the 231 metadata.yaml files carry any relationship field"                                                                                      | Still zero — but of **237** files. Verified: no `conflictsWith`/`compatibleWith`/`requires`/`discourages`/`recommends`/`binding` key in any of them. The single-source-of-truth premise holds.                                                                                                                                                                                                                                                                                                                                             |
| Plan §Phase 0 / EDITOR-06           | 80 / 19 / 123 at 222                                                                                                                                    | **80 / 19 / 138 at 237.** Constrained set unchanged; all growth is unaudited.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Plan decision 2 Phase B             | "the 10 non-redundant groups"                                                                                                                           | **11.** The plan's own enumeration (monorepo + Elysia + Postgres + "8 subset-groups") already adds to 11 — only the headline number is stale. Of the 8, three (vector-db, search, CMS) are one-line `exclusive: true` flips, not per-group judgement calls.                                                                                                                                                                                                                                                                                |
| Plan decision 2                     | "The research fan-out … the missing `requires` bindings (EDITOR-06's 130)"                                                                              | **130 is unsourced** — EDITOR-06 says 123 (at 222). The live figure is 138, of which 29 are already fenced by an exclusive category, leaving **109** genuinely unconstrained. Briefs should quote 138/109, not 130.                                                                                                                                                                                                                                                                                                                        |
| Plan decision 3                     | "in-flight decision-3 slice lands as specified"                                                                                                         | **Landed.** `shared-monorepo` and `api-email` are both `exclusive: false` in the generated matrix; `{turborepo, nx}` still exists at `default-rules.ts:67-70` and is now load-bearing (group #15 flipped to non-redundant, exactly as predicted). `todo/cli.md:576` already marks it resolved. Restate as past tense.                                                                                                                                                                                                                      |
| EDITOR-06 (`todo/editor.md:89-108`) | "Seven of the orphans also sit in exclusive categories (PlanetScale, Turso, Gel (EdgeDB), SurrealDB, Email Setup, pnpm Workspaces, Server-Sent Events)" | **29 now**, and **two of the seven no longer qualify** — Email Setup (`setup-resend`) and pnpm Workspaces moved to open categories when decision 3 un-radioed `api-email` and `shared-monorepo`. Those two are now unfenced orphans, not category-covered ones.                                                                                                                                                                                                                                                                            |
| EDITOR-06                           | "start with web (26 of the 123) and mobile (22)"                                                                                                        | web is now **31**, mobile is still **22**. Mobile remains the highest-density block (22 of 24 skills).                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Plan/brief                          | "`selectReachability` reference"                                                                                                                        | **Not stale — verified live.** `apps/editor/src/features/configure/lib/derive.ts:237`, exported and consumed at `derive.ts:435`, with tests at `derive.test.ts:657` and `derive.contract.test.ts:27`, and documented at `docs/web/editor-spec.md:350`. EDITOR-06's argument still stands as written.                                                                                                                                                                                                                                       |
| Brief                               | "`recommends` is deleted"                                                                                                                               | **Confirmed.** No occurrence in `packages/cli/src/cli/types/`, `packages/cli/src/cli/lib/schemas.ts` or `packages/matrix/src/schema.ts`. Only changelogs (0.60.0, 0.18.0, 0.81.1) and one agent-finding retain the word historically. Nothing to do.                                                                                                                                                                                                                                                                                       |
| Brief                               | "`discourages` has zero rules, proposed for deletion"                                                                                                   | **Confirmed zero rules** (`default-rules.ts:124`), but the _token_ is live in **30 files** — `packages/matrix/src/schema.ts:57`, `packages/matrix/src/read-model/catalog.ts`, both vendored matrices, `matrix-resolver.ts`, `skill-resolution.ts`, `source-loader.ts`, `schemas.ts`, `generators.ts`, `commands/search.ts`, `contract/selection-scenarios.ts`, plus test factories/fixtures and four `.ai-docs` reference pages. The deletion is a real (if mechanical) slice, not a one-liner — size it accordingly in the Phase C brief. |
| Brief                               | "21 agents with one consolidated reviewer"                                                                                                              | **Confirmed.** 21 agent directories under `packages/cli/src/agents/`, with a single `reviewer/reviewer`. Note the skill catalog carries **six** `meta-reviewing` skills (generalist + web/api/cli/ai/infra), so the agent roster and the reviewing-skill set are not 1:1 — B12 must not assume they are.                                                                                                                                                                                                                                   |
| Plan decision 4a                    | "Phase 0 found all 39 groups already have identical `requires` rules"                                                                                   | **Reverified true** — 39/39, zero missing, zero mismatched. Caveat for the deletion sweep: the _resolved_ `compatibleWith` is non-empty on 49 skills (symmetric group expansion), including the five base frameworks which have no `requires`. Grep-zero must cover the generated arrays.                                                                                                                                                                                                                                                  |
| New — not in the plan               | —                                                                                                                                                       | **`api-database` is `exclusive: true` with 16 members** spanning SQL engines, ORMs, KV stores and MongoDB. Under decision 2, category exclusivity becomes the _sole_ incompatibility mechanism, so this radio would become the authoritative statement that Postgres, Drizzle and Redis are mutually exclusive. **This is a decision-2 blocker: B6 must settle the `api-database` split before Phase C deletes the conflict layer**, or the removal ships a worse fence than the one it replaces.                                          |

## Report

**Headline numbers:** the catalog is **237** skills (not 229, not 233) — 229 plus 4 meta-planning and 4 meta-reviewing. Coverage recomputes to **80 own-conflicts / 19 via-`requires` / 138 neither**; the constrained set has not moved since the 222-skill measurement, so every skill added since is unaudited. Of the 138, **29** sit in exclusive categories and are already fenced, leaving **109** genuinely unconstrained. Rule file: 28 conflict groups, 39 `compatibleWith` groups, 50 `requires` rules over 49 skills, 0 `discourages`, 90 categories of which 25 are exclusive. **`compatibleWith`/`requires` parity reverified: 39/39 identical — decision 4a's "zero new declarations" holds.**

**Batch count: 12** (20/19/22/23/17/22/16/20/24/16/15/23 = 237), partitioned by domain-category cluster, each carrying its exclusivity flags, C/R/– coverage flags and the SKILLS-01 class + framework-support columns to fill.

**Materially changes the plan's assumptions:**

1. **`api-database` is one exclusive category with 16 members** — SQL engines, ORMs, KV stores and Mongo all radio-excluding each other. Decision 2 promotes category exclusivity to the _only_ incompatibility mechanism, so deleting the conflict layer would enshrine this as the fence. It must be split before Phase C. This is a genuine blocker and it is not mentioned anywhere in the plan.
2. **The non-redundant group count is 11, not 10** — decision 3's `shared-monorepo` un-radio flipped `{turborepo, nx}` over, exactly as the plan predicted. The plan's own enumeration already sums to 11; only the headline is stale. And the work is lighter than billed: three of the eleven (vector-db, search, CMS) are single `exclusive: true` flips because the group _is_ the whole category.
3. **The `{vee-validate, tanstack-form}` / `{react-hook-form, tanstack-form}` overlap is structurally inexpressible** as category exclusivity — tanstack-form is in both, so no partition of `web-forms` reproduces both fences. It is a second accepted-loss candidate beside the Postgres-hosts group, though the `requires` re-key probably already covers it.
4. **Desktop is the cheapest win in the catalog** — 16 skills, every one named for its host framework, not one declaring `requires`. Uniform `requires [electron]` / `requires [tauri]` closes the whole domain and makes three paired exclusive categories redundant.
5. **EDITOR-06's "seven orphans in exclusive categories" is now 29**, and two of its named seven (Email Setup, pnpm Workspaces) fell out of exclusive categories when decision 3 landed — they are now unfenced.
6. The plan's "EDITOR-06's 130" missing bindings is unsourced; briefs should quote **138 / 109**. `selectReachability` is live and correctly cited. `recommends` is confirmed gone; `discourages` has zero rules but its token is live in **30 files**, so its deletion is a real slice.
