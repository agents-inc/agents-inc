import { useMemo } from "react";
import type { Domain, SkillId } from "../../types/index.js";
import type { SkillConfig } from "../../types/config.js";
import { buildCategoriesForDomain } from "../../lib/wizard/index.js";
import type { CategoryRow } from "../wizard/category-grid.js";

type UseCategoryRowsOptions = {
  domain: Domain;
  allSelections: SkillId[];
  installedSkillIds?: SkillId[];
  skillConfigs?: SkillConfig[];
};

/** The build-step grid's rows for `domain`, rebuilt only when an input changes. */
export function useCategoryRows({
  domain,
  allSelections,
  installedSkillIds,
  skillConfigs,
}: UseCategoryRowsOptions): CategoryRow[] {
  return useMemo(
    () => buildCategoriesForDomain(domain, allSelections, installedSkillIds, skillConfigs),
    [domain, allSelections, installedSkillIds, skillConfigs],
  );
}
