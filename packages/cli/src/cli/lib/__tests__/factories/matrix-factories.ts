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

/** `toResolvedOverrides` carries per-skill fields (e.g. `author`) the derivation would default. */
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

/** Boundary cast: fixtures supply a partial map with partial values (e.g. `{ domain }`). */
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
    skillsRecord = {};
  } else if (
    "id" in skillsOrFirstSkill &&
    typeof (skillsOrFirstSkill as ResolvedSkill).id === "string" &&
    "slug" in skillsOrFirstSkill
  ) {
    // Spread form: createMockMatrix(skill1, skill2, ..., overrides?)
    const allArgs = [skillsOrFirstSkill, ...rest];
    const lastArg = allArgs[allArgs.length - 1];

    // The last arg is overrides when it lacks the skill shape.
    const hasOverrides = lastArg !== undefined && !("id" in lastArg && "slug" in lastArg);
    overrides = hasOverrides ? lastArg : undefined;
    const skills = (hasOverrides ? allArgs.slice(0, -1) : allArgs) as ResolvedSkill[];
    skillsRecord = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
  } else {
    // Record form: createMockMatrix({ "id": skill }, overrides?)
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
