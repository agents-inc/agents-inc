# Web skills — doctrine alignment and concision

Progress file for the programme that brings all **84 `web-*` skills** in the
[`agents-inc/skills`](https://github.com/agents-inc/skills) marketplace (checkout at
`/home/vince/dev/skills`, skills under `src/skills/`) in line with the doctrine settled on
2026-09-03 and recorded in [`summoner-context-engineering-2026-09-03.md`](./summoner-context-engineering-2026-09-03.md).

**Started 2026-09-04.** One line per dispatch, appended as each lane lands — a correction read once
and discarded measures nothing.

The diffs land in the marketplace repository, not this one. This file lives here because
[`skills.md`](../skills.md) is the tracker for that repository's work.

---

> **Superseded in part by [pass 3](./web-skills-pass-3-2026-09-04.md)** (2026-09-04). Measuring
> this file's own claims turned up two surfaces neither pass reached: 38 files totalling 10,190
> lines that were never opened (this file estimated ~4,000), and 340 changed `examples/` files
> that were never audited for the substitutions pass 2 found elsewhere. The residual `You MUST`
> this file reports in the web skills do not exist — they are in two `meta-*` skills a glob swept
> in. See that file before trusting a figure here.

## What the pass changes

Every one of the 84 skills was written to a template that predates the doctrine. The census that
opened the programme, run from `/home/vince/dev/skills/src/skills`:

```bash
grep -rl "You MUST" web-*/SKILL.md | wc -l              # 84
grep -rl "CRITICAL:" web-*/SKILL.md | wc -l             # 84
grep -rl "When NOT to use" web-*/SKILL.md | wc -l       # 84
grep -rl "critical_reminders" web-*/SKILL.md | wc -l    # 84
grep -rl "Handled elsewhere" web-*/SKILL.md | wc -l     #  0
grep -rl "CLAUDE.md" web-*/ | wc -l                     # 74
```

So the shape is uniform and so is the defect. Against it:

| Rule (owner, 2026-09-03) | What the skill loses                                                                                    | What it gains                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Positive framing         | `**(You MUST …)**`, `CRITICAL:`, ALL-CAPS, the closing consequence line                                 | Each rule as the action to take, with its reason in the same breath                  |
| Progressive disclosure   | Full implementations sitting in `SKILL.md`                                                              | `SKILL.md` as the decision layer; code reached by a link                             |
| Concision                | Hedges, restating clauses, setup sentences, what a competent developer already knows                    | The same instruction in fewer words                                                  |
| Atomicity                | Cross-domain tool names, `@repo/*`, framework env prefixes, decision trees exiting the domain           | **Handled elsewhere**, naming a capability rather than a package                     |
| Vocabulary               | `When to use` / `When NOT to use` / `Key patterns covered`, `<critical_reminders>` as a verbatim repeat | `Applies to` / `Handled elsewhere`; the reminders block only where it adds something |

**There is no `SKILL.md` size budget** (owner ruling, 2026-09-03). Code moves out when a reader
looking for which approach to take has to page past implementations to find it.

## What the pass does not change

**This is not a research pass.** No WebSearch, no WebFetch, no version re-derivation. A pattern that
looks factually wrong is reported under `Suspected factual defects` and left alone; a later pass
owns it. The line counts below are shape and wording only.

---

## Two passes

**Pass 1 — doctrine alignment.** The rewrite above, skill by skill.

**Pass 2 — restoration, then surgical concision.** Two lenses, in that order; reversed, a cut
hides what the previous pass lost.

**Lens 1 restores.** Pass 1 removed 296 red-flag bullets from `SKILL.md` across the 84 skills while
`<critical_requirements>` held almost exactly (398→391). The rules survived; this lens asks what
went with the prose around them. The pre-pass tree is extracted from git to a baseline directory the
agents read alongside the current files — they hold no git, so a diff is otherwise impossible. For
every removed block there are four honest answers: still here, duplicated in a canonical home
(**verified by opening it**, not taken on pass 1's word), correctly removed per an explicit
do-not-restore list, or **gone while carrying an instruction, a reason or a caveat** — which is
restored, in the file the doctrine gives it and in the current voice.

**Lens 2 cuts**, at a higher bar than pass 1: the shorter version loses no instruction, no reason and
no caveat, and a finding is a quoted passage, its replacement and both word counts. A skill may
legitimately grow — if lens 1 restores more than lens 2 removes, the pass is working.

Added on the owner's approval, 2026-09-04, after the pass-1 verdict: a purely subtractive second
pass compounds any over-cutting, and this is the last pass that can catch a bad cut cheaply.

**Debt pass 1 is knowingly carrying into pass 2.** Three lanes reported large `examples/` files that
got the atomicity sweep but not the concision lens, because the lane ran out of room. Pass 2 opens
with these:

| Files                                                                                                                                  | Lines | Lane |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- |
| `web-state-ngrx-signalstore/examples/` — `effects.md`, `testing.md`, `migration.md`, `entities.md`, `features.md` (`core.md` was done) | 3,641 | 4    |
| `web-framework-solidjs/examples/resources.md`, `stores.md`                                                                             | 1,405 | 1    |

**One cross-skill overlap reported, not resolved** (the lane owned only one side):
`web-error-handling-error-boundaries` and `web-framework-react/examples/error-boundaries.md`
duplicate three things — the class boundary implementation, the granular-placement example, and the
"event handler / async / SSR errors never reach a boundary" sentence. The React file also imports
`./button`, a component it does not define. Suggested split: React keeps the two lifecycle methods
as React API and links out for placement, recovery and fallback design.

**One content gap found and deliberately not filled** (authoring, not aligning):
`web-styling-scss-modules` never explains the thing it is named for — how a `*.module.scss` file
becomes an imported `styles` object, class-name hashing, or camelCase conversion. A reader learns
cascade layers and `@use` there and nothing about module scoping itself.

---

## Final result — both passes, measured

| Layer                                                      | Before  | After pass 1 | After pass 2 | Net      |
| ---------------------------------------------------------- | ------- | ------------ | ------------ | -------- |
| **`SKILL.md`** — loads whole on every invocation           | 37,329  | 26,497       | 26,549       | **−29%** |
| **Everything** — `SKILL.md` + `reference.md` + `examples/` | 192,448 | 152,756      | 153,270      | **−20%** |
| `<critical_requirements>` entries                          | 398     | 391          | 388          | −2.5%    |
| `<red_flags>` bullets                                      | 1,529   | 1,233        | 1,227        | −20%     |
| Code snippets in `SKILL.md`                                | 813     | 680          | 683          | −16%     |

**Pass 2 added 514 lines net** — restorations, the substitution repairs, and the newly written
content — against removals from its concision lens. That is the pass working: it was never meant to
shrink the tree further, and a lane that restored more than it cut was doing its job.

**The rules held almost exactly** while the file around them lost nearly a third. That is the number
that answers "did we lose useful context": `<critical_requirements>` moved 398 → 388 across both
passes, and the ~100 items pass 2 restored were overwhelmingly _reasons, identifiers and limits_
attached to rules that themselves survived.

### Gates, final run

| Gate                                                    | Result                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bun scripts/validate-metadata.mjs`                     | All 238 skills pass                                                                                                             |
| `npx prettier --check "src/skills/web-*/**/*.md"`       | All matched files use Prettier code style                                                                                       |
| Mangled-generic scan                                    | Clean                                                                                                                           |
| Empty files / leftover stubs                            | Clean — 5 superseded files deleted across both passes                                                                           |
| Dangling intra-skill `.md` links (code fences excluded) | Clean — 1 real defect found and fixed (`web-state-ngrx-signalstore/reference.md` pointed at `../examples/`, escaping the skill) |

`npx agents-inc doctor` remains the owner's to run, from a project with these skills installed.

---

## Result of pass 1 — measured, not estimated

Every `.md` file in the 84 `web-*` skills, before against after. "Before" is read from git objects at
the commit the programme opened on, so it is not a remembered figure.

| Layer                                                             | Before  | After   | Cut      |
| ----------------------------------------------------------------- | ------- | ------- | -------- |
| **`SKILL.md`** — loads whole, on every invocation of the skill    | 37,329  | 26,497  | **−29%** |
| **Everything** — `SKILL.md` + `reference.md` + all of `examples/` | 192,448 | 152,756 | **−21%** |

The two numbers differ for the right reason. `SKILL.md` is the layer that is paid for on every task
touching the technology, and it took the deeper cut; `examples/` and `reference.md` are dormant on
disk until something reaches for them by name, and several of them are code-dominant, where the
wording lens has little leverage. Four skills' `SKILL.md` **grew**, each because its patterns were a
title, a list and a link — a decision layer that could not be used without opening another file.

Both "after" figures are post-Prettier: the tree was formatted with the repository's own config once
pass 1 landed, which added ~1,400 lines of pure rewrapping and is why these are slightly above the
raw post-edit counts.

Reproduce with, from `/home/vince/dev/skills`:

```bash
for f in $(git ls-tree -r --name-only HEAD src/skills | grep -E '^src/skills/web-[^/]*/.*\.md$'); do
  git show HEAD:"$f"; done | wc -l          # before
cat src/skills/web-*/SKILL.md src/skills/web-*/reference.md src/skills/web-*/examples/*.md | wc -l  # after
```

---

## Progress

Status values: `pending` → `pass 1` → `pass 2` → `done`.

### Lane 1 — frameworks

| Skill                             | Pass 1 | Pass 2 | SKILL.md lines |
| --------------------------------- | ------ | ------ | -------------- |
| web-framework-react               | pass 1 | pass 2 | 371→259        |
| web-framework-solidjs             | pass 1 | pass 2 | 502→245        |
| web-framework-svelte              | pass 1 | pass 2 | 611→241        |
| web-framework-vue-composition-api | pass 1 | pass 2 | 419→352        |
| web-framework-angular-standalone  | pass 1 | pass 2 | 786→323        |

### Lane 2 — meta-frameworks (React family)

| Skill                        | Pass 1 | Pass 2 | SKILL.md lines |
| ---------------------------- | ------ | ------ | -------------- |
| web-meta-framework-nextjs    | pass 1 | pass 2 | 1136→367       |
| web-meta-framework-nuxt      | pass 1 | pass 2 | 407→359        |
| web-meta-framework-remix     | pass 1 | pass 2 | 420→369        |
| web-meta-framework-sveltekit | pass 1 | pass 2 | 746→353        |

### Lane 3 — meta-frameworks (content and edge)

| Skill                         | Pass 1 | Pass 2 | SKILL.md lines |
| ----------------------------- | ------ | ------ | -------------- |
| web-meta-framework-astro      | pass 1 | pass 2 | 748→338        |
| web-meta-framework-qwik       | pass 1 | pass 2 | 566→315        |
| web-meta-framework-docusaurus | pass 1 | pass 2 | 392→278        |
| web-meta-framework-vitepress  | pass 1 | pass 2 | 426→304        |

### Lane 4 — client state

| Skill                      | Pass 1 | Pass 2 | SKILL.md lines |
| -------------------------- | ------ | ------ | -------------- |
| web-state-zustand          | pass 1 | pass 2 | 255→176        |
| web-state-jotai            | pass 1 | pass 2 | 297→260        |
| web-state-mobx             | pass 1 | pass 2 | 414→330        |
| web-state-redux-toolkit    | pass 1 | pass 2 | 272→275        |
| web-state-pinia            | pass 1 | pass 2 | 286→237        |
| web-state-ngrx-signalstore | pass 1 | pass 2 | 415→285        |

### Lane 5 — data fetching

| Skill                            | Pass 1 | Pass 2 | SKILL.md lines |
| -------------------------------- | ------ | ------ | -------------- |
| web-data-fetching-graphql-apollo | pass 1 | pass 2 | 452→352        |
| web-data-fetching-graphql-urql   | pass 1 | pass 2 | 301→299        |
| web-data-fetching-swr            | pass 1 | pass 2 | 387→338        |
| web-data-fetching-trpc           | pass 1 | pass 2 | 366→295        |
| web-server-state-react-query     | pass 1 | pass 2 | 255→212        |

### Lane 6 — forms

| Skill                     | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------------- | ------ | ------ | -------------- |
| web-forms-react-hook-form | pass 1 | pass 2 | 334→315        |
| web-forms-tanstack-form   | pass 1 | pass 2 | 385→361        |
| web-forms-vee-validate    | pass 1 | pass 2 | 272→307        |
| web-forms-zod-validation  | pass 1 | pass 2 | 345→317        |

### Lane 7 — routing and realtime

| Skill                       | Pass 1 | Pass 2 | SKILL.md lines |
| --------------------------- | ------ | ------ | -------------- |
| web-routing-react-router    | pass 1 | pass 2 | 477→278        |
| web-routing-tanstack-router | pass 1 | pass 2 | 494→328        |
| web-realtime-socket-io      | pass 1 | pass 2 | 323→274        |
| web-realtime-sse            | pass 1 | pass 2 | 478→241        |
| web-realtime-websockets     | pass 1 | pass 2 | 382→338        |

### Lane 8 — styling

| Skill                     | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------------- | ------ | ------ | -------------- |
| web-styling-cva           | pass 1 | pass 2 | 381→257        |
| web-styling-design-tokens | pass 1 | pass 2 | 463→375        |
| web-styling-scss-modules  | pass 1 | pass 2 | 241→322        |
| web-styling-tailwind      | pass 1 | pass 2 | 501→382        |
| web-styling-theming       | pass 1 | pass 2 | 473→377        |

### Lane 9 — UI kits (A)

| Skill             | Pass 1 | Pass 2 | SKILL.md lines |
| ----------------- | ------ | ------ | -------------- |
| web-ui-ant-design | pass 1 | pass 2 | 547→413        |
| web-ui-base-ui    | pass 1 | pass 2 | 479→349        |
| web-ui-chakra-ui  | pass 1 | pass 2 | 454→305        |

### Lane 10 — UI kits (B)

| Skill              | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------ | ------ | ------ | -------------- |
| web-ui-headless-ui | pass 1 | pass 2 | 530→408        |
| web-ui-mantine     | pass 1 | pass 2 | 774→361        |
| web-ui-mui         | pass 1 | pass 2 | 588→377        |

### Lane 11 — UI kits (C)

| Skill                 | Pass 1 | Pass 2 | SKILL.md lines |
| --------------------- | ------ | ------ | -------------- |
| web-ui-radix-ui       | pass 1 | pass 2 | 515→319        |
| web-ui-shadcn-ui      | pass 1 | pass 2 | 403→318        |
| web-ui-tanstack-table | pass 1 | pass 2 | 404→418        |
| web-ui-vuetify        | pass 1 | pass 2 | 405→351        |

### Lane 12 — testing (runners and E2E)

| Skill                      | Pass 1 | Pass 2 | SKILL.md lines |
| -------------------------- | ------ | ------ | -------------- |
| web-testing-vitest         | pass 1 | pass 2 | 235→265        |
| web-testing-cypress-e2e    | pass 1 | pass 2 | 304→322        |
| web-testing-playwright-e2e | pass 1 | pass 2 | 438→322        |

### Lane 13 — testing (component and visual)

| Skill                             | Pass 1 | Pass 2 | SKILL.md lines |
| --------------------------------- | ------ | ------ | -------------- |
| web-testing-react-testing-library | pass 1 | pass 2 | 577→256        |
| web-testing-vue-test-utils        | pass 1 | pass 2 | 489→222        |
| web-testing-visual-regression     | pass 1 | pass 2 | 417→273        |

### Lane 14 — tooling and mocks

| Skill                         | Pass 1 | Pass 2 | SKILL.md lines |
| ----------------------------- | ------ | ------ | -------------- |
| web-tooling-component-library | pass 1 | pass 2 | 394→252        |
| web-tooling-storybook         | pass 1 | pass 2 | 666→282        |
| web-tooling-vite              | pass 1 | pass 2 | 384→257        |
| web-mocks-msw                 | pass 1 | pass 2 | 210→188        |

### Lane 15 — animation

| Skill                          | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------------------ | ------ | ------ | -------------- |
| web-animation-css-animations   | pass 1 | pass 2 | 429→330        |
| web-animation-framer-motion    | pass 1 | pass 2 | 401→410        |
| web-animation-view-transitions | pass 1 | pass 2 | 354→383        |

### Lane 16 — errors, performance, accessibility

| Skill                               | Pass 1 | Pass 2 | SKILL.md lines |
| ----------------------------------- | ------ | ------ | -------------- |
| web-error-handling-error-boundaries | pass 1 | pass 2 | 457→239        |
| web-error-handling-result-types     | pass 1 | pass 2 | 581→284        |
| web-performance-web-performance     | pass 1 | pass 2 | 271→263        |
| web-accessibility-web-accessibility | pass 1 | pass 2 | 459→313        |

### Lane 17 — i18n

| Skill               | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------- | ------ | ------ | -------------- |
| web-i18n-next-intl  | pass 1 | pass 2 | 643→286        |
| web-i18n-react-intl | pass 1 | pass 2 | 356→294        |
| web-i18n-vue-i18n   | pass 1 | pass 2 | 551→266        |

### Lane 18 — files and PWA

| Skill                          | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------------------ | ------ | ------ | -------------- |
| web-files-file-upload-patterns | pass 1 | pass 2 | 358→295        |
| web-files-image-handling       | pass 1 | pass 2 | 281→247        |
| web-pwa-offline-first          | pass 1 | pass 2 | 275→290        |
| web-pwa-service-workers        | pass 1 | pass 2 | 349→331        |

### Lane 19 — utilities

| Skill                   | Pass 1 | Pass 2 | SKILL.md lines |
| ----------------------- | ------ | ------ | -------------- |
| web-utilities-date-fns  | pass 1 | pass 2 | 417→228        |
| web-utilities-native-js | pass 1 | pass 2 | 258→213        |
| web-utilities-rxjs      | pass 1 | pass 2 | 483→274        |
| web-utilities-vueuse    | pass 1 | pass 2 | 468→258        |

### Lane 20 — dataviz, 3D and drag-and-drop

| Skill                    | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------------ | ------ | ------ | -------------- |
| web-dataviz-d3           | pass 1 | pass 2 | 539→380        |
| web-dataviz-recharts     | pass 1 | pass 2 | 488→295        |
| web-3d-react-three-fiber | pass 1 | pass 2 | 535→355        |
| web-dnd-dnd-kit          | pass 1 | pass 2 | 465→372        |

### Lane 21 — editors and maps

| Skill              | Pass 1 | Pass 2 | SKILL.md lines |
| ------------------ | ------ | ------ | -------------- |
| web-editor-lexical | pass 1 | pass 2 | 471→349        |
| web-editor-tiptap  | pass 1 | pass 2 | 448→382        |
| web-maps-leaflet   | pass 1 | pass 2 | 500→350        |
| web-maps-mapbox    | pass 1 | pass 2 | 531→407        |

---

## Pass 2 — restoration tallies

The ratio each lane reports: items restored over removed blocks traced. It is the number that says
whether pass 1 was calibrated or whether the 29% cut quietly cost something.

| Lane                          | Restored                                        | Removals traced   | Ratio        |
| ----------------------------- | ----------------------------------------------- | ----------------- | ------------ |
| 3 — content meta-frameworks   | 1                                               | 76                | 1 in 76      |
| 2 — React meta-frameworks     | 10                                              | ~190              | 1 in 19      |
| 1 — frameworks                | 4 (+3 substitutions)                            | ~185              | 1 in 46      |
| 5 — data fetching             | 6                                               | ~275              | 1 in 46      |
| 7 — routing and realtime      | 3 (+1 substitution)                             | ~250              | 1 in 83      |
| 6 — forms                     | 4 (+5 substitutions)                            | ~120              | 1 in 30      |
| 4 — client state              | 5 (+2 substitutions)                            | ~120              | 1 in 24      |
| 10 — UI kits B                | 5                                               | ~60               | 1 in 12      |
| 13 — component/visual testing | 2 (+3 substitutions)                            | ~255              | 1 in 128     |
| 9 — UI kits A                 | 5 (+1 substitution)                             | ~105              | 1 in 21      |
| 8 — styling                   | 5                                               | ~64               | 1 in 13      |
| 11 — UI kits C                | 5 (+1 substitution)                             | ~200              | 1 in 40      |
| 12 — test runners/E2E         | 6 (+4 fixes)                                    | ~95               | 1 in 16      |
| 14 — tooling and mocks        | 10 (+2 substitutions)                           | ~210              | 1 in 21      |
| 15 — animation                | 3 (+2 substitutions)                            | ~84               | 1 in 28      |
| 21 — editors and maps         | 2                                               | ~290              | 1 in 145     |
| 17 — i18n                     | 9 (+2 substitutions)                            | ~150              | 1 in 17      |
| 18 — files and PWA            | **0** (+5 substitutions)                        | ~90               | none         |
| 19 — utilities                | 4 (+6 fixes)                                    | ~100              | 1 in 25      |
| 20 — dataviz/3D/dnd           | 6 (+2 logic bugs)                               | ~300              | 1 in 50      |
| 16 — errors/perf/a11y         | 7 (+4 substitutions)                            | ~115              | 1 in 16      |
| **Total, 21 lanes**           | **~100 restored, ~30 substitutions/bugs fixed** | **~3,000 traced** | **~1 in 30** |

**What the losses actually were.** Lane 2's summary is the useful one: _nine of its ten restorations
were lookups and API names, not caveats — the caveats survived._ The two skills that shrank hardest,
`nextjs` (SKILL.md −67%) and `sveltekit` (−52%), lost three items between them, and both sveltekit
restorations came from the same `<integration>` block rather than from the pattern surgery. Every
relocation either lane opened and checked held.

**A correction to what this file claimed about pass 1's reach.** Lane 1 measured it: pass 1 touched
`SKILL.md` and `reference.md` in that lane and **left the example files alone** — baseline and current
are identical heading-for-heading and Why-clause-for-Why-clause across all four Svelte example files,
all eight Vue ones, all six Angular ones and Solid's `components.md`. Roughly **4,000 lines more
unexamined than the two files this programme had recorded as debt**. The whole-tree figures above are
still correct as measured; what was wrong was the assumption that the cut was evenly distributed.
Lens 2 in later waves should not assume an example file has already been read.

**Two skills are hollow in a way neither pass created, and lens 2 surfaced it.**
`web-server-state-react-query` is the sharper case: pass 1 rescoped it from "React Query + hey-api" to
React Query, and lane 5 found the rescope **inverted** — hey-api is not a branch that survived, it is
100% of the patterns and 100% of the example corpus, and the React Query branch pass 1 added is the
orphan. Absent from the baseline too: any `useMutation` pattern, any invalidation pattern,
`useInfiniteQuery`, and any worked treatment of `staleTime` vs `gcTime` — which the Quick Guide names
as the skill's central fact. Its `description` promised mutations and was corrected to stop promising
absent content. Filling it is Create-sized work and wants its own dispatch.

## The Svelte `createContext` flag, settled — and it went the other way

The programme's earliest and highest-severity suspected defect was `web-framework-svelte`'s
**critical requirement telling agents to call `createContext`**, which pass 1's lane suspected did not
exist. Pass 2's lane found it imported from the framework package itself, propagated into
`reference.md`'s decision tree and the auto-detection keywords, and — unable to research — did the
defensible thing: it **wrote the helper over `setContext`/`getContext`**, which are unambiguously
real, so the skill would be correct either way. It explicitly said reverting was two lines per site if
the export turned out to exist.

**It exists.** Verified against Svelte's own
`documentation/docs/06-runtime/02-context.md` via Context7: `createContext<T>()` is exported from
`svelte`, returns a `[get, set]` pair, and the docs describe `setContext` as "an alternative to
`createContext` for older Svelte versions". So the original skill was right, my early flag was wrong,
and the defensive fix — while correct — spent fifteen lines re-implementing what the framework ships.

Reverted: `examples/advanced.md` Pattern 2 now teaches `createContext` from `svelte` directly, with
one sentence saying the hand-rolled `Symbol` wrapper is what to write on a version without it. The
critical requirement, the reference tree and the auto-detection list follow. A duplicated declaration
block the revert exposed was removed.

**The lane's own closing note is the lesson, and it is worth keeping.** It reported that in its first
report it had run the substitution check only as a by-product of the restoration check — "I checked
'was anything lost' and, where a block had been genericised, I did not separately ask 'is what
replaced it real'. The Svelte defect was visible in the file I read to verify something else, and I
recorded it as evidence without questioning the import above it." Two different questions, one of
which does not answer the other.

## The visual-regression copy-pasteability question, ruled

Pass 1 replaced every harness API in `web-testing-visual-regression` with a `matchScreenshot(...)`
stand-in, leaving no runnable snippet. I put the question to lane 13 and **accept its recommendation
not to restore a worked example.** Its reasoning, which corrected my framing:

- **"No copy-pasteable snippet left" was false as stated.** `examples/determinism.md` retains
  `page.clock.setFixedTime`, `page.clock.fastForward`, `page.addInitScript`, `deviceScaleFactor`,
  `locale`, `timezoneId`, a `docker run` line and a `stabilize.css` that is 100% runnable. What has no
  concrete form anywhere is **the assertion itself**.
- **So the skill was not uniformly genericised — it was inconsistently genericised**, and that
  inconsistency produced the one real defect: `SKILL.md` invented `freezeClockAt(...)` for the same
  operation `determinism.md` spells out concretely two files away. Prose and code disagreeing across a
  skill is the same failure as the `web-realtime-socket-io` "raw sockets" case.
- **A named worked example would pre-empt the skill's own Pattern 0**, which is the harness choice,
  and make the skill depend on two others a reader may not have.

Fixed instead: every stand-in now declares itself, and `SKILL.md` points at `determinism.md` for the
fuller call shapes — about forty words. If this is overruled, the lane's proposed shape is one
additive `examples/worked-example.md` carrying a single end-to-end test in one named harness, linked
rather than replacing anything, so nothing above it changes.

**The Pinia relocation is confirmed sufficient, not merely present.** Lane 13 read
`web-state-pinia/examples/testing.md` in full: `createTestingPinia`, `initialState` keyed by store id,
`stubActions: false`, assigning an action implementation, the `createSpy` escape hatch, and the
getters-ignore-`initialState` caveat with the Options-vs-Setup difference — materially richer than the
vue-test-utils content it replaced. **No addition needed.** And the critical requirement I recorded as
lost was not: it was replaced by a broader one carrying the same instruction, promoted from a
`reference.md` anti-pattern into `<critical_requirements>`.

**Two attributions I got wrong, both corrected by the lanes.** `web-ui-vuetify`'s mangled
`const form = (ref < HTMLFormElement) | (null > null);` is **in the baseline** at both sites — it
predates the programme, and pass 1 neither caused it nor fixed it; my dispatch read as though pass 1
had. Likewise `web-routing-tanstack-router`'s `context.dataClient`. The repairs stand; the blame
was misplaced.

**One consequence of my own file renames, worth knowing:** the baseline no longer mirrors the tree
exactly. `web-testing-visual-regression/examples/story-driven.md` is `catalog-driven.md` now, and the
same applies to the four other renames this programme made, so a mechanical file-by-file baseline diff
reports a spurious deletion and a spurious addition for each.

## Provenance: composition stays, comparison goes

Lane 9 caught two lanes treating identical content differently — `web-ui-base-ui`'s "built by the
creators of Radix, Material UI and Floating UI" was deleted, while `web-ui-chakra-ui`'s
"a token-and-recipe API **in the shape Panda CSS popularised**" was kept. It changed neither and asked
for one rule.

**The rule falls out of lane 11's composition ruling rather than being a new one: a skill keeps the
names of what it is _composed of_; what it merely _resembles_ goes.** Ark UI, Emotion and Park UI are
Chakra's actual dependencies and stay. Panda CSS is a stylistic comparison — cut. Base UI's
provenance line was correctly deleted on the same test, and the half of it that does real work (the
Radix mental model transfers) survives where it is actionable, in `reference.md`'s migration section.

## A fifth class: the last surviving copy of a named identifier

Lane 9's characterisation of what pass 1 actually got wrong in its lane, which is narrower and more
specific than under-specification: **four times it deleted the last surviving copy of a small named
thing** while the surrounding prose kept the concept — `sticky` on Base UI's `Positioner`, `virtual`
on Ant Design's `Select` and `Tree`, `undefined` as a Chakra breakpoint skip, and Chakra's `hideFrom`
(pass 1 kept `hideBelow` and dropped its complement).

None is reconstructible: a reader would guess `null` for the breakpoint skip, or omit the slot and
shift every later value. **These are invisible to a section-level review** — the section reads
complete — and findable only by grepping the identifier across the whole skill. That is the method to
carry into any later pass.

## A sixth class: a rule with its counterweight removed

Lane 16's name for two of its five error-boundary restorations, and it is distinct from
under-specification: **pass 1 kept a rule and dropped its limit.** Granularity was pushed in the Quick
Guide, a critical requirement, the philosophy and Pattern 5 with nothing pulling the other way, after
the baseline's "every component → NO, too much overhead" went; and `flatMap` was taught with the
nested-`Result` trap it exists to prevent left unnamed. **A rule with its counterweight removed reads
as stronger than the author meant.**

## The reset test that stopped working

The single worst item lane 16 found, and a pass-1 regression rather than an inheritance. Pass 1's
framework-neutral rewrite of `examples/testing.md` reduced the baseline's working four-step reset
sequence to "flip the condition → click reset". That does not work: flipping a captured variable does
not change the element the boundary was already handed, so the child throws again and **a correct
reset reads as broken**. Restored with the mechanism — `children` is the same element object — rather
than the old wording.

## A skill that teaches contrast was mislabelling contrast

Lane 16 computed it by hand and flagged it rather than changing it. I verified with the WCAG relative
luminance formula, which is deterministic arithmetic rather than research:

| Colour on white | Claimed                | Actual                            |
| --------------- | ---------------------- | --------------------------------- |
| `#0066cc`       | **7.4:1 — clears AAA** | **5.57:1 — clears AA, fails AAA** |
| `#ffeb3b`       | 1.4:1                  | 1.22:1                            |
| `#1a1a1a`       | 16.1:1                 | 17.40:1                           |
| `#4a4a4a`       | 9.7:1                  | 8.86:1                            |
| `#6b6b6b`       | 5.7:1                  | 5.33:1                            |

The first is the one that matters: a primary-button colour presented as AAA-conforming is AA. It is
**pre-existing** — the baseline said 7.37:1 and pass 1 rounded it — so both passes read past it. All
five corrected.

## `web-framework-react/examples/error-boundaries.md`: deleted

Both owning lanes verified the overlap independently and agreed. `web-error-handling-error-boundaries`
carries a **strict superset** of all five items: the class implementation (plus `fallback`,
`fallbackRender`, `onReset` and a default `role="alert"`), the no-hook-equivalent fact, granular
placement (plus a bad counter-example and the upper bound restored this pass), the
"event-handler/async/SSR never reach a boundary" rule (stated three times), and — absorbed during pass
2 — "an uncaught render error unmounts the whole root".

Two further reasons to prefer the surviving copy: the React file imported types without `import type`,
which fails under `verbatimModuleSyntax`, and its positional `fallback(error, reset)` diverged from
`react-error-boundary`'s `fallbackRender({ error, resetErrorBoundary })`, so a reader who later
installed the library had to unlearn it. Deleted, with its five inbound links resolved.

## A red flag earns its place by giving the symptom, not by restating the action

Lane 20 cut **16 red-flag bullets** across its four skills, each a near-verbatim restatement of a
`<critical_requirements>` entry in the same always-loaded file, and asked whether other lanes had done
the same before it left the catalogue inconsistent. **The cuts stand, and the test it used is the
rule.**

The two sections have different jobs, which the atomicity bible's own Content Standard sets out:
`<critical_requirements>` is _the action to take_, `<red_flags>` is _the failure mode_. A red flag
restating the action adds nothing on a file that loads whole. A red flag naming the **symptom** earns
its place — and lane 20 applied exactly that distinction unprompted, keeping R3F's allocation bullet
"because the stutter symptom is a diagnostic the requirement does not give."

This is the same rule prompt-bible Technique #3 already applies to `<critical_reminders>`, extended
one section along. Earlier lanes made the same cut in the same direction (ant-design, framer-motion),
so the catalogue is consistent.

## Two logic bugs in code that had more scrutiny than anything else in its lane

Lane 20's dnd-kit Kanban — which my dispatch wrongly described as newly authored by pass 1, when it is
byte-identical baseline code — carried two stale-index bugs, both pre-existing:

- **`handleDragOver` could delete the wrong card.** `findContainer` read render-time `columns` while
  the updater read `prev`; with two drag-over events in one batch, `activeIndex` came back `-1` and
  `activeItems.splice(-1, 1)` removed the **last card of the source column** and inserted that into
  the target. The tell was an asymmetry — `overIndex` was already guarded and `activeIndex` was not.
- **`handleDragEnd` computed indexes against a different array than it mutated**, `columns[…]`
  feeding `arrayMove(prev[…], …)`.

## Vue Router: ruled, no action

Lane 17 flagged an apparent inconsistency — `web-i18n-vue-i18n`'s vue-router imports were genericised
while `web-state-pinia/examples/core.md` still imports `useRoute, useRouter` and
`web-meta-framework-nuxt/examples/middleware.md` still imports `RouteLocationNormalized`. **No change
needed, and the cases are not alike.**

There is no `web-routing-vue-router` skill in the catalogue, so naming Vue Router couples nothing.
What made vue-i18n's case a violation was not the import but what sat under it: it was **teaching a
route table** — another domain's content — and that made the example unusable for a Vue app routing
differently. Pinia _using_ `useRoute` and Nuxt naming a type from the router it actually ships are
composition and incidental use respectively, both of which the composition ruling permits.

The distinction to carry forward: **importing a neighbour's API is not the defect; teaching its
subject is.**

## A fourth class: under-specification — the rule kept, the identifier dropped

Lane 10 has the programme's highest restoration rate (1 in 12) and named why: _"its worst failure
mode here was not deletion but under-specification — three of my five restorations are cases where it
kept the rule and dropped the identifier the reader needs to act on it."_

- Mantine's Pattern 5 kept the reason — "the resolver package exports a differently-named function per
  major, so a mismatched pair fails at the import" — and dropped the names. A reader now knows a
  differently-named export exists and cannot type it. `zod4Resolver` restored.
- MUI's replacement bullet said `TextField` "is controlled or uncontrolled like any input", which is
  **the one thing it is not** — the skill's own red flag two sections later calls it "three components
  in a trench coat". `inputRef` restored.
- Mantine's theming pattern kept "define ten shades" and dropped the generator that produces them —
  the actual friction point, named nowhere else.

Lane 17's independent characterisation is the same finding in different words — its 9 restorations
were _"concentrated entirely in reasons rather than rules. Every baseline rule survived somewhere;
what pass 1 dropped was the 'why' attached to it."_ Two lanes, two vocabularies, one defect: the
instruction survives and what makes it followable does not.

**The test:** after the cut, can a reader _act_ on the rule, or only agree with it? This is invisible
to the restoration lens as first written, because nothing was lost — the sentence is still there.

## A second fabricated fact, and this one pointed the reader the harmful way

Lane 19 found that pass 1 **added** a red flag to `web-utilities-native-js`, in two files:

> "`arr.at(-1)` is typed as `T | undefined` **only under** `noUncheckedIndexedAccess`; without it,
> TypeScript will let an empty array's last element flow on as `T`."

`at()` is a method — `RelativeIndexable<T>.at(index: number): T | undefined` in
`lib.es2022.array.d.ts` — so its return type does not move with a compiler flag. The flag governs
_index access_, the opposite half of the comparison. **As written it told a reader they may skip the
undefined check**, which is the harmful direction to be wrong in. Corrected in both files to state
which form actually lets an `undefined` through.

Same shape as the Framer Motion spring rule below: a cleanup pass inventing a confident technical
claim. Two instances now, both introduced rather than inherited, and **neither findable by a
restoration lens** — nothing was lost in either case.

## The single worst defect the programme produced — a fabricated fact

Lane 15 found it, in the lane that had self-reported **"Corrections: nothing"** in pass 1. Pass 1
_added_ a sentence to `web-animation-framer-motion/reference.md` that the baseline never had:

> "Damping below roughly a third of the square root of stiffness overshoots; above it settles without
> bounce."

It is numerically wrong **and self-contradicting inside its own code block**: by its own rule,
`BOUNCY_SPRING` (stiffness 300, damping 10) would need damping under 5.8 to bounce — so the preset
named "bouncy", four lines above, would not. Replaced with the real critical-damping relation, and
crucially **checked against the file's own data rather than from memory**: with Motion's default
`mass: 1` a spring stops overshooting at `damping = 2 × √stiffness`, and `GENTLE_SPRING` (stiffness
100, damping 20) sits exactly on `2 × √100 = 20`, which is what confirms it.

A cleanup pass invented a physics rule of thumb and shipped it into a reference table. Nothing in the
restoration lens would ever have found it, because nothing was lost.

## The pattern that did not do the thing it was named for

Lane 18 restored **nothing** — 0 items from ~90 removals traced, the cleanest deletion record in the
programme — and then found five defects with lens 1b, one of which is the most consequential single
bug the programme has surfaced:

**`web-files-file-upload-patterns/examples/resumable.md` Pattern 22 persisted `completedChunks` to
`localStorage`, reloaded it on start, validated it — and passed it to nothing.**
`ChunkedUploader.upload` always rebuilt `[0 … totalChunks-1]` and re-uploaded the entire file. The
resumable-upload pattern did not resume. That is lens 1b's half-mechanism shape landing on the
pattern the section is named for, and it **predates both passes**.

Fixed by wiring the persisted indexes through: seeding `completedChunks` and `uploadedBytes` from
them, computing the final short chunk exactly rather than approximating, and filtering the index list.

Two more from the same lane worth keeping:

- **Prose and code disagreeing.** SKILL.md promised "retry a failed slice with exponential backoff";
  `uploadChunk` backed off only in the `catch`, so a 500 response hit `continue` and retried instantly.
- **The impure-updater defect I ratified a fix for existed in a third site**, unmentioned in my
  dispatch: `progress.md`'s `useMultiUpload` ran `uploadFile()` and `onAllComplete?.()` _inside_ a
  `setFiles` updater returning `prev` unchanged, causing double uploads — and contradicting the
  sibling skill's own stated rule ("never inside a state updater, which React may call more than
  once"). **Found by grepping the pattern rather than the file.** That is the method that generalises.

## One rule can be lost by three individually-correct deletions

Lane 12's finding, and the most instructive structural one. `web-testing-cypress-e2e`'s **test
independence** rule lived in three places — a critical requirement, a philosophy principle and a red
flag. Pass 1 deduplicated each against the other two, and all three went. A grep for
`testIsolation|independent|isolat` over the finished skill returned **one hit, and it was "One
component in isolation"**.

**No single deletion looked wrong on its own.** That is the failure mode of dedup at scale, and the
only defence is grepping the concept across the whole skill after the cuts rather than judging each
in place.

## Substitutions are the more dangerous failure mode, and now there is a number

Lane 2 audited every genericised block in its four skills — 68 relative-path import sites plus every
helper-shaped call — and found **4 defects, ≈1 in 17**. That is a _higher_ rate than its own
restoration rate of 1 in 19, and it is the finding that matters most from pass 2:

> **A deletion leaves a gap a reader notices. An invention leaves something that reads correct.**

Three of the four were in `web-meta-framework-nextjs`, the skill that took the deepest cut. The
sharpest is not one of the three shapes the lens named — pass 1 tidied away an unused
`DATABASE_SECRET` by inventing `queryUsers(DATABASE_SECRET)`, **a data layer taking a connection
secret as a per-query argument**, in the one example whose whole subject is where secrets may live. A
wrong shape taught in the place the reader is most likely to copy it. Now
`connectToDatabase(process.env.DATABASE_SECRET)` then `db.listUsers()`.

The others: `readStreamableValue` re-homed to a local `./streamable` with its contract never stated
(it returns an async iterable) while its sibling import got a declaring comment; `toFieldErrors` used
350 lines from its declaration in a snippet a reader may land on directly; and a payment vendor's
`webhooks.constructEvent` genericised to `verifyWebhookSignature` in a way that erased the signal it
comes from an SDK at all, in the security-critical step the example exists to teach.

Lane 5 audited ~160 `use*` call sites plus every undefined non-hook identifier and found **2 more**:
SWR's `createClient({ baseURL, timeout })` with `apiClient.interceptors.request.use(...)` — pass 1
removed the real HTTP package correctly and left axios's _exact API shape_ behind under an invented
factory name; and Apollo's `await clickDelete()`, worse than usual because that file **does** define
and export its other helper, so a reader has every reason to expect this one to exist too. The
baseline had the real interaction, so what was actually lost was the selector — which button, found
how. Both now carry explicit placeholder declarations naming which parts the technology owns.

Lane 6 found **5 more, every one shape 3** — pass 1 deleted a block and kept a reference into it.
Three are `useForm<OrderFormData>` / `<ContactFormData>` / `<LoginFormData>` whose `interface`
declarations went when `examples/v7-advanced.md` was split: **the calls do not compile**. One is a
`MIN_AGE` left in `initialValues` after the schema that declared it became an opaque import —
`ReferenceError` for anyone pasting the snippet. The fifth is the sharpest, because pass 1 _created_
it: it rewrote a literal `13` to `MIN_AGE`, declared nowhere, **applying the named-constants project
convention that this programme's own do-not-restore list bans from skills entirely** — and left the
snippet testing an undefined constant against a message still reading "Must be 13 or older".

**Two rules worth keeping, both from lane 6:**

- **An import declares the thing; a bare call does not.** The resolver-boundary work was safe
  precisely because it wrote `import { registrationSchema } from "./schemas/registration"` rather
  than calling an undeclared helper. That is the form the Astro islands fix should have taken.
- **`examples/**` must run; a `SKILL.md` snippet need not.** The output format defines a SKILL.md
  snippet as "3–10 lines showing the shape … not a runnable file", so eliding a declaration there is
  by design. An undeclared constant in `examples/` is a defect; in `SKILL.md` it is the format. What
  no standard permits is a snippet contradicting _itself_, which is why the `MIN_AGE`-versus-13 case
  was still a fix.

**The pattern to copy** is the one SvelteKit already used, found sound in the same audit:
`// Subscribe to events (pseudo-code — use your pub/sub solution)`. An honest elision says it is one.

**A third orchestrator error, and the lane's method is the lesson.** My dispatch attributed
`web-routing-tanstack-router`'s `context.dataClient` genericisation to pass 1. Lane 7 checked the
baseline before acting: `context.dataClient.prefetchData`, `usePostsFromCache` and
`useCommentsFromCache` are **byte-identical there**, so the substitution predates the programme
entirely and pass 1 only removed a decision tree below it. The defect was real and is now fixed — the
skill's own thesis is that the router context is typed, and `dataClient` was read three times while
being declared in neither `RouterContext` declaration, so the example demonstrated precisely the error
the skill teaches you to avoid. But the _attribution_ was mine and wrong.

**A second orchestrator error, caught by the lane rather than by me.** The mid-flight message to lane
5 told it `uploadToS3` had been genericised in `web-error-handling-result-types/examples/async.md`.
That file belongs to lane 16, not lane 5 — and the claim did not reproduce when the lane read it. It
refused to edit a file outside its own directories _and_ verified the claim instead of assuming, which
is the behaviour the briefing standard asks for and the opposite of what my message invited. Same root
cause as the line-figure error above: a claim carried from a report rather than re-derived.

**A defect class the restoration lens was not built for, and the more serious one.** Pass 1's worst
failures were **substitutions, not deletions** — genericising a cross-domain reference and replacing
it with something that does not exist:

- `web-meta-framework-astro/examples/islands.md` — pass 1 correctly removed a named store package and
  replaced the call with `useStoreBinding(getCart, subscribeToCart)`, **a function that exists
  nowhere**, no import, no definition. The example reads as if it teaches a real binding primitive.
  Worse than the violation it replaced: the original at least worked.
- Two more of the same shape in `web-meta-framework-nextjs`: `examples/server-actions.md` imports
  `CreatePostSchema`/`toFieldErrors` from a `./schemas` no snippet defines, and
  `examples/streaming.md` imports `createStreamableValue`/`readStreamableValue` from a `./streamable`
  no snippet defines — the baseline named the real vendor package, which §11 correctly forbids.

**A third shape, found by lane 7: over-genericisation.** Pass 1 rewrote "WebSocket" into "raw
sockets" / "a plain socket server" / "the standard one" across six prose sites in
`web-realtime-socket-io`. A **raw socket** is a different thing (`SOCK_RAW`), so the Quick Guide
asserted something false, and a comparison column headed "The standard one" names nothing a reader
can act on — while the skill's own code said `transports: ["websocket", "polling"]`, so prose and
code disagreed. **The platform is not a sibling package.** WebSocket, EventSource, AbortController,
Canvas, IndexedDB, `fetch` and ResizeObserver keep their names; §11's alternation lists libraries and
frameworks, and its transformation tree says _framework_ name. Genericising a primitive costs
accuracy and buys nothing.

The lens was added to the pass-2 brief mid-flight and sent to all six in-flight lanes. **The test that
separates it from a false positive:** a snippet calling `getUser()` or `listPosts()` without defining
it is normal — that is the reader's own application code, deliberately elided. The defect is a call
that pretends to be _the technology's own API_ and is not. An automated scan cannot make that
distinction; a run over all 84 skills returned 464 candidates, almost all legitimate.

**Two contradictions that predate the programme, found by reading the baseline:**

- `web-meta-framework-nextjs/examples/mutations.md` headlined `Promise.all([updateProfile(), …])`
  from a Client Component as a **Good Example**, captioned "run concurrently for faster completion" —
  verbatim the WRONG half of the same skill's own anti-pattern, _"Expecting parallel execution from
  the client — these queue and run one at a time"_. Three sites said actions queue; this one said the
  opposite. Aligned to the skill's own majority position.
- `web-meta-framework-remix` — the baseline's "Why good" said a server `action` "can still sync to
  database if needed" while its own rule said the action is "completely skipped". Pass 1's disputed
  edit resolved that in favour of the "Why good". Still wants a source.

**Pass 1 made a second unsourced factual edit it did not disclose.** It changed `meta` receiving
**null** data on error to **undefined**, across four sites in `web-meta-framework-remix`. It
disclosed the `clientAction` edit (which spans three sites, not the two it reported) and not this
one. Both are consistent within the skill and neither breaks the `if (!data)` branch every example
uses; both want checking against a source.

---

## A correction the orchestrator owes this file

**The pass-2 dispatches carried line figures copied from pass 1's reports rather than measured from
the tree, and lane 2 caught it.** Its dispatch gave `web-meta-framework-nextjs` as 1,136→367 and
`sveltekit` as 746→353; measured, the pre-edit values were **379** and **355**. The baselines were
also off by one on two of three, a trailing-newline artefact.

This is exactly the failure
[`briefing.md`](../../packages/cli/.ai-docs/standards/briefing.md) names — **"a brief carries the
command, not its result"** — committed by the orchestrator in a brief that quoted that standard at
its own lanes. Nothing downstream depended on the numbers, so no work is wrong; the process rule is.
Later dispatches state the command.

---

## Dispatch log

One line per dispatch, appended as each lane lands, carrying the lane's corrections.

- **2026-09-04 — lane 18 landed; PASS 1 COMPLETE, all 84 skills.** (file-upload-patterns, image-handling, offline-first, service-workers). `web-files-file-upload-patterns` was the lane's problem skill and the programme's clearest vendor case: **83 vendor references across 5 files**, an `examples/s3-upload.md` whose Patterns 2–4 were server-side `@aws-sdk/client-s3` code — a cloud vendor's SDK, and _server_ code in a skill that declared server-side processing out of scope. Rewritten as `presigned-upload.md`: the **contract** the signing endpoint satisfies (`PresignRequest`/`PresignResponse`, its five obligations, the POST-policy conditions, the two multipart endpoints), with the teaching intact and the SDK gone. §11 was clean over all of it — the second lane to confirm the audit sees no vendor SDKs. Its `preview.md` went 591→107: it carried a whole image-processing corpus (`resizeImage`, `fixImageOrientation`, `generateThumbnail`, EXIF parsing) that `web-files-image-handling` already owns. And SKILL.md Pattern 2 pointed at "the full hook in examples/core.md" for a `useFileList` that **did not exist anywhere in the skill**, while `core.md` Pattern 4 imported it — now implemented. **Two fixes past the wording boundary, both flagged by the lane and both ratified:** `useImagePreview` revoked object URLs inside a `setState` updater returning `prev` unchanged — an impure updater React may invoke twice, so the skill's own first critical requirement was implemented as a double-revoke; and `useImageGallery`'s unmount cleanup had `[]` deps with an `eslint-disable` over a stale `images` closure, leaking every URL added after mount. **Corrections:** five. My dispatch said these four were "the likeliest in the catalogue to name a cloud vendor" — true of **one** of the four; the other three returned zero.
- **2026-09-04 — lane 20 landed** (d3, recharts, react-three-fiber, dnd-kit). Both sweeps returned **zero** cross-domain hits across all four directories on the first pass, and every change came from reading: three no-op memos with captions claiming they prevented recalculation (`useMemo(() => data, [data])`, memoizing a value against itself, in three files), an out-of-scope variable making `resetZoom` unreachable in D3's zoom example, an unused `STAGGER_DELAY_MS` in a snippet claiming a stagger, three lookup tables living in two files each, and a `trashAwarCollision` typo. Recharts' one real Category 2 exit — _"Highly custom, non-standard visualizations (use D3 directly)"_ — is now a capability, and the two dataviz skills are mutually silent: `grep D3` over Recharts and `grep Recharts` over D3 both return nothing. dnd-kit's accessibility apparatus was **kept and strengthened**, as the dispatch asked — `KeyboardSensor`, `announcements`, `screenReaderInstructions`, the ARIA table — with only the conformance target named as settled elsewhere. **Two suspected defects verified clean via Context7 rather than deferred**, both load-bearing: Recharts' `responsive` prop, which the lane thought might be a hallucinated v3 feature carrying a critical requirement in five places, **exists** — `responsive?: boolean`, default `false`, in `src/util/types.ts`, documented as the ResponsiveContainer alternative; and `accessibilityLayer` does default to true in v3. **Corrections:** two, the useful one refining the snippet-less-pattern class — this lane found patterns that were a title, a **lookup table** and a link. A table is not a snippet: it settles nothing about how the call is written, and a lane checking only "is a code block present" would pass it. Four such patterns rewritten with code.
- **2026-09-04 — lane 19 landed** (date-fns, native-js, rxjs, vueuse). **8,076→4,619 lines, −43%; the second lane to report "Corrections: nothing".** `web-utilities-native-js` was the concision case the dispatch predicted and it went **1,714→561 in examples** — a 100-line optional-chaining good/bad pair, cheat-sheets listing `map`/`filter`/`reduce`/`find`/`includes`, `isEmpty`/`invert`/`propertyCount` one-liners over `Object.keys`, and a per-browser version grid. What replaced them is the non-obvious: `structuredClone` discards the prototype so a class instance clones to a plain object with no methods; the `to*` methods copy one level; `arr.at(-1)` is only typed `T | undefined` under `noUncheckedIndexedAccess`; Set methods reject a plain array; `Object.keys` puts integer-like keys first. That is the primer's rule working — cut what the first page of MDN covers, keep what surprises. **One requirement replaced rather than reworded:** VueUse's `**(You MUST use shallowRef instead of ref for large objects)**` is a Vue reactivity rule _and wrong as an absolute for this library_ — `useLocalStorage` needs deep tracking to see nested writes. Now a red flag stating both halves, with its slot in `<critical_requirements>` given to reading `isSupported`, which is VueUse's own API. **The RxJS/Angular overlap I asked about does not exist:** the lane read `web-framework-angular-standalone/examples/rxjs.md` in full and found it teaches only `toSignal`/`toObservable` from `@angular/core/rxjs-interop` — no RxJS teaching to deduplicate, no leak either way. **Corrections:** nothing. Its scorecard for the tooling: the sweeps found 1 of 3 real violations, reading found the other 2 plus every duplicated block and stale claim.
- **2026-09-04 — lane 16 landed** (error-boundaries, result-types, web-performance, web-accessibility). **8,426→5,093 lines, −40%, the deepest whole-lane cut of the programme.** The finding of the pass: `web-accessibility-web-accessibility`'s second critical requirement read **"You MUST use headless component libraries for complex ARIA patterns instead of manual implementation"** — repeated in the philosophy, a decision tree, an anti-pattern and three example files. That is Category 2 _with the name left blank_: a standing instruction to reach for an external tool category, invisible to every sweep because no package is named. Rewritten throughout to state **the contract** — the dialog's six obligations, the listbox's roles and key bindings — with the note that a tested primitive supplies it, so the skill now teaches what to check any library against, which is what an accessibility skill actually owns. Two more methodology-skill leaks the audit was clean over: `web-performance` imported `react-window` and `use-debounce` and named React Router's `<Routes>`/`<Route>` (virtual scrolling is now the technique — window, spacer, offset, overscan — with no package), and `web-error-handling-error-boundaries` carried an entire `examples/testing.md` of `@testing-library/react` suites. **Lane 12's offered material: one taken, one declined**, per the relocation protocol's duplicate check — the axe rule-ID table taken (nothing in the skill carried rule IDs), the keyboard-navigation block declined because all four of its concepts were already present. The lane supplied the eight impact levels from its own knowledge rather than from Lane 12's cut; I verified four against axe-core's own rule JSON via Context7 — `label` critical, `color-contrast` serious, `heading-order` moderate, `region` moderate — all correct as written. **Corrections:** two, the useful one being that `useState|useEffect` in my added sweep is pure noise in a React-facing lane: 34 hits, all cleared by reading.
- **2026-09-04 — lane 21 landed** (lexical, tiptap, leaflet, mapbox). The cleanest four skills in the catalogue: no `<integration>` block in any of them, every pattern already carried a snippet, `<red_flags>` already present in all four, and §11 clean before and after. So the work was almost purely concision and redundancy — `reference.md` files down 4–42%, mostly `## Anti-Patterns` sections that were a _third_ copy of content already in SKILL.md's red flags and in an `examples/` Bad Example. Two unsupportable claims **deleted rather than reworded**, per "prefer deleting a claim to rewriting it": Lexical's "collaborative editing **with operational transforms**" (its binding is CRDT-based via `@lexical/yjs`), and TipTap's "`onUpdate` debounces via TipTap's internal batching" (it fires per transaction and debounces nothing — the pattern directly below it implements an explicit debounce). Mapbox's `Popup.setHTML` sanitization was **promoted from a red flag to a critical requirement**, as the highest-consequence rule the skill carries. **I ratify the lane's call on `@mapbox/mapbox-gl-geocoder` and `-directions`:** first-party packages in the library's own scope, consumed through `map.addControl` — the composition ruling keeps them. **Corrections:** six, two of which are my dispatch being wrong. I predicted the dated commercial-tier claim would be in Mapbox; it was in Leaflet (`// Carto light basemap (no API key for light use)`), and Mapbox carries no pricing, tier or quota claim anywhere. I also predicted cloud-collaboration sections in both editor skills; neither has one.
- **2026-09-04 — lane 15 landed** (css-animations, framer-motion, view-transitions). **The first lane to report "Corrections: nothing"** — every claim in the brief matched the tree. Two of its three SKILL.md files _grew_ while their directories shrank 8–17%, because `reference.md` was carrying the decision layer: Framer Motion's lost 285 lines (six decision trees each already settled in the pattern that owns them, seven anti-patterns each already a red flag), View Transitions' lost 243. The lane's own summary of the programme's central lesson, unprompted: the §11 audit returned no matches on all three directories before any edit, and every real violation was found by reading — a decision tree exiting into a sibling skill by name (`├─ Page/view transitions? -> See the View Transitions skill`), a testing-library snippet used inside a migration note to explain Motion's own scheduling, and five "use an animation library" exits. The CSS skill's "CSS vs JavaScript Animation" tree was replaced with a **What CSS expresses** section that ends inside the domain and states the boundary as a property of CSS — it "declares an animation and hands back no handle to one" — rather than as a recommendation to reach for a library. `prefers-reduced-motion` is now carried independently by all three in each one's own vocabulary, which is correct: it is each skill's own responsibility, not a cross-reference. **I ratify one out-of-scope fix:** two `core.md` functions interpolated fetched user data into `innerHTML`; rewritten to build nodes and set `textContent`. Teaching an injection shape in passing is worse than the small rewrite.
- **2026-09-04 — lane 17 landed** (next-intl, react-intl, vue-i18n). next-intl SKILL.md **643→286**, vue-i18n 551→266. **The bridge rule, stated and now settled for the catalogue:** a skill may name the framework it binds to wherever that name is part of its own API surface — the package it imports from, the file its own middleware must occupy, the lifecycle position its own function must be called in — and may not teach that framework's concepts: routing configuration, rendering model, component authoring, or setup that would read identically with the library absent. That kept next-intl's `proxy.ts`/`middleware.ts` version boundary (a fact about where _next-intl's own_ middleware lives) and removed the framework directory-tree tutorial and a decision-tree exit reading "Non-Next.js React applications (use react-intl instead)", which named a sibling skill's package. It lands the same way as the composition ruling and the tRPC bridge. Two real violations in vue-i18n found by reading over a clean §11: `examples/lazy-loading.md` imported five symbols from `vue-router` and taught a route table, making the example unusable for a Vue app that routes differently; and `reference.md`'s testing anti-pattern used a specific runner's `vi.fn()`/`vi.mock()`. **Corrections:** one, and it is a defect in this repository's standards — see the findings table.
- **2026-09-04 — lane 8 landed** (cva, design-tokens, scss-modules, tailwind, theming). `web-styling-scss-modules` was the worst skill in the catalogue and needed the largest rewrite: it was titled _"# Styling & Design System"_ with `description: SCSS Modules, cva, design tokens` — **naming two sibling skills in its own frontmatter** — and carried `examples/cva.md`, 428 lines of another technology's variant API. Retired; `web-styling-cva` already covered every pattern in it, so nothing needed relocating, and I deleted the stub the lane could not. Its SKILL.md grew 241→322 because ten of its patterns were a title, a bullet list and a link — it was a link index, not a decision layer. `web-styling-tailwind` had the same defect in all ten patterns. Two `reference.md` files created, 119 and 72 lines of relocated lookup content, neither a placeholder. **One cross-skill relocation:** design-tokens was teaching Tailwind's `@theme` / `@theme inline` as the way to bridge tokens into a class generator — a token skill reaching into a framework's build step. The mechanics moved to the Tailwind skill; design-tokens keeps the ownership _decisions_, Tailwind owns the _syntax_, and nothing is duplicated. **A direct contradiction between two skills, resolved:** scss-modules _required_ bare HSL triplets (`--color-white: 0 0% 100%`) while design-tokens red-flags that exact string as "not a colour — `color-mix()` and every opacity modifier produce invalid CSS". Design-tokens wins and I ratify it: a colour value format is not SCSS Modules' domain to legislate. **Corrections:** four, the sharpest being that my dispatch was wrong in both directions about `lucide-react` — it appears nowhere in these five, and the atomicity bible's own §1 table lists it as something a styling skill _leaves to others_, so it is a term to watch out for here, not an own-technology hit to filter.
- **2026-09-04 — lane 11 landed; wave 2 complete** (radix-ui, shadcn-ui, tanstack-table, vuetify). **The composition ruling, which the dispatch asked for and which now governs the catalogue: a skill keeps the names of what it is composed of; it does not teach them.** shadcn/ui's CLI writes files _into the reader's own repository_ that import a primitive library, apply utility classes and declare a variant map — a skill that genericised those names could not describe the file the reader has open. So `components.json`, `--base`, `migrate radix` and `@/lib/utils` stay as facts of the composition, while the cva tutorial, the utility-CSS theming tree and the React Hook Form `Controller` API all went, each named as a capability instead. Applied to Radix the same rule returns nothing to change — it is composed of nothing downstream in this catalogue. That is one rule agreeing with itself, not two rulings, and it matches wave 1 keeping tRPC's query-client bridge. **I ratify the lane's `@/` decision:** the brief said genericise `@/lib/*`, but shadcn's aliases are the CLI's own documented defaults, so the blanket rule loses to the ruling here and only here. **Two violations found by reading that no sweep could see:** `web-ui-vuetify/examples/core.md` said _"Vuetify's theme system is more flexible than MUI's"_ — MUI has its own skill and no fragment list contains "MUI"; and `web-ui-tanstack-table`'s `reference.md` ended a tree with _"→ Consider Material React Table or similar pre-styled libraries"_, a headless library sending readers to a component kit. **Corrections:** two, the second a repair rather than a report — `web-ui-vuetify/examples/forms.md` had `const form = (ref < HTMLFormElement) | (null > null);` at two sites, mechanical corruption from a Prettier pass parsing `<script setup>` as JavaScript. Restored; the separate question of whether `HTMLFormElement` is the right type is left for the fact pass.
- **2026-09-04 — lane 13 landed** (react-testing-library, vue-test-utils, visual-regression). RTL SKILL.md **577→256**, `reference.md` 592→168 — the latter mostly a 10-section "Anti-Patterns to Avoid" block (~320 lines) whose every entry was already a red flag, a critical requirement or a worked example; each was checked against its new home before cutting. **`web-testing-visual-regression` was the lane's real work and the §11 audit found 2 hits of it out of 34.** The skill _declared_ Playwright and Storybook out of scope while being written almost entirely in their APIs — `playwright.config.ts`, `expect(page).toHaveScreenshot`, `npx chromatic --only-changed`, a pinned `mcr.microsoft.com/playwright` image, `actions/upload-artifact@v4`. Now a `matchScreenshot(subject, name, options)` stand-in declared once per file, with every option and every trap preserved, including the one that matters most: tolerance numbers do not port between harnesses. `web-testing-vue-test-utils` lost a critical requirement reading _"(You MUST use `createTestingPinia()`, NOT manual mocking)"_ — a state library's tool prescribed from a testing skill; `web-state-pinia/examples/testing.md` already owns it, confirmed by grep before cutting. 19 `vi.*` call sites in RTL and ~60 in Vue genericised to the runner-neutral form, with the one real seam kept explicit: `userEvent.setup({ advanceTimers })` is where the runner's timer function must be handed in. Renamed `examples/story-driven.md` → `catalog-driven.md` with its four inbound links. **Corrections:** three, including a second instance of the missing-word-boundary bug — `Jest\|jest` matches `@testing-library/jest-dom` and `eslint-plugin-jest-dom`, which are Testing Library's own runner-agnostic packages.
- **2026-09-04 — lane 12 landed** (vitest, cypress-e2e, playwright-e2e). **The single largest cut of the programme: `web-testing-cypress-e2e` 4,778→1,964 lines, 59%.** `ci-cd.md` carried nine GitHub Actions workflow files and a docker-compose stack with a database service; `component-testing.md` carried the full React _source_ of every component under test; `accessibility.md` carried an axe rule-ID table and three near-identical WCAG describes. All three are neighbouring domains — what survives is Cypress's own surface. `custom-commands.md` 753→249, mostly a "Complete Commands File" section that restated Patterns 1–3 verbatim. **`web-testing-vitest` grew, 235→265, and that is the finding:** all three of its patterns were a title, a bullet list and a link, and the `vi.fn`/`vi.mock`/`vi.spyOn`/fake-timers/snapshot/coverage surface its own `description` advertises **appeared nowhere in the skill as code**. Six patterns written with the code behind them. Renamed `examples/ci-cd.md` → `ci.md` with both inbound links — the content is Cypress's CI surface, not CI/CD. **Corrections:** three. The sharpest: _both_ sweeps missed nearly everything real here — Redux state in a Playwright anti-pattern, Firebase in a fixture, Stripe in two checkout examples, Axe in a version row, Google in an OAuth example, and every `@testing-library` import in the Vitest skill were all found by reading. `@testing-library/react` is invisible to §11 and to the second sweep as written.
- **2026-09-04 — lane 10 landed** (headless-ui, mantine, mui). Mantine's SKILL.md **774→361**, MUI's 588→377. MUI's fourteen §11 hits were all one framework named where an architecture category works: `Pattern 8: Next.js App Router Integration` became `Pattern 8: Server-rendered setup` and now explains the _mechanism_ — Emotion generates styles as components render, so a cache provider above `ThemeProvider` collects and flushes them with the streamed HTML — with the framework adapter described as "one adapter package per supported server framework". Headless UI's `metadata.yaml` `usageGuidance` claimed the library is "designed for Tailwind CSS"; removed, since a required routing field asserting a specific styling dependency is a portability claim that is also untrue. Its data-attribute contract is now stated once: _the attribute names are the contract, the selector syntax is your styling layer's_. **I reconciled one cross-lane inconsistency.** Lane 10 replaced Mantine's schema resolver with a `mantine-form-<schema-library>-resolver` placeholder; lane 6 had already ruled the opposite way for the same question, keeping `zodResolver` from `@hookform/resolvers/zod` and `toTypedSchema` from `@vee-validate/zod` on a package-scope test. `mantine-form-zod-resolver` is Mantine's own naming, so the concrete name is restored and the schema now imports from a module — matching lane 6 exactly. **Check-adequacy note from the lane:** completion check 2 passed on all three skills _before_ the pass too, because `<red_flags>` was always present; the tag was right and the `## RED FLAGS` heading and bucket structure inside it were wrong. The check confirms placement, not compliance.
- **2026-09-04 — lane 14 landed** (component-library, storybook, vite, msw). Storybook took the largest proportional cut of the programme: SKILL.md 666→282, `reference.md` 668→146, examples **2,345→991** — six repetitions of the same meta boilerplate in `core.md`, four near-identical `main.ts` blocks in `addons.md`, and a `vitest.config.ts` dump replaced by `npx storybook add @storybook/addon-vitest` plus the two options that command cannot decide for you. `web-tooling-vite`'s `examples/core.md` named two sibling skills' packages as its worked example of what to chunk (`@tanstack/react-query`, `@radix-ui`); genericised with the rule stated — group by release cadence — so the example stayed actionable. `web-tooling-component-library`'s "these are owned elsewhere" table named **four sibling skills by id**; now four capabilities naming no skill and no package. Created its `reference.md` from content already sitting in SKILL.md — 37 lines of moved material, not a stub. **Suspected defect worth the research pass:** the Storybook skill straddles two majors — every example uses 8-era package names while `reference.md` documents Storybook 10 as current, and Storybook 9 consolidated several of those packages, so a reader on 9 or 10 would install names that may not exist. **Corrections:** six; the substantive one is that my "3,674 lines" figure for Storybook named the whole directory, not the example corpus (2,345).
- **2026-09-04 — lane 9 landed** (ant-design, base-ui, chakra-ui). Chakra's `reference.md` carried a "When to Use Chakra UI" tree whose five of six branches exited the domain — "consider utility-class or headless approaches", "lighter alternatives", "headless primitives with your own CSS" — a Category 4 tree answering a question already settled by whoever selected the skill. Deleted. Base UI's Radix migration notice moved out of the always-loaded layer into `reference.md`, taking ~30 lines of a competitor's API with it. Three `@/components/ui/*` aliases genericised in Chakra, all invisible to §11, which carries `@/lib/` only. I renamed `examples/nextjs.md` → `ssr.md` and fixed its five inbound links — content and links were already framework-neutral, only the path still named the framework. **The lane's highest-stakes finding resolves clean:** it flagged that every import in Base UI's seven files uses `@base-ui/react` and might need to be `@base-ui-components/react`, which would have made the whole skill wrong. Verified against Base UI's own `packages/react/README.md` via Context7 — `npm install @base-ui/react` is correct for v1, and the skill's note that the old name is frozen at an RC is consistent with it. **Corrections:** three, the useful one being that the brief's second-sweep alternation is mostly false positives in a React-component-library lane — `useState|useEffect|forwardRef` returned 32 hits, every one own-domain.
- **2026-09-04 — wave 3 dispatched.** Lanes 15–21, 26 skills — the last of the 84. Each dispatch carries wave 2's hardest-won lesson in its own words: the greps find almost nothing, the reading finds everything.
- **2026-09-04 — wave 2 dispatched.** Lanes 8–14, 25 skills (styling, three UI-kit lanes, three testing/tooling lanes). The brief was revised first with wave 1's lessons: the `<integration>` block and project-convention rules added to the delete list, patterns-without-snippets added as a rewrite item, and three read-the-output caveats on the §11 audit.
- **2026-09-04 — lane 2 landed; wave 1 complete** (nextjs, nuxt, remix, sveltekit). The deepest single cut of the programme: `web-meta-framework-nextjs` SKILL.md **1,136→367** and its `reference.md` **984→410** — nineteen patterns carrying full implementations consolidated into ten snippet-plus-link, and `core.md`'s first two patterns were verbatim duplicates of `server-components.md`. 23 `@/lib/*` and `@/components/*` aliases genericised across six files. Remix's `api.webhooks.stripe.ts` example prescribed a payment vendor's SDK by name — now `verifyWebhookSignature`, keeping the teaching (verify before parsing, read the raw body) without the vendor. **One factual edit made from memory rather than from a source, disclosed by the lane:** the Remix skill said a server `action` is "completely skipped" when `clientAction` is present; React Router v7 passes a `serverAction` callback in, so it can be invoked. Changed in two places — **verify this first in any research pass**, since it is the one place this programme changed a fact rather than reporting it. **Corrections:** six, including two new defects in the §11 command itself — see the findings table.
- **2026-09-04 — lane 5 landed** (apollo, urql, swr, trpc, react-query). The largest cut of the programme so far: `web-data-fetching-swr`'s examples went **3,771→1,465**, mostly by deleting six "Anti-Pattern Examples" blocks — one at the foot of every example file, all restating SKILL.md's red flags — and collapsing eight near-identical components that showed one idea eight times. Its `core.md` opened with an inline fetcher `fetch(url).then(r => r.json())` that contradicted the skill's own "the fetcher must throw" requirement in its first code block. The neighbouring-pair check the dispatch asked for came back clean: Apollo and urql never name each other, SWR and React Query never name each other. **Corrections:** four. The CLAUDE.md conventions line the brief calls universal is present in **only one of these five**, so the "all 84 carry it" census is a SKILL.md-level fact, not a per-skill one. I aligned `web-server-state-react-query`'s `metadata.yaml` `usageGuidance`, which still named hey-api after the skill stopped being about it.
- **2026-09-04 — lane 4 landed** (zustand, jotai, mobx, redux-toolkit, pinia, ngrx-signalstore). The template-contamination check the dispatch asked for came back **clean** — `runInAction` appears only in MobX, `defineStore` only in Pinia, `useSelector`/`useDispatch` only in Redux. The contamination that _was_ there is a different class and pervasive: project-convention rules (`named exports ONLY`, `named constants for ALL numbers`, `follow CLAUDE.md`) sat in four of six skills' **critical requirements** and in roughly thirty "Why good"/"Why bad" clauses across the example files. Deleted, not rewritten — a code convention is not state-management knowledge. **Redux Toolkit and Pinia had no pattern snippets at all** — seventeen patterns between them were a title, a "When to Use" list and a link, so the decision layer could not be used without opening an example file; each now carries one, which is why Redux's SKILL.md grew. I renamed `examples/integrations.md` → `persistence.md` and fixed both inbound links (the bible names topic files after the topic, not the category). **Corrections:** seven. Two structural ones the brief got backwards: `web-state-zustand/reference.md` **existed and was zero bytes** while SKILL.md linked to it — and it passes every completion check in the brief, since check 1 only requires `SKILL.md`, `metadata.yaml` and `examples/core.md`; and four of six skills kept their decision trees in `reference.md` with no `<decision_framework>` in SKILL.md at all, the inverse of the doctrine, so four reports carry a "Moved" line pointing _from_ `reference.md` _into_ `SKILL.md`.
- **2026-09-04 — lane 6 landed** (react-hook-form, tanstack-form, vee-validate, zod-validation). **The resolver boundary, ruled and applied to all four:** the resolver/adapter is part of the form library's own API surface and stays (`@hookform/resolvers/*` is React Hook Form's own scope; `@vee-validate/zod` is VeeValidate's), but the schema it wraps is opaque and gets imported — so the form skills no longer _teach_ the schema. TanStack Form was the exception: it has no resolver, its validator slot takes a Standard Schema object directly, so `zodResolver` there was naming another library's API and went. `web-forms-vee-validate` **grew** (272→307), correctly — it gained the three-way path branch and red flags that state their consequence. Removed `examples/v7-advanced.md`, a version-named non-topic whose pattern numbering collided with `core.md`; split by topic into `form-options.md` and `performance.md`, version tables to `reference.md`, and I deleted the leftover stub the agent could not (it holds no delete tool, nothing linked to it). **Corrections:** three, the third being the sharpest yet — see the findings table.
- **2026-09-04 — lane 7 landed** (react-router, tanstack-router, socket-io, sse, websockets). SKILL.md down 12–50%. The realtime trio were each recommending the siblings that have their own skills — eleven decision-tree exits across the three, now capabilities; the protocol _facts_ stayed, since each is the skill's own subject. `web-realtime-sse`'s `examples/core.md` opened at "Pattern 7" and did not contain the primary API at all; SKILL.md's five full implementations moved in under a new Primary API section, which is why that skill's examples grew while everything else shrank. Three websocket patterns carried a link and no snippet; each has one now. **Corrections:** five, four of them repeats of lanes 1 and 3 (no Bash; no `contentHash` in these five; the stale `$schema`; `<integration>` present in only two of five). The fifth — `web-realtime-sse` declaring `category: web-streaming` against id `web-realtime-sse` — **resolves clean**: `web-streaming` is in the generated enum in `packages/cli/src/schemas/metadata.schema.json`, so the category is stated rather than derived, exactly as the rule asks.
- **2026-09-04 — lane 1 landed** (react, solidjs, svelte, vue-composition-api, angular-standalone). SKILL.md down 16–61%. React's `src/primitives/` tiering deleted rather than genericised — it settles no React decision and the snippet under it was demonstrating something else. Angular carried a live self-contradiction: `reference.md` said Angular 19 permits signal writes in effects, then 140 lines on called the same write an infinite-loop anti-pattern; now stated once, correctly, and promoted to **Surprising behaviour** because the compiler stopped catching it. Vue's `defineModel` snippet declared `const model` twice in one `<script setup>` — a duplicate-identifier error as written. **Corrections:** four, of which one is a defect in a file this repository owns — see the findings table below. Also: only `web-framework-react` carries `contentHash`/`updated`; the other four carry neither. Solid's `examples/resources.md` (794 lines) and `examples/stores.md` (611) got the atomicity sweep but **not** the concision lens — carried into pass 2.
- **2026-09-04 — lane 3 landed** (astro, qwik, docusaurus, vitepress). SKILL.md down 29–55%; two real cross-domain violations found by reading rather than by the §11 audit — Astro's islands example prescribed `nanostores` by name, Qwik's styling tree exited to CSS Modules. Four broken markdown fences repaired, including two that swallowed whole sections into a code block. **Corrections:** four. (a) The defect set is not uniform — only Astro carried `<integration>`, Docusaurus already used `<decision_framework>`, all four already had `examples/core.md`. (b) The §11 audit over the original tree was near-clean (0/2/2/28 hits, the 28 all VitePress's own name); zero hits catalogue-wide for `@repo/`, `NEXT_PUBLIC_`, `runInAction` — the classes the primer names as most common. The audit's keyword list does not contain either violation actually found. (c) **`skill-summoner` holds no Bash**, so the brief's three shell-shaped completion checks were run through the Grep tool as one alternation — brief corrected for later waves. (d) "Most skills shrink by a third on wording alone" held for `SKILL.md` and not for `examples/` (1–3%), which are predominantly code.
- **2026-09-04 — wave 1 dispatched.** Lanes 1–7, 33 skills, seven `skill-summoner` agents in parallel. Awaiting reports.

---

## Gates run after pass 1

| Gate                                              | Result                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `bun scripts/validate-metadata.mjs`               | **All 238 skills pass metadata validation**                             |
| `npx prettier --check "src/skills/web-*/**/*.md"` | **All matched files use Prettier code style** (after the write below)   |
| Empty-file / leftover-stub scan                   | Clean — three superseded files deleted during the pass, no stubs remain |
| Mangled-generic scan (`ref < `, `) \| (null >`)   | Clean                                                                   |

`npx agents-inc doctor` is the remaining check and is the owner's to run, from a project with these
skills installed.

---

## A repository-wide hazard found while running those gates

**`npm run format` in the marketplace repository silently corrupts TypeScript inside Vue SFC code
blocks.** Prettier formats fenced code in markdown; a ` ```vue ` block whose script tag is
`<script setup>` rather than `<script setup lang="ts">` is parsed as **JavaScript**, so
`ref<HTMLFormElement | null>(null)` is rewritten to `(ref < HTMLFormElement) | (null > null)` — not
valid syntax in any version.

This is not hypothetical: lane 11 found and repaired exactly that corruption in
`web-ui-vuetify/examples/forms.md`, and a test run of Prettier on the repaired file **re-broke it at
both sites**. The source was at fault rather than the formatter — TypeScript in a Vue SFC requires
`lang="ts"` — so Prettier was reporting a real defect in the most destructive way available.

**Fixed:** nine `<script setup>` blocks containing TypeScript, across
`web-ui-vuetify/examples/{forms,data-tables,layout}.md`, now declare `lang="ts"`. Prettier preserves
the generics and the whole `web-*` tree formats clean.

**Not swept:** the other 154 skills. The scan that finds them, from `/home/vince/dev/skills`:

```bash
grep -rln '<script setup>' src/skills/ | xargs grep -l 'ref<\|computed<\|: Ref\|interface '
```

---

## Findings for the catalogue, not for this pass

| Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The atomicity bible's `runInAction()` template-contamination example is stale, in five places.** The bible names it as "found in vue-i18n, tRPC, Remix skills during Iteration 1" and the primer repeats it as the worked example of the defect class. It is now true of none of them — and, catalogue-wide, `runInAction` appears in **no skill outside MobX at all**. A standard whose flagship example no longer exists teaches a reader to hunt for a defect that was fixed                                                                                                                                                                    | `grep -rln "runInAction" src/skills/ \| grep -v mobx` from the marketplace root returns nothing; `grep -rn "runInAction" src/skills/web-i18n-vue-i18n/` returns nothing. Citations at `skill-atomicity-bible.md:562`, `:661`, `:1103`, `:1109` and `skill-atomicity-primer.md:44`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `packages/cli/.ai-docs/standards/` — this repository, `codex-keeper`'s files. Either retire the example or mark it as a fixed Iteration-1 case. Wants a `cli.md` row |
| **The atomicity bible's §11 Full Audit Command misses the violations that are actually there.** All five lane-1 skills passed it before any edit while carrying real cross-domain leaks: `@/types`, `@/components/`, `@/views/`, `@/contexts/`, `@/composables/` (the fragment carries `@/lib/` only), `Nuxt` in the Vue skill (the framework fragment carries `Next.js\|Vite\|Remix` only, though Nuxt, SvelteKit and Astro each have their own skill), and `forwardRef` prose in the Solid skill (§4's keyword list flags it, §11's command does not). Lane 3 independently found two Category 2 violations by reading that the command cannot see | Lanes 1, 3, 6 and 7, 2026-09-04. Lane 6 is the sharpest case: the audit returned clean on all four of its skills both before and after, while the three real leaks were React Hook Form's `register`/`Controller`/`zodResolver` vocabulary inside the TanStack skill, a VeeValidate decision tree reading "Which schema library should you use? → Zod ✓ (recommended)", and Yup/Valibot syntax taught across three duplicate VeeValidate patterns. §11 omits the bible's **own §4 "Form Libraries" keyword group**, so it cannot see any of them. Lane 2 adds two more defects in the command as written: the `Hono\|hono` fragment has no word boundary, so it matches "honours", "honoured" and "dishonour", and `Jest\|jest` likewise matches `@testing-library/jest-dom` and `eslint-plugin-jest-dom` — both inflate the violation count; and it misses Category 5 vendor-SDK leaks entirely — a Remix example imported a payment vendor's SDK and its webhook secret, and the audit saw nothing. Lane 12 is the strongest evidence: across three testing skills, **every real violation was found by reading and none by either grep** — Redux, Firebase, Stripe, Axe and Google all appeared in prose or imports no fragment covers, and `@testing-library/react` is invisible to both the §11 command and the wider sweep this programme added. The wider sweep that does catch them: `@/\|\.\./\.\./\.\./\|src/primitives\|Nuxt\|SvelteKit\|Astro\|Gatsby\|forwardRef\|useState\|useEffect`, plus a tenth fragment for §4's Form Libraries group: `react-hook-form\|@hookform/\|Formik\|formik\|vee-validate\|toTypedSchema` | `packages/cli/.ai-docs/standards/skill-atomicity-bible.md` §11 — this repository. Wants a `cli.md` row                                                               |
| Every skill's `metadata.yaml` `$schema` line points at `agents-inc/cli/main/src/schemas/…`, while `SCHEMA_PKG_PREFIX` in `packages/cli/src/cli/consts.ts` is `agents-inc/agents-inc/main/packages/cli/src/schemas`. GitHub redirects the old form, so nothing 404s today, but the emitted address is stale                                                                                                                                                                                                                                                                                                                                           | `grep -rl "agents-inc/cli/main" src/skills/*/metadata.yaml \| wc -l` from the marketplace root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Catalogue-wide — 237 of 238 carry it — deliberately out of this pass's scope, since fixing 84 of 238 splits the catalogue                                            |
