# B4 — web platform, testing, tooling (23 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B4, §2b group #6, §4; relationship-coverage decision 2; CLI-740 for anything the
vocabulary cannot express. Skill bodies read at `/home/vince/dev/skills/src/skills/`
(`web-testing-*`, `web-tooling-*`, `web-realtime-*`, `web-pwa-*`, `web-dataviz-*`, `web-maps-*`,
`web-mocks-msw`, `web-files-*`, `web-performance-*`, `web-accessibility-*`). Rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts`: two conflict groups touch this batch —
`{playwright-e2e, cypress-e2e}` at :31-34 (group #6) and `{websockets, socket-io}` at :119-122 —
plus five existing `requires` with their parity `compatibleWith`: react-testing-library
`needsAny [react, nextjs, remix]` (:385-390 / :179-182), vue-test-utils
`needsAny [vue-composition-api, nuxt]` (:403-408 / :225-228), file-upload-patterns and
image-handling `needsAny [react, nextjs, remix]` (:542-553 / :135-142), storybook `needsAny`
across nine frameworks (:584-597 / :286-299). The other 16 skills carry zero rules in either
direction (grep-verified). Categories matrix-verified: `web-realtime` and `web-maps`
`exclusive: true`; `web-testing`, `web-tooling`, `web-mocking`, `web-pwa`, `web-dataviz`,
`web-file-upload`, `web-files`, `web-performance`, `web-accessibility` open. Stack exposure
measured in `default-stacks.ts`: 138 `"web-testing"` keys (123 pin vitest alone, **15 pin
playwright-e2e + vitest**), 15 `"web-tooling"` keys (all vite), 56 `"web-mocking"` (msw), 36
`"web-accessibility"`; **zero** stack references for web-realtime, web-maps, web-dataviz,
web-pwa, web-files, web-file-upload, web-performance, cypress, storybook, component-library.
External claims verified 2026-08-07 (storybook.js.org frameworks page, Cypress/Playwright 2026
comparison guidance, SSE/WebSocket coexistence literature, mapbox-gl-leaflet).

**Headline: both splits the worksheet gestured at are adopted, but only one is the shape it
predicted.** Group #6 splits an exclusive `web-e2e` {playwright-e2e, cypress-e2e} out of
`web-testing` exactly as prescribed — the same-kind claim survives the Cypress-component-testing
attack (2026 guidance ties the CT tool to the incumbent E2E runner; coexistence is documented
only as migration windows), and B9's mobile-testing un-radio stays consistent because
detox/maestro are different kinds that layer while playwright/cypress are same-kind substitutes.
`web-realtime` is fixed by the mirror move: **the radio is right for websockets ↔ socket-io
(same-kind at the bidirectional layer, incompatible protocols) and wrong only for sse's
membership** — sse splits out into an open category rather than the category un-radioing, which
would have stranded the ws/socket-io fence at Phase C. The `web-maps` radio survives attack
(mapbox-gl-leaflet embedding dispatches as the sst-embeds-pulumi shape). Three binding defects
surfaced: **recharts** (worksheet-flagged) and **component-library** (self-scope + MUST-majority + active harm, the
worksheet's "–" hid it) adopt React bindings, and **storybook's existing rule is missing qwik**
— a framework listed on Storybook's own frameworks page (community tier, the same tier as
already-member solidjs) that a qwik-only project is hard-blocked from selecting today, against
both vendors' documentation. Net rules delta: 2 category splits, 2 adopted `requires`, 1 amended `requires`, 4 kept,
0 flips, 0 new conflict groups.

## (a) Group #6 — exclusive `web-e2e` split ADOPTED; same-kind survives attack

**The split:** new category `web-e2e` (`exclusive: true`), members playwright-e2e + cypress-e2e
(2 metadata `category:` edits in the skills repo); `web-testing` stays open with the residue
{vitest, react-testing-library, vue-test-utils, visual-regression}; descriptions re-cut
(`web-testing` → "Unit, component, and visual testing"; `web-e2e` → "End-to-end browser testing
(Playwright, Cypress)"). Group #6 then becomes redundant-inside-an-exclusive-category and dies
free in Phase C.

**The same-kind attack, run and failed.** The strongest counter is the cypress skill's own
surface: its description names "component testing" and `cy.mount()`, so the radio blocks
"Cypress for component tests, Playwright for E2E". Verified not a steady state: 2026 comparison
guidance consistently keys the CT tool to the E2E runner you already have ("Cypress CT when you
already run Cypress for E2E; Playwright CT when you already use Playwright" —
https://testdino.com/blog/playwright-vs-cypress-components,
https://qaskills.sh/blog/cypress-vs-playwright-component-testing-2026), Cypress's own migration
guide frames the pair as either/or
(https://docs.cypress.io/app/guides/migration/playwright-to-cypress), and the documented
dual-suite cases are explicit migration windows (running both suites "for three months" during a
migration). Two full browser-automation stacks in one app is the incoherent case the radio
states. The cy.mount slice is recorded as CLI-740 residue, not a fence-breaker — same disposition
as B7's elasticsearch↔meilisearch dual-role.

**Kind-consistency with B9 (the brief's direct question):** the un-radio of `mobile-testing`
rested on detox and maestro being different _kinds_ (instrumented gray-box vs black-box
UI-layer) with a documented complementary steady state; verify-B9-B10 item 3 already named
"worksheet #6's exclusive `web-e2e`" as the same-kind contrast case. This batch confirms the
contrast with independent evidence rather than inheriting it: playwright and cypress are both
full-browser E2E drivers competing for the same suite, with vendor migration guides in both
directions and no complementary steady-state pattern anywhere in the 2026 literature.

**The residue composes — verified, not assumed.** vitest + playwright is the canonical modern
pairing (vitest's own "When NOT to use: E2E browser testing (use your E2E testing tool)");
visual-regression explicitly defers ownership to its siblings ("Explicitly out of scope (owned
by sibling skills): … `web-tooling-storybook` … `web-testing-playwright-e2e` …
`web-testing-vitest`, `web-testing-react-testing-library`"); rtl/vtu are framework-fenced by
their existing `requires` and radio-fenced against each other transitively (react ⊥ vue via
`web-framework`). The open residue needs no further mechanism.

**Migration surfaces (the split's real cost):** 15 `default-stacks.ts` rows currently read
`"web-testing": [{ playwright-e2e }, { vitest }]` — each splits into `"web-testing": [{ vitest }]`
plus `"web-e2e": [{ playwright-e2e }]` (stacks key by category id; B5's F2 trap showed stale
category keys go schema-invalid). The 123 vitest-only rows are untouched. New category id enters
`metadata.schema.json`'s category enum, so the regen round is `generate:types` +
`generate:matrix` + `generate:schemas` (the verify-B6 5.3 gate); `project-config.schema.json`
carries the same enum but is hand-maintained, so that copy is a hand edit in the same slice.
Editor category ordering: insert `web-e2e` beside `web-testing` (order 8); renumbering is
an apply-phase detail.

## (b) `web-realtime` — split sse OUT; keep the radio on {websockets, socket-io}

The worksheet's premise is confirmed and then some: SSE and WebSockets are documented as
_complementary, not competing_ — one app legitimately runs WebSockets for chat/collaboration and
SSE for notifications/LLM-token streams/market data (https://websocket.org/comparisons/sse/,
https://ably.com/blog/websockets-vs-sse, https://docs.railway.com/guides/sse-vs-websockets), and
the skill bodies fence _each other by reference_: websockets' "When NOT to use" says "One-way
server-to-client streaming only (use SSE instead)", sse's says "Bidirectional communication
needed (use WebSocket)". The current radio hard-blocks a first-class architecture.

**But the fix is membership surgery, not an un-radio.** websockets ↔ socket-io is a genuine
same-kind pair: Socket.IO "replaces raw WebSocket usage with its own protocol" (the group's own
reason at :119-122), the socket-io body confirms incompatibility ("Need to connect to
non-Socket.IO WebSocket servers (incompatible protocols)"), and one bidirectional realtime layer
per app is steady-state. That pair's conflict group is today redundant-inside-an-exclusive-
category (one of the worksheet's 17) and dies free in Phase C — _if_ the category stays
exclusive. Flipping `web-realtime` open would convert the group to load-bearing and then Phase C
would delete it, leaving the same-kind pair unfenced: the exact fenceless-window failure the
apply-ordering rules exist to prevent. So:

- `web-realtime` stays `exclusive: true` with members {websockets, socket-io}; description
  re-cut to "Bidirectional realtime (WebSockets, Socket.IO)".
- sse moves to a new open category — proposed `web-streaming` ("Server Streaming",
  "Server-sent events and HTTP streaming") — one metadata `category:` edit. Single-member open
  categories are established practice (web-mocking, web-3d, web-dnd). Zero stack exposure, so
  the move is free.
- The `alternatives` "Realtime" purpose group at :952 (`[websockets, socket-io, sse]`) is
  editorial and may stay as-is or re-cut; purpose groups span categories already (B7 precedent).
- CLI-740 residue: native-WebSocket-to-a-third-party-server beside Socket.IO-to-own-server (the
  external service dictates the protocol — a scope split, the ES-for-logs shape). Radio holds.

## (c) `web-maps` — radio KEPT; the embedding attack dispatches

Leaflet and Mapbox GL JS are same-slot substitutes for "the interactive map in this app" —
raster-tile lightweight vs vector-tile WebGL — and the 2026 comparison literature frames them as
a pick-one choice (https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026).
The two real coexistence patterns both dissolve under the prior waves' semantics:

1. **mapbox-gl-leaflet** (Mapbox-org binding, https://github.com/mapbox/mapbox-gl-leaflet)
   embeds a GL layer _inside a Leaflet map_: the app writes Leaflet (`L.mapboxGL()`), GL is
   rendered non-interactive behind Leaflet's event handling, and "you won't be able to use some
   of the mapbox-gl-js features". This is B11's sst-embeds-pulumi shape transplanted: half the
   mapbox skill (style/layer concepts) applies inside the embedding, half (map lifecycle,
   interactivity, `mapboxgl.Map`) must not be followed. Radio KEPT, embedding recorded as a
   CLI-740 line.
2. **Leaflet-with-Mapbox-tiles** (Mapbox as tile/style _service_ under `L.tileLayer`) is a
   product fact requiring nothing from the mapbox _skill_, whose surface is Mapbox GL JS v3 —
   no skill-level pairing exists to fence or to free.

Both members class A (leaflet body: zero framework tokens; mapbox: one incidental react
mention); the radio is their only fence and it is correct. Worksheet's
"unusual-not-impossible — accepted?" → accepted, with the residue named rather than waved off.
(Honesty note from verification: the mapbox-gl-leaflet embedding claim was accepted without
independent re-fetch — non-load-bearing; the radio stands on same-slot substitution, and the
embedding is conceded CLI-740 residue either way.)

## (d) Bindings — two adopted, one amended, four kept

### recharts → ADOPT `requires needsAny [react, nextjs, remix]` (worksheet-flagged, confirmed)

React by identity: "Recharts wraps D3 in composable React components" (skill body Quick Guide);
every pattern is component composition (`XAxis`, `ResponsiveContainer`, `content` prop
tooltips); https://recharts.org. Class B `[react]`, house React-ecosystem shape (matches rtl's
rule; react-native excluded — no RN renderer). **No `requires [d3]`**: wrapping D3 is a package
dependency, not a skill fence (nativewind→tailwind / electron-testing precedent) — and the d3
_skill_ teaches direct-DOM D3, which recharts consumers never touch.

### component-library → ADOPT `requires needsAny [react, nextjs, remix]` (the worksheet's "–" hid it; grounds re-cut in verification)

The binding stands on three honest grounds — **self-scope, MUST-majority, active harm** — not
on "React by identity with zero other-framework content", which over-claims the same way
web-reviewing's original grounds did (verify-B5-B12 item 17). Self-scope is total: all three
surfaces say React (description "Packaging React components…", Quick Guide "…what you demand
of the consumer's React", metadata usageGuidance). MUSTs: **3 of 5 are React/RSC-keyed**
(`"use client"` preservation in dist; `react`/`react-dom` as `peerDependencies` — hardcoded
package names; server-safe vs client entries), 2 of 5 neutral. Active harm: a universal
verdict would put "You MUST declare `react` and `react-dom` as peerDependencies"
unconditionally in front of Vue library authors — the test that carried web-reviewing's bind.
Stated against the binding, honestly: **~78% of the body by line is translatable-neutral
packaging craft** (the style-delivery contract, the `@layer` contract, the framework-agnostic
peers-vs-deps identity rule, source-consumed-vs-built) — a followable remainder exists, but it
is translatable-not-literal and the skill's own packaging steers a Vue author away before
reaching it. Class B `[react]`. Its "owned elsewhere" table (turborepo exports mechanics,
changesets releases, vite bundler config, composable-components API design) is ownership
deference, not dependency — no further `requires`. The binding's cost is named in F3; if the
skills repo ever re-cuts a framework-neutral packaging core, this regenerates class C.

### storybook → AMEND: add qwik to the existing `needsAny` (a live wrong fence — grounds re-cut in verification)

The existing rule (:584-597) enumerates nine frameworks. Storybook's frameworks page
(https://storybook.js.org/docs/configure/integration/frameworks) lists "React, Vue 3, Web
Components, HTML, Svelte, SvelteKit, **Qwik, and Solid**" under Vite — but the linked
feature-support page splits tiers: **"Core frameworks"** (dedicated maintainers) are React,
Vue 3, Angular and Web Components only; Ember, HTML, Svelte, Preact, **Qwik and SolidJS** are
all **community frameworks**. So "officially supported at the same tier" was never the true
ground — it was never true of solidjs either. The edit stands on **membership consistency**:
solidjs — same community tier — is already a rule member, so support tier cannot be the
admission criterion the rule applies; the criterion that actually explains current membership
is _listed on Storybook's own frameworks page_, qwik is the sole such omission, and a
qwik-only project is hard-blocked (`missingRequirement`) today against both vendors'
documentation (qwik.dev documents the integration). The same criterion keeps astro out on
principled grounds (storybook-astro is external, not on Storybook's page). Widening remains a
pure loosening. A package-health CLI-740 watch rides the edit: `storybook-framework-qwik` sits
at 0.6.1 (2026-03), in a personal repo (moved out of qwikifiers), trailing Storybook 10.x —
contrast `storybook-solidjs-vite` at 10.6.0, in lockstep, with a Storybook core maintainer on
the npm access list.

**Parity discipline (F2):** storybook is the batch's only _edit_ of a rule that has a parity
`compatibleWith` group (:286-299). The amendment must touch both lists in the same change, or
worksheet §1's re-verified 39/39 set-identity — the ground for decision 4a's "zero new
declarations" — breaks before the deletion lands. (Adopted-new rules follow the B9 rule: no new
`compatibleWith` is authored, ever.)

**The conditional-derivation check (B7/B11 adjudication, applied):** storybook is the
_derive-stands_ side of the F5 line. Unlike setup-env (host-neutral core with optional
adapters → derive nothing), storybook's core activity — rendering stories — exists only inside
a component framework; there is no framework-free storybook usage the catalog can express
(HTML/web-components projects are not catalog stacks). Class C, support surface
`[react, vue-composition-api, angular-standalone, solidjs, svelte, qwik]` plus the meta-hosts
(nextjs, remix, nuxt, sveltekit) as needsAny members in the no-closure era. The body's heavy
React flavor (69 react tokens vs 1 vue) is example-flavor over a framework-generic CSF core —
a content note, not a narrowing. CLI-740: a community Astro framework exists
(https://storybook-astro.org/, renders Astro components server-side) but is not official —
astro selections stay fenced out of storybook today; revisit if it graduates.

### Kept, shapes verified (the R-flagged four)

- **react-testing-library** — `needsAny [react, nextjs, remix]` (:385-390) CORRECT. Body is
  100% React (79 react tokens, zero other frameworks); react-native's exclusion is right
  (`@testing-library/react-native` is a different package the skill never teaches, and the
  catalog's RN testing lives in mobile-testing).
- **vue-test-utils** — `needsAny [vue-composition-api, nuxt]` (:403-408) CORRECT; body is
  Vue-saturated (153 tokens), shape matches the vee-validate/pinia house pattern.
- **file-upload-patterns** — `needsAny [react, nextjs, remix]` (:542-547) SUSTAINED on core
  evidence, not just the rule's word: SKILL.md Pattern 1 is a JSX `FileDropzone` component with
  `useRef`, Pattern 2 is a "File List Management Hook", auto-detection names `useDropzone`
  (react-dropzone). The neutral slices (magic bytes, presigned URLs, XHR progress) ride a
  React-taught surface — eas precedent, binding matches the skill's own teaching.
- **image-handling** — `needsAny [react, nextjs, remix]` (:548-553) SUSTAINED: a critical MUST
  mandates cleanup "in useEffect cleanup", Pattern 1 is hook-shaped. Same call as above.

## (e) vite and the meta-frameworks — universal, no fence; the anti-fence goes to CLI-740

The worksheet's question decomposes cleanly against the facts:

- **vite is the catalog's only bundler skill and the plain-SPA path depends on it**: a react or
  vue selection _without_ a meta-framework is exactly a Vite app. Any fence keyed on
  meta-framework absence/presence would break the catalog's most basic web stack. Universal,
  class A.
- **nextjs does not use Vite** (webpack/Turbopack, https://nextjs.org/docs/app/api-reference/turbopack)
  — vite-beside-nextjs is a dubious combo where the skill has nothing to configure. This is
  `discourages`-shaped: zero `discourages` rules exist and the mechanism is slated for
  deletion, so it is recorded as a CLI-740 line ("vite ⊥ nextjs — and vite ⊥ docusaurus, which is
  webpack/rspack-based — dubious combos; advice, not fence"), not invented as a rule. Weighing
  advice vs fence per the brief: a fence would hard-error nothing that is wrong (the combo is
  useless, not incoherent) while CLI-740's dubious-combo lane exists for exactly this.
  **The advice line must name the catalog's own tension (verification finding): 6 of the 15
  vite-carrying default-stack rosters also pin nextjs** (e.g. `nextjs-ai-saas` →
  `web-developer` holds `web-meta-framework: nextjs` AND `web-tooling: vite`) — as first
  drafted, the CLI-740 line called the shipped defaults dubious without saying so. Disposition:
  the six rows are **curation debt handed to the stack owner** — either the vite entries come
  out of the six Next rosters, or the pairing is declared intended and the CLI-740 line gains
  the carve-out.
- **nuxt/sveltekit/astro/qwik/vitepress embed Vite** and expose its config (SvelteKit projects
  own a literal `vite.config.ts`; Nuxt and Astro pass `vite` options through their configs;
  Remix's official path is the Vite plugin). The skill _composes as advice_ there rather than
  being redundant — aliases, chunk splitting and env handling are Vite-level concerns the
  meta-framework passes through — and the body already draws the boundary itself: "When NOT to
  use: SSR meta-framework configuration (handled by meta-framework skills)". No binding in
  either direction; the embedding nuance rides the same CLI-740 note.
- **vitest → requires [vite] REJECTED** while here: Vitest embeds Vite as its engine (a package
  fact); a project can run vitest with only `vitest.config.ts` and never touch the vite skill's
  content. Electron-testing precedent.

## (f) Universal confirmations and the adapter-slice cases

- **msw — universal, class A.** Framework-agnostic by design (`setupWorker` browser /
  `setupServer` Node); zero framework tokens. The catalog's highest-exposure B4 skill (56
  stacks) and the cleanest verdict. Id prefix `web-mocks-msw` vs category `web-mocking` is the
  known cosmetic divergence (B7 F4's precedent list).
- **vitest — universal, class A.** Runner for any TS/JS code; the react/vite tokens are
  example-flavor and engine facts. Anchor of the `web-testing` residue.
- **visual-regression — universal, class A; harness enumeration DECLINED.** A maestro-shaped
  `needsAny [playwright-e2e, cypress-e2e, storybook]` ("needs a capture harness") was examined
  and rejected: this is a methodology skill (determinism, baseline custody, diff review) whose
  own harness-choice pattern spans self-hosted and cloud services, and real harnesses outside
  the catalog (BackstopJS, Percy) make the enumeration a lie the maestro rule never had to tell
  — maestro _is_ a tool; this skill is about any tool. Pairing advice → CLI-740.
- **service-workers — universal, class A.** Pure platform API (install/activate/fetch, cache
  versioning); zero framework tokens.
- **d3 — universal, class A.** Framework-neutral by explicit design: "let D3 handle data
  computation … and let your framework own the DOM". Composes with recharts by mutual
  boundary-drawing (each body's "When NOT to use" points at the other) — `web-dataviz` stays
  open, different-kinds (toolkit vs chart components), the vitest+playwright shape.
- **websockets / socket-io — class C, adapters today [react], derived-requires NONE.** Native
  WebSocket API and Socket.IO client cores are framework-neutral; the React hooks
  (`useWebSocket` Pattern 9, `useEventSource`, examples/core.md hooks) are adapter slices
  _extending_ self-sufficient cores — the PostHog shape from B7's derivation nuance, not the
  setup-axiom shape. A Vue or vanilla app using either is first-class. Both stay fenced by the
  `web-realtime` radio (verdict constrained).
- **sse — class C, adapters today [react], none — verdict universal post-split** (open
  single-member category, no rules).
- **offline-first — universal, class C adapters [react], none.** SKILL.md core has zero React
  (IndexedDB/Dexie/idb, sync queues, optimistic UI); all 15 react tokens sit in examples.
  Composes with service-workers (different layers: data store + sync vs cache/lifecycle;
  bodies delegate to each other's territory) — `web-pwa` open confirmed.
- **web-performance — universal, class C adapters [react], none — the cli-reviewing shape.**
  The 52 react tokens are real but minority-structural: the neutral majority (Core Web Vitals
  budgets, bundle budgets, code splitting, image optimization, web-vitals RUM) applies to every
  web stack verbatim; the React-keyed slice (React Compiler, memo discipline, react-window) is
  one pattern family. No self-scope anywhere (description "Bundle optimization, render
  performance, Core Web Vitals"; usageGuidance framework-silent) — the B12 discriminators
  (proportion + self-scope + in-catalog victim: vue/svelte/angular stacks would lose their only
  performance skill) all point away from binding. Content note F7 for the skills repo.
- **web-accessibility — universal, class A.** Genuinely neutral (WCAG/ARIA/keyboard); the
  grep's "solid" hits are CSS `outline: 2px solid`, not solidjs — recorded so the token count
  doesn't mislead a later pass.

## Manifest rows

Batch id `web-platform`, audited `2026-08-07`. 23 skills: 12 constrained / 11 universal;
9 class A, 6 class B, 8 class C.

| skill (current id)                                        | category (disposition)                 | verdict                                 | class | frameworks                                                              | derived-requires                                                                     | sources                                                                                                                                                                                                                              | notes                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| playwright-e2e (web-testing-playwright-e2e)               | **→ web-e2e [X] (new, split A)**       | constrained-via-exclusivity-or-requires | A     | []                                                                      | none                                                                                 | skill body; https://playwright.dev; https://docs.cypress.io/app/guides/migration/playwright-to-cypress                                                                                                                               | Framework-agnostic driver (zero framework tokens). In 15 default stacks — the split's re-key cost. Visual-regression overlap is ownership-deferred (F6).                                                                                                                                                                                                                                                                             |
| cypress-e2e (web-testing-cypress-e2e)                     | → web-e2e [X]                          | constrained-via-exclusivity-or-requires | A     | []                                                                      | none                                                                                 | skill body (E2E-titled; cy.mount CT as one slice); https://testdino.com/blog/playwright-vs-cypress-components; https://qaskills.sh/blog/cypress-vs-playwright-component-testing-2026                                                 | CLI-740: Cypress-CT-beside-Playwright-E2E unrepresentable — carried by the cy.mount slice; guidance keys CT tool to incumbent E2E runner, so radio holds. Zero stacks.                                                                                                                                                                                                                                                               |
| react-testing-library (web-testing-react-testing-library) | web-testing [o] residue                | constrained-via-exclusivity-or-requires | B     | [react]                                                                 | KEEP `needsAny [react, nextjs, remix]` (:385-390)                                    | skill body (100% React, 79 tokens); https://testing-library.com/docs/react-testing-library/intro/                                                                                                                                    | Shape verified: house React-eco pattern; react-native correctly excluded (different package, mobile-testing's turf). Parity compatibleWith :179-182 dies in decision 4a.                                                                                                                                                                                                                                                             |
| vue-test-utils (web-testing-vue-test-utils)               | web-testing [o] residue                | constrained-via-exclusivity-or-requires | B     | [vue-composition-api]                                                   | KEEP `needsAny [vue-composition-api, nuxt]` (:403-408)                               | skill body (Vue-saturated, 153 tokens); https://test-utils.vuejs.org                                                                                                                                                                 | Shape verified: matches vee-validate/pinia house pattern.                                                                                                                                                                                                                                                                                                                                                                            |
| vitest (web-testing-vitest)                               | web-testing [o] residue                | universal                               | A     | []                                                                      | none — `requires [vite]` REJECTED (engine is a package fact)                         | skill body ("Vite-native test runner"; framework-neutral patterns); https://vitest.dev                                                                                                                                               | The residue's anchor; 138 stacks. Composes with playwright/rtl by mutual when-NOT-to-use deference.                                                                                                                                                                                                                                                                                                                                  |
| visual-regression (web-testing-visual-regression)         | web-testing [o] residue                | universal                               | A     | []                                                                      | none — harness needsAny DECLINED (methodology skill; out-of-catalog harnesses exist) | skill body (tool-agnostic: toHaveScreenshot, Chromatic, self-hosted vs cloud; explicit ownership deference)                                                                                                                          | CLI-740 advice: pairs with a capture harness (playwright/cypress/storybook); enumeration would misstate BackstopJS/Percy-class setups.                                                                                                                                                                                                                                                                                               |
| storybook (web-tooling-storybook)                         | web-tooling [o]                        | constrained-via-exclusivity-or-requires | C     | [react, vue-composition-api, angular-standalone, solidjs, svelte, qwik] | **AMEND `needsAny` — add qwik** (edit :584-597 AND parity :286-299 together, F2)     | https://storybook.js.org/docs/configure/integration/frameworks (frameworks page lists Qwik and Solid under Vite; the feature-support page makes both **community-tier** — Core is React, Vue 3, Angular, Web Components); skill body | Derive-stands side of the F5 conditional rule: stories render only inside a host framework. Edit grounded on membership consistency (page-listing criterion), not support tier. React-heavy body (69 tokens) is example-flavor over generic CSF. CLI-740: community Astro framework (storybook-astro.org) — astro stays fenced out today; package-health watch on `storybook-framework-qwik` (0.6.1, personal repo, trails SB 10.x). |
| vite (web-tooling-vite)                                   | web-tooling [o]                        | universal                               | A     | []                                                                      | none — no meta-framework fence in either direction                                   | skill body ("SSR meta-framework configuration (handled by meta-framework skills)"); https://vite.dev; https://nextjs.org/docs/app/api-reference/turbopack                                                                            | The plain-SPA path's bundler — fencing on meta-frameworks would break react-without-nextjs. CLI-740 discourages-shaped: vite ⊥ nextjs, vite ⊥ docusaurus; composes-as-advice inside nuxt/sveltekit/astro/qwik/remix-vite. 15 stacks — 6 of which also pin nextjs: curation debt handed to the stack owner (see e).                                                                                                                   |
| component-library (web-tooling-component-library)         | web-tooling [o]                        | constrained-via-exclusivity-or-requires | **B** | [react]                                                                 | **ADOPT `requires needsAny [react, nextjs, remix]`**                                 | skill body (self-scope on all three surfaces; 3/5 MUSTs React/RSC-keyed; "use client" contract)                                                                                                                                      | Bound on self-scope + MUST-majority + active harm — not identity; ~78% of the body is translatable-neutral packaging craft (F3 names it and the binding's cost). "Owned elsewhere" table is deference, not dependency — no turborepo/changesets/vite requires. Class C if a neutral core is ever re-cut.                                                                                                                             |
| websockets (web-realtime-websockets)                      | web-realtime [X] (kept, split B)       | constrained-via-exclusivity-or-requires | C     | adapters today [react]                                                  | none                                                                                 | skill body (native WebSocket API core; useWebSocket hook as Pattern 9); https://websocket.org/comparisons/sse/                                                                                                                       | Neutral core + react adapter slice (PostHog shape). Body itself routes one-way streaming to SSE — the split's in-body justification.                                                                                                                                                                                                                                                                                                 |
| socket-io (web-realtime-socket-io)                        | web-realtime [X] (kept)                | constrained-via-exclusivity-or-requires | C     | adapters today [react]                                                  | none                                                                                 | skill body ("NOT a WebSocket implementation — adds a protocol layer"; incompatible with non-Socket.IO servers); https://socket.io/docs/v4/                                                                                           | Same-kind with websockets — radio load-bearing post-Phase-C. CLI-740: third-party-WS-feed beside Socket.IO (scope split).                                                                                                                                                                                                                                                                                                            |
| sse (web-realtime-sse)                                    | **→ web-streaming [o] (new, split B)** | universal                               | C     | adapters today [react]                                                  | none                                                                                 | skill body (EventSource + fetch streaming; "use WebSocket" for bidirectional); https://ably.com/blog/websockets-vs-sse; https://docs.railway.com/guides/sse-vs-websockets                                                            | Documented complementary to WebSockets (LLM streaming + chat in one app). Zero stacks — the move is free.                                                                                                                                                                                                                                                                                                                            |
| service-workers (web-pwa-service-workers)                 | web-pwa [o]                            | universal                               | A     | []                                                                      | none                                                                                 | skill body (install/activate/fetch lifecycle, caching strategies); https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API                                                                                               | Pure platform API, zero framework tokens.                                                                                                                                                                                                                                                                                                                                                                                            |
| offline-first (web-pwa-offline-first)                     | web-pwa [o]                            | universal                               | C     | adapters today [react]                                                  | none                                                                                 | skill body (IndexedDB via Dexie/idb, sync queues — SKILL.md react-free; hooks in examples only)                                                                                                                                      | Composes with service-workers (data layer vs cache layer). `web-pwa` open confirmed.                                                                                                                                                                                                                                                                                                                                                 |
| d3 (web-dataviz-d3)                                       | web-dataviz [o]                        | universal                               | A     | []                                                                      | none                                                                                 | skill body ("let your framework own the DOM"); https://d3js.org                                                                                                                                                                      | Different-kind beside recharts (toolkit vs chart components); mutual when-NOT-to-use deference — open category correct.                                                                                                                                                                                                                                                                                                              |
| recharts (web-dataviz-recharts)                           | web-dataviz [o]                        | constrained-via-exclusivity-or-requires | **B** | [react]                                                                 | **ADOPT `requires needsAny [react, nextjs, remix]`**                                 | skill body ("wraps D3 in composable React components"); https://recharts.org                                                                                                                                                         | The worksheet's flagged missing binding, confirmed. No `requires [d3]` — package dep, and the d3 skill's direct-DOM surface is what recharts hides.                                                                                                                                                                                                                                                                                  |
| leaflet (web-maps-leaflet)                                | web-maps [X] (kept, disposition c)     | constrained-via-exclusivity-or-requires | A     | []                                                                      | none                                                                                 | skill body (L.map/L.tileLayer/L.geoJSON, zero framework tokens); https://leafletjs.com                                                                                                                                               | Radio is the sole and correct fence.                                                                                                                                                                                                                                                                                                                                                                                                 |
| mapbox (web-maps-mapbox)                                  | web-maps [X] (kept)                    | constrained-via-exclusivity-or-requires | A     | []                                                                      | none                                                                                 | skill body (Mapbox GL JS v3); https://github.com/mapbox/mapbox-gl-leaflet; https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026                                                                       | CLI-740: mapbox-gl-leaflet embedding (Leaflet API drives a non-interactive GL layer — sst-embeds-pulumi shape); Mapbox-as-tile-service needs no skill pairing.                                                                                                                                                                                                                                                                       |
| msw (web-mocks-msw)                                       | web-mocking [o]                        | universal                               | A     | []                                                                      | none                                                                                 | skill body (setupWorker/setupServer, handler/data separation); https://mswjs.io                                                                                                                                                      | Framework-agnostic by design; 56 stacks. Id-prefix/category divergence is the known cosmetic case (B7 F4).                                                                                                                                                                                                                                                                                                                           |
| file-upload-patterns (web-files-file-upload-patterns)     | web-file-upload [o]                    | constrained-via-exclusivity-or-requires | B     | [react]                                                                 | KEEP `needsAny [react, nextjs, remix]` (:542-547)                                    | skill body (Pattern 1 JSX FileDropzone, Pattern 2 hook, useDropzone auto-detect)                                                                                                                                                     | Binding SUSTAINED on core-pattern evidence, not just the rule's word. Neutral slices (magic bytes, presigned URLs) ride a React-taught surface.                                                                                                                                                                                                                                                                                      |
| image-handling (web-files-image-handling)                 | web-files [o]                          | constrained-via-exclusivity-or-requires | B     | [react]                                                                 | KEEP `needsAny [react, nextjs, remix]` (:548-553)                                    | skill body (MUST: revoke "in useEffect cleanup"; hook-shaped patterns)                                                                                                                                                               | Sustained, same grounds. Id prefix `web-files-*` spans two categories (file-upload-patterns sits in `web-file-upload`) — cosmetic, metadata-verified.                                                                                                                                                                                                                                                                                |
| web-performance (web-performance-web-performance)         | web-performance [o]                    | universal                               | C     | adapters today [react]                                                  | none — react binding REJECTED (cli-reviewing shape)                                  | skill body (CWV/bundle/code-splitting neutral majority; React Compiler/memo/react-window minority); metadata (no self-scope)                                                                                                         | F7: React-flavored slice in a universal skill — skills-repo neutralization candidate. Victim analysis: binding would strip all perf coverage from non-React web stacks.                                                                                                                                                                                                                                                              |
| web-accessibility (web-accessibility-web-accessibility)   | web-accessibility [o]                  | universal                               | A     | []                                                                      | none                                                                                 | skill body (WCAG/ARIA/keyboard, framework-neutral)                                                                                                                                                                                   | 36 stacks. Token-count artifact recorded: grep's "solid" hits are CSS `2px solid`, not solidjs.                                                                                                                                                                                                                                                                                                                                      |

## Findings

- **F1 — storybook's rule omits qwik, the sole framework on Storybook's own frameworks page
  not in the member list (grounds re-cut in verification).** Not a tier claim — the
  feature-support page makes qwik and solidjs both community-tier ("Core frameworks" are
  React, Vue 3, Angular, Web Components only). The ground is membership consistency: solidjs,
  same tier, is already a member, so the operative admission criterion is page-listing — which
  admits qwik and keeps astro out. A qwik web stack is hard-blocked from storybook against
  both vendors' documentation; qwik carries no `requires` of its own. The batch's one live
  wrong fence; widening is pure loosening. Package-health CLI-740 watch:
  `storybook-framework-qwik` 0.6.1, personal repo, trails SB 10.x (vs `storybook-solidjs-vite`
  10.6.0 in lockstep).
- **F2 — parity discipline on the storybook amendment.** The only rule _edit_ in the batch
  touches a rule with a parity `compatibleWith` group (:286-299); both lists must change in one
  edit or the reverified 39/39 set-identity behind decision 4a breaks pre-deletion. New rules
  (recharts, component-library) author `requires` only, per the B9 rule.
- **F3 — component-library's binding was invisible to the coverage flags, and it has a named
  cost.** The worksheet's "–" reads as probably-universal; the binding rests on total
  self-scope + MUST-majority (3/5) + active harm — the setup-resend shape (B7 F3): a binding
  the reachability mechanism could not see. The extractable neutral core is real (~78% by
  line: style-delivery contract, `@layer` contract, peers-vs-deps identity rule,
  source-consumed-vs-built) and the binding prices it: post-binding, non-React web stacks have
  zero reaching coverage for CSS-delivery/sideEffects/cascade-layer packaging — the "owned
  elsewhere" table hands only exports-map/tree-shaking mechanics to
  `shared-monorepo-turborepo`. A framework-neutral re-cut in the skills repo re-derives the
  row to class C.
- **F4 — the {websockets, socket-io} conflict group must not be stranded.** It is
  redundant-inside-an-exclusive-category _only while_ `web-realtime` stays exclusive; the sse
  split preserves that and the group dies free in Phase C. An un-radio instead would have made
  it load-bearing and then Phase C would delete the only same-kind fence — the ordering hazard
  disposition (b) exists to avoid.
- **F5 — the web-e2e split's measured cost is 15 stack re-keys** (the
  `"web-testing": [playwright, vitest]` rows), 2 metadata edits, 1 new category id through the
  schema regen. The sse split costs 1 metadata edit and touches zero stacks. Nothing else in
  the batch moves data.
- **F6 — playwright-e2e's surface overlaps two siblings** (visual regression via
  toHaveScreenshot; accessibility via ARIA snapshots). Benign: visual-regression's
  out-of-scope block assigns ownership explicitly; no fence, no action.
- **F7 — web-performance carries a React-flavored core slice in a universal skill** (React
  Compiler guidance, memo discipline, react-window). Universal stands on proportion +
  no-self-scope + victim analysis, but the skills repo could split the React slice into an
  example the way sse/websockets already structure theirs. Content note, not a rules defect.
- **F8 — three cosmetic id/category divergences confirmed in-batch** (`web-mocks-msw` in
  `web-mocking`; `web-files-file-upload-patterns` in `web-file-upload`; both already on B7 F4's
  precedent list). No action; renaming is skills-repo hygiene under the zero-rename doctrine.
- **F9 — the realtime/pwa adapter slices are uniformly React** (useWebSocket, useEventSource,
  offline-first example hooks). If a second framework's adapters ever land, the class-C
  adapter surfaces widen without rule changes — the PostHog derivation nuance holds
  batch-wide.

## Contradicts-the-worksheet

1. **"Is `web-realtime` exclusive correct now that sse is in it" — wrong question, right
   instinct.** Exclusivity is correct for two of three members; _membership_ is the defect.
   The un-radio the question gestures at would strand the same-kind websockets↔socket-io pair
   fenceless after Phase C (F4). Disposition: split sse out (one metadata edit, zero stacks),
   keep the radio.
2. **Group #6 confirmed as billed, now attacked rather than assumed** — including the
   worksheet's unasked hard case (Cypress component testing beside Playwright E2E), which
   fails as a steady state on 2026 ecosystem guidance. The B9 kind-contrast the brief flagged
   is affirmatively consistent: different-kinds open (detox/maestro), same-kind radio
   (playwright/cypress).
3. **storybook's R flag hid a wrong fence.** "Has `requires`" is not "requires is right": the
   nine-member list omits qwik, the sole omission among the frameworks listed on Storybook's
   own page — and verification found the member it must be consistent with (solidjs) is
   community-tier too, so an "officially supported" framing was never true of solidjs either;
   the operative criterion is page-listing. The worksheet's coverage mechanism cannot
   distinguish a stale enumeration from a correct one — same lesson as B9's maestro, reached
   through an _existing_ rule this time.
4. **component-library joins recharts as a missing React binding** — the worksheet flagged
   only recharts. Two adopted bindings, not one.
5. **"vitest/msw/visual-regression: confirm universal" — confirmed, with one deliberate
   rejection recorded**: visual-regression's harness enumeration was considered and declined
   (methodology skill, out-of-catalog harnesses), so the universal verdict is a decision with
   grounds, not a default.

## Rules delta (apply-phase summary)

- `default-categories.ts`: add `web-e2e` (`exclusive: true`) and `web-streaming`
  (`exclusive: false`); re-cut `web-testing` and `web-realtime` descriptions; `web-maps`,
  `web-realtime` flags unchanged.
- Skills repo: 3 metadata `category:` edits (playwright-e2e → web-e2e, cypress-e2e → web-e2e,
  sse → web-streaming).
- `default-rules.ts`: ADOPT 2 `requires` (recharts, component-library — React house shape);
  AMEND storybook's `needsAny` + parity `compatibleWith` with qwik (one edit, F2); KEEP 4
  (rtl, vtu, file-upload-patterns, image-handling). No new conflict groups; no new
  `compatibleWith` authored.
- `default-stacks.ts`: 15 rows re-keyed (`web-e2e` split, F5).
- Conflict-group bookkeeping for Phase C: group #6 becomes redundant-inside-exclusive after
  the split and dies free; `{websockets, socket-io}` stays redundant throughout (F4).
- Regen: `generate:types` + `generate:matrix` + `generate:schemas` (two new category ids enter
  `metadata.schema.json`'s enum), plus the same two by hand in the hand-maintained
  `project-config.schema.json`.
- Ordering: both category moves and the storybook widening are loosening-or-neutral with the
  fences landing in the same change — no fenceless window. The adopted `requires` are additive.
- CLI-740 residue from this batch: cypress-CT-beside-playwright-E2E; native-WS-third-party-feed
  beside Socket.IO; mapbox-gl-leaflet embedding + Mapbox-as-tile-service; vite ⊥ nextjs and
  vite ⊥ docusaurus dubious combos (discourages-shaped — with the 6-of-15 default-roster
  tension named as curation debt for the stack owner); storybook ↔ astro community framework
  watch + the `storybook-framework-qwik` package-health watch; visual-regression harness
  pairing advice; F7's React-slice neutralization note.
