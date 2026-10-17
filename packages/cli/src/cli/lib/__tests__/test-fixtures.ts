import type { ResolvedSkill } from "../../types";
import { createMockSkill } from "./factories/skill-factories.js";
import { createMockCategory } from "./factories/category-factories.js";

export const SKILLS = {
  react: createMockSkill("web-framework-react"),
  vue: createMockSkill("web-framework-vue-composition-api"),
  zustand: createMockSkill("web-state-zustand"),
  pinia: createMockSkill("web-state-pinia"),
  scss: createMockSkill("web-styling-scss-modules"),
  tailwind: createMockSkill("web-styling-tailwind"),
  vitest: createMockSkill("web-testing-vitest"),
  hono: createMockSkill("api-framework-hono"),
  drizzle: createMockSkill("api-database-drizzle"),
  authSecurity: createMockSkill("shared-security-auth-security"),
  antiOverEng: createMockSkill("meta-reviewing-reviewing", {
    description: "Surgical implementation, not architectural innovation",
  }),
} satisfies Record<string, ResolvedSkill>;

export const TEST_CATEGORIES = {
  framework: createMockCategory("web-framework", "Framework"),
  clientState: createMockCategory("web-client-state", "Client State"),
  styling: createMockCategory("web-styling", "Styling"),
  testing: createMockCategory("web-testing", "Testing"),
  serverState: createMockCategory("web-server-state", "Server State"),
  animation: createMockCategory("web-animation", "Animation"),
  accessibility: createMockCategory("web-accessibility", "Accessibility"),
  api: createMockCategory("api-api", "Backend Framework"),
  database: createMockCategory("api-orm", "Database"),
  observability: createMockCategory("api-observability", "Observability"),
  methodology: createMockCategory("meta-reviewing", "Meta", { domain: "meta" }),
  tooling: createMockCategory("shared-tooling", "Tooling"),
  security: createMockCategory("shared-security", "Security"),
  cliFramework: createMockCategory("cli-framework", "CLI Framework"),
  mobileFramework: createMockCategory("mobile-framework", "Mobile Framework"),
};
