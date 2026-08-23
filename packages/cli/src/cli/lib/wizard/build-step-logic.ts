import { sortBy } from "remeda";
import { typedValues } from "../../utils/typed-object.js";
import type { CategorySelections, Domain, SkillId } from "../../types/index.js";
import type { SkillConfig } from "../../types/config.js";
import { getAvailableSkills, getCellState, getUnmetRequiredBy } from "../matrix/index.js";
import { matrix, getSkillById } from "../matrix/matrix-provider.js";
import { deriveScopeBadges } from "./scope-diff.js";
import type { CategoryRow, CategoryOption } from "../../components/wizard/category-grid.js";

/**
 * Whether every required category on the build grid holds a selection — and, when one does not,
 * the single sentence naming it.
 *
 * A union rather than a `boolean` beside an optional `message`, because the shape it replaced
 * answered `valid: true` on BOTH branches. That is the same defect `validateSelection` in
 * `matrix/matrix-resolver.ts` carries a note against: a literal `true` beside a populated message
 * is a comment with a type annotation, and the first `if (validation.valid)` written over it
 * takes the happy path on every failure there is. The union makes "invalid" and "carries a
 * message" one fact, so neither half can be stated without the other.
 */
export type BuildStepValidation = { valid: true } | { valid: false; message: string };

/**
 * ADVISORY, and deliberately so — `valid: false` names an empty required category, it does not
 * refuse to leave the step.
 *
 * Every other validation the wizard runs is advisory: `validateSelection` reports genuine
 * conflicts, unmet requirements and exclusivity breaches, `ValidationError` is typed as
 * non-blocking, and `BaseCommand.reportValidationErrors` prints the lot as warnings that no exit
 * code turns on. Blocking here would make the mildest constraint the only fatal one, and it would
 * strand anyone who opened a domain to reach a skill in one of its OPTIONAL categories — the
 * required row would have no bearing on what they came for and no way past it but ESC.
 *
 * The first empty required category is the whole answer: the toast that carries it paints one
 * row, and the next press reports the next one.
 */
export function validateBuildStep(
  categories: CategoryRow[],
  selections: CategorySelections,
): BuildStepValidation {
  const emptyRequired = categories.find(
    (category) => category.required && !selections[category.id]?.length,
  );
  if (!emptyRequired) return { valid: true };

  return {
    valid: false,
    message: `No skills selected in ${emptyRequired.displayName} (required category)`,
  };
}

// Build CategoryRow[] from matrix for a domain
export function buildCategoriesForDomain(
  domain: Domain,
  allSelections: SkillId[],
  installedSkillIds?: SkillId[],
  skillConfigs?: SkillConfig[],
): CategoryRow[] {
  const categories = sortBy(
    typedValues(matrix.categories).filter((cat) => cat.domain === domain),
    (cat) => cat.order,
  );

  const categoryRows: CategoryRow[] = categories.map((cat) => {
    const skillOptions = getAvailableSkills(cat.id, allSelections);

    // Sort options by displayName so the grid order is deterministic across
    // machines and source types (readdir/insertion order is otherwise unstable).
    // Lowercased ordinal comparison keeps the order locale-independent.
    const sortedOptions = sortBy(skillOptions, (skill) =>
      getSkillById(skill.id).displayName.toLowerCase(),
    );

    const options: CategoryOption[] = sortedOptions.map((skill) => {
      const activeConfig = skillConfigs?.find((sc) => sc.id === skill.id && !sc.excluded);
      const excludedConfig = skillConfigs?.find((sc) => sc.id === skill.id && sc.excluded);
      const { secondaryScope } = deriveScopeBadges(activeConfig, excludedConfig);
      const local = getSkillById(skill.id).local;
      const requiredBy = skill.selected ? undefined : getUnmetRequiredBy(skill.id, allSelections);
      return {
        id: skill.id,
        // The cell verdict, not the raw advisory: inside a pick-one category
        // the shared semantics forgive what the swap resolves.
        state: getCellState(skill.id, allSelections),
        selected: skill.selected,
        ...(local !== undefined && { local }),
        installed: installedSkillIds?.includes(skill.id) || false,
        ...(activeConfig?.scope !== undefined && { scope: activeConfig.scope }),
        ...(secondaryScope !== undefined && { secondaryScope }),
        ...(activeConfig?.origin !== undefined && { source: activeConfig.origin }),
        hasUnmetRequirements: skill.hasUnmetRequirements,
        ...(skill.unmetRequirementsReason !== undefined && {
          unmetRequirementsReason: skill.unmetRequirementsReason,
        }),
        ...(requiredBy !== undefined && { requiredBy }),
      };
    });

    return {
      id: cat.id,
      displayName: cat.displayName,
      required: cat.required,
      exclusive: cat.exclusive,
      options,
    };
  });

  return categoryRows.filter((row) => row.options.length > 0);
}
