import { AGENT_DEFINITIONS } from "../generated/agents"
import {
  SKILL_IDS,
  type AgentName,
  type Domain,
  type SkillId,
} from "../vendor/generated/source-types"
import { CATALOG } from "./catalog"
import { agentDomainOf } from "./domains"

// Whether a skill arrives preloaded on an agent; shared by the editor and the
// CLI. Browser-safe: the editor bundles it.

export type LoadState = "lazy" | "preloaded"

/** Naming a role in an entry preloads the skill on all of that role's agents. */
export const ROLE_FLAVORS = [
  "developer",
  "planning",
  "researcher",
  "reviewer",
  "tester",
  "meta",
] as const satisfies readonly (typeof AGENT_DEFINITIONS)[AgentName]["flavor"][]

export type RoleFlavor = (typeof ROLE_FLAVORS)[number]

/** Skill → the roles that preload it; absence means lazy. */
export type PreloadDefaults = Readonly<
  Partial<Record<SkillId, readonly RoleFlavor[]>>
>

export type ResolveLoadStateInput = {
  skillId: SkillId
  agentId: AgentName
  /** A curated stack flag or the user's saved config. */
  explicit?: LoadState
}

/**
 * A row names the roles that reach for the skill in most sessions; occasional
 * skills stay lazy. `reviewer` gets only frameworks and the review process,
 * `planning` only frameworks and state. One skill per line, hence prettier-ignore.
 */
// prettier-ignore
export const PRELOAD_DEFAULTS: PreloadDefaults = {
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

  "desktop-framework-electron": ["developer", "planning", "researcher", "reviewer", "tester"],
  "desktop-framework-tauri": ["developer", "planning", "researcher", "reviewer", "tester"],
  "desktop-backend-tauri": ["developer", "researcher"],
  "desktop-ipc-electron": ["developer", "researcher"],
  "desktop-security-tauri": ["developer", "researcher"],
  "desktop-plugins-tauri": ["developer"],
  "desktop-testing-electron": ["tester"],
  "desktop-storage-electron": ["developer", "researcher"],

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

  "cli-framework-cli-commander": ["developer", "planning", "researcher", "reviewer", "tester"],
  "cli-framework-oclif-ink": ["developer", "planning", "researcher", "reviewer", "tester"],
  "cli-prompts-clack": ["developer", "researcher", "tester"],

  "infra-platform-cloudflare-workers": ["developer"],

  "meta-design-composable-components": ["developer"],
  "meta-design-expressive-typescript": ["developer", "meta"],
  "meta-methodology-research-methodology": ["researcher", "meta"],
  "meta-reviewing-reviewing": ["reviewer"],

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

// A roster flavor `ROLE_FLAVORS` lacks throws rather than reading as lazy.
export const flavorOf = (agentId: AgentName): RoleFlavor => {
  const flavor = AGENT_DEFINITIONS[agentId].flavor
  // `String`: the guard narrows to `never` until a regenerated roster adds a flavor.
  if (!isRoleFlavor(flavor))
    throw new Error(
      `Role flavor not found: ${String(flavor)} (agent: ${agentId})`
    )

  return flavor
}

const listsFlavor = (
  listedFlavors: readonly RoleFlavor[] | undefined,
  flavor: RoleFlavor
) => listedFlavors !== undefined && listedFlavors.includes(flavor)

const domainOfSkill = (skillId: SkillId): Domain => {
  const skill = CATALOG.skillsById[skillId]
  if (!skill) throw new Error(`Skill domain not found: ${skillId}`)

  return skill.domainId
}

// `reviewer` and `pm`: grouped under meta for display, but serve every domain.
const isDomainlessRoleAgent = (agentId: AgentName): boolean =>
  agentDomainOf(agentId) === "meta" &&
  AGENT_DEFINITIONS[agentId].flavor !== "meta"

// A role row preloads only on the skill's own domain's agents; shared and
// meta skills, and domainless role agents, pass.
const hasDomainAffinity = (skillDomain: Domain, agentId: AgentName): boolean =>
  skillDomain === "shared" ||
  skillDomain === "meta" ||
  skillDomain === agentDomainOf(agentId) ||
  isDomainlessRoleAgent(agentId)

/** Explicit flag, then the gated table, then lazy; unknown ids throw even with a flag. */
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

export const resolveLoadState = createLoadStateResolver(PRELOAD_DEFAULTS)
