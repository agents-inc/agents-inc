import type { Category, CategoryDefinition } from "../../../types";

export function createMockCategory(
  id: string,
  displayName: string,
  overrides?: Partial<CategoryDefinition>,
): CategoryDefinition {
  // Boundary cast: test factory accepts arbitrary category IDs for test isolation
  return {
    id: id as Category,
    displayName,
    description: `${displayName} category`,
    domain: "web",
    exclusive: true,
    required: false,
    order: 0,
    ...overrides,
  };
}
