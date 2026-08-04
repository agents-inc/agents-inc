// Shared stack constants for test files.
// TestStack arrays are used with createTestSource() for integration tests.

import type { TestStack } from "../fixtures/create-test-source.js";
import { sa } from "../factories/skill-factories.js";
import { createMockStack } from "../factories/stack-factories.js";

// ---------------------------------------------------------------------------
// Stacks from resolver.test.ts
// ---------------------------------------------------------------------------

export const FULLSTACK_STACK = createMockStack("fullstack", {
  name: "Fullstack Stack",
  description: "A fullstack development stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
      "web-styling": [sa("web-styling-scss-modules")],
    },
    "api-developer": {
      "api-api": [sa("api-framework-hono", true)],
      "api-database": [sa("api-database-drizzle", true)],
    },
  },
});

export const WEB_REACT_AND_SCSS_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
      "web-styling": [sa("web-styling-scss-modules")],
    },
  },
});

export const WEB_REACT_ONLY_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
    },
  },
});

export const WEB_SCSS_ONLY_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  agents: {
    "web-developer": {
      "web-styling": [sa("web-styling-scss-modules")],
    },
  },
});

export const API_HONO_ONLY_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  agents: {
    "api-developer": { "api-api": [sa("api-framework-hono", true)] },
  },
});

export const WEB_EMPTY_AGENT_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  agents: {
    "web-developer": {},
  },
});

// ---------------------------------------------------------------------------
// Stacks from config-generator.test.ts
// ---------------------------------------------------------------------------

export const EMPTY_AGENTS_STACK = createMockStack("empty-stack", {
  name: "Empty Stack",
  description: "No agents",
  agents: {},
});

export const SHARED_CATEGORY_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  description: "Test stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react")],
    },
    "web-reviewer": {
      "web-framework": [sa("web-framework-react")],
    },
  },
});

export const STACK_WITH_EMPTY_AGENTS = createMockStack("test-stack", {
  name: "Test Stack",
  description: "Test stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
    },
    "cli-tester": {},
    "web-pm": {},
  },
});

export const MULTI_METHODOLOGY_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  description: "Test stack",
  agents: {
    "pattern-scout": {
      "meta-reviewing": [
        sa("meta-methodology-research-methodology", true),
        sa("meta-reviewing-reviewing", true),
        sa("meta-reviewing-cli-reviewing", true),
      ],
    },
  },
});

export const STACK_WITH_EMPTY_CATEGORY = createMockStack("test-stack", {
  name: "Test Stack",
  description: "Test stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
      "meta-reviewing": [],
    },
  },
});

export const MANY_CATEGORIES_STACK = createMockStack("fullstack", {
  name: "Fullstack",
  description: "Fullstack stack",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react")],
      "web-styling": [sa("web-styling-scss-modules")],
      "web-client-state": [sa("web-state-zustand")],
      "web-testing": [sa("web-testing-vitest")],
    },
  },
});

export const LOCAL_SKILL_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  description: "Test stack with local skill",
  agents: {
    "web-developer": {
      "web-framework": [
        {
          id: "web-framework-react",
          preloaded: true,
          local: true,
          path: ".claude/skills/react/",
        },
      ],
    },
  },
});

// ---------------------------------------------------------------------------
// Stack from compilation-pipeline.test.ts
// ---------------------------------------------------------------------------

export const COMPILATION_TEST_STACK = createMockStack("test-stack", {
  name: "Test Stack",
  description: "A test stack for integration testing",
  agents: {
    "web-developer": {
      "web-framework": [sa("web-framework-react", true)],
    },
    "api-developer": {
      "api-api": [sa("api-framework-hono", true)],
    },
  },
});

// ---------------------------------------------------------------------------
// TestStack arrays from consumer-stacks-matrix.integration.test.ts
// (used with createTestSource() — different shape than Stack objects above)
// ---------------------------------------------------------------------------

export const CUSTOM_TEST_STACKS: TestStack[] = [
  {
    id: "custom-fullstack",
    name: "Custom Fullstack",
    description: "A consumer-defined fullstack stack",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
      "api-developer": {
        "api-api": "api-framework-hono",
      },
    },
  },
  {
    id: "custom-testing",
    name: "Custom Testing",
    description: "A consumer-defined testing stack",
    agents: {
      "web-developer": {
        "web-testing": "web-testing-vitest",
      },
    },
  },
];

export const PHILOSOPHY_TEST_STACKS: TestStack[] = [
  {
    id: "philo-stack",
    name: "Philosophy Stack",
    description: "Stack with philosophy",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
    },
    philosophy: "Modern fullstack with type safety",
  },
];

export const OVERRIDING_TEST_STACKS: TestStack[] = [
  {
    id: "nextjs-fullstack",
    name: "Custom Next.js",
    description: "Consumer override of Next.js stack",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
        "web-testing": "web-testing-vitest",
      },
    },
  },
];

export const MARKETPLACE_TEST_STACKS: TestStack[] = [
  {
    id: "marketplace-stack",
    name: "Marketplace Stack",
    description: "A stack from a marketplace source",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
      "api-developer": {
        "api-api": "api-framework-hono",
      },
    },
  },
];

export const MARKETPLACE_FULLSTACK_TEST_STACKS: TestStack[] = [
  {
    id: "mp-fullstack",
    name: "MP Fullstack",
    description: "Marketplace fullstack",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
    },
  },
];

export const PIPELINE_TEST_STACKS: TestStack[] = [
  {
    id: "custom-pipeline",
    name: "Custom Pipeline",
    description: "Stack for testing the full pipeline",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
        "web-testing": "web-testing-vitest",
      },
      "api-developer": {
        "api-api": "api-framework-hono",
      },
    },
  },
];

export const MULTI_TEST_STACKS: TestStack[] = [
  {
    id: "stack-a",
    name: "Stack A",
    description: "First stack",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
    },
  },
  {
    id: "stack-b",
    name: "Stack B",
    description: "Second stack also using React",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
        "web-testing": "web-testing-vitest",
      },
    },
  },
];
