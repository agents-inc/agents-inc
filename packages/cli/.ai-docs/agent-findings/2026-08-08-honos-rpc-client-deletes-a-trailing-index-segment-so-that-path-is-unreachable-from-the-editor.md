---
type: missing-standard
severity: high
affected_files:
  - apps/server/src/index.ts
  - apps/server/src/skill-index.test.ts
  - apps/editor/src/lib/api/configs.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-08
reporting_agent: api-developer
category: architecture
domain: api
root_cause: convention-undocumented
status: resolved
resolved_by: The route was moved from `/skills/index` to `/skills` before it shipped, and `apps/server/src/skill-index.test.ts` exercises it through `hc<AppType>` so the trap cannot reappear silently.
---

## What Was Wrong

SERVER-01 specified the new route as `GET /skills/index`. It was written that way, and every test
that reached it through `SELF.fetch` passed. The single test that reached it the way apps/editor
does — through `hc<AppType>`, the typed client — got a 404.

The cause is in Hono itself, `node_modules/hono/dist/client/utils.js`:

```js
var removeIndexString = (urlString) => {
  if (/^https?:\/\/[^\/]+?\/index(?=\?|$)/.test(urlString)) {
    return urlString.replace(/\/index(?=\?|$)/, "/");
  }
  return urlString.replace(/\/index(?=\?|$)/, "");
};
```

The RPC client builds its URL by joining the proxy's property path, then **deletes a trailing
`/index` segment**. It is a deliberate convention — `client.foo.index.$get()` is how you address the
route at `/foo` — but it means a real route whose path ends in `/index` is unreachable from the
generated client. `client.skills.index.$get()` requests `/skills`, not `/skills/index`.

Nothing catches this. The route is registered, the worker serves it, `AppType` carries it, and the
declaration emitted by `tsconfig.build.json` types it — `client.skills.index.$get()` even
**compiles**, because the type-level path and the runtime path are computed by different code. Only
a request shows the mismatch, and only from the client half.

The general shape is worse than the specific case: this is a rule about which URL paths this
worker may use at all, imposed by a library the worker does not import. `apps/server` names
`hono/cors` and `@hono/zod-openapi`; `hc` lives in apps/editor. The constraint travels between two
workspaces with nothing in either one stating it.

## Fix Applied

The route ships as `GET /skills`, which is the better path anyway — it leaves `/skills/{id}` free
and reads as a collection.

The finding is recorded because the next route is the problem, not this one. `apps/server`'s test
suite already had the mechanism that catches it: `index.test.ts` has a
`describe("the typed client the editor uses")` block that runs `hc<AppType>` against the real
worker, precisely so a route dropped out of the exported chain fails there instead of in the
editor. `skill-index.test.ts` now carries the same block for `/skills`. That block is what turned
a silent 404-in-production into a red test in ten seconds.

## Proposed Standard

Two lines, in `apps/server`'s own guidance (there is no CLAUDE.md under `apps/server`; the natural
home is a comment beside the route definitions in `src/index.ts`, where the next route will be
written, and a row in `.ai-docs/DOCUMENTATION_MAP.md` pointing at it):

1. **No route path may end in `/index`.** Hono's RPC client strips that segment, so the route is
   unreachable from apps/editor while remaining reachable from `curl` — the worst split there is.
   Nothing in the type system reports it.
2. **Every route added to the chain gets a `hc<AppType>` test.** Not as a nicety: `SELF.fetch` and
   `hc` compute their URLs by different code, so a suite that only uses `SELF.fetch` is testing a
   path the editor never requests. Both existing route groups now have one; the rule is that a
   third group without one is incomplete rather than lightly tested.
