import type { SkillId } from "../../types";

/** Canonical agent name lists per domain, sorted alphabetically */
export const EXPECTED_AGENTS = {
  WEB: [
    "web-architecture",
    "web-developer",
    "web-pm",
    "web-researcher",
    "web-reviewer",
    "web-tester",
  ],
  API: ["api-developer", "api-researcher", "api-reviewer"],
  CLI: ["cli-developer", "cli-reviewer", "cli-tester"],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
  get ALL() {
    return [...this.API, ...this.CLI, ...this.WEB].sort();
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
