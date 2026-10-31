import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { STACKS_FILE_PATH, STANDARD_FILES } from "../../consts";
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
import { renderConfigTs } from "../__tests__/content-generators";
import { renderUnparseableConfigTs } from "../__tests__/factories/unloadable-config-factories.js";
import { writeTestFile } from "../__tests__/fixtures/create-test-source";

vi.mock("../../utils/logger");

import {
  loadStackById,
  loadStacks,
  normalizeAgentConfig,
  normalizeStackRecord,
  resolveAgentConfigToSkills,
  stackNotOfferedMessage,
} from "./stacks-loader";
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

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map(cleanupTempDir));
});

/** A directory no earlier spec loaded from, so the loader's per-process cache cannot answer. */
async function freshDir(): Promise<string> {
  const dir = await createTempDir("cc-stacks-loader-");
  tempDirs.push(dir);
  return dir;
}

async function writeStacksFile(
  dir: string,
  stacksConfig: Record<string, unknown>,
  stacksFile = STACKS_FILE_PATH,
): Promise<void> {
  await writeTestFile(path.join(dir, stacksFile), renderConfigTs(stacksConfig));
}

async function writeCataloguePackage(packageName: string): Promise<string> {
  const dir = await freshDir();
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
  beforeEach(() => {
    initializeMatrix(stacksTestMatrix);
  });

  describe("loadStacks", () => {
    it("loads and parses stacks from config/stacks.ts", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());

      const stacks = await loadStacks(dir);

      expect(stacks).toHaveLength(2);
      expect(firstElement(stacks).id).toBe("nextjs-fullstack");
      expect(firstElement(stacks).name).toBe("Next.js Full-Stack");
      expect(elementAt(stacks, 1).id).toBe("vue-spa");
    });

    it("returns empty array when stacks file does not exist", async () => {
      expect(await loadStacks(await freshDir())).toStrictEqual([]);
    });

    it("throws descriptive error for load failure", async () => {
      const dir = await freshDir();
      await writeTestFile(path.join(dir, STACKS_FILE_PATH), renderUnparseableConfigTs());

      await expect(loadStacks(dir)).rejects.toThrow(/Failed to load stacks/);
    });

    it("answers a second load from the first, without reading the file again", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());
      const first = await loadStacks(dir);

      await writeStacksFile(dir, createMockRawStacksConfigWithArrays());

      expect(
        await loadStacks(dir),
        "a second load answers from the first, not from the rewritten file",
      ).toStrictEqual(first);
    });

    it("loads stacks from custom stacksFile path", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig(), "data/my-stacks.ts");

      const stacks = await loadStacks(dir, "data/my-stacks.ts");

      expect(stacks.map((stack) => stack.id)).toStrictEqual(["nextjs-fullstack", "vue-spa"]);
    });

    it("keeps a separate answer for each stacks file in one directory", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());
      await writeStacksFile(dir, createMockRawStacksConfigWithArrays(), "custom/stacks.ts");

      const fromDefault = await loadStacks(dir);
      const fromCustom = await loadStacks(dir, "custom/stacks.ts");

      expect(fromDefault.map((stack) => stack.id)).toStrictEqual(["nextjs-fullstack", "vue-spa"]);
      expect(fromCustom.map((stack) => stack.id)).toStrictEqual(["multi-select-stack"]);
    });

    it("normalizes bare string values to SkillAssignment[] with preloaded: false", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());

      const stacks = await loadStacks(dir);

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
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfigWithArrays());

      const stacks = await loadStacks(dir);

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
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfigWithObjects());

      const stacks = await loadStacks(dir);

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
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());

      const stack = await loadStackById("vue-spa", dir, TEST_CUSTOM_SOURCE_URL);

      expect(stack).not.toBeNull();
      expect(stack!.id).toBe("vue-spa");
      expect(stack!.name).toBe("Vue SPA");
    });

    it("returns null when stack ID not found", async () => {
      const dir = await freshDir();
      await writeStacksFile(dir, createMockRawStacksConfig());

      const stack = await loadStackById("nonexistent-stack", dir, TEST_CUSTOM_SOURCE_URL);

      expect(stack).toBeNull();
    });

    it("returns null when no stacks file exists and ID is not a default stack", async () => {
      const stack = await loadStackById("nonexistent-stack", await freshDir(), DEFAULT_SOURCE);

      expect(stack).toBeNull();
    });

    it("falls back to a built-in stack under the default public marketplace", async () => {
      const stack = await loadStackById(BUILT_IN_STACK_ID, await freshDir(), DEFAULT_SOURCE);

      expect(stack).not.toBeNull();
      expect(stack!.id).toBe(BUILT_IN_STACK_ID);
      expect(stack!.name).toBe("Next.js Full-Stack");
    });

    it("returns null for a built-in stack id under a custom source", async () => {
      // The built-in catalogue belongs to the public marketplace; other sources get no stacks.
      const stack = await loadStackById(
        BUILT_IN_STACK_ID,
        await freshDir(),
        TEST_CUSTOM_SOURCE_URL,
      );

      expect(stack).toBeNull();
    });

    // Pairs with `resolveOfferedStacks`: a stack offered from a checkout must also resolve.
    it("resolves a built-in stack id from the public catalogue's own repository", async () => {
      const catalogueDir = await writeCataloguePackage(PUBLIC_CATALOGUE_PACKAGE);

      const stack = await loadStackById(BUILT_IN_STACK_ID, catalogueDir, catalogueDir);

      expect(stack, "a checkout of the catalogue is still the catalogue").not.toBeNull();
      expect(stack!.id).toBe(BUILT_IN_STACK_ID);
    });

    it("returns null for a repository whose package merely resembles the catalogue's", async () => {
      const lookalikeDir = await writeCataloguePackage(`${PUBLIC_CATALOGUE_PACKAGE}-extra`);

      const stack = await loadStackById(BUILT_IN_STACK_ID, lookalikeDir, lookalikeDir);

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

  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

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
    const dir = await freshDir();
    const stacksPath = path.join(dir, STACKS_FILE_PATH);

    await loadStacks(dir);

    expect(vi.mocked(verbose).mock.calls).toStrictEqual([
      [`Config not found at ${stacksPath}`],
      [`No stacks file found at ${stacksPath}`],
    ]);
  });

  it("says how many stacks it loaded and from where", async () => {
    const dir = await freshDir();
    await writeStacksFile(dir, createMockRawStacksConfig());

    await loadStacks(dir);

    expect(verbose).toHaveBeenCalledExactlyOnceWith(
      `Loaded 2 stacks from ${path.join(dir, STACKS_FILE_PATH)}`,
    );
  });

  it("names the file and carries the cause when the stacks file fails to load", async () => {
    const dir = await freshDir();
    const stacksPath = path.join(dir, STACKS_FILE_PATH);
    await writeTestFile(stacksPath, renderUnparseableConfigTs());
    const loadFailure = `Failed to load config from '${stacksPath}'`;

    await expect(loadStacks(dir)).rejects.toMatchObject({
      message: expect.stringContaining(
        `Failed to load stacks from '${stacksPath}': ${loadFailure}`,
      ),
      cause: expect.objectContaining({ message: expect.stringContaining(loadFailure) }),
    });
  });

  it("says which stack it found in the source's stacks file", async () => {
    const dir = await freshDir();
    await writeStacksFile(dir, createMockRawStacksConfig());

    await loadStackById("vue-spa", dir, TEST_CUSTOM_SOURCE_URL);

    expect(verbose).toHaveBeenLastCalledWith("Found stack: Vue SPA (vue-spa)");
  });

  it("says a custom marketplace gets no built-in stand-in for a stack it does not ship", async () => {
    await loadStackById(BUILT_IN_STACK_ID, await freshDir(), TEST_CUSTOM_SOURCE_URL);

    expect(verbose).toHaveBeenLastCalledWith(
      `Marketplace '${TEST_CUSTOM_SOURCE_URL}' does not ship stack '${BUILT_IN_STACK_ID}', and gets no built-in stand-in`,
    );
  });

  it("says which built-in stack stands in for the public catalogue", async () => {
    await loadStackById(BUILT_IN_STACK_ID, await freshDir(), DEFAULT_SOURCE);

    expect(verbose).toHaveBeenLastCalledWith(
      `Found default stack: Next.js Full-Stack (${BUILT_IN_STACK_ID})`,
    );
  });

  it("says a stack is in neither the public catalogue nor the built-ins", async () => {
    await loadStackById("nonexistent-stack", await freshDir(), DEFAULT_SOURCE);

    expect(verbose).toHaveBeenLastCalledWith(
      "Stack 'nonexistent-stack' not found in the default marketplace or the built-ins",
    );
  });

  it("refuses a stack a source does not offer in one wording, naming the stack it ships", () => {
    expect(
      stackNotOfferedMessage(BUILT_IN_STACK_ID, TEST_CUSTOM_SOURCE_URL, ["acme-starter"]),
    ).toBe(
      `Stack '${BUILT_IN_STACK_ID}' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships: acme-starter.`,
    );
  });

  it("names every stack a source ships as one list", () => {
    expect(
      stackNotOfferedMessage(BUILT_IN_STACK_ID, TEST_CUSTOM_SOURCE_URL, [
        "acme-api",
        "acme-starter",
        "acme-web",
      ]),
    ).toBe(
      `Stack '${BUILT_IN_STACK_ID}' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships: acme-api, acme-starter and acme-web.`,
    );
  });

  it("says a source that ships no stacks ships none", () => {
    expect(stackNotOfferedMessage(BUILT_IN_STACK_ID, TEST_CUSTOM_SOURCE_URL, [])).toBe(
      `Stack '${BUILT_IN_STACK_ID}' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships no stacks.`,
    );
  });

  it("names a stack id a link wrote a terminal control and a line break into inert, on one line", () => {
    expect(
      stackNotOfferedMessage("stk\u001B]0;S\u0007\nNothing is removed.", TEST_CUSTOM_SOURCE_URL, [
        "acme-starter",
      ]),
    ).toBe(
      `Stack 'stk Nothing is removed.' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships: acme-starter.`,
    );
  });

  it("names a shipped stack id a marketplace wrote a terminal control and a line break into inert, on one line", () => {
    expect(
      stackNotOfferedMessage(BUILT_IN_STACK_ID, TEST_CUSTOM_SOURCE_URL, [
        "stk\u001B]0;S\u0007\nNothing is removed.",
      ]),
    ).toBe(
      `Stack '${BUILT_IN_STACK_ID}' is not a stack the source '${TEST_CUSTOM_SOURCE_URL}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships: stk Nothing is removed.`,
    );
  });
});
