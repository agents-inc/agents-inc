// The selection semantics as implementation-neutral data; each runner maps its
// API onto these fields. `outOfReach` and `inReach` are chosen samples, not
// the whole catalogue.

import { CATALOG } from "../read-model/catalog"
import type { SkillId } from "../vendor/generated/source-types"

// Labels for the editor/CLI divergences a scenario guards against.
export type SelectionDivergence =
  | "discourages"
  | "exclusive-forgiveness"

export type SelectionScenario = {
  id: string
  title: string
  // What the user clicked.
  selection: readonly SkillId[]
  // Everything the selection necessarily also chooses, itself excluded.
  implied: readonly SkillId[]
  outOfReach: readonly SkillId[]
  inReach: readonly SkillId[]
  discouraged: readonly SkillId[]
  // `null` when both implementations agree.
  divergence: SelectionDivergence | null
  why: string
}

const REACT = "web-framework-react"
const VUE = "web-framework-vue-composition-api"
const SVELTE = "web-framework-svelte"
const ANGULAR = "web-framework-angular-standalone"
const SOLID = "web-framework-solidjs"
const NEXTJS = "web-meta-framework-nextjs"
const REMIX = "web-meta-framework-remix"
const NUXT = "web-meta-framework-nuxt"
const SVELTEKIT = "web-meta-framework-sveltekit"
const ASTRO = "web-meta-framework-astro"
const REACT_NATIVE = "mobile-framework-react-native"
const EXPO = "mobile-framework-expo"
const TAILWIND = "web-styling-tailwind"
const VITE = "web-tooling-vite"
const SHADCN = "web-ui-shadcn-ui"
const RADIX = "web-ui-radix-ui"
const HEADLESS_UI = "web-ui-headless-ui"
const MUI = "web-ui-mui"
const VUETIFY = "web-ui-vuetify"
const RHF = "web-forms-react-hook-form"
const VEE_VALIDATE = "web-forms-vee-validate"
const TANSTACK_FORM = "web-forms-tanstack-form"
const RTL = "web-testing-react-testing-library"
const VUE_TEST_UTILS = "web-testing-vue-test-utils"
const VUEUSE = "web-utilities-vueuse"
const NEXT_INTL = "web-i18n-next-intl"
const PINIA = "web-state-pinia"
const NGRX = "web-state-ngrx-signalstore"
const PRISMA = "api-database-prisma"
const DRIZZLE = "api-database-drizzle"
const SEQUELIZE = "api-database-sequelize"

export const SELECTION_SCENARIOS: readonly SelectionScenario[] = [
  {
    id: "empty-selection-rules-out-nothing",
    title: "offers the whole catalogue while nothing is selected",
    selection: [],
    implied: [],
    outOfReach: [],
    inReach: [REACT, SVELTE, PINIA, SHADCN, TAILWIND],
    discouraged: [],
    divergence: null,
    why: "Two skills that cannot coexist are both offerable until one is picked.",
  },
  {
    id: "closure-follows-one-requirement",
    title: "counts what a selection is built on as chosen",
    selection: [NEXTJS],
    implied: [REACT],
    outOfReach: [],
    inReach: [RADIX, RHF, HEADLESS_UI, RTL],
    discouraged: [],
    divergence: null,
    why: "Next.js is built on React, so the React-bound companions are open without React ever being clicked.",
  },
  {
    id: "closure-follows-a-chain-of-requirements",
    title: "carries the closure through more than one hop",
    selection: [EXPO],
    implied: [REACT_NATIVE, REACT],
    outOfReach: [VEE_VALIDATE],
    inReach: [REACT_NATIVE],
    discouraged: [],
    divergence: null,
    why: "Expo needs React Native, which needs React — and Vue's forms go with it.",
  },
  {
    id: "closure-takes-only-the-unambiguous-requirement",
    title: "implies every member of an all-of group and none of a choice",
    selection: [SHADCN],
    implied: [TAILWIND],
    outOfReach: [],
    inReach: [TAILWIND, REACT],
    discouraged: [],
    divergence: null,
    why: "shadcn/ui needs Tailwind outright plus one of the React frameworks; only the first can be named.",
  },
  {
    id: "a-choice-commits-to-none-of-its-options",
    title: "implies nothing from a requirement offering a choice",
    selection: [PINIA],
    implied: [],
    outOfReach: [],
    inReach: [VUE, NUXT],
    discouraged: [],
    divergence: null,
    why: "Pinia needs Vue or Nuxt and cannot say which, so neither is chosen and neither rules the other out. What Pinia does *not* do to the frameworks it cannot run on is the scenario below.",
  },
  {
    id: "a-choice-survives-on-one-candidate",
    title: "keeps a choice open while any one candidate survives",
    selection: [ANGULAR],
    implied: [],
    outOfReach: [RADIX],
    inReach: [NGRX, TANSTACK_FORM],
    discouraged: [],
    divergence: null,
    why: "TanStack Form lists Angular among its options and survives; Radix lists only the React family and does not.",
  },
  {
    id: "the-wrong-framework-rules-out-what-is-bound-to-another",
    title: "rules out the skills bound to a framework the selection excludes",
    selection: [SVELTE],
    implied: [],
    outOfReach: [RADIX, SHADCN, RHF, RTL, REACT_NATIVE],
    inReach: [TAILWIND, VITE],
    discouraged: [],
    divergence: null,
    why: "Svelte conflicts with React, so everything that needs React goes; the unbound skills stay.",
  },
  {
    id: "losing-a-skill-loses-what-was-built-on-it",
    title: "keeps stranding dependents until nothing more is stranded",
    selection: [REACT],
    implied: [],
    outOfReach: [VEE_VALIDATE, VUE_TEST_UTILS, VUETIFY, VUEUSE],
    inReach: [TAILWIND],
    discouraged: [],
    divergence: null,
    why: "React conflicts with Vue, Nuxt is built on Vue, and the Vue companions accept only those two — the mirror of the Svelte case.",
  },
  {
    id: "a-pick-one-category-swaps-rather-than-disables",
    title: "leaves the siblings of a selected skill swappable",
    selection: [REACT],
    implied: [],
    outOfReach: [],
    inReach: [SVELTE, VUE, ANGULAR, SOLID],
    discouraged: [],
    divergence: null,
    why: "Clicking a sibling replaces React rather than joining it, so disabling the rest would strand the first choice.",
  },
  {
    id: "the-swap-rule-is-not-about-frameworks",
    title: "leaves the siblings swappable in every pick-one category",
    selection: [PRISMA],
    implied: [],
    outOfReach: [],
    inReach: [DRIZZLE, SEQUELIZE],
    discouraged: [],
    divergence: null,
    why: "The same swap holds for database ORMs, so the rule cannot be reading the web framework category by name.",
  },
  {
    id: "the-implier-keeps-its-own-siblings-swappable",
    title: "leaves a sibling of the skill that implied the closure swappable",
    selection: [NEXTJS],
    implied: [REACT],
    outOfReach: [],
    inReach: [REACT, REMIX],
    discouraged: [],
    divergence: null,
    why: "Remix is built on the same React and swaps with Next.js; React itself was never clicked and stays a live choice.",
  },
  {
    id: "two-selections-satisfy-a-split-requirement",
    title: "opens a skill once every one of its requirements is met",
    selection: [REACT, TAILWIND],
    implied: [],
    outOfReach: [],
    inReach: [SHADCN, RADIX, MUI],
    discouraged: [],
    divergence: null,
    why: "shadcn/ui needs both halves; MUI stands for the design-system kits, which are a pick-one category and so stay swappable while none is selected. A scenario pinning the opposite — kits disabling each other through a conflict group inside an open category — was dropped when that group died with the `web-ui-kit` radio, and no catalogued pair states that shape any more.",
  },
  {
    id: "a-meta-framework-rules-out-the-other-family",
    title: "rules out the other family through the framework it implies",
    selection: [NUXT],
    implied: [VUE],
    outOfReach: [RADIX],
    inReach: [VUE, VUETIFY],
    discouraged: [],
    divergence: null,
    why: "Nuxt implies Vue, Vue conflicts with React, and Radix accepts only the React family.",
  },
  {
    id: "selecting-the-base-alongside-changes-nothing",
    title: "answers the same whether the base was clicked or implied",
    selection: [VUE, NUXT],
    implied: [],
    outOfReach: [RADIX, RHF],
    inReach: [VUETIFY],
    discouraged: [],
    divergence: null,
    why: "Selecting Vue explicitly beside Nuxt must not change a single verdict from implying it.",
  },
  {
    id: "a-svelte-meta-framework-rules-out-the-react-family",
    title: "rules out the React family through a Svelte meta-framework",
    selection: [SVELTEKIT],
    implied: [SVELTE],
    outOfReach: [RADIX, RHF],
    inReach: [SVELTE, TAILWIND],
    discouraged: [],
    divergence: null,
    why: "The mirror of the Nuxt case, so the answer cannot be coming from anything React-specific.",
  },
  {
    id: "a-framework-bound-skill-beside-a-framework-that-cannot-host-it",
    title:
      "rules out only what a framework excludes, not what it fails to host",
    selection: [ASTRO],
    implied: [],
    outOfReach: [NEXT_INTL],
    inReach: [RADIX, VUETIFY, RHF, VUE_TEST_UTILS, TAILWIND],
    discouraged: [],
    divergence: null,
    why: "Astro hosts neither React nor Vue, but it excludes neither: it conflicts only with its sibling meta-frameworks, so next-intl loses the Next.js it is built on while both component families stay satisfiable and therefore offerable. Until 2026-08-07 this scenario asserted the mirror image — all four families' companions ruled out — and carried `divergence: \"framework-constraint\"`, the CLI's `compatibleWith` whitelist answering 'is a declared host selected'. The owner ruled those verdicts an accepted loss and CLI-389 phase C deleted the field, so both sides now answer 'could this still become valid' and this is an agreement.",
  },
  {
    id: "a-companion-whose-base-is-merely-still-available",
    title:
      "keeps a companion offerable while the base it needs is still selectable",
    selection: [REACT],
    implied: [],
    outOfReach: [],
    inReach: [EXPO, REACT_NATIVE],
    discouraged: [],
    divergence: null,
    why: "Expo is for React Native, and React alone is not React Native — but React rules React Native out of nothing, so Expo's requirement is unmet rather than unreachable and the cell stays live. Until 2026-08-07 this asserted Expo ruled out, on the CLI's `compatibleWith` whitelist; the owner ruled that verdict an accepted loss when CLI-389 phase C deleted the field. Nudging the user toward the base it still needs is another surface's job, not a verdict.",
  },
  {
    id: "a-framework-beside-a-companion-bound-to-another",
    title:
      "leaves every framework offerable beside a companion that has committed to none",
    selection: [PINIA],
    implied: [],
    outOfReach: [],
    inReach: [REACT, SVELTE],
    discouraged: [],
    divergence: null,
    why: "Pinia needs Vue or Nuxt and cannot say which, so it drags neither in — and a framework it cannot run on is therefore excluded by nothing. Until 2026-08-07 React and Svelte were ruled out here through the CLI's `compatibleWith` whitelist, which read the companion's declared hosts back onto the frameworks; the owner ruled that an accepted loss and CLI-389 phase C deleted the field. The sibling scenario `a-choice-commits-to-none-of-its-options` pins what Pinia implies; this one pins what it does not rule out.",
  },
  {
    id: "a-sibling-conflicting-with-a-merely-implied-skill",
    title: "leaves a sibling conflicting with an implied skill swappable",
    selection: [NEXTJS],
    implied: [REACT],
    outOfReach: [],
    inReach: [ANGULAR, SVELTE],
    discouraged: [],
    divergence: "exclusive-forgiveness",
    why: "The CLI forgives the conflict because the category is pick-one. The editor forgives it only for a *selected* sibling, and React here is implied, so it disables Angular and Svelte instead.",
  },
  {
    id: "an-unmet-requirement-inside-a-pick-one-category",
    title:
      "rules out a pick-one skill whose requirement the selection has ruled out",
    selection: [NEXTJS, REACT],
    implied: [],
    outOfReach: [NUXT],
    inReach: [REMIX],
    discouraged: [],
    divergence: null,
    why: "Both clash with the selected Next.js in a pick-one category, so the click swaps it out — which rescues Remix, built on the React that is also selected, and does nothing for Nuxt, which needs the Vue that same React rules out. Forgiveness reaches exactly as far as the swap does. React is named beside Next.js rather than left implied because the CLI computes no requires-closure yet, the same reason `selecting-the-base-alongside-changes-nothing` spells its base out. The exemplar was VitePress until the docs frameworks stopped requiring a base framework — a docs site is its own deployable — which left Nuxt carrying the fence this scenario is about.",
  },
]

// Derived from the catalogue so the `discourages` golden tests what it declares.
export const DISCOURAGED_PAIRS: readonly (readonly [string, string])[] =
  Object.values(CATALOG.skillsById).flatMap((skill) =>
    skill.discourages.map((other) => [skill.id, other] as const)
  )
