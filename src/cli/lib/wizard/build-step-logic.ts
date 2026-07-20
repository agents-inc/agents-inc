import { sortBy } from "remeda";
import { typedValues } from "../../utils/typed-object.js";
import type { CategoryDefinition, Domain, SkillId, CategorySelections } from "../../types/index.js";
import type { SkillConfig } from "../../types/config.js";
import {
  getAvailableSkills,
  getUnmetRequiredBy,
  isCompatibleWithSelections,
} from "../matrix/index.js";
import { matrix, getSkillById } from "../matrix/matrix-provider.js";
import { deriveScopeBadges } from "./scope-diff.js";
import type { CategoryRow, CategoryOption } from "../../components/wizard/category-grid.js";

export const FRAMEWORK_CATEGORY_ID = "web-framework";
const WEB_DOMAIN_ID = "web";

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

function getSelectedFrameworks(selections: CategorySelections): SkillId[] {
  return (selections[FRAMEWORK_CATEGORY_ID] ?? []).map((alias) => getSkillById(alias).id);
}

export function isCompatibleWithSelectedFrameworks(
  skillId: SkillId,
  selectedFrameworkIds: SkillId[],
): boolean {
  return isCompatibleWithSelections(getSkillById(skillId), selectedFrameworkIds);
}

// Build CategoryRow[] from matrix for a domain
export function buildCategoriesForDomain(
  domain: Domain,
  allSelections: SkillId[],
  selections: CategorySelections,
  installedSkillIds?: SkillId[],
  skillConfigs?: SkillConfig[],
  filterIncompatible?: boolean,
): CategoryRow[] {
  const selectedFrameworkIds = getSelectedFrameworks(selections);
  const shouldFilter =
    filterIncompatible && domain === WEB_DOMAIN_ID && selectedFrameworkIds.length > 0;

  const categories = sortBy(
    typedValues(matrix.categories).filter((cat) => cat.domain === domain),
    (cat) => cat.order ?? 0,
  );

  const categoryRows: CategoryRow[] = categories.map((cat) => {
    const skillOptions = getAvailableSkills(cat.id, allSelections);

    const filteredOptions =
      shouldFilter && cat.id !== FRAMEWORK_CATEGORY_ID
        ? skillOptions.filter((skill) =>
            isCompatibleWithSelectedFrameworks(skill.id, selectedFrameworkIds),
          )
        : skillOptions;

    const isExclusive = cat.exclusive ?? true;

    const options: CategoryOption[] = filteredOptions.map((skill) => {
      const activeConfig = skillConfigs?.find((sc) => sc.id === skill.id && !sc.excluded);
      const excludedConfig = skillConfigs?.find((sc) => sc.id === skill.id && sc.excluded);
      const { secondaryScope } = deriveScopeBadges(activeConfig, excludedConfig);
      return {
        id: skill.id,
        state:
          isExclusive && skill.advisoryState.status === "incompatible"
            ? { status: "normal" }
            : skill.advisoryState,
        selected: skill.selected,
        local: getSkillById(skill.id).local,
        installed: installedSkillIds?.includes(skill.id) || false,
        scope: activeConfig?.scope,
        secondaryScope,
        source: activeConfig?.source,
        hasUnmetRequirements: skill.hasUnmetRequirements,
        unmetRequirementsReason: skill.unmetRequirementsReason,
        requiredBy: skill.selected ? undefined : getUnmetRequiredBy(skill.id, allSelections),
      };
    });

    return {
      id: cat.id,
      displayName: cat.displayName,
      required: cat.required ?? false,
      exclusive: cat.exclusive ?? true,
      options,
    };
  });

  return categoryRows.filter((row) => row.options.length > 0);
}
