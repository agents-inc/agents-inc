import { E2E_AGENT_TITLES, E2E_SKILL_TITLES, e2eSkillId } from "../helpers/create-e2e-source.js";
import type { AgentName, ModelName, SkillSlug } from "../../src/cli/types/index.js";

// config.ts records the stack's description; it has no `stackId` field of its own.
export { E2E_STACK_ID, E2E_STACK_DESCRIPTION } from "../helpers/create-e2e-source.js";

export { E2E_STACK_AGENTS } from "../helpers/create-e2e-source.js";

export { E2E_STACK_SKILL_IDS } from "../helpers/create-e2e-source.js";

// The first built-in stack: present only when the default marketplace is the source.
export const BUILT_IN_STACK_DISPLAY = "Next.js Full-Stack";

export { E2E_SKILL_IDS } from "../helpers/create-e2e-source.js";

export { E2E_MARKETPLACE_NAME } from "../pages/constants.js";
export { e2eSkillId } from "../helpers/create-e2e-source.js";

// `id` is `string`, not `SkillId`: fixture ids live in the fixture marketplace's namespace.
export const E2E_SKILL = {
  react: {
    id: e2eSkillId("web-framework-react"),
    slug: "react",
    display: E2E_SKILL_TITLES.react,
  },
  vitest: {
    id: e2eSkillId("web-testing-vitest"),
    slug: "vitest",
    display: E2E_SKILL_TITLES.vitest,
  },
  zustand: {
    id: e2eSkillId("web-state-zustand"),
    slug: "zustand",
    display: E2E_SKILL_TITLES.zustand,
  },
  hono: {
    id: e2eSkillId("api-framework-hono"),
    slug: "hono",
    display: E2E_SKILL_TITLES.hono,
  },
  pinia: {
    id: e2eSkillId("web-state-pinia"),
    slug: "pinia",
    display: E2E_SKILL_TITLES.pinia,
  },
  "research-methodology": {
    id: e2eSkillId("meta-methodology-research-methodology"),
    slug: "research-methodology",
    display: E2E_SKILL_TITLES["research-methodology"],
  },
  reviewing: {
    id: e2eSkillId("meta-reviewing-reviewing"),
    slug: "reviewing",
    display: E2E_SKILL_TITLES.reviewing,
  },
  "cli-reviewing": {
    id: e2eSkillId("meta-reviewing-cli-reviewing"),
    slug: "cli-reviewing",
    display: E2E_SKILL_TITLES["cli-reviewing"],
  },
  "vue-composition-api": {
    id: e2eSkillId("web-framework-vue-composition-api"),
    slug: "vue-composition-api",
    display: E2E_SKILL_TITLES["vue-composition-api"],
  },
  /** Assigned to no agent, so an edit can add it. */
  "visual-regression": {
    id: e2eSkillId("web-testing-visual-regression"),
    slug: "visual-regression",
    display: E2E_SKILL_TITLES["visual-regression"],
  },
} as const satisfies Partial<Record<SkillSlug, { id: string; slug: SkillSlug; display: string }>>;

// A user-authored skill: eject-only, real taxonomy, ids un-narrowed because no marketplace owns it.
export const E2E_CUSTOM_SKILL = {
  id: "external-web-tooling-house",
  slug: "house-tooling",
  display: "House Tooling",
  category: "web-tooling",
  domain: "web",
  origin: "eject",
};

// No accessor, so `satisfies` can sit on the object (contrast `E2E_AGENTS`).
export const E2E_AGENT = {
  "web-developer": {
    name: "web-developer",
    display: E2E_AGENT_TITLES["web-developer"],
  },
  "api-developer": {
    name: "api-developer",
    display: E2E_AGENT_TITLES["api-developer"],
  },
} as const satisfies Partial<Record<AgentName, { name: AgentName; display: string }>>;

// Agents compiled from the CLI's bundled `src/agents/`; `defaultModel` is their metadata.yaml model.
export const E2E_BUILTIN_AGENT = {
  "web-tester": { name: "web-tester", defaultModel: "opus" },
  reviewer: { name: "reviewer", defaultModel: "opus" },
  "cli-developer": { name: "cli-developer", defaultModel: "opus" },
  "api-tester": { name: "api-tester", defaultModel: "opus" },
} as const satisfies Partial<Record<AgentName, { name: AgentName; defaultModel: ModelName }>>;

// `satisfies` on the members, not the object, so the getter keeps its narrow return type.
export const E2E_AGENTS = {
  WEB: ["web-developer"] as const satisfies readonly AgentName[],
  API: ["api-developer"] as const satisfies readonly AgentName[],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const;
