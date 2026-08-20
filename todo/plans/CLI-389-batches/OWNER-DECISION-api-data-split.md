# Owner decision — the api-data category split (CLI-389 B6, wave-1 verified 2026-08-07)

One structure to ratify, two sub-decisions to make. Everything here survived adversarial
verification (`verify-B6.md`); detail lives in `B6-api-data.md`. Nothing below is applied yet —
this whole page waits on you.

## The split, in plain language

Today all 22 database-and-backend skills sit in two big pick-one buckets (`api-database`,
`api-baas`), so choosing any one blocks all the others: picking Postgres blocks Redis, picking
Drizzle blocks Neon — combinations that are the _normal_ way to build a backend. Of the 137
pairwise "you can't have both" claims the current buckets make, only 29 are right. The fix is
six smaller pick-one categories, each fencing only genuine either/or choices:

| category                                   | members                                   | why pick-one                                                                                              |
| ------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `api-sql-engine` (SQL Engine)              | postgresql, mysql, cockroachdb            | one primary SQL engine per service                                                                        |
| `api-orm` (ORM / Query Builder)            | drizzle, prisma, sequelize, typeorm, knex | one data-access layer; ORM coexistence is a migration window, not a steady state                          |
| `api-document` (Document / Multi-Model DB) | mongodb, mongoose, edgedb, surrealdb      | one primary non-SQL store; mongodb/mongoose are near-duplicate skills (F1), so fencing them is right      |
| `api-kv` (Cache / KV Store)                | redis, upstash, vercel-kv                 | one Redis-class provider (vercel-kv IS Upstash under the hood)                                            |
| `api-db-host` (Managed Database)           | neon, planetscale, turso, vercel-postgres | one managed-database host; the radio steers off the discontinued vercel-postgres toward Neon              |
| `api-baas` (kept, purified)                | supabase, firebase, appwrite              | one full backend-as-a-service platform; the three managed DBs currently in here are not BaaS and move out |

Zero new `requires` rules — the entire fix is taxonomy. Every candidate binding (including the
brief's `mongoose → requires mongodb`) was examined and rejected with reasons.

## What users gain

**97 flatly wrong exclusions disappear.** Cache-beside-database (redis + postgres), ORM-beside-
host (drizzle + neon — the drizzle skill's own title), and polyglot persistence (postgres +
mongo) all become selectable; they are blocked today. 29 correct fences are kept exactly, and 2
new correct ones are added (planetscale↔vercel-postgres, turso↔vercel-postgres — never fenced
today). Verification recomputed all the arithmetic from scratch and confirmed it.

## Sub-decision 1 — skill ids: rename or leave alone?

Skill ids (e.g. `api-database-drizzle`) do NOT have to change when categories change — the id
and the category are separate fields, and the catalog already ships divergences: all the
`api-framework-*` skills sit in the `api-api` category, `web-mocks-msw` sits in `web-mocking`.
So there are two honest options:

- **A — category-only (zero renames).** 19 one-line `category:` edits in the skills repo.
  No directory renames, no test-literal edits, no stack-value edits, no breakage in users'
  installed `config.ts` files. Ids like `api-database-drizzle` keep pointing at a category that
  no longer exists by that name — the same cosmetic debt api-framework already carries.
- **B — hygiene rename (19 of 22 ids).** Ids realign with their categories
  (`api-database-drizzle` → `api-orm-drizzle`). Costs: 19 directory renames, ~105 stack value
  edits, preload keys, roughly 28 test/mock/factory files, and a release-noted break for every
  installed project (pre-1.0, no shims).

Most of the migration cost exists only under B. The batch originally presented B as forced;
verification showed that was wrong. Both are sound — A is cheap now, B avoids compounding the
naming drift. **Your call.**

## Sub-decision 2 — the conceded fences (D-306 residue)

Eleven "you can't have both" claims are knowingly given up, and four advisory notes ride along
— sign off (or veto individual lines):

- **2 old group-#26 edges**: neon↔cockroachdb, vercel-postgres↔cockroachdb (dubious fences —
  "one host" and "one engine" are separate claims).
- **9 baas↔db-host pairs** ({supabase, firebase, appwrite} × {neon, planetscale, turso}).
  Worst cases: supabase↔neon and supabase↔planetscale — two Postgres hosts in one project.
  Re-fencing them would require merging categories, which would wrongly block real combos like
  Firebase Auth + Neon.
- **Advisory notes** (fences kept or never present, reality messier): redis↔upstash (one
  Upstash database legitimately driven by both clients), firebase↔supabase (Supabase
  officially supports Firebase Auth), turso as edge-replica secondary, prisma-on-Mongo
  overlapping mongoose.

## What apply touches

Under either variant: category definitions (`default-categories.ts` — 4 new categories,
`api-database` retired, `api-baas` narrowed), display orders, ~112 stack category keys, one
regeneration round (`generate:types` + `generate:matrix` + `generate:schemas` — the JSON
schemas gate the release), 19 skills-repo `category:` edits, docs re-checks. Only under the
rename variant: directory renames, stack values (98 drizzle + 7 prisma), preload keys, the
test/mock/factory sweep, and the user-facing id break. Editor/server/www need nothing beyond a
rebuild (verified clean). Also queued for the apply phase, separate from this decision: whether
to retire the two discontinued-product skills (vercel-kv, vercel-postgres — F2).

## Urgency update (2026-08-07, post-wave-2)

The split is no longer only about wrong advice: **Better Auth + BullMQ is now unsatisfiable in
the built-in matrix** — better-auth requires drizzle and bullmq requires redis-or-upstash, and
satisfying both needs two picks in the one exclusive `api-database` radio. Verified directly by
the wave-2 apply. The six-category split resolves it (drizzle lands in the ORM radio, redis in
KV).
