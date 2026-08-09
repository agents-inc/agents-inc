---
type: missing-standard
severity: medium
affected_files:
  - apps/server/src/skill-index.ts
  - apps/server/src/crawl.ts
  - apps/server/wrangler.jsonc
  - .github/workflows/build-skill-index.yml
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-08
reporting_agent: api-developer
category: architecture
domain: api
root_cause: convention-undocumented
status: resolved
resolved_by: SERVER-06 moved the crawl off the request path entirely. `.github/workflows/build-skill-index.yml` crawls every allowlisted repository in one authenticated pass and publishes the result to KV; `GET /skills` is now a single KV read. The constraint is retired by relocation rather than designed around — the open question about which Workers plan this account is on no longer has anything riding on it.
---

## What Was Wrong

SERVER-01's brief budgeted the crawl against GitHub's limits — "the tree calls are 3 of 60/hr
unauthenticated — fine", and raw.githubusercontent spends none of that allowance at all. Both true.
Neither is the binding constraint.

**A Cloudflare Worker may issue 50 subrequests while handling one request on the Workers Free plan**
(1000 on Paid). The naive shape of this feature — crawl all three allowlisted repositories on a cache
miss — costs 3 tree calls plus one `SKILL.md` fetch per skill. Measured against the live API on
2026-08-08 the three repositories hold 14 + 18 + 24 = 56 skills, so a cold build is **59
subrequests**. Over the cap, on the first request of every cold cache, for a feature whose entire
purpose is to be there when the dialog opens.

There is a second, quieter limit beside it: **six simultaneous open outbound connections** per
request. `Promise.all` over a repository's two dozen `SKILL.md` fetches sits on the wrong side of it.

What makes both worth a finding rather than a code comment is that **nothing local enforces either
one**. Miniflare does not model them — the string `subrequest` appears nowhere in the pool or in
miniflare's dist. `wrangler dev` does not model them: the route was hand-verified against real GitHub
through `wrangler dev` and filled the index correctly, and would have done so just as happily at 59
subrequests. The tests do not model them, because the tests stub `fetch`. A worker that exceeds
either limit is green in every environment a developer has and fails only at the edge.

## Fix Applied

The design was changed rather than the numbers tuned, because tuning would only move the cliff.
`apps/server/src/skill-index.ts` crawls **at most one repository per request**:

- Worst-case cost is now 2 + N for a single repository (its facts, its tree, one fetch per skill),
  not 3 + 56 for all of them.
- `MAX_SKILLS_PER_REPO = 40` caps N, so the worst request is 42 subrequests. A repository past the
  cap is **skipped whole and logged**, never truncated — half a repository in the index would
  silently claim the missing half does not exist, and this index's whole value is that what it lists
  is really there.
- SKILL.md reads go out in waves of `CONNECTION_LIMIT = 6`.

The visible cost is that a cold index fills in over successive calls. Hand-verified against real
GitHub through `wrangler dev`: 14 skills, then 32, then 56, then served from KV with no upstream
call at all. Every partial answer says so — `x-skill-index: stale` and `cache-control: no-store`
until all three repositories are present and current.

## Proposed Standard

The rule belongs wherever `apps/server`'s constraints are written down — today that is the comment
blocks in `src/index.ts` and `wrangler.jsonc`, and a row in `.ai-docs/DOCUMENTATION_MAP.md` pointing
at them:

**A route that fans out to N upstream calls must bound N by construction, and the bound must be a
named constant with the platform limit in its comment.** 50 subrequests and 6 simultaneous
connections are invisible to every local tool — vitest, miniflare and `wrangler dev` all model
neither — so a fan-out that is only bounded by "how big is the upstream today" is untested code with
a live fuse. Where the bound cannot cover the work, split the work across requests rather than
truncating it, and say so in the response.

**Open question for the owner, which this finding cannot settle:** whether `agents-inc-api` is on
the Workers Free or Paid plan. The design above holds either way and costs little on Paid, but the
answer decides whether the ceiling is 50 or 1000 — and on Paid the honest simplification is to crawl
every stale repository per request and delete the incremental fill entirely. It is also the
prerequisite for the real fix, which v1 deliberately excludes: a **scheduled rebuild** (a cron
trigger) does the crawl on its own request budget and leaves the route serving KV only.

## Resolution (2026-08-08, SERVER-06)

The scheduled rebuild landed, and it retired the constraint rather than accommodating it. The
subrequest ceiling is a property of **handling a request**, so the fix was to stop handling the crawl
in one.

- `.github/workflows/build-skill-index.yml` runs daily, crawls **every** allowlisted repository in
  one pass authenticated with the built-in `GITHUB_TOKEN`, and publishes the validated JSON to KV
  with `wrangler kv key put`. A runner has no subrequest ceiling and no six-connection limit, and it
  can hold a token, so the crawl runs on 5000 API requests an hour rather than 60.
- The pure crawl moved to `apps/server/src/crawl.ts`, which names no KV, no `Env` and no Hono. Its
  tests moved with it to `crawl.test.ts` — the same discovery and install-proof assertions, now
  calling the function directly instead of reaching it through the route.
- `apps/server/src/skill-index.ts` is one KV read. `resolveSkillIndex`, the per-repository shards,
  the freshness window that triggered rebuilds, `MAX_SKILLS_PER_REPO` and `CONNECTION_LIMIT` are all
  deleted. `GET /skills` serves the whole index or 503s; there is no partial answer to describe.
- The stored value carries **no expiry**. A build that stops running leaves the last complete index
  serving forever, and `x-skill-index: stale` — now "the daily build has missed three runs" — is
  what says so.

The one bound that survived is the wave of six concurrent `SKILL.md` reads, renamed
`CONCURRENT_READS` with its reason rewritten: it is courtesy to a host serving us a hundred files,
not a platform limit. The **proposed standard above still stands unchanged** — it is a rule about
routes, and the reason this route no longer needs it is that it no longer fans out at all.

**The open question is closed by irrelevance.** Nothing in the request path fans out any more, so
whether the ceiling would have been 50 or 1000 has nothing riding on it.
