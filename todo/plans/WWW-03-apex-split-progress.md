# WWW-03 — the apex split: dispatch log and correction rate

The programme's own progress file, kept because a correction read once and discarded measures
nothing. One line per dispatch as each lane lands, plus what the brief got wrong.

**Started 2026-09-01.** The row is WWW-03 in [`www.md`](../www.md); the roadmap calls it "the one
that actually gates an audience".

## What the tree looked like when this started

- `agentsinc.sh` was a Custom Domain on `agents-inc-editor`, so every path under it returned the
  editor's `index.html` with 200 — including `/docs`, which rendered the editor's _placeholder_
  Docs screen. That is what "the docs site is not live" actually looked like from outside.
- `apps/www` was built and deployed, reachable only at `agents-inc-www.vincentbollaert.workers.dev`.
- **Nothing had deployed since 2026-08-25**, and that turned out to be unrelated to this row — see
  the REPO row filed alongside this one.

## Dispatches

| #   | Lane                                                                                                      | Owned                        | Outcome                                                                |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| 1   | Five-angle read-only sweep (runtime paths, tests, build/deploy, www, docs/comments) + completeness critic | nothing — read-only          | 295 sites, 41 blockers. Found two whole areas the tracker never named. |
| 2   | Site documentation pages                                                                                  | `apps/www/src/content/docs/` | dispatched                                                             |
| 3   | `.ai-docs` reference                                                                                      | `packages/cli/.ai-docs/`     | dispatched                                                             |

Everything else in this programme was implemented by the orchestrator directly, because the
tests-red-then-implement order is cross-cutting and does not decompose into parallel lanes.

## Corrections — what proved false

The point of this file. Each entry is something asserted confidently and then measured.

1. **"The e2e suite's 51 `page.goto` calls all break."** FALSE, and it was my own claim, stated to
   the owner as the single biggest undercount in the tracker. Vite's `baseMiddleware` 302s `/` to
   `base` **preserving the query string**, so every `goto("/?fromId=…")` survives through the
   redirect. Only **5** assertions actually broke, all `toHaveURL`. Verified by reading
   `node_modules/vite/dist/node/chunks/node.js`'s `baseMiddleware` rather than by reasoning.

2. **WWW-03's build-task list omitted `packages/cli` entirely.** `packages/cli/src/cli/consts.ts`
   carries its own `EDITOR_URL`, and `editorConfigUrl()` builds the share link from it — so
   `share`, `edit --ui` and `init --ui` would all have sent people to the landing page. Neither the
   tracker's detail section nor my own first pass had it. This is the largest single miss.

3. **`{ "pattern": "agentsinc.sh/editor*" }` is not valid wrangler config.** Three of the five sweep
   angles prescribed that object form. `wrangler/config-schema.json` defines `Route` as
   `anyOf[string, ZoneIdRoute, ZoneNameRoute, CustomDomainRoute]`, and all three object forms are
   `additionalProperties: false` with a required discriminator (`zone_id`, `zone_name`,
   `custom_domain`) — so a bare `{pattern}` matches none of them and fails validation at deploy
   time, i.e. _after_ the apex has already moved. The string form is used instead.

4. **The critic's own claim about bare `/editor` was wrong.** It reasoned from miniflare's source
   that `html_handling: "auto-trailing-slash"` serves `/editor` as a 200 at that pathname with no
   redirect. Run against the real resolver via `wrangler dev`, bare `/editor` returns **307 to
   `/editor/`**. The practical consequence is unchanged — both addresses reach the app, and the
   `/editor*` pattern is still required to catch the bare form — but the mechanism is a redirect,
   not a rewrite. Reasoning from source beat reasoning from docs; running it beat both.

5. **`check-deployable-bundle.ts` and `first-paint-budget.ts` were flagged as blockers and are
   neither.** The first walks `dist/` with `recursive: true` so it still finds the nested files; the
   second operates on the in-memory bundle, whose `fileName`s are relative to `outDir`. Both are
   no-change. Reading them was cheaper than the edit would have been.

6. **`apps/editor/src/env.ts` claims to be "the app's only reader of `import.meta.env`" and is
   not** — `lib/observability/sentry.ts` and `lib/observability/report.ts` both read it. Raised as a
   reason to avoid `import.meta.env.BASE_URL` for the share link; the convention it defended is not
   being kept, so it did not decide the spelling. `BASE_URL` is a Vite built-in rather than a
   `VITE_`-prefixed variable, so the schema that comment protects never covered it anyway.

## Hazards this work introduced, and what closes them

- **`emptyOutDir` no longer cleans what is uploaded.** Vite empties `outDir` (`dist/editor`) while
  `assets.directory` is its parent (`dist`), so anything else under `dist` ships untouched — a
  pre-split build leaves a whole stale `dist/assets/` tree behind. Closed by a `buildStart` sweep in
  `apps/editor/scripts/spa-fallback-shell.ts`. CI never saw it (fresh checkout, no `dist`); a
  developer running `bun run deploy` did.
- **The Argos visual baselines all move.** The nav rail is `sticky h-svh` and in frame for every
  capture, and its contents changed. Re-approval is owed and is not automatable here.
- **No local modality serves the apex as it will exist.** `astro dev`/`preview` serve `apps/www`
  alone; both Playwright configs serve `apps/editor` alone. So the landing page's three editor CTAs
  and the nav rail's two site links resolve only in production, and cannot be verified before the
  cutover. An acceptance pass against the real hostname is a required step, not a nicety.

## Still owed

- The dashboard move of the Custom Domain from `agents-inc-editor` to `agents-inc-www`, and the
  ordering decision that goes with it (see the note in `www.md`).
- Confirmation that `CLOUDFLARE_API_TOKEN` carries `Zone → Workers Routes → Edit`. It already fails
  on D1, so its scopes are not to be assumed.
