import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StackAgentConfig } from "../../types";
import { createMockSkill, createMockSkillAssignment } from "../__tests__/factories/skill-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  createMockRawStacksConfig,
  createMockRawStacksConfigWithArrays,
  createMockRawStacksConfigWithObjects,
  createMockStack,
} from "../__tests__/factories/stack-factories";
import { SKILLS } from "../__tests__/test-fixtures";

vi.mock("../configuration/config-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../configuration/config-loader")>()),
  loadConfig: vi.fn(),
}));

vi.mock("../../utils/logger");

import { resolveAgentConfigToSkills, resolveStackSkills } from "./stacks-loader";
import { loadConfig } from "../configuration/config-loader";
import { warn } from "../../utils/logger";
import { initializeMatrix } from "../matrix/matrix-provider";

// Matrix containing all skills referenced in stacks-loader test data
const stacksTestMatrix = createMockMatrix(
  SKILLS.react,
  SKILLS.vue,
  SKILLS.scss,
  SKILLS.tailwind,
  SKILLS.hono,
  SKILLS.drizzle,
  SKILLS.antiOverEng,
  createMockSkill("meta-methodology-research-methodology"),
  createMockSkill("meta-reviewing-cli-reviewing"),
);

describe("stacks-loader", () => {
  beforeEach(() => {
    // Clear the internal cache between tests by re-importing
    // The module has a stacksCache Map that persists across calls
    vi.resetModules();
    vi.clearAllMocks();
    initializeMatrix(stacksTestMatrix);
  });

  describe("loadStacks", () => {
    it("loads and parses stacks from config/stacks.ts", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      // Re-import after resetModules to clear cache
      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      expect(stacks).toHaveLength(2);
      expect(stacks[0].id).toBe("nextjs-fullstack");
      expect(stacks[0].name).toBe("Next.js Full-Stack");
      expect(stacks[1].id).toBe("vue-spa");
    });

    it("returns empty array when stacks file does not exist", async () => {
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      expect(stacks).toStrictEqual([]);
    });

    it("throws descriptive error for load failure", async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error("ENOENT"));

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");

      await expect(freshLoadStacks("/project")).rejects.toThrow(/Failed to load stacks/);
    });

    it("caches loaded stacks for the same configDir", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");

      const first = await freshLoadStacks("/project");
      const second = await freshLoadStacks("/project");

      // loadConfig should only be called once due to caching
      expect(loadConfig).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it("loads stacks from custom stacksFile path", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project", "data/my-stacks.ts");

      expect(stacks).toHaveLength(2);
      expect(loadConfig).toHaveBeenCalledWith("/project/data/my-stacks.ts", expect.anything());
    });

    it("uses default STACKS_FILE when stacksFile is undefined", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      await freshLoadStacks("/project");

      expect(loadConfig).toHaveBeenCalledWith("/project/config/stacks.ts", expect.anything());
    });

    it("caches separately for different stacksFile values", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");

      await freshLoadStacks("/project");
      await freshLoadStacks("/project", "custom/stacks.ts");

      // loadConfig should be called twice — different cache keys
      expect(loadConfig).toHaveBeenCalledTimes(2);
    });

    it("normalizes bare string values to SkillAssignment[] with preloaded: false", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      const nextjsStack = stacks[0];
      // Bare strings are normalized to SkillAssignment[] with preloaded: false
      expect(nextjsStack.agents["web-developer"]).toStrictEqual({
        "web-framework": [createMockSkillAssignment("web-framework-react")],
        "web-styling": [createMockSkillAssignment("web-styling-scss-modules")],
      });
      expect(nextjsStack.agents["api-developer"]).toStrictEqual({
        "api-api": [createMockSkillAssignment("api-framework-hono")],
        "api-database": [createMockSkillAssignment("api-database-drizzle")],
      });
    });

    it("normalizes bare string arrays to SkillAssignment[] with preloaded: false", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfigWithArrays());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      expect(stacks).toHaveLength(1);
      const stack = stacks[0];
      expect(stack.id).toBe("multi-select-stack");

      // Array values should be normalized to SkillAssignment[]
      expect(stack.agents["web-developer"]!["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology"),
        createMockSkillAssignment("meta-reviewing-reviewing"),
        createMockSkillAssignment("meta-reviewing-cli-reviewing"),
      ]);

      // Single values normalized to SkillAssignment[]
      expect(stack.agents["web-developer"]!["web-framework"]).toStrictEqual([
        createMockSkillAssignment("web-framework-react"),
      ]);
      expect(stack.agents["pattern-scout"]!["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology"),
      ]);
    });

    it("preserves object-form assignments with preloaded: true", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfigWithObjects());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      const stack = stacks[0];
      expect(stack.id).toBe("object-stack");

      // Object-form with preloaded: true preserved
      expect(stack.agents["web-developer"]!["web-framework"]).toStrictEqual([
        createMockSkillAssignment("web-framework-react", true),
      ]);

      // Bare string normalized to preloaded: false
      expect(stack.agents["web-developer"]!["web-styling"]).toStrictEqual([
        createMockSkillAssignment("web-styling-scss-modules"),
      ]);

      // Mixed array: object + bare string
      expect(stack.agents["web-developer"]!["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology", true),
        createMockSkillAssignment("meta-reviewing-reviewing"),
      ]);
    });
  });

  describe("loadStackById", () => {
    it("returns stack matching the given ID", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("vue-spa", "/project");

      expect(stack).not.toBeNull();
      expect(stack!.id).toBe("vue-spa");
      expect(stack!.name).toBe("Vue SPA");
    });

    it("returns null when stack ID not found", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("nonexistent-stack", "/project");

      expect(stack).toBeNull();
    });

    it("returns null when no stacks file exists and ID is not a default stack", async () => {
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("nonexistent-stack", "/project");

      expect(stack).toBeNull();
    });

    it("falls back to default stacks when source has no match", async () => {
      // Source has no stacks file, so loadStacks returns []
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("nextjs-fullstack", "/project");

      // Should fall back to the built-in default stack
      expect(stack).not.toBeNull();
      expect(stack!.id).toBe("nextjs-fullstack");
      expect(stack!.name).toBe("Next.js Full-Stack");
    });
  });

  describe("resolveAgentConfigToSkills", () => {
    it("converts skill assignments to skill references", () => {
      const agentConfig: StackAgentConfig = {
        "web-framework": [createMockSkillAssignment("web-framework-react", true)],
        "web-styling": [createMockSkillAssignment("web-styling-scss-modules")],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
        {
          id: "web-styling-scss-modules",
          usage: "when working with web-styling",
          preloaded: false,
        },
      ]);
    });

    it("reads preloaded from assignment directly", () => {
      const agentConfig: StackAgentConfig = {
        "web-framework": [createMockSkillAssignment("web-framework-react", true)],
        "web-styling": [createMockSkillAssignment("web-styling-scss-modules")],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      // preloaded: true set explicitly on framework assignment
      expect(skills[0]).toStrictEqual({
        id: "web-framework-react",
        usage: "when working with web-framework",
        preloaded: true,
      });

      // preloaded defaults to false when not set
      expect(skills[1]).toStrictEqual({
        id: "web-styling-scss-modules",
        usage: "when working with web-styling",
        preloaded: false,
      });
    });

    it("includes usage description with category context", () => {
      const agentConfig: StackAgentConfig = {
        "api-database": [createMockSkillAssignment("api-database-drizzle", true)],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills[0].usage).toContain("api-database");
    });

    it("passes through unknown skill IDs for downstream validation and warns", () => {
      // Boundary cast: intentionally invalid skill ID to verify pass-through
      const agentConfig = {
        "web-framework": [{ id: "Not-A-Valid-Id", preloaded: false }],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe("Not-A-Valid-Id");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Not-A-Valid-Id"), {
        suppressInTest: true,
      });
    });

    it("handles empty agent config", () => {
      const skills = resolveAgentConfigToSkills({});

      expect(skills).toStrictEqual([]);
    });

    it("resolves full skill IDs directly", () => {
      const agentConfig: StackAgentConfig = {
        "web-framework": [createMockSkillAssignment("web-framework-react", true)],
        "api-database": [createMockSkillAssignment("api-database-drizzle", true)],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
        { id: "api-database-drizzle", usage: "when working with api-database", preloaded: true },
      ]);
    });

    it("resolves array of skill assignments for multi-select categories", () => {
      const agentConfig: StackAgentConfig = {
        "meta-reviewing": [
          createMockSkillAssignment("meta-methodology-research-methodology", true),
          createMockSkillAssignment("meta-reviewing-reviewing", true),
          createMockSkillAssignment("meta-reviewing-cli-reviewing", true),
        ],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        {
          id: "meta-methodology-research-methodology",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        {
          id: "meta-reviewing-cli-reviewing",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
      ]);
    });

    it("handles single-element arrays", () => {
      const agentConfig: StackAgentConfig = {
        "web-framework": [createMockSkillAssignment("web-framework-react", true)],
        "meta-reviewing": [
          createMockSkillAssignment("meta-methodology-research-methodology", true),
          createMockSkillAssignment("meta-reviewing-reviewing", true),
        ],
        "web-styling": [createMockSkillAssignment("web-styling-scss-modules")],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
        {
          id: "meta-methodology-research-methodology",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        {
          id: "web-styling-scss-modules",
          usage: "when working with web-styling",
          preloaded: false,
        },
      ]);
    });

    it("handles empty array", () => {
      const agentConfig: StackAgentConfig = {
        "meta-reviewing": [],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([]);
    });

    it("passes through all skill IDs within arrays including unknown ones and warns", () => {
      // Boundary cast: intentionally invalid skill ID within array to verify pass-through
      const agentConfig = {
        "meta-reviewing": [
          { id: "meta-methodology-research-methodology", preloaded: true },
          { id: "Not-A-Valid-Id", preloaded: false },
          { id: "meta-reviewing-reviewing", preloaded: true },
        ],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      // All IDs passed through for downstream validation
      expect(skills).toStrictEqual([
        {
          id: "meta-methodology-research-methodology",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        { id: "Not-A-Valid-Id", usage: "when working with meta-reviewing", preloaded: false },
        {
          id: "meta-reviewing-reviewing",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
      ]);
      // Only warns for the unknown ID, not the valid ones
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Not-A-Valid-Id"), {
        suppressInTest: true,
      });
    });

    it("reads preloaded from each assignment individually", () => {
      const agentConfig: StackAgentConfig = {
        "meta-reviewing": [
          createMockSkillAssignment("meta-methodology-research-methodology", true),
          createMockSkillAssignment("meta-reviewing-reviewing", false),
        ],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        {
          id: "meta-methodology-research-methodology",
          usage: "when working with meta-reviewing",
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: "when working with meta-reviewing",
          preloaded: false,
        },
      ]);
    });

    it("passes through skill IDs not found in the matrix for downstream handling and warns", () => {
      // Boundary cast: intentionally unknown skill ID to verify pass-through
      const agentConfig = {
        "web-framework": [{ id: "acme-pipeline-deploy", preloaded: true }],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe("acme-pipeline-deploy");
      expect(skills[0].preloaded).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("acme-pipeline-deploy"), {
        suppressInTest: true,
      });
    });
  });

  describe("resolveStackSkills", () => {
    it("resolves all agents in a stack", () => {
      const stack = createMockStack("test-stack", {
        name: "Test Stack",
        description: "Test",
        agents: {
          "web-developer": {
            "web-framework": [createMockSkillAssignment("web-framework-react", true)],
          },
          "api-developer": {
            "api-api": [createMockSkillAssignment("api-framework-hono", true)],
            "api-database": [createMockSkillAssignment("api-database-drizzle", true)],
          },
        },
      });

      const result = resolveStackSkills(stack);

      expect(result).toStrictEqual({
        "web-developer": [
          { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
        ],
        "api-developer": [
          { id: "api-framework-hono", usage: "when working with api-api", preloaded: true },
          { id: "api-database-drizzle", usage: "when working with api-database", preloaded: true },
        ],
      });
    });

    it("handles stack with no agents", () => {
      const stack = createMockStack("empty-stack", {
        name: "Empty",
        description: "No agents",
        agents: {},
      });

      const result = resolveStackSkills(stack);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("resolves agents with array-valued categories", () => {
      const stack = createMockStack("test-stack", {
        name: "Test Stack",
        description: "Test",
        agents: {
          "pattern-scout": {
            "meta-reviewing": [
              createMockSkillAssignment("meta-methodology-research-methodology", true),
              createMockSkillAssignment("meta-reviewing-reviewing", true),
              createMockSkillAssignment("meta-reviewing-cli-reviewing", true),
            ],
          },
        },
      });

      const result = resolveStackSkills(stack);

      expect(result).toStrictEqual({
        "pattern-scout": [
          {
            id: "meta-methodology-research-methodology",
            usage: "when working with meta-reviewing",
            preloaded: true,
          },
          {
            id: "meta-reviewing-reviewing",
            usage: "when working with meta-reviewing",
            preloaded: true,
          },
          {
            id: "meta-reviewing-cli-reviewing",
            usage: "when working with meta-reviewing",
            preloaded: true,
          },
        ],
      });
    });
  });
});
