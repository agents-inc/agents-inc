import {
  createSelectionSemantics,
  type IncompatibilityCause,
  type SelectionCatalogFacts,
  type SelectionJudgement,
  type SelectionSemantics,
} from "@workspace/matrix";
import { groupBy } from "remeda";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import type {
  CategoryPath,
  MergedSkillsMatrix,
  OptionState,
  ResolvedSkill,
  SelectionValidation,
  SkillId,
  SkillOption,
  ValidationError,
} from "../../types";
import { typedEntries, typedValues } from "../../utils/typed-object";
import { matrix, getSkillById, allSkills } from "./matrix-provider";

function getLabel(skill: Pick<ResolvedSkill, "displayName">): string {
  return skill.displayName;
}

function joinWithConjunction(items: string[], conjunction: "or" | "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
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
 * The relationship facts the shared selection semantics judge — id, category,
 * conflicts, discourages and requires. Exclusivity defaults to true for a
 * category that does not say, matching the wizard grid's own reading; the
 * `local` pseudo-category is never listed, so it stays non-exclusive here as it
 * does in `validateExclusivity`.
 */
function toSelectionFacts(source: MergedSkillsMatrix): SelectionCatalogFacts {
  return {
    skills: typedValues(source.skills).map((skill) => ({
      id: skill.id,
      categoryId: skill.category,
      conflictsWith: skill.conflictsWith.map((relation) => relation.skillId),
      discourages: skill.discourages.map((relation) => ({
        skillId: relation.skillId,
        reason: relation.reason,
      })),
      requires: skill.requires.map((requirement) => ({
        skillIds: requirement.skillIds,
        needsAny: requirement.needsAny,
      })),
    })),
    exclusiveCategoryIds: new Set(
      typedValues(source.categories)
        .filter((category) => category.exclusive !== false)
        .map((category) => category.id),
    ),
  };
}

// Rebound whenever `initializeMatrix` swaps the matrix, so the semantics
// always judge the catalogue currently loaded — merged local skills included.
let boundSemantics: SelectionSemantics | undefined;
let boundTo: MergedSkillsMatrix | undefined;

function judgeSelections(resolvedSelections: SkillId[]): SelectionJudgement {
  if (!boundSemantics || boundTo !== matrix) {
    boundSemantics = createSelectionSemantics(toSelectionFacts(matrix));
    boundTo = matrix;
  }
  return boundSemantics(resolvedSelections);
}

// The judgement speaks in ids; this surface answers in the wizard's words.
function renderIncompatibility(cause: IncompatibilityCause): string {
  switch (cause.kind) {
    case "conflict":
      return `conflicts with ${labelOf(cause.skillId)}`;
    case "unreachableRequirement": {
      if (cause.requirement.needsAny) {
        const labels = cause.requirement.skillIds.map(labelOf);
        return `requires ${joinWithConjunction(labels, "or")} (all conflict with current selection)`;
      }
      const lostLabels = cause.lostIds.map(labelOf);
      return `requires ${joinWithConjunction(lostLabels, "and")} which conflicts with current selection`;
    }
  }
}

function labelOf(skillId: string): string {
  // Boundary cast: every id inside a cause was read out of the matrix's own
  // relationship tables, so it names a skill the matrix holds.
  return getLabel(getSkillById(skillId as SkillId));
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

  return judgeSelections(resolvedSelections).discourageReasonOf(skill.id);
}

/**
 * Returns a human-readable reason why a skill is incompatible, or undefined if it is not.
 *
 * The verdict is the shared semantics' — a bidirectional conflict with
 * anything the selection reaches, or a requirement the selection has ruled out
 * (to a fixpoint, so a lost base strands everything built on it). This is the
 * selection as it stands: the pick-one swap forgiveness belongs to the grid
 * cell and lives in {@link getCellState}.
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

  const cause = judgeSelections(resolvedSelections).incompatibilityOf(skill.id);
  return cause === undefined ? undefined : renderIncompatibility(cause);
}

/**
 * The verdict a grid cell renders, judged against the selection a click on it
 * would produce. A pick-one category is a radio group: the click drops every
 * same-category member — selected or implied — so a conflict the swap
 * resolves is forgiven, and an impossibility it leaves standing (a requirement
 * the rest of the selection has ruled out) keeps its verdict and its reason,
 * exactly as a multi-select category renders it.
 */
export function getCellState(skillId: SkillId, currentSelections: SkillId[]): OptionState {
  const skill = getSkillById(skillId);
  const { resolvedSelections } = initializeSelectionContext(currentSelections);

  const verdict = judgeSelections(resolvedSelections).verdictOf(skill.id);
  return verdict.status === "incompatible"
    ? { status: "incompatible", reason: renderIncompatibility(verdict.cause) }
    : verdict;
}

/**
 * Everything the selection is necessarily built on without having been picked:
 * the requires-closure minus the selection itself. Choosing Next.js is
 * choosing React whether or not React was ever clicked; a requirement
 * offering a choice commits the user to none of its options.
 */
export function getImpliedSkills(currentSelections: SkillId[]): SkillId[] {
  const { resolvedSelections } = initializeSelectionContext(currentSelections);

  // Boundary cast: the closure only ever adds ids read from the matrix's own
  // `requires` tables, which type them as SkillId.
  return judgeSelections(resolvedSelections).implied as SkillId[];
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
      ? `requires ${joinWithConjunction(names, "or")}`
      : `requires ${joinWithConjunction(names, "and")}`;
  }

  return undefined;
}

/**
 * `{ unmetRequirementsReason }` only when there is one to state — an unselected skill,
 * or a selected skill whose requirements are all met, carries no key at all.
 */
function unmetRequirementsReasonFor(
  isSelected: boolean,
  skillId: SkillId,
  currentSelections: SkillId[],
): { unmetRequirementsReason?: string } {
  if (!isSelected) return {};
  const reason = getUnmetRequirementsReason(skillId, currentSelections);
  return reason === undefined ? {} : { unmetRequirementsReason: reason };
}

export function validateConflicts(resolvedSelections: SkillId[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [index, skillAId] of resolvedSelections.entries()) {
    const skillA = matrix.skills[skillAId];
    if (!skillA) continue;

    for (const skillBId of resolvedSelections.slice(index + 1)) {
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

  return errors;
}

export function validateRequirements(
  resolvedSelections: SkillId[],
  selectedSet: Set<SkillId>,
): ValidationError[] {
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

  return errors;
}

export function validateExclusivity(resolvedSelections: SkillId[]): ValidationError[] {
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

  return errors;
}

/**
 * Validates a complete set of skill selections against all matrix constraints.
 *
 * Runs three validation passes:
 * 1. **Conflicts** - Checks for mutually exclusive skill pairs (errors)
 * 2. **Requirements** - Checks that all required dependencies are selected (errors)
 * 3. **Exclusivity** - Checks that exclusive categories have at most one selection (errors)
 *
 * `valid` is derived from `errors` rather than asserted: a literal `true` beside a populated
 * `errors` array is a comment with a type annotation, and the first `if (validation.valid)`
 * written against it would pass on every rejected selection there is.
 *
 * @param selections - Complete list of selected skill IDs to validate
 * @returns Validation result with `valid` flag and error list
 */
export function validateSelection(selections: SkillId[]): SelectionValidation {
  const { resolvedSelections, selectedSet } = initializeSelectionContext(selections);

  const errors = [
    ...validateConflicts(resolvedSelections),
    ...validateRequirements(resolvedSelections, selectedSet),
    ...validateExclusivity(resolvedSelections),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}

function advisoryStateFrom(judgement: SelectionJudgement, skillId: SkillId): OptionState {
  // Priority: incompatible > discouraged > normal
  const cause = judgement.incompatibilityOf(skillId);
  if (cause !== undefined) {
    return { status: "incompatible", reason: renderIncompatibility(cause) };
  }
  const discourageReason = judgement.discourageReasonOf(skillId);
  if (discourageReason !== undefined) {
    return { status: "discouraged", reason: discourageReason };
  }
  return { status: "normal" };
}

/**
 * Builds a list of skill options for a category, annotated with their current
 * advisory state relative to the wizard's selection state.
 *
 * Each skill is checked against the current selections to determine its visual
 * state in the wizard UI. States are prioritized:
 * incompatible > discouraged > normal.
 *
 * @param categoryId - Category path to filter skills by
 * @param currentSelections - Currently selected skill IDs
 * @returns Array of skill options with advisory state annotations
 */
export function getAvailableSkills(
  categoryId: CategoryPath,
  currentSelections: SkillId[],
): SkillOption[] {
  const { resolvedSelections, selectedSet } = initializeSelectionContext(currentSelections);
  const judgement = judgeSelections(resolvedSelections);

  return getSkillsByCategory(categoryId).map((skill) => {
    const isSelected = selectedSet.has(skill.id);
    return {
      id: skill.id,
      advisoryState: advisoryStateFrom(judgement, skill.id),
      selected: isSelected,
      hasUnmetRequirements: isSelected && hasUnmetRequirements(skill.id, currentSelections),
      ...unmetRequirementsReasonFor(isSelected, skill.id, currentSelections),
      alternatives: skill.alternatives.map((a) => a.skillId),
    };
  });
}

/** Returns all resolved skills belonging to the given category. */
export function getSkillsByCategory(categoryId: CategoryPath): ResolvedSkill[] {
  return allSkills().filter((skill) => skill.category === categoryId);
}
