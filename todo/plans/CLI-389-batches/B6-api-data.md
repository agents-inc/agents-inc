# B6 — api data (22 skills), researched 2026-08-07 — carries the fan-out's BLOCKER — wave-1 verified 2026-08-07, amendments applied

Scope: worksheet §B6, §2c group #26, §4; relationship-coverage decisions 2 and 3. Skill bodies
read at `/home/vince/dev/skills/src/skills/api-database-*` and `api-baas-*`; current rules
verified in `packages/cli/src/cli/lib/configuration/default-rules.ts` (six conflict groups touch
this batch — `{drizzle, prisma, sequelize, typeorm, knex}` at 39-42, `{mongodb, mongoose}` at
47-50, `{supabase, firebase, appwrite}` at 91-94, `{redis, upstash, vercel-kv}` at 99-102,
`{postgresql, mysql}` at 107-110, `{neon, vercel-postgres, cockroachdb}` at 111-114 — and
**zero `requires` rules for any of the 22**; the only inbound binding is
`better-auth-drizzle-hono requires [drizzle]` at 414-418, slug-based, unaffected by any category
move). Categories verified in `default-categories.ts` (`api-database` at 251-259: displayName
"Database ORM", `exclusive: true`, order 2; `api-baas` at 341-349: `exclusive: true`, order 8)
and the generated matrix. Product claims verified by web search 2026-08-07 (Vercel storage
sunsets, PlanetScale Postgres, Drizzle Gel dialect, Prisma↔Drizzle coexistence).

**Headline: the blocker resolves as a pure category restructure — six exclusive categories
replace two, and ZERO `requires` bindings are needed.** Today `api-database` + `api-baas` +
group #26 fence 137 skill pairs; only 29 of those fences are right. The proposed set keeps
those 29, adds 2 correct fences the current tree misses, and removes **108 wrong or dropped
pairwise exclusions** (**97 flatly wrong, 11 knowingly conceded** — group #26's two edges plus
the 9 baas↔db-host pairs; arithmetic corrected per verify-B6 6.1, full CLI-740 residue list in
the group-#26 disposition below). Every candidate `requires` binding was examined and rejected, including the brief's
own `mongoose → requires mongodb` (the mongodb _skill_ turns out to be a Mongoose skill —
see finding F1).

## The split — proposed category set

All six `exclusive: true`, `required: false`, domain `api`. Orders shown are a suggestion
(slot the four database categories where `api-database`'s order 2 sits today; the api domain's
later orders renumber — migration surface M3).

| id                          | displayName                     | members (slugs)                           | replaces                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-sql-engine`            | SQL Engine                      | postgresql, mysql, cockroachdb            | conflict group `{postgresql, mysql}` + the cockroach third of group #26                                                                                                                                                                                                    |
| `api-orm`                   | ORM / Query Builder             | drizzle, prisma, sequelize, typeorm, knex | conflict group `{drizzle, prisma, sequelize, typeorm, knex}` — this is the category `api-database` was _conceived_ as (its displayName is literally "Database ORM", description "Database access layer (Drizzle, Prisma)"); the other 11 members were dumped into it later |
| `api-document`              | Document / Multi-Model Database | mongodb, mongoose, edgedb, surrealdb      | conflict group `{mongodb, mongoose}`; edgedb + surrealdb stop being unfenced orphans                                                                                                                                                                                       |
| `api-kv`                    | Cache / KV Store                | redis, upstash, vercel-kv                 | conflict group `{redis, upstash, vercel-kv}`                                                                                                                                                                                                                               |
| `api-db-host`               | Managed Database                | neon, planetscale, turso, vercel-postgres | the neon↔vercel-postgres edge of group #26; the managed-DB half of `api-baas`; matches the existing `alternatives` purpose group "Managed Database" (default-rules.ts:714-717) minus cockroachdb                                                                           |
| `api-baas` (kept, purified) | Backend as a Service            | supabase, firebase, appwrite              | conflict group `{supabase, firebase, appwrite}` (wholly inside — dies free)                                                                                                                                                                                                |

### Why each radio is right (coexistence tested against reality)

- **`api-orm` — one data-access layer per service. Radio right.** Drizzle+Prisma coexistence
  is real but is explicitly a _migration-window_ pattern, not a steady state: Drizzle ships an
  official Prisma extension "for teams migrating incrementally … delete Prisma when the last
  call is gone" ([drizzle Prisma extension / migration guides](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-drizzle),
  [migration write-ups](https://medium.com/drizzle-stories/how-i-migrated-from-prisma-to-drizzleorm-with-absolutely-no-hassle-and-zero-downtime-9f5f0881fc04)).
  A skill picker models the steady state.
- **knex belongs in this radio even though it is a query builder, not an ORM.** Within the
  catalog, choosing Knex _is_ choosing your data-access layer — none of the four ORMs here is
  built on it (the knex-based ORMs, Bookshelf and MikroORM ≤v6, are not in the catalog), so
  there is no in-catalog composition to protect. The displayName "ORM / Query Builder" carries
  the nuance; the current conflict-group reason ("SQL ORMs and query builders are mutually
  exclusive") already made the same call.
- **`api-sql-engine` — one primary SQL engine per service. Radio right.** Matches the existing
  `{postgresql, mysql}` group. CockroachDB joins as an engine, not a host: it is
  self-hostable, speaks the Postgres wire protocol via the standard `pg` driver, and its skill
  is about engine semantics (mandatory `40001` transaction retries, online DDL, `AS OF SYSTEM
TIME`) — skill body confirms. Postgres+Cockroach in one service is the same rarity class as
  Postgres+MySQL.
- **`api-document` — one primary non-SQL database. Radio right, name slightly loose.**
  mongodb↔mongoose exclusivity survives (correctly — see F1, they are near-duplicates, not
  driver-vs-ODM). Mongo+SurrealDB or Mongo+Gel in one service is rare. Gel (EdgeDB) is
  graph-relational on Postgres, not a document store — the displayName "Document / Multi-Model
  Database" absorbs it; an `api-nosql` name was rejected (Gel IS relational underneath).
  Crucially, the split _un-fences_ the polyglot-persistence pairs the old radio wrongly
  blocked: postgres+mongo, mysql+redis, drizzle+mongoose (Postgres via Drizzle beside Mongo via
  Mongoose is a normal polyglot backend).
- **`api-kv` — one Redis-class provider. Radio right, all three are the same kind.** redis =
  ioredis/node-redis over TCP; upstash = the same Redis API over REST for edge runtimes;
  vercel-kv = literally Upstash under the hood — the skill body already teaches
  `@upstash/redis` as "the successor to `@vercel/kv`", and Vercel auto-migrated every KV store
  to Upstash Redis in December 2024
  ([Upstash joins the Vercel Marketplace](https://vercel.com/changelog/upstash-joins-the-vercel-marketplace),
  [Redis on Vercel](https://vercel.com/docs/redis)). One caveat the radio knowingly
  over-fences (verify-B6 1.4): one _provider_ does not mean one _client_. The upstash skill
  body's own critical-requirements block directs users to ioredis over TCP for Pub/Sub,
  blocking commands, and Lua ("use ioredis with a TCP connection instead"), and Upstash
  exposes a standard TCP endpoint alongside REST
  (https://upstash.com/docs/redis/howto/connect-client) — so one Upstash database driven by
  `@upstash/redis` on edge routes plus ioredis on workers is a real steady state that
  legitimately wants both skills. The radio stays (it is one provider, the redis skill's
  ioredis patterns apply verbatim to the Upstash TCP endpoint, and the current tree fences the
  pair anyway), but redis↔upstash is recorded in the CLI-740 residue as
  dual-client-one-provider.
  The split's big win: redis stops radio-excluding postgres, drizzle, and mongo — cache beside
  any database is the _normal_ architecture, and today's category forbids it.
  Note: the open `api-caching` category (member: strategies) is adjacent but distinct —
  patterns vs providers; both compose, no merge.
- **`api-db-host` — one primary managed-database host. Radio right, one soft edge.** neon
  (managed Postgres), planetscale (managed MySQL — _and Postgres since GA on 2025-09-22_,
  [PlanetScale for Postgres GA](https://planetscale.com/changelog/postgres-ga)), turso (edge
  SQLite/libSQL), vercel-postgres (deprecated wrapper over Neon — its own skill body says
  "deprecated (Dec 2024) — use `@neondatabase/serverless` directly", and Vercel discontinued
  the product with auto-migration to Neon; first-party sources put the transition at Q4
  2024–Q1 2025:
  [Neon transition guide](https://neon.com/docs/guides/vercel-postgres-transition-guide),
  [Vercel docs](https://vercel.com/docs/postgres)).
  These are mutually substitutable hosts; PlanetScale-now-does-Postgres makes "Managed
  _Database_" (not "Managed Postgres") the right frame. Soft edge: turso as an edge-replica
  _secondary_ beside a primary Postgres host is a real minority pattern — accepted
  over-restriction, noted for CLI-740.
- **`api-baas` (purified) — one BaaS per project. Radio right for the three that are actually
  BaaS.** supabase/firebase/appwrite each own auth+database+storage+functions; two _full_ BaaS
  stacks in one project is architecturally incoherent. One documented exception the radio
  knowingly over-fences (verify-B6 1.6 corrected the original "anti-pattern edge case only"
  claim): Supabase **officially supports** Firebase Auth as a first-class third-party auth
  provider (https://supabase.com/docs/guides/auth/third-party/firebase-auth,
  https://supabase.com/blog/third-party-auth-mfa-phone-send-hooks), so
  Firebase-Auth-plus-Supabase-everything-else is a supported, documented steady state whose
  user plausibly selects both skills — recorded as firebase↔supabase in the CLI-740 residue; the
  radio stays (the mixed pattern uses Firebase for one slice, not two full stacks). But
  neon/planetscale/turso are NOT BaaS — no
  auth, no storage, no functions; they are managed databases, and their skills say so. Their
  presence in `api-baas` is the same dumping error as `api-database`'s, and it is what made
  group #26 look unrecoverable.

### Cross-category coexistence now allowed (previously radio-blocked, all real)

- drizzle + neon: the drizzle skill body itself is titled "Drizzle ORM + Neon" — the catalog's
  own content pairs an `api-orm` member with an `api-db-host` member.
- drizzle + turso, prisma + planetscale, mysql + planetscale (mysql2 speaks to Vitess),
  postgresql + neon (pg works against Neon in session mode): all standard pairings.
- edgedb + drizzle: Drizzle shipped a native Gel dialect in 0.40.0
  ([release](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.40.0),
  [gel docs](https://orm.drizzle.team/docs/get-started/gel-existing)) — the graph-relational
  oddball composes with an ORM, which is why it must NOT share a radio with the ORMs. (Nuance,
  verify-B6 2.8: Drizzle's Gel support is drizzle-kit _pull-only_ — no generate/migrate/push
  against Gel. Does not change the verdict.)
- postgres + redis, any-engine + any-KV: the architecture default the old radio forbade.

### Replacing `requires` bindings: NONE — every candidate examined and rejected

| candidate                                                            | verdict               | why                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| mongoose → requires [mongodb] (the brief's example)                  | **REJECTED**          | The mongodb skill IS a Mongoose skill (finding F1): frontmatter "MongoDB with Mongoose ODM", body teaches Mongoose middleware/lean()/sessions — near-identical to the mongoose skill. Requiring it would force selecting a duplicate. Siblings in the `api-document` radio instead.  |
| drizzle/prisma/sequelize/typeorm/knex → needsAny [postgresql, mysql] | REJECTED              | The engine can come from an `api-db-host` skill (drizzle+neon, drizzle+turso, prisma+planetscale) or from outside the catalog entirely (SQLite, MariaDB, MSSQL — sequelize and knex list them; prisma also targets Mongo and CockroachDB). The binding would block canonical stacks. |
| cockroachdb → requires [postgresql]                                  | REJECTED              | It rides the pg driver, but the two are siblings in the exclusive `api-sql-engine` — a requires into one's own radio is the contradiction the plan's consistency gate exists to catch. The skill is self-contained on connection anyway.                                             |
| neon → [postgresql], planetscale → [mysql], turso → (sqlite)         | REJECTED              | Each ships its own serverless driver (`@neondatabase/serverless`, `@planetscale/database`, `@libsql/client`); none needs the raw-driver skill, and no sqlite skill exists.                                                                                                           |
| vercel-kv → requires [upstash]                                       | REJECTED              | Product lineage, not a skill dependency — the skill already teaches `@upstash/redis` standalone. Same-kind sibling in `api-kv`.                                                                                                                                                      |
| vercel-kv / vercel-postgres → requires [vercel] (infra-platform)     | DEFERRED, not adopted | Product-true (only provisionable on Vercel) but both products are discontinued (Dec 2024 / Jun 2025) and the better disposition is retirement (F2). If kept, revisit; recorded for CLI-740, not bound now.                                                                           |

Zero adopted — with the 22 as _subjects_. One inbound binding from outside the batch surfaced
in verification (verify-B6 4.5) and is handed to B5, or it falls between batches — see F4.

**Handoff to B5 (owner of api-queue-bullmq):** `api-queue-bullmq` hard-depends on a TCP Redis
connection — the redis skill body itself carries BullMQ-specific config
(`maxRetriesPerRequest: null`). Post-decision-2, `bullmq → requires needsAny [redis, upstash]`
(or `[redis]` alone — BullMQ needs TCP, though Upstash's TCP endpoint makes the two-member form
defensible) is the only surviving mechanism that can express it. Neither batch currently owns
the rule; **B5 must adopt it.**

Zero adopted for the 22. The blocker's whole fix is taxonomy; the fine-grained radios do all
the fencing the old conflict groups did, without a single new declaration.

## Manifest rows

Batch id `api-data`, audited `2026-08-07`. All 22 skills are framework-agnostic backend skills:
**class A, `frameworks: []`, derived-requires none, across the board** — and all 22 land in an
exclusive category under the split, so every verdict is
`constrained-via-exclusivity-or-requires`. (No skill in this batch is a class-B/C case; the
"most are framework-agnostic backends" prior held 22/22.)

| skill (current id)                             | new category     | verdict                                 | class | frameworks | derived-requires                       | sources                                                                                                                                                                                                                                                    | notes                                                                                                                                                                     |
| ---------------------------------------------- | ---------------- | --------------------------------------- | ----- | ---------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| postgresql (api-database-postgresql)           | api-sql-engine   | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (pg v8: Pool, $1 params, LISTEN/NOTIFY); https://node-postgres.com                                                                                                                                                                              | Driver-level engine skill.                                                                                                                                                |
| mysql (api-database-mysql)                     | api-sql-engine   | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (mysql2: prepared statements, streaming); https://sidorares.github.io/node-mysql2/                                                                                                                                                              | Driver-level engine skill. mysql2 also speaks to PlanetScale/Vitess — cross-category pairing allowed.                                                                     |
| cockroachdb (api-database-cockroachdb)         | api-sql-engine   | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (pg wire protocol, mandatory 40001 retries, online DDL); https://www.cockroachlabs.com/docs/                                                                                                                                                    | Engine, not a host (self-hostable + Cockroach Cloud). Leaves group #26 — see disposition.                                                                                 |
| drizzle (api-database-drizzle)                 | api-orm          | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (titled "Drizzle ORM + Neon"); https://orm.drizzle.team; Gel dialect: https://github.com/drizzle-team/drizzle-orm/releases/tag/0.40.0                                                                                                           | Targets pg/mysql/sqlite/gel + neon/turso/planetscale drivers — why no engine binding.                                                                                     |
| prisma (api-database-prisma)                   | api-orm          | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body; https://www.prisma.io/docs (supports Postgres, MySQL, SQLite, MongoDB, CockroachDB)                                                                                                                                                            | Prisma-on-Mongo makes it a mongoose alternative in that mode — cross-radio, deliberately unfenced (advisory over-permissiveness; noted CLI-740).                          |
| sequelize (api-database-sequelize)             | api-orm          | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (v6 Model.init, v7 alpha; pg/mysql/mariadb/sqlite/mssql); https://sequelize.org                                                                                                                                                                 |                                                                                                                                                                           |
| typeorm (api-database-typeorm)                 | api-orm          | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (decorators, Data Mapper); https://typeorm.io                                                                                                                                                                                                   |                                                                                                                                                                           |
| knex (api-database-knex)                       | api-orm          | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (v3 query/schema builder, pg/mysql/sqlite/mssql); https://knexjs.org                                                                                                                                                                            | Query builder, not ORM — same radio regardless (see rationale).                                                                                                           |
| mongodb (api-database-mongodb)                 | api-document     | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body — which teaches _Mongoose_, not the raw driver                                                                                                                                                                                                  | **F1: near-duplicate of the mongoose skill.** Radio vs mongoose stays; content defect goes to the skills repo.                                                            |
| mongoose (api-database-mongoose)               | api-document     | constrained-via-exclusivity-or-requires | A     | []         | none (NOT requires [mongodb] — see F1) | skill body (Mongoose 9: async hooks, no next()); https://mongoosejs.com                                                                                                                                                                                    |                                                                                                                                                                           |
| edgedb (api-database-edgedb)                   | api-document     | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body ("Gel (formerly EdgeDB)", rebrand Feb 2025, built on Postgres); https://www.geldata.com; Drizzle composition: https://orm.drizzle.team/docs/get-started/gel-existing                                                                            | Placement pragmatic — graph-relational, not document; displayName covers it. gel+postgresql stays selectable cross-category (unusual, harmless under advisory semantics). |
| surrealdb (api-database-surrealdb)             | api-document     | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (SurrealQL, RELATE, live queries, SDK v2); https://surrealdb.com/docs                                                                                                                                                                           | Multi-model — the category's other namesake.                                                                                                                              |
| redis (api-database-redis)                     | api-kv           | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (ioredis v5 primary, node-redis for Stack modules); https://redis.io/docs                                                                                                                                                                       | Splitting KV out un-blocks cache-beside-database, the batch's most-wrong current fence.                                                                                   |
| upstash (api-database-upstash)                 | api-kv           | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (@upstash/redis REST, QStash, @upstash/ratelimit); https://upstash.com/docs                                                                                                                                                                     | Same Redis API over REST — same-kind sibling of redis, radio correct.                                                                                                     |
| vercel-kv (api-database-vercel-kv)             | api-kv           | constrained-via-exclusivity-or-requires | A     | []         | none (vercel binding deferred — F2)    | skill body (already teaches @upstash/redis as successor); https://vercel.com/changelog/upstash-joins-the-vercel-marketplace                                                                                                                                | **Deprecated product** (auto-migrated to Upstash, Dec 2024). Retirement candidate — F2.                                                                                   |
| vercel-postgres (api-database-vercel-postgres) | api-db-host      | constrained-via-exclusivity-or-requires | A     | []         | none (vercel binding deferred — F2)    | skill body ("deprecated (Dec 2024) — use @neondatabase/serverless"); Vercel discontinued the product, auto-migrating to Neon (transition Q4 2024–Q1 2025): https://neon.com/docs/guides/vercel-postgres-transition-guide; https://vercel.com/docs/postgres | **Deprecated product**, thin wrapper over Neon. Radio vs neon is load-bearing (steers new picks to Neon). Retirement candidate — F2.                                      |
| supabase (api-baas-supabase)                   | api-baas (stays) | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (typed client, RLS, edge functions); https://supabase.com/docs                                                                                                                                                                                  | True BaaS.                                                                                                                                                                |
| firebase (api-baas-firebase)                   | api-baas (stays) | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (modular SDK, Firestore, Admin SDK); https://firebase.google.com/docs                                                                                                                                                                           | True BaaS. Web SDK is framework-agnostic — class A, no binding.                                                                                                           |
| appwrite (api-baas-appwrite)                   | api-baas (stays) | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (TablesDB, node-appwrite server SDK); https://appwrite.io/docs                                                                                                                                                                                  | True BaaS.                                                                                                                                                                |
| neon (api-baas-neon)                           | api-db-host      | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (@neondatabase/serverless, branching, scale-to-zero); https://neon.tech/docs                                                                                                                                                                    | NOT a BaaS (no auth/storage/functions) — the worksheet's "sits with supabase … for good reason" does not survive inspection.                                              |
| planetscale (api-baas-planetscale)             | api-db-host      | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (@planetscale/database, deploy requests, Vitess); Postgres GA 2025-09-22: https://planetscale.com/changelog/postgres-ga                                                                                                                         | Skill body is MySQL-era — needs a Postgres-support refresh (skills-repo note, F3).                                                                                        |
| turso (api-baas-turso)                         | api-db-host      | constrained-via-exclusivity-or-requires | A     | []         | none                                   | skill body (@libsql/client, embedded replicas, batch()); https://docs.turso.tech                                                                                                                                                                           | The category's soft edge (edge-replica secondary pattern) — noted CLI-740.                                                                                                |

## Group #26 disposition — accepted-loss OVERTURNED: mostly recovered

Old group: `{neon, vercel-postgres, cockroachdb}` (default-rules.ts:111-114), the worksheet's
"known accepted loss to CLI-740" because neon lived in `api-baas` while the other two lived in
`api-database`. Under the new set:

- **neon ↔ vercel-postgres: RECOVERED** — both in `api-db-host`. This is the load-bearing edge:
  vercel-postgres is a deprecated wrapper over Neon, and the radio steers new selections to
  Neon.
- **cockroachdb ↔ postgresql / mysql: RECOVERED (upgraded, even)** — cockroach joins the
  engine radio, a fence the old group never stated but the big category accidentally provided.
- **neon ↔ cockroachdb and vercel-postgres ↔ cockroachdb: CONCEDED (2 edges)** — a managed
  Postgres host and a different distributed engine now coexist unfenced. But this fence was
  dubious anyway: "one managed host" and "one engine" are separate claims, and a
  Neon-primary + Cockroach-analytics polyglot is no less coherent than postgres+mongo, which we
  now deliberately allow. Residue recorded for CLI-740 as two edges, not a group.

Net: group #26 goes from "no non-violent restructure recovers the fence" to one edge recovered
exactly, two edges upgraded into a better fence, two conceded edges of questionable validity.
Also removed knowingly: the 9 baas↔db-host cross pairs from the old `api-baas` radio. Under
decision 2's advisory, exclusivity-only model these are acceptable over-permissiveness — but
the CLI-740 record must cover the full 3×4 block, not one pair (verify-B6 2.10): the named worst
cases are supabase↔neon _and_ supabase↔planetscale, both two-Postgres-hosts pairs now that
PlanetScale does Postgres. A category merge that would keep these fences was examined and
rejected — it would wrongly block real combos like firebase↔neon (Firebase Auth + Neon
Postgres).

### CLI-740 residue — the full list (verify-B6 change 2)

The 11 knowingly conceded exclusions (fences removed despite arguable validity):

- the 2 group-#26 edges: neon↔cockroachdb, vercel-postgres↔cockroachdb;
- the 9 baas↔db-host pairs — {supabase, firebase, appwrite} × {neon, planetscale, turso},
  recorded as a block, worst cases named above.

Advisory notes riding along (fences NOT removed, or never present, but the reality is messier
than a radio can say):

- redis↔upstash (kept fence, real coexistence): dual-client-one-provider — `@upstash/redis` on
  edge routes + ioredis over Upstash's TCP endpoint on workers, endorsed by the upstash skill
  body itself;
- firebase↔supabase (kept fence, real coexistence): Supabase's official third-party Firebase
  Auth support makes the mixed pattern a supported steady state;
- turso as edge-replica secondary beside a primary Postgres host (kept fence, accepted
  over-restriction);
- prisma-on-Mongo ↔ mongoose (no fence, accepted over-permissiveness): Prisma in Mongo mode
  overlaps Mongoose as a full Mongo data layer; the dominant polyglot reading is legitimate.

## Findings

- **F1 — the mongodb skill is a Mongoose skill.** `api-database-mongodb`'s frontmatter is
  "MongoDB with Mongoose ODM"; its body (middleware-before-model(), `{ session }`, `.lean()`,
  `127.0.0.1`) is near-identical to `api-database-mongoose`'s. The conflict-group reason "Raw
  MongoDB driver and Mongoose ODM are alternative approaches" is factually wrong about the
  content — there is no raw-driver skill. The _exclusivity_ is nonetheless right (they are
  overlapping teachings of the same stack; pick one), which is why the disposition is
  same-radio siblings, not the brief's requires binding. Skills-repo fix (out of scope here):
  rewrite mongodb to teach the raw `mongodb` driver, or retire one of the pair.
- **F2 — two members are skills for discontinued products.** Vercel KV (migrated to Upstash
  Dec 2024) and Vercel Postgres (discontinued, migrated to Neon — transition ran Q4 2024–Q1
  2025 per the Neon transition guide). Both skill bodies
  already point at the successors. Keep-with-radio works today (the radio steers to the
  successor); retirement is the cleaner end state. Decision for the apply phase, not this
  batch.
- **F3 — planetscale's skill body predates PlanetScale for Postgres** (GA 2025-09-22). Content
  refresh note for the skills repo; does not change placement or fencing.
- **F4 — cross-batch handoff: the bullmq inbound binding is unowned** (verify-B6 4.5).
  `api-queue-bullmq` (B5's scope) hard-depends on a TCP Redis connection; post-decision-2,
  `bullmq → requires needsAny [redis, upstash]` (or `[redis]` alone) is the only mechanism left
  to express it. Not a defect in this batch's zero-for-these-22 claim (bullmq is outside the
  22), but no batch owned the rule until now — handed to B5, see the handoff note above.

## Contradicts-the-worksheet

1. **The brief's `mongoose → requires mongodb` example is wrong** — content-level inspection
   (F1) shows the target is a duplicate, not a dependency. Sibling radio instead.
2. **The worksheet's 4-category proposal (`api-sql-engine`/`api-orm`/`api-kv`/`api-document`)
   is necessary but not sufficient** — it leaves vercel-postgres homeless and `api-baas` still
   mixed. The 6-category set (adding `api-db-host`, purifying `api-baas`) is what actually
   dissolves group #26.
3. **Group #26's "accepted loss" is overturned** — see disposition above; the loss shrinks to
   two dubious edges.
4. **"neon sits with supabase/firebase/appwrite/planetscale/turso for good reason" (worksheet
   §2c) is false** — neon/planetscale/turso lack auth/storage/functions; they are managed
   databases, and the existing `alternatives` group "Managed Database" already groups them
   with vercel-postgres. The BaaS radio is right only for the three real BaaS platforms.
5. **Zero requires bindings come out of this batch** — the worksheet's framing ("the missing
   `requires` bindings" as the fan-out's product) predicts some here; the correct number is
   none. The fix is finer radios, not bindings.
6. Scale correction: the current fences over these 22 skills assert 137 pairwise exclusions;
   only 29 are correct. The proposal lands on 31 (29 kept + 2 new:
   planetscale↔vercel-postgres, turso↔vercel-postgres — never fenced today).

## Migration surfaces (named, NOT fixed here)

**Correction from verification (verify-B6 5.1): the original premise — "category moves rename
ids" — is false.** Skill ids come from SKILL.md frontmatter `name:`, not from the category; the
id and the `category:` field are decoupled, by live precedent in the current catalog: all five
`api-framework-*` skills (hono, express, fastify, nestjs) carry `category: api-api` while
keeping their `api-framework-*` ids/directories, and `web-mocks-msw` carries
`category: web-mocking`. A category move therefore requires only the metadata `category:` edit;
**the 19 id renames are a separable, optional hygiene decision for the owner, not a consequence
of the split.** Two live variants (see `OWNER-DECISION-api-data-split.md`):

- **Variant 1 — category-only, zero id renames.** New category ids; 19 `metadata.yaml`
  `category:` edits; no directory renames, no id changes. Carries none of M1's directory
  renames, M4's value edits, M6's preload-key edits, M7's skill-id test literals, or M9's
  user-config breakage. Precedent: the api-framework/api-api and web-mocks/web-mocking
  divergences already shipped and stayed.
- **Variant 2 — clean rename, 19 of 22 ids.** All 16 api-database-* plus
  api-baas-{neon,planetscale,turso} rename; supabase/firebase/appwrite keep theirs. Ids stay
  aligned with categories at the cost of every rename-only surface below.

A middle variant — keep the id `api-database` for the ORM category (5 ids survive, 14 rename) —
was considered and rejected: a category literally named "database" that _excludes_ databases is
the naming smell that caused this mess. Between 1 and 2 this batch no longer picks — the repo
is visibly ambivalent (the api-framework divergence shipped), so the owner chooses. Slug-based
rules (`requires`, `alternatives`, the dying conflict groups) survive both variants untouched —
including the one inbound binding `better-auth-drizzle-hono requires [drizzle]`. Surfaces below
are tagged **[both]** (applies under either variant) or **[rename-only]** (exists only under
Variant 2).

- **M1 — skills repo** (`/home/vince/dev/skills/src/skills/`): 19 `metadata.yaml` `category:`
  edits **[both]**; 19 directory renames + SKILL.md frontmatter `name:` fields
  **[rename-only]**. Also in the skills repo (verify-B6 5.6):
  `meta-config-stack-detect/examples/core.md` references the ids **[rename-only]**.
- **M2 — category definitions**: `packages/cli/src/cli/lib/configuration/default-categories.ts`
  — 4 new categories, `api-database` deleted/renamed, `api-baas` description narrowed.
- **M3 — orders**: api-domain display orders renumber around the four new slots (api-auth is
  currently order 3, api-specs runs to 19).
- **M4 — stacks**: `packages/cli/src/cli/lib/configuration/default-stacks.ts` — **105
  `"api-database"` category keys and 7 `"api-baas"` keys** **[both]**, plus the skill-id values
  under them: **98 × `api-database-drizzle` and 7 × `api-database-prisma`** (the 7 ×
  `api-baas-supabase` values survive either way) **[rename-only]**. (Corrected per verify-B6
  5.2 — the original "every occurrence is `api-database-drizzle`" was wrong.)
- **M5 — generated artifacts** **[both]**: `packages/cli/src/cli/types/generated/matrix.ts` and
  `source-types.ts` (slug→id map holds all 22), the vendored
  `packages/matrix/src/vendor/generated/matrix.ts` **and the vendored `source-types.ts`
  beside it**, plus — **release-gate blocking** (verify-B6 5.3) —
  `packages/cli/src/schemas/metadata.schema.json`, which enumerates category ids and is
  generated by `generate:schemas` (`scripts/generate-json-schemas.ts`); `prepublishOnly` runs
  `generate:schemas:check`, so omitting that regeneration fails the release. One
  `generate:types` + `generate:matrix` + `generate:schemas` round. `project-config.schema.json`
  enumerates the same ids but is **hand-maintained** — no `SCHEMA_ENTRIES` row emits it, so its
  enum is a hand edit in the same slice and no gate reports it stale.
- **M6 — matrix package hand-written**:
  `packages/matrix/src/read-model/preload-defaults.ts` (all 22 ids as literal keys —
  `PRELOAD_DEFAULTS` keys are typed `SkillId` literals, so under Variant 2 all 19 renamed keys
  must be edited; under Variant 1 the file survives untouched) and
  `packages/matrix/src/contract/selection-scenarios.ts` (PRISMA / DRIZZLE / SEQUELIZE id
  constants) **[rename-only]**; plus (verify-B6 5.4)
  `packages/matrix/src/read-model/preload-defaults.test.ts` and
  `assignment-defaults.test.ts`, which both carry the ids.
- **M7 — CLI tests** (expanded per verify-B6 5.5 — the original list undercounted roughly 2×):
  skill-id literals **[rename-only]** in `config-types-writer.test.ts` (asserts
  `"api-database-drizzle"`), `marketplace-generator.test.ts`, `resolver.test.ts`,
  `schemas.test.ts`, `skill-plugin-compiler.test.ts`, `skill-copier.test.ts`,
  `source-manager.test.ts`, `config-generator.test.ts`, `config-writer.test.ts`,
  `source-loader.test.ts`, `stacks-loader.test.ts`, `build-step-logic.test.ts`,
  `step-build.test.tsx`, `__tests__/commands/build/marketplace.test.ts`,
  `__tests__/commands/new/skill.test.ts`, `init-end-to-end.integration.test.ts`,
  `user-journeys.integration.test.ts`, `skill-resolution.integration.test.ts`,
  `copy-local-skills.test.ts`, `e2e/commands/new-skill.e2e.test.ts`; plus the shared test-data
  layer the CLAUDE.md factory rules make load-bearing: `test-fixtures.ts`, `mock-skills.ts`,
  `mock-matrices.ts`, `mock-stacks.ts`, `mock-categories.ts`, `matrix-factories.ts`,
  `skill-factories.ts`, `stack-factories.ts` (category-id references in these bite **[both]**;
  skill-id references only under Variant 2).
- **M8 — rules editorial**: the `alternatives` purpose groups stay valid (slug-based) but
  "Managed Database" listing cockroachdb beside the hosts deserves an editorial re-cut; the
  six conflict groups die with decision 2's Phase C regardless.
- **M9 — user-facing** **[rename-only]**: installed projects' `config.ts` files carry old
  skill ids; pre-1.0 no-compat policy applies, but the break should be release-noted. Under
  Variant 1 there is no id-level user breakage.
- **M10 — docs** (expanded per verify-B6 5.6): `docs/cli/features/proposed/skill-consume.md`
  references api-database ids; `.ai-docs/DOCUMENTATION_MAP.md` and `docs/web/editor-spec.md`
  to be re-checked at apply time; plus `.ai-docs/reference/features/configuration.md`,
  `.ai-docs/reference/testing/mock-data.md`, `.ai-docs/reference/types/core-types.md`,
  `.ai-docs/standards/typescript-types-bible.md`, and the shipped agent playbooks
  `src/agents/meta/agent-summoner/playbook.md` and `src/agents/meta/skill-summoner/playbook.md`
  (example ids like `api-database-drizzle` go stale).
- **M11 — editor / server / www: verified clean** (verify-B6 5.7): zero literal
  `api-database`/`api-baas` references in `apps/editor/src`, `apps/server/src`, `apps/www/src`
  (only hit is a built bundle under `apps/editor/dist`). The editor reads the vendored
  `@repo/matrix` artifacts, so M5's regeneration plus an editor rebuild covers it.
