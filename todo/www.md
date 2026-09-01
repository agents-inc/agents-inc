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

| ID                                                      | Task                                                                                                                          | Status           | Type    | Complexity |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- | ---------- |
| WWW-01 (was editor-todo item 8)                         | Docs site: reference is per-group not per-command, and there is no Releases section                                           | Ready for Dev    | feature | medium     |
| WWW-11 (new, 2026-08-27)                                | The CLI README links a guide that was deliberately deleted — `guides/importing-skills.md`                                     | Ready for Dev    | docs    | trivial    |
| WWW-12 (new, 2026-08-27)                                | `check-cli-claims.ts` reads one page, and CLI claims now live on several                                                      | Ready for Dev    | test    | medium     |
| WWW-13 (new, 2026-08-27)                                | Nothing gates the search modal's styling, and it is the one surface a browser must open                                       | Ready for Dev    | test    | medium     |
| WWW-02 (was editor-todo item 9)                         | Landing page: the free-and-open-source block does not do its job, and two a11y defects                                        | Ready for Dev    | feature | easy       |
| WWW-03 (was editor-todo item 10)                        | Apex path split — **the repository half has landed; what is left is the dashboard cutover**                                   | Needs Assistance | feature | complex    |
| WWW-16 (new, 2026-09-01, found by the WWW-03 docs pass) | Nothing binds a documented editor URL to `EDITOR_URL` — 30 stale references survived the apex split with all four gates green | Ready for Dev    | fix     | easy       |
| WWW-06 (was editor-todo item 14)                        | Two video slots are empty and a third is missing; you supply the recordings                                                   | Needs Assistance | feature | easy       |

---

## Active items

#### WWW-01: The docs site's remaining sections

**What exists.** `apps/www` is an Astro 7.1.6 project with Starlight 0.41.6. One build serves the
landing page at `/` and the documentation at `/docs`; the editor stays its own Vite build.
`prefetch: false` and `disable404Route: true` are set. Re-derive the page count rather than reading
one here: `cd apps/www && bun run build` prints it.

**Three of the row's five bullets landed 2026-08-27** — the section build-out, the exhaustive config
reference, and the compiled-sub-agent page. One was withdrawn. What is written below is what is left.

**Still to do.**

- **The reference is still one page per group, not one page per command.** Deliberately deferred
  rather than forgotten: thirteen command pages was judged overwhelming against the row's own
  "comprehensive without being overwhelming" brief, and `reference/commands.md` already carries the
  whole roster in a matrix that `apps/www/scripts/check-cli-claims.ts` binds to
  `packages/cli/src/cli/commands/**`. **Anything that splits that page must keep the two literal
  markers `## Command matrix` and `**This table is the roster, and it is checked.**` intact**, or the
  site's own gate stops judging the roster.
- **There is no Releases section**, and the sidebar is nine groups rather than ten because of it.
  What stands in for it is a single external link labelled "Changelog" in Resources, pointing at the
  repository's GitHub releases page. Decide whether a real section is wanted before building one —
  a page that restates a changelog is a second copy that rots.

**WITHDRAWN — the voice bullet.** This row used to say the migrated guides "read as lifted from an
older README — title-case headings, imperative bullets, no links back into the narrative", and
listed `why.md` / `quickstart.md` / `cli-or-web.md` / `concepts/stacks.md` as the pages written
natively for the site. **The owner ruled the opposite on 2026-08-27: the older guides linked from
`packages/cli/README.md` carry the correct language and tone, and they are the model for the whole
site.** `why.mdx` and `cli-or-web.md` are the discursive outliers, not the standard. Measured while
settling it: the guides run unwrapped prose (`global-first-setup.md` 360 columns,
`customizing-subagents.md` 418, `editing-config.md` 430) against 79 for `why.mdx` and
`cli-or-web.md`; the guides lean American in spelling and use contractions freely; markdown is not
prettier-wrapped here, so the difference is authorial rather than enforced. **Do not "fix" the
guides' voice, and do not convert their title-case headings** — a pass acting on the old bullet
would damage the pages the ruling protects.

**Ownership settled, duplicates gone (2026-08-06, repo.md REPO-14).** The site's copies are now the
only copies: the ten originals under `docs/cli/` were deleted, `docs/cli/` keeps contributor
material only, editor material lives in `docs/web/`, and cross-cutting documents get `docs/repo/`.
The four source-file defects this section used to list died with that: the index documenting a
removed command was rewritten, the skills-explorer plan moved to `docs/web/` under a historical
header naming the drift, and the CLI README now says 222 skills across 9 domains and lists all 23
sub-agents. The CLI README's doc links point at the site's source files on GitHub — **flip them to
`agentsinc.sh/docs/...` when WWW-03 lands**, and note the links in the ALREADY-PUBLISHED 0.152.0 npm
page broke when the originals were deleted; the next publish heals them.

---

#### WWW-13: Nothing gates the search modal's styling

The search modal was reconciled with the design language on 2026-08-27 — see `site.css`'s SEARCH
block for what was wrong and why the obvious diagnosis was the wrong one. **Nothing holds it.**

**The gap is precisely the one `check-type-scale.ts` was written for, one level deeper.** That script
exists because "a class name is a string, and `text-9` on an `<h2>` is a perfectly valid string" —
the defect only exists once a browser has resolved a token, so a browser is what has to look. The
search modal is worse than that: it is a component that **mounts at runtime**, so its type is
invisible even to a script that loads the page and reads computed style, unless the script opens the
modal first. That is exactly how it rendered its input and result titles at 16.8px and its excerpts
at 12.8px — three sizes appearing nowhere else on the site — while every gate stayed green.

**What could silently revert it.** Most of the modal's colour comes from Starlight mapping
`--pagefind-ui-*` onto its own `--sl-color-*`. That mapping is Starlight's implementation detail, not
a documented contract, so a minor release can change it and the site would follow without a warning.
The rules in `site.css` that remove Pagefind's cards, connectors and document glyphs are keyed on
`pagefind-ui__*` class names, which are likewise Pagefind's to rename.

**Extend `check-type-scale.ts` rather than writing a sibling.** It already serves `dist/`, drives
Chromium, and owns the vocabulary of roles and sizes; a second browser-driving script would pay the
same startup cost twice for one more assertion. The addition is one page visit that clicks
`button[data-open-modal]`, types a query, waits for results, and asserts the modal agrees with the
prose scale — the result heading at the body size and the excerpt at the small-prose size, neither a
fractional multiple of anything.

**Two things to know before writing it.** The check has to type a real query and wait, because
Pagefind renders nothing until it has results — an assertion against the empty modal would pass
forever. And `.pagefind-ui__result-title` is used for **both** the page label and each heading
within it, so any selector has to go through the direct-child forms
(`.pagefind-ui__result-inner > …` versus `.pagefind-ui__result-nested > …`) or it will read the
wrong one; that ambiguity already caused one wrong fix while the styling was being written.

Re-derive before working: `sed -n '55,80p' apps/www/scripts/check-type-scale.ts` and
`grep -n "SEARCH" apps/www/src/styles/site.css`

---

#### WWW-12: The CLI-claims gate reads one page, and CLI claims now live on several

`apps/www/scripts/check-cli-claims.ts` binds `reference/commands.md` to
`packages/cli/src/cli/commands/**` — in both directions, as membership rather than as a count. It is
the gate that exists because three pages once documented commands that had been deleted while
`share` shipped undocumented.

**It reads exactly one file.** `REFERENCE` in that script resolves to
`src/content/docs/docs/reference/commands.md` and nothing else. Every command claim on every other
page is unchecked, and the site now has many more of them than it did when the gate was written —
`reference/capabilities.md` alone carries seventeen invocations, and the recipes, troubleshooting and
configuration sections carry more. The defect the gate was built to catch can now reappear one
directory over from where it is watching.

**Do not simply widen the glob to every page.** The gate's second claim is per-command flag
membership, read out of a markdown table with named `Command` and `Flags` columns — a shape only
`commands.md` has, and one that would be wrong to impose on a prose page. The two claims need
splitting: the roster claim stays where it is, and a second, weaker check over the rest of the site
would assert only that every `agents-inc <command>` string a page prints resolves to a module under
the commands tree, and that any `--flag` beside it appears in that command's `static flags`.

**Sequence this after the editor-first reshape settles**, since that work moves where command claims
live and would date any inventory taken now. Re-derive before starting:
`grep -rn "npx agents-inc" apps/www/src/content/docs | wc -l` and
`sed -n '68,80p' apps/www/scripts/check-cli-claims.ts`

---

#### WWW-11: The CLI README links a guide that was deliberately deleted

`packages/cli/README.md`'s **Guides** table has a row **Importing third-party skills** pointing at
`apps/www/src/content/docs/docs/guides/importing-skills.md`. That file does not exist. It was
deleted in `5898ef23`, after the `import skill` command itself retired in `95738763`, and
[`archive.md`](./archive.md) records **D-14** — "import skills from third-party marketplaces" —
retired as superseded by the editor's Add skill dialog.

**The fix is deleting the row, not writing the page back.** What the row advertised is covered
today by `guides/writing-custom-skills.md`, which describes the editor's Add skill dialog carrying a
GitHub-sourced skill inline into the configuration `init --from <id>` installs.

The link is live on the **already-published npm page** as well as on GitHub, so it 404s for anyone
who follows it. Note `sidebar: order: 6` is vacant in `guides/` — that is the slot the deleted page
held, and nothing needs to fill it.

Re-derive before working: `ls apps/www/src/content/docs/docs/guides/` and
`grep -n "importing-skills" packages/cli/README.md`

---

### Constraints already settled — do not undo these

**THE LANDING PAGE AND THE 404 CARRY A FRAME, AND IT IS AN EXCEPTION TO RULE 5 (owner design,
2026-08-27).** `body.framed` in `site.css` fills every void the page has with diagonal hatching —
both side bands, the gap between each pair of sections, and the page's own head and foot — plus a
tick ruler along the top. It makes the box model visible, so content stopping short of an edge reads
as a decision rather than as an accident.

Rule 5 reads "whitespace separates content, not rules — the only borders on the page enclose
something", and it is stated in `index.astro`'s own comments. The hatch and the ruler are vocabulary
that rule does not cover, and they are allowed anyway — chosen from a lab of seventeen treatments
across five rounds. Do not remove them as a rule-5 violation; the rule has an exception and this is
it.

Five things about it that are easy to break:

- **ONE COLOUR, ONE WEIGHT, EVERYWHERE** — `--color-divider`, a 1px dot on a 12px grid. Owner ruling,
  and the uniformity is the point: it is what makes the field read as one surface the content sits on
  rather than as decoration around it. Do not vary it per region.
- **IT WAS A DIAGONAL HATCH UNTIL 2026-08-27**, and the swap was a judgement about what a background
  is for. A rake of diagonals has direction, so it carries energy and the eye follows it; a dot field
  is inert, which is what a background should be. Ten patterns were drawn in the band beside a real
  content column before this one was picked — crosshatch, square grid, single-direction rules,
  dot-on-grid, and the diagonal at several pitches among them. Do not reintroduce any of them.
- **THERE IS NO RULER AND NO COORDINATE FIGURES.** A tick strip along the top and `0` / `1024` at its
  ends were built and removed the same day. The page states its own width nowhere, deliberately.
- **THE CONTENT COLUMN IS `--color-column`, NOT `--color-page`** — `#fdfdfc`, the surface the editor
  gives its own middle column (`configure-screen.tsx`, `bg-column`). The header, `main` and the
  footer must all carry it; they briefly disagreed, with two on `#fdfdfc` and one on white, which is
  invisible by eye and obvious in computed style.
- **THE BAND IS A MEASURE CONTROL, NOT A MARGIN.** `--frame-gutter` is 8.75rem because that is what
  pulls the prose to 80 characters; at the old 3.75rem it ran to 99. Change it and the line length
  changes with it — that is the knob, not `--measure`, which now simply lets prose fill what the
  band leaves.
- **The wide band is gated to `width >= 64rem`.** Applying it at the 40rem breakpoint leaves a tablet
  432px of content and crushes the three-column grids to 117px columns. The band has to come out of
  slack the page actually has.
- **The pitch was chosen by eye against a full-height page.** At 7px it vibrates; at 12px it stops
  reading as hatching. Not an arbitrary number.

**THE DIAGONALS ARE BACKGROUND ONLY (owner ruling, 2026-08-27).** They filled every void for part of
the day — both bands AND the gap between each pair of sections. They no longer do: `main` paints one
continuous white column band-to-band, so the hatch shows behind the page and nowhere between blocks.
Sections carry no surface of their own; a section rule that sets a background is a regression.

**SECTION HEADINGS ARE THEIR OWN ANCHOR, and the `#id` labels that sat in the margin are gone.**
Clicking a heading puts its id in the address bar, so any section can be linked to directly. That
replaced the margin annotations rather than joining them — the same "saying it twice" reasoning that
removed the vertical rails. Amber on hover, the accent the chips carry.

**THE CATALOGUE'S TAB BAR IS packages/ui's CHIP, `size: filter`, ported verbatim.** Resting
`--color-chip-border` on transparent with muted text, hover `--color-line-hover`, active
`--color-brand-border` on `--color-wash` with `--color-brand-ink`. **Amber for the active tab is
correct and not a rule-4 violation** — the editor's own domain filter chip is amber when active, so
this is the precedent rather than an exception to it. The values were read out of `chip.tsx`, not
matched by eye; if that component changes, this should follow it.

**THE CATALOGUE HAS THREE TYPE TIERS AND THEY MUST STAY DISTINCT.** Chips are mono uppercase in a
border; category names are sans semibold ink; skills are sans regular in `--color-ink-3`. The bug
this fixed was categories and tabs rendering at the same size in the same mono, so a reader could
not tell a tab bar from a group heading. Two vocabularies plus a border is what separates them —
do not collapse any tier back into mono.

**The guides and the page colour are ONE declaration.** They were two rules — a `background`
shorthand and a later `background-image` — fighting over the same property, which is how a variant
test silently rendered the wrong one for two rounds before anybody noticed.

**Two structural traps.** The hatch is ONE unmasked layer that the content paints over, so it
surfaces wherever nothing is — a per-gap treatment would need a rule per gap and would drift the
first time somebody added a section. And **the header and footer must not take the sections'
negative inline margin**: they carry their own `mx-auto max-w-page`, and setting `margin-inline`
overrides the `auto` that centres them, which threw both to the viewport edge the first time. They
paint band-to-band with a gradient instead.

**Nothing gates any of this** — the same gap as WWW-13, one surface over.

**THE SITE IS EDITOR-FIRST, AND THE CLI IS THE ENGINE (owner ruling, 2026-08-27).** In the owner's
words: _"a user wants to install Agents Inc on their machine and the easiest way is to use the web
editor and install it via CLI. The CLI is then only additive — they can choose to do things with
the CLI, but the main way is the editor."_ The guides were all written CLI-first because the CLI
existed first, and that is a historical accident rather than a design.

Four things follow, and they are the ones easiest to reverse by accident:

- **The two front doors are NOT presented on equal footing.** The editor leads; the CLI follows.
- **They are sequential, not alternative, and this is the fact that shapes every page.** The editor
  runs in a browser and cannot write to disk — `install-dialog.tsx`'s own comment calls itself "an
  inventory of what will be written, then the two commands that write it". Every editor user runs a
  CLI command. A page framing them as two complete paths would strand its reader at the install
  step. Select in the editor → install with the CLI → maintain with either.
- **An aside is the default; a tab set is the exception.** `<Tabs>` draws two panels of equal size
  with equal labels, which is a parity claim this ruling rejects. The test: _would a reader who has
  never opened a terminal be stuck here?_ If no, it is a `:::note`. **The core install flow is never
  tabbed** — it is one path with two steps. The site currently runs **two** tab sets against
  seventeen asides, and that ratio is the point rather than an accident of how far the pass got.
- **Where tabs are used the mechanism is exact**: `syncKey="tool"` with labels exactly `Editor` and
  `CLI`, Editor first. Starlight syncs on the label TEXT, so a single `Web editor` silently
  desynchronises that page from the whole site, and nothing would catch it. Starlight persists the
  choice across page navigations — that persistence IS the "one fork point" the ruling asked for,
  and it is a preference rather than a route. Do not build a forked page tree.

Re-derive the counts rather than trusting the two above:
`grep -rn "<Tabs" apps/www/src/content/docs | wc -l` and
`grep -rn ":::note" apps/www/src/content/docs | wc -l`

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

- **One theme, light. The theme toggle was removed** — and the reason it was removed expired on
  2026-08-29, so this constraint is now a decision to re-take rather than a fact. At the time the
  design system declared a dark variant and shipped no dark colours for it; it now ships a dark
  value for all 42 core tokens, though that ramp is generated rather than designed (EDITOR-07).
  The original reasoning, kept because it is what a re-take has to answer: a toggle would have
  switched into Starlight's own blue-grey theme
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

#### WWW-02: What is left on the landing page

**The build-out landed 2026-08-27.** The page runs eleven blocks: nav · hero · stats · what-it-is ·
catalogue · how-it-works · recording · write-your-own · free-and-open-source · final CTA · footer.
Re-derive rather than trusting that list: `grep -n "<section" apps/www/src/pages/index.astro`.

**Three of the note's twelve were DECLINED, not deferred**, and the note's own anti-pattern list is
what declined them. **Three pillars** is a shape rather than a claim, and "The approach" already does
that job in prose. **A proof block** has nothing true to put in it — no users, no testimonial, no
dated benchmark — and an empty one is how `warp.dev` came to serve "0K Active Developers". **A
GitHub star count in the nav** would render zero, which is the same failure. Do not re-add any of
them without the thing that would fill it.

**Still to do.**

- **The free-and-open-source block still does not do its job.** It is two repository links. The note
  puts it exactly where a commercial site puts pricing, and asks for the same work: an explicit
  "this is free" sentence — that part exists — plus contributor avatars and a star or sponsor CTA.
  Both of the missing halves need the repository to be public first, so this sits behind the same
  gate as the star count.
- **Two accessibility defects, unchanged.** `aria-live` on the copy-command note makes a screen
  reader announce "click to copy" at page load, because the script fills the empty element after
  paint. And the decorative `$` in the command block sits at 3.64:1 with the hairlines at
  1.44–1.64:1 — reported and not fixed, because that fix belongs in `packages/ui` and the WCAG AA
  ruling (below) is deliberate.
- ~~**"Build a stack →" points at the absolute `https://agentsinc.sh`**~~ **Done 2026-09-01 with
  WWW-03's repository half.** All three anchors read `EDITOR_URL`, which is now `/editor`. Note the
  consequence for anyone working on this page: the link crosses a Worker boundary that only
  production has, so it 404s under `astro dev` and `astro preview` and is correct anyway.

**THE MEASURE IS THE OWNER'S CALL AND IS DELIBERATELY LONG.** The page is 64rem wide (1024px, the
common step in this range and Tailwind's `5xl`), and prose runs the full content width rather than
stopping at the 36rem it used to. Measured in a browser at 1440: **105 characters per line**, against
the 45–75 usually recommended. That was chosen after seeing both — the old 36rem cap read as 67
characters and left every paragraph 226px short of the catalogue grid beside it, so the page had two
ragged right edges instead of one. **One token moves it**: `--measure` in `site.css`, read by every
paragraph on the page and by the 404. 44rem gives ~82 characters, 40rem gives ~74. Do not re-pin
individual paragraphs — that is what made this hard to change the first time.

**Three judgement calls from the original build, none to be undone casually.** The copy-command is a
`div` with a script-added button role rather than a `<button>`, because browsers make button text
unselectable — if the script failed, the one command on the page could not be copied at all. The
page carries exactly one breakpoint, where `apps/editor` deliberately has none, because a landing
page is the one surface that has to survive a phone. And the hero's editor CTA now leads the command
block, which is the 2026-08-27 editor-first ruling expressed as position rather than as colour —
rule 4 reserves amber for what the user deliberately chose, and neither CTA is a choice yet.

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

### Status 2026-09-01: the repository half is done. The cutover is not.

Everything in "the build tasks" below is applied and green in the working tree — `base`,
`outDir`, `basepath`, the SPA fallback shell, the deleted docs route, the share-link prefix, both
wrangler configs, the nav on both sides, and the documentation. Gates: editor 476 e2e + 494 unit,
CLI 7357 unit, site build 42 pages with all four checks, lint and typecheck clean across all three
workspaces. The `/editor` resolution was verified against Cloudflare's own asset resolver through
`wrangler dev` rather than against the docs — bare `/editor` 307s to `/editor/`, and
`/editor/settings` serves the shell with its assets at `/editor/assets/…`.

**Three things are still owed, and none of them is a repository change.**

1. **The Custom Domain move**, `agents-inc-editor` → `agents-inc-www`, in the Cloudflare dashboard.
2. **The token.** `CLOUDFLARE_API_TOKEN` needs `Zone → Workers Routes → Edit` for the new Route.
   Do not assume it has it — REPO-41 records the same token already failing on D1, which means
   **CI has deployed nothing since 2026-08-30 and this cutover cannot ship until that is fixed.**
3. **An acceptance pass against the real hostname.** Not optional and not replaceable by a suite:
   no local modality serves the apex as it will exist, so the landing page's three editor CTAs and
   the nav rail's two site links are unverifiable until they are live. See the progress file.

**The ordering was reconsidered and the tracker's own sequence is not the cheapest one.** As
written — commit, then move the domain, then push — the editor is DOWN from the dashboard move
until the deploy finishes, which is a full CI run (`deploy` is `needs: check-web`, bounded at 25
minutes) and is indefinite if `check-web` goes red. One Worker can hold a Custom Domain and a Route
on the same hostname simultaneously, so shipping the editor's Route first collapses the outage to
the length of a dashboard flip. Decide this before starting, not during.

The dispatch log, the full correction list and the hazards this introduced are in
[`plans/WWW-03-apex-split-progress.md`](./plans/WWW-03-apex-split-progress.md).

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

#### WWW-16: nothing gates a documented editor address

`scripts/check-cli-claims.ts` binds the command roster and every flag to
`packages/cli/src/cli/commands/**` through the TypeScript AST, in both directions. It says nothing
about URLs. So when the apex split moved the editor to `/editor`, **30 references across 21 pages
went stale and every gate stayed green** — build, all four checks, `astro check`, lint. They were
found by a hand sweep, which is the failure mode `check-cli-claims.ts` exists to end for commands
and does not cover for addresses.

**Three separate claims are unguarded**, and they are not the same shape:

1. **Prose links pointing at the editor**, which must be `/editor` rather than the bare apex. The
   trap is that a wrong one still renders a working page — the landing page — so it fails as a
   reader's confusion rather than as a 404.
2. **Quoted CLI output** — `recipes/share-with-a-teammate.md`, `guides/adding-to-an-existing-project.md`,
   `troubleshooting/common-problems.md` all reproduce blocks the CLI prints, and those must match
   `sharedConfigDestinations` and `configUnreadableError` in
   `packages/cli/src/cli/utils/messages.ts` exactly.
3. **The share-link shape**, `agentsinc.sh/editor/?fromId=<id>`, which is built by `editorConfigUrl`
   and written by hand in six places. Note the slash before `?` is real — `editorConfigUrl`
   interpolates `${EDITOR_URL}/?fromId=`, and a reader trimming it as redundant writes a wrong URL.

**The same class already bit the CLI's own suite**, which is the argument that this is worth a
guard rather than a careful reviewer: `packages/cli/e2e/commands/init-ui.e2e.test.ts` asserted
`toContain("agentsinc.sh")` and `src/cli/utils/open-url.test.ts` hardcoded
`https://agentsinc.sh/?fromId=Ab3xY9_Q` under a comment claiming it was the shape the CLI produces.
Both stayed green across the split. Both were fixed with WWW-03 — the first now reads
`STEP_TEXT.EDITOR_URL`, the second calls `editorConfigUrl` — and **the fix in both cases was to
derive rather than to type**, which is the shape the guard should push the docs towards too.

Census before starting:

    grep -rn 'agentsinc\.sh' apps/www/src/content/docs/ | grep -v 'api\.agentsinc\.sh'

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
