import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConfigLoadError,
  configDirsInPlay,
  loadProjectConfig,
  loadProjectConfigFromDir,
  validateProjectConfig,
} from "./project-config";
import { generateProjectConfigFromSkills } from "./config-generator";
import { generateBlankGlobalConfigSource, generateConfigSource } from "./config-writer";
import type { AgentName } from "../../types";
import { initializeMatrix, matrix } from "../matrix/matrix-provider";
import { setVerbose } from "../../utils/logger";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeRawTestConfig, writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { renderConfigTs } from "../__tests__/content-generators.js";
import {
  renderConfigTsExportingAString,
  renderUnparseableConfigTs,
} from "../__tests__/factories/unloadable-config-factories.js";
import {
  buildAgentConfigs,
  buildPreRenameProjectConfig,
  buildPreRenameSkillEntryConfig,
  buildProjectConfig,
} from "../__tests__/factories/config-factories.js";
import { sa } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { SINGLE_REACT_MATRIX, WEB_PAIR_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { STANDARD_FILES } from "../../consts";
import { blankGlobalConfig } from "@workspace/compile/global-config";
import { getProjectConfigPath } from "../installation/install-base-dir.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { EXPECTED_SKILLS } from "../__tests__/expected-values";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type { SkillId, StackAgentConfig } from "../../types";

/** A skill the catalog moved; a config saved before the move keys it under `STALE_CATEGORY_KEY`. */
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
            "meta-reviewing": [sa("meta-reviewing-reviewing", true)],
            "meta-methodology": [sa("meta-methodology-research-methodology", true)],
            "web-styling": sa("web-styling-scss-modules", true),
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
            [STALE_CATEGORY_KEY]: [sa(MOVED_SKILL, true)],
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

    it("should load config with its optional author and description", async () => {
      const inputConfig = buildProjectConfig({
        name: "my-stack",
        author: "@vince",
        description: "A config with its optional fields",
      });
      await writeTestTsConfig(tempDir, inputConfig);

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(result!.config).toStrictEqual(inputConfig);
    });

    /** Loading the template must answer exactly `blankGlobalConfig()`, the preview's stand-in. */
    it("should load the blank global config template as the blank global config", async () => {
      await writeRawTestConfig(tempDir, generateBlankGlobalConfigSource());

      const result = await loadProjectConfig(tempDir);

      expect(result).not.toBeNull();
      expect(result!.config).toStrictEqual(blankGlobalConfig());
    });

    it("should throw for a config file that exists but is unparseable", async () => {
      await writeRawTestConfig(tempDir, "invalid typescript content {{");

      // A file that exists but cannot load is corrupt, not missing.
      await expect(loadProjectConfig(tempDir)).rejects.toThrow("could not be loaded");
    });

    it("should throw for a config whose default export is not an object", async () => {
      await writeRawTestConfig(tempDir, 'export default "just a string";');

      await expect(loadProjectConfig(tempDir)).rejects.toThrow("could not be loaded");
    });
  });

  describe("loadProjectConfigFromDir verbose reporting", () => {
    const consoleSpies = silenceConsole(["log"]);
    let savedHome: string;
    let homeDir: string;

    beforeEach(async () => {
      savedHome = process.env.HOME ?? "";
      homeDir = path.join(tempDir, "home");
      await mkdir(homeDir, { recursive: true });
      process.env.HOME = homeDir;
      setVerbose(true);
    });

    afterEach(() => {
      setVerbose(false);
      process.env.HOME = savedHome;
    });

    it("should announce a config loaded from the home root as the global one", async () => {
      await writeTestTsConfig(homeDir, buildProjectConfig());

      const result = await loadProjectConfigFromDir(homeDir, "claude");

      expect(result).not.toBeNull();
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringMatching(/global config/i));
      expect(
        consoleSpies.log,
        "the file at the home root is the global config — calling it the project config is a false claim",
      ).not.toHaveBeenCalledWith(expect.stringMatching(/project config/i));
    });

    it("should announce a config missing from the home root as the global one", async () => {
      const result = await loadProjectConfigFromDir(homeDir, "claude");

      expect(result).toBeNull();
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringMatching(/global config/i));
      expect(
        consoleSpies.log,
        "an absent global config is not an absent project config",
      ).not.toHaveBeenCalledWith(expect.stringMatching(/project config/i));
    });

    it("should announce a config loaded from a project as the project one", async () => {
      await writeTestTsConfig(tempDir, buildProjectConfig());

      const result = await loadProjectConfigFromDir(tempDir, "claude");

      expect(result).not.toBeNull();
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringMatching(/project config/i));
    });

    it("should announce a config missing from a project as the project one", async () => {
      const result = await loadProjectConfigFromDir(tempDir, "claude");

      expect(result).toBeNull();
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringMatching(/project config/i));
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

describe("loading a config: refusals and defaults", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-project-config-refusals-");
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  function loadingTheProject() {
    return loadProjectConfigFromDir(tempDir, "claude");
  }

  it("refuses an unparseable config with the parser's reason, as a project ConfigLoadError", async () => {
    await writeRawTestConfig(tempDir, renderUnparseableConfigTs());

    await expect(loadingTheProject()).rejects.toMatchObject({
      name: "ConfigLoadError",
      scope: "project",
      reason: expect.stringMatching(/^Failed to load config from '/),
    });
  });

  it("refuses a config that exports nothing as having no valid default export", async () => {
    const configPath = await writeRawTestConfig(tempDir, renderConfigTs({}));

    await expect(loadingTheProject()).rejects.toMatchObject({
      message: `Config at '${configPath}' could not be loaded: the file has no valid default export`,
    });
  });

  it("refuses a config whose default export is a string as having no valid default export", async () => {
    await writeRawTestConfig(tempDir, renderConfigTsExportingAString());

    await expect(loadingTheProject()).rejects.toMatchObject({
      reason: "the file has no valid default export",
    });
  });

  it("names every problem the schema finds in one reason", async () => {
    await writeRawTestConfig(
      tempDir,
      renderConfigTs({ name: "two-problems", skills: "nope", agents: "nope" }),
    );

    await expect(loadingTheProject()).rejects.toMatchObject({
      reason:
        "agents: Invalid input: expected array, received string; skills: Invalid input: expected array, received string",
    });
  });

  it("names the folder for a config with no name, and says so", async () => {
    const configPath = await writeRawTestConfig(
      tempDir,
      renderConfigTs({ skills: [], agents: [] }),
    );

    const loaded = await loadingTheProject();

    expect(loaded?.config.name).toBe(path.basename(tempDir));
    expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
      `  Warning: Project config at '${configPath}' is missing required 'name' field — defaulting to directory name`,
    );
  });

  it("gives a config with no skills none, and says so", async () => {
    const configPath = await writeRawTestConfig(
      tempDir,
      renderConfigTs({ name: "no-skills", agents: [] }),
    );

    const loaded = await loadingTheProject();

    expect(loaded?.config.skills).toStrictEqual([]);
    expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
      `  Warning: Project config at '${configPath}' is missing 'skills' array — defaulting to empty`,
    );
  });

  it("says nothing about a config that has a name and skills", async () => {
    await writeTestTsConfig(tempDir, buildProjectConfig());

    await loadingTheProject();

    expect(consoleSpies.warn).not.toHaveBeenCalled();
  });

  it("reads the project's config and the global one, or the global one alone at the home root", () => {
    expect(configDirsInPlay(tempDir)).toStrictEqual([tempDir, home.dir]);
    expect(configDirsInPlay(home.dir)).toStrictEqual([home.dir]);
  });

  it("looks for the global config once when run from the home root", async () => {
    setVerbose(true);

    expect(await loadProjectConfig(home.dir)).toBeNull();

    expect(consoleSpies.log).toHaveBeenCalledExactlyOnceWith(
      `  Global config not found at ${getProjectConfigPath(home.dir, "claude")}`,
    );
  });

  it("answers a configuration that is not an object with the schema's error and no warnings", () => {
    expect(validateProjectConfig(null)).toStrictEqual({
      valid: false,
      errors: ["Invalid input: expected object, received null"],
      warnings: [],
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

    const generated = generateProjectConfigFromSkills(
      "test-project",
      [...EXPECTED_SKILLS.WEB_DEFAULT],
      {
        selectedAgents,
        skillConfigs: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      },
    );

    const configDir = sourceFolderInUse(tempDir, "claude").dir;
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      generateConfigSource(generated, matrix),
    );

    const loaded = await loadProjectConfig(tempDir);

    // The loader normalizes every id to a full SkillAssignment, so the stack comes back denser.
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

    // Keyed by the category the skill sat in before the move.
    await writeTestTsConfig(tempDir, {
      ...buildProjectConfig({ name: "test-project" }),
      stack: {
        "web-developer": { [STALE_CATEGORY_KEY]: [sa(MOVED_SKILL, true)] },
      },
    } satisfies Record<string, unknown>);

    // The edit path: load, rebuild the stack with nothing new selected, save.
    const loaded = await loadProjectConfig(tempDir);
    const regenerated = generateProjectConfigFromSkills("test-project", [MOVED_SKILL], {
      selectedAgents,
      skillConfigs: buildSkillConfigs([MOVED_SKILL]),
      agentConfigs: buildAgentConfigs(selectedAgents),
      // Boundary cast: the parsed stack is keyed by string; narrow to AgentName.
      existingStack: loaded!.config.stack as Partial<Record<AgentName, StackAgentConfig>>,
      newlyAddedSkillIds: [],
    });
    await writeFile(
      getProjectConfigPath(tempDir, "claude"),
      generateConfigSource(regenerated, matrix),
    );

    const reloaded = await loadProjectConfig(tempDir);

    expect(
      reloaded!.config.stack,
      "an edit must not discard per-agent curation for a skill that changed category",
    ).toStrictEqual({
      "web-developer": { [LIVE_CATEGORY_KEY]: [sa(MOVED_SKILL, true)] },
    });
  });

  /** An old key would load clean under `.passthrough()` and repoint the install; refuse it. */
  describe("a config carrying a field name from before the rename", () => {
    it("refuses to load when the project-level source ref sits under the old key", async () => {
      await writeTestTsConfig(tempDir, buildPreRenameProjectConfig());

      const load = loadProjectConfigFromDir(tempDir, "claude");

      await expect(load).rejects.toBeInstanceOf(ConfigLoadError);
      await expect(load).rejects.toThrow(/source/);
      await expect(load).rejects.toThrow(/marketplace/);
    });

    it("refuses to load when a skill entry's provenance sits under the old key", async () => {
      await writeTestTsConfig(tempDir, buildPreRenameSkillEntryConfig());

      const load = loadProjectConfigFromDir(tempDir, "claude");

      await expect(load).rejects.toBeInstanceOf(ConfigLoadError);
      await expect(load).rejects.toThrow(/source/);
      await expect(load).rejects.toThrow(/origin/);
    });
  });

  it("should round-trip config with options (description/author)", async () => {
    initializeMatrix(SINGLE_REACT_MATRIX);
    const selectedAgents: AgentName[] = ["web-developer"];

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

    const configDir = sourceFolderInUse(tempDir, "claude").dir;
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      generateConfigSource(generated, matrix),
    );

    const loaded = await loadProjectConfig(tempDir);

    // The stack densifies on load, as above.
    expect(loaded).not.toBeNull();
    expect(loaded!.config).toStrictEqual({
      ...generated,
      stack: { "web-developer": { "web-framework": [sa("web-framework-react", true)] } },
    });
  });
});
