// Shared matrix configs and compile configs for test files.

import { groupBy, mapValues } from "remeda";

import { createMockMultiSourceSkill, createMockSkill } from "../factories/skill-factories.js";
import { createMockCategory } from "../factories/category-factories.js";
import { createMockMatrix, createMockMatrixConfig } from "../factories/matrix-factories.js";
import { createMockCompileConfig } from "../factories/plugin-factories.js";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures.js";
import { FRAMEWORK_CATEGORY, MULTI_SOURCE_CATEGORIES } from "./mock-categories.js";
import {
  CATEGORY_GRID_SKILLS,
  HEALTH_ALL_REFS_RESOLVED_SKILL,
  HEALTH_MULTIPLE_UNRESOLVED_REFS_SKILL,
  HEALTH_ORPHAN_SKILL,
  HEALTH_PARTIAL_UNRESOLVED_REQUIRES_SKILL,
  HEALTH_UNRESOLVED_COMPATIBLE_WITH_SKILL,
  HEALTH_UNRESOLVED_CONFLICTS_WITH_SKILL,
  HEALTH_UNRESOLVED_REQUIRES_SKILL,
  HEALTH_ZUSTAND_RECOMMENDED,
  MULTI_SOURCE_PUBLIC_SKILLS,
  MULTI_SOURCE_ACME_SKILLS,
  MULTI_SOURCE_INTERNAL_SKILLS,
  PINIA_CONFLICTS_ZUSTAND,
  REACT_CONFLICTS_VUE,
  REACT_LOCAL,
  REACT_RECOMMENDED,
  REACT_REQUIRES_ZUSTAND,
  VUE_CONFLICTS_REACT,
  VUE_DISCOURAGES_SCSS,
  ZUSTAND_CONFLICTS_PINIA,
  ZUSTAND_UNIVERSAL,
} from "./mock-skills.js";
import type { MultiSourceSkillEntry } from "./mock-skills.js";
import { PUBLIC_SOURCE, ACME_SOURCE, INTERNAL_SOURCE } from "./mock-sources.js";
import type {
  Category,
  CategoryDefinition,
  CategoryPath,
  MergedSkillsMatrix,
  SkillId,
  SkillSlug,
  SkillSource,
} from "../../../types";

// ---------------------------------------------------------------------------
// Canonical matrix shapes — use these instead of inline createMockMatrix() calls
// ---------------------------------------------------------------------------

export const EMPTY_MATRIX = createMockMatrix();
export const SINGLE_REACT_MATRIX = createMockMatrix(SKILLS.react);
export const WEB_PAIR_MATRIX = createMockMatrix(SKILLS.react, SKILLS.zustand);
export const FULLSTACK_PAIR_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono);
export const WEB_TRIO_MATRIX = createMockMatrix(SKILLS.react, SKILLS.zustand, SKILLS.vitest);
export const FULLSTACK_TRIO_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, SKILLS.vitest);
export const VITEST_REACT_HONO_MATRIX = createMockMatrix(SKILLS.vitest, SKILLS.react, SKILLS.hono);
export const REACT_SCSS_MATRIX = createMockMatrix(SKILLS.react, SKILLS.scss);
export const REACT_SCSS_HONO_MATRIX = createMockMatrix(SKILLS.react, SKILLS.scss, SKILLS.hono);
export const SCSS_HONO_REACT_MATRIX = createMockMatrix(SKILLS.scss, SKILLS.hono, SKILLS.react);
export const HONO_REACT_MATRIX = createMockMatrix(SKILLS.hono, SKILLS.react);
export const REACT_ZUSTAND_HONO_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.zustand,
  SKILLS.hono,
);

export const CATEGORY_GRID_MATRIX = createMockMatrix(
  ...CATEGORY_GRID_SKILLS.map(({ id, displayName, category }) =>
    createMockSkill(id, { displayName, category }),
  ),
);

// ---------------------------------------------------------------------------
// All-skills matrices with category overrides — for wizard store tests
// ---------------------------------------------------------------------------

export const ALL_SKILLS_TEST_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: TEST_CATEGORIES as unknown as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_WEB_FRAMEWORK_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "web-framework": { domain: "web" },
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_WEB_PAIR_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "web-framework": { domain: "web" },
    "web-client-state": { domain: "web" },
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "web-framework": { domain: "web" },
    "web-client-state": { domain: "web" },
    "api-api": { domain: "api" },
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_WEB_AND_API_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "web-framework": { domain: "web" },
    "api-api": { domain: "api" },
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_METHODOLOGY_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "meta-reviewing": { domain: "meta" },
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_METHODOLOGY_BARE_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "meta-reviewing": {},
  } as Record<Category, CategoryDefinition>,
});

export const ALL_SKILLS_MULTI_DOMAIN_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: {
    "web-framework": { domain: "web" },
    "meta-reviewing": { domain: "meta" },
    "api-api": { domain: "api" },
  } as Record<Category, CategoryDefinition>,
});

export const REACT_HONO_FRAMEWORK_API_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": TEST_CATEGORIES.api,
  } as Record<Category, CategoryDefinition>,
});

// Like REACT_HONO_FRAMEWORK_API_MATRIX but with api-api on the "api" domain, so the
// two skills split across distinct domains (react → web, hono → api). Category defs
// are complete (carry `id`), so buildCategoriesForDomain resolves options per domain.
export const REACT_HONO_WEB_API_DOMAINS_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": { ...TEST_CATEGORIES.api, domain: "api" },
  } as Record<Category, CategoryDefinition>,
});

// ---------------------------------------------------------------------------
// Matrix configs from matrix-loader.test.ts
// ---------------------------------------------------------------------------

export const MERGE_BASIC_MATRIX = createMockMatrixConfig({ "web-framework": FRAMEWORK_CATEGORY });

export const CONFLICT_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      conflicts: [{ skills: ["react", "vue-composition-api"], reason: "Pick one framework" }],
    },
  },
);

export const ALTERNATIVES_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      alternatives: [
        {
          purpose: "State management",
          skills: ["zustand", "jotai"],
        },
      ],
    },
  },
);

export const REQUIRES_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          skill: "zustand",
          needs: ["react"],
          reason: "Zustand needs React",
        },
      ],
    },
  },
);

// ---------------------------------------------------------------------------
// MergedSkillsMatrix instances from config-generator.test.ts
// ---------------------------------------------------------------------------

export const LOCAL_SKILL_MATRIX = createMockMatrix(
  // Boundary cast: fictional skill ID for testing local skill matrix
  createMockSkill("web-local-skill" as SkillId, {
    local: true,
    localPath: "/mock-project/.claude/skills/my-local-skill/",
  }),
);

export const MIXED_LOCAL_REMOTE_MATRIX = createMockMatrix(
  SKILLS.react,
  // Boundary cast: fictional skill ID for testing mixed local/remote matrix
  createMockSkill("meta-company-patterns" as SkillId, {
    local: true,
    localPath: "/mock-project/.claude/skills/company-patterns/",
  }),
);

export const METHODOLOGY_MATRIX = createMockMatrix(SKILLS.antiOverEng);

export const VITEST_MATRIX = createMockMatrix(SKILLS.vitest);

export const MULTI_STYLING_MATRIX = createMockMatrix(SKILLS.react, SKILLS.scss, SKILLS.tailwind);

// ---------------------------------------------------------------------------
// Compile configs from resolver.test.ts
// ---------------------------------------------------------------------------

export const WEB_AND_API_COMPILE_CONFIG = createMockCompileConfig({
  "web-developer": {},
  "api-developer": {},
});

export const WEB_ONLY_COMPILE_CONFIG = createMockCompileConfig({
  "web-developer": {},
});

// ---------------------------------------------------------------------------
// Matrix configs from consumer-stacks-matrix.integration.test.ts
// ---------------------------------------------------------------------------

export const TOOLING_AND_FRAMEWORK_CONFIG = createMockMatrixConfig({
  "shared-tooling": {
    ...TEST_CATEGORIES.tooling,
    description: "Development tooling and infrastructure",
    domain: "shared" as const,
    exclusive: false,
    order: 20,
  },
  "web-framework": {
    ...TEST_CATEGORIES.framework,
    description: "UI Framework",
    required: true,
    order: 1,
  },
});

export const CI_CD_CONFIG = createMockMatrixConfig({
  "infra-ci-cd": createMockCategory("infra-ci-cd", "CI/CD", {
    description: "Continuous integration and deployment",
    domain: "infra",
    exclusive: true,
    required: false,
    order: 30,
  }),
});

export const FRAMEWORK_AND_STYLING_CONFIG = createMockMatrixConfig(
  {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      description: "UI Framework",
      required: true,
      order: 1,
    },
    "web-styling": {
      ...TEST_CATEGORIES.styling,
      description: "CSS approach",
      exclusive: false,
      order: 2,
    },
  },
  {
    relationships: {
      discourages: [
        {
          skills: ["react", "scss-modules"],
          reason: "These tools have conflicting design philosophies",
        },
      ],
      recommends: [
        {
          skill: "vue-composition-api",
          reason: "These work great together",
        },
      ],
    },
  },
);

export const OBSERVABILITY_CONFIG = createMockMatrixConfig({
  "api-observability": createMockCategory("api-observability", "Observability", {
    description: "Monitoring and observability tools",
    domain: "api",
    exclusive: false,
    required: false,
    order: 15,
  }),
});

export const FRAMEWORK_AND_TESTING_CONFIG = createMockMatrixConfig(
  {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      description: "UI Framework",
      required: true,
      order: 1,
    },
    "web-testing": {
      ...TEST_CATEGORIES.testing,
      description: "Testing tools",
      domain: "shared" as const,
      exclusive: false,
      order: 10,
    },
  },
  {
    relationships: {
      requires: [
        {
          skill: "vitest",
          needs: ["react"],
          reason: "RTL requires React to function",
        },
      ],
    },
  },
);

// ---------------------------------------------------------------------------
// Matrix configs from skill-resolution.test.ts
// ---------------------------------------------------------------------------

export const EMPTY_MATRIX_CONFIG = createMockMatrixConfig({});

export const UNRESOLVED_CONFLICT_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      conflicts: [
        {
          // Boundary cast: deliberately invalid slug to test unresolved reference handling
          skills: ["react", "nonexistent" as SkillSlug],
          reason: "Conflict with missing skill",
        },
      ],
    },
  },
);

// ---------------------------------------------------------------------------
// Health-check matrices from matrix-health-check.test.ts
// ---------------------------------------------------------------------------

const HEALTH_MISSING_DOMAIN_FRAMEWORK_CATEGORY = {
  ...TEST_CATEGORIES.framework,
  domain: undefined,
};

const HEALTH_MISSING_DOMAIN_STYLING_CATEGORY = {
  ...TEST_CATEGORIES.styling,
  domain: undefined,
};

export const HEALTH_HEALTHY_MATRIX = createMockMatrix(SKILLS.react, HEALTH_ZUSTAND_RECOMMENDED, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
    "web-client-state": TEST_CATEGORIES.clientState,
  },
});

export const HEALTH_SINGLE_SKILL_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
  },
});

export const HEALTH_MISSING_DOMAIN_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": HEALTH_MISSING_DOMAIN_FRAMEWORK_CATEGORY,
  },
});

export const HEALTH_MULTIPLE_MISSING_DOMAINS_MATRIX = createMockMatrix(
  {},
  {
    categories: {
      "web-framework": HEALTH_MISSING_DOMAIN_FRAMEWORK_CATEGORY,
      "web-styling": HEALTH_MISSING_DOMAIN_STYLING_CATEGORY,
      "web-client-state": TEST_CATEGORIES.clientState,
    },
  },
);

export const HEALTH_UNKNOWN_CATEGORY_MATRIX = createMockMatrix(HEALTH_ORPHAN_SKILL, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
  },
});

export const HEALTH_ORPHAN_SKILL_WITH_MISSING_DOMAIN_MATRIX = createMockMatrix(
  HEALTH_ORPHAN_SKILL,
  {
    categories: {
      "web-framework": HEALTH_MISSING_DOMAIN_FRAMEWORK_CATEGORY,
    },
  },
);

export const HEALTH_UNRESOLVED_COMPATIBLE_WITH_MATRIX = createMockMatrix(
  HEALTH_UNRESOLVED_COMPATIBLE_WITH_SKILL,
  {
    categories: {
      "web-client-state": TEST_CATEGORIES.clientState,
    },
  },
);

export const HEALTH_UNRESOLVED_CONFLICTS_WITH_MATRIX = createMockMatrix(
  HEALTH_UNRESOLVED_CONFLICTS_WITH_SKILL,
  {
    categories: {
      "web-framework": TEST_CATEGORIES.framework,
    },
  },
);

export const HEALTH_UNRESOLVED_REQUIRES_MATRIX = createMockMatrix(
  HEALTH_UNRESOLVED_REQUIRES_SKILL,
  {
    categories: {
      "web-testing": TEST_CATEGORIES.testing,
    },
  },
);

export const HEALTH_MULTIPLE_UNRESOLVED_REFS_MATRIX = createMockMatrix(
  HEALTH_MULTIPLE_UNRESOLVED_REFS_SKILL,
  {
    categories: {
      "web-client-state": TEST_CATEGORIES.clientState,
    },
  },
);

export const HEALTH_ALL_REFS_RESOLVED_MATRIX = createMockMatrix(
  SKILLS.react,
  HEALTH_ALL_REFS_RESOLVED_SKILL,
  {
    categories: {
      "web-framework": TEST_CATEGORIES.framework,
      "web-client-state": TEST_CATEGORIES.clientState,
    },
  },
);

export const HEALTH_PARTIAL_UNRESOLVED_REQUIRES_MATRIX = createMockMatrix(
  SKILLS.react,
  HEALTH_PARTIAL_UNRESOLVED_REQUIRES_SKILL,
  {
    categories: {
      "web-framework": TEST_CATEGORIES.framework,
      "web-testing": TEST_CATEGORIES.testing,
    },
  },
);

// ---------------------------------------------------------------------------
// Multi-source matrix from skill-resolution.integration.test.ts
// ---------------------------------------------------------------------------

type TaggedMultiSourceEntry = MultiSourceSkillEntry & { source: SkillSource };

export function buildMultiSourceMatrix(
  overrides?: Partial<MergedSkillsMatrix>,
): MergedSkillsMatrix {
  const taggedEntries: TaggedMultiSourceEntry[] = [
    ...MULTI_SOURCE_PUBLIC_SKILLS.map((s) => ({ ...s, source: { ...PUBLIC_SOURCE } })),
    ...MULTI_SOURCE_ACME_SKILLS.map((s) => ({ ...s, source: { ...ACME_SOURCE } })),
    ...MULTI_SOURCE_INTERNAL_SKILLS.map((s) => ({ ...s, source: { ...INTERNAL_SOURCE } })),
  ];
  const grouped = groupBy(taggedEntries, (e) => e.id);
  const skills = mapValues(grouped, (entries) => {
    const first = entries[0]!;
    const sources = entries.map((e) => e.source);
    // Boundary cast: MultiSourceSkillEntry.id is string, but contains valid skill IDs
    return createMockMultiSourceSkill(first.id as SkillId, sources, {
      category: first.category as CategoryPath,
      description: first.description,
    });
  });

  return createMockMatrix(skills, {
    categories: MULTI_SOURCE_CATEGORIES,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Build-step-logic test matrices
// ---------------------------------------------------------------------------

/** Shared category overrides for framework (required) + state management */
const BUILD_STEP_CATEGORIES = {
  "web-framework": { ...TEST_CATEGORIES.framework, required: true },
  "web-client-state": {
    ...TEST_CATEGORIES.clientState,
    displayName: "State Management",
    order: 1,
  },
} as Record<Category, CategoryDefinition>;

/** Base matrix: React + Vue frameworks, Zustand + Pinia state — with required framework category */
export const BUILD_STEP_WEB_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.vue,
  SKILLS.zustand,
  SKILLS.pinia,
  { categories: BUILD_STEP_CATEGORIES },
);

/** React (with requires: zustand) + Zustand — for dependency/requiredBy tests */
export const BUILD_STEP_REQUIRES_MATRIX = createMockMatrix(REACT_REQUIRES_ZUSTAND, SKILLS.zustand, {
  categories: BUILD_STEP_CATEGORIES,
});

/** Framework category with no skills — tests filtering of empty categories */
export const BUILD_STEP_EMPTY_FRAMEWORK_MATRIX = createMockMatrix(
  {},
  {
    categories: {
      "web-framework": { ...TEST_CATEGORIES.framework, required: true },
    } as Record<Category, CategoryDefinition>,
  },
);

/** React with required: true, exclusive: false on framework — tests flag propagation */
export const BUILD_STEP_FRAMEWORK_NON_EXCLUSIVE_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      required: true,
      exclusive: false,
    },
  } as Record<Category, CategoryDefinition>,
});

/** React with required/exclusive omitted from framework — tests ?? defaults */
const { required: _r, exclusive: _e, ...FRAMEWORK_WITHOUT_FLAGS } = TEST_CATEGORIES.framework;
export const BUILD_STEP_FRAMEWORK_NO_FLAGS_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": FRAMEWORK_WITHOUT_FLAGS,
  } as Record<Category, CategoryDefinition>,
});

/** React + Hono with framework (required) + api categories — tests domain filtering */
export const BUILD_STEP_FRAMEWORK_API_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: {
    "web-framework": { ...TEST_CATEGORIES.framework, required: true },
    "api-api": {
      ...TEST_CATEGORIES.api,
      domain: "api" as const,
      displayName: "API Framework",
    },
  } as Record<Category, CategoryDefinition>,
});

/** React with just framework category — tests no-match domain (returns empty for "api") */
export const BUILD_STEP_FRAMEWORK_ONLY_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": { ...TEST_CATEGORIES.framework },
  } as Record<Category, CategoryDefinition>,
});

/** Hono + Drizzle with api + database categories — tests non-web domain filtering */
export const BUILD_STEP_API_DB_MATRIX = createMockMatrix(SKILLS.hono, SKILLS.drizzle, {
  categories: {
    "api-api": {
      ...TEST_CATEGORIES.api,
      domain: "api" as const,
      required: true,
    },
    "api-database": {
      ...TEST_CATEGORIES.database,
      domain: "api" as const,
      order: 1,
    },
  } as Record<Category, CategoryDefinition>,
});

/** React + universal Zustand + Pinia — tests empty compatibleWith pass-through */
export const BUILD_STEP_UNIVERSAL_COMPAT_MATRIX = createMockMatrix(
  SKILLS.react,
  ZUSTAND_UNIVERSAL,
  SKILLS.pinia,
  {
    categories: {
      "web-framework": { ...TEST_CATEGORIES.framework, required: true },
      "web-client-state": {
        ...TEST_CATEGORIES.clientState,
        displayName: "State Management",
        order: 1,
      },
    } as Record<Category, CategoryDefinition>,
  },
);

/** Local React skill with framework category — tests local flag propagation */
export const BUILD_STEP_LOCAL_SKILL_MATRIX = createMockMatrix(REACT_LOCAL, {
  categories: {
    "web-framework": { ...TEST_CATEGORIES.framework },
  } as Record<Category, CategoryDefinition>,
});

/** React (non-local) with framework category — tests non-local skills have local undefined */
export const BUILD_STEP_NON_LOCAL_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": { ...TEST_CATEGORIES.framework },
  } as Record<Category, CategoryDefinition>,
});

/** React with custom displayName on framework category — tests displayName propagation */
export const BUILD_STEP_DISPLAY_NAME_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      displayName: "Web Framework",
    },
  } as Record<Category, CategoryDefinition>,
});

/** React + Zustand + SCSS with 3 categories and custom order values — tests sorting */
export const BUILD_STEP_SORTING_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.zustand,
  SKILLS.scss,
  {
    categories: {
      "web-client-state": {
        ...TEST_CATEGORIES.clientState,
        displayName: "State Management",
        order: 10,
      },
      "web-framework": { ...TEST_CATEGORIES.framework, order: 5 },
      "web-styling": { ...TEST_CATEGORIES.styling, order: 1 },
    } as Record<Category, CategoryDefinition>,
  },
);

/** React + Zustand with one category missing order — tests undefined order defaults to 0 */
const { order: _o, ...FRAMEWORK_WITHOUT_ORDER } = TEST_CATEGORIES.framework;
export const BUILD_STEP_UNDEFINED_ORDER_MATRIX = createMockMatrix(SKILLS.react, SKILLS.zustand, {
  categories: {
    "web-client-state": {
      ...TEST_CATEGORIES.clientState,
      displayName: "State Management",
      order: 1,
    },
    "web-framework": FRAMEWORK_WITHOUT_ORDER,
  } as Record<Category, CategoryDefinition>,
});

/** React/Vue conflicts in exclusive framework category — tests incompatible suppression */
export const BUILD_STEP_CONFLICTS_EXCLUSIVE_MATRIX = createMockMatrix(
  REACT_CONFLICTS_VUE,
  VUE_CONFLICTS_REACT,
  {
    categories: {
      "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
    } as Record<Category, CategoryDefinition>,
  },
);

/** Zustand/Pinia conflicts in non-exclusive state category — tests preserved incompatibility */
export const BUILD_STEP_CONFLICTS_NON_EXCLUSIVE_MATRIX = createMockMatrix(
  ZUSTAND_CONFLICTS_PINIA,
  PINIA_CONFLICTS_ZUSTAND,
  {
    categories: {
      "web-client-state": {
        ...TEST_CATEGORIES.clientState,
        displayName: "State Management",
        exclusive: false,
      },
    } as Record<Category, CategoryDefinition>,
  },
);

/** Recommended React + discouraged Vue + SCSS — tests preserved advisory states in exclusive categories */
export const BUILD_STEP_ADVISORY_STATES_MATRIX = createMockMatrix(
  REACT_RECOMMENDED,
  VUE_DISCOURAGES_SCSS,
  SKILLS.scss,
  {
    categories: {
      "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
      "web-styling": { ...TEST_CATEGORIES.styling },
    } as Record<Category, CategoryDefinition>,
  },
);
