import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { STANDARD_FILES } from "../../consts";
import type { SkillId, StackAgentConfig } from "../../types";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { createMockSkill, createMockSkillAssignment } from "../__tests__/factories/skill-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  createMockRawStacksConfig,
  createMockRawStacksConfigWithArrays,
  createMockRawStacksConfigWithObjects,
} from "../__tests__/factories/stack-factories";
import { LOCAL_SKILL_MATRIX, USAGE_GUIDANCE_MATRIX } from "../__tests__/mock-data/mock-matrices";
import {
  CUSTOM_HOUSE_TOOLING_ID,
  FALLBACK_USAGE,
  GUIDED_SKILL,
  STATED_USAGE_GUIDANCE,
} from "../__tests__/mock-data/mock-skills";
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
  stackNotOfferedMessage,
} from "./stacks-loader";
import { loadConfig } from "../configuration/config-loader";
import { DEFAULT_SOURCE } from "../configuration/config";
import { verbose, warn } from "../../utils/logger";
import { getSkillById, initializeMatrix } from "../matrix/matrix-provider";
import { elementAt, firstElement } from "../__tests__/helpers/element-at.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";

/** A stack the CLI ships, resolvable by id for the public catalogue alone. */
const BUILT_IN_STACK_ID = "nextjs-fullstack";

/** A skill the shipped catalogue carries, named as an id so its removal is a compile error. */
const CATALOGUE_GUIDED_SKILL: SkillId = "meta-design-expressive-typescript";

const CATALOGUE_GUIDED_CATEGORY = "meta-design";

/** Written out: asserting an identity against its own definition cannot notice it moving. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

const identityDirs: string[] = [];

async function writeCataloguePackage(packageName: string): Promise<string> {
  const dir = await createTempDir("cc-stack-identity-");
  identityDirs.push(dir);
  await writeFile(
    path.join(dir, STANDARD_FILES.PACKAGE_JSON),
    JSON.stringify({ name: packageName, version: "1.0.0" }),
  );
  return dir;
}

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
  afterAll(async () => {
    await Promise.all(identityDirs.map(cleanupTempDir));
  });

  beforeEach(() => {
    // Reset the module-level stacksCache between tests.
    vi.resetModules();
    vi.clearAllMocks();
    initializeMatrix(stacksTestMatrix);
  });

  describe("loadStacks", () => {
    it("loads and parses stacks from config/stacks.ts", async () => {
      vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());

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

      expect(stack.agents["web-developer"]?.["meta-reviewing"]).toStrictEqual([
        createMockSkillAssignment("meta-methodology-research-methodology"),
        createMockSkillAssignment("meta-reviewing-reviewing"),
        createMockSkillAssignment("meta-reviewing-cli-reviewing"),
      ]);

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

      expect(stack.agents["web-developer"]?.["web-framework"]).toStrictEqual([
        createMockSkillAssignment("web-framework-react", true),
      ]);

      expect(stack.agents["web-developer"]?.["web-styling"]).toStrictEqual([
        createMockSkillAssignment("web-styling-scss-modules"),
      ]);

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

      expect(stack).not.toBeNull();
      expect(stack!.id).toBe(BUILT_IN_STACK_ID);
      expect(stack!.name).toBe("Next.js Full-Stack");
    });

    it("returns null for a built-in stack id under a custom source", async () => {
      // The built-in catalogue belongs to the public marketplace; other sources get no stacks.
      vi.mocked(loadConfig).mockResolvedValue(null);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(BUILT_IN_STACK_ID, "/project", TEST_CUSTOM_SOURCE_URL);

      expect(stack).toBeNull();
    });

    // Pairs with `resolveOfferedStacks`: a stack offered from a checkout must also resolve.
    it("resolves a built-in stack id from the public catalogue's own repository", async () => {
      vi.mocked(loadConfig).mockResolvedValue(null);
      const catalogueDir = await writeCataloguePackage(PUBLIC_CATALOGUE_PACKAGE);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(BUILT_IN_STACK_ID, catalogueDir, catalogueDir);

      expect(stack, "a checkout of the catalogue is still the catalogue").not.toBeNull();
      expect(stack!.id).toBe(BUILT_IN_STACK_ID);
    });

    it("returns null for a repository whose package merely resembles the catalogue's", async () => {
      vi.mocked(loadConfig).mockResolvedValue(null);
      const lookalikeDir = await writeCataloguePackage(`${PUBLIC_CATALOGUE_PACKAGE}-extra`);

      const { loadStackById: freshLoadStackById } = await import("./stacks-loader");
      const stack = await freshLoadStackById(BUILT_IN_STACK_ID, lookalikeDir, lookalikeDir);

      expect(stack, "the identity is the whole package name, not a prefix of it").toBeNull();
    });
  });

  describe("normalizeStackRecord", () => {
    // The id still spells `shared-monorepo`; the matrix now answers `shared-task-runner`.
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
      // The stacks-file path: its category key is the author's heading, not drifting user data.
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
        { id: "web-framework-react", usage: FALLBACK_USAGE["web-framework"], preloaded: true },
        {
          id: "web-styling-scss-modules",
          usage: FALLBACK_USAGE["web-styling"],
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
        usage: FALLBACK_USAGE["web-framework"],
        preloaded: true,
      });

      // preloaded defaults to false when not set
      expect(skills[1]).toStrictEqual({
        id: "web-styling-scss-modules",
        usage: FALLBACK_USAGE["web-styling"],
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

    it("passes through unknown skill IDs for downstream validation, and says nothing", () => {
      // Boundary cast: intentionally invalid skill ID to verify pass-through
      const agentConfig = {
        "web-framework": [{ id: "Not-A-Valid-Id", preloaded: false }],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toHaveLength(1);
      expect(firstElement(skills).id).toBe("Not-A-Valid-Id");
      expect(
        warn,
        "a stack id this matrix lacks is reported where it is dropped, never here as a possible custom or local skill",
      ).not.toHaveBeenCalled();
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
        { id: "web-framework-react", usage: FALLBACK_USAGE["web-framework"], preloaded: true },
        { id: "api-database-drizzle", usage: FALLBACK_USAGE["api-orm"], preloaded: true },
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
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        {
          id: "meta-reviewing-cli-reviewing",
          usage: FALLBACK_USAGE["meta-reviewing"],
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
        { id: "web-framework-react", usage: FALLBACK_USAGE["web-framework"], preloaded: true },
        {
          id: "meta-methodology-research-methodology",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        {
          id: "web-styling-scss-modules",
          usage: FALLBACK_USAGE["web-styling"],
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

    it("passes through all skill IDs within arrays including unknown ones, and says nothing", () => {
      // Boundary cast: intentionally invalid skill ID within array to verify pass-through
      const agentConfig = {
        "meta-reviewing": [
          { id: "meta-methodology-research-methodology", preloaded: true },
          { id: "Not-A-Valid-Id", preloaded: false },
          { id: "meta-reviewing-reviewing", preloaded: true },
        ],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toStrictEqual([
        {
          id: "meta-methodology-research-methodology",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        { id: "Not-A-Valid-Id", usage: FALLBACK_USAGE["meta-reviewing"], preloaded: false },
        {
          id: "meta-reviewing-reviewing",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
      ]);
      expect(
        warn,
        "a stack id this matrix lacks is reported where it is dropped, never here as a possible custom or local skill",
      ).not.toHaveBeenCalled();
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
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: true,
        },
        {
          id: "meta-reviewing-reviewing",
          usage: FALLBACK_USAGE["meta-reviewing"],
          preloaded: false,
        },
      ]);
    });

    it("passes through skill IDs not found in the matrix for downstream handling, and says nothing", () => {
      // Boundary cast: intentionally unknown skill ID to verify pass-through
      const agentConfig = {
        "web-framework": [{ id: "acme-pipeline-deploy", preloaded: true }],
      } as unknown as StackAgentConfig;

      const skills = resolveAgentConfigToSkills(agentConfig);

      expect(skills).toHaveLength(1);
      expect(firstElement(skills).id).toBe("acme-pipeline-deploy");
      expect(firstElement(skills).preloaded).toBe(true);
      expect(
        warn,
        "a stack id this matrix lacks is reported where it is dropped, never here as a possible custom or local skill",
      ).not.toHaveBeenCalled();
    });

    /**
     * `usage` is the sub-agent's `Use when:` line. The specs above pin the category fallback, since
     * `SKILLS.*` state no `usageGuidance`.
     */
    describe("usage", () => {
      /** The key the guided assignment below is filed under, and the word a derived usage would take. */
      const GUIDED_CATEGORY = "web-client-state";

      beforeEach(() => {
        initializeMatrix(USAGE_GUIDANCE_MATRIX);
      });

      it("carries the guidance the skill states for itself", () => {
        const agentConfig: StackAgentConfig = {
          [GUIDED_CATEGORY]: [createMockSkillAssignment(GUIDED_SKILL.id)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(skills).toStrictEqual([
          { id: GUIDED_SKILL.id, usage: STATED_USAGE_GUIDANCE, preloaded: false },
        ]);
      });

      it("does not describe a skill that states its own guidance by its category", () => {
        const agentConfig: StackAgentConfig = {
          [GUIDED_CATEGORY]: [createMockSkillAssignment(GUIDED_SKILL.id, true)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(
          firstElement(skills).usage,
          "a category name states a filing, not when to reach for the skill",
        ).not.toBe(FALLBACK_USAGE["web-client-state"]);
      });

      it("keeps each skill's own guidance when a category holds several", () => {
        const agentConfig: StackAgentConfig = {
          [GUIDED_CATEGORY]: [
            createMockSkillAssignment(GUIDED_SKILL.id, true),
            createMockSkillAssignment(SKILLS.scss.id),
          ],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(skills).toStrictEqual([
          { id: GUIDED_SKILL.id, usage: STATED_USAGE_GUIDANCE, preloaded: true },
          { id: SKILLS.scss.id, usage: FALLBACK_USAGE["web-client-state"], preloaded: false },
        ]);
      });

      /** Nothing to read: an empty bullet says nothing and a throw blocks consumption. */
      it("falls back to the category when the matrix carries no such skill", () => {
        const agentConfig: StackAgentConfig = {
          "web-tooling": [createMockSkillAssignment(CUSTOM_HOUSE_TOOLING_ID)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(skills).toStrictEqual([
          { id: CUSTOM_HOUSE_TOOLING_ID, usage: FALLBACK_USAGE["web-tooling"], preloaded: false },
        ]);
      });

      it("falls back to the category when the skill it carries states an empty guidance", () => {
        // A blank sentence is none: the schema admits "", and an empty bullet says nothing.
        initializeMatrix(createMockMatrix(createMockSkill(SKILLS.scss.id, { usageGuidance: " " })));
        const agentConfig: StackAgentConfig = {
          "web-styling": [createMockSkillAssignment(SKILLS.scss.id)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(skills).toStrictEqual([
          { id: SKILLS.scss.id, usage: FALLBACK_USAGE["web-styling"], preloaded: false },
        ]);
      });

      it("falls back to the category when the skill it carries states no guidance", () => {
        const agentConfig: StackAgentConfig = {
          "web-styling": [createMockSkillAssignment(SKILLS.scss.id, true)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(skills).toStrictEqual([
          { id: SKILLS.scss.id, usage: FALLBACK_USAGE["web-styling"], preloaded: true },
        ]);
        expect(warn, "a skill the matrix carries is not an unknown skill").not.toHaveBeenCalled();
      });

      /** Read from the matrix, since the subject is the wiring; the negative keeps it honest. */
      it("carries a catalogue skill's shipped guidance", () => {
        initializeMatrix(BUILT_IN_MATRIX);
        const stated = getSkillById(CATALOGUE_GUIDED_SKILL).usageGuidance;
        const agentConfig: StackAgentConfig = {
          [CATALOGUE_GUIDED_CATEGORY]: [createMockSkillAssignment(CATALOGUE_GUIDED_SKILL)],
        };

        const skills = resolveAgentConfigToSkills(agentConfig);

        expect(stated, "the catalogue entry this spec reads must still state guidance").toEqual(
          expect.any(String),
        );
        expect(skills).toStrictEqual([
          { id: CATALOGUE_GUIDED_SKILL, usage: stated, preloaded: false },
        ]);
        expect(firstElement(skills).usage).not.toBe(FALLBACK_USAGE["meta-design"]);
      });
    });
  });
});

describe("stacks-loader, what it says", () => {
  // The id still spells `shared-monorepo`; the matrix now answers `shared-task-runner`.
  const MOVED_SKILL: SkillId = "shared-monorepo-turborepo";
  const STALE_CATEGORY = "shared-monorepo";
  const REACT: SkillId = "web-framework-react";
  const VITEST: SkillId = "web-testing-vitest";
  const TESTING_LIBRARY: SkillId = "web-testing-react-testing-library";
  const DEFAULT_STACKS_PATH = "/project/config/stacks.ts";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    initializeMatrix(BUILT_IN_MATRIX);
  });

  /** A fresh module, so no earlier spec's cache answers; its logger is the one it calls. */
  async function freshLoader() {
    const loader = await import("./stacks-loader");
    const logger = await import("../../utils/logger");
    return { ...loader, verbose: vi.mocked(logger.verbose) };
  }

  it("takes a well-formed assignment object as it is, saying nothing", () => {
    expect(normalizeAgentConfig({ "web-framework": { id: REACT, preloaded: true } })).toStrictEqual(
      {
        "web-framework": [createMockSkillAssignment(REACT, true)],
      },
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about an assignment with no id, and passes it on for validation downstream", () => {
    expect(normalizeAgentConfig({ "web-framework": [{ preloaded: true }] })).toStrictEqual({
      "web-framework": [{ preloaded: true }],
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Malformed skill assignment in stack data: {"preloaded":true}',
    );
  });

  it.each([
    ["null", null, "null"],
    ["a number", 42, "42"],
  ])("warns about an assignment that is %s rather than an object", (_kind, item, shown) => {
    normalizeAgentConfig({ "web-framework": [item] });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Malformed skill assignment in stack data: ${shown}`,
    );
  });

  it("names each entry it re-keyed, with both categories, on one verbose line", () => {
    normalizeStackRecord({
      "web-developer": { [STALE_CATEGORY]: [MOVED_SKILL], "web-styling": [REACT] },
    });

    expect(verbose).toHaveBeenCalledExactlyOnceWith(
      "Re-keyed stack entries to their live category: shared-monorepo-turborepo (shared-monorepo -> shared-task-runner), web-framework-react (web-styling -> web-framework)",
    );
  });

  it("says nothing when every entry is under its live category", () => {
    normalizeStackRecord({ "web-developer": { "web-framework": [REACT] } });

    expect(verbose).not.toHaveBeenCalled();
  });

  it("keeps every skill a live category holds", () => {
    expect(
      normalizeStackRecord({ "web-developer": { "web-testing": [VITEST, TESTING_LIBRARY] } }),
    ).toStrictEqual({
      "web-developer": {
        "web-testing": [
          createMockSkillAssignment(VITEST),
          createMockSkillAssignment(TESTING_LIBRARY),
        ],
      },
    });
  });

  it("says where it found no stacks file", async () => {
    vi.mocked(loadConfig).mockResolvedValue(null);
    const { loadStacks, verbose: freshVerbose } = await freshLoader();

    await loadStacks("/project");

    expect(freshVerbose).toHaveBeenCalledExactlyOnceWith(
      `No stacks file found at ${DEFAULT_STACKS_PATH}`,
    );
  });

  it("says how many stacks it loaded and from where", async () => {
    vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());
    const { loadStacks, verbose: freshVerbose } = await freshLoader();

    await loadStacks("/project");

    expect(freshVerbose).toHaveBeenCalledExactlyOnceWith(
      `Loaded 2 stacks from ${DEFAULT_STACKS_PATH}`,
    );
  });

  it("names the file and carries the cause when the stacks file fails to load", async () => {
    const cause = new Error("ENOENT");
    vi.mocked(loadConfig).mockRejectedValue(cause);
    const { loadStacks } = await freshLoader();

    await expect(loadStacks("/project")).rejects.toMatchObject({
      message: `Failed to load stacks from '${DEFAULT_STACKS_PATH}': ENOENT`,
      cause,
    });
  });

  it("says which stack it found in the source's stacks file", async () => {
    vi.mocked(loadConfig).mockResolvedValue(createMockRawStacksConfig());
    const { loadStackById, verbose: freshVerbose } = await freshLoader();

    await loadStackById("vue-spa", "/project", TEST_CUSTOM_SOURCE_URL);

    expect(freshVerbose).toHaveBeenLastCalledWith("Found stack: Vue SPA (vue-spa)");
  });

  it("says a custom marketplace gets no built-in stand-in for a stack it does not ship", async () => {
    vi.mocked(loadConfig).mockResolvedValue(null);
    const { loadStackById, verbose: freshVerbose } = await freshLoader();

    await loadStackById(BUILT_IN_STACK_ID, "/project", TEST_CUSTOM_SOURCE_URL);

    expect(freshVerbose).toHaveBeenLastCalledWith(
      `Marketplace '${TEST_CUSTOM_SOURCE_URL}' does not ship stack '${BUILT_IN_STACK_ID}', and gets no built-in stand-in`,
    );
  });

  it("says which built-in stack stands in for the public catalogue", async () => {
    vi.mocked(loadConfig).mockResolvedValue(null);
    const { loadStackById, verbose: freshVerbose } = await freshLoader();

    await loadStackById(BUILT_IN_STACK_ID, "/project", DEFAULT_SOURCE);

    expect(freshVerbose).toHaveBeenLastCalledWith(
      `Found default stack: Next.js Full-Stack (${BUILT_IN_STACK_ID})`,
    );
  });

  it("says a stack is in neither the public catalogue nor the built-ins", async () => {
    vi.mocked(loadConfig).mockResolvedValue(null);
    const { loadStackById, verbose: freshVerbose } = await freshLoader();

    await loadStackById("nonexistent-stack", "/project", DEFAULT_SOURCE);

    expect(freshVerbose).toHaveBeenLastCalledWith(
      "Stack 'nonexistent-stack' not found in the default marketplace or the built-ins",
    );
  });

  it("refuses a stack a source does not offer in one wording", () => {
    expect(stackNotOfferedMessage(BUILT_IN_STACK_ID, TEST_CUSTOM_SOURCE_URL)).toBe(
      `Stack '${BUILT_IN_STACK_ID}' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone.`,
    );
  });
});
