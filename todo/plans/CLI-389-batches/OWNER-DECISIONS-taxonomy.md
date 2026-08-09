# APPROVED — owner go on all nine, 2026-08-07. Zero-rename variant; id/category alignment parked to the very end (CLI-425). CLI-424 lands first.

# Owner decisions — every CLI-389 category proposal, one ruling session (compiled 2026-08-07)

Every category change the audit produced, in one place, so the taxonomy is ruled on once.
Everything here survived adversarial verification; rule deltas do NOT wait on this page (waves
1-3 carry those). Nothing below is applied yet. Plain language first, detail in the batch
files; a recommendation is stated per row. One background fact: several existing conflict
groups die "for free" at Phase C **only after** their category lands — the ledger at the end
names every such dependency, and Phase C must check it before deleting anything.

| #   | proposal                            | members                                | recommendation                      |
| --- | ----------------------------------- | -------------------------------------- | ----------------------------------- |
| 1   | **api-data six-way split — URGENT** | 22 skills across 6 pick-one buckets    | ADOPT NOW; variant A (no renames)   |
| 2   | web-server-state split (B1)         | react-query/swr ‖ apollo/urql ‖ trpc   | ADOPT (Variant A adjudicated)       |
| 3   | web-docs (B1)                       | docusaurus, vitepress                  | ADOPT (note the wave-3 interaction) |
| 4   | web-form-library split (B2)         | rhf, tanstack-form, vee-validate ‖ zod | ADOPT                               |
| 5   | web-ui-kit split (B3)               | 5 React kits + vuetify ‖ 4 headless    | ADOPT                               |
| 6   | web-e2e split (B4)                  | playwright-e2e, cypress-e2e            | ADOPT                               |
| 7   | sse → web-streaming (B4)            | sse alone                              | ADOPT                               |
| 8   | three exclusivity flips (B7)        | api-vector-db, api-search, api-cms     | ADOPT (one-line flips)              |
| 9   | docker → infra-containers (B11)     | docker                                 | ADOPT at convenience                |

Rows 8-9 were not in the synthesis brief's enumeration but are category proposals from
verified batches with no other home — added here so they do not fall between waves.

## 1. The api-data six-way split — URGENT

**Plain language:** today all 22 database-and-backend skills sit in two big pick-one buckets,
so picking Postgres blocks Redis and picking Drizzle blocks Neon — combinations that are the
normal way to build a backend. Of the 137 "you can't have both" claims the current buckets
make, only 29 are right. **And since wave 2 landed, the matrix ships an unsatisfiable pair:
Better Auth + BullMQ cannot both be selected** (better-auth requires drizzle, bullmq requires
redis-or-upstash — two picks in the one exclusive `api-database` radio). This is no longer
just wrong advice; it is a live contradiction.

- **Members:** `api-sql-engine` {postgresql, mysql, cockroachdb}; `api-orm` {drizzle, prisma,
  sequelize, typeorm, knex}; `api-document` {mongodb, mongoose, edgedb, surrealdb}; `api-kv`
  {redis, upstash, vercel-kv}; `api-db-host` {neon, planetscale, turso, vercel-postgres};
  `api-baas` kept, purified {supabase, firebase, appwrite}.
- **Rationale:** each smaller bucket fences only genuine either/or choices; 97 flatly wrong
  exclusions disappear, 29 correct fences kept, 2 correct ones added. Zero new `requires`.
- **Migration cost (measured):** ~112 stack category keys, 19 skills-repo `category:` edits,
  4 new categories + `api-database` retired + `api-baas` narrowed, display orders, one full
  regen round (types + matrix + schemas — the schemas gate release). Under variant B (id
  renames) add: 19 directory renames, ~105 stack values, preload keys, ~28 test/mock/factory
  files, and a user-facing id break.
- **If deferred:** the unsatisfiable Better Auth + BullMQ pair keeps shipping, and every
  wrong exclusion stands.
- **Recommendation:** adopt now. Sub-decision 1: **variant A** (category-only, zero renames —
  the same cosmetic id/category debt api-framework already carries; verification showed B was
  never forced). Sub-decision 2: sign off the conceded fences listed in
  `OWNER-DECISION-api-data-split.md` (2 old group-#26 edges, 9 baas↔db-host pairs, 4 advisory
  notes) — that page remains the detail record for this row.

## 2. web-server-state split (B1)

**Plain language:** the "server state" bucket radio-blocks REST-beside-GraphQL — which the
skills' own texts tell users to do — and blocks tRPC beside React Query, which is tRPC's own
substrate (upstream: "re-use the QueryClient… you already have").

- **Members:** `web-server-state` kept exclusive {react-query, swr}; `web-graphql-client` new
  exclusive {graphql-apollo, graphql-urql}; `web-rpc` new open {trpc}. Variant A was
  adjudicated in verification — Variant B (trpc stays in the radio) is closed, not an open
  choice.
- **Migration cost:** 3 skills-repo `category:` edits, 2 category additions, 7 stack rows
  re-keyed (`"web-server-state": trpc` → `"web-rpc"`), orders, regen incl. schemas.
- **If deferred:** 8 wrong fences stay live (mixed REST+GraphQL projects and
  tRPC-beside-react-query hard-blocked); and Phase C cannot delete
  `{graphql-apollo, graphql-urql}` until `web-graphql-client` exists.
- **Recommendation:** adopt.

## 3. web-docs (B1) — note the wave-3 interaction

**Plain language:** the two doc-site generators sit in the meta-framework radio, so a Next.js
app cannot select a VitePress docs site — but a docs site is a second app in the repo, not a
competing app framework.

- **Members:** `web-docs` new exclusive {docusaurus, vitepress}, out of `web-meta-framework`.
- **Interaction (important):** the two doc-tool `requires` deletions land in **wave 3
  regardless** of this ruling — they were wrong on separate-deployable grounds. But until this
  move lands, Next + VitePress stays blocked anyway (by the meta-framework radio), so the
  deletions alone do not complete the fix; and once the move lands, the pair is fenced only
  against each other — which is the correct steady state (one docs generator per repo).
- **Migration cost:** 2 skills-repo `category:` edits, 1 category addition, web-domain order
  renumber, regen incl. schemas. Zero stacks reference either tool (measured).
- **If deferred:** the worksheet's named scenario (Next app ships VitePress docs) stays
  blocked; Phase C cannot delete the `{docusaurus, vitepress}` conflict group until this
  category exists.
- **Recommendation:** adopt.

## 4. web-form-library split (B2)

**Plain language:** the three form libraries must stay pick-one against each other, but that
fence today lives only in two conflict groups scheduled for deletion — and the category that
holds them also holds zod, which is universal and must never sit in a pick-one bucket.

- **Members:** `web-form-library` new exclusive {react-hook-form, tanstack-form,
  vee-validate}; zod-validation stays sole member of the open `web-forms` residue
  (displayName re-cut to "Validation"; optional later id rename `web-forms` →
  `web-validation` is recorded as backlog — measured cost 10 stack keys + persisted zod
  picks — B2 M9).
- **Migration cost:** 3 skills-repo `category:` edits, 1 category addition + description
  re-cuts, regen incl. schemas, **zero stack edits** (all 10 `"web-forms"` stack keys hold
  zod, which stays). Release-notes line: persisted rhf/tanstack/vee picks under the old key
  become schema-invalid (pre-1.0, no shim).
- **If deferred:** Phase C would delete groups #20/#24 with no replacement — a React project
  could then legally select two form libraries (a real fenceless window).
- **Recommendation:** adopt, before Phase C.

## 5. web-ui-kit split (B3)

**Plain language:** one design system per app is real; kits and headless primitives compose
and must never share a radio (customizing shadcn IS writing primitive code).

- **Members:** `web-ui-kit` new exclusive {shadcn-ui, mui, chakra-ui, mantine, ant-design,
  vuetify}; `web-ui-components` kept open, re-cut to "Headless Components" {radix-ui,
  headless-ui, base-ui, tanstack-table}. The 5 new vuetify↔React-kit edges are vacuous
  (unreachable via framework requires) — coherence, not new blocking.
- **Migration cost:** 6 skills-repo `category:` edits, 1 category addition + re-cut, order
  renumber, regen incl. schemas. **Near-zero blast radius:** zero stacks, zero test literals
  (measured — B3 Contradicts §5).
- **If deferred:** no new harm today (group #14 carries the same fence), but Phase C cannot
  delete group #14 until this lands, and the Vue side gains its correct fence only after.
- **Recommendation:** adopt.

## 6. web-e2e split (B4)

**Plain language:** Playwright and Cypress are same-kind substitutes (one E2E driver per
app), but the rest of `web-testing` (vitest, RTL, VTU, visual-regression) composes and must
stay open.

- **Members:** `web-e2e` new exclusive {playwright-e2e, cypress-e2e}; `web-testing` residue
  stays open.
- **Migration cost (the biggest re-key in this set):** **15 stack rows re-key** (each
  `"web-testing": [playwright-e2e, vitest]` row splits into two keys), 2 skills-repo edits,
  1 new category id through the schema regen, order slot beside web-testing.
- **If deferred:** group #6 carries the fence until Phase C — which then must not delete it
  first.
- **Recommendation:** adopt.

## 7. sse → web-streaming (B4)

**Plain language:** WebSockets-for-chat beside SSE-for-notifications is a first-class
architecture the current radio hard-blocks — the two skills' own bodies route users to each
other. The fix is moving sse out, NOT un-radioing the category (websockets↔socket-io is a
genuine pick-one that must stay fenced).

- **Members:** `web-streaming` new open, single member {sse}; `web-realtime` stays exclusive
  {websockets, socket-io}. Single-member open categories are established practice
  (web-mocking, web-3d, web-dnd); the name's possible future collision with media streaming
  is noted, rename-later is free while zero-stacks.
- **Migration cost:** 1 skills-repo `category:` edit, 1 category addition, regen incl.
  schemas, zero stacks — the move is free.
- **If deferred:** a live wrong fence stays (LLM-token streaming beside chat blocked); the
  un-radio alternative would strand `{websockets, socket-io}` fenceless after Phase C — the
  split is the only safe shape.
- **Recommendation:** adopt.

## 8. Three exclusivity flips (B7) — api-vector-db, api-search, api-cms

**Plain language:** one vector store, one search engine, one CMS per service — the conflict
groups already say exactly this; the flips make the category say it too, so the groups can
die free at Phase C. Each group is exactly its whole category (4/4, 2/2, 3/3), nothing queued
to join.

- **Migration cost:** 3 one-line `exclusive: true` flips in `default-categories.ts`, zero
  membership edits, regen (types + matrix only — no ids change).
- **If deferred:** no new harm (groups #11-13 still fence the same pairs), but Phase C cannot
  delete them pre-flip; and B7 F1's warning stands — the two empty husk directories
  (`api-search-getxapi`, `api-search-xquik`) should be deleted in the skills repo before
  `api-search` becomes a radio, or a completed husk silently joins it unaudited.
- **Note:** payload carries NO `requires` (the verification overturn) — the api-cms radio is
  its only fence, delivered by this flip.
- **Recommendation:** adopt.

## 9. docker → infra-containers (B11 F2)

**Plain language:** the docker skill is containerization, not CI/CD, and it sits in the CI/CD
bucket while the containers bucket has one member.

- **Migration cost:** 1 skills-repo `category:` edit, `infra-containers` description re-cut
  ("Containers (Docker, Kubernetes)"), regen. Zero stacks reference docker (measured).
- **If deferred:** cosmetic mis-shelving persists; nothing fences wrongly.
- **Recommendation:** adopt at convenience (can ride any of the above).

## The Phase-C ordering ledger (consolidated)

Phase C (conflict-group deletion) must not run for a group until its category exists.
Groups whose "dies free" status is **contingent on a row above landing first**:

| conflict group                                                               | freed by                   |
| ---------------------------------------------------------------------------- | -------------------------- |
| #6 `{playwright-e2e, cypress-e2e}`                                           | row 6 (web-e2e)            |
| #14 `{shadcn-ui, mui, chakra-ui, mantine, ant-design}`                       | row 5 (web-ui-kit)         |
| #20 `{react-hook-form, tanstack-form}` + #24 `{vee-validate, tanstack-form}` | row 4 (web-form-library)   |
| `{docusaurus, vitepress}`                                                    | row 3 (web-docs)           |
| `{graphql-apollo, graphql-urql}`                                             | row 2 (web-graphql-client) |
| #11/#12/#13 (vector-db / search / cms)                                       | row 8 (the flips)          |
| #26-family (api-data groups)                                                 | row 1 (the six-way split)  |

Groups already safe regardless: #3 (client-state), #27 (i18n), `{react-query, swr}`,
`{websockets, socket-io}` (kept-exclusive incumbents), `{react-router, tanstack-router}`,
plus the wave-1/wave-2 sets already recorded in their manifests.
