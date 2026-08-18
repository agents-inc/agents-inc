// Shared skill entries and TestSkill arrays for test files.

import type {
  Category,
  CategoryPath,
  ResolvedSkill,
  Skill,
  SkillId,
  SkillSlug,
  SkillSource,
} from "../../../types";
import type { TestSkill } from "../fixtures/create-test-source";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE, LOCAL_PSEUDO_CATEGORY } from "../../../consts";
import {
  createMockSkill,
  createMockSkillEntry,
  createTestSkill,
} from "../factories/skill-factories.js";
import { SKILLS } from "../test-fixtures";
import { renderSkillMd } from "../content-generators";

// Skill entries from compiler.test.ts

export const REACT_SKILL_PRELOADED = createMockSkillEntry("web-framework-react", true);

export const REACT_SKILL = createMockSkillEntry("web-framework-react");

export const VITEST_SKILL = createMockSkillEntry("web-testing-vitest");

export const VITEST_SINGLE_FILE_SKILL: Skill = {
  ...VITEST_SKILL,
  path: "skills/web-testing-vitest.md",
};

const METHODOLOGY_TEST_SKILLS: TestSkill[] = [
  {
    id: "meta-reviewing-reviewing",
    slug: "reviewing",
    displayName: "Anti Over-Engineering",
    description: "Surgical implementation, not architectural innovation",
    category: "meta-reviewing",
    author: "@test",
    domain: "meta",
  },
];

// Individual TestSkill constants — each skill defined exactly once

const reactSkill = createTestSkill(
  "web-framework-react",
  "React framework for building user interfaces",
  {},
);

const zustandSkill = createTestSkill("web-state-zustand", "Bear necessities state management");

const vitestSkill = createTestSkill("web-testing-vitest", "Next generation testing framework");

const honoSkill = createTestSkill("api-framework-hono", "Lightweight web framework for the edge");

const vueSkill = createTestSkill(
  "web-framework-vue-composition-api",
  "Progressive JavaScript framework",
  {},
);

const scssSkill = createTestSkill("web-styling-scss-modules", "CSS Modules with SCSS", {
  displayName: "SCSS Modules",
});

const drizzleSkill = createTestSkill("api-database-drizzle", "TypeScript ORM for SQL databases");

// Composed TestSkill arrays

export const EXTRA_DOMAIN_TEST_SKILLS: TestSkill[] = [vueSkill, scssSkill, drizzleSkill];

export const COMPILE_LOCAL_SKILL: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for testing local skill compilation
  "web-tooling-local-skill" as SkillId,
  "A local project skill",
  { slug: "tooling" as SkillSlug, displayName: "Local Skill" },
);

export const DEFAULT_TEST_SKILLS: TestSkill[] = [reactSkill, zustandSkill, vitestSkill, honoSkill];

// TestSkill constants from consumer-stacks-matrix.integration.test.ts

export const DOCKER_TOOLING_SKILL: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for testing infra tooling
  "infra-tooling-docker" as SkillId,
  "Docker containerization patterns",
  {
    slug: "tooling" as SkillSlug,
    displayName: "Docker",
    domain: "shared",
  },
);

export const CI_CD_SKILLS: TestSkill[] = [
  // Boundary cast: fictional skill ID for testing CI/CD skills
  createTestSkill("infra-ci-cd-github-actions", "github-actions CI/CD pipeline", {
    slug: "github-actions",
    displayName: "GitHub Actions",
    category: "infra-ci-cd",
    domain: "infra",
  }),
  // Boundary cast: fictional skill ID for testing CI/CD skills
  createTestSkill("infra-ci-cd-gitlab-ci" as SkillId, "gitlab-ci CI/CD pipeline", {
    // Boundary cast: fictional slug for test isolation
    slug: "gitlab-ci" as SkillSlug,
    displayName: "GitLab CI",
    category: "infra-ci-cd",
    domain: "infra",
  }),
];

export const DISCOURAGES_RELATIONSHIP_SKILLS: TestSkill[] = [reactSkill, scssSkill, vueSkill];

export const DATADOG_OBSERVABILITY_SKILL: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for testing observability skills
  "api-observability-datadog" as SkillId,
  "Datadog APM integration",
  {},
);

export const REQUIRES_RELATIONSHIP_SKILLS: TestSkill[] = [reactSkill, vitestSkill];

// Install-mode TestSkill arrays (with rendered SKILL.md content)

/** Creates a TestSkill with rendered SKILL.md content for install-mode tests */
function contentSkill(id: SkillId, description: string, body: string, author?: string): TestSkill {
  return createTestSkill(id, description, {
    ...(author ? { author } : {}),
    content: renderSkillMd(id, description, body),
  });
}

export const INSTALL_MODE_SKILLS: TestSkill[] = [
  contentSkill(
    "web-framework-react",
    "React framework for building user interfaces",
    "# React (Marketplace Version)\n\nReact is a JavaScript library for building user interfaces.\nUse component-based architecture with JSX.",
  ),
  contentSkill(
    "web-state-zustand",
    "Bear necessities state management",
    "# Zustand (Marketplace Version)\n\nZustand is a minimal state management library for React.",
  ),
  contentSkill(
    "api-framework-hono",
    "Lightweight web framework for the edge",
    "# Hono (Marketplace Version)\n\nHono is a fast web framework for the edge.",
  ),
  contentSkill(
    "web-testing-vitest",
    "Next generation testing framework",
    "# Vitest (Marketplace Version)\n\nVitest is a fast unit test framework powered by Vite.",
  ),
];

export const LOCAL_SKILL_VARIANTS: TestSkill[] = [
  contentSkill(
    "web-framework-react",
    "React framework (local customized version)",
    "# React (Local Version)\n\nThis is my customized React skill with project-specific patterns.",
    "@local-user",
  ),
  contentSkill(
    "web-state-zustand",
    "Zustand state management (local customized version)",
    "# Zustand (Local Version)\n\nMy customized Zustand patterns with project-specific stores.",
    "@local-user",
  ),
];

export const RESOLUTION_PIPELINE_SKILLS: TestSkill[] = [
  createTestSkill("web-framework-react", "React framework (public source)"),
  createTestSkill("api-framework-hono", "Hono framework (acme source)", {
    author: "@acme",
  }),
  // Boundary cast: fictional skill ID for testing multi-source resolution
  createTestSkill("web-animation-framer" as SkillId, "Framer Motion (internal source)", {
    slug: "framer-motion",
    displayName: "Framer Motion",
    author: "@internal",
  }),
  createTestSkill("api-database-drizzle", "Drizzle ORM (acme source)", {
    author: "@acme",
  }),
  createTestSkill("web-testing-vitest", "Vitest testing (public source)"),
];

// Composed skill ID collections

export const ALL_TEST_SKILLS = [
  ...DEFAULT_TEST_SKILLS,
  ...EXTRA_DOMAIN_TEST_SKILLS,
  ...METHODOLOGY_TEST_SKILLS,
];

export const INIT_SKILL_IDS: SkillId[] = [
  "web-framework-react",
  "api-framework-hono",
  "web-testing-vitest",
];

export const INIT_TEST_SKILLS = DEFAULT_TEST_SKILLS.filter((s) =>
  INIT_SKILL_IDS.includes(s.id as SkillId),
);

// ---------------------------------------------------------------------------
// Health-check skill variants (matrix-health-check.test.ts)
// ---------------------------------------------------------------------------

export const HEALTH_ORPHAN_SKILL = {
  ...SKILLS.react,
  category: "nonexistent-category" as Category,
};

export const HEALTH_UNRESOLVED_CONFLICTS_WITH_SKILL = {
  ...SKILLS.react,
  // Boundary cast: fake SkillId for unresolved-ref testing
  conflictsWith: [{ skillId: "web-framework-ghost" as SkillId, reason: "Conflicts" }],
};

export const HEALTH_UNRESOLVED_REQUIRES_SKILL = createMockSkill("web-testing-cypress-e2e", {
  requires: [
    {
      skillIds: ["web-framework-missing" as SkillId],
      needsAny: false,
      reason: "Needs a framework",
    },
  ],
});

export const HEALTH_MULTIPLE_UNRESOLVED_REFS_SKILL = {
  ...SKILLS.zustand,
  // Boundary casts: fake SkillIds for unresolved-ref testing
  requires: [
    {
      skillIds: ["web-framework-missing" as SkillId],
      needsAny: false,
      reason: "Needs a framework",
    },
  ],
  conflictsWith: [{ skillId: "web-state-ghost" as SkillId, reason: "Conflicts" }],
};

export const HEALTH_ALL_REFS_RESOLVED_SKILL: ResolvedSkill = {
  ...SKILLS.zustand,
  conflictsWith: [{ skillId: "web-framework-react", reason: "Test" }],
  requires: [
    {
      skillIds: ["web-framework-react"],
      needsAny: false,
      reason: "Needs React",
    },
  ],
};

export const HEALTH_PARTIAL_UNRESOLVED_REQUIRES_SKILL = createMockSkill("web-testing-cypress-e2e", {
  requires: [
    {
      skillIds: ["web-framework-react", "web-framework-missing" as SkillId],
      needsAny: true,
      reason: "Needs one framework",
    },
  ],
});

// Audit cross-check fixtures. tailwind's manifest verdict is `universal`, so any matrix
// that fences it contradicts the audit — the shape B2 pinned for zod-validation.

export const HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_SKILL = createMockSkill("web-styling-tailwind", {
  requires: [
    {
      skillIds: ["web-framework-react"],
      needsAny: false,
      reason: "Fabricated binding on a universal-verdict skill",
    },
  ],
});

/** The applied state: sse left the exclusive `web-realtime` radio for the open `web-streaming`. */
export const HEALTH_AUDIT_APPLIED_DISPOSITION_SKILL = createMockSkill("web-realtime-sse", {
  category: "web-streaming",
  slug: "sse",
});

// ---------------------------------------------------------------------------
// Category grid test skills (category-grid.test.tsx)
// ---------------------------------------------------------------------------

export const CATEGORY_GRID_SKILLS: {
  id: SkillId;
  slug: SkillSlug;
  displayName: string;
  category: CategoryPath;
}[] = [
  { id: "web-framework-react", slug: "react", displayName: "React", category: "web-framework" },
  {
    id: "web-framework-vue-composition-api",
    slug: "vue-composition-api",
    displayName: "Vue",
    category: "web-framework",
  },
  {
    id: "web-framework-angular-standalone",
    slug: "angular-standalone",
    displayName: "Angular",
    category: "web-framework",
  },
  {
    id: "web-framework-solidjs",
    slug: "solidjs",
    displayName: "SolidJS",
    category: "web-framework",
  },
  {
    id: "web-meta-framework-nuxt",
    slug: "nuxt",
    displayName: "Nuxt",
    category: "web-meta-framework",
  },
  {
    id: "web-meta-framework-remix",
    slug: "remix",
    displayName: "Remix",
    category: "web-meta-framework",
  },
  {
    id: "web-meta-framework-nextjs",
    slug: "nextjs",
    displayName: "Next.js",
    category: "web-meta-framework",
  },
  {
    id: "web-styling-scss-modules",
    slug: "scss-modules",
    displayName: "SCSS Modules",
    category: "web-styling",
  },
  {
    id: "web-styling-tailwind",
    slug: "tailwind",
    displayName: "Tailwind",
    category: "web-styling",
  },
  { id: "web-styling-cva", slug: "cva", displayName: "CVA", category: "web-styling" },
  {
    id: "web-state-zustand",
    slug: "zustand",
    displayName: "Zustand",
    category: "web-client-state",
  },
  { id: "web-state-jotai", slug: "jotai", displayName: "Jotai", category: "web-client-state" },
  {
    id: "web-state-redux-toolkit",
    slug: "redux-toolkit",
    displayName: "Redux",
    category: "web-client-state",
  },
  { id: "web-state-mobx", slug: "mobx", displayName: "MobX", category: "web-client-state" },
  {
    id: "web-server-state-react-query",
    slug: "react-query",
    displayName: "React Query",
    category: "web-server-state",
  },
  { id: "web-data-fetching-swr", slug: "swr", displayName: "SWR", category: "web-server-state" },
  {
    id: "web-data-fetching-graphql-apollo",
    slug: "graphql-apollo",
    displayName: "Apollo",
    category: "web-graphql-client",
  },
  {
    id: "api-analytics-posthog-analytics",
    slug: "posthog-analytics",
    displayName: "PostHog",
    category: "api-analytics",
  },
  {
    id: "web-forms-react-hook-form",
    slug: "react-hook-form",
    displayName: "React Hook Form",
    category: "web-form-library",
  },
  {
    id: "web-forms-vee-validate",
    slug: "vee-validate",
    displayName: "Vee Validate",
    category: "web-form-library",
  },
  {
    id: "web-forms-zod-validation",
    slug: "zod-validation",
    displayName: "Zod Validation",
    category: "web-forms",
  },
  { id: "web-testing-vitest", slug: "vitest", displayName: "Vitest", category: "web-testing" },
  {
    id: "web-testing-playwright-e2e",
    slug: "playwright-e2e",
    displayName: "Playwright",
    category: "web-e2e",
  },
  {
    id: "web-testing-cypress-e2e",
    slug: "cypress-e2e",
    displayName: "Cypress",
    category: "web-e2e",
  },
  { id: "web-mocks-msw", slug: "msw", displayName: "MSW", category: "web-mocking" },
  {
    id: "web-testing-react-testing-library",
    slug: "react-testing-library",
    displayName: "React Testing Library",
    category: "web-testing",
  },
  {
    id: "web-testing-vue-test-utils",
    slug: "vue-test-utils",
    displayName: "Vue Test Utils",
    category: "web-testing",
  },
  { id: "web-i18n-next-intl", slug: "next-intl", displayName: "Next Intl", category: "web-i18n" },
  {
    id: "web-i18n-react-intl",
    slug: "react-intl",
    displayName: "React Intl",
    category: "web-i18n",
  },
  { id: "web-i18n-vue-i18n", slug: "vue-i18n", displayName: "Vue I18n", category: "web-i18n" },
];

// ---------------------------------------------------------------------------
// Multi-source integration test skill entries (skill-resolution.integration.test.ts)
// ---------------------------------------------------------------------------

type MultiSourceSkillEntry = { id: string; category: string; description: string };

export const MULTI_SOURCE_PUBLIC_SKILLS: MultiSourceSkillEntry[] = [
  { id: "web-framework-react", category: "web-framework", description: "React framework" },
  {
    id: "web-framework-vue-composition-api",
    category: "web-framework",
    description: "Vue.js framework",
  },
  {
    id: "web-state-zustand",
    category: "web-client-state",
    description: "Zustand state management",
  },
  { id: "web-styling-scss-modules", category: "web-styling", description: "SCSS Modules styling" },
  { id: "web-testing-vitest", category: "web-testing", description: "Vitest testing framework" },
];

export const MULTI_SOURCE_ACME_SKILLS: MultiSourceSkillEntry[] = [
  { id: "web-framework-react", category: "web-framework", description: "React (acme custom fork)" },
  { id: "api-framework-hono", category: "api-api", description: "Hono web framework" },
  { id: "api-database-drizzle", category: "api-orm", description: "Drizzle ORM" },
  { id: "api-security-auth-patterns", category: "shared-security", description: "Auth patterns" },
  { id: "web-testing-vitest", category: "web-testing", description: "Vitest (acme custom)" },
];

export const MULTI_SOURCE_INTERNAL_SKILLS: MultiSourceSkillEntry[] = [
  { id: "web-framework-react", category: "web-framework", description: "React (internal build)" },
  { id: "web-animation-framer", category: "web-animation", description: "Framer Motion" },
  {
    id: "meta-methodology-investigation",
    category: "meta-methodology",
    description: "Investigation first",
  },
  { id: "web-accessibility-a11y", category: "web-accessibility", description: "Web accessibility" },
  {
    id: "api-monitoring-sentry",
    category: "api-observability",
    description: "Sentry error tracking",
  },
];

export type { MultiSourceSkillEntry };

// ---------------------------------------------------------------------------
// Local/compile skill constants (from create-test-source.ts)
// ---------------------------------------------------------------------------

/** Valid local skill with SKILL.md and metadata.yaml */
export const VALID_LOCAL_SKILL: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-valid" as SkillId,
  "A valid skill",
  { slug: "tooling" as SkillSlug, displayName: "Valid" },
);

/** Skill created WITHOUT metadata.yaml (for testing missing-metadata warnings) */
export const SKILL_WITHOUT_METADATA: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-incomplete" as SkillId,
  "Missing metadata",
  { slug: "storybook", displayName: "Incomplete", skipMetadata: true },
);

/** Another skill without metadata.yaml (for path warning tests) */
export const SKILL_WITHOUT_METADATA_CUSTOM: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-custom" as SkillId,
  "No metadata",
  { slug: "security" as SkillSlug, displayName: "Custom", skipMetadata: true },
);

/** A basic local-only skill (no forkedFrom) with SKILL.md and metadata.yaml */
export const LOCAL_SKILL_BASIC: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-my-skill" as SkillId,
  "A test skill",
  {
    slug: "tooling" as SkillSlug,
    displayName: "My Skill",
    content: `---
name: my-skill
description: A test skill
category: test
---

# My Skill

Test content here.
`,
  },
);

/** A forked local skill with forkedFrom metadata for update commands */
export const LOCAL_SKILL_FORKED: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-forked-skill" as SkillId,
  "A forked skill",
  {
    slug: "tooling" as SkillSlug,
    displayName: "Forked Skill",
    content: `---
name: forked-skill
description: A forked skill
category: test
---

# Forked Skill

Local modifications here.
`,
    forkedFrom: {
      skillId: "web-framework-react",
      contentHash: "abc123",
      date: "2025-01-01",
    },
  },
);

/** A minimal local skill for error handling tests (with forkedFrom) */
export const LOCAL_SKILL_FORKED_MINIMAL: TestSkill = createTestSkill(
  // Boundary cast: fictional skill ID for test isolation
  "web-tooling-test-minimal" as SkillId,
  "Test skill",
  {
    slug: "env" as SkillSlug,
    displayName: "Test Minimal",
    content: `---
name: test
---
# Test`,
    forkedFrom: {
      skillId: "web-framework-react",
      contentHash: "abc",
      date: "2025-01-01",
    },
  },
);

// ---------------------------------------------------------------------------
// Build-step-logic test skill variants (build-step-logic.test.ts)
// ---------------------------------------------------------------------------

/** React with conflictsWith pointing at Vue (for exclusive category suppression tests) */
export const REACT_CONFLICTS_VUE = createMockSkill("web-framework-react", {
  conflictsWith: [{ skillId: "web-framework-vue-composition-api", reason: "Choose one framework" }],
});

/** Vue with conflictsWith pointing at React (for exclusive category suppression tests) */
export const VUE_CONFLICTS_REACT = createMockSkill("web-framework-vue-composition-api", {
  conflictsWith: [{ skillId: "web-framework-react", reason: "Choose one framework" }],
});

/** Zustand with conflictsWith pointing at Pinia (for non-exclusive category tests) */
export const ZUSTAND_CONFLICTS_PINIA = createMockSkill("web-state-zustand", {
  conflictsWith: [{ skillId: "web-state-pinia", reason: "Choose one state manager" }],
});

/** Pinia with conflictsWith pointing at Zustand (for non-exclusive category tests) */
export const PINIA_CONFLICTS_ZUSTAND = createMockSkill("web-state-pinia", {
  conflictsWith: [{ skillId: "web-state-zustand", reason: "Choose one state manager" }],
});

/** React that requires Zustand (for requiredBy badge tests) */
export const REACT_REQUIRES_ZUSTAND = createMockSkill("web-framework-react", {
  requires: [{ skillIds: ["web-state-zustand"], needsAny: false, reason: "Needs Zustand" }],
});

/** Vue that discourages SCSS Modules (for state preservation in exclusive categories) */
export const VUE_DISCOURAGES_SCSS = createMockSkill("web-framework-vue-composition-api", {
  discourages: [{ skillId: "web-styling-scss-modules", reason: "Prefer other styling" }],
});

/** React with local: true — for local skill propagation tests */
export const REACT_LOCAL = createMockSkill("web-framework-react", { local: true });

// Boundary cast: a local skill's id is outside the generated union by definition —
// it names a directory the user wrote, which no built-in relationship rule can reach.
export const LOCAL_HOUSE_STYLE_ID = "local-house-style" as SkillId;

/** A local skill the shipped catalogue has never heard of — merged in as source-loader does. */
export const LOCAL_HOUSE_STYLE_SKILL = createMockSkill(LOCAL_HOUSE_STYLE_ID, {
  category: LOCAL_PSEUDO_CATEGORY,
  // Boundary cast: a local skill's slug is outside the generated union, as its id is
  slug: "house-style" as SkillSlug,
  local: true,
  custom: true,
});

// Boundary cast: a custom skill's id names a directory the user wrote, so it is outside
// the generated union by construction. The `external-` prefix is the namespace a skill
// answering to no marketplace takes.
export const CUSTOM_HOUSE_TOOLING_ID = "external-web-tooling-house" as SkillId;

/**
 * A skill the user wrote themselves, carrying a REAL domain and category rather than the
 * `local` pseudo-category — the shape every custom skill is meant to take. As the loader
 * sees it before the install-mode tagging pass runs: no `availableSources` yet.
 */
export const CUSTOM_HOUSE_TOOLING_SKILL = createMockSkill(CUSTOM_HOUSE_TOOLING_ID, {
  category: "web-tooling",
  // Boundary cast: a custom skill's slug is outside the generated union, as its id is
  slug: "house-tooling" as SkillSlug,
  displayName: "House Tooling",
  local: true,
  custom: true,
});

/** The local copy the tagging pass gives a skill discovered under `.claude/skills/`. */
export const LOCAL_SKILL_SOURCE: SkillSource = {
  name: EJECT_SOURCE,
  type: "local",
  installed: true,
  installMode: "eject",
};

/** The marketplace entry the tagging pass gives a skill the loaded source carries. */
export const PUBLIC_MARKETPLACE_SOURCE: SkillSource = {
  name: DEFAULT_PUBLIC_SOURCE_NAME,
  type: "public",
  installed: false,
  primary: true,
};
