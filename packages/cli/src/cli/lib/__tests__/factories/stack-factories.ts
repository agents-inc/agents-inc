import type { ResolvedStack, Stack, StackAgentConfig } from "../../../types";

export function createMockResolvedStack(
  id: string,
  name: string,
  overrides?: Partial<ResolvedStack>,
): ResolvedStack {
  return {
    id,
    name,
    description: `${name} stack`,
    skills: {},
    allSkillIds: [],
    philosophy: "",
    ...overrides,
  };
}

export function createMockStack(
  id: string,
  config: {
    name: string;
    description?: string;
    agents: Record<string, StackAgentConfig>;
    philosophy?: string;
  },
): Stack {
  return {
    id,
    name: config.name,
    description: config.description ?? "",
    // Boundary cast: test callers may pass arbitrary agent names (e.g., "nonexistent-agent")
    agents: config.agents,
    ...(config.philosophy !== undefined && { philosophy: config.philosophy }),
  };
}

export function createMockRawStacksConfig() {
  return {
    stacks: [
      {
        id: "nextjs-fullstack",
        name: "Next.js Full-Stack",
        description: "Full-stack Next.js with Hono API",
        agents: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "web-styling": "web-styling-scss-modules",
          },
          "api-developer": {
            "api-api": "api-framework-hono",
            "api-orm": "api-database-drizzle",
          },
        },
      },
      {
        id: "vue-spa",
        name: "Vue SPA",
        description: "Vue single-page application",
        agents: {
          "web-developer": {
            "web-framework": "web-framework-vue-composition-api",
            "web-styling": "web-styling-tailwind",
          },
        },
      },
    ],
  };
}

export function createMockRawStacksConfigWithArrays() {
  return {
    stacks: [
      {
        id: "multi-select-stack",
        name: "Multi-Select Stack",
        description: "Stack with array-valued categories",
        agents: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "meta-reviewing": [
              "meta-methodology-research-methodology",
              "meta-reviewing-reviewing",
              "meta-reviewing-cli-reviewing",
            ],
          },
          "codex-keeper": {
            "meta-reviewing": ["meta-methodology-research-methodology"],
          },
        },
      },
    ],
  };
}

export function createMockRawStacksConfigWithObjects() {
  return {
    stacks: [
      {
        id: "object-stack",
        name: "Object Stack",
        description: "Stack with object-form skill assignments",
        agents: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": "web-styling-scss-modules",
            "meta-reviewing": [
              { id: "meta-methodology-research-methodology", preloaded: true },
              "meta-reviewing-reviewing",
            ],
          },
        },
      },
    ],
  };
}
