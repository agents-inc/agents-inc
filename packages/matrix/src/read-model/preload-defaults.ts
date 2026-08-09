import { AGENT_DEFINITIONS } from "../generated/agents"
import {
  SKILL_IDS,
  type AgentName,
  type Domain,
  type SkillId,
} from "../vendor/generated/source-types"
import { CATALOG } from "./catalog"
import { agentDomainOf } from "./domains"

// The one place that answers "does this skill arrive preloaded on this agent?".
// Both surfaces resolve against it — the editor's default assignments and the
// CLI's config generator — so the same pick lands the same way on either side.
//
// A table hit is necessary but not sufficient: the owner's domain-affinity
// ruling gates the default, so a role row only preloads on the skill's own
// domain's agents. Shared skills have no home domain to gate to, and meta
// skills' rows pass as authored — those two read the row alone.
//
// Hand-written and browser-safe: no filesystem, no I/O, nothing Node-only, at
// import time or ever. The editor bundles this module.

/** What a compiled agent does with a skill it carries. */
export type LoadState = "lazy" | "preloaded"

/**
 * Every role the roster carries, in the order the table lists them. Naming one
 * in an entry preloads that skill on all of that role's agents — `developer`
 * covers web, api, ai and cli alike. `satisfies` binds each one to a role the
 * roster actually has; `flavorOf` below covers the other direction, a roster
 * role this list does not name.
 */
export const ROLE_FLAVORS = [
  "developer",
  "planning",
  "researcher",
  "reviewer",
  "tester",
  "meta",
] as const satisfies readonly (typeof AGENT_DEFINITIONS)[AgentName]["flavor"][]

// The listable roles, and nothing else. Anchored to the list above rather than
// to the roster, so what an entry may say is authored here and the generated
// agent data is checked against it — not the other way round.
export type RoleFlavor = (typeof ROLE_FLAVORS)[number]

/**
 * A list of what IS preloaded: skill → the roles that carry it eagerly. Sparse
 * on purpose, so absence is lazy — the same thing a missing flag means in an
 * emitted config. There is deliberately no way to write "lazy" here; a second
 * spelling of the default is a second thing to disagree with it.
 */
export type PreloadDefaults = Readonly<
  Partial<Record<SkillId, readonly RoleFlavor[]>>
>

export type ResolveLoadStateInput = {
  skillId: SkillId
  agentId: AgentName
  /** The author's word — a curated stack flag, or the user's saved config. */
  explicit?: LoadState
}

/**
 * The shipped table, authored per skill: the role flavors that carry it
 * eagerly. Grouped by domain, and read as "what this role reaches for in most
 * of its sessions" — a skill that matters occasionally is worth loading when
 * it does, not in every prompt. Setup skills are absent by rule: setting a
 * project up is one session, never most of them.
 *
 * The `reviewer` flavor is narrower still, by the owner's ruling: the
 * framework a diff is written in and the review process itself, and nothing
 * else. What to look for in ONE diff — a database's pitfalls, a security list
 * — reaches the reviewer lazily and arrives per diff through the
 * `meta-reviewing-*` checklists, which is why none of them carries a row.
 *
 * The `planning` flavor is narrowed the same way, one kind wider: the PM needs
 * to know WHAT the project is built with in most of its spec sessions, so the
 * framework and the state kind — where the app keeps its state — stay. The
 * depth beneath them is a different question: which database, which UI
 * library, how to make any of them fast or accessible. That arrives when the
 * spec touches it, so those rows name the builders and the researcher and
 * stop there. Consolidated, the planner is domainless like the reviewer, so
 * these rows land on it whatever domain they belong to — a full-stack spec is
 * one agent's work.
 *
 * The AI domain expresses that same breadth under other names, by the owner's
 * 2026-08-07 ruling: the catalog gives it no framework category at all, and an
 * AI project is built on the provider SDK it calls plus the orchestration
 * framework it calls it through — so those two kinds carry the planner the way
 * a framework does. The capability skills sharing the provider category —
 * speech, vision, transcription — are what a feature reaches for rather than
 * what the project runs on, and stay absent like any other occasional body.
 *
 * One skill per line, which is why the formatter is held off below: at 80
 * columns Prettier gives each five-role entry seven lines, turning a 144-row
 * table into 600 and a one-role change into a seven-line diff.
 */
// prettier-ignore
export const PRELOAD_DEFAULTS: PreloadDefaults = {
  // Web — frameworks, the concerns built on them, and the tests
  "web-framework-angular-standalone": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-framework-react": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-framework-solidjs": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-framework-svelte": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-framework-vue-composition-api": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-astro": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-docusaurus": ["developer", "planning", "researcher", "reviewer"],
  "web-meta-framework-nextjs": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-nuxt": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-qwik": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-remix": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-sveltekit": ["developer", "planning", "researcher", "reviewer", "tester"],
  "web-meta-framework-vitepress": ["developer", "planning", "researcher", "reviewer"],
  "web-state-jotai": ["developer", "planning", "researcher"],
  "web-state-mobx": ["developer", "planning", "researcher"],
  "web-state-ngrx-signalstore": ["developer", "planning", "researcher"],
  "web-state-pinia": ["developer", "planning", "researcher"],
  "web-state-redux-toolkit": ["developer", "planning", "researcher"],
  "web-state-zustand": ["developer", "planning", "researcher"],
  "web-data-fetching-graphql-apollo": ["developer", "planning", "researcher"],
  "web-data-fetching-graphql-urql": ["developer", "planning", "researcher"],
  "web-data-fetching-swr": ["developer", "planning", "researcher"],
  "web-data-fetching-trpc": ["developer", "planning", "researcher"],
  "web-server-state-react-query": ["developer", "planning", "researcher"],
  "web-forms-react-hook-form": ["developer"],
  "web-forms-tanstack-form": ["developer"],
  "web-forms-vee-validate": ["developer"],
  "web-forms-zod-validation": ["developer", "researcher"],
  "web-styling-cva": ["developer", "researcher"],
  "web-styling-design-tokens": ["developer", "researcher"],
  "web-styling-scss-modules": ["developer", "researcher"],
  "web-styling-tailwind": ["developer", "researcher"],
  "web-ui-ant-design": ["developer", "researcher"],
  "web-ui-base-ui": ["developer", "researcher"],
  "web-ui-chakra-ui": ["developer", "researcher"],
  "web-ui-headless-ui": ["developer", "researcher"],
  "web-ui-mantine": ["developer", "researcher"],
  "web-ui-mui": ["developer", "researcher"],
  "web-ui-radix-ui": ["developer", "researcher"],
  "web-ui-shadcn-ui": ["developer", "researcher"],
  "web-ui-vuetify": ["developer", "researcher"],
  "web-performance-web-performance": ["developer", "researcher"],
  "web-accessibility-web-accessibility": ["developer", "researcher"],
  "web-routing-react-router": ["developer"],
  "web-routing-tanstack-router": ["developer"],
  "web-error-handling-result-types": ["developer"],
  "web-i18n-next-intl": ["developer"],
  "web-i18n-react-intl": ["developer"],
  "web-i18n-vue-i18n": ["developer"],
  "web-pwa-offline-first": ["developer", "researcher"],
  "web-mocks-msw": ["tester"],
  "web-testing-cypress-e2e": ["tester"],
  "web-testing-playwright-e2e": ["tester"],
  "web-testing-react-testing-library": ["tester"],
  "web-testing-visual-regression": ["tester"],
  "web-testing-vitest": ["tester"],
  "web-testing-vue-test-utils": ["tester"],
  "web-utilities-native-js": ["developer"],
  "web-utilities-vueuse": ["developer"],

  // API — frameworks, data, auth, and the safety around them
  "api-framework-express": ["developer", "planning", "researcher", "reviewer", "tester"],
  "api-framework-fastify": ["developer", "planning", "researcher", "reviewer", "tester"],
  "api-framework-hono": ["developer", "planning", "researcher", "reviewer", "tester"],
  "api-framework-nestjs": ["developer", "planning", "researcher", "reviewer", "tester"],
  "api-framework-elysia": ["developer", "planning", "researcher", "reviewer", "tester"],
  "api-auth-better-auth-drizzle-hono": ["developer", "researcher"],
  "api-auth-clerk": ["developer"],
  "api-auth-nextauth": ["developer"],
  "api-baas-appwrite": ["developer", "researcher"],
  "api-baas-firebase": ["developer", "researcher"],
  "api-baas-neon": ["developer", "researcher"],
  "api-baas-planetscale": ["developer", "researcher"],
  "api-baas-supabase": ["developer", "researcher"],
  "api-baas-turso": ["developer", "researcher"],
  "api-database-cockroachdb": ["developer", "researcher"],
  "api-database-drizzle": ["developer", "researcher"],
  "api-database-edgedb": ["developer", "researcher"],
  "api-database-knex": ["developer", "researcher"],
  "api-database-mongodb": ["developer", "researcher"],
  "api-database-mongoose": ["developer", "researcher"],
  "api-database-mysql": ["developer", "researcher"],
  "api-database-postgresql": ["developer", "researcher"],
  "api-database-prisma": ["developer", "researcher"],
  "api-database-redis": ["developer", "researcher"],
  "api-database-sequelize": ["developer", "researcher"],
  "api-database-surrealdb": ["developer", "researcher"],
  "api-database-typeorm": ["developer", "researcher"],
  "api-database-upstash": ["developer", "researcher"],
  "api-database-vercel-kv": ["developer", "researcher"],
  "api-database-vercel-postgres": ["developer", "researcher"],
  "api-graphql-apollo-server": ["developer", "researcher", "tester"],
  "api-graphql-mercurius": ["developer", "researcher", "tester"],
  "api-graphql-yoga": ["developer", "researcher", "tester"],
  "api-performance-api-performance": ["developer", "researcher"],
  "api-specs-openapi": ["developer"],
  "api-observability-axiom-pino-sentry": ["developer"],

  // Mobile
  "mobile-framework-react-native": ["developer", "planning", "researcher", "reviewer", "tester"],
  "mobile-framework-expo": ["developer", "planning", "researcher", "reviewer", "tester"],
  "mobile-navigation-expo-router": ["developer"],
  "mobile-navigation-react-navigation": ["developer"],
  "mobile-styling-nativewind": ["developer", "researcher"],
  "mobile-styling-unistyles": ["developer", "researcher"],
  "mobile-ui-components-react-native-paper": ["developer", "researcher"],
  "mobile-ui-components-tamagui": ["developer", "researcher"],
  "mobile-storage-sqlite-powersync": ["developer", "researcher"],
  "mobile-storage-watermelondb": ["developer", "researcher"],
  "mobile-performance-react-native": ["developer", "researcher"],
  "mobile-testing-detox": ["tester"],
  "mobile-testing-maestro": ["tester"],

  // Desktop
  "desktop-framework-electron": ["developer", "planning", "researcher", "reviewer", "tester"],
  "desktop-framework-tauri": ["developer", "planning", "researcher", "reviewer", "tester"],
  "desktop-backend-tauri": ["developer", "researcher"],
  "desktop-ipc-electron": ["developer", "researcher"],
  "desktop-security-tauri": ["developer", "researcher"],
  "desktop-plugins-tauri": ["developer"],
  "desktop-testing-electron": ["tester"],
  "desktop-storage-electron": ["developer", "researcher"],

  // AI — the provider and the orchestration around it are what the project is
  // built on, so they carry the planner too; evals and tracing test
  "ai-infrastructure-huggingface-inference": ["developer", "researcher"],
  "ai-infrastructure-ollama": ["developer", "researcher"],
  "ai-infrastructure-replicate": ["developer", "researcher"],
  "ai-infrastructure-together-ai": ["developer", "researcher"],
  "ai-observability-langfuse": ["tester"],
  "ai-observability-promptfoo": ["tester"],
  "ai-orchestration-langchain": ["developer", "planning", "researcher"],
  "ai-orchestration-llamaindex": ["developer", "planning", "researcher"],
  "ai-orchestration-vercel-ai-sdk": ["developer", "planning", "researcher"],
  "ai-patterns-tool-use-patterns": ["developer", "researcher"],
  "ai-provider-anthropic-sdk": ["developer", "planning", "researcher"],
  "ai-provider-cohere-sdk": ["developer", "planning", "researcher"],
  "ai-provider-google-gemini-sdk": ["developer", "planning", "researcher"],
  "ai-provider-mistral-sdk": ["developer", "planning", "researcher"],
  "ai-provider-openai-sdk": ["developer", "planning", "researcher"],

  // CLI — the framework and its prompts are the whole surface
  "cli-framework-cli-commander": ["developer", "planning", "researcher", "reviewer", "tester"],
  "cli-framework-oclif-ink": ["developer", "planning", "researcher", "reviewer", "tester"],
  "cli-prompts-clack": ["developer", "researcher", "tester"],

  // Infra — deployment is occasional, so almost nothing preloads
  "infra-platform-cloudflare-workers": ["developer"],

  // Meta — the review PROCESS is every review session's material; the domain
  // checklists are one diff's, so they carry no row and arrive per diff
  "meta-design-composable-components": ["developer"],
  "meta-design-expressive-typescript": ["developer"],
  "meta-methodology-research-methodology": ["researcher"],
  "meta-reviewing-reviewing": ["reviewer"],

  // Shared — carried across every implementation domain
  "shared-security-auth-security": ["developer", "researcher"],
}

const KNOWN_SKILL_IDS = new Set<string>(SKILL_IDS)
const KNOWN_AGENT_IDS = new Set<string>(Object.keys(AGENT_DEFINITIONS))
const LISTABLE_FLAVORS = new Set<string>(ROLE_FLAVORS)

const assertKnownSkill = (skillId: SkillId) => {
  if (!KNOWN_SKILL_IDS.has(skillId))
    throw new Error(`Skill not found: ${skillId}`)
}

const assertKnownAgent = (agentId: AgentName) => {
  if (!KNOWN_AGENT_IDS.has(agentId))
    throw new Error(`Agent not found: ${agentId}`)
}

const isRoleFlavor = (flavor: string): flavor is RoleFlavor =>
  LISTABLE_FLAVORS.has(flavor)

// A role the roster carries and `ROLE_FLAVORS` does not name is a role no
// entry can be written for. Resolving it to lazy would read like a table that
// left it out on purpose, so it is an error like any other unknown id.
//
// Exported because the read model's `SubAgent` carries a `RoleFlavor` too, and
// two spellings of "is this role sayable?" is one more than the answer needs.
export const flavorOf = (agentId: AgentName): RoleFlavor => {
  const flavor = AGENT_DEFINITIONS[agentId].flavor
  // `String` because the guard narrows this branch to `never`: today's generated
  // roster names no flavor `ROLE_FLAVORS` lacks, so the two unions coincide and
  // the failure is unreachable *as typed*. Regenerating the roster with a new
  // flavor is what makes it reachable, which is the case worth naming — so the
  // message keeps the value rather than the branch being deleted for saying
  // something the current data makes true.
  if (!isRoleFlavor(flavor))
    throw new Error(
      `Role flavor not found: ${String(flavor)} (agent: ${agentId})`
    )

  return flavor
}

// Sparse both ways: a skill with no entry names no role, and an entry names
// only the roles that carry it eagerly.
const listsFlavor = (
  listedFlavors: readonly RoleFlavor[] | undefined,
  flavor: RoleFlavor
) => listedFlavors !== undefined && listedFlavors.includes(flavor)

// The union knows the id, so a catalog with no domain for it is generated data
// out of step with itself — an error like an unlistable flavor, not a lazy.
const domainOfSkill = (skillId: SkillId): Domain => {
  const skill = CATALOG.skillsById[skillId]
  if (!skill) throw new Error(`Skill domain not found: ${skillId}`)

  return skill.domainId
}

// A role agent with no domain prefix — the consolidated `reviewer` and `pm`.
// Their ids trapdoor into the meta GROUP for display, but their roles serve
// every implementation domain, which is exactly why they carry no prefix.
const isDomainlessRoleAgent = (agentId: AgentName): boolean =>
  agentDomainOf(agentId) === "meta" &&
  AGENT_DEFINITIONS[agentId].flavor !== "meta"

// The domain-affinity gate on the default tier: a role row speaks for the
// skill's own domain's agents. `shared` belongs to every implementation
// domain, and a meta row names its flavors deliberately — both pass; a
// cross-domain pair fails even on a role match, because an api developer is
// not a web developer. A domainless role agent has no domain to fail the
// match on, so its preloads are exactly the rows as authored.
const hasDomainAffinity = (skillDomain: Domain, agentId: AgentName): boolean =>
  skillDomain === "shared" ||
  skillDomain === "meta" ||
  skillDomain === agentDomainOf(agentId) ||
  isDomainlessRoleAgent(agentId)

/**
 * Binds a resolver to a table. An explicit flag wins, then the gated table,
 * then lazy — but an id that does not exist is an error either way, since
 * taking the flag first is exactly how a typo in a saved config would go
 * unread.
 */
export const createLoadStateResolver =
  (defaults: PreloadDefaults) =>
  ({ skillId, agentId, explicit }: ResolveLoadStateInput): LoadState => {
    assertKnownSkill(skillId)
    assertKnownAgent(agentId)

    if (explicit !== undefined) return explicit

    return listsFlavor(defaults[skillId], flavorOf(agentId)) &&
      hasDomainAffinity(domainOfSkill(skillId), agentId)
      ? "preloaded"
      : "lazy"
  }

/** The resolver both surfaces read: `PRELOAD_DEFAULTS`, bound. */
export const resolveLoadState = createLoadStateResolver(PRELOAD_DEFAULTS)
