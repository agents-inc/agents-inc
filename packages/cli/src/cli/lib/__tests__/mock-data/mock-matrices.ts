import { groupBy, mapValues } from "remeda";

import { createMockMultiSourceSkill, createMockSkill } from "../factories/skill-factories.js";
import { createMockCategory } from "../factories/category-factories.js";
import {
  buildCategoryMap,
  createMockMatrix,
  createMockMatrixConfig,
} from "../factories/matrix-factories.js";
import { createMockCompileConfig } from "../factories/plugin-factories.js";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures.js";
import { FRAMEWORK_CATEGORY, MULTI_SOURCE_CATEGORIES } from "./mock-categories.js";
import {
  CUSTOM_HOUSE_TOOLING_SKILL,
  GUIDED_SKILL,
  LOCAL_SKILL_SOURCE,
  PUBLIC_MARKETPLACE_SOURCE,
  HEALTH_ALL_REFS_RESOLVED_SKILL,
  HEALTH_AUDIT_APPLIED_DISPOSITION_SKILL,
  HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_SKILL,
  HEALTH_MULTIPLE_UNRESOLVED_REFS_SKILL,
  HEALTH_ORPHAN_SKILL,
  HEALTH_PARTIAL_UNRESOLVED_REQUIRES_SKILL,
  HEALTH_UNRESOLVED_CONFLICTS_WITH_SKILL,
  HEALTH_UNRESOLVED_REQUIRES_SKILL,
  LOCAL_HOUSE_STYLE_SKILL,
  MULTI_SOURCE_PUBLIC_SKILLS,
  MULTI_SOURCE_ACME_SKILLS,
  MULTI_SOURCE_INTERNAL_SKILLS,
  REACT_REQUIRES_ZUSTAND,
} from "./mock-skills.js";
import type { MultiSourceSkillEntry } from "./mock-skills.js";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix.js";
import { PUBLIC_SOURCE, ACME_SOURCE, INTERNAL_SOURCE } from "./mock-sources.js";
import type {
  CategoryPath,
  MergedSkillsMatrix,
  SkillId,
  SkillSlug,
  SkillSource,
} from "../../../types";

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

/**
 * Categories with real `exclusive` flags; `createMockMatrix` defaults to none, so exclusivity
 * rules never fire.
 */
export const CATEGORY_EXCLUSIVITY_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.vue,
  SKILLS.zustand,
  SKILLS.pinia,
  SKILLS.scss,
  SKILLS.tailwind,
  SKILLS.vitest,
  {
    categories: buildCategoryMap({
      "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
      "web-client-state": { ...TEST_CATEGORIES.clientState, exclusive: true },
      "web-styling": { ...TEST_CATEGORIES.styling, exclusive: false },
      "web-testing": { ...TEST_CATEGORIES.testing, exclusive: false },
    }),
  },
);

/** The shipped catalogue plus one local skill, merged as `source-loader` does. */
export const CATALOGUE_WITH_LOCAL_SKILL_MATRIX: MergedSkillsMatrix = {
  ...BUILT_IN_MATRIX,
  skills: { ...BUILT_IN_MATRIX.skills, [LOCAL_HOUSE_STYLE_SKILL.id]: LOCAL_HOUSE_STYLE_SKILL },
};

/**
 * One guided skill and one unguided. Not `SKILLS.zustand`: the registry states no guidance, so it
 * would exercise only the fallback.
 */
export const USAGE_GUIDANCE_MATRIX = createMockMatrix(GUIDED_SKILL, SKILLS.scss);

/** Tagged: a catalogue skill the marketplace carries, and a custom skill only on disk. */
export const MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX = createMockMatrix(
  { ...SKILLS.react, availableSources: [PUBLIC_MARKETPLACE_SOURCE] },
  {
    ...CUSTOM_HOUSE_TOOLING_SKILL,
    availableSources: [LOCAL_SKILL_SOURCE],
    activeSource: LOCAL_SKILL_SOURCE,
  },
  {
    categories: buildCategoryMap({
      "web-framework": { domain: "web", exclusive: true },
      "web-tooling": { domain: "web", exclusive: false },
    }),
  },
);

export const ALL_SKILLS_WEB_FRAMEWORK_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "web-framework": { domain: "web" },
  }),
});

export const ALL_SKILLS_WEB_PAIR_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "web-framework": { domain: "web" },
    "web-client-state": { domain: "web" },
  }),
});

export const ALL_SKILLS_METHODOLOGY_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "meta-reviewing": { domain: "meta" },
  }),
});

export const ALL_SKILLS_METHODOLOGY_BARE_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "meta-reviewing": {},
  }),
});

export const ALL_SKILLS_MULTI_DOMAIN_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "web-framework": { domain: "web" },
    "meta-reviewing": { domain: "meta" },
    "api-api": { domain: "api" },
  }),
});

// api-api on the "api" domain, so react and hono split across domains.
export const REACT_HONO_WEB_API_DOMAINS_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": { ...TEST_CATEGORIES.api, domain: "api" },
  }),
});

/**
 * Adds Zustand on `web` with no rule binding it to React, so a selection may drop either web
 * skill alone.
 */
export const REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.zustand,
  SKILLS.hono,
  {
    categories: buildCategoryMap({
      "web-framework": TEST_CATEGORIES.framework,
      "web-client-state": TEST_CATEGORIES.clientState,
      "api-api": { ...TEST_CATEGORIES.api, domain: "api" },
    }),
  },
);

/** React requires Zustand here, so a decoded shared config with React alone must be refused. */
export const REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX = createMockMatrix(
  REACT_REQUIRES_ZUSTAND,
  SKILLS.zustand,
  SKILLS.hono,
  {
    categories: buildCategoryMap({
      "web-framework": TEST_CATEGORIES.framework,
      "web-client-state": TEST_CATEGORIES.clientState,
      "api-api": { ...TEST_CATEGORIES.api, domain: "api" },
    }),
  },
);

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

export const LOCAL_SKILL_MATRIX = createMockMatrix(
  // Fictional id, outside the generated union
  createMockSkill("web-local-skill" as SkillId, {
    local: true,
    localPath: "/mock-project/.claude/skills/my-local-skill/",
  }),
);

export const MIXED_LOCAL_REMOTE_MATRIX = createMockMatrix(
  SKILLS.react,
  // Fictional id, outside the generated union
  createMockSkill("meta-company-patterns" as SkillId, {
    local: true,
    localPath: "/mock-project/.claude/skills/company-patterns/",
  }),
);

export const METHODOLOGY_MATRIX = createMockMatrix(SKILLS.antiOverEng);

/** An uncatalogued id in a known category; unlike LOCAL_SKILL_MATRIX, it reaches the stack. */
export const CUSTOM_SKILL_MATRIX = createMockMatrix(
  // Fictional id, outside the generated union
  createMockSkill("web-framework-arbitrary" as SkillId),
);

/** A marketplace-prefixed id in a category with a domain, which CUSTOM_SKILL_MATRIX lacks. */
export const NAMESPACED_SKILL_MATRIX = createMockMatrix(
  // Marketplace-namespaced id, outside the generated union
  createMockSkill("acme-web-state-zustand" as SkillId, {
    category: "web-client-state",
    // Outside the generated union, as the id is
    slug: "acme-zustand" as SkillSlug,
  }),
  {
    categories: buildCategoryMap({
      "web-client-state": { ...TEST_CATEGORIES.clientState, domain: "web" },
    }),
  },
);

export const VITEST_MATRIX = createMockMatrix(SKILLS.vitest);

export const SHARED_SECURITY_MATRIX = createMockMatrix(SKILLS.authSecurity);

export const REACT_SHARED_SECURITY_MATRIX = createMockMatrix(SKILLS.react, SKILLS.authSecurity);

export const MULTI_STYLING_MATRIX = createMockMatrix(SKILLS.react, SKILLS.scss, SKILLS.tailwind);

/** As `buildCompileAgents` hands it to the resolver: per-agent skill refs, usage and flags. */
export const WEB_AND_API_SKILLS_COMPILE_CONFIG = createMockCompileConfig({
  "web-developer": {
    skills: [
      { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
      { id: "web-styling-scss-modules", usage: "when working with web-styling", preloaded: false },
    ],
  },
  "api-developer": {
    skills: [
      { id: "api-framework-hono", usage: "when working with api-api", preloaded: true },
      { id: "api-database-drizzle", usage: "when working with api-orm", preloaded: true },
    ],
  },
});

/** One agent names skills and the other names none — resolution is per-agent. */
export const WEB_SKILLS_API_NONE_COMPILE_CONFIG = createMockCompileConfig({
  "web-developer": {
    skills: [
      { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
    ],
  },
  "api-developer": {},
});

export const WEB_ONLY_COMPILE_CONFIG = createMockCompileConfig({
  "web-developer": {},
});

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
    order: 1,
  },
});

export const CI_CD_CONFIG = createMockMatrixConfig({
  "infra-ci-cd": createMockCategory("infra-ci-cd", "CI/CD", {
    description: "Continuous integration and deployment",
    domain: "infra",
    exclusive: true,
    order: 30,
  }),
});

export const FRAMEWORK_AND_STYLING_CONFIG = createMockMatrixConfig(
  {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      description: "UI Framework",
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
    },
  },
);

export const OBSERVABILITY_CONFIG = createMockMatrixConfig({
  "api-observability": createMockCategory("api-observability", "Observability", {
    description: "Monitoring and observability tools",
    domain: "api",
    exclusive: false,
    order: 15,
  }),
});

export const FRAMEWORK_AND_TESTING_CONFIG = createMockMatrixConfig(
  {
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      description: "UI Framework",
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

export const EMPTY_MATRIX_CONFIG = createMockMatrixConfig({});

// No fixture skill carries this slug; deliberately outside the generated union.
export const UNRESOLVABLE_SLUG = "nonexistent" as SkillSlug;

export const UNRESOLVED_CONFLICT_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      conflicts: [
        {
          skills: ["react", UNRESOLVABLE_SLUG],
          reason: "Conflict with missing skill",
        },
      ],
    },
  },
);

/** An AND requirement over one present slug and one absent. */
export const PARTIAL_REQUIRES_ALL_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          skill: "zustand",
          needs: ["react", UNRESOLVABLE_SLUG],
          reason: "Zustand needs React and the one nothing carries",
        },
      ],
    },
  },
);

/** The same partial requirement under OR semantics — an either-or over fewer alternatives. */
export const PARTIAL_REQUIRES_ANY_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          skill: "zustand",
          needs: ["react", UNRESOLVABLE_SLUG],
          needsAny: true,
          reason: "Zustand needs either React or the one nothing carries",
        },
      ],
    },
  },
);

/** A requirement over two slugs the skills both carry — nothing for resolution to drop. */
export const RESOLVED_REQUIRES_ALL_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          skill: "zustand",
          needs: ["react", "vitest"],
          reason: "Zustand needs React and Vitest",
        },
      ],
    },
  },
);

/** A rule about a skill not in the matrix, so resolution never walks it. */
export const UNREACHABLE_REQUIRES_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          // Both slugs deliberately outside the generated union
          skill: "ghost" as SkillSlug,
          needs: ["phantom" as SkillSlug],
          reason: "A rule about a skill this source does not ship",
        },
      ],
    },
  },
);

const { domain: _frameworkDomain, ...HEALTH_MISSING_DOMAIN_FRAMEWORK_CATEGORY } =
  TEST_CATEGORIES.framework;

const { domain: _stylingDomain, ...HEALTH_MISSING_DOMAIN_STYLING_CATEGORY } =
  TEST_CATEGORIES.styling;

export const HEALTH_HEALTHY_MATRIX = createMockMatrix(SKILLS.react, SKILLS.zustand, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "web-client-state": TEST_CATEGORIES.clientState,
  }),
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

/** As `mergeMatrixWithSkills` returns it when a source's `skill-rules.ts` names an unknown slug. */
export const HEALTH_UNRESOLVED_RULE_SLUG_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": TEST_CATEGORIES.framework,
  },
  unresolvedSlugs: [UNRESOLVABLE_SLUG],
});

export const HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX = createMockMatrix(SKILLS.tailwind, {
  categories: {
    "web-styling": { ...TEST_CATEGORIES.styling, exclusive: true },
  },
});

export const HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX = createMockMatrix(SKILLS.tailwind, {
  categories: {
    "web-styling": { ...TEST_CATEGORIES.styling, exclusive: false },
  },
});

export const HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_MATRIX = createMockMatrix(
  SKILLS.react,
  HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_SKILL,
  {
    categories: {
      "web-framework": TEST_CATEGORIES.framework,
      "web-styling": { ...TEST_CATEGORIES.styling, exclusive: false },
    },
  },
);

export const HEALTH_AUDIT_CONSTRAINED_IN_EXCLUSIVE_MATRIX = createMockMatrix(SKILLS.react, {
  categories: {
    "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
  },
});

export const HEALTH_AUDIT_APPLIED_DISPOSITION_MATRIX = createMockMatrix(
  HEALTH_AUDIT_APPLIED_DISPOSITION_SKILL,
  {
    categories: {
      "web-streaming": createMockCategory("web-streaming", "Server Streaming", {
        exclusive: false,
      }),
    },
  },
);

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
    const first = entries[0];
    const sources = entries.map((e) => e.source);
    // The entry's fields are plain strings holding valid ids
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

const BUILD_STEP_CATEGORIES = buildCategoryMap({
  "web-framework": { ...TEST_CATEGORIES.framework },
  "web-client-state": {
    ...TEST_CATEGORIES.clientState,
    displayName: "State Management",
    order: 1,
  },
});

export const BUILD_STEP_REQUIRES_MATRIX = createMockMatrix(REACT_REQUIRES_ZUSTAND, SKILLS.zustand, {
  categories: BUILD_STEP_CATEGORIES,
});
