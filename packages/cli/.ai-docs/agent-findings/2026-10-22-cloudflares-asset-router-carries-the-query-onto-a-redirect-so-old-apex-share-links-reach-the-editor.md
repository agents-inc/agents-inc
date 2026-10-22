---
type: architectural-drift
severity: low
affected_files:
  - apps/www/public/_redirects
  - apps/www/src/route-data.ts
  - apps/www/scripts/check-apex-redirect.ts
standards_docs: []
date: 2026-10-22
reporting_agent: web-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Three facts about serving `agentsinc.sh/` as a redirect to `/editor`, none written anywhere.

1. **The asset router carries the query onto the redirect.** Cloudflare's asset worker (bundled in
   miniflare under wrangler 4.118) runs `_redirects` before any asset lookup and appends the
   request's query when the destination has none. Served through `unstable_startWorker` against
   `apps/www/wrangler.jsonc` and the built `dist/`: `/?fromId=Ab3xY9_Q` → `301 /editor?fromId=Ab3xY9_Q`.
   So the `agentsinc.sh/?fromId=…` share links `todo/www.md` says land on the landing page now open
   the shared configuration in the editor.
2. **Starlight links every docs page to `/`.** The site title's `href` is `siteTitleHref`, which no
   config key sets. Before `src/route-data.ts`, `check-apex-redirect.ts` reported 41 of the 42 built
   pages (census: every `.html` under `dist/`) linking `/` — all of them that title.
3. **`unstable_startWorker` hangs under bun.** `worker.ready` resolves and the first `fetch` never
   returns (killed at 90 s); under node 23 the same script answers in about 250 ms. The www checks
   all run under `bun`, so none can drive the real router.

## Fix Applied

`/` is a `301` to `/editor` in `apps/www/public/_redirects`. `src/route-data.ts` (Starlight
`routeMiddleware`) points the site title at `EDITOR_URL`. `check-apex-redirect.ts` hand-parses
`_redirects`, as `check-webfont-delivery.ts` does `_headers`, and refuses any built page linking `/`.

## Proposed Standard

None for the standards. One tracker note for the orchestrator: the "share links already in the
wild" paragraph in `todo/www.md` no longer describes where those links land.
