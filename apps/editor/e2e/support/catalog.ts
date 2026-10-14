// Fixed points in the generated catalogue that the specs rely on.
// `catalog.spec.ts` asserts each still exists, so drift fails in one place.

export const STACKS = {
  scratch: "Start from scratch",
  // The scratch cell's words once anything is selected.
  clearScratch: "Clear and start from scratch",
  nextjs: "Next.js Full-Stack",
  t3: "Next.js T3 Stack",
  remix: "Remix Full-Stack",
} as const

export const DOMAINS = {
  web: "Web",
  api: "API",
  ai: "AI",
} as const

// Picking one deselects the sibling.
export const EXCLUSIVE_CATEGORY = {
  name: "Framework",
  tag: "one of",
  first: "React",
  second: "Vue",
} as const

// Several may be held at once.
export const MULTI_CATEGORY = {
  name: "Styling",
  tag: "multi",
  first: "Tailwind CSS",
  second: "CVA",
} as const

// In the Next.js stack's expansion, so it is selected after applying it.
export const STACK_MEMBER_SKILL = "React"

// A domain skill reaches its domain's three agents plus `pm` and `reviewer`.
export const DOMAIN_REACH = {
  web: 5,
  api: 5,
} as const

// The Next.js stack's one skill reaching a single sub-agent, so a project-
// scoped configuration's scope error (EDITOR-08) is resolved in one click.
export const SINGLE_AGENT_SKILL = {
  name: "Vite",
  category: "Build Tools",
  agentId: "web-developer",
} as const

// An incompatibility several hops out: SvelteKit needs Svelte, which conflicts
// with React. `blocked` is in another category, so no sibling exemption applies.
export const INCOMPATIBLE = {
  trigger: "React",
  triggerCategory: "Framework",
  blocked: "SvelteKit",
  blockedCategory: "Meta-Framework",
  reason: "Needs Svelte",
  // Reached through two requirements rather than one.
  blockedTransitively: "Nuxt",
  transitiveCategory: "Meta-Framework",
} as const

// Choosing `implier` chooses `implied`, so whatever `implied` strands goes too.
// `impliedSibling` conflicts only with a sibling, which a pick-one swap forgives.
export const IMPLIED = {
  implier: "Next.js",
  implierCategory: "Meta-Framework",
  implied: "React",
  impliedCategory: "Framework",
  // Vuetify accepts only the Vue family, and the implied React rules Vue out.
  blocked: "Vuetify",
  blockedCategory: "Design System Kit",
  reason: "Needs one of Vue, Nuxt",
  // A sibling of the implied React: it conflicts with React, but a pick-one
  // category swaps rather than adds, so it stays a live choice.
  impliedSibling: "Angular",
  // A sibling of the implier, so swapping between them still has to work.
  implierSibling: "Remix",
} as const

// An agent rests on its own catalogue model ("opus" for every developer), at
// medium effort and global scope. On Codex the model row is the ids the pinned
// Codex binary offers, none pressed at rest: the session's own model.
export const AGENT_OPTIONS = {
  models: ["opus", "fable", "sonnet", "haiku"],
  codexChoices: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  efforts: ["low", "medium", "high", "xhigh", "max"],
  restingModel: "opus",
  restingEffort: "medium",
  restingScope: "global",
} as const
