# Site — build tracker

Outstanding work on `apps/www`, the Astro build that serves the landing page at `/` and the
Starlight documentation at `/docs`. Its sibling trackers: the configurator is
[`editor.md`](./editor.md), the API worker is [`server.md`](./server.md), the CLI is
[`cli.md`](./cli.md), the skills marketplace is [`skills.md`](./skills.md), and everything about
deploying this site, naming it and publishing the repository is [`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed — `apps/www/astro.config.ts:41` and
`apps/www/src/pages/index.astro:55` both cite "item 10 of `docs/web/editor-todo.md`" in a comment,
and that citation has to stay traceable to WWW-03.

**WWW-01 to WWW-06 are one row per source item, in source order. WWW-07 and WWW-08 are two further
pieces of the docs-site item** that are distinct enough to be picked up on their own.

**The site builds cleanly with no warnings and every navigation link resolves.** Nothing below
blocks a commit. What blocks a _deploy_ is in [`repo.md`](./repo.md), not here.

| ID                               | Task                                                                                    | Status           | Type    | Complexity |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------- | ------- | ---------- |
| WWW-01 (was editor-todo item 8)  | Docs site: 5 of 10 sidebar sections, reference is per-group, config fields undocumented | Ready for Dev    | feature | complex    |
| WWW-02 (was editor-todo item 9)  | Landing page: 5 of 12 blocks, and the catalogue teaser centrepiece is not one of them   | Ready for Dev    | feature | complex    |
| WWW-03 (was editor-todo item 10) | Apex path split — vite `base`, router `basepath`, SPA fallback, dead routes             | Ready for Dev    | feature | complex    |
| WWW-06 (was editor-todo item 14) | Two video slots are empty and a third is missing; you supply the recordings             | Needs Assistance | feature | easy       |

---

## Active items

#### WWW-01: The docs site is five of ten sections

**What exists.** `apps/www` is an Astro 7.1.6 project with Starlight 0.41.6. One build serves the
landing page at `/` and the documentation at `/docs`; the editor stays its own Vite build. Twenty
pages build, eighteen of them documentation. `prefetch: false` and `disable404Route: true` are set.

**Still to do.**

- **The sidebar is five sections, not ten.** Start here, Concepts, Guides, Reference and Resources
  exist. **Recipes**, **Configuration**, **Releases** and **Troubleshooting** do not. What stands in
  for Releases is a single external link labelled "Changelog" inside the Resources group, pointing at
  the repository's GitHub releases page — a link, not the planned section — and there is no
  troubleshooting page at all beyond two lines about `doctor`.
- **The reference is still one page per group, not one page per command**, and **nothing anywhere
  documents the `.claude-src/config.ts` fields exhaustively.** The second is the single largest gap
  in the whole site.
- **No page shows what a compiled sub-agent actually looks like.** Every page describes the compile
  step; none shows its output. For a tool whose entire pitch is "we generate this for you", one real
  excerpt of `.claude/agents/web-developer.md` is the most convincing thing available, and it is
  nowhere on the site.
- **The voice splits.** `why.md`, `quickstart.md`, `cli-or-web.md` and `concepts/stacks.md` were
  written for this site. The migrated guides read as lifted from an older README — title-case
  headings, imperative bullets, no links back into the narrative.

**Ownership settled, duplicates gone (2026-08-06, repo.md REPO-14).** The site's copies are now the
only copies: the ten originals under `docs/cli/` were deleted, `docs/cli/` keeps contributor
material only, editor material lives in `docs/web/`, and cross-cutting documents get `docs/repo/`.
The four source-file defects this section used to list died with that: the index documenting a
removed command was rewritten, the skills-explorer plan moved to `docs/web/` under a historical
header naming the drift, and the CLI README now says 222 skills across 9 domains and lists all 23
sub-agents. The CLI README's doc links point at the site's source files on GitHub — **flip them to
`agentsinc.sh/docs/...` when WWW-03 lands**, and note the links in the ALREADY-PUBLISHED 0.152.0 npm
page broke when the originals were deleted; the next publish heals them.

### Constraints already settled — do not undo these

**Six of these were added 2026-08-21 by the WWW-07 type pass.** They are listed first because they
are the newest and therefore the easiest to reverse by accident.

- **The site renders at the design's native 100% root, not the editor's 110%.** `packages/ui`'s
  `globals.css` sets `font-size: 110%` on `:root` and calls it "THE SIZING KNOB"; every rem on this
  site inherited it, which is why Starlight's own `2.1875rem` — annotated "35px" in its source —
  rendered at 38.5. Starlight's whole rem geometry and the design tokens' px annotations both assume
  16px. **Do not "restore" 110% for consistency with the editor — the editor is the zoomed one.**
- **One prose scale, defined once, consumed by both halves.** It lives site-local in
  `src/styles/site.css` as a `@theme` block, with Starlight's `--sl-text-*` mapped onto the same
  tokens. **Do not add prose sizes to `packages/ui`** — that pushes them into the editor, which has no
  prose — and do not give either half its own.
- **Starlight's responsive heading step-up at `min-width: 50em` is deliberately dropped.** One size
  per role at every width. Do not restore the media query.
- **Code blocks are frameless with an ink-ramp syntax theme.** Do not restore the terminal frame: its
  three dots are painted with `mask-image`, so the unlayered radius rule genuinely cannot reach them,
  and its tokens were a stock `#3b61b0` that exists nowhere in the palette. The frame and the syntax
  colours are TWO independent mechanisms (the frames plugin and the theme) and need two fixes, not one.
- **`minSyntaxHighlightingColorContrast: 0`.** Expressive Code defaults to 5.5 and was silently
  rewriting `#a06a1c` to `#8a5b18` in the built HTML — **the owner's contrast ruling being overridden
  by a tool with nobody's name on the edit.** This is the setting that stops it.
- **A section heading on the landing page is Inter, not mono.** Rule 3 reserves mono for labels, ids
  and badges; every actual label on the page is still mono.

**A build gotcha, recorded because it cost a wrong conclusion:** Expressive Code caches its rendered
output and a stale cache survives an ordinary rebuild. An edit that appears to do nothing needs
`rm -rf dist .astro node_modules/.astro` before you believe it.

These are the decisions taken while the site was built. Each one cost more than it looks like it
should have, and each is easy to reverse by accident.

- **WCAG AA color contrast is deliberately not met, and stays that way (owner ruling, 2026-08-07).**
  The amber accent pair measures 3.97:1 and the dimmed incompatible cell 2.4:1; both are the design
  as intended for this personal project. axe's `color-contrast` rule is permanently held out of the
  packages/ui story gate (`packages/ui/.storybook/preview.ts`) — every structural a11y check still
  gates. Do not "fix" the palette for contrast.

- **One theme, light. The theme toggle was removed.** The design system declares a dark variant but
  ships no dark colours for it, so a toggle would have switched into Starlight's own blue-grey theme
  — one half of the site looking like a different product. A missing switch reads as deliberate; a
  switch that leads somewhere unstyled reads as broken. Forcing it took two changes rather than one:
  Starlight's page component hardcodes `dark` and is not in its list of overridable components, and
  several things read that attribute rather than the colour variables — most visibly which theme
  paints code blocks. So a one-line script sets the attribute, and the colour mapping is written
  outside all cascade layers so it wins whatever the attribute says. (Designing the dark palette is
  [`editor.md`](./editor.md) EDITOR-07.)
- **The colours were mapped by hand, not with `@astrojs/starlight-tailwind`.** That package maps
  Starlight onto Tailwind's `--color-gray-*` and `--color-accent-*` scales, and this design system
  has neither — its greys are a named warm ramp and its accent is a single `--color-brand`. Using it
  would pull Tailwind's stock cool greys back in, which is the opposite of the point. Eighteen values
  are mapped by lightness rather than by name, because in light mode Starlight inverts its own
  naming. Three extra were needed: Starlight derives its hairlines from the same grey that backs
  inline-code, so those had to be pulled apart or every inline code span turned beige while the rules
  stayed invisible.
- **No React.** `@astrojs/react` is not installed. What this site needs from the design system is its
  colour tokens, which are plain CSS, and a React component with no hydration directive would ship
  zero JavaScript anyway. Against that, adding React here means another React consumer for no gain.
  **This argument used to be stronger than it is now**: when it was written the repository ran two
  React majors side by side and carried two `paths` workarounds to hold them apart, so a third
  consumer meant picking a side. That split was unified on 2026-08-05 and both workarounds are gone.
  What is left is the plain point that this site has no use for React. If a page ever needs a genuinely
  live component, this is the decision to revisit — the repository now runs a single React, so the
  cost of adding one is lower than it was. It is also one of the two triggers that make
  Fumadocs win instead, below.
- **Radius is killed with one unlayered rule.** Every Starlight rule sits inside a `starlight.*`
  cascade layer, so a single `*, *::before, *::after { border-radius: 0 }` written outside all layers
  beats all seventeen of them regardless of specificity, and keeps beating them if Starlight moves
  them. The cost, stated honestly in the code: unlayered also beats Tailwind's own utilities, so
  `rounded-full` loses to it too. That is the design system's first rule working, not a regression,
  but it is why that block is kept as small as possible.
- **Two migrated pages were cut back rather than published as they arrived.**
  `reference/commands.md` lost three audit sections — "TODOs (per command)", "Known gaps / audit
  items" and the "AI-docs drift log" — and four contributor TODO blocks. `guides/agent-reminders.md`
  was dropped from the site altogether, because six of its eight rules are about this repository
  rather than about the reader's own project; the original stays at
  `docs/cli/guides/agent-reminders.md` for contributors. The reason was never that the `.ai-docs/`
  paths those sections linked to were broken — they resolve. It is that the material is written for
  somebody working _on_ this project rather than somebody trying to use it. No sidebar edit was
  needed either way: the Guides group is autogenerated from the directory.

### When Fumadocs wins instead

Kept because it is the escape hatch, and one of its two triggers just got closer.

**Trigger one: the site does not read as one product.** That was the stated exit condition, and
WWW-07 is a real instance of it. It looks fixable, so this is not the moment to take the exit — but
if it turns out not to be, this is what to do. **Trigger two: the documentation needs to be
interactive.** In Fumadocs a page is React all the way down, so a live stateful component in a doc is
ordinary React; in Starlight it needs an explicit hydration directive and an MDX import, and sharing
state across several gets awkward.

**The plan if it happens**, kept because it was verified. Fumadocs in "UI + swapped slots" mode: keep
its layout machinery — loader, page tree, search, TOC, MDX components — and override the three
visible slots (sidebar, header, TOC) with components built from `packages/ui`. Every peer dependency
is optional — verified in `peerDependenciesMeta` — so no Next.js is installed;
`fumadocs-core/framework/tanstack` imports only `Link`, `useParams`, `useRouter` and `useRouterState`
from `@tanstack/react-router` (the repo is on ^1.170.18), and `fumadocs-mdx` ships a Vite plugin with
a `vite: 7||8` peer. Client-side search (`orama-static` / `flexsearch-static`) needs no server, which
is what the script-less assets Worker requires. Note the price, unchanged: a second build, a second
Cloudflare route and a second base-path setup — exactly what WWW-03 records `/editor` paying.

**Ruled out, worth not revisiting.** Docusaurus (webpack/Rspack + Infima + not-Tailwind, fights the
monorepo on three axes, and `packages/ui` ships raw `.tsx` so it needs a custom webpack
babel-include just to import a button) · VitePress and Docus (Vue — `packages/ui` unusable) · Nextra
(no stable release since 4.6.1 in Dec 2025 while its competitor ships weekly) · MkDocs Material (EOL
2026-11-05) · Mintlify and GitBook (own design language, recurring cost, outside the Turborepo —
steal their llms.txt idea, not the platform).

### The one open decision here

Whether any `.ai-docs` material goes public: **the recommendation is no.** It is written for a
different reader, publishing 400,000 words would bury the user-facing guides, and `agent-findings/`
is a live defect list that must never ship as pages. Some of it went out anyway, through a migrated
page rather than a choice, and has since been taken back out.

**Two mentions of `.ai-docs` on the site are legitimate and should stay.**
`guides/using-codex-keeper.md` names `.ai-docs/` as a directory the sub-agent creates in the
**reader's own** project — remove it and the page describes nothing. `reference/architecture.md`
links to `.ai-docs/DOCUMENTATION_MAP.md` as further reading. Neither is a leak. Whether the
repository should publish `.ai-docs/` at all is a separate question and lives in
[`repo.md`](./repo.md) REPO-15.

---

#### WWW-02: The landing page is five of twelve blocks

**What is there.** `apps/www/src/pages/index.astro`, seven blocks: nav (mark, wordmark, and Docs /
Skills / GitHub) · hero (an eyebrow reading `MIT · v0.149.0 · 222 skills`, a headline naming the
pain, the problem stated in two paragraphs, the `npx agents-inc init` copy component and a secondary
"Build a stack →") · the approach · two front doors · the empty recording slot · free and open
source · footer.

Every number on it is verified rather than typed. The version and the licence are read out of
`packages/cli/package.json` at build time, so they cannot go stale; 222 was counted in the generated
catalogue. Every class is lifted from a component that already exists rather than invented.

**What the plan asked for and did not get.** Of the twelve blocks below, five are built. Missing: the
**catalogue teaser** — the centrepiece, and the section that distinguishes the product · the stats
strip · three pillars · one proof block · how it works · author your own · the final CTA · a GitHub
star count in the nav. The free-and-open-source block exists but is only two repository links: no
contributor avatars, no star or sponsor CTA, which is the job it is actually meant to do.

**Minimum first ship**, matching what four respected sites actually run: nav → hero → what-it-is →
catalogue teaser → free/community → footer. What shipped is that list **with the catalogue teaser
missing**, so the page does not yet meet its own minimum bar.

**Three judgement calls made while building it, and none should be undone casually.** The
copy-command is a `div` with a script-added button role rather than a `<button>`, because browsers
make button text unselectable — if the script failed, the one command on the page could not be copied
at all; the cost is that the page ships one inline script where the placeholder had none. The page
carries exactly one breakpoint, where `apps/editor` deliberately has none, because a landing page is
the one surface that has to survive a phone. And "Build a stack →" points at the absolute
`https://agentsinc.sh`, where the editor lives today, rather than at `/editor` — which this build
serves nothing at, so a shipped page cannot link to it. The button works; it becomes `/editor` when
WWW-03 lands.

**Two accessibility defects on this page.**

- `aria-live` on the copy-command note makes a screen reader announce "click to copy" at page load,
  because the script fills the empty element after paint.
- **Where the design system fights the page**, reported and not fixed because the fix belongs in
  `packages/ui`: the decorative `$` in the command block sits at 3.64:1 contrast (it is hidden from
  screen readers, and the value is copied verbatim from the shared `CommandBlock`), and the hairline
  borders are 1.44–1.64:1 against the page, below the 3:1 that a UI boundary wants.

### The research the missing blocks still need

None of it has been used yet, and none of it is superseded by what was built.

Nothing is deployed, so the live site still drops a first-time visitor straight into a 222-skill grid
with no explanation — the single most common failure mode in this category, and the problem this item
exists to fix. The live cautionary case is a direct competitor, `aitmpl.com`: it claims "1000+
components", shows a nav bar and a stack builder reading "0 components", and a stranger cannot tell
what it installs or why.

**Closest analogue to study: `ui.shadcn.com`** — a CLI plus a registry of installable things, with a
"Build Your Own" CTA into a configurator that returns a preset id, which is exactly this product's
shape. It now carries no install command in the hero; the configurator is the hook. Also instructive,
and all under six sections: `sst.dev`, `create.t3.gg`, `turborepo.dev`, `mise.jdx.dev`, `opencode.ai`.

**Section order** (from 24 sites fetched 2026-08-02): nav with GitHub star count · hero · stats
strip · what-it-is paragraph · three pillars · one proof block · catalogue teaser · how it works ·
author your own · free-and-open-source · final CTA · footer.

**Catalogue teaser** is the centrepiece: 12–30 skills maximum, tabbed by domain, with a count and a
link to the editor. Never the whole catalogue.

**The free-and-open-source block** sits exactly where a commercial site puts pricing and does the
same job: an explicit "this is free" sentence, contributor avatars, a star or sponsor CTA.

**On `evilmartians/devtool-template` (LaunchKit)**: keep the block sequence and the copy guidance,
rebuild in React with `packages/ui`. Drop Pricing, Licenses, Careers, Sign In and Sign Up — nothing
to sell, nothing to sign into. Its CSS is a market-standard soft look that would fight the
square/hairline/mono language.

**Anti-patterns to hold the build against.** No explanation before the product · a slogan with no
literal subhead beneath it · an install command that is not the first command you would actually
run, or is not copyable · two identical CTAs · animated stat counters with no static fallback
(`warp.dev` currently serves "0K Active Developers") · round numbers, which read as invented where
`turborepo`'s "9,001,168 hours of compute saved" reads as measured · undated or unsourced
benchmarks · dumping the whole catalogue on the page.

---

#### WWW-03: Domains and the app split — the build half

**The decision is made; what is left is build configuration.** Decided 2026-08-03 — paths, not
subdomains. One hostname:

| URL                   | Serves                             |
| --------------------- | ---------------------------------- |
| `agentsinc.sh/`       | landing page                       |
| `agentsinc.sh/docs`   | documentation                      |
| `agentsinc.sh/editor` | the editor (today's `apps/editor`) |
| `api.agentsinc.sh`    | `apps/server`, unchanged           |

**Why paths.** One hostname keeps search authority consolidated instead of splitting it across three
subdomains, and it is what the comparable developer tools do — `tailwindcss.com/docs`, `bun.sh/docs`,
`nextjs.org/docs`. The apex also keeps serving the same origin it always has.

**The blocker this used to claim is false.** It read: "a Cloudflare Custom Domain binds the whole
hostname, so two Workers cannot split paths on `agentsinc.sh`". Half of that is right — a Custom
Domain does bind a whole hostname. But a **Route** on a path coexists with a Custom Domain on the
same hostname and takes precedence, and Cloudflare documents that exact combination: its Custom
Domains page carries a section titled "Interaction with Routes", and its Routes page states from the
other side that routes "can `fetch()` Custom Domains and take precedence if configured on the same
hostname". Between two overlapping routes the more specific pattern wins. Verified against
Cloudflare's primary documentation rather than inferred, because the claim it replaces was
confidently wrong.

So the arrangement is: `agentsinc.sh` stays a Custom Domain owned by the Astro build (landing +
docs), catching everything unclaimed, and `agentsinc.sh/editor*` is a Route to the editor build. A
small router worker fronting both via service bindings is a second, fully in-repo option; which of
the two to take is unsettled. Neither needs a new DNS record — routes require a proxied record on the
hostname and the existing Custom Domain already created one; the dummy `AAAA 100::` trick only
applies to hostnames with no record at all. Cost is unchanged either way: billing is per Worker
_script invocation_, and every one of these is assets-only with no `main`, so no script runs and the
requests stay free.

**Write the pattern as `agentsinc.sh/editor*`, not `/editor/*`.** Cloudflare's own Known Issues page
documents that `/editor/*` does not match `/editor` itself. Cheap to get wrong, expensive to find.

### Status: nothing started. The repository is untouched.

Confirmed 2026-08-06 — `apps/editor/wrangler.jsonc` still holds `agentsinc.sh` as a Custom Domain,
`vite.config.ts` has no `base`, the router has no `basepath`, and the site is reachable only at
`agents-inc-www.<account>.workers.dev`, which nothing links to. A partial landing is worse than
none: **CI deploys on every push to main**, so a half-applied cutover ships itself.

**The order that works, and why.** The dashboard move and the repository change are not independent.
Deploying the editor with a Route but no Custom Domain, while the site has not claimed the apex,
leaves `agentsinc.sh` bound to nothing. Claiming the apex for the site while the editor still serves
from the origin root breaks every editor asset. So:

1. **Repository first, in one commit, unpushed** — the five build tasks below plus both wrangler
   configs (editor: Route `agentsinc.sh/editor*`; site: Custom Domain `agentsinc.sh`).
2. **Then the dashboard**, moving the Custom Domain from the editor's Worker to the site's. Adding a
   Custom Domain already attached elsewhere offers to move it, which is the atomic step — this was
   not verified, so check what the dashboard actually says before accepting.
3. **Then push**, so both Workers deploy against a domain already pointing the right way.

Whether step 2 can instead ride on the deploy in step 3 is untested. Do not find out on production:
`wrangler deploy` is non-interactive in CI, and a Custom Domain claim that needs confirmation fails
there.

**Write `agentsinc.sh/editor*`, not `/editor/*`.** Cloudflare's Known Issues page documents that
`/editor/*` does not match `/editor` itself, so the bare path falls through to the site and 404s.

### The build tasks, which are the actual work

Assets served under a prefix do not get the prefix stripped — from Cloudflare's "Serving a
subdirectory" page, "Assets defined for a Worker must be nested in a directory structure that mirrors
the desired path." Any build living under a path prefix has to know it lives there, or every
stylesheet, script and internal link resolves against `/` and 404s.

- `apps/editor/vite.config.ts` needs `base: "/editor/"` and `build.outDir: "dist/editor"`, keeping
  `assets.directory: "./dist"`. Tested for real against the installed Vite 8 — it emits exactly the
  layout Cloudflare requires.
- `apps/editor/src/routes/router.tsx` needs `createRouter({ routeTree, basepath: "/editor" })`. The
  option exists and is documented in the installed types.
- **The `index.html` fallback copy.** `not_found_handling: "single-page-application"` in
  `apps/editor/wrangler.jsonc` stays anchored to the root: Cloudflare's asset-worker source
  hard-codes a lookup of `/index.html` at the top of the asset directory. With the files at
  `dist/editor/`, a hard refresh on `agentsinc.sh/editor/settings` finds no asset, falls back to
  `/index.html`, finds nothing, and returns a bare 404 — precisely the failure that setting's own
  comment says it exists to prevent. The fix is small: have the build also copy `dist/editor/index.html`
  to `dist/index.html`. That copy is never reachable at `/`, because the Route only matches
  `/editor*`, so it serves purely as the fallback shell, and its script tags point at
  `/editor/assets/…`, which resolve.
- **The share-link prefix.** `apps/editor/src/features/configure/lib/use-share-link.ts:15-16` builds
  `` `${location.origin}/?fromId=…` `` — origin only, no path prefix — so left alone it keeps minting
  links that land on the landing page. The `/editor` prefix has to go in there.
- ~~**Forward the share links that are already out.**~~ **Dropped — owner's call, 2026-08-06: the
  share links already in the wild do not matter.** They are `agentsinc.sh/?fromId=…` and will land on
  the landing page once it owns `/`. No redirect rule, no forwarding code in the landing page, and
  the analysis that used to sit here (a Route cannot match a query string, so it would have taken a
  Cloudflare Single Redirect or a few lines of landing-page JavaScript) is moot. **This removes the
  one piece of the cutover that had to be got right in the same instant**, which is what made the
  split feel like a coordinated migration rather than a config change.
- **Delete the editor's own docs route.** Verified 2026-08-06: `src/routes/router.tsx` defines
  `docsRoute` at `/docs` and `src/components/nav-rail.tsx` links to it. Once the app lives under a
  prefix that route's own path becomes `/editor/docs`, while the real documentation is at
  `agentsinc.sh/docs` on a different Worker — so the nav entry has to become an ordinary link out of
  the app rather than a router `Link`, which crosses a Worker boundary.
- **(original note)** Docs cannot live _inside_ `apps/editor`: `RootLayout` is a
  desktop-only grid with `min-w-[85.25rem]`, and docs must be readable on a phone. So
  `apps/editor/src/components/nav-rail.tsx`'s `/docs` link leaves the SPA, and `docsRoute` +
  `DocsScreen` are deleted from `routes/router.tsx` and `routes/route-components.tsx`. Both still
  present, verified 2026-08-04.
- **Rewrite two comments that stop being true.** `apps/editor/wrangler.jsonc`'s "Apex only" comment
  stops holding as a reason for the current binding. And `apps/www/astro.config.ts:41` plus
  `apps/www/src/pages/index.astro:55` both explain that `EDITOR_URL` is absolute _until this lands_;
  the second is the one that changes to `/editor`.
- `/docs` needs none of this. Docs are pages inside the same Astro build the apex already serves, so
  there is no Route, no second deployment, no base path, and none of the SPA-fallback problem — which
  is specific to a _separate_ build mounted under a prefix.

**Two 404 behaviours worth recording.** A route-mounted assets-only Worker terminates the request —
it does not fall through to the Custom Domain Worker when an asset is missing — so `/editor` owns
every 404 beneath `/editor`. And from the other side, Starlight claims `/404` for the whole Astro
site, landing page included, unless `disable404Route: true` hands it back.

**The counter-argument, unsoftened.** Subdomains would cost one redirect rule for the old share
links. Paths cost a base path in the one prefixed build, a router basepath, the `index.html`
duplication that works around the SPA fallback, and the share-link forwarding anyway. Paths are
supported and achievable and the old blocker is simply false — but they are more moving parts, not
fewer. If the reason for wanting them is that `agentsinc.sh/docs` reads better and keeps one origin,
that is a real and sufficient reason. If it were to avoid configuration work, it would do the
opposite.

**Related work in other trackers.** Creating the Worker and the route at all is
[`repo.md`](./repo.md) REPO-04; the editor Worker's rename is REPO-05. All three touch the same two
Workers and the same Custom Domain, so taken together the apex moves once instead of three times.

---

#### WWW-06: Two video slots are empty, and a third is missing

Both existing slots are marked in the code. Neither has a file. The caution still holds: a **terminal
recording**, not an editor screenshot, which is what makes a page read as a web app.

**The landing page**, in `apps/www/src/pages/index.astro`. This one is set up properly: a real
bordered box reserving 634×356px labelled "terminal recording", with a comment above it giving the
exact `<video>` element to paste, the directory the file goes in (`apps/www/public/`), and both
recordings that already exist — `packages/cli/assets/demo.gif` is 1400×1200 and 2.4 MB, so the box
needs `aspect-[7/6]` rather than `aspect-video`, and the README walkthrough sits on GitHub's CDN and
has to be downloaded rather than linked. The page will not jump when the file arrives. It sits below
the explanation rather than in the hero, moved there on 2026-08-03 because a slot that cannot do its
job until somebody records a video must not stand between a visitor and the explanation.

**The quickstart**, `apps/www/src/content/docs/docs/quickstart.md`, between the `init` command and
the wizard steps. This one is only an HTML comment, and that has two consequences: it reserves no
space, so the page **will** jump when a file arrives, and **Astro passes raw HTML straight through
markdown, so the internal note is visible in the published page source.** It wants converting into a
real reserved box like the landing page's, which fixes both.

**A third slot is missing.** `cli-or-web.md` walks the web-to-CLI round trip in three numbered steps
and is the obvious place for it — the third slot on the site, and the second inside the
documentation, after the quickstart.

---

#### WWW-08: The shared header was never extracted

`apps/editor/src/components/nav-rail.tsx` cannot move as-is — it imports TanStack Router's `Link` and
the editor's search defaults — so the landing page has its own copy of the mark and nav while the
documentation half uses Starlight's plain text title. **The two halves of the site currently have
different logos.**

73 lines to extract into `packages/ui` with plain anchor tags. Confirmed 2026-08-04: the file is
exactly 73 lines.

The complexity is not the size. It is that the extracted component has to serve three consumers — the
editor's TanStack Router build, the Astro landing page and Starlight's own title slot — across a
repository that deliberately runs two React majors side by side, and `apps/www` has no React at all
by decision (WWW-01).

---
