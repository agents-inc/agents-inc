# Server — build tracker

Outstanding work on `apps/server`, the Hono API worker, and on the typed client layer in front of it.
Its sibling trackers: the configurator is [`editor.md`](./editor.md), the site is
[`www.md`](./www.md), the CLI is [`cli.md`](./cli.md), and everything about deployment, naming and
publishing the repository is [`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed.

**The worker itself is built and deployed** — it serves the shared-config store and the Sentry
tunnel, and `api.agentsinc.sh/configs/:id` has been live since 0.149.0. The app is not the work;
the three items below are.

| ID                                                    | Task                                                                                                     | Status        | Type    | Complexity |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------- | ------- | ---------- |
| SERVER-01 (was editor-todo item 3)                    | GitHub search proxy behind the existing `lib/api/github-skills.ts` seam                                  | Ready for Dev | feature | complex    |
| SERVER-02 (was editor-todo "Phase 7")                 | `packages/api` + `packages/api-mocks` — a typed client and MSW handlers                                  | Investigate   | feature | complex    |
| SERVER-03 (was cli-integration "Phase 3 attribution") | Count `GET /configs/:id` split by caller; the CLI already sends its user-agent, the route is not written | Ready for Dev | feature | easy       |

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

#### SERVER-02: `packages/api` + `packages/api-mocks`

A typed client package and a matching MSW handler package, so the editor's calls to the worker are
generated rather than hand-written and the tests have one place to mock them.

Filed under the old tracker's "Phase 7 — backend, only if the deferred features land", which is why
this is `Investigate`: it is worth doing when there is more than one route to type, and today there
are two. SERVER-01 and SERVER-03 both add surface, so this gets more valuable as they land, not less.

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

The payload contract is `SeedPayload` v3 in `packages/matrix/src/seed.ts`. The schema accepts `v: 3`
and nothing else — pre-release policy is discard-don't-migrate, so an id minted against v1 or v2
fails to decode loudly rather than being guessed at.
