---
type: anti-pattern
severity: low
affected_files:
  - apps/server/src/index.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: api-developer
category: architecture
domain: api
root_cause: convention-undocumented
status: partial
partial_note: >-
  The worker now mounts CORS once per path (SERVER-07), and the Vary table in
  `apps/server/src/index.test.ts` plus the `/skills` spec in `skill-index.test.ts` redden on a
  second mount. The proposed sentence in `editor-and-worker.md` is unwritten.
---

## What Was Wrong

`apps/server/src/index.ts` mounted `allowOnlyWebOrigin` (one `hono/cors` instance) on both `/configs`
and `/configs/*`, `/skills` and `/skills/*`, and `/stacks` and `/stacks/*`. In Hono a `/x/*` pattern
matches the bare `/x` as well, so both mounts of a pair ran on the bare path, and each CORS run
appends `Origin` to `Vary`. POST `/configs`, GET and POST `/stacks`, and GET `/skills` from the
editor's origin answered `vary: Origin, Origin`. That meant the same as `Origin` to a cache, so
nothing broke. It showed that the mounts were written as though `/x/*` did not cover `/x`.

The tester's probe against the repository's hono (`hono-mount-probe` in the SERVER-07 evidence)
settles which mount covers what. `["/configs/*", "/configs"]` gave `Origin, Origin` on POST
`/configs`. `["/configs/*"]` alone gave `Origin` on both POST `/configs` and GET `/configs/x`.
`["/configs"]` alone gave GET `/configs/x` no CORS at all. So the bare mount is the redundant one
wherever sub-paths are served, and the wildcard is the redundant one where none are.

Census, over the whole monorepo:
`grep -rnE '\.use\("/' --include='*.ts' --include='*.tsx' apps packages | grep -v node_modules`.
The only path-mounted middleware is in `apps/server/src/index.ts`, and the three CORS pairs were
the only doubled mounts. The `/configs` rate-limit and size checks are mounted once, on the bare
path, because only POST `/configs` carries a body.

## Fix Applied

The redundant half of each pair is gone: `/configs/*` and `/stacks/*` stay, because both serve
`/{id}` sub-paths, and `/skills` stays, because nothing is served under `/skills/`. The kept
`/skills` mount also leaves an unserved `/skills/x` without CORS, which
`grants the web origin nothing on a path it serves nothing at` already holds for `/`. A comment
above the mounts states the rule.

Guard: `names the origin once in Vary on the web app's $method to $path` in
`apps/server/src/index.test.ts` covers every route the worker serves to the editor, and
`GET /skills > names the origin once in Vary` in `skill-index.test.ts` covers `/skills`. All four
that were red against the doubled mounts are green after the fix. A route added later is covered
only if it is added to that table. No honest check covers every route without listing them.

## Proposed Standard

In `standards/editor-and-worker.md`, beside "A response header the editor reads must be named in
`exposeHeaders`", add one sentence: mount a middleware once per path, because Hono's `/x/*` also
matches `/x`. Use `/x/*` where sub-paths are served and `/x` where none are, never both. The Vary
table in `index.test.ts` is the guard, and a new route the editor calls joins it. This does not
conflict with anything in either `CLAUDE.md`.
