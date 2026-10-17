import type { Category, CategoryDefinition } from "../../../types";

export function createMockCategory(
  id: string,
  displayName: string,
  overrides?: Partial<CategoryDefinition>,
): CategoryDefinition {
  // Boundary cast: tests pass arbitrary category ids.
  return {
    id: id as Category,
    displayName,
    description: `${displayName} category`,
    domain: "web",
    exclusive: true,
    order: 0,
    ...overrides,
  };
}
