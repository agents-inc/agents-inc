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

The payload contract is `SeedPayload` in `packages/matrix/src/seed.ts` (`grep -n SEED_VERSION` there for the
current version). The schema accepts `v: SEED_VERSION` and nothing else — pre-release policy is
discard-don't-migrate. An older id today reaches the user as "HTTP 500 … Stored config is unreadable"; CLI-1005
makes it a refusal saying to share it again.

---


#### SERVER-08: mutation-test the crawl's heading pattern

The survival reasons recorded for the old `/^#\s+(.+)$/m` no longer describe the code (2026-10-20 reasons recheck: "not settled"). The `/^#[ \t]+(\S.*)$/m` that replaced it has six specs in `crawl.test.ts` but no measured mutants. From the root, run `bun run mutation stryker.server.config.mjs --mutate apps/server/src/crawl.ts:<the FIRST_HEADING_PATTERN line>` (see `docs/architecture.md`, "Mutation testing"). Kill each survivor with a spec, or record why it is equivalent.

