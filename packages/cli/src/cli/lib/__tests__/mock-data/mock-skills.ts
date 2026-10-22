import type { Category, ResolvedSkill, SkillId, SkillSlug, SkillSource } from "../../../types";
import type { TestSkill } from "../fixtures/create-test-source";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../../consts";
import { createMockSkill, createTestSkill } from "../factories/skill-factories.js";
import { SKILLS } from "../test-fixtures";
import { renderSkillMd } from "../content-generators";

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

export const EXTRA_DOMAIN_TEST_SKILLS: TestSkill[] = [vueSkill, scssSkill, drizzleSkill];

export const COMPILE_LOCAL_SKILL: TestSkill = createTestSkill(
  // Fictional id and slug, outside the generated unions
  "web-tooling-local-skill" as SkillId,
  "A local project skill",
  { slug: "tooling" as SkillSlug, displayName: "Local Skill" },
);

export const DEFAULT_TEST_SKILLS: TestSkill[] = [reactSkill, zustandSkill, vitestSkill, honoSkill];

export const DOCKER_TOOLING_SKILL: TestSkill = createTestSkill(
  // Fictional id and slug, outside the generated unions
  "infra-tooling-docker" as SkillId,
  "Docker containerization patterns",
  {
    slug: "tooling" as SkillSlug,
    displayName: "Docker",
    domain: "shared",
  },
);

export const CI_CD_SKILLS: TestSkill[] = [
  createTestSkill("infra-ci-cd-github-actions", "github-actions CI/CD pipeline", {
    slug: "github-actions",
    displayName: "GitHub Actions",
    category: "infra-ci-cd",
    domain: "infra",
  }),
  // Fictional id, outside the generated union
  createTestSkill("infra-ci-cd-gitlab-ci" as SkillId, "gitlab-ci CI/CD pipeline", {
    // Fictional slug
    slug: "gitlab-ci" as SkillSlug,
    displayName: "GitLab CI",
    category: "infra-ci-cd",
    domain: "infra",
  }),
];

export const DISCOURAGES_RELATIONSHIP_SKILLS: TestSkill[] = [reactSkill, scssSkill, vueSkill];

export const DATADOG_OBSERVABILITY_SKILL: TestSkill = createTestSkill(
  // Fictional id, outside the generated union
  "api-observability-datadog" as SkillId,
  "Datadog APM integration",
  {},
);

export const REQUIRES_RELATIONSHIP_SKILLS: TestSkill[] = [reactSkill, vitestSkill];

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
  // Fictional id, outside the generated union
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

export const INIT_SKILL_IDS: SkillId[] = [
  "web-framework-react",
  "api-framework-hono",
  "web-testing-vitest",
];

export const INIT_TEST_SKILLS = DEFAULT_TEST_SKILLS.filter((s) =>
  INIT_SKILL_IDS.includes(s.id as SkillId),
);

export const HEALTH_ORPHAN_SKILL = {
  ...SKILLS.react,
  category: "nonexistent-category" as Category,
};

export const HEALTH_UNRESOLVED_CONFLICTS_WITH_SKILL = {
  ...SKILLS.react,
  // Unresolvable on purpose
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
  // Unresolvable on purpose
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

// tailwind's manifest verdict is `universal`, so a matrix fencing it contradicts the audit.

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

export const VALID_LOCAL_SKILL: TestSkill = createTestSkill(
  // Fictional id, outside the generated union
  "web-tooling-valid" as SkillId,
  "A valid skill",
  { slug: "tooling" as SkillSlug, displayName: "Valid" },
);

export const SKILL_WITHOUT_METADATA: TestSkill = createTestSkill(
  // Fictional id, outside the generated union
  "web-tooling-incomplete" as SkillId,
  "Missing metadata",
  { slug: "storybook", displayName: "Incomplete", skipMetadata: true },
);

export const SKILL_WITHOUT_METADATA_CUSTOM: TestSkill = createTestSkill(
  // Fictional id, outside the generated union
  "web-tooling-custom" as SkillId,
  "No metadata",
  { slug: "security" as SkillSlug, displayName: "Custom", skipMetadata: true },
);

export const REACT_REQUIRES_ZUSTAND = createMockSkill("web-framework-react", {
  requires: [{ skillIds: ["web-state-zustand"], needsAny: false, reason: "Needs Zustand" }],
});

// A custom skill's id names a user-written directory, outside the generated union; `external-`
// is the namespace of a skill with no marketplace.
export const CUSTOM_HOUSE_TOOLING_ID = "external-web-tooling-house" as SkillId;

/** A custom skill with a real category, as loaded before the tagging pass adds sources. */
export const CUSTOM_HOUSE_TOOLING_SKILL = createMockSkill(CUSTOM_HOUSE_TOOLING_ID, {
  category: "web-tooling",
  // Outside the generated union, as the id is
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

/** Phrased like the shipped catalogue's "Use when ..." guidance, so it reads no better. */
export const STATED_USAGE_GUIDANCE =
  "Use when a component owns state that no route and no server reply is responsible for.";

/** Its unguided pair is `SKILLS.scss`; `usageGuidance` is optional in the matrix. */
export const GUIDED_SKILL = createMockSkill("web-state-zustand", {
  usageGuidance: STATED_USAGE_GUIDANCE,
});

/**
 * `statedUsageFor`'s category fallback, mirrored rather than imported so a wording change reddens
 * the specs, and spelled per category so a template change cannot be absorbed. One entry serves the
 * positive and the negative assertions. `externalSkillMetadata` omits the trailing period.
 */
export const FALLBACK_USAGE = {
  "api-orm": "Use when working with api-orm.",
  "meta-design": "Use when working with meta-design.",
  "meta-reviewing": "Use when working with meta-reviewing.",
  "web-client-state": "Use when working with web-client-state.",
  "web-framework": "Use when working with web-framework.",
  "web-styling": "Use when working with web-styling.",
  "web-tooling": "Use when working with web-tooling.",
} as const satisfies Partial<Record<Category, string>>;
