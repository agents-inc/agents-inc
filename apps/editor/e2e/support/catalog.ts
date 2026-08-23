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

// Selecting a skill assigns it only to the sub-agents that would reasonably
// use it — the relevance rule, shared with the CLI's generator: a domain skill
// reaches its own domain's roster (every role flavor that domain fields) plus
// the cross-domain `pm` and `reviewer`, and nobody else, not even lazily.
// Three implementation agents per domain plus those two is five. Every agent
// count the specs pin is one of these or a step off it, which is why they are
// named once here: a domain gaining or losing an agent moves its specs
// together.
export const DOMAIN_REACH = {
  web: 5,
  api: 5,
} as const

// The one skill in the Next.js stack that reaches a SINGLE sub-agent, and the
// sub-agent it reaches. Setting a skill to project scope puts every sub-agent
// carrying it into the error state (EDITOR-08) — every agent rests at global —
// so a spec that needs a project-scoped configuration it can actually install
// needs one whose errors can be resolved in one click rather than seven.
export const SINGLE_AGENT_SKILL = {
  name: "Vite",
  category: "Build Tools",
  agentId: "web-developer",
} as const

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
// stranded by `implied` goes — even though `implier` names none of it.
// `blocked` is stranded by an unreachable REQUIREMENT, which no category
// forgives; the swap only forgives a conflict with a sibling, which is what
// `impliedSibling` stands for — for implied skills exactly as for selected ones.
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

// Model and thinking effort belong to the sub-agent, not the skill — skills are
// plugins from different repos, so a per-skill model never meant anything.
//
// There is no single default: an agent rests on its own catalogue model
// (`SubAgent.model`, "opus" for web-developer and every other developer), and
// only falls back to sonnet when its metadata names none. Effort rests at
// medium for everyone until agent metadata carries one.
//
// Scope rests at global for everyone, and that one is the shared selection
// default rather than anything the catalogue says: sub-agent front-matter is
// written into the user's own ~/.claude unless they pin it to the project.
export const AGENT_OPTIONS = {
  models: ["opus", "fable", "sonnet", "haiku"],
  efforts: ["low", "medium", "high", "xhigh", "max"],
  restingModel: "opus",
  restingEffort: "medium",
  restingScope: "global",
} as const
