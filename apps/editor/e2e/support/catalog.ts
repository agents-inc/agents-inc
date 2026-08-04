// Fixed points in the generated catalogue that the specs rely on.
//
// The catalogue is regenerated from the agents-inc CLI, so these will drift
// eventually. `catalog.spec.ts` asserts every one of them still exists, which
// turns "the whole suite went red" into one obvious failure naming the value
// that moved.

export const STACKS = {
  scratch: "Start from scratch",
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

// An incompatibility that only exists several hops out: SvelteKit is built on
// Svelte, and Svelte conflicts with React — nothing links React to SvelteKit
// directly. `blocked` sits in a different category from `trigger`, so the
// exclusive-sibling exemption cannot account for it.
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

// The other direction: choosing `implier` chooses `implied` too, so everything
// `implied` conflicts with goes — even though `implier` names none of it.
// `blocked` sits in `implied`'s own exclusive category, which is what makes the
// sibling exemption the interesting part.
export const IMPLIED = {
  implier: "Next.js",
  implierCategory: "Meta-Framework",
  implied: "React",
  impliedCategory: "Framework",
  blocked: "Angular",
  reason: "Conflicts with React",
  // A sibling of the implier, so swapping between them still has to work.
  implierSibling: "Remix",
} as const

// Model and thinking effort belong to the sub-agent, not the skill — skills are
// plugins from different repos, so a per-skill model never meant anything.
//
// There is no single default: an agent rests on its own catalogue model
// (`SubAgent.model`, "opus" for web-developer and every other developer), and
// only falls back to sonnet when its metadata names none. Effort rests at
// medium for everyone until agent metadata carries one.
//
// Scope rests at project for everyone, and that one is the CLI's default
// rather than anything the catalogue says: sub-agent front-matter is written
// into the project unless the user asks for their own ~/.claude.
export const AGENT_OPTIONS = {
  models: ["opus", "fable", "sonnet", "haiku"],
  efforts: ["low", "medium", "high", "xhigh", "max"],
  restingModel: "opus",
  restingEffort: "medium",
  restingScope: "project",
} as const
