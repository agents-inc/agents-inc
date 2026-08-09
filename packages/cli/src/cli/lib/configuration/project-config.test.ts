import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectConfig, validateProjectConfig } from "./project-config";
import { generateProjectConfigFromSkills } from "./config-generator";
import { generateConfigSource } from "./config-writer";
import type { AgentName } from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { buildProjectConfig, buildAgentConfigs } from "../__tests__/factories/config-factories.js";
import { sa } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { SINGLE_REACT_MATRIX, WEB_PAIR_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../consts";
import { EXPECTED_SKILLS } from "../__tests__/expected-values";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type { SkillId, StackAgentConfig } from "../../types";

/**
 * A skill the catalog moved between releases: the id still spells the category
 * it left, and the matrix answers with the one it joined. A config saved before
 * the move keys the entry under `STALE_CATEGORY_KEY`.
 */
const MOVED_SKILL: SkillId = "shared-monorepo-turborepo";
const STALE_CATEGORY_KEY = "shared-monorepo";
const LIVE_CATEGORY_KEY = "shared-task-runner";

describe("project-config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-project-config-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("loadProjectConfig", () => {
    it("should return null if config file does not exist", async () => {
      const result = await loadProjectConfig(tempDir);
      expect(result).toBeNull();
    });

    it("should load minimal config (just name and agents)", async () => {
      const inputConfig = buildProjectConfig({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
      });
      await writeTestTsConfig(tempDir, inputConfig);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(result!.config).toStrictEqual(inputConfig);
    });

    it("should preserve per-agent model and effort", async () => {
      const inputConfig = buildProjectConfig({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer"], { model: "haiku", effort: "xhigh" }),
      });
      await writeTestTsConfig(tempDir, inputConfig);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(
        result!.config.agents,
        "an agent's model and effort are the user's deliberate choice — the loader must not strip them",
      ).toStrictEqual(inputConfig.agents);
    });

    it("should load config with stack (bare strings normalized to SkillAssignment[])", async () => {
      await writeTestTsConfig(tempDir, {
        ...buildProjectConfig({ name: "my-project" }),
        stack: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "web-styling": "web-styling-scss-modules",
          },
        },
      } satisfies Record<string, unknown>);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      // Bare strings are normalized to SkillAssignment[] at load time
      expect(result!.config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
          "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
        },
      });
    });

    it("should load config with mixed stack formats (array, object, string)", async () => {
      await writeTestTsConfig(tempDir, {
        ...buildProjectConfig({ name: "my-project" }),
        stack: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "meta-reviewing": [{ id: "meta-reviewing-reviewing", preloaded: true }],
            "meta-methodology": [{ id: "meta-methodology-research-methodology", preloaded: true }],
            "web-styling": {
              id: "web-styling-scss-modules",
              preloaded: true,
            },
          },
        },
      } satisfies Record<string, unknown>);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(result!.config.stack).toStrictEqual({
        "web-developer": {
          // bare string -> SkillAssignment[]
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
          // array of objects -> SkillAssignment[]
          "meta-reviewing": [{ id: "meta-reviewing-reviewing", preloaded: true }],
          "meta-methodology": [{ id: "meta-methodology-research-methodology", preloaded: true }],
          // single object -> SkillAssignment[]
          "web-styling": [{ id: "web-styling-scss-modules", preloaded: true }],
        },
      });
    });

    it("should re-key a stack entry whose skill has since changed category", async () => {
      initializeMatrix(BUILT_IN_MATRIX);
      await writeTestTsConfig(tempDir, {
        ...buildProjectConfig({ name: "my-project" }),
        stack: {
          "web-developer": {
            [STALE_CATEGORY_KEY]: [{ id: MOVED_SKILL, preloaded: true }],
          },
        },
      } satisfies Record<string, unknown>);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(
        result!.config.stack,
        "the category is where an entry is stored, not which skill it names",
      ).toStrictEqual({
        "web-developer": { [LIVE_CATEGORY_KEY]: [sa(MOVED_SKILL, true)] },
      });
    });

    it("should load config with extra fields (passthrough)", async () => {
      const inputConfig = {
        ...buildProjectConfig({ name: "my-stack" }),
        author: "@vince",
        description: "A config with extra fields",
      };
      await writeTestTsConfig(tempDir, inputConfig);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(result!.config).toStrictEqual(inputConfig);
    });

    it("should throw for a config file that exists but is unparseable", async () => {
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      // A file that exists but cannot load is corrupt, not "missing" — it must
      // surface, never collapse into null.
      await expect(loadProjectConfig(tempDir)).rejects.toThrow("could not be loaded");
    });

    it("should throw for a config whose default export is not an object", async () => {
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        'export default "just a string";',
      );

      await expect(loadProjectConfig(tempDir)).rejects.toThrow("could not be loaded");
    });
  });

  describe("validateProjectConfig", () => {
    it("should pass for minimal valid config", () => {
      const result = validateProjectConfig(buildProjectConfig());

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail for missing name", () => {
      const result = validateProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("name is required and must be a string");
    });

    it("should fail for missing agents", () => {
      const result = validateProjectConfig({
        name: "my-project",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("agents is required and must be an array");
    });

    it("should fail for non-object agents", () => {
      const result = validateProjectConfig({
        name: "my-project",
        agents: ["web-developer", 123],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([
        "agents.0: Invalid input: expected object, received string",
        "agents.1: Invalid input: expected object, received number",
      ]);
    });

    it("should fail for non-object config", () => {
      const result = validateProjectConfig("not an object");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid input: expected object, received string");
    });

    it("should fail for null config", () => {
      const result = validateProjectConfig(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid input: expected object, received null");
    });
  });
});

describe("round-trip tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-roundtrip-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should round-trip minimal config (name and stack only)", async () => {
    initializeMatrix(WEB_PAIR_MATRIX);
    const selectedAgents: AgentName[] = ["web-developer"];

    // Generate config
    const generated = generateProjectConfigFromSkills(
      "test-project",
      [...EXPECTED_SKILLS.WEB_DEFAULT],
      {
        selectedAgents,
        skillConfigs: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      },
    );

    // Write to temp dir as config
    const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      generateConfigSource(generated),
    );

    // Load it back
    const loaded = await loadProjectConfig(tempDir);

    // Verify full config shape. The generator emits sparse assignments and the
    // writer compacts them to bare ids; the loader normalizes every id back to a
    // full SkillAssignment, so the stack comes back denser than it went out.
    expect(loaded).not.toBeNull();
    expect(loaded!.config).toStrictEqual({
      ...generated,
      stack: {
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
          "web-client-state": [sa("web-state-zustand", true)],
        },
      },
    });
  });

  it("should carry a moved skill's curation through an edit save", async () => {
    initializeMatrix(BUILT_IN_MATRIX);
    const selectedAgents: AgentName[] = ["web-developer"];

    // On disk from before the move: the entry is keyed by the category the
    // skill sat in then, and carries the load the user curated.
    await writeTestTsConfig(tempDir, {
      ...buildProjectConfig({ name: "test-project" }),
      stack: {
        "web-developer": { [STALE_CATEGORY_KEY]: [{ id: MOVED_SKILL, preloaded: true }] },
      },
    } satisfies Record<string, unknown>);

    // The edit path: load, rebuild the stack with nothing new selected, save.
    const loaded = await loadProjectConfig(tempDir);
    const regenerated = generateProjectConfigFromSkills("test-project", [MOVED_SKILL], {
      selectedAgents,
      skillConfigs: buildSkillConfigs([MOVED_SKILL]),
      agentConfigs: buildAgentConfigs(selectedAgents),
      // Boundary cast: ProjectConfig.stack types agents as Record<string, …>
      // (it comes from parsed TS); narrow to typed AgentName keys.
      existingStack: loaded!.config.stack as Partial<Record<AgentName, StackAgentConfig>>,
      newlyAddedSkillIds: [],
    });
    await writeFile(
      path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      generateConfigSource(regenerated),
    );

    const reloaded = await loadProjectConfig(tempDir);

    expect(
      reloaded!.config.stack,
      "an edit must not discard per-agent curation for a skill that changed category",
    ).toStrictEqual({
      "web-developer": { [LIVE_CATEGORY_KEY]: [sa(MOVED_SKILL, true)] },
    });
  });

  it("should round-trip config with options (description/author)", async () => {
    initializeMatrix(SINGLE_REACT_MATRIX);
    const selectedAgents: AgentName[] = ["web-developer"];

    // Generate config with options
    const generated = generateProjectConfigFromSkills(
      "my-awesome-project",
      ["web-framework-react"],
      {
        description: "An awesome project for testing",
        author: "@testuser",
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      },
    );

    // Write to temp dir as config
    const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      generateConfigSource(generated),
    );

    // Load it back
    const loaded = await loadProjectConfig(tempDir);

    // Verify full config shape — the stack densifies on load, as above.
    expect(loaded).not.toBeNull();
    expect(loaded!.config).toStrictEqual({
      ...generated,
      stack: { "web-developer": { "web-framework": [sa("web-framework-react", true)] } },
    });
  });
});
