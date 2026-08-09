import type { AgentName, SkillId } from "../../types";

/**
 * Canonical agent name lists per domain, sorted alphabetically. Mirrors
 * `DOMAIN_AGENTS` in `stores/wizard-store.ts` — the roster
 * `preselectAgentsFromDomains` produces for each domain.
 *
 * The `satisfies` clauses sit on the member arrays rather than on the whole
 * object: constraining the object would contextually type the getters too,
 * widening their return to the full AgentName union.
 */
export const EXPECTED_AGENTS = {
  WEB: [
    "pm",
    "reviewer",
    "web-developer",
    "web-researcher",
    "web-tester",
  ] as const satisfies readonly AgentName[],
  API: [
    "api-developer",
    "api-researcher",
    "api-tester",
    "pm",
    "reviewer",
  ] as const satisfies readonly AgentName[],
  CLI: [
    "cli-developer",
    "cli-researcher",
    "cli-tester",
    "pm",
    "reviewer",
  ] as const satisfies readonly AgentName[],
  // The consolidated `pm` and `reviewer` sit in every domain roster, so unions
  // dedupe.
  get WEB_AND_API() {
    return [...new Set([...this.API, ...this.WEB])].sort();
  },
  get ALL() {
    return [...new Set([...this.API, ...this.CLI, ...this.WEB])].sort();
  },
} as const;

/** Canonical skill ID lists per test fixture */
export const EXPECTED_SKILLS = {
  WEB_DEFAULT: ["web-framework-react", "web-state-zustand"],
  API_DEFAULT: ["api-framework-hono"],
  WEB_AND_API: ["api-framework-hono", "web-framework-react", "web-state-zustand"],
  ALL_TEST: [
    "api-framework-hono",
    "web-framework-react",
    "web-state-zustand",
    "web-testing-vitest",
  ],
} as const satisfies Record<string, readonly SkillId[]>;
