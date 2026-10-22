import { warn } from "../../utils/logger";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import type {
  CategoryDefinition,
  CategoryPath,
  MergedSkillsMatrix,
  ResolvedSkill,
  SkillId,
  Category,
} from "../../types";
import { isSkillId } from "../../utils/type-guards";
import { typedEntries } from "../../utils/typed-object";
import { skillAudit, auditVerdictsPendingApply } from "../configuration/skill-audit";
import type { SkillAuditEntry } from "../configuration/skill-audit";

/** A closed union: callers branch on a kind, so a misspelling must be a compile error. */
type MatrixHealthFinding =
  | "category-missing-domain"
  | "skill-unknown-category"
  | "skill-unresolved-relation-ref"
  | "rule-unresolved-slug"
  | "audit-verdict-contradiction"
  | "skill-unaudited";

export type MatrixHealthIssue = {
  severity: "warning" | "error";
  finding: MatrixHealthFinding;
  details: string;
};

/** What the health check finds in `matrix`, said to nobody. */
export function matrixHealthIssues(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return [
    ...checkCategoryDomains(matrix),
    ...checkSkillCategories(matrix),
    ...checkSkillRelationRefs(matrix),
    ...checkUnresolvedRuleSlugs(matrix),
    ...checkAuditVerdictContradictions(matrix),
    ...checkUnauditedSkills(matrix),
  ];
}

/** Warns each issue; callers that only file them use `matrixHealthIssues`. */
export function checkMatrixHealth(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  const issues = matrixHealthIssues(matrix);

  for (const issue of issues) {
    warn(`[matrix] ${issue.details}`);
  }

  return issues;
}

function checkCategoryDomains(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return (
    typedEntries<Category, CategoryDefinition>(matrix.categories)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      .filter(([, cat]) => cat !== undefined && !cat.domain)
      .map(([catId]) => ({
        severity: "warning" as const,
        finding: "category-missing-domain",
        details: `Category '${catId}' has no domain — it won't appear under any domain`,
      }))
  );
}

function checkSkillCategories(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(
      ([, skill]) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
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

function relationRefs(skill: ResolvedSkill): Array<{ field: string; ref: SkillId }> {
  return [
    ...skill.conflictsWith.map((relation) => ({ field: "conflictsWith", ref: relation.skillId })),
    ...skill.requires.flatMap((requirement) =>
      requirement.skillIds.map((ref) => ({ field: "requires", ref })),
    ),
  ];
}

function checkSkillRelationRefs(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills).flatMap(([skillId, skill]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
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

/** An `error`: the source's defect. `source-validator` downgrades it for consumers. */
function checkUnresolvedRuleSlugs(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return (matrix.unresolvedSlugs ?? []).map((slug) => ({
    severity: "error" as const,
    finding: "rule-unresolved-slug",
    details: `Unresolved slug '${slug}' in the relationship rules — no skill carries it, so every rule naming it states nothing`,
  }));
}

function isExclusiveCategory(matrix: MergedSkillsMatrix, category: CategoryPath): boolean {
  // "local" is a pseudo-category with no definition in matrix.categories — never a fence
  if (category === LOCAL_PSEUDO_CATEGORY) return false;

  const definition = matrix.categories[category];
  return definition !== undefined && definition.exclusive;
}

/** The one definition of fenced that the runtime check and the manifest test share. */
export function isFencedByMatrix(matrix: MergedSkillsMatrix, skillId: SkillId): boolean {
  const skill = matrix.skills[skillId];
  if (skill === undefined) return false;

  return skill.requires.length > 0 || isExclusiveCategory(matrix, skill.category);
}

/** Runtime lookup: the manifest is total over built-ins, but a matrix may carry source skills. */
function auditEntryFor(skillId: SkillId): SkillAuditEntry | undefined {
  return Object.hasOwn(skillAudit, skillId) ? skillAudit[skillId] : undefined;
}

function fenceDescription(skill: ResolvedSkill): string {
  if (skill.requires.length > 0) return "it carries a 'requires' rule";
  return `its category '${skill.category}' is exclusive`;
}

/** A `universal` verdict contradicts a `requires` rule or exclusive category; pending exempt. */
function checkAuditVerdictContradictions(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(([skillId, skill]) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      if (skill === undefined || auditVerdictsPendingApply[skillId]) return false;
      const audit = auditEntryFor(skillId);

      return audit?.verdict === "universal" && isFencedByMatrix(matrix, skillId);
    })
    .map(([skillId, skill]) => ({
      severity: "error" as const,
      finding: "audit-verdict-contradiction",
      details: `Skill '${skillId}' is audited 'universal' but ${fenceDescription(skill)}`,
    }));
}

/** Built-in ids only: marketplace and local skills are outside the manifest by construction. */
function checkUnauditedSkills(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(
      ([skillId, skill]) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
        skill !== undefined &&
        !skill.local &&
        isSkillId(skillId) &&
        auditEntryFor(skillId) === undefined,
    )
    .map(([skillId]) => ({
      severity: "warning" as const,
      finding: "skill-unaudited",
      details: `Skill '${skillId}' has no audit verdict — the built-in audit manifest is missing an entry it is meant to carry`,
    }));
}
