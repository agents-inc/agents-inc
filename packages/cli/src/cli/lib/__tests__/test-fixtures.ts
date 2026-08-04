import type { ResolvedSkill } from "../../types";
import { createMockSkill } from "./factories/skill-factories.js";
import { createMockCategory } from "./factories/category-factories.js";

// ---------------------------------------------------------------------------
// Canonical SKILLS registry — single source of truth for all test ResolvedSkills.
// Use SKILLS.react, SKILLS.hono etc. directly in new test code.
// ---------------------------------------------------------------------------

export const SKILLS = {
  // Web domain
  react: createMockSkill("web-framework-react"),
  vue: createMockSkill("web-framework-vue-composition-api"),
  zustand: createMockSkill("web-state-zustand", {
    compatibleWith: ["web-framework-react"],
  }),
  pinia: createMockSkill("web-state-pinia", {
    compatibleWith: ["web-framework-vue-composition-api"],
  }),
  scss: createMockSkill("web-styling-scss-modules"),
  tailwind: createMockSkill("web-styling-tailwind"),
  vitest: createMockSkill("web-testing-vitest"),
  // API domain
  hono: createMockSkill("api-framework-hono"),
  drizzle: createMockSkill("api-database-drizzle"),
  // Methodology
  antiOverEng: createMockSkill("meta-reviewing-reviewing", {
    description: "Surgical implementation, not architectural innovation",
  }),
} satisfies Record<string, ResolvedSkill>;

// ---------------------------------------------------------------------------
// Shared base category fixtures — canonical defaults with no overrides.
// Use spread for per-test customization: `{ ...TEST_CATEGORIES.framework, required: true }`
// ---------------------------------------------------------------------------

export const TEST_CATEGORIES = {
  // Web domain
  framework: createMockCategory("web-framework", "Framework"),
  clientState: createMockCategory("web-client-state", "Client State"),
  styling: createMockCategory("web-styling", "Styling"),
  testing: createMockCategory("web-testing", "Testing"),
  serverState: createMockCategory("web-server-state", "Server State"),
  animation: createMockCategory("web-animation", "Animation"),
  accessibility: createMockCategory("web-accessibility", "Accessibility"),
  // API domain
  api: createMockCategory("api-api", "Backend Framework"),
  database: createMockCategory("api-database", "Database"),
  observability: createMockCategory("api-observability", "Observability"),
  // Shared domain
  methodology: createMockCategory("meta-reviewing", "Meta", { domain: "meta" }),
  tooling: createMockCategory("shared-tooling", "Tooling"),
  security: createMockCategory("shared-security", "Security"),
  // CLI domain
  cliFramework: createMockCategory("cli-framework", "CLI Framework"),
  // Mobile domain
  mobileFramework: createMockCategory("mobile-framework", "Mobile Framework"),
};
