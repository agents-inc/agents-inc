import { DEFAULT_VERSION } from "../../consts";
import type { CategoryPath } from "../../types/index";

export function toTitleCase(kebabCase: string): string {
  return kebabCase
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const DEFAULT_CATEGORY_ORDER = 99;

const CATEGORIES_TS_COMMENT = "// Skill category definitions";
const RULES_TS_COMMENT = "// Skill rules configuration";

export function formatTsExport(comment: string, data: unknown): string {
  const body = JSON.stringify(data, null, 2);
  return `${comment}\nexport default ${body};\n`;
}

export function buildCategoryEntry(
  category: CategoryPath,
  domain: string,
): Record<string, unknown> {
  const categoryPart = category.includes("-")
    ? category.slice(category.indexOf("-") + 1)
    : category;
  return {
    id: category,
    displayName: toTitleCase(categoryPart),
    description: `Skills for ${toTitleCase(categoryPart)}`,
    exclusive: true,
    required: false,
    order: DEFAULT_CATEGORY_ORDER,
    custom: true,
    domain,
  };
}

export function generateSkillCategoriesTs(category: CategoryPath, domain: string): string {
  const entry = buildCategoryEntry(category, domain);
  const data = {
    version: DEFAULT_VERSION,
    categories: {
      [category]: entry,
    },
  };
  return formatTsExport(CATEGORIES_TS_COMMENT, data);
}

export function generateSkillRulesTs(): string {
  const data = {
    version: DEFAULT_VERSION,
    relationships: {
      conflicts: [],
      discourages: [],
      recommends: [],
      requires: [],
      alternatives: [],
    },
  };
  return formatTsExport(RULES_TS_COMMENT, data);
}
