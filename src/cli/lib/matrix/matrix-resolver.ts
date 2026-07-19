import { groupBy } from "remeda";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import type {
  CategoryPath,
  OptionState,
  ResolvedSkill,
  SelectionValidation,
  SkillId,
  SkillOption,
  Category,
  ValidationError,
  ValidationWarning,
} from "../../types";
import { typedEntries } from "../../utils/typed-object";
import { matrix, getSkillById, allSkills } from "./matrix-provider";

function getLabel(skill: Pick<ResolvedSkill, "displayName">): string {
  return skill.displayName;
}

function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type SelectionContext = {
  resolvedSelections: SkillId[];
  selectedSet: Set<SkillId>;
};

function initializeSelectionContext(currentSelections: SkillId[]): SelectionContext {
  const resolvedSelections = currentSelections.map((s) => getSkillById(s).id);
  const selectedSet = new Set<SkillId>(resolvedSelections);
  return { resolvedSelections, selectedSet };
}

/**
 * Finds all currently selected skills that depend on the given skill.
 *
 * A skill is considered dependent if it has a requirement that would become
 * unsatisfied by removing `skillId`. For `needsAny` requirements, the skill
 * is only dependent if `skillId` is the sole remaining option satisfying
 * that requirement.
 *
 * @param skillId - The skill to check dependents for (resolved via alias lookup)
 * @param currentSelections - Currently selected skill IDs in the wizard
 * @returns Skill IDs that would lose a required dependency if `skillId` were removed
 */
export function getDependentSkills(skillId: SkillId, currentSelections: SkillId[]): SkillId[] {
  getSkillById(skillId); // assert the id exists in the matrix

  const { resolvedSelections, selectedSet } = initializeSelectionContext(currentSelections);
  return resolvedSelections.filter(
    (selectedId) =>
      selectedId !== skillId &&
      getSkillById(selectedId).requires.some((req) =>
        wouldLoseRequirement(req, skillId, selectedSet),
      ),
  );
}

type SkillRequirement = ResolvedSkill["requires"][number];

/** OR (`needsAny`): met when ANY option is selected. AND: met when EVERY id is selected. */
function isRequirementMet(req: SkillRequirement, selectedSet: ReadonlySet<SkillId>): boolean {
  return req.needsAny
    ? req.skillIds.some((id) => selectedSet.has(id))
    : req.skillIds.every((id) => selectedSet.has(id));
}

/** Ids blocking the requirement: every option for an unmet OR, the absent ids for an AND. */
function missingRequirementIds(
  req: SkillRequirement,
  selectedSet: ReadonlySet<SkillId>,
): SkillId[] {
  if (isRequirementMet(req, selectedSet)) return [];
  return req.needsAny ? [...req.skillIds] : req.skillIds.filter((id) => !selectedSet.has(id));
}

/**
 * True when removing `removedId` would leave this requirement unsatisfied:
 * for OR it must be the sole remaining satisfier; for AND, any required id.
 */
function wouldLoseRequirement(
  req: SkillRequirement,
  removedId: SkillId,
  selectedSet: ReadonlySet<SkillId>,
): boolean {
  if (req.needsAny) {
    const satisfied = req.skillIds.filter((id) => selectedSet.has(id));
    return satisfied.length === 1 && satisfied[0] === removedId;
  }
  return req.skillIds.includes(removedId);
}

/**
 * For an unselected skill, finds the first selected skill that needs it
 * and whose requirement is currently unmet. Returns the dependent's display name,
 * or undefined if no selected skill has an unmet need for this skill.
 */
export function getUnmetRequiredBy(
  skillId: SkillId,
  currentSelections: SkillId[],
): string | undefined {
  getSkillById(skillId); // assert the id exists in the matrix
  const { resolvedSelections, selectedSet } = initializeSelectionContext(currentSelections);

  if (selectedSet.has(skillId)) return undefined;

  for (const selectedId of resolvedSelections) {
    const selectedSkill = matrix.skills[selectedId];
    if (!selectedSkill) continue;

    for (const req of selectedSkill.requires) {
      if (!req.skillIds.includes(skillId)) continue;

      if (req.needsAny) {
        // OR: unmet only if NONE of the options are selected
        if (!req.skillIds.some((id) => selectedSet.has(id))) {
          return selectedSkill.displayName;
        }
      } else {
        // AND: unmet if this specific skill isn't selected
        return selectedSkill.displayName;
      }
    }
  }

  return undefined;
}

/**
 * Determines whether a skill should be discouraged (shown with yellow warning)
 * in the wizard given the current selection state.
 *
 * A skill is discouraged when it has a `discourages` relationship with a
 * currently selected skill (bidirectional check).
 *
 * @param skillId - The skill to check (resolved via alias lookup)
 * @param currentSelections - Currently selected skill IDs
 * @returns true if the skill should show a discouraged warning
 */
export function isDiscouraged(skillId: SkillId, currentSelections: SkillId[]): boolean {
  return getDiscourageReason(skillId, currentSelections) !== undefined;
}

/**
 * Determines whether a skill is incompatible with the current selection state
 * (shown with red warning). Checks conflictsWith relationships and also
 * detects unsatisfiable requires (all required dependencies conflict with selections).
 *
 * @param skillId - The skill to check (resolved via alias lookup)
 * @param currentSelections - Currently selected skill IDs
 * @returns true if the skill has conflicts with current selections
 */
export function isIncompatible(skillId: SkillId, currentSelections: SkillId[]): boolean {
  return getIncompatibleReason(skillId, currentSelections) !== undefined;
}

/** True if the skill directly conflicts with any selected skill (bidirectional). */
function hasDirectConflict(skill: ResolvedSkill, selections: SkillId[]): boolean {
  return selections.some(
    (selectedId) =>
      skill.conflictsWith.some((c) => c.skillId === selectedId) ||
      matrix.skills[selectedId]?.conflictsWith.some((c) => c.skillId === skill.id),
  );
}

/** True if a dependency skill directly conflicts with any selected skill. */
function isDepBlockedByConflict(depId: SkillId, selections: SkillId[]): boolean {
  const depSkill = matrix.skills[depId];
  return depSkill ? hasDirectConflict(depSkill, selections) : false;
}

/**
 * True when the skill has no compatibleWith constraints (universal) or shares
 * one with the current selections.
 */
export function isCompatibleWithSelections(skill: ResolvedSkill, selectedIds: SkillId[]): boolean {
  return (
    skill.compatibleWith.length === 0 || selectedIds.some((id) => skill.compatibleWith.includes(id))
  );
}

/**
 * True if the skill declares compatibleWith frameworks and none of
 * them are in the current selections. Empty compatibleWith = universal.
 * e.g. Zustand is compatible with [react, nextjs, remix] — incompatible when Svelte is selected.
 */
function isIncompatibleByFramework(skill: ResolvedSkill, selections: SkillId[]): boolean {
  return selections.length > 0 && !isCompatibleWithSelections(skill, selections);
}

/**
 * Checks if a selected skill has unmet dependency requirements.
 * Only meaningful for skills that are currently selected.
 */
export function hasUnmetRequirements(skillId: SkillId, currentSelections: SkillId[]): boolean {
  return getUnmetRequirementsReason(skillId, currentSelections) !== undefined;
}

/**
 * Returns a human-readable reason why a skill is discouraged, or undefined if it is not.
 *
 * Checks discourages relationships (bidirectional), returning the first matching reason.
 *
 * @param skillId - The skill to get the discourage reason for
 * @param currentSelections - Currently selected skill IDs
 * @returns Formatted reason string or undefined
 */
export function getDiscourageReason(
  skillId: SkillId,
  currentSelections: SkillId[],
): string | undefined {
  const skill = getSkillById(skillId);

  const { resolvedSelections } = initializeSelectionContext(currentSelections);

  // Check discourages relationships (bidirectional)
  for (const selectedId of resolvedSelections) {
    const selectedSkill = matrix.skills[selectedId];
    if (selectedSkill) {
      const discourage = selectedSkill.discourages.find((d) => d.skillId === skillId);
      if (discourage) {
        return discourage.reason;
      }
    }

    const reverseDiscourage = skill.discourages.find((d) => d.skillId === selectedId);
    if (reverseDiscourage) {
      return reverseDiscourage.reason;
    }
  }

  return undefined;
}

/**
 * Returns a human-readable reason why a skill is incompatible, or undefined if it is not.
 *
 * Only checks conflicts (bidirectional), returning the first matching reason.
 *
 * @param skillId - The skill to get the incompatible reason for
 * @param currentSelections - Currently selected skill IDs
 * @returns Formatted reason string or undefined
 */
export function getIncompatibleReason(
  skillId: SkillId,
  currentSelections: SkillId[],
): string | undefined {
  const skill = getSkillById(skillId);

  const { resolvedSelections } = initializeSelectionContext(currentSelections);

  // Direct conflict (bidirectional)
  const directReason = findDirectConflictReason(skill, skillId, resolvedSelections);
  if (directReason) return directReason;

  // Unsatisfiable requires — dependency blocked by conflict
  const reqReason = findUnsatisfiableRequiresReason(skill, resolvedSelections);
  if (reqReason) return reqReason;

  // Framework compatibility mismatch
  if (isIncompatibleByFramework(skill, resolvedSelections)) {
    const compatLabels = skill.compatibleWith.map((id) => getLabel(getSkillById(id))).join(", ");
    return `only compatible with ${compatLabels}`;
  }

  return undefined;
}

function findDirectConflictReason(
  skill: ResolvedSkill,
  skillId: SkillId,
  selections: SkillId[],
): string | undefined {
  for (const selectedId of selections) {
    if (skill.conflictsWith.some((c) => c.skillId === selectedId)) {
      return `conflicts with ${getLabel(getSkillById(selectedId))}`;
    }
    const selectedSkill = matrix.skills[selectedId];
    if (selectedSkill?.conflictsWith.some((c) => c.skillId === skillId)) {
      return `conflicts with ${getLabel(selectedSkill)}`;
    }
  }
  return undefined;
}

function findUnsatisfiableRequiresReason(
  skill: ResolvedSkill,
  selections: SkillId[],
): string | undefined {
  for (const req of skill.requires) {
    if (req.needsAny) {
      const allBlocked = req.skillIds.every((depId) => isDepBlockedByConflict(depId, selections));
      if (allBlocked) {
        const labels = req.skillIds.map((id) => getLabel(getSkillById(id))).join(" or ");
        return `requires ${labels} (all conflict with current selection)`;
      }
    } else {
      const blockedDep = req.skillIds.find((depId) => isDepBlockedByConflict(depId, selections));
      if (blockedDep) {
        return `requires ${getLabel(getSkillById(blockedDep))} which conflicts with current selection`;
      }
    }
  }
  return undefined;
}

/**
 * Returns a human-readable reason for unmet requirements, or undefined if all are met.
 */
export function getUnmetRequirementsReason(
  skillId: SkillId,
  currentSelections: SkillId[],
): string | undefined {
  const skill = getSkillById(skillId);

  const { selectedSet } = initializeSelectionContext(currentSelections);

  for (const requirement of skill.requires) {
    const missing = missingRequirementIds(requirement, selectedSet);
    if (missing.length === 0) continue;
    const names = missing.map((id) => {
      const s = matrix.skills[id];
      return s ? getLabel(s) : id;
    });
    return requirement.needsAny
      ? `requires ${joinWithOr(names)}`
      : `requires ${joinWithAnd(names)}`;
  }

  return undefined;
}

/**
 * Checks if a skill is recommended based on the flat recommends list
 * and compatibility with current selections.
 *
 * A skill is recommended when:
 * 1. It appears in the flat recommends list (isRecommended === true), AND
 * 2. It is compatible with the user's current selections (shares a compatibleWith
 *    group with at least one selected skill, or has no compatibility constraints)
 */
export function isRecommended(skillId: SkillId, currentSelections: SkillId[]): boolean {
  const skill = getSkillById(skillId);

  if (!skill.isRecommended) {
    return false;
  }

  // If no selections yet, isRecommended alone is sufficient
  if (currentSelections.length === 0) {
    return true;
  }

  const { resolvedSelections } = initializeSelectionContext(currentSelections);
  return isCompatibleWithSelections(skill, resolvedSelections);
}

/** Returns the reason from the flat recommends entry */
export function getRecommendReason(
  skillId: SkillId,
  _currentSelections: SkillId[],
): string | undefined {
  const skill = getSkillById(skillId);

  return skill.recommendedReason;
}

export type ValidationPartial = {
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

export function validateConflicts(resolvedSelections: SkillId[]): ValidationPartial {
  const errors: ValidationError[] = [];

  for (let i = 0; i < resolvedSelections.length; i++) {
    const skillA = matrix.skills[resolvedSelections[i]];
    if (!skillA) continue;

    for (let j = i + 1; j < resolvedSelections.length; j++) {
      const skillBId = resolvedSelections[j];
      const conflict = skillA.conflictsWith.find((c) => c.skillId === skillBId);
      if (conflict) {
        errors.push({
          type: "conflict",
          message: `${getLabel(skillA)} conflicts with ${getLabel(getSkillById(skillBId))}: ${conflict.reason}`,
          skills: [skillA.id, skillBId],
        });
      }
    }
  }

  return { errors, warnings: [] };
}

export function validateRequirements(
  resolvedSelections: SkillId[],
  selectedSet: Set<SkillId>,
): ValidationPartial {
  const errors: ValidationError[] = [];

  for (const skillId of resolvedSelections) {
    const skill = matrix.skills[skillId];
    if (!skill) continue;

    for (const requirement of skill.requires) {
      if (requirement.needsAny) {
        const hasAny = requirement.skillIds.some((reqId) => selectedSet.has(reqId));
        if (!hasAny) {
          errors.push({
            type: "missingRequirement",
            message: `${getLabel(skill)} requires one of: ${requirement.skillIds.map((id) => getLabel(getSkillById(id))).join(", ")}`,
            skills: [skillId, ...requirement.skillIds],
          });
        }
      } else {
        const missingIds = requirement.skillIds.filter((reqId) => !selectedSet.has(reqId));
        if (missingIds.length > 0) {
          errors.push({
            type: "missingRequirement",
            message: `${getLabel(skill)} requires: ${missingIds.map((id) => getLabel(getSkillById(id))).join(", ")}`,
            skills: [skillId, ...missingIds],
          });
        }
      }
    }
  }

  return { errors, warnings: [] };
}

export function validateExclusivity(resolvedSelections: SkillId[]): ValidationPartial {
  const errors: ValidationError[] = [];

  const validSkills = resolvedSelections
    .map((skillId) => ({ skillId, skill: matrix.skills[skillId] }))
    .filter((entry): entry is { skillId: SkillId; skill: ResolvedSkill } => entry.skill != null);
  const categorySelections = groupBy(validSkills, (entry) => entry.skill.category);

  for (const [categoryId, entries] of typedEntries(categorySelections)) {
    if (entries.length > 1) {
      const skillIds = entries.map((e) => e.skillId);
      // "local" is a pseudo-category without exclusivity rules
      if (categoryId === LOCAL_PSEUDO_CATEGORY) continue;
      const category = matrix.categories[categoryId];
      if (category?.exclusive) {
        errors.push({
          type: "categoryExclusive",
          message: `Category "${category.displayName}" only allows one selection, but multiple selected: ${skillIds.map((id) => getLabel(getSkillById(id))).join(", ")}`,
          skills: skillIds,
        });
      }
    }
  }

  return { errors, warnings: [] };
}

/**
 * Validates recommendations: for each recommended skill that is NOT selected
 * but IS compatible with current selections, produce a missing_recommendation warning.
 */
export function validateRecommendations(
  resolvedSelections: SkillId[],
  selectedSet: Set<SkillId>,
): ValidationPartial {
  const warnings: ValidationWarning[] = [];

  // Iterate the flat recommends list from relationships
  for (const skill of allSkills()) {
    if (!skill.isRecommended) continue;
    if (selectedSet.has(skill.id)) continue;

    if (!isCompatibleWithSelections(skill, resolvedSelections)) continue;

    // Check no conflict with current selections
    const hasConflict = skill.conflictsWith.some((c) => selectedSet.has(c.skillId));
    if (hasConflict) continue;

    warnings.push({
      type: "missing_recommendation",
      message: `${getLabel(skill)} is recommended: ${skill.recommendedReason ?? "Recommended for this stack"}`,
      skills: [skill.id],
    });
  }

  return { errors: [], warnings };
}

function mergeValidationResults(results: ValidationPartial[]): ValidationPartial {
  return {
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}

/**
 * Validates a complete set of skill selections against all matrix constraints.
 *
 * Runs four validation passes:
 * 1. **Conflicts** - Checks for mutually exclusive skill pairs (errors)
 * 2. **Requirements** - Checks that all required dependencies are selected (errors)
 * 3. **Exclusivity** - Checks that exclusive categories have at most one selection (errors)
 * 4. **Recommendations** - Checks for missing recommended companion skills (warnings)
 *
 * @param selections - Complete list of selected skill IDs to validate
 * @returns Validation result with `valid` flag, error list, and warning list
 */
export function validateSelection(selections: SkillId[]): SelectionValidation {
  const { resolvedSelections, selectedSet } = initializeSelectionContext(selections);

  const { errors, warnings } = mergeValidationResults([
    validateConflicts(resolvedSelections),
    validateRequirements(resolvedSelections, selectedSet),
    validateExclusivity(resolvedSelections),
    validateRecommendations(resolvedSelections, selectedSet),
  ]);

  return {
    valid: true,
    errors,
    warnings,
  };
}

function computeAdvisoryState(skillId: SkillId, currentSelections: SkillId[]): OptionState {
  // Priority: incompatible > discouraged > recommended > normal
  const incompatibleReason = getIncompatibleReason(skillId, currentSelections);
  if (incompatibleReason !== undefined) {
    return { status: "incompatible", reason: incompatibleReason };
  }
  const discourageReason = getDiscourageReason(skillId, currentSelections);
  if (discourageReason !== undefined) {
    return { status: "discouraged", reason: discourageReason };
  }
  if (isRecommended(skillId, currentSelections)) {
    return {
      status: "recommended",
      reason: getRecommendReason(skillId, currentSelections) ?? "Recommended",
    };
  }
  return { status: "normal" };
}

/**
 * Builds a list of skill options for a category, annotated with their current
 * advisory state relative to the wizard's selection state.
 *
 * Each skill is checked against the current selections to determine its visual
 * state in the wizard UI. States are prioritized:
 * incompatible > discouraged > recommended > normal.
 *
 * @param categoryId - Category path to filter skills by
 * @param currentSelections - Currently selected skill IDs
 * @returns Array of skill options with advisory state annotations
 */
export function getAvailableSkills(
  categoryId: CategoryPath,
  currentSelections: SkillId[],
): SkillOption[] {
  const { selectedSet } = initializeSelectionContext(currentSelections);

  return getSkillsByCategory(categoryId).map((skill) => {
    const isSelected = selectedSet.has(skill.id);
    return {
      id: skill.id,
      advisoryState: computeAdvisoryState(skill.id, currentSelections),
      selected: isSelected,
      hasUnmetRequirements: isSelected && hasUnmetRequirements(skill.id, currentSelections),
      unmetRequirementsReason: isSelected
        ? getUnmetRequirementsReason(skill.id, currentSelections)
        : undefined,
      alternatives: skill.alternatives.map((a) => a.skillId),
    };
  });
}

/** Returns all resolved skills belonging to the given category. */
export function getSkillsByCategory(categoryId: CategoryPath): ResolvedSkill[] {
  return allSkills().filter((skill) => skill.category === categoryId);
}
