// Shared fixtures for published-source file shapes (validated by source-validator).
//
// These represent the on-disk shapes for a marketplace source repo:
//   - stack config.yaml         (stackConfigValidationSchema)
//   - embedded skill metadata   (metadataValidationSchema)
//   - config/skill-categories.ts default export (skillCategoriesFileSchema)
//   - config/skill-rules.ts default export      (skillRulesFileSchema)
//   - config/stacks.ts default export           (stacksConfigSchema)
//
// Spread to vary individual fields for negative-case tests:
//   { ...VALID_STACK_CONFIG_FILE, version: undefined }

export const VALID_STACK_CONFIG_FILE = {
  id: "test-stack",
  name: "Test Stack",
  version: "1.0.0",
  author: "@test",
  skills: [{ id: "web-framework-react" }],
  agents: ["web-developer"],
};

export const VALID_EMBEDDED_SKILL_METADATA_FILE = {
  category: "web-framework",
  author: "@test",
  displayName: "react",
  slug: "react",
  cliDescription: "React framework skill",
  usageGuidance: "Use this skill when building React applications.",
};

export const VALID_SKILL_CATEGORIES_FILE = {
  version: "1.0.0",
  categories: {
    "web-framework": {
      id: "web-framework",
      displayName: "Framework",
      description: "Web frameworks",
      domain: "web",
      exclusive: true,
      required: false,
      order: 1,
    },
  },
};

export const VALID_SKILL_RULES_FILE = {
  version: "1.0.0",
};

export const VALID_STACKS_CONFIG_FILE = {
  stacks: [
    {
      id: "test-stack",
      name: "Test Stack",
      description: "A test stack",
      agents: {},
    },
  ],
};

/**
 * Minimal package.json fixture for `build marketplace` tests.
 *
 * `build marketplace` reads marketplace identity (name, version, description,
 * author) from package.json at the cwd. Tests that exercise happy-path
 * marketplace generation need this file on disk.
 */
export const VALID_PACKAGE_JSON_FILE = {
  name: "test-marketplace",
  version: "0.1.0",
  description: "Test marketplace",
  author: "Test Author <test@example.com>",
};
