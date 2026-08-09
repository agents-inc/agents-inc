---
type: architectural-drift
severity: high
affected_files:
  - apps/server/src/index.ts
  - apps/editor/src/lib/api/skill-index.ts
  - apps/editor/e2e/support/skill-index.ts
  - packages/matrix/src/skill-index.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-08
reporting_agent: web-developer
category: architecture
domain: api
root_cause: missing-rule
status: resolved
resolved_by: "Server half landed 2026-08-08: `cors()` in apps/server/src/index.ts carries `exposeHeaders: [SKILL_INDEX_FRESHNESS_HEADER]`, so `Access-Control-Expose-Headers: x-skill-index` is on every response the middleware covers and the browser hands the header to `freshnessOf`. Re-run of the finding's own curl against `wrangler dev` shows the line it recorded as absent. Pinned by a new case in apps/server/src/skill-index.test.ts, `lets a browser read the freshness header it sets`, which was red before the option and green after — the only assertion in either workspace that observes the CORS config, since Playwright's `route.fulfill` replaces the worker and cannot see it. The editor half was already in place and is unchanged: `freshnessOf` still answers `unknown` for a header it cannot read, and `stubSkillIndexHidingFreshness` was kept as a regression guard rather than deleted, because that branch is still reachable through a stripping proxy or a withdrawn `exposeHeaders`. The comments in apps/editor/src/lib/api/skill-index.ts, apps/editor/e2e/support/skill-index.ts and apps/editor/e2e/specs/add-skill.spec.ts that asserted the header never arrives were rewritten; they were the only place the old behaviour was still claimed as current."
---

## What Was Wrong

`GET /skills` answers with `x-skill-index: fresh | stale`, and
`packages/matrix/src/skill-index.ts` names the header precisely because "a header three packages
have to agree about is a contract like any other". The worker sets it on every index response. The
editor cannot read it.

A custom response header is not exposed to a cross-origin caller unless the server also names it in
`Access-Control-Expose-Headers`. `apps/server` registers `cors({ origin: ... })` and nothing else;
`hono/cors` defaults `exposeHeaders` to `[]` and only emits the header when that array is non-empty:

```js
if (opts.exposeHeaders?.length) {
  set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
}
```

Verified against the running worker rather than inferred. `wrangler dev` on 8787, called with the
browser's own origin:

```
$ curl -sD - -o /dev/null -H "Origin: http://localhost:5173" http://localhost:8787/skills
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Cache-Control: public, max-age=20007
x-skill-index: fresh
```

No `Access-Control-Expose-Headers`. The body arrives; `response.headers.get("x-skill-index")`
returns `null`. Confirmed a second way in Chromium: the same Playwright `route.fulfill` stub passes
the editor's freshness assertion with `access-control-expose-headers` set and fails without it.

This is the same shape as
`2026-08-08-honos-rpc-client-deletes-a-trailing-index-segment-so-that-path-is-unreachable-from-the-editor.md`
— a sibling of it rather than a replacement, since that defect is fixed — and worse in one respect.
That one was a rule about which _paths_ the worker may use, imposed by a library the worker does not
import. This is a rule about which _headers_ the worker may usefully set, imposed by the browser —
and it is invisible from both ends. `apps/server`'s own suite reaches the route through
`SELF.fetch` and `hc<AppType>`, neither of which is a browser, so both read the header and both stay
green. `@workspace/api-mocks` serves it through MSW in Node, where there is no CORS, so the editor's
unit test reads it too. Every mechanical check agrees the contract works. Only a real browser
disagrees, and only in production.

## Fix Applied

The editor half, which is what this task's scope covered.

`freshnessOf` in `apps/editor/src/lib/api/skill-index.ts` returns three values, not two:

```ts
export type IndexFreshness = SkillIndexFreshness | "unknown";
```

Both `stale` and `unknown` mean "ask again next time the dialog opens", so the refetch behaviour is
the same. Only one of them is a statement the dialog may repeat to a user: the add-skills dialog
shows "index still filling" on an explicit `stale` and says nothing on `unknown`. Folding the two
together — the obvious first implementation — would have put a permanent, false "still filling"
caveat under every complete list, because today every browser read lands on `unknown`.

`apps/editor/e2e/support/skill-index.ts` carries the divergence in the open. Its two freshness stubs
add `Access-Control-Expose-Headers`, because what they mock is the contract; a third,
`stubSkillIndexHidingFreshness`, reproduces what the deployed worker actually delivers, and the spec
using it asserts that the caveat stays hidden and the index is asked for again. So no test in that
file can go green on a transport capability the worker lacks without another test in the same file
saying so.

The server half landed on 2026-08-08, as one option on one call:

```ts
cors({ origin: ..., exposeHeaders: [SKILL_INDEX_FRESHNESS_HEADER] })
```

Nothing in the editor changed with it, which is what the editor half was for. `fresh` arrives,
`settled` becomes true, and the dialog stops re-asking for an index it already holds. The same curl
against `wrangler dev` now returns the line whose absence is recorded above:

```
Access-Control-Expose-Headers: x-skill-index
```

One assertion guards it — `lets a browser read the freshness header it sets`, in
`apps/server/src/skill-index.test.ts`. It has to live in that workspace: the editor's stubs are
`route.fulfill`, which answers in place of the worker and so cannot observe the worker's own CORS
config no matter what it asserts. The Playwright stub that withholds the header keeps its job
regardless, since what it guards is the editor's behaviour rather than the worker's configuration —
and a stripping proxy reaches that branch with the worker configured correctly.

## Proposed Standard

Beside the two rules the sibling finding proposed for `apps/server/src/index.ts` (no route path ends
in `/index`; every route in the chain gets an `hc<AppType>` test), a third:

3. **A response header the editor reads must be named in `exposeHeaders`.** `hono/cors` exposes
   nothing by default, so a custom header is set, sent, and dropped by the browser with no error
   anywhere. Neither `SELF.fetch` nor `hc<AppType>` nor MSW is a browser, so no test in either
   workspace can catch it — the only mechanism that does is a Playwright stub that declines to
   expose the header, which is why one now exists.

The general rule the three cases share is worth stating once in `.ai-docs/DOCUMENTATION_MAP.md`
beside the pointer to the worker: **the editor's transport imposes constraints on the worker that
neither workspace's type system or test suite can see.** Two have been found the hard way — a path
segment Hono's client deletes, and a header the browser hides. A third will not announce itself
either.
