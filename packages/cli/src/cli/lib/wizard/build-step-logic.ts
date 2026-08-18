import { sortBy } from "remeda";
import { typedValues } from "../../utils/typed-object.js";
import type { CategorySelections, Domain, SkillId } from "../../types/index.js";
import type { SkillConfig } from "../../types/config.js";
import { getAvailableSkills, getCellState, getUnmetRequiredBy } from "../matrix/index.js";
import { matrix, getSkillById } from "../matrix/matrix-provider.js";
import { deriveScopeBadges } from "./scope-diff.js";
import type { CategoryRow, CategoryOption } from "../../components/wizard/category-grid.js";

export type BuildStepValidation = {
  valid: boolean;
  message?: string;
};

export function validateBuildStep(
  categories: CategoryRow[],
  selections: CategorySelections,
): BuildStepValidation {
  const emptyRequired = categories.find(
    (category) => category.required && !selections[category.id]?.length,
  );
  return emptyRequired
    ? {
        valid: true,
        message: `No skills selected in ${emptyRequired.displayName} (required category)`,
      }
    : { valid: true };
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CategoryDefinition declares this required, but an auto-synthesized category for a custom skill can arrive without it — the type is stricter than the data
    (cat) => cat.order ?? 0,
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CategoryDefinition declares this required, but an auto-synthesized category for a custom skill can arrive without it — the type is stricter than the data
      required: cat.required ?? false,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CategoryDefinition declares this required, but an auto-synthesized category for a custom skill can arrive without it — the type is stricter than the data
      exclusive: cat.exclusive ?? true,
      options,
    };
  });

  return categoryRows.filter((row) => row.options.length > 0);
}
