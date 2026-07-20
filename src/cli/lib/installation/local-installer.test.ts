import { mkdir, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Override GLOBAL_INSTALL_ROOT to a non-existent path so getGlobalConfigTypesPath()
// returns null in the default case — the dev machine's real ~/.claude-src/ must
// never affect tests. Individual tests that need the global-types-import form
// override this via Object.defineProperty inside a scoped describe block.
vi.mock("../../consts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../consts")>();
  return { ...mod, GLOBAL_INSTALL_ROOT: "/tmp/nonexistent-global-root" };
});

import { resolveInstallPaths } from "./install-base-dir";
import {
  installEject,
  writeScopedConfigs,
  buildEjectSkillsMap,
  buildCompileAgents,
  buildAgentScopeMap,
  mergeGlobalConfigs,
  setConfigMetadata,
  deregisterProjectPath,
  propagateGlobalChangesToProjects,
  writeConfigFile,
} from "./local-installer";
import type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  ProjectConfig,
  Skill,
  SkillId,
} from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createMockCopiedSkill,
  createMockSkill,
  createMockSkillEntry,
} from "../__tests__/factories/skill-factories";
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
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { fileExists } from "../../utils/fs";
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

vi.mock("../compiler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../compiler")>()),
  createLiquidEngine: vi.fn().mockResolvedValue({}),
  compileAgentForPlugin: vi.fn().mockResolvedValue("# compiled agent content"),
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
    // Use real isScopePairCompatible — pure scope rule used by computeScopeEligibilityGained
    isScopePairCompatible: original.isScopePairCompatible,
  };
});

// Access the mock to verify installMode is passed through
const mockCompileAgentForPlugin = vi.mocked((await import("../compiler")).compileAgentForPlugin);
const mockResolveAgents = vi.mocked((await import("../resolver")).resolveAgents);
const mockBuildSkillRefs = vi.mocked((await import("../resolver")).buildSkillRefsFromConfig);
const mockGenerateProjectConfig = vi.mocked(
  (await import("../configuration/config-generator")).generateProjectConfigFromSkills,
);
const mockBuildStackProperty = vi.mocked(
  (await import("../configuration/config-generator")).buildStackProperty,
);
const mockLoadStackById = vi.mocked((await import("../stacks/stacks-loader")).loadStackById);

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
    useFakeHome(() => tempDir);

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

    it("should pass per-skill source on skills to compileAgentForPlugin in plugin mode", async () => {
      // D-217: installMode is gone — per-skill `source` on each Skill drives
      // pluginRef attachment. Seed resolveAgents with a skill carrying a
      // marketplace source and assert the agent arg forwards it.
      const pluginSkill: Skill = createMockSkillEntry(TEST_SKILL_ID, false, {
        source: "agents-inc",
      });
      // Boundary cast: test provides partial agents record; mock only needs the test agent
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [pluginSkill],
        },
      } as unknown as Record<AgentName, AgentConfig>);

      // Override generateProjectConfigFromSkills to return plugin-sourced skills
      mockGenerateProjectConfig.mockReturnValueOnce(
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

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent, ...rest] = mockCompileAgentForPlugin.mock.calls[0];
      expect(name).toBe("web-developer");
      // Only the first two positional args carry behavioural contract; the last
      // two (sourcePath, engine) are infra and asserted only by arity.
      expect(rest).toHaveLength(2);
      expect(agent.skills).toStrictEqual([pluginSkill]);
      // Explicit per-skill assertion: every skill carries a non-"eject" source
      // (i.e., a marketplace name) so the compiler attaches pluginRef.
      for (const skill of agent.skills) {
        expect(skill.source).toBe("agents-inc");
      }
    });

    it("should pass per-skill source on skills to compileAgentForPlugin in eject mode", async () => {
      // D-217: installMode is gone — per-skill `source: "eject"` tells the
      // compiler to emit a bare id (no pluginRef). Seed resolveAgents with an
      // ejected skill and assert the agent arg forwards it.
      const ejectSkill: Skill = createMockSkillEntry(TEST_SKILL_ID, false, {
        source: "eject",
      });
      // Boundary cast: test provides partial agents record; mock only needs the test agent
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [ejectSkill],
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

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent, ...rest] = mockCompileAgentForPlugin.mock.calls[0];
      expect(name).toBe("web-developer");
      expect(rest).toHaveLength(2);
      expect(agent.skills).toStrictEqual([ejectSkill]);
      // Explicit per-skill assertion: every skill has source === "eject".
      for (const skill of agent.skills) {
        expect(skill.source).toBe("eject");
      }
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
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
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
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
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
    // Partial<Record<>> per CLAUDE.md — tests pass this through to callees that
    // require Record<AgentName, AgentDefinition>; the cast happens at each call
    // site where the empty map is acceptable because the callees don't read it.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

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
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false, // no existing project installation
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false, // no existing project installation, but project-scoped items exist
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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

      const copiedSkills = [createMockCopiedSkill("web-framework-react")];

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

      // web-nonexistent-skill is a deliberately-invalid id (not a matrix member) — cast stays
      const copiedSkills = [createMockCopiedSkill("web-nonexistent-skill" as SkillId)];

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
        createMockCopiedSkill("web-framework-react"),
        // web-nonexistent-skill is a deliberately-invalid id (not a matrix member) — cast stays
        createMockCopiedSkill("web-nonexistent-skill" as SkillId),
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

    it("records the incoming marketplace and source when the global config has none", () => {
      // Project init: ensureBlankGlobalConfig() creates `existing` moments earlier, so it
      // carries no source identity. The global config is the only record tying globally
      // installed plugins back to their marketplace — uninstall builds its `<id>@<marketplace>`
      // registry key from it.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        marketplace: "e2e-test-marketplace",
        source: "/path/to/skills",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBe("e2e-test-marketplace");
      expect(config.source).toBe("/path/to/skills");
      // Newly-filled source identity must mark the merge dirty — `needsGlobalWrite` is gated
      // on this flag, so a false here would skip the global write and drop the fields again.
      expect(changed, "newly recorded source identity must trigger the global write").toBe(true);
    });

    it("keeps the existing marketplace and source when the incoming init came from a different one", () => {
      // Fill-only precedence. The merge never removes skills, so after this merge the global
      // config holds plugins from BOTH marketplaces and the scalar label can only name one.
      // Repointing it from a project context would rewrite global state on behalf of every
      // other registered project, so the already-recorded value wins.
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplace: "first-marketplace",
        source: "/path/to/first",
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplace: "second-marketplace",
        source: "/path/to/second",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBe("first-marketplace");
      expect(config.source).toBe("/path/to/first");
      // No delta at all — the global config must not be rewritten for an identical merge.
      expect(changed).toBe(false);
    });

    it("leaves marketplace and source undefined when neither config records one", () => {
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBeUndefined();
      expect(config.source).toBeUndefined();
      expect(changed).toBe(false);
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
    // Partial<Record<>> per CLAUDE.md — cast at each call site below because the
    // callees require Record<AgentName, AgentDefinition>.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir, { setHome: false });

    it("should skip project config file when no existing config on disk and no project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

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
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      expect(await fileExists(globalConfigPath)).toBe(true);

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);

      // Project config should NOT be written (no existing project installation and no project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

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
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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

  // D-216 / D-228: writeScopedConfigs must emit project config-types.ts that
  // imports from the global install's config-types.ts (not an inlined standalone
  // union). Requires overriding GLOBAL_INSTALL_ROOT so getGlobalConfigTypesPath()
  // points at a test-controlled global dir.
  describe("writeScopedConfigs — project config-types imports from global", () => {
    // Partial<Record<>> per CLAUDE.md — cast at each call site below because the
    // callees require Record<AgentName, AgentDefinition>.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    let savedHome: string | undefined;
    let fakeHome: string;
    let consts: typeof import("../../consts");

    beforeEach(async () => {
      savedHome = process.env.HOME;
      fakeHome = path.join(tempDir, "fake-home");
      await mkdir(fakeHome, { recursive: true });
      process.env.HOME = fakeHome;

      // Point GLOBAL_INSTALL_ROOT at the fake home so getGlobalConfigTypesPath()
      // detects the seeded global config-types.ts file inside the test's tempDir.
      consts = await import("../../consts");
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: fakeHome,
        writable: true,
      });
    });

    afterEach(() => {
      // Restore the default mocked GLOBAL_INSTALL_ROOT so other tests don't pick
      // up the fake home after this block finishes.
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("emits project config-types.ts with import from global and extended SkillId union", async () => {
      // Seed a global config-types.ts so getGlobalConfigTypesPath() returns non-null
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-reviewer"], { scope: "project" }),
        ],
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Must be the import-and-extend form — not the standalone/inlined form
      expect(typesContent).toContain("import type {");
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");
      expect(typesContent).toContain("Domain as GlobalDomain");
      expect(typesContent).toContain("Category as GlobalCategory");

      // Project-scoped additions extend the global union
      expect(typesContent).toContain('export type SkillId = GlobalSkillId | "web-testing-vitest"');
      expect(typesContent).toContain('export type AgentName = GlobalAgentName | "web-reviewer"');

      // Global-scoped items are NOT inlined in the project types file — they're
      // reached via the GlobalSkillId / GlobalAgentName re-exports
      expect(typesContent).not.toContain('"web-framework-react"');
      expect(typesContent).not.toContain('"web-developer"');
    });

    it("emits only the global alias when there are no project-scoped items (pure propagation case)", async () => {
      // Seed a global config-types.ts so getGlobalConfigTypesPath() returns non-null
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      // All items are global-scoped; the only reason writeScopedConfigs writes the
      // project config here is projectInstallationExists=true (pre-existing project
      // install, e.g., the user ran `cc edit` in a project after a global install).
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        true, // projectInstallationExists — forces project config write
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Import form is still used; with no project-only items the aliases reduce
      // to the global unions directly
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("export type SkillId = GlobalSkillId;");
      expect(typesContent).toContain("export type AgentName = GlobalAgentName;");

      // No inlined skill IDs or agent names — everything flows through global
      expect(typesContent).not.toContain('"web-framework-react"');
      expect(typesContent).not.toContain('"web-developer"');
    });

    it("falls back to standalone config-types when no global install exists", async () => {
      // Intentionally do NOT create fakeHome/.claude-src/config-types.ts. With the
      // default GLOBAL_INSTALL_ROOT override in place, getGlobalConfigTypesPath()
      // returns null and regenerateConfigTypes falls back to the standalone path.
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });

      const projectDir = path.join(tempDir, "project-standalone");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Standalone form: inlined unions, no "as GlobalSkillId" import
      expect(typesContent).not.toContain("as GlobalSkillId");
      expect(typesContent).toContain('"web-framework-react"');
    });
  });

  describe("deregisterProjectPath", () => {
    const fakeHomeHandle = useFakeHome(() => tempDir);

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
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
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
    // Partial<Record<>> per CLAUDE.md — cast at each call site below because the
    // callees require Record<AgentName, AgentDefinition>.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    it("should return empty arrays when no projects registered", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
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
        emptyAgents as Record<AgentName, AgentDefinition>,
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
        emptyAgents as Record<AgentName, AgentDefinition>,
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

      await propagateGlobalChangesToProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const typesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
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

      await propagateGlobalChangesToProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

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
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [] });
    });

    it("drops a skill tombstone when the global skill has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global no longer installs react — the tombstone is now stale.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.every((s) => s.id !== "web-framework-react")).toBe(true);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("preserves a skill tombstone when the global skill still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global still installs react — the tombstone must survive.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.skills.some(
          (s) => s.id === "web-framework-react" && s.scope === "global" && s.excluded === true,
        ),
      ).toBe(true);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("drops an agent tombstone when the global agent has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-reviewer"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global no longer installs web-developer — the tombstone is now stale.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.agents.every((a) => a.name !== "web-developer")).toBe(true);
      expect(parsedConfig.agents.some((a) => a.name === "web-reviewer")).toBe(true);
    });

    it("preserves an agent tombstone when the global agent still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-reviewer"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global still installs web-developer — the tombstone must survive.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.agents.some(
          (a) => a.name === "web-developer" && a.scope === "global" && a.excluded === true,
        ),
      ).toBe(true);
      expect(parsedConfig.agents.some((a) => a.name === "web-reviewer")).toBe(true);
    });
  });

  // D-216 / D-228: propagateGlobalChangesToProjects writes PROJECT config-types.ts
  // for every registered project when a global-scope change happens. Those project
  // types files must use the same global-aware import-and-extend form that
  // writeScopedConfigs uses during project init/edit — otherwise a global edit
  // would flip every project's types file from import-form back to standalone.
  describe("propagateGlobalChangesToProjects — project config-types imports from global", () => {
    // Partial<Record<>> per CLAUDE.md — cast at each call site below because the
    // callees require Record<AgentName, AgentDefinition>.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    let fakeHome: string;
    let consts: typeof import("../../consts");

    beforeEach(async () => {
      fakeHome = path.join(tempDir, "fake-home");
      await mkdir(fakeHome, { recursive: true });

      consts = await import("../../consts");
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: fakeHome,
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });
    });

    it("emits import-and-extend project config-types when global install exists", async () => {
      // Seed a global config-types.ts so the global-aware branch kicks in
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      // Project owns a project-scoped skill/agent before propagation runs
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        agents: buildAgentConfigs(["web-reviewer"], { scope: "project" }),
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

      await propagateGlobalChangesToProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents as Record<AgentName, AgentDefinition>,
      );

      const projectTypesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Must be the import-and-extend form
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");

      // Project-scoped items extend the global unions
      expect(typesContent).toContain('export type SkillId = GlobalSkillId | "web-testing-vitest"');
      expect(typesContent).toContain('export type AgentName = GlobalAgentName | "web-reviewer"');

      // Global items are NOT inlined — they flow through GlobalSkillId / GlobalAgentName
      expect(typesContent).not.toContain('"web-framework-react"');
      expect(typesContent).not.toContain('"web-developer"');
    });
  });
});
