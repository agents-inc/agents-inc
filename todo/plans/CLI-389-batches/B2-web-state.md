# B2 — web state, forms, i18n, utilities (19 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B2, §2b groups #20/#24, §4; relationship-coverage decisions 2 and 4. Skill
bodies read at `/home/vince/dev/skills/src/skills/web-state-*`, `web-forms-*`,
`web-error-handling-*`, `web-i18n-*`, `web-utilities-*` (all 19 directories token-swept for every
framework name; contested bodies read in full). Current rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts` — four conflict groups touch this batch
(`{zustand, redux-toolkit, mobx, jotai}` at 20-22; `{react-hook-form, tanstack-form}` at 88-90;
`{vee-validate, tanstack-form}` at 104-106; `{react-intl, next-intl}` at 116-118) and **fourteen of
the nineteen skills already carry a `requires` rule** (zustand 350-354, redux-toolkit 356-360,
mobx 362-366, react-hook-form 380-384, pinia 392-396, vee-validate 398-402, ngrx-signalstore
410-413, vueuse 489-493, next-intl 515-518, error-boundaries 537-541, react-intl 555-559, jotai
573-577, vue-i18n 579-583, tanstack-form 617-629 — plus every one's parity `compatibleWith`,
dying in decision 4b). Categories verified in `default-categories.ts`: `web-client-state` (44-52,
`exclusive`), `web-forms` (62-70, open), `web-error-handling` (107-115, open), `web-i18n`
(116-124, `exclusive`), `web-utilities` (143-151, open), and the anchor `web-framework` (8-16,
`exclusive + required`). Stack usage measured in `default-stacks.ts`: zustand ×59, pinia ×14,
zod-validation ×10, redux-toolkit ×7, ngrx-signalstore ×7 — jotai, mobx, and **all three form
libraries appear in zero stacks**; every one of the 10 `"web-forms"` stack keys holds
zod-validation alone. Library claims verified 2026-08-07 via web (jotai.org comparison docs,
TanStack Form framework docs + npm, next-intl.dev core-library page).

**Headline: zero new `requires` rules — B2 is the best-covered batch in the catalog (14/19
bound, 5/19 genuinely universal), so its product is dispositions, not bindings.** Three verdicts
carry the batch: (1) the `web-client-state` radio is **SUSTAINED as catalogued** — its
framework-exclusion work is indeed redundant with `requires`, but its within-React same-kind
fence (one client-state library among jotai/mobx/rtk/zustand) is load-bearing and group #3's
free death depends on it; the jotai-beside-zustand attack fails at the skill level because the
zustand skill's own critical MUST claims ALL shared UI state (the biome/eslint-prettier
incoherence shape), recorded to D-306 with a reopen trigger. (2) Groups #20/#24: the worksheet's
"fence was never load-bearing; drop it" hypothesis is **REFUTED**, and so is its structural
impossibility claim — the disposition is a **split**: new exclusive `web-form-library`
{react-hook-form, tanstack-form, vee-validate}, zod-validation staying sole member of the open
`web-forms` residue at **zero stack-key cost**. (3) zod-validation is confirmed as the canonical
SKILLS-01 class-A row — zero framework tokens anywhere in its directory — and its `universal`
verdict structurally _forces_ the split direction in (2): universal-in-an-exclusive-category is
the manifest cross-check's contradiction, so zod must stay on the open side. The `web-i18n`
radio stays; vue-i18n's and vueuse's R-flag bindings verified live; rxjs is **universal, not
Angular-leaning** (body check: zero Angular content). One reason-text re-cut (next-intl).

## Question (a) — the `web-client-state` radio

**SUSTAINED — the flag is right, but its justification changes.** The worksheet's suspicion is
half-correct and worth recording precisely:

- **The cross-framework work IS redundant.** All six members are bound: the four React stores
  `needsAny [react, nextjs, remix, react-native]`, pinia `needsAny [vue-composition-api, nuxt]`,
  ngrx-signalstore `needs [angular-standalone]`. Post-EDITOR-11 narrowing a React project never
  surfaces pinia as selectable (the `outOfReach` mechanism verify-B9-B10 item 19 traced at
  `derive.ts:212-232`), and post-decision-2 the re-key onto the exclusive `web-framework`
  category carries the same fact. If framework exclusion were the radio's only job, it would be
  an artifact.
- **But the radio has a second job `requires` cannot do: the within-framework fence.** For a
  React stack the radio reads "exactly one of jotai, mobx, redux-toolkit, zustand" — four
  co-satisfiable skills whose `requires` are identical. Conflict group #3
  (`{zustand, redux-toolkit, mobx, jotai}`, rules 20-22) is wholly inside this exclusive
  category and is one of the worksheet's 17 that die free in Phase C — **contingent on the radio
  staying**. Un-flag it and group #3 flips load-bearing exactly as `{turborepo, nx}` did when
  decision 3 un-radioed `shared-monorepo`; then Phase C deletes it and the React stores have no
  fence at all. Any later wave that overturns this radio must carry that dependency.
- **The attack (jotai + zustand in one app), weighed honestly.** The pair is the strongest
  coexistence candidate in the category: same author, genuinely different paradigms — the
  official jotai comparison doc frames it as "Jotai is like Recoil. Zustand is like Redux",
  atoms/bottom-up vs one-object/top-down, context-first vs module-first
  (jotai.org/docs/basics/comparison). Community writing says you _can_ run both. But the
  evidence does not reach the detox/maestro bar that overturned a radio in B9. The strongest
  coexistence source, cited honestly (verification corrected the record here): jotai.org's own
  extensions page documents `jotai-zustand` / `atomWithStore` — "Zustand provides a store
  interface that can be used to hold some values and sync with atoms in Jotai", explicitly
  two-way binding (jotai.org/docs/extensions/zustand) — an official together-pattern from the
  libraries' shared author. It does not reach the bar because its shape is a **bridge into one
  consumption model** (a vanilla Zustand store surfaced as Jotai atoms for outside-React
  interop), not two peer state managers each owning shared UI state — detox/maestro overturned
  a radio where the two tools do _different jobs_ side by side; and the comparison doc still
  steers pick-one ("If you need a replacement for useState+useContext, Jotai fits well. If you
  want a simple module state, Zustand fits well"). And decisively, **as catalogued the pair is
  incoherent**: the zustand skill's critical
  requirement is "You MUST use Zustand for ALL shared UI state (2+ components)"
  (SKILL.md:22, repeated in critical_reminders), while jotai's When-to-use claims the same
  territory ("avoiding prop drilling for shared UI state"). Co-selection puts two contradictory
  unconditional MUSTs in front of the agent — the exact shape that sustained the
  biome/eslint-prettier radio in B12 (verify-B5-B12 item 15): the radio is honest _as
  catalogued_.
- **D-306 record + reopen trigger (the B12 pattern applied preemptively):** "jotai beside a
  store library is a real pattern (atomic UI atoms beside a domain store) with an official
  bridge extension (`jotai-zustand`/`atomWithStore`, jotai.org/docs/extensions/zustand) but no
  vendor-documented two-peers steady state; unrepresentable while the zustand skill's MUST is
  territorial. If the zustand skill's MUST is ever re-cut to store-shaped state, or either
  skill grows explicit `jotai-zustand`/`atomWithStore` boundary content, this radio's
  rationale reopens — the shape would then be a #14-style split (exclusive store category
  beside an open atomic one)." The bridge extension stays cited here, never waved off as
  nonexistent — the audit-trail-lies standard applies to verification records too.

Category description nit: "UI state, forms, local data (Zustand, Redux, MobX)" — the word
"forms" is wrong (forms live in `web-forms`) and the paren-list omits half the members. Cosmetic;
fix whenever the block is next touched.

## Question (b) — groups #20/#24 (worksheet §2b)

**Both worksheet claims about this overlap fail verification, in opposite directions.**

**The bindings exist exactly as the R/C flags say.** react-hook-form
`needsAny [react, nextjs, remix, react-native]` (380-384); vee-validate
`needsAny [vue-composition-api, nuxt]` (398-402); tanstack-form
`needsAny [react, vue-composition-api, angular-standalone, solidjs, nextjs, remix, nuxt]`
(617-629). Every rhf satisfier implies react in-stack (nextjs→react 330-333, remix→react
335-338, react-native→react 500-503); every vee satisfier implies vue-composition-api
(nuxt→vue 340-343); react and vue-composition-api are different members of the exclusive
`web-framework`. So **rhf ⊥ vee-validate is confirmed unreachable via requires** — a multi-hop
verdict that rides the requires-closure, i.e. the same EDITOR-11-step-2 dependency Phase C
already has; no new ordering constraint.

**But that pair is in neither group.** Group #20 is `{react-hook-form, tanstack-form}`; group
#24 is `{vee-validate, tanstack-form}`. The fences these groups actually hold are
**rhf↔tanstack-form and vee-validate↔tanstack-form, and `requires` covers neither**:
react + tanstack-form co-satisfiable, vue + tanstack-form co-satisfiable. Drop both groups with
no replacement and a React project may legally select two form-state libraries. They are
same-kind substitutes (field state, validation orchestration, submission — TanStack's own docs
position tanstack-form against rhf as a comparison, and the skill bodies mirror each other's
When-NOT lists), so the fence is exactly the pick-one shape every prior wave sustained.
**"The fence was never load-bearing" is refuted** — the hypothesis proved the wrong pair
impossible (rhf↔vee, which these groups never fenced) and concluded the actual fences were free.

**The impossibility claim is refuted too.** Worksheet §2b: "tanstack-form is in both groups, so
no partition of `web-forms` reproduces both fences." False: a category radio fences _every pair
among its members_, so one exclusive category holding the union
`{react-hook-form, tanstack-form, vee-validate}` reproduces #20 (rhf↔tanstack) and #24
(vee↔tanstack) simultaneously. The one extra edge it adds — rhf↔vee — is vacuous, because that
pair is already unreachable via requires (above). The claimed inexpressibility only holds under
the assumption that each group must map onto its own category; exclusivity-as-superset was never
considered. This is NOT the D-306 accepted-loss case the worksheet paints; it costs nothing.

**Disposition: split.** New category `web-form-library` (`exclusive: true`, displayName "Form
Library"), members react-hook-form, tanstack-form, vee-validate — three `category:` edits in the
skills repo. zod-validation stays the sole member of `web-forms` (open; residue displayName
re-cut to "Validation" — a re-cut with an in-tree ancestor: the alternatives layer already
carries a "Validation" `[zod-validation]` purpose group at default-rules.ts:906). Direction
decided on blast radius, the B5-Elysia rule: all 10
`"web-forms"` keys in `default-stacks.ts` are zod-validation rows and the three form libraries
appear in zero stacks, so leaving zod on the incumbent id costs **zero stack edits and keeps
every persisted `domainSelections.web["web-forms"]` zod pick valid** (the alternative — move zod
out to a new `web-validation` and flip `web-forms` exclusive — breaks all 10 stack keys for no
semantic gain). The naming debt is recorded rather than silent (verification-required): id
`web-forms` under displayName "Validation" is the api-api-spelled-two-ways shape, so the
optional future `web-forms` → `web-validation` category-id rename goes on the backlog as an
executable M-row (M9) with its measured cost — 10 stack keys plus every persisted
`domainSelections.web["web-forms"]` zod pick. After the split, groups #20 and #24 are wholly
inside an exclusive category and die free in Phase C. **Ordering constraint: the split must
land before Phase C deletes the conflict layer**, or the two tanstack edges have a fenceless
window.

## Question (c) — zod-validation, the canonical class-A row

**Verdict `universal`, class A, frameworks [] — confirmed at full strength.** Grep across the
entire directory (SKILL.md, reference.md, all examples, metadata.yaml): react 0, vue 0,
angular 0, svelte 0, solid 0, next 0, nuxt 0, remix 0, react-native 0. The body is pure
schema-boundary content — Zod v4, `safeParse` at trust boundaries, `z.infer` type derivation,
refinements, transforms, discriminated unions. No `requires`, no `compatibleWith`, no conflict
group, open category. It is consumed _by_ everything around it rather than depending on
anything: vee-validate's own examples integrate it via `toTypedSchema`, rhf via resolvers,
tanstack-form via validator adapters, and it appears beyond web entirely (the
`api-framework-hono` and `infra-config-setup-env` skills both carry Zod content). It is also the
only B2 skill in stacks without a binding — 10 stacks pick it as their whole `web-forms` row.

Canonical-case record (this is the row the §4 skeleton already drafts, confirmed verbatim):

```ts
"web-forms-zod-validation": {
  audited: "2026-08-07",
  verdict: "universal",
  batch: "web-state",
  classification: { class: "A", frameworks: [] },
  sources: ["https://zod.dev"],
},
```

**The structural interlock that makes this the exemplar:** the manifest's runtime cross-check
("a `universal` verdict on a skill that carries `requires` or sits in an exclusive category is a
contradiction and must fail") means zod-validation's verdict _constrains the category design_ —
question (b)'s split MUST leave zod on the open side, and any future re-shuffle of `web-forms`
that sweeps zod into an exclusive category will trip the check by construction. That is
SKILLS-01 class-A neutralization working as designed: the verdict is not a passive note, it is
an invariant the tooling enforces.

## Question (d) — web-i18n

**Radio SUSTAINED.** next-intl, react-intl, vue-i18n are same-kind substitutes — one i18n
library owns message catalogs, formatting and locale routing per app; no complementary pattern
exists or is claimed anywhere. Consistent with every prior same-kind ruling. Group #27
(`{react-intl, next-intl}`, rules 116-118) is wholly inside the exclusive category and dies free
— the worksheet's 17-count is safe here. Post-decision-2 this category is a clean re-key
specimen: pick vue in `web-framework` and next-intl/react-intl become unreachable through their
requires, the mercurius shape.

- **vue-i18n's binding exists as the R flag claims** — `needsAny [vue-composition-api, nuxt]`
  (579-583) with parity `compatibleWith` (218-220). Body verified Vue-pure (124 vue tokens; the
  10 "react" hits are "reactivity" substrings and comparison lines). Class B
  `[vue-composition-api]`. No missing binding — the worksheet's "verify it reaches" resolves
  to _verified, reaches_.
- **next-intl `requires [nextjs]` — CORRECT, with a reason-text defect.** The skill self-scopes
  unambiguously: "When NOT to use: … Pages Router … **Non-Next.js React applications (use
  react-intl instead)**" (SKILL.md), and every pattern is App Router surface — `middleware`,
  `routing.ts`, `setRequestLocale`, `NextIntlClientProvider`, `generateStaticParams`; metadata
  `usageGuidance` says "in Next.js". Clean class B `[nextjs]` per the clerk template. **But the
  reason string "next-intl is built specifically for Next.js" (515-517) over-claims
  library-level exclusivity the same way "NextAuth is Next.js-only" did (B5 Contradicts §1):**
  next-intl's core is `use-intl`, officially documented for plain React apps, React Native, and
  even non-React JS via `createTranslator`/`createFormatter`
  (next-intl.dev/docs/environments/core-library). The binding survives on taught surface; the
  reason must say so or it rots. Re-cut to: "Skill teaches next-intl's Next.js App Router
  surface — middleware, routing.ts, setRequestLocale, NextIntlClientProvider."
- **react-intl `needsAny [react, nextjs, remix]`** (555-559) — verified correct; body is
  93-token React-saturated FormatJS surface. The react-native omission matches the taught
  surface (zero RN tokens; react-intl can run in RN via `textComponent` but the skill never
  goes there) and is harmless anyway — any RN stack contains react, satisfying the needsAny
  through the react member. Class B `[react]`.

## Question (e) — web-utilities

- **rxjs: UNIVERSAL, class A — the Angular-leaning suspicion is refuted by direct body check.**
  Zero hits for angular, HttpClient, async pipe, or Injectable across the entire directory. The
  10 "react" tokens are the word "reactive"; the 26 "next" tokens are the Observer `next:`
  callback and prose. The taught surface is framework-neutral RxJS — creation operators,
  pipeable transforms, flattening-operator choice, Subjects, `takeUntil` destroy pattern — and
  RxJS itself runs in any runtime. One cosmetic note: `examples/memory-leaks.md` uses a
  `this.destroy$` class-property idiom (Angular-popularized style) without any Angular import;
  it does not scope the skill. No requires; the open category is correct.
- **date-fns: UNIVERSAL, class A.** The 13 "next" tokens are `nextWeek` variables and DST
  prose. Pure date manipulation; no framework anywhere.
- **native-js: UNIVERSAL, class A.** The 13 "react" tokens are "reactive frameworks" (as
  consumers of immutability guidance) and example array data (`tags: ["react", …]`). Modern JS
  built-ins vs lodash; no framework anywhere.
- **vueuse: binding exists as the R flag claims** — `needsAny [vue-composition-api, nuxt]`
  (489-493) with parity `compatibleWith` (277-279). The token sweep's 44 "react" hits are all
  "reactive/reactivity" substrings; a word-boundary grep finds zero actual React references.
  Class B `[vue-composition-api]`.

## The remaining rows, verified

- **jotai / mobx / redux-toolkit / zustand:** all four bound
  `needsAny [react, nextjs, remix, react-native]`; all class B `[react]` (taught surface is
  React hooks — mobx explicitly via `mobx-react-lite`, per its own reason string). The
  react-native members are factually sound (all four libraries run in RN) and harmless-redundant
  besides (react is in every RN stack via the anchor rule). Bodies confirmed free of other
  frameworks; mobx/rtk "next" tokens are middleware `next(action)` and `nextStep` — false
  positives.
- **pinia:** bound, class B `[vue-composition-api]`; its 28 "react" tokens are all
  "reactivity". **ngrx-signalstore:** bound `needs [angular-standalone]` (410-413), class B
  `[angular-standalone]` — the only Angular-bound state skill in the catalog; its 31 "react"
  tokens are "react to signal changes" and comparison prose.
- **error-boundaries:** bound `needsAny [react, nextjs, remix]` (537-541), class B `[react]`.
  The react-native omission is taught-surface-consistent: React 19 `createRoot` error options
  are `react-dom` API, and the directory has zero RN tokens. Do not widen. **Apply-phase
  caution that generalizes to every needsAny in this batch:** the meta-framework members
  (nextjs, remix) look redundant (each requires react) but are the CLI's no-closure workaround —
  do not "simplify" these lists before EDITOR-11 step 2's shared closure lands.
- **result-types: UNIVERSAL, class A.** Zero framework tokens; TypeScript Result/Either
  patterns, railway-oriented composition; neverthrow/Effect appear as library mentions, not
  bindings. With error-boundaries bound and result-types universal, the open
  `web-error-handling` category is exactly right — the two members are different kinds that
  compose (render-tree fault isolation vs typed error values), not substitutes.
- **react-hook-form:** bound (380-384), class B `[react]`. Body 100% React (64 tokens; zero RN
  content — the react-native member is factually fine, RHF supports RN, and harmless per the
  detox precedent). Self-scope confirmed in metadata ("building forms in React").
- **vee-validate:** bound (398-402), class B `[vue-composition-api]`. Vue 3-pure
  (`defineField`, `useField`, `toTypedSchema`); its 24 "react" tokens are "reactivity".
- **tanstack-form: existing wide needsAny SUSTAINED — class C, the batch's only multi-framework
  adapter skill.** The rule's seven members (617-629) match the skill's claimed surface: its
  auto-detection line names all five adapter packages (`@tanstack/react-form`, `vue-form`,
  `solid-form`, `angular-form`, `lit-form`), When-to-use says "Multi-framework projects (React,
  Vue, Solid, Angular, Lit)", philosophy asserts "Framework-agnostic core — same mental model
  across" all five. In-catalog adapter set: [react, vue-composition-api, angular-standalone,
  solidjs]; lit is out of catalog. Two deliberate boundary notes: (1) **svelte stays out of the
  needsAny** even though upstream now ships a stable `@tanstack/svelte-form` (v1.33.0 on npm;
  tanstack.com/form/v1/docs/framework/svelte, Svelte 5 runes) — the skill's own text never
  claims Svelte, and the nextauth precedent forbids widening past the taught+claimed surface;
  re-derive if the skill grows Svelte content. (2) The demonstrated code is 100%
  `@tanstack/react-form` JSX while the rule grants Vue/Angular/Solid — unlike nextauth this is
  not an over-claim to fence away, on three grounds (re-cut in verification: "same package
  core" alone would not survive the sibling-packages counter — the adapters ARE sibling
  packages, `@tanstack/react-form` vs `@tanstack/vue-form`): (a) **followability** — strip the
  React slices and the options/validators/listeners/array-API content remains executable
  against the other adapters (identical core options API, upstream-verified), where stripping
  next-auth's content left nothing; (b) the claimed surface is load-bearing because the
  content transfers — the three claim surfaces quoted above are the skill's own text; (c)
  **named victims** — narrowing to `[react]` would strip angular-standalone and solidjs stacks
  of the catalog's ONLY reachable form library (rhf is React-only, vee is Vue-only) — the
  maestro/oclif-ink shape, one doctrine with B1's urql keep. The residual content-fit gap is
  F2 below, advice-level.

## Manifest rows

Batch id `web-state`, audited `2026-08-07`. No framework skills in this batch — every row
classifies.

| skill (current id)                                     | category after B2                        | verdict                                 | class | frameworks                                                                | derived-requires                                                                                                                              | sources                                                                                                                                                                                                                                   | notes                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------- | --------------------------------------- | ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jotai (web-state-jotai)                                | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing `needsAny [react, nextjs, remix, react-native]` verified                                                                      | skill body (atoms, useAtom, Suspense — React-only); jotai.org                                                                                                                                                                             | The radio-attack candidate; sustained — see question (a). D-306 line + reopen trigger recorded.                                                                                                                                                                  |
| mobx (web-state-mobx)                                  | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing needsAny verified                                                                                                             | skill body (mobx-react-lite observer throughout)                                                                                                                                                                                          | MobX-the-library is framework-agnostic; taught surface is React — clerk-precedent binding already correct.                                                                                                                                                       |
| redux-toolkit (web-state-redux-toolkit)                | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing needsAny verified                                                                                                             | skill body (React Redux hooks, RTK Query)                                                                                                                                                                                                 | "next" tokens are middleware `next(action)` — false positives.                                                                                                                                                                                                   |
| zustand (web-state-zustand)                            | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing needsAny verified                                                                                                             | skill body (useShallow, zustand/react/shallow, v5 React 18+ requirement)                                                                                                                                                                  | Its territorial MUST ("ALL shared UI state") is what keeps the radio honest — question (a). ×59 stacks, the category's default pick.                                                                                                                             |
| pinia (web-state-pinia)                                | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [vue-composition-api]                                                     | none — existing `needsAny [vue-composition-api, nuxt]` verified                                                                               | skill body (storeToRefs, setup stores — Vue-pure)                                                                                                                                                                                         | R flag verified live. Unreachable in React stacks post-narrowing — the radio's cross-framework work is redundant for it.                                                                                                                                         |
| ngrx-signalstore (web-state-ngrx-signalstore)          | web-client-state                         | constrained-via-exclusivity-or-requires | B     | [angular-standalone]                                                      | none — existing `needs [angular-standalone]` verified                                                                                         | skill body (signalStore, Angular DI — 97 angular tokens)                                                                                                                                                                                  | The catalog's only Angular-bound state skill.                                                                                                                                                                                                                    |
| react-hook-form (web-forms-react-hook-form)            | **web-form-library** (moved)             | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing `needsAny [react, nextjs, remix, react-native]` verified                                                                      | skill body (useForm, Controller, resolvers — React-only); react-hook-form.com                                                                                                                                                             | Group #20 member; fence becomes the new radio. Zero stacks reference it.                                                                                                                                                                                         |
| tanstack-form (web-forms-tanstack-form)                | **web-form-library** (moved)             | constrained-via-exclusivity-or-requires | C     | [react (taught syntax), vue-composition-api, angular-standalone, solidjs] | none — existing 7-member needsAny sustained; svelte deliberately excluded (skill claims React/Vue/Solid/Angular/Lit only), lit out of catalog | skill body (auto-detection names all five adapter packages; demonstrated code is @tanstack/react-form); tanstack.com/form framework docs; npm @tanstack/svelte-form v1.33.0 (exists — widen only when the skill teaches it)               | The both-groups skill; the split's superset category is what makes both fences expressible — question (b). Kept wide on followability + named victims (angular/solid would otherwise lose their only form library). F2 records the React-syntax content-fit gap. |
| vee-validate (web-forms-vee-validate)                  | **web-form-library** (moved)             | constrained-via-exclusivity-or-requires | B     | [vue-composition-api]                                                     | none — existing `needsAny [vue-composition-api, nuxt]` verified                                                                               | skill body (defineField, useField, toTypedSchema — Vue 3-pure)                                                                                                                                                                            | Group #24 member. Zero stacks reference it.                                                                                                                                                                                                                      |
| zod-validation (web-forms-zod-validation)              | web-forms (unchanged — the open residue) | **universal**                           | A     | []                                                                        | none                                                                                                                                          | skill body (Zod v4, safeParse, z.infer — **zero framework tokens in the whole directory**); https://zod.dev                                                                                                                               | **The canonical SKILLS-01 class-A row** — question (c). Its verdict forces the split direction: universal must not sit in an exclusive category. ×10 stacks.                                                                                                     |
| error-boundaries (web-error-handling-error-boundaries) | web-error-handling                       | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing `needsAny [react, nextjs, remix]` verified; react-native omission correct (createRoot options are react-dom; zero RN content) | skill body (react-error-boundary v6, React 19 createRoot error hooks)                                                                                                                                                                     | Do not "simplify" the meta-framework members before the shared closure lands.                                                                                                                                                                                    |
| result-types (web-error-handling-result-types)         | web-error-handling                       | **universal**                           | A     | []                                                                        | none                                                                                                                                          | skill body (Result/Either, railway-oriented — zero framework tokens)                                                                                                                                                                      | Composes with error-boundaries (different kinds); open category correct.                                                                                                                                                                                         |
| next-intl (web-i18n-next-intl)                         | web-i18n                                 | constrained-via-exclusivity-or-requires | B     | [nextjs]                                                                  | none — existing `requires [nextjs]` correct; **reason re-cut required** (F1)                                                                  | skill body ("When NOT to use: Non-Next.js React applications (use react-intl instead)"; App Router surface throughout); next-intl.dev/docs/environments/core-library (use-intl core works without Next.js — library fact, not skill fact) | The worksheet's "next-intl requires nextjs?" — yes, on taught surface; the current reason claims it of the library and would rot.                                                                                                                                |
| react-intl (web-i18n-react-intl)                       | web-i18n                                 | constrained-via-exclusivity-or-requires | B     | [react]                                                                   | none — existing `needsAny [react, nextjs, remix]` verified                                                                                    | skill body (FormatJS surface, 93 react tokens)                                                                                                                                                                                            | Group #27 dies free inside the sustained radio.                                                                                                                                                                                                                  |
| vue-i18n (web-i18n-vue-i18n)                           | web-i18n                                 | constrained-via-exclusivity-or-requires | B     | [vue-composition-api]                                                     | none — existing `needsAny [vue-composition-api, nuxt]` verified                                                                               | skill body (Vue-pure, 124 tokens)                                                                                                                                                                                                         | The worksheet's "R flag says it reaches — verify" resolves to verified.                                                                                                                                                                                          |
| rxjs (web-utilities-rxjs)                              | web-utilities                            | **universal**                           | A     | []                                                                        | none                                                                                                                                          | skill body (Observables, operators, takeUntil — **zero** angular/HttpClient/async-pipe/Injectable hits; "react"/"next" tokens are "reactive"/Observer.next false positives)                                                               | The worksheet's Angular-leaning suspicion refuted by body check — question (e).                                                                                                                                                                                  |
| date-fns (web-utilities-date-fns)                      | web-utilities                            | **universal**                           | A     | []                                                                        | none                                                                                                                                          | skill body (pure date manipulation; "next" tokens are nextWeek variables)                                                                                                                                                                 |                                                                                                                                                                                                                                                                  |
| vueuse (web-utilities-vueuse)                          | web-utilities                            | constrained-via-exclusivity-or-requires | B     | [vue-composition-api]                                                     | none — existing `needsAny [vue-composition-api, nuxt]` verified                                                                               | skill body (composables, Vue 3; "react" hits are "reactiv*" substrings — zero actual React)                                                                                                                                               | R flag verified live.                                                                                                                                                                                                                                            |
| native-js (web-utilities-native-js)                    | web-utilities                            | **universal**                           | A     | []                                                                        | none                                                                                                                                          | skill body (ES2023 immutable methods, modern built-ins; "react" hits are "reactive frameworks" prose + example data)                                                                                                                      |                                                                                                                                                                                                                                                                  |

Net changes for the apply phase: **0 new `requires` rules, 0 changed rules, 0 radio flips, 1
category split** (`web-form-library` exclusive ← rhf/tanstack-form/vee-validate; `web-forms`
residue stays open with zod-validation), **1 reason-text re-cut** (next-intl, F1), and four
conflict groups (#3, #20, #24, #27) end wholly-inside-exclusive — #3 and #27 already are; #20
and #24 become so when the split lands, which must precede Phase C.

## Findings

- **F1 (rules reason text):** `default-rules.ts:517` — "next-intl is built specifically for
  Next.js" is false of the library (use-intl core is officially documented for plain React, RN,
  and non-React JS) and true only of the skill. Re-cut to taught-surface phrasing: "Skill
  teaches next-intl's Next.js App Router surface — middleware, routing.ts, setRequestLocale,
  NextIntlClientProvider." Same defect class as B5's nextauth reason fix; ride the same slice.
- **F2 (skills-repo content-fit, advice-level):** tanstack-form's demonstrated code is 100%
  `@tanstack/react-form` JSX while its rule (correctly) grants Vue/Angular/Solid. The core API
  transfers, but the critical MUST "use `form.Field` with the `children` render prop" is
  React/Vue-shaped and reads wrong for Angular's `[tanstackField]` directive adapter. Not a
  fence matter (the claimed surface governs); a skills-backlog line to grow adapter examples —
  and the trigger to widen the needsAny to svelte/sveltekit when Svelte content lands
  (`@tanstack/svelte-form` is stable upstream).
- **F3 (category description drift):** `web-client-state`'s description "UI state, forms, local
  data (Zustand, Redux, MobX)" names forms (wrong category) and omits three members. Cosmetic.
- **F4 (radio-dependency ledger):** group #3's free death in Phase C is contingent on the
  `web-client-state` radio staying exclusive, and groups #20/#24's on the `web-form-library`
  split landing. If any later wave revisits either disposition, the affected groups must be
  re-classed from "dies free" to load-bearing before deletion. (The turborepo/nx flip is the
  live precedent for how silently this can move.)
- **F5 (consistency gates, pre-checked):** no B2 skill conflicts with anything it requires; all
  15 bindings point at members of the exclusive `web-framework` (or its meta-framework closure
  members), the decision-2 re-key shape; the five `universal` verdicts sit in open categories
  with no requires — zero manifest-cross-check contradictions; slugs all extant in the
  generated unions.
- **F6 (coverage observation, no action):** B2 needs nothing added — every non-universal skill
  was already bound before this audit. The batch is the existence proof that the catalog's
  binding vocabulary is sufficient for a fully-covered domain slice; its dispositions are
  category-shape work, not coverage work.

## Contradicts-the-worksheet

1. **§2b #24's structural-impossibility claim is false.** "tanstack-form is in both groups, so
   no partition of `web-forms` reproduces both fences" assumes each group must map to its own
   category. Category exclusivity fences every pair among members, so the superset
   `{rhf, tanstack-form, vee-validate}` in one exclusive category expresses both #20 and #24;
   the extra rhf↔vee edge is vacuous because requires already makes that pair unreachable. Not
   a D-306 accepted-loss case — a clean split.
2. **The "fence was never load-bearing; drop it" hypothesis is refuted.** It proves the wrong
   pair: rhf↔vee-validate (unreachable via requires — true, verified) was never these groups'
   content. The groups fence rhf↔tanstack-form and vee-validate↔tanstack-form, and requires
   covers neither; dropping without the split hands every React project a legal
   two-form-libraries selection. The multi-hop unreachability argument also silently rides the
   requires-closure (EDITOR-11 step 2) — same dependency Phase C already carries, worth naming.
3. **"The radio is doing framework-exclusion work that `requires` already does" — half-true.**
   The cross-framework work is redundant, verified. But the worksheet's framing misses the
   radio's within-framework job (one of four React stores), which requires cannot do and which
   group #3's redundancy classification depends on. The flag is right; the _rationale_ the
   manifest records must be the within-framework fence, not the artifact.
4. **Minor:** the worksheet's "date-fns/rxjs/native-js: confirm universal" undersells rxjs —
   the Angular-leaning question was real (RxJS's ecosystem center of gravity is Angular) and
   deserved the explicit zero-Angular-content body check this batch now records.

## Migration surfaces (named, NOT fixed here)

| #   | surface                               | action                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | skills repo ×3                        | `web-forms-react-hook-form`, `web-forms-tanstack-form`, `web-forms-vee-validate` `metadata.yaml`: `category: web-forms` → `web-form-library` (skill ids unchanged — the stack-detect "id-prefix liar" precedent covers id/category decoupling)                                                                     |
| M2  | `default-categories.ts`               | add `web-form-library` block (`exclusive: true`, domain web, order between web-forms and web-testing); re-cut `web-forms` description/displayName to its validation residue; fix F3's `web-client-state` description while touching the file                                                                       |
| M3  | generate round                        | `generate:types` (matrix.ts, source-types.ts category union), matrix-package vendored regen, `generate-json-schemas` (both schema enums gain `web-form-library`) — the B5 M3 / verify-B6 5.3 gate                                                                                                                  |
| M4  | stacks                                | **zero edits** — all 10 `"web-forms"` keys hold zod-validation, which keeps its category; no stack references the three moved skills (measured)                                                                                                                                                                    |
| M5  | user configs                          | a persisted `domainSelections.web["web-forms"]` holding rhf/tanstack/vee becomes schema-invalid post-regen; pre-1.0, no shim — release-notes line (zod picks stay valid)                                                                                                                                           |
| M6  | rules                                 | groups #20 (88-90) and #24 (104-106) become wholly-inside-exclusive after M1-M3 → die free in Phase C; **ordering: split before deletion**. Groups #3 and #27 already die free (contingent on the sustained radios, F4). Alternatives groups "Forms (React)"/"Forms (Vue)" (905-906) are slug-based and unaffected |
| M7  | rules reason                          | `default-rules.ts:517` next-intl reason re-cut (F1)                                                                                                                                                                                                                                                                |
| M8  | D-306 records                         | jotai-beside-store coexistence line (citing `jotai-zustand`/`atomWithStore`) + zustand-MUST reopen trigger (question a); tanstack-form svelte-widening trigger (F2)                                                                                                                                                |
| M9  | rename backlog (optional, executable) | `web-forms` → `web-validation` category-id rename, recorded as backlog per question (b): measured cost 10 `"web-forms"` stack keys + every persisted `domainSelections.web["web-forms"]` zod pick; displayName "Validation" already has its alternatives-layer ancestor (default-rules.ts:906)                     |
