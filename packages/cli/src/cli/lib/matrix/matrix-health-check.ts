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
import { typedEntries } from "../../utils/typed-object";
import { skillAudit, auditVerdictsPendingApply } from "../configuration/skill-audit";
import type { SkillAuditEntry } from "../configuration/skill-audit";

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
    ...checkAuditVerdictContradictions(matrix),
    ...checkUnauditedSkills(matrix),
  ];

  for (const issue of issues) {
    warn(`[matrix] ${issue.details}`);
  }

  return issues;
}

// Categories without a domain won't appear in any wizard domain view
function checkCategoryDomains(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return (
    typedEntries<Category, CategoryDefinition>(matrix.categories)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      .filter(([, cat]) => cat !== undefined && !cat.domain)
      .map(([catId]) => ({
        severity: "warning" as const,
        finding: "category-missing-domain",
        details: `Category '${catId}' has no domain — it won't appear in any wizard domain view`,
      }))
  );
}

function checkSkillCategories(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(
      ([, skill]) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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
    ...skill.conflictsWith.map((relation) => ({ field: "conflictsWith", ref: relation.skillId })),
    ...skill.requires.flatMap((requirement) =>
      requirement.skillIds.map((ref) => ({ field: "requires", ref })),
    ),
  ];
}

function checkSkillRelationRefs(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills).flatMap(([skillId, skill]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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

function isExclusiveCategory(matrix: MergedSkillsMatrix, category: CategoryPath): boolean {
  // "local" is a pseudo-category with no definition in matrix.categories — never a fence
  if (category === LOCAL_PSEUDO_CATEGORY) return false;

  const definition = matrix.categories[category];
  return definition !== undefined && definition.exclusive;
}

/**
 * The one definition of "this skill is fenced" that the audit's two enforcement points — the
 * runtime contradiction check below and the manifest consistency test — must agree on. Post
 * decision 2 the only fences left are category exclusivity and `requires`.
 */
export function isFencedByMatrix(matrix: MergedSkillsMatrix, skillId: SkillId): boolean {
  const skill = matrix.skills[skillId];
  if (skill === undefined) return false;

  return skill.requires.length > 0 || isExclusiveCategory(matrix, skill.category);
}

/** Runtime lookup: the manifest is total over built-ins, but a matrix may carry source skills. */
function auditEntryFor(skillId: SkillId): SkillAuditEntry | undefined {
  return Object.hasOwn(skillAudit, skillId) ? skillAudit[skillId] : undefined;
}

function fenceDescription(matrix: MergedSkillsMatrix, skill: ResolvedSkill): string {
  if (skill.requires.length > 0) return "it carries a 'requires' rule";
  return `its category '${skill.category}' is exclusive`;
}

/**
 * A `universal` verdict claims the skill is selectable beside anything; a `requires` rule or an
 * exclusive category says the opposite. Both cannot be true, so the pair is a contradiction and
 * the audit trail would be lying. Rows in `auditVerdictsPendingApply` are exempt — their verdict
 * was recorded ahead of a category disposition that has not landed yet.
 */
function checkAuditVerdictContradictions(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(([skillId, skill]) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      if (skill === undefined || auditVerdictsPendingApply[skillId]) return false;
      const audit = auditEntryFor(skillId);

      return audit?.verdict === "universal" && isFencedByMatrix(matrix, skillId);
    })
    .map(([skillId, skill]) => ({
      severity: "error" as const,
      finding: "audit-verdict-contradiction",
      details: `Skill '${skillId}' is audited 'universal' but ${fenceDescription(matrix, skill)}`,
    }));
}

/**
 * Built-ins are covered exhaustively at compile time by `Record<SkillId, SkillAuditEntry>`, so
 * anything the matrix carries without an entry came from a source and has never been audited.
 * Local skills are the user's own and are deliberately out of scope.
 */
function checkUnauditedSkills(matrix: MergedSkillsMatrix): MatrixHealthIssue[] {
  return typedEntries<SkillId, ResolvedSkill>(matrix.skills)
    .filter(
      ([skillId, skill]) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
        skill !== undefined && !skill.local && auditEntryFor(skillId) === undefined,
    )
    .map(([skillId]) => ({
      severity: "warning" as const,
      finding: "skill-unaudited",
      details: `Skill '${skillId}' has no audit verdict — source-provided skills are outside the built-in audit manifest`,
    }));
}
