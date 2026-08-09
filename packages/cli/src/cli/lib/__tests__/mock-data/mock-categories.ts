// Shared category definitions with domain overrides for test files.
// Spreads from TEST_CATEGORIES in test-fixtures.ts.

import { TEST_CATEGORIES } from "../test-fixtures.js";
import { buildCategoryMap } from "../factories/matrix-factories.js";

// ---------------------------------------------------------------------------
// Categories from step-build.test.tsx (with domain overrides)
// ---------------------------------------------------------------------------

export const WEB_FRAMEWORK_CATEGORY = {
  ...TEST_CATEGORIES.framework,
  required: true,
};

export const WEB_STYLING_CATEGORY = {
  ...TEST_CATEGORIES.styling,
  required: true,
  order: 1,
};

export const WEB_STATE_CATEGORY = {
  ...TEST_CATEGORIES.clientState,
  order: 2,
};

export const API_FRAMEWORK_CATEGORY = {
  ...TEST_CATEGORIES.api,
  displayName: "API Framework",
  // Boundary cast: narrows string to Domain union
  domain: "api" as const,
  required: true,
  order: 0,
};

export const API_DATABASE_CATEGORY = {
  ...TEST_CATEGORIES.database,
  // Boundary cast: narrows string to Domain union
  domain: "api" as const,
  order: 1,
};

// ---------------------------------------------------------------------------
// Categories from matrix-loader.test.ts (basic, no domain override)
// ---------------------------------------------------------------------------

export const CLI_FRAMEWORK_CATEGORY = {
  ...TEST_CATEGORIES.cliFramework,
  domain: "cli" as const,
  exclusive: false,
};

export const FRAMEWORK_CATEGORY = {
  ...TEST_CATEGORIES.framework,
  description: "Web frameworks",
  order: 1,
};

// ---------------------------------------------------------------------------
// Categories from skill-resolution.integration.test.ts (multi-source)
// ---------------------------------------------------------------------------

export const MULTI_SOURCE_CATEGORIES = buildCategoryMap({
  "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true, required: true },
  "web-client-state": {
    ...TEST_CATEGORIES.clientState,
    displayName: "State",
    description: "State category",
    order: 1,
  },
  "web-styling": { ...TEST_CATEGORIES.styling, order: 2 },
  "web-testing": { ...TEST_CATEGORIES.testing, exclusive: false, order: 3 },
  "api-api": { ...TEST_CATEGORIES.api, exclusive: true, order: 4 },
  "api-orm": { ...TEST_CATEGORIES.database, order: 5 },
  "shared-security": { ...TEST_CATEGORIES.security, order: 6 },
  "web-animation": { ...TEST_CATEGORIES.animation, order: 7 },
  "meta-reviewing": { ...TEST_CATEGORIES.methodology, order: 8 },
  "web-accessibility": { ...TEST_CATEGORIES.accessibility, order: 9 },
  "api-observability": { ...TEST_CATEGORIES.observability, order: 10 },
});
