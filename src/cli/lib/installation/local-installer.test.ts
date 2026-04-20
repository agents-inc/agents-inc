import { mkdir, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installEject,
  writeScopedConfigs,
  resolveInstallPaths,
  buildEjectSkillsMap,
  buildCompileAgents,
  buildAgentScopeMap,
  mergeGlobalConfigs,
  setConfigMetadata,
  deregisterProjectPath,
  propagateGlobalChangesToProjects,
  writeConfigFile,
} from "./local-installer";
import type { AgentConfig, AgentDefinition, AgentName, ProjectConfig, SkillId } from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { createMockSkill } from "../__tests__/factories/skill-factories";
import { createMockAgent } from "../__tests__/factories/agent-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  buildWizardResult,
  buildProjectConfig,
  buildSourceResult,
  buildAgentConfigs,
} from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { readTestTsConfig } from "../__tests__/helpers/config-io";
import { expectInstallResult } from "../__tests__/assertions/index.js";
import { SKILLS } from "../__tests__/test-fixtures";
import {
  EMPTY_MATRIX,
  FULLSTACK_PAIR_MATRIX,
  SINGLE_REACT_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
} from "../../consts";
import { generateConfigSource } from "../configuration/config-writer";

// Mock heavy dependencies that involve file system operations outside our temp dir
vi.mock("../skills/skill-copier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../skills/skill-copier")>()),
  copySkillsToLocalFlattened: vi.fn().mockResolvedValue([]),
}));

vi.mock("../loading/loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading/loader")>()),
  loadAllAgents: vi.fn().mockResolvedValue({}),
}));

vi.mock("../stacks/stacks-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stacks/stacks-loader")>();
  return {
    ...actual,
    loadStackById: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../resolver")>()),
  resolveAgents: vi.fn().mockResolvedValue({}),
  buildSkillRefsFromConfig: vi.fn().mockReturnValue([]),
}));

vi.mock("../stacks/stack-plugin-compiler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stacks/stack-plugin-compiler")>()),
  compileAgentForPlugin: vi.fn().mockResolvedValue("# compiled agent content"),
}));

vi.mock("../compiler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../compiler")>()),
  createLiquidEngine: vi.fn().mockResolvedValue({}),
}));

vi.mock("../configuration/config-generator", async (importOriginal) => {
  const original = await importOriginal<typeof import("../configuration/config-generator")>();
  return {
    generateProjectConfigFromSkills: vi.fn().mockReturnValue({
      // Uses literal values because vi.mock factories are hoisted above imports
      name: "agents-inc",
      agents: [],
      skills: [{ id: "test-skill", scope: "project", source: "eject" }],
    }),
    buildStackProperty: vi.fn().mockReturnValue({}),
    // Use real splitConfigByScope for scope-aware config writing
    splitConfigByScope: original.splitConfigByScope,
    // Use real scopeEligibilityKey — pure string helper used by buildEjectConfig's
    // D-220 delta computation.
    scopeEligibilityKey: original.scopeEligibilityKey,
  };
});

// Access the mock to verify installMode is passed through
const mockCompileAgentForPlugin = vi.mocked(
  (await import("../stacks/stack-plugin-compiler")).compileAgentForPlugin,
);

// Boundary cast: fictional skill ID used throughout local-installer tests
const TEST_SKILL_ID = "meta-test-skill" as SkillId;

describe("local-installer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-installer-test-");
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("installEject", () => {
    let savedHome: string | undefined;

    beforeEach(async () => {
      savedHome = process.env.HOME;
      const fakeHome = path.join(tempDir, "fake-home");
      await mkdir(fakeHome, { recursive: true });
      process.env.HOME = fakeHome;
    });

    afterEach(() => {
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("should create required directories", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Verify directories were created
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(path.join(tempDir, CLAUDE_DIR, "skills"))).toBe(true);
      expect(await fileExists(path.join(tempDir, CLAUDE_DIR, "agents"))).toBe(true);
      expect(await fileExists(path.join(tempDir, CLAUDE_SRC_DIR))).toBe(true);
    });

    it("should write config to .claude-src/config.ts", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Verify config was written — full round-trip through disk
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
      expect(result.configPath).toBe(configPath);
    });

    it("should include source in config from sourceFlag", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
        sourceFlag: "github:my-org/skills",
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: "github:my-org/skills",
      });
    });

    it("should include source from sourceResult when no sourceFlag", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        sourceConfig: {
          source: "github:default/source",
          sourceOrigin: "project",
        },
      });

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: "github:default/source",
      });
    });

    it("should include marketplace in config when available", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        marketplace: "my-marketplace",
      });

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
        marketplace: "my-marketplace",
      });
    });

    it("should return correct result structure", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result).toStrictEqual({
        copiedSkills: [],
        config: {
          name: DEFAULT_PLUGIN_NAME,
          agents: [],
          skills: [{ id: "test-skill", scope: "project", source: "eject" }],
          source: tempDir,
        },
        configPath: path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        compiledAgents: [],
        wasMerged: false,
        mergedConfigPath: undefined,
        skillsDir: path.join(tempDir, LOCAL_SKILLS_PATH),
        agentsDir: path.join(tempDir, CLAUDE_DIR, "agents"),
      });
    });

    it("should merge with existing config when present", async () => {
      // Write an existing config in TS format
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      // Boundary cast: test provides a synthetic agent name not in the AgentName union
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        generateConfigSource({
          name: "existing-project",
          agents: [{ name: "existing-agent" as AgentName, scope: "project" as const }],
          skills: [],
          author: "@existing",
        }),
      );

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expectInstallResult(result, {
        copiedSkillIds: [],
        compiledAgents: [],
        wasMerged: true,
      });
      expect(result.mergedConfigPath).toBe(
        path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      );
      // Existing name should take precedence
      expect(result.config.name).toBe("existing-project");
      // Existing author should be preserved
      expect(result.config.author).toBe("@existing");
    });

    it("should derive local installMode from skill configs", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "eject" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // installMode is derived from skills at runtime, not stored on config
      expect(result.config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
    });

    it("should not set wasMerged when no existing config", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expectInstallResult(result, {
        copiedSkillIds: [],
        compiledAgents: [],
        wasMerged: false,
      });
      expect(result.mergedConfigPath).toBeUndefined();
    });

    it("should pass installMode to compileAgentForPlugin", async () => {
      // resolveAgents returns one agent so compileAgentForPlugin gets called
      const mockResolveAgents = vi.mocked((await import("../resolver")).resolveAgents);
      // Boundary cast: test provides partial agents record; mock only needs the test agent
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [],
        },
      } as unknown as Record<AgentName, AgentConfig>);

      // Override generateProjectConfigFromSkills to return plugin-sourced skills
      const mockGenerateConfig = vi.mocked(
        (await import("../configuration/config-generator")).generateProjectConfigFromSkills,
      );
      mockGenerateConfig.mockReturnValueOnce(
        buildProjectConfig({
          name: "agents-inc",
          skills: buildSkillConfigs([TEST_SKILL_ID], { source: "agents-inc" }),
        }),
      );

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "agents-inc" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      mockCompileAgentForPlugin.mockClear();

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // compileAgentForPlugin should have been called with installMode as the 5th arg
      // deriveInstallMode returns "plugin" when all skills have non-local source
      expect(mockCompileAgentForPlugin).toHaveBeenCalledWith(
        "web-developer",
        expect.any(Object),
        expect.any(String),
        expect.any(Object),
        "plugin",
      );
    });

    it("should pass local installMode to compileAgentForPlugin", async () => {
      const mockResolveAgents = vi.mocked((await import("../resolver")).resolveAgents);
      // Boundary cast: test provides partial agents record; mock only needs the test agent
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [],
        },
      } as unknown as Record<AgentName, AgentConfig>);

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "eject" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      mockCompileAgentForPlugin.mockClear();

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(mockCompileAgentForPlugin).toHaveBeenCalledWith(
        "web-developer",
        expect.any(Object),
        expect.any(String),
        expect.any(Object),
        "eject",
      );
    });

    it("should write valid config with satisfies ProjectConfig", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const configContent = await readFile(configPath, "utf-8");

      // Should use plain object export with satisfies
      expect(configContent).not.toContain("defineConfig");
      expect(configContent).toContain("export default {");
      expect(configContent).toContain("satisfies ProjectConfig");

      // Should parse back to the exact expected config
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
    });

    it("should preserve preloaded flags from stack skill assignments", async () => {
      // Stack-picked init seeds `existingStack` from `buildStackProperty(loadedStack)`.
      // The real `generateProjectConfigFromSkills` then inherits preloaded flags via
      // `wasPreviouslyPreloaded` for every (agent, category, skill) triple the stack
      // author marked. Exercise the real seam end-to-end — no config-generator mocks.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      const mockGenerateConfig = vi.mocked(
        (await import("../configuration/config-generator")).generateProjectConfigFromSkills,
      );
      const mockBuildStackProperty = vi.mocked(
        (await import("../configuration/config-generator")).buildStackProperty,
      );
      mockGenerateConfig.mockImplementationOnce(configGenerator.generateProjectConfigFromSkills);
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);

      const mockLoadStackById = vi.mocked((await import("../stacks/stacks-loader")).loadStackById);
      mockLoadStackById.mockResolvedValueOnce({
        id: "test-stack",
        name: "Test Stack",
        description: "A test stack",
        agents: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });

      const selectedAgents: AgentName[] = ["web-developer"];
      const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]), {
        selectedStackId: "test-stack",
        selectedAgents,
        agentConfigs: buildAgentConfigs(selectedAgents),
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Preloaded: true from the stack YAML must round-trip into the final config stack
      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);

      // And it must be persisted to disk identically
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      const parsedWebDev = parsedConfig.stack?.["web-developer"] as Record<string, unknown>;
      expect(parsedWebDev?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
    });

    it("stack-picked init filters unselected agents out of the stack", async () => {
      // When the wizard picks a stack but the user deselects some of its agents,
      // the final config.stack must only contain the selected agents. Ownership-driven
      // stack construction (in generateProjectConfigFromSkills) drops agents not in
      // `selectedAgents` even when the stack YAML lists them.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      const mockGenerateConfig = vi.mocked(
        (await import("../configuration/config-generator")).generateProjectConfigFromSkills,
      );
      const mockBuildStackProperty = vi.mocked(
        (await import("../configuration/config-generator")).buildStackProperty,
      );
      mockGenerateConfig.mockImplementationOnce(configGenerator.generateProjectConfigFromSkills);
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);

      const mockLoadStackById = vi.mocked((await import("../stacks/stacks-loader")).loadStackById);
      mockLoadStackById.mockResolvedValueOnce({
        id: "fullstack",
        name: "Fullstack",
        description: "Web + API",
        agents: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
        },
      });

      // User selected only web-developer; api-developer is intentionally absent.
      const selectedAgents: AgentName[] = ["web-developer"];
      const wizardResult = buildWizardResult(
        buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        {
          selectedStackId: "fullstack",
          selectedAgents,
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Only web-developer appears in the final stack — api-developer is filtered
      // because the user did not select it, despite the stack YAML listing it.
      expect(Object.keys(result.config.stack ?? {})).toStrictEqual(["web-developer"]);
      expect(result.config.stack?.["api-developer"]).toBeUndefined();
      // Full content: guards against a silent regression that preserves the key
      // but drops or mutates the SkillAssignment payload.
      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
    });
  });

  describe("writeScopedConfigs", () => {
    // Boundary cast: empty agents record for tests that don't need agent definitions
    const emptyAgents = {} as Record<AgentName, AgentDefinition>;
    let savedHome: string | undefined;
    let globalHome: string;

    beforeEach(async () => {
      savedHome = process.env.HOME;
      globalHome = path.join(tempDir, "fake-home");
      await mkdir(globalHome, { recursive: true });
      process.env.HOME = globalHome;
    });

    afterEach(() => {
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("should skip project config when no existing project installation and no project-scoped items", async () => {
      // Setup: all items are global-scoped, so project split will be empty.
      // No project installation exists, so project config should be skipped.
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

      // Ensure project .claude-src/ directory exists but do NOT create config.ts
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false, // no existing project installation
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(globalConfigPath)).toBe(true);

      // Project config should NOT be written (no existing config and no project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has skills", async () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-reviewer"]),
        ],
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false, // no existing project installation, but project-scoped items exist
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(globalConfigPath)).toBe(true);
      // Project config should be written (has project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(true);

      // Verify project config contains the project-scoped skill
      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  describe("resolveInstallPaths", () => {
    it("should resolve project-scope paths relative to projectDir", () => {
      const result = resolveInstallPaths("/my/project", "project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    });

    it("should resolve global-scope paths relative to home directory", () => {
      const homeDir = os.homedir();
      const result = resolveInstallPaths("/my/project", "global");

      expect(result.skillsDir).toBe(path.join(homeDir, LOCAL_SKILLS_PATH));
      expect(result.agentsDir).toBe(path.join(homeDir, CLAUDE_DIR, "agents"));
      expect(result.configPath).toBe(path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
    });

    it("should default to project scope when no scope argument provided", () => {
      const result = resolveInstallPaths("/my/project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    });
  });

  describe("buildEjectSkillsMap", () => {
    it("should map copied skills that exist in the matrix", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const copiedSkills = [
        {
          skillId: "web-framework-react" as SkillId,
          contentHash: "abc123",
          sourcePath: "/source/skills/react",
          destPath: "/project/.claude/skills/web-framework-react",
        },
      ];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result["web-framework-react"]).toStrictEqual({
        id: "web-framework-react",
        description: SINGLE_REACT_MATRIX.skills["web-framework-react"]!.description,
        path: "/project/.claude/skills/web-framework-react",
        content: "",
      });
    });

    it("should filter out copied skills not in the matrix", () => {
      initializeMatrix(EMPTY_MATRIX);

      const copiedSkills = [
        {
          skillId: "web-nonexistent-skill" as SkillId,
          contentHash: "abc123",
          sourcePath: "/source/skills/nonexistent",
          destPath: "/project/.claude/skills/web-nonexistent-skill",
        },
      ];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result).toStrictEqual({});
    });

    it("should return empty map when no skills are copied", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const result = buildEjectSkillsMap([]);

      expect(result).toStrictEqual({});
    });

    it("should handle mixed copied skills — some in matrix, some not", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const copiedSkills = [
        {
          skillId: "web-framework-react" as SkillId,
          contentHash: "abc123",
          sourcePath: "/source/skills/react",
          destPath: "/project/.claude/skills/web-framework-react",
        },
        {
          skillId: "web-nonexistent-skill" as SkillId,
          contentHash: "def456",
          sourcePath: "/source/skills/nonexistent",
          destPath: "/project/.claude/skills/web-nonexistent-skill",
        },
      ];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result).toStrictEqual({
        "web-framework-react": {
          id: "web-framework-react",
          description: SINGLE_REACT_MATRIX.skills["web-framework-react"]!.description,
          path: "/project/.claude/skills/web-framework-react",
          content: "",
        },
      });
    });
  });

  describe("buildCompileAgents", () => {
    it("should build compile agents for agents in the definition record", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const agents: Record<AgentName, AgentDefinition> = {
        "web-developer": createMockAgent("web-developer"),
      } as Record<AgentName, AgentDefinition>;

      const result = buildCompileAgents(config, agents);

      expect(result).toStrictEqual({
        "web-developer": { skills: [] },
      });
    });

    it("should skip agents not in the definition record", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
      });
      // Only web-developer has a definition
      const agents: Record<AgentName, AgentDefinition> = {
        "web-developer": createMockAgent("web-developer"),
      } as Record<AgentName, AgentDefinition>;

      const result = buildCompileAgents(config, agents);

      expect(result["web-developer"]).toStrictEqual({});
      expect(result["api-developer"]).toBeUndefined();
    });

    it("should return empty skills when agent has no stack mapping", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        // No stack property
      });
      const agents: Record<AgentName, AgentDefinition> = {
        "web-developer": createMockAgent("web-developer"),
      } as Record<AgentName, AgentDefinition>;

      const result = buildCompileAgents(config, agents);

      expect(result["web-developer"]).toStrictEqual({});
    });

    it("should filter global agent skills to only global-scoped skills (cross-scope safety net)", async () => {
      // Set up buildSkillRefsFromConfig mock to return both skills
      const mockBuildSkillRefs = vi.mocked((await import("../resolver")).buildSkillRefsFromConfig);
      mockBuildSkillRefs.mockReturnValueOnce([
        { id: "web-framework-react", usage: "when working with web-framework" },
        { id: "web-testing-vitest", usage: "when working with web-testing" },
      ]);

      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });
      const agents: Record<AgentName, AgentDefinition> = {
        "web-developer": createMockAgent("web-developer"),
      } as Record<AgentName, AgentDefinition>;

      const result = buildCompileAgents(config, agents);

      // Global agent should only see web-testing-vitest (global scope), not web-framework-react (project scope)
      const skills = result["web-developer"].skills ?? [];
      const skillIds = skills.map((s) => s.id);
      expect(skillIds).toContain("web-testing-vitest");
      expect(skillIds).not.toContain("web-framework-react");
    });

    it("should not filter project-scoped agent skills", async () => {
      // Set up buildSkillRefsFromConfig mock to return both skills
      const mockBuildSkillRefs = vi.mocked((await import("../resolver")).buildSkillRefsFromConfig);
      mockBuildSkillRefs.mockReturnValueOnce([
        { id: "web-framework-react", usage: "when working with web-framework" },
        { id: "web-testing-vitest", usage: "when working with web-testing" },
      ]);

      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });
      const agents: Record<AgentName, AgentDefinition> = {
        "web-developer": createMockAgent("web-developer"),
      } as Record<AgentName, AgentDefinition>;

      const result = buildCompileAgents(config, agents);

      // Project agent should see all skills regardless of scope
      const skills = result["web-developer"].skills ?? [];
      const skillIds = skills.map((s) => s.id);
      expect(skillIds).toContain("web-framework-react");
      expect(skillIds).toContain("web-testing-vitest");
    });

    describe("excluded filtering", () => {
      it("should exclude skills with excluded: true from compilation", async () => {
        const mockBuildSkillRefs = vi.mocked(
          (await import("../resolver")).buildSkillRefsFromConfig,
        );
        mockBuildSkillRefs.mockReturnValueOnce([
          { id: "web-framework-react", usage: "when working with web-framework" },
          { id: "web-testing-vitest", usage: "when working with web-testing" },
        ]);

        const config = buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs(["web-framework-react"]),
            ...buildSkillConfigs(["web-testing-vitest"], { excluded: true }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: false }],
              "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
            },
          },
        });
        const agents: Record<AgentName, AgentDefinition> = {
          "web-developer": createMockAgent("web-developer"),
        } as Record<AgentName, AgentDefinition>;

        const result = buildCompileAgents(config, agents);

        const skills = result["web-developer"].skills ?? [];
        const skillIds = skills.map((s) => s.id);
        expect(skillIds).toContain("web-framework-react");
        expect(skillIds).not.toContain("web-testing-vitest");
      });

      it("should exclude agents with excluded: true from compilation", () => {
        const config = buildProjectConfig({
          agents: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["api-developer"], { excluded: true }),
          ],
          skills: buildSkillConfigs(["web-framework-react"]),
        });
        const agents: Record<AgentName, AgentDefinition> = {
          "web-developer": createMockAgent("web-developer"),
          "api-developer": createMockAgent("api-developer"),
        } as Record<AgentName, AgentDefinition>;

        const result = buildCompileAgents(config, agents);

        expect(result["web-developer"]).toStrictEqual({});
        expect(result["api-developer"]).toBeUndefined();
      });

      it("should handle mixed active and excluded entries for the same skill ID", async () => {
        const mockBuildSkillRefs = vi.mocked(
          (await import("../resolver")).buildSkillRefsFromConfig,
        );
        mockBuildSkillRefs.mockReturnValueOnce([
          { id: "web-framework-react", usage: "when working with web-framework" },
        ]);

        const config = buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs(["web-framework-react"]),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
              excluded: true,
            }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: false }],
            },
          },
        });
        const agents: Record<AgentName, AgentDefinition> = {
          "web-developer": createMockAgent("web-developer"),
        } as Record<AgentName, AgentDefinition>;

        const result = buildCompileAgents(config, agents);

        // The active (non-excluded) entry should still produce skills
        const skills = result["web-developer"].skills ?? [];
        expect(skills.map((s) => s.id)).toContain("web-framework-react");
      });
    });
  });

  describe("buildAgentScopeMap", () => {
    it("should build a map from agent names to their scopes", () => {
      const config = buildProjectConfig({
        agents: [
          ...buildAgentConfigs(["web-developer"]),
          ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ],
      });

      const result = buildAgentScopeMap(config);

      expect(result.get("web-developer")).toBe("project");
      expect(result.get("api-developer")).toBe("global");
    });

    it("should return empty map for config with no agents", () => {
      const config = buildProjectConfig({ agents: [] });

      const result = buildAgentScopeMap(config);

      expect(result.size).toBe(0);
    });

    it("should handle single agent", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
      });

      const result = buildAgentScopeMap(config);

      expect(result.size).toBe(1);
      expect(result.get("web-developer")).toBe("project");
    });
  });

  describe("mergeGlobalConfigs", () => {
    it("adds new category to existing agent's stack, preserving existing categories", () => {
      // Scenario: global has web-developer.web-framework. User adds a new global skill in
      // web-styling owned by web-developer. Incoming carries both categories. Additive merge:
      // the new category is appended, the existing category is preserved as-is.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        // Existing category preserved (preloaded: false kept, NOT overwritten to true)
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        // New category appended from incoming
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("preserves existing per-agent stack entry when incoming omits the agent", () => {
      // Scenario: an agent lives in existing global stack but has moved to project scope,
      // so splitConfigByScope omits it from incoming.stack. The existing entry must survive.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "api-developer": {
            "api-framework": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
          // api-developer intentionally absent (moved to project scope)
        },
      });

      const { config } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["api-developer"]).toStrictEqual({
        "api-framework": [{ id: "api-framework-hono", preloaded: false }],
      });
      // Existing entry survives unchanged (not replaced, not merged)
      expect(config.stack?.["api-developer"]).toStrictEqual(existing.stack?.["api-developer"]);
      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
    });

    it("appends new skill under existing category, preserving existing skill", () => {
      // Additive-per-skill: react stays, vue is appended. Project-context edits cannot
      // remove vue from global; they'd tombstone it in the project config instead.
      const sharedSkills = buildSkillConfigs(
        ["web-framework-react", "web-framework-vue-composition-api"],
        { scope: "global" },
      );
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-vue-composition-api", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [
          { id: "web-framework-react", preloaded: false },
          { id: "web-framework-vue-composition-api", preloaded: false },
        ],
      });
      expect(changed).toBe(true);
    });

    it("adds skill to new agent while preserving it on existing agent", () => {
      // Additive across agents: react stays on web-developer AND is added to web-reviewer.
      // Project-context edits cannot remove web-developer's assignment from global.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer", "web-reviewer"], {
        scope: "global",
      });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(config.stack?.["web-reviewer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("leaves changed false for a fully identical merge", () => {
      // Guards against Approach C creep — identical configs must not be flagged dirty.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const sharedStack: NonNullable<ProjectConfig["stack"]> = {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      };
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        domains: ["web"],
        selectedAgents: ["web-developer"],
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        domains: ["web"],
        selectedAgents: ["web-developer"],
      });

      const { changed } = mergeGlobalConfigs(existing, incoming);

      expect(changed).toBe(false);
    });

    it("preserves existing skills when incoming omits a skill under an existing category", () => {
      // Tombstone scenario: existing global has [react, vue]; user tombstones vue in the
      // PROJECT config so splitConfigByScope emits incoming global with [react] only.
      // Additive merge must preserve vue on the global side — the project's tombstone is
      // expressed in the project config, never by rewriting global state.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-framework-vue-composition-api"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-vue-composition-api", preloaded: false },
            ],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [
          { id: "web-framework-react", preloaded: false },
          { id: "web-framework-vue-composition-api", preloaded: false },
        ],
      });
      expect(changed).toBe(false);
    });

    it("preserves existing preloaded flag when incoming has different preloaded for same triple", () => {
      // Additive-only: existing `preloaded: true` is authoritative. Project-context edits
      // cannot flip a global skill's preloaded flag; the existing entry wins.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: true }],
      });
      expect(changed).toBe(false);
    });

    it("preserves existing category when incoming omits it entirely for an existing agent", () => {
      // Whole-category tombstone: project tombstones every hono skill so incoming global
      // for web-developer has web-framework only. The api-api category (only in existing)
      // must survive.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "api-framework": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "api-framework": [{ id: "api-framework-hono", preloaded: false }],
      });
      expect(changed).toBe(false);
    });

    it("does not mutate inputs and returns unaliased stack references", () => {
      // Rich overlap scenario: exercises every clone path in additiveMergeStack.
      //   - web-developer / web-framework:  react overlaps (existing wins), vue omitted from
      //     incoming (existing preserved), preloaded flag dedup path hit.
      //   - web-developer / web-styling:    existing-only category (untouched by incoming).
      //   - web-developer / web-testing:    incoming-only new category (append-clone path).
      //   - api-developer:                  existing-only agent (must survive absence in incoming).
      //   - web-reviewer:                   incoming-only agent (full structuredClone path).
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(
          [
            "web-framework-react",
            "web-framework-vue-composition-api",
            "web-styling-scss-modules",
            "api-framework-hono",
          ],
          { scope: "global" },
        ),
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-vue-composition-api", preloaded: true },
            ],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
          "api-developer": {
            "api-framework": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer", "web-reviewer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      // Snapshot inputs before the call — deep clone detaches snapshots from live refs.
      const existingSnapshot = structuredClone(existing);
      const incomingSnapshot = structuredClone(incoming);

      const { config } = mergeGlobalConfigs(existing, incoming);

      // 1. Structural immutability — neither input's deep structure changed.
      expect(existing).toStrictEqual(existingSnapshot);
      expect(incoming).toStrictEqual(incomingSnapshot);

      // 2. Reference non-sharing at the stack level. Mutating the merged output's nested
      //    array must NOT bleed into `existing`. We use an overlapping (agent, category)
      //    pair so the merged array was cloned out of `existing.stack` — the exact path
      //    that a shallow clone would corrupt.
      const mergedWebFramework = config.stack?.["web-developer"]?.["web-framework"];
      const existingWebFramework = existing.stack?.["web-developer"]?.["web-framework"];
      expect(mergedWebFramework).toBeDefined();
      expect(existingWebFramework).toBeDefined();
      const existingWebFrameworkLengthBefore = existingWebFramework!.length;
      const SENTINEL = { id: "web-framework-react" as SkillId, preloaded: true as const };
      mergedWebFramework!.push(SENTINEL);
      // Existing array untouched — same length, no sentinel leaked in.
      expect(existing.stack?.["web-developer"]?.["web-framework"]).toHaveLength(
        existingWebFrameworkLengthBefore,
      );
      expect(existing.stack?.["web-developer"]?.["web-framework"]).not.toContain(SENTINEL);
      // And the input still matches its pre-call snapshot after the sentinel push to the output.
      expect(existing).toStrictEqual(existingSnapshot);

      // 3. Reference non-sharing for incoming-only agents — `web-reviewer` was cloned out
      //    of `incoming.stack`, so mutating the merged entry must not corrupt incoming.
      const mergedWebReviewer = config.stack?.["web-reviewer"]?.["web-framework"];
      expect(mergedWebReviewer).toBeDefined();
      mergedWebReviewer!.push(SENTINEL);
      expect(incoming).toStrictEqual(incomingSnapshot);
    });
  });

  describe("setConfigMetadata", () => {
    it("should return a new config with domains when selectedDomains is non-empty", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: ["web", "api"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.domains).toStrictEqual(["web", "api"]);
    });

    it("should not set domains when selectedDomains is empty", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: [],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.domains).toBeUndefined();
    });

    it("should set selectedAgents when non-empty", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedAgents: ["web-developer", "api-developer"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.selectedAgents).toStrictEqual(["web-developer", "api-developer"]);
    });

    it("should not set selectedAgents when empty", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedAgents: [],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.selectedAgents).toBeUndefined();
    });

    it("should prefer sourceFlag over sourceResult.sourceConfig.source", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        sourceConfig: { source: "github:default/source", sourceOrigin: "project" },
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult, "github:my-org/skills");

      expect(result.source).toBe("github:my-org/skills");
    });

    it("should use sourceResult.sourceConfig.source when no sourceFlag", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        sourceConfig: { source: "github:default/source", sourceOrigin: "project" },
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.source).toBe("github:default/source");
    });

    it("should set marketplace when available", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        marketplace: "my-marketplace",
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.marketplace).toBe("my-marketplace");
    });

    it("should not mutate the original config object", () => {
      const config = buildProjectConfig();
      const originalName = config.name;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: ["web"],
        selectedAgents: ["web-developer"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        marketplace: "my-marketplace",
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult, "github:my/repo");

      // Original config should not be mutated
      expect(config.domains).toBeUndefined();
      expect(config.selectedAgents).toBeUndefined();
      expect(config.source).toBeUndefined();
      expect(config.marketplace).toBeUndefined();
      expect(config.name).toBe(originalName);

      // Result should have the new values
      expect(result.domains).toStrictEqual(["web"]);
      expect(result.selectedAgents).toStrictEqual(["web-developer"]);
      expect(result.source).toBe("github:my/repo");
      expect(result.marketplace).toBe("my-marketplace");
    });
  });

  describe("writeScopedConfigs with HOME isolation", () => {
    // Moved from e2e/lifecycle/unified-config-view.e2e.test.ts — these are unit tests
    // that call writeScopedConfigs directly, not E2E tests.
    // Boundary cast: empty agents record for tests that don't need agent definitions
    const emptyAgents = {} as Record<AgentName, AgentDefinition>;
    let savedHome: string | undefined;
    let globalHome: string;

    beforeEach(async () => {
      savedHome = process.env.HOME;
      globalHome = path.join(tempDir, "fake-home");
      await mkdir(globalHome, { recursive: true });
    });

    afterEach(() => {
      // Restore HOME after each test
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("should skip project config file when no existing config on disk and no project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = globalHome;

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(globalConfigPath)).toBe(true);

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);

      // Project config should NOT be written (no existing project installation and no project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = globalHome;

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-reviewer"]),
        ],
      });

      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(globalConfigPath)).toBe(true);
      // Project config should be written (has project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(true);

      // Verify project config contains the project-scoped skill (parsed, not just string check)
      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      // Project config should inline global data (no import globalConfig)
      const projectContent = await readFile(projectConfigPath, "utf-8");
      expect(projectContent).not.toContain("import globalConfig");
      expect(projectContent).toContain("// global");
      expect(projectContent).toContain("web-framework-react");

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  describe("deregisterProjectPath", () => {
    let savedHome: string | undefined;
    let globalHome: string;

    beforeEach(async () => {
      savedHome = process.env.HOME;
      globalHome = path.join(tempDir, "fake-home");
      await mkdir(globalHome, { recursive: true });
      process.env.HOME = globalHome;
    });

    afterEach(() => {
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("should remove project from global config's projects array", async () => {
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      // Write a global config that lists projectDir in projects
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      await deregisterProjectPath(projectDir);

      const updatedConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(updatedConfig.projects ?? []).toStrictEqual([]);
    });

    it("should not modify config when project not in list", async () => {
      const otherPath = path.join(tempDir, "other-project");
      await mkdir(otherPath, { recursive: true });

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [otherPath],
      });
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      // Deregister a path that isn't in the list
      const nonexistentDir = path.join(tempDir, "nonexistent");
      await mkdir(nonexistentDir, { recursive: true });
      await deregisterProjectPath(nonexistentDir);

      const updatedConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(updatedConfig.projects).toStrictEqual([otherPath]);
    });

    it("should do nothing when global config has no projects field", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const globalConfigPath = path.join(globalHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      // Should not throw
      await expect(deregisterProjectPath(anyDir)).resolves.toBeUndefined();
    });

    it("should do nothing when no global config exists", async () => {
      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      // No global config on disk — should not throw
      await expect(deregisterProjectPath(anyDir)).resolves.toBeUndefined();
    });
  });

  describe("propagateGlobalChangesToProjects", () => {
    // Boundary cast: empty agents record for tests that don't need agent definitions
    const emptyAgents = {} as Record<AgentName, AgentDefinition>;

    it("should return empty arrays when no projects registered", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [] });
    });

    it("should skip stale project paths", async () => {
      const stalePath = path.join(tempDir, "nonexistent-project");

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [stalePath],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [stalePath] });
    });

    it("should skip current project dir", async () => {
      // Set up two project dirs with configs on disk
      const projectA = path.join(tempDir, "project-a");
      const projectB = path.join(tempDir, "project-b");

      for (const dir of [projectA, projectB]) {
        const configDir = path.join(dir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const projectConfig = buildProjectConfig({
          name: path.basename(dir),
          skills: [],
          agents: [],
        });
        await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));
      }

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectA, projectB],
      });

      // Pass projectA as currentProjectDir — only projectB should be updated
      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
        projectA,
      );

      expect(result.updated).toStrictEqual([projectB]);
      expect(result.skipped).toStrictEqual([]);
    });

    it("should update config-types.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const typesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      const { fileExists } = await import("../../utils/fs");
      expect(await fileExists(typesPath)).toBe(true);

      const typesContent = await readFile(typesPath, "utf-8");
      expect(typesContent).toContain("web-framework-react");
    });

    it("should update config.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"]),
        agents: buildAgentConfigs(["web-reviewer"]),
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      // Verify the config file was updated with global data
      const configContent = await readFile(configPath, "utf-8");
      expect(configContent).toContain("web-framework-react");

      // Parse config and verify project-scoped skill is preserved
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("should handle empty projects list", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [] });
    });
  });
});
