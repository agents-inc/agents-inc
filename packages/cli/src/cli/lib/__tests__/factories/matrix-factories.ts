import { typedEntries } from "../../../utils/typed-object";
import type {
  Category,
  CategoryDefinition,
  CategoryMap,
  MergedSkillsMatrix,
  RelationshipDefinitions,
  ResolvedSkill,
  ResolvedStack,
  SkillId,
  SkillSlug,
  SkillSlugMap,
} from "../../../types";
import type { TestSkill } from "../fixtures/create-test-source";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures";
import { testSkillToResolvedSkill } from "./skill-factories.js";
import { createMockResolvedStack } from "./stack-factories.js";

/**
 * Builds a matrix from disk-oriented TestSkills by resolving each to a
 * ResolvedSkill. Pass `toResolvedOverrides` to carry per-skill fields (e.g.
 * `author`) that the default derivation would otherwise replace with defaults.
 */
export function createMatrixFromTestSkills(
  skills: TestSkill[],
  toResolvedOverrides?: (skill: TestSkill) => Partial<ResolvedSkill>,
): MergedSkillsMatrix {
  return createMockMatrix(
    Object.fromEntries(
      skills.map((skill) => [
        skill.id,
        testSkillToResolvedSkill(skill, toResolvedOverrides?.(skill)),
      ]),
    ),
  );
}

/**
 * Holds THE one documented boundary cast for test category maps. Test fixtures
 * supply a subset of the Category union and often partial CategoryDefinition
 * values (e.g. just `{ domain }`), but the matrix consumes a complete
 * Record<Category, CategoryDefinition>.
 *
 * NOTE: param is `Partial<Record<Category, Partial<CategoryDefinition>>>` (values
 * are also partial at call sites) — wider than the ledger's `Partial<Record<Category,
 * CategoryDefinition>>`, which would reject the `{ domain: "web" }` shorthand.
 */
export function buildCategoryMap(
  defs: Partial<Record<Category, Partial<CategoryDefinition>>>,
): Record<Category, CategoryDefinition> {
  return defs as Record<Category, CategoryDefinition>;
}

export function createMockMatrix(
  skillsOrFirstSkill?: Record<string, ResolvedSkill> | ResolvedSkill,
  ...rest: (ResolvedSkill | Partial<MergedSkillsMatrix>)[]
): MergedSkillsMatrix {
  let skillsRecord: Record<string, ResolvedSkill>;
  let overrides: Partial<MergedSkillsMatrix> | undefined;

  if (skillsOrFirstSkill === undefined) {
    // Empty call: createMockMatrix()
    skillsRecord = {};
  } else if (
    "id" in skillsOrFirstSkill &&
    typeof (skillsOrFirstSkill as ResolvedSkill).id === "string" &&
    "slug" in skillsOrFirstSkill
  ) {
    // New spread syntax: createMockMatrix(skill1, skill2, ..., optionalOverrides?)
    const allArgs = [skillsOrFirstSkill, ...rest];
    const lastArg = allArgs[allArgs.length - 1];

    // The last arg is overrides when it lacks the 'id' + 'slug' skill shape
    const hasOverrides = lastArg !== undefined && !("id" in lastArg && "slug" in lastArg);
    overrides = hasOverrides ? lastArg : undefined;
    const skills = (hasOverrides ? allArgs.slice(0, -1) : allArgs) as ResolvedSkill[];
    skillsRecord = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
  } else {
    // Old record syntax: createMockMatrix({ "id": skill }, overrides?)
    skillsRecord = skillsOrFirstSkill as Record<string, ResolvedSkill>;
    overrides = rest[0] as Partial<MergedSkillsMatrix> | undefined;
  }

  const skillsWithSlugs = Object.values(skillsRecord);
  // Boundary casts: Object.fromEntries widens keys to string
  const autoSlugToId = Object.fromEntries(
    skillsWithSlugs.map((skill) => [skill.slug, skill.id]),
  ) as Record<SkillSlug, SkillId>;
  const autoIdToSlug = Object.fromEntries(
    skillsWithSlugs.map((skill) => [skill.id, skill.slug]),
  ) as Record<SkillId, SkillSlug>;

  return {
    version: "1.0.0",
    categories: {},
    skills: skillsRecord,
    suggestedStacks: [],
    slugMap: { slugToId: autoSlugToId, idToSlug: autoIdToSlug },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Builds a comprehensive test matrix with 8 skills across 7 categories,
 * 2 suggested stacks, display name mappings, and relationship data
 * (conflicts). Includes anti-over-engineering methodology skill.
 * @returns A fully populated MergedSkillsMatrix with realistic test data
 */
export function createComprehensiveMatrix(
  overrides?: Partial<MergedSkillsMatrix>,
): MergedSkillsMatrix {
  // Skill categories use domain-prefixed Category IDs (matching production
  // metadata.yaml and the categories map keys, e.g., "web-framework", "api-api").
  const skills = {
    "web-framework-react": SKILLS.react,
    "web-framework-vue-composition-api": {
      ...SKILLS.vue,
      conflictsWith: [{ skillId: "web-framework-react", reason: "Choose one framework" }],
    } satisfies ResolvedSkill,
    "web-state-zustand": SKILLS.zustand,
    "web-styling-scss-modules": SKILLS.scss,
    "api-framework-hono": SKILLS.hono,
    "api-database-drizzle": SKILLS.drizzle,
    "web-testing-vitest": SKILLS.vitest,
    // Methodology skill
    "meta-reviewing-reviewing": SKILLS.antiOverEng,
  };

  const categories: CategoryMap = {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      domain: "web",
      exclusive: true,
      required: true,
    },
    "web-client-state": { ...TEST_CATEGORIES.clientState, domain: "web", order: 1 },
    "web-styling": { ...TEST_CATEGORIES.styling, domain: "web", order: 2 },
    "api-api": { ...TEST_CATEGORIES.api, domain: "api", exclusive: true, required: true },
    "api-orm": { ...TEST_CATEGORIES.database, domain: "api", order: 1 },
    "web-testing": {
      ...TEST_CATEGORIES.testing,
      domain: "shared",
      exclusive: false,
      order: 10,
    },
    "meta-reviewing": {
      ...TEST_CATEGORIES.methodology,
      domain: "meta",
      exclusive: false,
      required: false,
      order: 11,
    },
  };

  const suggestedStacks: ResolvedStack[] = [
    createMockResolvedStack("nextjs-fullstack", "Next.js Full-Stack", {
      description: "Complete Next.js stack with React and Hono",
      skills: {
        "web-developer": {
          "web-framework": ["web-framework-react"],
          "web-client-state": ["web-state-zustand"],
          "web-styling": ["web-styling-scss-modules"],
        },
        "api-developer": {
          "api-api": ["api-framework-hono"],
          "api-orm": ["api-database-drizzle"],
        },
      } satisfies ResolvedStack["skills"],
      allSkillIds: [
        "web-framework-react",
        "web-state-zustand",
        "web-styling-scss-modules",
        "api-framework-hono",
        "api-database-drizzle",
      ],
      philosophy: "Modern, type-safe fullstack development",
    }),
    createMockResolvedStack("vue-modern-fullstack", "Vue Modern Full-Stack", {
      description: "Vue.js frontend stack",
      skills: {
        "web-developer": {
          "web-framework": ["web-framework-vue-composition-api"],
        },
      } satisfies ResolvedStack["skills"],
      allSkillIds: ["web-framework-vue-composition-api"],
      philosophy: "Progressive framework approach",
    }),
  ];

  // Boundary cast: test matrix only contains a subset of all possible slugs
  const slugToId: SkillSlugMap["slugToId"] = {
    react: "web-framework-react",
    "vue-composition-api": "web-framework-vue-composition-api",
    zustand: "web-state-zustand",
    "scss-modules": "web-styling-scss-modules",
    hono: "api-framework-hono",
    drizzle: "api-database-drizzle",
    vitest: "web-testing-vitest",
    reviewing: "meta-reviewing-reviewing",
  };

  // Boundary cast: Object.fromEntries returns { [k: string]: string }
  const idToSlug = Object.fromEntries(
    typedEntries(slugToId).map(([slug, fullId]) => [fullId, slug]),
  ) as SkillSlugMap["idToSlug"];

  return createMockMatrix(skills, {
    categories,
    suggestedStacks,
    slugMap: { slugToId, idToSlug },
    ...overrides,
  });
}

/**
 * Builds a lightweight test matrix with 5 skills, 5 categories, and 2 stacks.
 * Use instead of createComprehensiveMatrix when relationship data is not needed.
 * @returns A minimal MergedSkillsMatrix for basic integration tests
 */
export function createBasicMatrix(overrides?: Partial<MergedSkillsMatrix>): MergedSkillsMatrix {
  // Domain-prefixed Category IDs — see createComprehensiveMatrix comment
  const skills = {
    "web-framework-react": SKILLS.react,
    "web-state-zustand": SKILLS.zustand,
    "api-framework-hono": SKILLS.hono,
    "web-testing-vitest": SKILLS.vitest,
    // Methodology skill
    "meta-reviewing-reviewing": SKILLS.antiOverEng,
  };

  const suggestedStacks: ResolvedStack[] = [
    createMockResolvedStack("react-fullstack", "React Fullstack", {
      allSkillIds: ["web-framework-react", "web-state-zustand", "api-framework-hono"],
    }),
    createMockResolvedStack("testing-stack", "Testing Stack", {
      allSkillIds: ["web-testing-vitest"],
    }),
  ];

  return createMockMatrix(skills, {
    suggestedStacks,
    categories: {
      "web-framework": {
        ...TEST_CATEGORIES.framework,
        domain: "web",
        exclusive: true,
        required: true,
      },
      "web-client-state": { ...TEST_CATEGORIES.clientState, domain: "web", order: 1 },
      "api-api": {
        ...TEST_CATEGORIES.api,
        domain: "api",
        exclusive: true,
        required: true,
      },
      "web-testing": {
        ...TEST_CATEGORIES.testing,
        displayName: "Testing Framework",
        domain: "shared",
        exclusive: false,
      },
      "meta-reviewing": {
        ...TEST_CATEGORIES.methodology,
        domain: "meta",
        exclusive: false,
        required: false,
      },
    } satisfies CategoryMap,
    ...overrides,
  });
}

/** Decomposed matrix config returned by createMockMatrixConfig (replaces SkillsMatrixConfig) */
export type MockMatrixConfig = {
  categories: Record<string, CategoryDefinition>;
  relationships: RelationshipDefinitions;
};

export function createMockMatrixConfig(
  categories: Record<string, CategoryDefinition>,
  overrides?: {
    relationships?: Partial<RelationshipDefinitions>;
  },
): MockMatrixConfig {
  const defaultRelationships: RelationshipDefinitions = {
    conflicts: [],
    discourages: [],
    requires: [],
    alternatives: [],
  };
  return {
    categories,
    relationships: overrides?.relationships
      ? { ...defaultRelationships, ...overrides.relationships }
      : defaultRelationships,
  };
}
