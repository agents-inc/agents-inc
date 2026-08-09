import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillId, StackAgentConfig } from "../../types";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { createMockSkill, createMockSkillAssignment } from "../__tests__/factories/skill-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  createMockRawStacksConfig,
  createMockRawStacksConfigWithArrays,
  createMockRawStacksConfigWithObjects,
} from "../__tests__/factories/stack-factories";
import { LOCAL_SKILL_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { SKILLS } from "../__tests__/test-fixtures";
import { TEST_CUSTOM_SOURCE_URL } from "../__tests__/test-constants";

vi.mock("../configuration/config-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../configuration/config-loader")>()),
  loadConfig: vi.fn(),
}));

vi.mock("../../utils/logger");

import {
  normalizeAgentConfig,
  normalizeStackRecord,
  resolveAgentConfigToSkills,
} from "./stacks-loader";
import { loadConfig } from "../configuration/config-loader";
import { DEFAULT_SOURCE } from "../configuration/config";
import { warn } from "../../utils/logger";
import { initializeMatrix } from "../matrix/matrix-provider";
import { elementAt, firstElement } from "../__tests__/helpers/element-at.js";

/** A stack the CLI ships, resolvable by id under the default marketplace alone. */
const BUILT_IN_STACK_ID = "nextjs-fullstack";

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
      expect(firstElement(stacks).id).toBe("nextjs-fullstack");
      expect(firstElement(stacks).name).toBe("Next.js Full-Stack");
      expect(elementAt(stacks, 1).id).toBe("vue-spa");
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

      const nextjsStack = firstElement(stacks);
      // Bare strings are normalized to SkillAssignment[] with preloaded: false
      expect(nextjsStack.agents["web-developer"]).toStrictEqual({
        "web-framework": [createMockSkillAssignment("web-framework-react")],
        "web-styling": [createMockSkillAssignment("web-styling-scss-modules")],
      });
      expect(nextjsStack.agents["api-developer"]).toStrictEqual({
        "api-api": [createMockSkillAssignment("api-framework-hono")],
        "api-orm": [createMockSkillAssignment("api-database-drizzle")],
      });
    });

    it("normalizes bare string arrays to SkillAssignment[] with preloaded: false", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfigWithArrays());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      expect(stacks).toHaveLength(1);
      const stack = firstElement(stacks);
      expect(stack.id).toBe("multi-select-stack");

      // Array values should be normalized to SkillAssignment[]
      expect(stack.agents["web-developer"]?.["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology"),
        createMockSkillAssignment("meta-reviewing-reviewing"),
        createMockSkillAssignment("meta-reviewing-cli-reviewing"),
      ]);

      // Single values normalized to SkillAssignment[]
      expect(stack.agents["web-developer"]?.["web-framework"]).toStrictEqual([
        createMockSkillAssignment("web-framework-react"),
      ]);
      expect(stack.agents["codex-keeper"]?.["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology"),
      ]);
    });

    it("preserves object-form assignments with preloaded: true", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfigWithObjects());

      const { loadStacks: freshLoadStacks } = await import("./stacks-loader");
      const stacks = await freshLoadStacks("/project");

      const stack = firstElement(stacks);
      expect(stack.id).toBe("object-stack");

      // Object-form with preloaded: true preserved
      expect(stack.agents["web-developer"]?.["web-framework"]).toStrictEqual([
        createMockSkillAssignment("web-framework-react", true),
      ]);

      // Bare string normalized to preloaded: false
      expect(stack.agents["web-developer"]?.["web-styling"]).toStrictEqual([
        createMockSkillAssignment("web-styling-scss-modules"),
      ]);

      // Mixed array: object + bare string
      expect(stack.agents["web-developer"]?.["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology", true),
        createMockSkillAssignment("meta-reviewing-reviewing"),
      ]);
    });
  });

  describe("loadStackById", () => {
    it("returns stack matching the given ID", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("vue-spa", "/project", TEST_CUSTOM_SOURCE_URL);

      expect(stack).not.toBeNull();
      expect(stack!.id).toBe("vue-spa");
      expect(stack!.name).toBe("Vue SPA");
    });

    it("returns null when stack ID not found", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(
        "nonexistent-stack",
        "/project",
        TEST_CUSTOM_SOURCE_URL,
      );

      expect(stack).toBeNull();
    });

    it("returns null when no stacks file exists and ID is not a default stack", async () => {
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById("nonexistent-stack", "/project", DEFAULT_SOURCE);

      expect(stack).toBeNull();
    });

    it("falls back to a built-in stack under the default public marketplace", async () => {
      // Source has no stacks file, so loadStacks returns []
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(BUILT_IN_STACK_ID, "/project", DEFAULT_SOURCE);

      // Should fall back to the built-in default stack
      expect(stack).not.toBeNull();
      expect(stack!.id).toBe(BUILT_IN_STACK_ID);
      expect(stack!.name).toBe("Next.js Full-Stack");
    });

    it("returns null for a built-in stack id under a custom source", async () => {
      // The built-in catalogue belongs to the default public marketplace, so
      // under any other source this id names a stack that source does not have
      // — and standing one in would install stacks written against a different
      // catalogue of skills.
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(BUILT_IN_STACK_ID, "/project", TEST_CUSTOM_SOURCE_URL);

      expect(stack).toBeNull();
    });
  });

  describe("normalizeStackRecord", () => {
    // The move that produced this case: the id still spells `shared-monorepo`
    // while the matrix answers `shared-task-runner`. A config saved before the
    // move names the old key; the skill it names is the same skill.
    const MOVED_SKILL: SkillId = "shared-monorepo-turborepo";
    const STALE_CATEGORY = "shared-monorepo";
    const LIVE_CATEGORY = "shared-task-runner";

    beforeEach(() => {
      initializeMatrix(BUILT_IN_MATRIX);
    });

    it("re-keys a saved entry under the skill's live category, keeping its load flag", () => {
      const record = normalizeStackRecord({
        "web-developer": { [STALE_CATEGORY]: [{ id: MOVED_SKILL, preloaded: true }] },
      });

      expect(record).toStrictEqual({
        "web-developer": { [LIVE_CATEGORY]: [createMockSkillAssignment(MOVED_SKILL, true)] },
      });
    });

    it("re-keys an entry written in the bare-string form", () => {
      const record = normalizeStackRecord({
        "web-developer": { [STALE_CATEGORY]: MOVED_SKILL },
      });

      expect(record).toStrictEqual({
        "web-developer": { [LIVE_CATEGORY]: [createMockSkillAssignment(MOVED_SKILL)] },
      });
    });

    it("leaves an entry alone when the matrix has no such skill", () => {
      // Boundary: an id outside the catalog — local, marketplace, or removed.
      const record = normalizeStackRecord({
        "web-developer": { "web-framework": [{ id: "acme-pipeline-deploy", preloaded: true }] },
      });

      expect(record).toStrictEqual({
        "web-developer": { "web-framework": [{ id: "acme-pipeline-deploy", preloaded: true }] },
      });
    });

    it("leaves an entry alone when the skill's category is the local pseudo-category", () => {
      initializeMatrix(LOCAL_SKILL_MATRIX);

      const record = normalizeStackRecord({
        "web-developer": { "web-framework": [{ id: "web-local-skill", preloaded: true }] },
      });

      expect(record).toStrictEqual({
        "web-developer": { "web-framework": [{ id: "web-local-skill", preloaded: true }] },
      });
    });

    it("folds a stale key into the live one without listing the skill twice", () => {
      const record = normalizeStackRecord({
        "web-developer": {
          [STALE_CATEGORY]: [{ id: MOVED_SKILL }],
          [LIVE_CATEGORY]: [{ id: MOVED_SKILL, preloaded: true }],
        },
      });

      expect(
        record,
        "the entry already stored under the live category is the current word for the pair",
      ).toStrictEqual({
        "web-developer": { [LIVE_CATEGORY]: [createMockSkillAssignment(MOVED_SKILL, true)] },
      });
    });

    it("keeps each agent's re-keying independent", () => {
      const record = normalizeStackRecord({
        "web-developer": { [STALE_CATEGORY]: [{ id: MOVED_SKILL, preloaded: true }] },
        reviewer: { "web-framework": [{ id: "web-framework-react" }] },
      });

      expect(record).toStrictEqual({
        "web-developer": { [LIVE_CATEGORY]: [createMockSkillAssignment(MOVED_SKILL, true)] },
        reviewer: { "web-framework": [{ id: "web-framework-react" }] },
      });
    });

    it("does not re-key a source stack's authored grouping", () => {
      // normalizeAgentConfig is the stacks-file path. There the category key is
      // the author's heading for the agent's prompt, shipped with the catalog it
      // references — not persisted user data that a later release can drift under.
      const agentConfig = normalizeAgentConfig({
        [STALE_CATEGORY]: [{ id: MOVED_SKILL, preloaded: true }],
      });

      expect(agentConfig).toStrictEqual({
        [STALE_CATEGORY]: [createMockSkillAssignment(MOVED_SKILL, true)],
      });
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
        "api-orm": [createMockSkillAssignment("api-database-drizzle", true)],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(firstElement(skills).usage).toContain("api-orm");
    });

    it("passes through unknown skill IDs for downstream validation and warns", () => {
      // Boundary cast: intentionally invalid skill ID to verify pass-through
      const agentConfig = {
        "web-framework": [{ id: "Not-A-Valid-Id", preloaded: false }],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toHaveLength(1);
      expect(firstElement(skills).id).toBe("Not-A-Valid-Id");
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
        "api-orm": [createMockSkillAssignment("api-database-drizzle", true)],
      };

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        { id: "web-framework-react", usage: "when working with web-framework", preloaded: true },
        { id: "api-database-drizzle", usage: "when working with api-orm", preloaded: true },
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
      expect(firstElement(skills).id).toBe("acme-pipeline-deploy");
      expect(firstElement(skills).preloaded).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("acme-pipeline-deploy"), {
        suppressInTest: true,
      });
    });
  });
});
