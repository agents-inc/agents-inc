import { useMemo } from "react";
import type { Domain, SkillId, CategorySelections } from "../../types/index.js";
import type { SkillConfig } from "../../types/config.js";
import { buildCategoriesForDomain } from "../../lib/wizard/index.js";
import type { CategoryRow } from "../wizard/category-grid.js";

type UseFrameworkFilteringOptions = {
  domain: Domain;
  allSelections: SkillId[];
  selections: CategorySelections;
  installedSkillIds?: SkillId[];
  skillConfigs?: SkillConfig[];
  filterIncompatible?: boolean;
};

export function useFrameworkFiltering({
  domain,
  allSelections,
  selections,
  installedSkillIds,
  skillConfigs,
  filterIncompatible,
}: UseFrameworkFilteringOptions): CategoryRow[] {
  return useMemo(
    () =>
      buildCategoriesForDomain(
        domain,
        allSelections,
        selections,
        installedSkillIds,
        skillConfigs,
        filterIncompatible,
      ),
    [domain, allSelections, selections, installedSkillIds, skillConfigs, filterIncompatible],
  );
}
