# B3 — web UI, styling, animation, editors (22 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B3, §2b group #14, §4; relationship-coverage decisions 2 and 4a. Skill bodies
read at `/home/vince/dev/skills/src/skills/web-ui-*`, `web-styling-*`, `web-animation-*`,
`web-editor-*`, `web-3d-react-three-fiber`, `web-dnd-dnd-kit`; current rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts` (one conflict group touches this batch —
`{shadcn-ui, mui, chakra-ui, mantine, ant-design}` at 64-66 — plus eleven `requires` rules:
shadcn-ui's two at 421-430, chakra/mantine/mui/ant-design/headless-ui at 459-487, framer-motion at
531-535, tanstack-table at 561-565, radix-ui at 567-571, vuetify at 611-615, each mirrored by a
`compatibleWith` group). Categories verified in `default-categories.ts` (`web-ui-components` open
at order 9; `web-styling` open **and `required: true`** at order 4; `web-animation`/`web-3d`/
`web-dnd` open; `web-editor` `exclusive: true` at order 25). Golden-scenario pins verified in
`packages/matrix/src/contract/selection-scenarios.ts` (SHADCN/RADIX constants;
`closure-takes-only-the-unambiguous-requirement` pins shadcn's AND+choice shape). Product claims
verified by web search 2026-08-07 (shadcn Base UI default, Headless UI v2/Vue-v1, Motion for Vue,
Tailwind v4 preprocessor stance).

**Headline: group #14 resolves as a one-category split with near-zero migration, and the batch
adds four `requires` bindings — the worksheet's three (base-ui, react-three-fiber, dnd-kit) plus
one it never flagged (lexical).** A new exclusive `web-ui-kit` takes the five React design-system
kits **plus vuetify**; the residual `web-ui-components` keeps the headless composables (radix-ui,
headless-ui, base-ui, tanstack-table) and stays open. Current fences over the 22: group #14's 10
pairs + the web-editor radio's 1 = 11; proposed: 16 (11 kept + 5 new vuetify↔React-kit edges, all
unreachable anyway via framework `requires` — coherence, not new blocking). One external fact
changes a recorded reason but no fence: **shadcn/ui made Base UI its default primitive engine in
July 2026, with Radix still fully supported as a per-project choice** — the `compatibleWith`
reason "shadcn/ui is built on React + Radix UI" (default-rules.ts:189) is stale, and it confirms
that primitives must NOT be radioed against kits or each other.

## The split — group #14's disposition (§2b)

New category `web-ui-kit`, `exclusive: true`, `required: false`, domain `web`, slotted beside
order 9 (later web orders renumber — same M3 shape as B6, smaller). Residual `web-ui-components`
keeps its id and open flag, displayName re-cut.

| id                                       | displayName         | members (slugs)                                         | replaces                                                                   |
| ---------------------------------------- | ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `web-ui-kit` (new, EXCL)                 | Design System Kit   | shadcn-ui, mui, chakra-ui, mantine, ant-design, vuetify | conflict group #14 exactly (its five members) + vuetify joining coherently |
| `web-ui-components` (kept, open, re-cut) | Headless Components | radix-ui, headless-ui, base-ui, tanstack-table          | nothing — these four were never fenced against each other, correctly       |

### Why the kit radio is right (attacked, sustained)

**One design system per app is the steady state.** Two pre-styled kits in one app means two
styling layers, two theme providers, and double bundle weight — the ecosystem consensus is
explicit "pick one and stick with it"
([Refine: AntD vs MUI](https://refine.dev/blog/ant-design-vs-mui/),
[2026 comparison round-ups](https://dev.to/wafa_bergaoui/tailwind-css-vs-mui-vs-ant-design-which-one-should-you-choose-in-2026-3pjb)).
The attacks and their outcomes:

- **Kit-to-kit migration (MUI → shadcn):** real, but a migration window — non-blocking under the
  prior waves' steady-state radio semantics (verify-B6 1.2, verify-B5-B12 preamble).
- **Monorepo, two apps, two kits** (admin on Ant Design, marketing on shadcn): the strongest
  attack, and genuinely real — but the picker composes one stack per project, and every kept
  radio in the tree (desktop electron↔tauri, api-baas) over-fences the same multi-app monorepo
  shape. **Conceded as a block for D-306** (per-app selections are D-306-class semantics), radio
  stays.
- **Cherry-picking one component library's hooks beside another's components**
  (`@mantine/hooks` in a shadcn app): real but the skills teach the component systems, not the
  hook packages — advisory over-restriction, noted, radio stays.

### Where vuetify goes — in the radio, and the B2 coupling

vuetify is a kit (80+ pre-styled Material components — its body says so), so taxonomy puts it in
`web-ui-kit`. The radio then holds React kits and a Vue kit, exactly the shape of
`web-client-state` (React + Vue + Angular stores under one exclusive category, B2's open
question). The structural facts, stated so B3 lands the same side as B2:

- Every cross-framework kit pair (mui↔vuetify etc.) is **already unreachable**: the React kits
  carry `needsAny [react, nextjs, remix]`, vuetify carries
  `needsAny [vue-composition-api, nuxt]`, and `web-framework`/`web-meta-framework` are exclusive
  — no selection satisfies both. The 5 new fences the radio adds are vacuous today.
- The radio's live work is within-framework (shadcn↔mui), which group #14 already asserts; for
  Vue it is vacuous until a second Vue kit (PrimeVue, Quasar — not in catalog, nothing queued)
  joins, at which point it fences correctly for free.
- **Even if B2 splits per-framework state categories, `web-ui-kit` should stay one radio:** a
  per-framework kit split creates a sole-member Vue category, the exact duplicate-category smell
  B5's elysia disposition just removed. Consistency note handed to B2; the reachable semantics
  are identical either way.

### Why the headless residue stays open (attacked, sustained)

- **kit + primitive coexists by design:** shadcn is _built on_ Radix or Base UI — customizing a
  shadcn component IS writing primitive code, so shadcn-ui + radix-ui (or + base-ui) in one
  selection is the canonical deep-customization stack, and the July 2026 engine choice makes
  both primitive skills legitimate shadcn companions
  ([Base UI as the Default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)).
  A kit↔primitive fence would be flatly wrong; the split deliberately never creates one.
- **primitive ↔ primitive:** radix↔base-ui coexistence is live and steady-ish — Base UI is by
  the Radix/MUI/Floating-UI authors, shadcn ships both engines, and post-2025 Radix-maintenance
  concerns make incremental radix→base-ui adoption a multi-year reality, not a short migration
  window. headless-ui (Tailwind Labs) beside radix appears in real Tailwind-first codebases.
  No radio; a `discourages`-shaped "mixing primitive libraries" note goes to D-306.
- **tanstack-table** is a headless _table engine_, composing with any kit or primitive (a MUI
  app with a TanStack-powered table is normal). It belongs in the headless residue; a
  one-member `web-table` category was considered and rejected (sole-member smell again).

## The four missing `requires` bindings

All four use the sibling pattern already in the file (`needsAny [react, nextjs, remix]` — the
radix-ui/headless-ui shape at 483-487/567-571). Per decision 4a, **no new `compatibleWith`
groups ride along** — the field is scheduled for deletion; the 39/39 parity set deliberately
does not grow.

| skill             | proposed rule                                                     | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base-ui           | `needsAny [react, nextjs, remix]`                                 | Worksheet-flagged, CONFIRMED. Body: "The project is not React — these primitives are React-only"; package `@base-ui/react` (https://base-ui.com). Identical nature to its bound siblings radix-ui/headless-ui — the gap is an authoring omission, nothing subtler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| react-three-fiber | `needsAny [react, nextjs, remix]`                                 | Worksheet-flagged, CONFIRMED. R3F _is_ a React renderer for Three.js — `@react-three/fiber`, Canvas/useFrame hooks (https://r3f.docs.pmnd.rs). No non-React surface exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| dnd-kit           | `needsAny [react, nextjs, remix]`                                 | Worksheet-flagged, CONFIRMED — grounds are the skill body + npm, not the marketing site (citation replaced in verification: dndkit.com now reads "The modern toolkit for building drag and drop interfaces" and positions the project as framework-agnostic with React/Vue/Svelte/Solid support). The skill is `DndContext`/`useDraggable`/`useDroppable`/`useSortable` throughout (36 mentions; every import a `@dnd-kit/*` React package; zero vue/svelte/solid tokens in the directory), and npm `@dnd-kit/core` still self-describes as "a lightweight React library". The upstream multi-framework direction puts dnd-kit on the F2 promotion-path list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| lexical           | `needsAny [react, nextjs, remix]` — **NEW, not in the worksheet** | Re-grounded in verification on the **unfollowable-remainder branch of the CLI-405 rule**, the only grounds that carry it: the vanilla `createEditor()` + `setRootElement()` + `registerRichText()` bootstrap is never shown — zero `setRootElement` across all 5 files (1,552 lines); the only editor instantiation in the skill is `<LexicalComposer>` (SKILL.md:132); the plugin/registration mechanism exists only as React (`useLexicalComposerContext` + `useEffect`; reference.md's plugin table is 15/15 `@lexical/react`); a blocking MUST mandates cleanup from `useEffect`. Strip the React slices and the remaining patterns begin from a bare `editor` no reader can acquire. NOT grounds: taught-surface proportion (LOW — ~6% React-keyed lines, 4 of 7 core patterns neutral — it cuts the _other_ way) and self-scope (absent — metadata/description/When-NOT never say React). Vanilla constructors appear only as an HTML-config vehicle (serialization.md's `createEditor` never attaches to the DOM) and a server-side headless utility (`createHeadlessEditor`) — never as a client setup path. Upstream fact, non-load-bearing (payload doctrine — an install story neither creates nor removes a binding): lexical.dev lists "Quick Start (Vanilla JS)" first; `@lexical/react` is the sole first-party framework binding. Skills-repo note: add a self-scope line or a vanilla bootstrap section; the latter re-derives this row to class C no-requires (promotion trigger, F2 pattern). A blocked Vue/Svelte user is steered to tiptap — correct steering, not loss. |

**Bindings verified still correct (the batch's R flags):** radix-ui (React-only; `radix-vue` is
a third-party fork, now reka-ui — not this skill), headless-ui (**v2 is React-only; the Vue
package sits at v1.7 with no v2 roadmap** — the maintainer is sympathetic in discussion #3426
("I think we should do it but our plate is already full") — https://headlessui.com,
https://github.com/tailwindlabs/headlessui/discussions/3426 — and the skill teaches v2 anatomy
exclusively), tanstack-table (skill teaches `useReactTable` only), vuetify (Vue-only, correct
Vue-side binding), framer-motion (skill imports `motion/react` throughout; binding correct —
but see the Motion-for-Vue note in the manifest), and the four kit rules
(chakra/mantine/mui/ant-design — all React-only libraries).

### shadcn-ui's two rules — verified, both stay (question d)

The file's only two-rule skill: `needsAny [react, nextjs, remix]` (421-425) AND
`needs [tailwind]` (427-430), pinned by the EDITOR-11 golden
`closure-takes-only-the-unambiguous-requirement` (selection [SHADCN] → implied [TAILWIND] only).
Both survive 2026 reality: shadcn remains React-family-only, and **Tailwind remains an
architectural requirement**, unchanged by the Base UI default
([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default),
[Vercel: shadcn vs Radix](https://vercel.com/i/shadcn-vs-radix)). A third rule
`requires [radix-ui]` stays correctly absent, on two independent grounds: the primitive engine
is a vendored package dependency, not a skill dependency (B6's vercel-kv→upstash rejection
pattern), and since July 2026 the engine is a per-project _choice_ (Radix or Base UI) — a hard
requires on either would be factually wrong. The stale `compatibleWith` reason at line 189 dies
with the field (decision 4a); no edit needed if the deletion lands first.

## web-styling stays open (attacked, sustained) — and web-editor stays exclusive

**tailwind ↔ scss-modules:** the category's only alternatives-shaped pair (the "Styling"
purpose group at 879-881 already says so). Tailwind v4's own docs disclaim Sass as a
_preprocessor for Tailwind's pipeline_ ("not designed to be used with CSS preprocessors…
think of Tailwind itself as your preprocessor" — https://tailwindcss.com/docs/compatibility)
while allowing-but-discouraging CSS-modules-beside-Tailwind ("can co-exist… but we don't
recommend using CSS modules and Tailwind together if you can avoid it") — the vendor's own
allow-but-discourage stance _strengthens_ the chosen disposition and is cited as the D-306
`discourages` evidence; separate build pipelines
(Vite compiles `.module.scss` and Tailwind's CSS independently) make the mixed codebase —
Tailwind for new surfaces, an SCSS token system for legacy or bespoke sections — a real
steady state, not just a migration window. And the category cannot be exclusive anyway:
cva/theming/design-tokens compose with _either_ approach and with each other —
tailwind + cva is literally the shadcn stack, and 56 default stacks fill `web-styling`
(35 scss-modules, 21 tailwind) as the required category it is. A sub-radio
`{tailwind, scss-modules}` was considered and rejected: no fence exists today, coexistence is
documented, and decision-2's mechanism makes any new radio a hard block. Recorded for D-306 as
a `discourages`-shaped pair instead.

**web-editor (lexical XOR tiptap) — radio SUSTAINED.** The brief's attack — one app, two
editors on different surfaces (comment box + document editor) — is theoretically real but not
a steady state teams choose: both libraries cover both surfaces, and two editor frameworks
means two node-schema systems, two serialization formats and double bundle weight for zero
capability gain. Real-world coexistence is Draft.js/Quill _migrations toward_ one of these —
migration-window, non-blocking by the wave's semantics. Noted for D-306 as theoretical
over-restriction; no change.

## Manifest rows

Batch id `web-ui`, audited `2026-08-07`. Verdict shorthand: **constrained** =
`constrained-via-exclusivity-or-requires`.

| skill (current id)                                | category after split                  | verdict                             | class         | frameworks                                                                                  | derived-requires                                                                  | sources                                                                                                                                                     | notes                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn-ui (web-ui-shadcn-ui)                      | web-ui-kit                            | constrained                         | B             | [react]                                                                                     | keeps both existing rules: `needsAny [react, nextjs, remix]` + `needs [tailwind]` | https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default; https://vercel.com/i/shadcn-vs-radix                                                          | Base UI is the default engine since 2026-07; Radix stays supported (`npx shadcn init -b radix`). No requires on either primitive skill — engine is a vendored choice. Skill body documents the Base-UI option (Feb 2026) but predates the July default flip — re-weighting refresh (F1).                                                                                                                             |
| mui (web-ui-mui)                                  | web-ui-kit                            | constrained                         | C             | [react, nextjs]                                                                             | keep `needsAny [react, nextjs, remix]`                                            | skill body (Pattern 8: `@mui/material-nextjs` AppRouterCacheProvider; Vite setup in examples/core.md); https://mui.com                                      | SKILLS-01's named class-C proving case — body already has the react/nextjs host-wiring split the adapter migration will formalize. remix rides the react adapter via closure (F3).                                                                                                                                                                                                                                   |
| chakra-ui (web-ui-chakra-ui)                      | web-ui-kit                            | constrained                         | B             | [react]                                                                                     | keep `needsAny [react, nextjs, remix]`                                            | skill body (zero meta-framework branching); https://chakra-ui.com                                                                                           | React-only kit, v3 architecture.                                                                                                                                                                                                                                                                                                                                                                                     |
| mantine (web-ui-mantine)                          | web-ui-kit                            | constrained                         | B             | [react]                                                                                     | keep `needsAny [react, nextjs, remix]`                                            | skill body (zero meta-framework branching); https://mantine.dev                                                                                             | React-only kit.                                                                                                                                                                                                                                                                                                                                                                                                      |
| ant-design (web-ui-ant-design)                    | web-ui-kit                            | constrained                         | C             | [react, nextjs]                                                                             | keep `needsAny [react, nextjs, remix]`                                            | skill body (examples/nextjs.md: AntdRegistry SSR, App Router workarounds); https://ant.design                                                               | Same class-C shape as mui — a dedicated nextjs example file is an adapter in waiting.                                                                                                                                                                                                                                                                                                                                |
| vuetify (web-ui-vuetify)                          | web-ui-kit (**moves into the radio**) | constrained                         | B             | [vue-composition-api]                                                                       | keep `needsAny [vue-composition-api, nuxt]`                                       | skill body ("Vuetify is Vue-only"); https://vuetifyjs.com                                                                                                   | The radio's Vue seat. All 5 new kit fences it gains are unreachable via framework requires — see the B2 coupling note.                                                                                                                                                                                                                                                                                               |
| radix-ui (web-ui-radix-ui)                        | web-ui-components                     | constrained                         | B             | [react]                                                                                     | keep `needsAny [react, nextjs, remix]`                                            | https://www.radix-ui.com; skill body (React-specific, v1.4.x, unified `radix-ui` package)                                                                   | Composes with shadcn (its engine option) — must never share a radio with kits.                                                                                                                                                                                                                                                                                                                                       |
| headless-ui (web-ui-headless-ui)                  | web-ui-components                     | constrained                         | B             | [react]                                                                                     | keep `needsAny [react, nextjs, remix]`                                            | https://headlessui.com; https://github.com/tailwindlabs/headlessui/discussions/3426                                                                         | v2 React-only (skill's taught surface); `@headlessui/vue` frozen at v1.7 — binding stays react even though a Vue v1 exists, because the skill teaches v2 anatomy.                                                                                                                                                                                                                                                    |
| base-ui (web-ui-base-ui)                          | web-ui-components                     | constrained (**after new binding**) | B             | [react]                                                                                     | **ADD `needsAny [react, nextjs, remix]`**                                         | https://base-ui.com; skill body ("React-only", `@base-ui/react` v1.7.0)                                                                                     | The worksheet's high-confidence missing binding — confirmed. Now also shadcn's default engine (companion-skill role mirrors radix-ui's).                                                                                                                                                                                                                                                                             |
| tanstack-table (web-ui-tanstack-table)            | web-ui-components                     | constrained                         | B (as taught) | [react]                                                                                     | keep `needsAny [react, nextjs, remix]`                                            | skill body (`useReactTable`, `@tanstack/react-table` only); https://tanstack.com/table                                                                      | Library is class-C-shaped (official vue/solid/svelte/angular adapters upstream) but the skill teaches React only — class B until adapters are authored; promotion path recorded (F2 pattern).                                                                                                                                                                                                                        |
| tailwind (web-styling-tailwind)                   | web-styling                           | **universal**                       | C             | [—, see note]                                                                               | **none**                                                                          | https://tailwindcss.com/docs/compatibility; skill body (v4 CSS-first, `@tailwindcss/vite`/postcss/webpack branches)                                         | **The SKILLS-01 class-C exemplar, recorded.** Its host axis is the _bundler/meta-framework_ (vite, postcss, nextjs), not the UI framework — the adapter-filename rule ("must be framework skill slugs") needs a ruling before its adapters can be authored (F4). No requires: it styles any framework and none (apollo-server broad-surface precedent, verify-B5-B12 3). Inbound edge: shadcn-ui `needs [tailwind]`. |
| scss-modules (web-styling-scss-modules)           | web-styling                           | universal                           | A             | []                                                                                          | none                                                                              | skill body (SCSS modules + cascade layers + tokens, self-contained); https://sass-lang.com                                                                  | Framework-neutral methodology skill. tailwind↔scss-modules coexistence documented — D-306 discourages note, no fence.                                                                                                                                                                                                                                                                                                |
| cva (web-styling-cva)                             | web-styling                           | universal                           | A             | []                                                                                          | none                                                                              | skill body ("works with any CSS approach… across frameworks"); https://cva.style/docs                                                                       | The brief's question answered: binds to nothing — cva is a plain function producing class strings, host-agnostic. Class A exactly.                                                                                                                                                                                                                                                                                   |
| theming (web-styling-theming)                     | web-styling                           | universal                           | A             | []                                                                                          | none                                                                              | skill body (inline-script boot, `data-theme`, `color-scheme` — all platform-level)                                                                          | next-themes coverage is example-flavor (one section), not a binding — class A; a nextjs adapter would promote to C if ever split out.                                                                                                                                                                                                                                                                                |
| design-tokens (web-styling-design-tokens)         | web-styling                           | universal                           | A             | []                                                                                          | none                                                                              | skill body (DTCG, Style Dictionary, CSS custom properties); https://design-tokens.github.io/community-group/format/                                         | Pure architecture skill; composes with tailwind (its own utility-framework-bridge example) and scss alike.                                                                                                                                                                                                                                                                                                           |
| framer-motion (web-animation-framer-motion)       | web-animation                         | constrained                         | B (as taught) | [react]                                                                                     | keep `needsAny [react, nextjs, remix]` (R flag VERIFIED)                          | skill body (imports `motion/react` throughout); https://motion.dev/blog/introducing-motion-for-vue                                                          | Binding correct for the skill. Library is now class-C-shaped: **Motion for Vue is official** (feature-complete port, motion.dev/docs/vue) plus vanilla JS — a vue adapter would promote to C and widen the binding; promotion path recorded (F2).                                                                                                                                                                    |
| css-animations (web-animation-css-animations)     | web-animation                         | universal                           | A             | []                                                                                          | none                                                                              | skill body (pure CSS: transitions, keyframes, scroll-driven)                                                                                                | Platform skill, composes with framer-motion (own "when NOT to use" defers to a JS library).                                                                                                                                                                                                                                                                                                                          |
| view-transitions (web-animation-view-transitions) | web-animation                         | universal                           | A             | []                                                                                          | none                                                                              | skill body (native View Transitions API, feature-detected); https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API                            | Browser API — universal. Framework wrappers exist but the skill teaches the platform surface.                                                                                                                                                                                                                                                                                                                        |
| lexical (web-editor-lexical)                      | web-editor [X]                        | constrained                         | B (as taught) | [react]                                                                                     | **ADD `needsAny [react, nextjs, remix]` — proposed, see F5**                      | https://lexical.dev (`@lexical/react` sole first-party binding); skill body (LexicalComposer setup, useEffect registration)                                 | Radio vs tiptap sustained. Binding rests solely on the unfollowable-remainder branch (zero `setRootElement` in 1,552 lines; registration exists only as React) — proportion and self-scope are NOT grounds; non-React stacks are correctly steered to tiptap. Vanilla bootstrap section would re-derive to class C no-requires.                                                                                      |
| tiptap (web-editor-tiptap)                        | web-editor [X]                        | constrained (via radio)             | C             | [react, vue-composition-api (claimed, not demonstrated — 3 name-drop lines, zero Vue code)] | **none** — deliberate asymmetry with lexical                                      | https://tiptap.dev; skill body line 79 ("`@tiptap/core` works with vanilla JS; adapters add hooks but editor logic is shared")                              | First-party React AND Vue adapters plus a documented vanilla `Editor` class → a needsAny would wrongly block svelte/solid stacks where vanilla tiptap is first-class (apollo-server precedent). Class C with two live adapter targets.                                                                                                                                                                               |
| react-three-fiber (web-3d-react-three-fiber)      | web-3d                                | constrained (**after new binding**) | B             | [react]                                                                                     | **ADD `needsAny [react, nextjs, remix]`**                                         | https://r3f.docs.pmnd.rs ("R3F is a React renderer for Three.js"); skill body                                                                               | Worksheet-flagged, confirmed. A three.js-without-React user has no skill here — R3F is the React binding itself.                                                                                                                                                                                                                                                                                                     |
| dnd-kit (web-dnd-dnd-kit)                         | web-dnd                               | constrained (**after new binding**) | B (as taught) | [react]                                                                                     | **ADD `needsAny [react, nextjs, remix]`**                                         | skill body (DndContext/useDraggable/useDroppable/useSortable, all imports `@dnd-kit/*` React packages); npm `@dnd-kit/core` ("a lightweight React library") | Worksheet-flagged, confirmed. Stale dndkit.com "toolkit for React" citation replaced (site now claims framework-agnostic React/Vue/Svelte/Solid); on the F2 promotion-path list.                                                                                                                                                                                                                                     |

Class tallies: 4 new bindings, 0 removed, 0 loosened; 8 universal (tailwind, scss-modules, cva,
theming, design-tokens, css-animations, view-transitions — all class A except class-C tailwind —
plus none others), 14 constrained. Classes: A ×6, B ×12 (incl. 3 as-taught with promotion
paths), C ×4 (mui, ant-design, tailwind, tiptap).

## Findings

- **F1 — the shadcn-ui skill body documents the Base-UI _option_ but predates the July-2026
  _default flip_ (record-text overturn applied — "zero Base UI coverage" was false).** The
  body is current through Feb 2026: it carries 3 Base UI mentions (SKILL.md:380 documents the
  engine choice — "you can choose between Radix and Base UI as the primitive library"; :309
  "These components work across Radix and Base UI primitives"; reference.md:20) plus the
  Feb-2026 unified `radix-ui` package migration (:315-322), against 19 Radix-keyed mentions
  (not 25). Since 2026-07 new shadcn projects default to Base UI and the CLI takes `-b radix`,
  so the needed refresh is a **re-weighting** (Radix-default → Base-UI-default), not a
  from-zero introduction. Content note for the skills repo (B6-F3 pattern); placement, radio
  and both requires rules are unaffected.
- **F2 — four "class B as taught" skills sit on class-C-shaped libraries:** tanstack-table
  (official multi-framework adapters upstream), framer-motion (Motion for Vue official,
  vanilla core), **dnd-kit** (dndkit.com now claims framework-agnostic React/Vue/Svelte/Solid
  support; the npm package and the skill body are still React — added in verification), and —
  outside this batch but same shape — B5's apollo-server already set the precedent.
  Their react bindings are correct _for the taught content_; authoring vue/solid adapters later
  promotes them to C and widens the derived needsAny. The audit manifest should carry the
  promotion note so SKILLS-01's phase 4 sees it. lexical rides the same promotion list from
  the other direction: a vanilla bootstrap section re-derives it to class C no-requires.
- **F3 — the explicit `[react, nextjs, remix]` needsAny lists are closure-era redundant.**
  nextjs and remix both `require [react]`, so once EDITOR-11 step 2's shared closure lands,
  `needsAny [react]` alone reaches all three. The four new bindings copy the existing sibling
  shape for consistency; a mechanical narrowing sweep across all ~20 such lists is a
  post-closure cleanup item, not this batch's business.
- **F4 — tailwind's adapters break the adapter-slug rule as written.** SKILLS-01 requires
  adapter filenames to be _framework_ skill slugs, but tailwind's real host axis is
  vite/postcss/nextjs — bundler and meta-framework, not UI framework (`vite` is a
  `web-tooling` skill). The exemplar itself needs a SKILLS-01 ruling (allow tooling +
  meta-framework slugs as adapter targets, or leave tailwind adapter-less). Handed to the
  SKILLS-01 owner-decision pile.
- **F5 — the lexical/tiptap binding asymmetry, stated honestly (grounds re-cut in
  verification).** lexical gets a react binding; tiptap gets none (first-party React + Vue
  adapters, documented vanilla core; any needsAny under-counts its hosts). The discriminator
  is the **CLI-405 remainder-followability test**, run on demonstrated content with opposite
  outcomes: tiptap-minus-React is a licensed vanilla route missing one constructor call;
  lexical-minus-React has no way to obtain an editor or register anything (zero
  `setRootElement` in 1,552 lines). Taught-surface proportion (~6% vs ~6.5% React lines —
  nearly identical) and self-scope (absent in both) could not have separated them and are NOT
  the grounds. Upstream first-classness of vanilla — true for BOTH editors — changes neither
  verdict (payload doctrine: an install story neither creates nor removes a binding).
  Verification sustained both halves of the asymmetry on this re-cut ground.

### D-306 residue from this batch

- web-ui-kit over-fences the monorepo multi-app case (two apps, two kits) — recorded as a
  block over the category, same concession class as B6's baas↔db-host block;
- tailwind↔scss-modules: no fence today, none added, coexistence documented — a
  `discourages`-shaped pair when richer semantics exist;
- primitive mixing (radix-ui↔base-ui↔headless-ui): deliberate non-fence (migrations +
  shadcn's engine choice make coexistence real); optional `discourages` note;
- lexical↔tiptap two-surface coexistence: theoretical over-restriction of the kept radio;
- `@mantine/hooks`-beside-another-kit cherry-picking: advisory over-restriction of the kit
  radio.

## Contradicts-the-worksheet

1. **The missing-binding count is four, not three** — lexical rides beside base-ui,
   react-three-fiber and dnd-kit (§B3 never flagged the editor pair for bindings).
2. **vuetify belongs _inside_ the kit radio**, not in the composing residue where the
   worksheet's member listing left it. Cross-framework edges are unreachable via requires, so
   the move costs nothing and buys the correct fence the day a second Vue kit lands —
   the exact `web-client-state` structure; consistency coupling handed to B2.
3. **"Three different things in one category" is really four** — kits, primitives, a table
   engine, and a _Vue_ kit; the two-way split (kit radio + headless residue) absorbs all four
   without a third category.
4. **The shadcn `compatibleWith` reason "built on React + Radix UI" is stale** — Base UI has
   been the default engine since 2026-07 (Radix still supported). No fence changes; the reason
   text dies with decision 4a's deletion anyway, but if population lands first the string
   should be corrected in the same pass.
5. **Migration surface is near-zero, unlike B6's:** zero `"web-ui-components"` keys in
   `default-stacks.ts` (verified — no default stack assigns any UI-component skill), zero
   category-id literals in tests, mock data, `.ai-docs` or `apps/*` source (grep-verified;
   only generated matrices, `source-types`, and the two JSON schemas carry it). The worksheet's
   framing of group #14 as a B6-class "category change for the owner's eye" is right about the
   decision, wrong about the blast radius.
6. Confirmations, for the record: base-ui/r3f/dnd-kit bindings (worksheet right);
   cva/theming/design-tokens class A (right, plus scss-modules which it never flagged);
   tailwind class-C exemplar (recorded); web-editor radio survives its own over-strictness
   question; shadcn's two rules survive with the radix caveat above.

## Migration surfaces (named, NOT fixed here)

Variant-1 doctrine throughout (verify-B6 5.1): category moves are `category:` edits; **zero
skill-id renames** — ids keep their `web-ui-*` prefix under a `web-ui-kit` category by the same
live precedent as `api-framework-*` ids under `category: api-api`.

- **M1 — skills repo:** 6 `metadata.yaml` `category:` edits (shadcn-ui, mui, chakra-ui,
  mantine, ant-design, vuetify → `web-ui-kit`). No directory renames, no frontmatter changes.
- **M2 — category definitions:** `default-categories.ts` — add `web-ui-kit`
  (`exclusive: true`, `required: false`, order beside 9); re-cut `web-ui-components`
  (displayName "Headless Components", description naming Radix/Base UI/TanStack Table).
- **M3 — orders:** later web categories renumber around the new slot (web runs to order 25).
- **M4 — stacks:** none — zero web-ui category keys or skill values in `default-stacks.ts`
  (verified 2026-08-07).
- **M5 — generated artifacts:** both `matrix.ts` files, both `source-types.ts` files, and —
  release-gate blocking (verify-B6 5.3) — `metadata.schema.json` + `project-config.schema.json`
  via one `generate:types` + `generate:matrix` + `generate:schemas` round.
- **M6 — matrix hand-written:** `preload-defaults.ts` and `selection-scenarios.ts` are
  skill-id-keyed — untouched by the split. The four new `requires` rules DO touch EDITOR-11
  goldens: `conflict-partners-are-not-blocked` lists SHADCN in `inReach` from an empty
  selection and `closure-follows-one-requirement` lists RADIX/HEADLESS_UI — adding base-ui to
  those reach expectations (if the scenarios enumerate it) and any scenario touching lexical /
  r3f / dnd-kit reach must be re-derived; scenarios are data, adaptable by design.
- **M7 — rules:** `default-rules.ts` — group #14 dies with the split (Phase C); four new
  `requires` rules; the "UI Components (React)" alternatives group (917-919) re-cuts to
  "Design System Kit" + vuetify; the stale shadcn `compatibleWith` reason (189) per
  Contradicts §4.
- **M8 — docs:** `docs/web/editor-spec.md` and `.ai-docs` reference pages re-checked at apply
  time; no category-id hits found in either today.
