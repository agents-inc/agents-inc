import { warn } from "../../utils/logger";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import type {
  CategoryDefinition,
  MergedSkillsMatrix,
  ResolvedSkill,
  SkillId,
  Category,
} from "../../types";
import { typedEntries } from "../../utils/typed-object";

export type MatrixHealthIssue = {
  severity: "warning" | "error";
  finding: string;
  details: string;
};

export function checkMatrixHealth(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  const issues = [
    ...checkCategoryDomains(matrix),
    ...checkSkillCategories(matrix),
    ...checkSkillRelationRefs(matrix),
  ];

  for (const issue of issues) {
    warn(`[matrix] ${issue.details}`);
  }

  return issues;
}

// Categories without a domain won't appear in any wizard domain view
function checkCategoryDomains(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<Category, CategoryDefinition>(matrix.categories)
    .filter(([, cat]) => cat !== undefined && !cat.domain)
    .map(([catId]) => ({
      severity: "warning" as const,
      finding: "category-missing-domain",
      details: `Category '${catId}' has no domain — it won't appear in any wizard domain view`,
    }));
}

function checkSkillCategories(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(
      ([, skill]) =>
        skill !== undefined &&
        // "local" is a pseudo-category that won't exist in matrix.categories — skip it
        skill.category !== LOCAL_PSEUDO_CATEGORY &&
        !matrix.categories[skill.category],
    )
    .map(([skillId, skill]) => ({
      severity: "warning" as const,
      finding: "skill-unknown-category",
      details: `Skill '${skillId}' references category '${skill.category}' which does not exist in the matrix`,
    }));
}

/** Every outgoing relation reference on a skill, tagged with the field it came from. */
function relationRefs(skill: ResolvedSkill): Array<{ field: string; ref: SkillId }> {
  return [
    ...skill.compatibleWith.map((ref) => ({ field: "compatibleWith", ref })),
    ...skill.conflictsWith.map((relation) => ({ field: "conflictsWith", ref: relation.skillId })),
    ...skill.requires.flatMap((requirement) =>
      requirement.skillIds.map((ref) => ({ field: "requires", ref })),
    ),
  ];
}

function checkSkillRelationRefs(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills).flatMap(([skillId, skill]) =>
    skill === undefined
      ? []
      : relationRefs(skill)
          .filter(({ ref }) => !matrix.skills[ref])
          .map(({ field, ref }) => ({
            severity: "warning" as const,
            finding: "skill-unresolved-relation-ref",
            details: `Skill '${skillId}' has unresolved reference '${ref}' in '${field}'`,
          })),
  );
}
