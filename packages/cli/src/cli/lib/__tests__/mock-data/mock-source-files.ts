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

/** `build marketplace` reads the marketplace identity from package.json at the cwd. */
export const VALID_PACKAGE_JSON_FILE = {
  name: "test-marketplace",
  version: "0.1.0",
  description: "Test marketplace",
  author: "Test Author <test@example.com>",
};
