import type { SkillId } from "../../types";

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
