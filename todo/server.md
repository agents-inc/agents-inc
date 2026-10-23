# Server — build tracker

Outstanding work on `apps/server`, the Hono API worker, and on the typed client layer in front of it.
Its sibling trackers: the configurator is [`editor.md`](./editor.md), the site is
[`www.md`](./www.md), the CLI is [`cli.md`](./cli.md), the skills marketplace is
[`skills.md`](./skills.md), and everything about deployment, naming and publishing the repository
is [`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed.

**The worker itself is built and deployed.** It grew a lot on 2026-08-29 — accounts on D1, saved
stacks, an AI compose route — so re-derive its surface rather than trusting a count here:
`grep -n 'app.openapi\|app.on(' apps/server/src/index.ts`. The app is not the work; the items below
are.

| ID                                                    | Task                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                       | Type    | Complexity |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------- | ---------- |
| SERVER-01 (was editor-todo item 3)                    | **Re-read against SERVER-04 before starting: the owner ruled 2026-08-28 that sign-in keeps the GitHub access token, and the unauthenticated 10 req/min ceiling this row exists for is exactly what a token removes.** v1 LANDED 2026-08-08 (index over 3 popular repos + dialog swap). Remaining: registry adapters (skills.sh etc.) — deferred; each lands only with hand-verification against the live registry (owner ruling) | Deferred                     | feature | complex    |
| SERVER-03 (was cli-integration "Phase 3 attribution") | Count `GET /configs/:id` split by caller; the CLI already sends its user-agent, the route is not written. Owner 2026-08-09: nice idea, DO IT — in a separate session.                                                                                                                                                                                                                                                            | Ready for Dev — next session | feature | easy       |
| SERVER-07 (new, 2026-10-23) | Each CORS pair in `index.ts` (`/x` and `/x/*`) runs twice on `/x`, so served routes answer `vary: Origin, Origin`. Harmless on the wire; a tidy. | Ready for Dev | fix | trivial |
| SERVER-08 (new, 2026-10-23) | `FIRST_HEADING_PATTERN` in `crawl.ts` has never been run under Stryker since 3bde4989 replaced the pattern. | Ready for Dev | test | trivial |
| SERVER-09 (new, 2026-10-23) | `dev.e2e.test.ts`'s "asks GitHub for nothing" can catch wrangler's agent request only when the user's wrangler cache is stale; give the spec a stale `XDG_CONFIG_HOME` of its own. | Ready for Dev | test | small |

---

## Active items

#### SERVER-01: A GitHub search proxy

**The problem.** The add-skill dialog talks to GitHub directly today, at 10 requests per minute
unauthenticated. A token cannot ship in a bundle, so the only way to raise that ceiling is to put a
proxy in front of it.

**Where it goes.** `apps/server` exists and is deployed, so the app is not the work — the route is,
behind the existing `apps/editor/src/lib/api/github-skills.ts` seam. That seam is already the single
place the editor talks to GitHub, so the client change is swapping one base URL.

This item was listed twice in the old tracker, once as item 3 and once under "Phase 7". It is one
piece of work.

---

#### SERVER-03: Count `GET /configs/:id` by caller

Phase 3 attribution, worker side: count `GET /configs/:id` split by whether the caller is the CLI.

**Nothing blocks it.** The CLI sends `agents-inc-cli` as its `User-Agent`
(`packages/cli/src/cli/lib/seed/fetch-seed.ts`), so the signal is already arriving. The worker route
is simply not written.

**Know what the number is worth before building it.** The GET is served
`cache-control: immutable, max-age=1y`, so a re-run may be answered by a proxy and never reach the
worker. The count undercounts by design — it is a floor, not a census.

### Context: the contract this route would be counting

Configs are stored server-side on a Cloudflare Worker + KV; the shareable id is ~8 characters
(nanoid). `POST /configs` validates the body against the seed schema, stores it and returns the id;
`GET /configs/:id` returns the payload. Free-tier limits (100k reads/day, 1k writes/day) are the
abuse cap; add a WAF rate rule if one is ever needed.

A self-contained encoded string was rejected: the information floor for a realistic config is ~80–120
base64 characters, over the ~50-character usability bar. **No encoded-blob fallback will be
maintained.**

The payload contract is `SeedPayload` in `packages/matrix/src/seed.ts`. **`SEED_VERSION` is 5 as of
`aebec49a` (2026-08-18) — this paragraph said v3 until 2026-08-20 and was two bumps stale.** The
schema accepts `v: SEED_VERSION` and nothing else — pre-release policy is discard-don't-migrate, so an id minted against v1 or v2
fails to decode loudly rather than being guessed at.

---


#### SERVER-07: CORS runs twice on a bare path

Found by the 2026-10-20 reasons recheck: POST `/configs` from the editor's origin answers 201 with `vary: Origin, Origin`. `allowOnlyWebOrigin` is mounted on both `/configs` and `/configs/*`, on `/skills` and `/skills/*`, and on `/stacks` and `/stacks/*`, and both mounts of a pair run on the bare path. Dropping one mount of each pair runs CORS once. A spec asserting a single `Vary` token goes red first. `index.test.ts` "grants the web origin nothing on a path it serves nothing at" pins the mount scope and stays green.

#### SERVER-08: mutation-test the crawl's heading pattern

The survival reasons recorded for the old `/^#\s+(.+)$/m` no longer describe the code (2026-10-20 reasons recheck: "not settled"). The `/^#[ \t]+(\S.*)$/m` that replaced it has six specs in `crawl.test.ts` but no measured mutants. From the root, run `bun run mutation stryker.server.config.mjs --mutate apps/server/src/crawl.ts:<the FIRST_HEADING_PATTERN line>` (see `docs/architecture.md`, "Mutation testing"). Kill each survivor with a spec, or record why it is equivalent.

#### SERVER-09: the dev spec's no-request check depends on the user's wrangler cache

Wrangler asks GitHub for cloudflare/skills when its agent detector fires and its cache is over a day old. `devEnvironment` (`e2e/helpers/local-dev.ts`) withholds the detector's variables but passes on the caller's `XDG_CONFIG_HOME`. On a machine with a fresh cache, "keeps an index younger than three days, and asks GitHub for nothing" therefore stays green whether or not a variable leaks. A 2026-10-20 run showed the check goes red under a scratch `XDG_CONFIG_HOME` aged 25 h with an agent variable let through. A stale scratch `XDG_CONFIG_HOME` of the spec's own makes the check the same on every machine. Show it red with a variable let through first. `local-dev.e2e.test.ts` (the `devEnvironment` rows) already covers today's variable list without wrangler.
