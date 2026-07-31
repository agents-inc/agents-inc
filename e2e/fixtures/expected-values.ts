import { E2E_AGENT_TITLES, E2E_SKILL_TITLES } from "../helpers/create-e2e-source.js";
import type { AgentName, SkillId, SkillSlug } from "../../src/cli/types/index.js";

/**
 * Agent display titles as the wizard renders them in the agents step — the
 * strings `toggleAgent` / `navigateCursorToAgent` match against. Re-exported
 * under the name specs use; create-e2e-source.ts owns the values because it
 * writes them into each agent's metadata yaml.
 */
export { E2E_AGENT_TITLES as E2E_AGENT_DISPLAY } from "../helpers/create-e2e-source.js";

/**
 * Stack display name as the wizard renders it — in the stack list, in the
 * confirm step's "Ready to install <stack>" dropdown, and in the summary
 * panel's Stack row. Re-exported under the name specs use;
 * create-e2e-source.ts owns the value because it writes it into the source's
 * `config/stacks.ts`.
 */
export { E2E_STACK_NAME as E2E_STACK_DISPLAY } from "../helpers/create-e2e-source.js";

// E2E source skills (from create-e2e-source.ts)
export const E2E_SKILL_IDS = [
  "api-framework-hono",
  "meta-methodology-research-methodology",
  "meta-reviewing-cli-reviewing",
  "meta-reviewing-reviewing",
  "web-framework-react",
  "web-framework-vue-composition-api",
  "web-state-pinia",
  "web-state-zustand",
  "web-testing-vitest",
] as const satisfies readonly SkillId[];

/**
 * Per-skill identifiers for the E2E source, keyed by slug.
 *
 * Specs address the same skill three ways depending on the step under test: by
 * id (config assertions), by slug (source paths, skill lookups) and by display
 * title (what the wizard renders, so what `selectSkill` matches). This map is
 * the slug↔id join; `display` is read from create-e2e-source.ts rather than
 * re-typed, so a title change there cannot silently desync from assertions.
 */
export const E2E_SKILL = {
  react: {
    id: "web-framework-react",
    slug: "react",
    display: E2E_SKILL_TITLES["web-framework-react"],
  },
  vitest: {
    id: "web-testing-vitest",
    slug: "vitest",
    display: E2E_SKILL_TITLES["web-testing-vitest"],
  },
  zustand: {
    id: "web-state-zustand",
    slug: "zustand",
    display: E2E_SKILL_TITLES["web-state-zustand"],
  },
  hono: {
    id: "api-framework-hono",
    slug: "hono",
    display: E2E_SKILL_TITLES["api-framework-hono"],
  },
  pinia: {
    id: "web-state-pinia",
    slug: "pinia",
    display: E2E_SKILL_TITLES["web-state-pinia"],
  },
  "research-methodology": {
    id: "meta-methodology-research-methodology",
    slug: "research-methodology",
    display: E2E_SKILL_TITLES["meta-methodology-research-methodology"],
  },
  reviewing: {
    id: "meta-reviewing-reviewing",
    slug: "reviewing",
    display: E2E_SKILL_TITLES["meta-reviewing-reviewing"],
  },
  "cli-reviewing": {
    id: "meta-reviewing-cli-reviewing",
    slug: "cli-reviewing",
    display: E2E_SKILL_TITLES["meta-reviewing-cli-reviewing"],
  },
  "vue-composition-api": {
    id: "web-framework-vue-composition-api",
    slug: "vue-composition-api",
    display: E2E_SKILL_TITLES["web-framework-vue-composition-api"],
  },
} as const satisfies Partial<Record<SkillSlug, { id: SkillId; slug: SkillSlug; display: string }>>;

/**
 * Per-agent identifiers for the E2E source, keyed by agent name.
 *
 * Specs address the same agent two ways depending on what they assert: by bare
 * name (compiled `<name>.md` filenames, config.ts `agents` entries) and by
 * display title (what the agents step renders, so what `toggleAgent` /
 * `navigateCursorToAgent` match). `display` is read from create-e2e-source.ts
 * rather than re-typed, so a title change there cannot silently desync from
 * assertions.
 *
 * Unlike `E2E_AGENTS` below this object has no accessor, so the `satisfies`
 * clause can sit on the object without widening anything.
 */
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

// Derive from E2E source agent definitions (create-e2e-source.ts).
// The `satisfies` clauses sit on the member arrays rather than on the whole
// object: constraining the object would contextually type the getter too,
// widening its return from the two literals it actually yields to the full
// AgentName union.
export const E2E_AGENTS = {
  WEB: ["web-developer"] as const satisfies readonly AgentName[],
  API: ["api-developer"] as const satisfies readonly AgentName[],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const;
