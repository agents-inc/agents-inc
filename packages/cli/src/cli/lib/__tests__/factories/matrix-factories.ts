import type {
  Category,
  CategoryDefinition,
  MergedSkillsMatrix,
  RelationshipDefinitions,
  ResolvedSkill,
  SkillId,
  SkillSlug,
} from "../../../types";
import type { TestSkill } from "../fixtures/create-test-source";
import { testSkillToResolvedSkill } from "./skill-factories.js";

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
  return {
    version: "1.0.0",
    categories: {},
    skills: skillsRecord,
    suggestedStacks: [],
    slugMap: { slugToId: autoSlugToId },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
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
