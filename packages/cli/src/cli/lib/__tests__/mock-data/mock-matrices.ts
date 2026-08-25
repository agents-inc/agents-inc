// Shared matrix configs and compile configs for test files.

import { groupBy, indexBy, mapValues } from "remeda";

import { createMockMultiSourceSkill, createMockSkill } from "../factories/skill-factories.js";
import { createMockCategory } from "../factories/category-factories.js";
import {
  buildCategoryMap,
  createMockMatrix,
  createMockMatrixConfig,
} from "../factories/matrix-factories.js";
import { createMockCompileConfig } from "../factories/plugin-factories.js";
import { createMockResolvedStack } from "../factories/stack-factories.js";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures.js";
import { FRAMEWORK_CATEGORY, MULTI_SOURCE_CATEGORIES } from "./mock-categories.js";
import {
  CATEGORY_GRID_SKILLS,
  CUSTOM_HOUSE_TOOLING_SKILL,
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
  PINIA_CONFLICTS_ZUSTAND,
  REACT_CONFLICTS_VUE,
  REACT_LOCAL,
  REACT_REQUIRES_ZUSTAND,
  VUE_CONFLICTS_REACT,
  VUE_DISCOURAGES_SCSS,
  ZUSTAND_CONFLICTS_PINIA,
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

/**
 * Two frameworks and two client-state skills in exclusive categories, two styling
 * skills in a non-exclusive one, plus a non-exclusive testing category. Use when a
 * test needs the category `exclusive` flag to be real — the default
 * `createMockMatrix` categories map is empty, so every category reads as
 * "undefined flags" and exclusivity rules can never fire.
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

export const CATEGORY_GRID_MATRIX = createMockMatrix(
  ...CATEGORY_GRID_SKILLS.map(({ id, slug, displayName, category }) =>
    createMockSkill(id, { slug, displayName, category }),
  ),
);

/**
 * The shipped catalogue with one local skill merged in, the way `source-loader`
 * does it — an id no built-in relationship rule can ever name.
 */
export const CATALOGUE_WITH_LOCAL_SKILL_MATRIX: MergedSkillsMatrix = {
  ...BUILT_IN_MATRIX,
  skills: { ...BUILT_IN_MATRIX.skills, [LOCAL_HOUSE_STYLE_SKILL.id]: LOCAL_HOUSE_STYLE_SKILL },
};

/**
 * The two install-mode shapes the Sources step must tell apart, with the tagging pass
 * already run over both: a catalogue skill the marketplace carries, and a custom skill
 * whose only copy is the one on disk.
 */
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

// ---------------------------------------------------------------------------
// All-skills matrices with category overrides — for wizard store tests
// ---------------------------------------------------------------------------

export const ALL_SKILLS_TEST_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  // `TEST_CATEGORIES` is keyed by fixture name (framework/clientState/…) for its
  // callers' convenience; a matrix is keyed by Category id. Re-keying on each
  // definition's own `id` is the whole of the difference, and it is what the map
  // has to be keyed by for a category lookup to find anything.
  categories: indexBy(Object.values(TEST_CATEGORIES), (category) => category.id),
});

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

export const ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "web-framework": { domain: "web" },
    "web-client-state": { domain: "web" },
    "api-api": { domain: "api" },
  }),
});

export const ALL_SKILLS_WEB_AND_API_MATRIX = createMockMatrix(...Object.values(SKILLS), {
  categories: buildCategoryMap({
    "web-framework": { domain: "web" },
    "api-api": { domain: "api" },
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

export const REACT_HONO_FRAMEWORK_API_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": TEST_CATEGORIES.api,
  }),
});

/**
 * REACT_HONO_FRAMEWORK_API_MATRIX with Hono's `api-api` category left out of the map, so no
 * domain claims it. This is the one way a skill the catalogue DOES carry still reaches no
 * screen: `getCategoryDomain` reads `categories[category]?.domain`, so an undeclared category
 * and one declared without a `domain` are the same answer to the wizard, and the sibling above
 * — where both categories are declared — is what says the difference is the category rather
 * than the skill.
 */
export const HONO_CATEGORY_UNPLACEABLE_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
  }),
});

/**
 * REACT_HONO_FRAMEWORK_API_MATRIX with one stack on offer — the shape a source
 * that SHIPS stacks loads as, where its sibling above is the shape one that
 * ships none loads as. The pair is what tells the wizard whether it has a stack
 * step to open on at all.
 */
export const REACT_HONO_ONE_STACK_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": TEST_CATEGORIES.api,
  }),
  suggestedStacks: [createMockResolvedStack("react-hono", "React Hono")],
});

/**
 * REACT_HONO_ONE_STACK_MATRIX whose stack claims a skill the catalogue does not carry.
 *
 * Nothing reconciles the two: `convertStackToResolvedStack` in `lib/loading/source-loader.ts`
 * copies a stack's skill ids straight through under its own comment — "Stack values are already
 * skill IDs — no alias resolution needed" — so a source whose `stacks.ts` names a skill its
 * catalogue dropped loads without complaint and the mismatch is not found until the stack is
 * chosen. That is the one production route on which `populateFromSkillIds` warns from a PAINTED
 * frame rather than during hydration, which is what makes this fixture worth a name.
 */
export const STACK_CLAIMING_ABSENT_SKILL_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": TEST_CATEGORIES.api,
  }),
  suggestedStacks: [
    createMockResolvedStack("react-hono", "React Hono", {
      allSkillIds: ["web-framework-react", "web-styling-tailwind"],
    }),
  ],
});

// Like REACT_HONO_FRAMEWORK_API_MATRIX but with api-api on the "api" domain, so the
// two skills split across distinct domains (react → web, hono → api). Category defs
// are complete (carry `id`), so buildCategoriesForDomain resolves options per domain.
export const REACT_HONO_WEB_API_DOMAINS_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": TEST_CATEGORIES.framework,
    "api-api": { ...TEST_CATEGORIES.api, domain: "api" },
  }),
});

/**
 * REACT_HONO_WEB_API_DOMAINS_MATRIX with Zustand alongside React on the `web` domain and NO
 * rule binding the two. Three skills over two domains, every category defined, and nothing
 * the catalogue objects to — so a selection may drop either web skill and keep the other, and
 * whether a domain survives is decided by what is selected rather than by a requirement.
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

/**
 * REACT_HONO_WEB_API_DOMAINS_MATRIX with React bound to Zustand by a catalog rule, and Zustand
 * present so the requirement is satisfiable. A selection carrying React without Zustand is one
 * THIS catalog rejects however consistent it was where it was authored — the shape a decoded
 * shared configuration has to be revalidated against.
 */
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

/**
 * One skill whose id the generated catalog does not know, in a category it
 * does — the shape a marketplace or hand-added skill takes. Unlike
 * LOCAL_SKILL_MATRIX its skill reaches the stack, so use it wherever a test
 * needs an assignment the shared catalog data cannot speak about.
 */
export const CUSTOM_SKILL_MATRIX = createMockMatrix(
  // Boundary cast: fictional skill ID outside the generated union
  createMockSkill("web-framework-arbitrary" as SkillId),
);

/**
 * A marketplace's own skill as the namespace rule has it: an id carrying the
 * marketplace's prefix — so a member of no catalog-keyed table — in a category
 * this matrix places in a domain. That domain is the difference from
 * CUSTOM_SKILL_MATRIX, which declares no categories at all and therefore leaves
 * its skill with no taxonomy to be targeted on.
 */
export const NAMESPACED_SKILL_MATRIX = createMockMatrix(
  // Boundary cast: a marketplace-namespaced id is outside the generated union
  createMockSkill("acme-web-state-zustand" as SkillId, {
    category: "web-client-state",
    // Boundary cast: a marketplace's own slug is outside the generated union
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

// ---------------------------------------------------------------------------
// Compile configs from resolver.test.ts
// ---------------------------------------------------------------------------

/**
 * What `buildCompileAgents` hands the resolver once it has expanded a project config's
 * stack: every agent carries its own skill references, usage text and load flags.
 */
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

// ---------------------------------------------------------------------------
// Matrix configs from skill-resolution.test.ts
// ---------------------------------------------------------------------------

export const EMPTY_MATRIX_CONFIG = createMockMatrixConfig({});

/**
 * The slug every rule below reaches for and no fixture skill carries — a
 * marketplace author's typo, stated once so a spec asserting on it and the rule
 * naming it cannot drift apart.
 */
// Boundary cast: deliberately invalid slug, outside the generated union
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

/**
 * A requirement over one slug the skills carry and one nothing does, under AND
 * semantics — the shape whose surviving half used to be applied as though its
 * author had written the smaller rule.
 */
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

/**
 * A requirement no present skill declares, over a need no present skill carries
 * — a rule resolution never walks, because the skill it is written about is not
 * in the matrix to walk it.
 */
export const UNREACHABLE_REQUIRES_MATRIX = createMockMatrixConfig(
  {},
  {
    relationships: {
      requires: [
        {
          // Boundary casts: both slugs are deliberately outside the generated union
          skill: "ghost" as SkillSlug,
          needs: ["phantom" as SkillSlug],
          reason: "A rule about a skill this source does not ship",
        },
      ],
    },
  },
);

// ---------------------------------------------------------------------------
// Health-check matrices from matrix-health-check.test.ts
// ---------------------------------------------------------------------------

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

/**
 * A matrix whose merge could not resolve one of the slugs its relationship
 * rules name — what `mergeMatrixWithSkills` hands the health check when a
 * source's own `skill-rules.ts` carries a typo.
 */
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
    const first = entries[0];
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

/** Shared category overrides for framework + state management */
const BUILD_STEP_CATEGORIES = buildCategoryMap({
  "web-framework": { ...TEST_CATEGORIES.framework },
  "web-client-state": {
    ...TEST_CATEGORIES.clientState,
    displayName: "State Management",
    order: 1,
  },
});

/** Base matrix: React + Vue frameworks, Zustand + Pinia state — exclusive framework category */
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
    categories: buildCategoryMap({
      "web-framework": { ...TEST_CATEGORIES.framework },
    }),
  },
);

/** React with exclusive: false on framework — tests flag propagation */
export const BUILD_STEP_FRAMEWORK_NON_EXCLUSIVE_MATRIX = createMockMatrix(SKILLS.react, {
  categories: buildCategoryMap({
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      exclusive: false,
    },
  }),
});

/** React + Hono with framework + api categories — tests domain filtering */
export const BUILD_STEP_FRAMEWORK_API_MATRIX = createMockMatrix(SKILLS.react, SKILLS.hono, {
  categories: buildCategoryMap({
    "web-framework": { ...TEST_CATEGORIES.framework },
    "api-api": {
      ...TEST_CATEGORIES.api,
      domain: "api" as const,
      displayName: "API Framework",
    },
  }),
});

/** React with just framework category — tests no-match domain (returns empty for "api") */
export const BUILD_STEP_FRAMEWORK_ONLY_MATRIX = createMockMatrix(SKILLS.react, {
  categories: buildCategoryMap({
    "web-framework": { ...TEST_CATEGORIES.framework },
  }),
});

/** Local React skill with framework category — tests local flag propagation */
export const BUILD_STEP_LOCAL_SKILL_MATRIX = createMockMatrix(REACT_LOCAL, {
  categories: buildCategoryMap({
    "web-framework": { ...TEST_CATEGORIES.framework },
  }),
});

/** React (non-local) with framework category — tests non-local skills have local undefined */
export const BUILD_STEP_NON_LOCAL_MATRIX = createMockMatrix(SKILLS.react, {
  categories: buildCategoryMap({
    "web-framework": { ...TEST_CATEGORIES.framework },
  }),
});

/** React with custom displayName on framework category — tests displayName propagation */
export const BUILD_STEP_DISPLAY_NAME_MATRIX = createMockMatrix(SKILLS.react, {
  categories: buildCategoryMap({
    "web-framework": {
      ...TEST_CATEGORIES.framework,
      displayName: "Web Framework",
    },
  }),
});

/** React + Zustand + SCSS with 3 categories and custom order values — tests sorting */
export const BUILD_STEP_SORTING_MATRIX = createMockMatrix(
  SKILLS.react,
  SKILLS.zustand,
  SKILLS.scss,
  {
    categories: buildCategoryMap({
      "web-client-state": {
        ...TEST_CATEGORIES.clientState,
        displayName: "State Management",
        order: 10,
      },
      "web-framework": { ...TEST_CATEGORIES.framework, order: 5 },
      "web-styling": { ...TEST_CATEGORIES.styling, order: 1 },
    }),
  },
);

/** React/Vue conflicts in exclusive framework category — tests incompatible suppression */
export const BUILD_STEP_CONFLICTS_EXCLUSIVE_MATRIX = createMockMatrix(
  REACT_CONFLICTS_VUE,
  VUE_CONFLICTS_REACT,
  {
    categories: buildCategoryMap({
      "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
    }),
  },
);

/** Zustand/Pinia conflicts in non-exclusive state category — tests preserved incompatibility */
export const BUILD_STEP_CONFLICTS_NON_EXCLUSIVE_MATRIX = createMockMatrix(
  ZUSTAND_CONFLICTS_PINIA,
  PINIA_CONFLICTS_ZUSTAND,
  {
    categories: buildCategoryMap({
      "web-client-state": {
        ...TEST_CATEGORIES.clientState,
        displayName: "State Management",
        exclusive: false,
      },
    }),
  },
);

/** Discouraging Vue + SCSS — tests preserved advisory states in exclusive categories */
export const BUILD_STEP_ADVISORY_STATES_MATRIX = createMockMatrix(
  SKILLS.react,
  VUE_DISCOURAGES_SCSS,
  SKILLS.scss,
  {
    categories: buildCategoryMap({
      "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
      "web-styling": { ...TEST_CATEGORIES.styling },
    }),
  },
);
