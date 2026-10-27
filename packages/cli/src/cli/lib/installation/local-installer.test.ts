import { chmod, mkdir, writeFile, readFile, readdir, realpath, symlink } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getProjectConfigPath, resolveInstallPaths } from "./install-base-dir";
import { sourceFolderInUse } from "./install-layout.js";
import { buildAgentScopeMap } from "./local-installer";
import { writeProjectConfig } from "../operations/project/write-project-config.js";
// Deep import: the pair writers live in config-gate and are deliberately not re-exported.
import {
  mergeGlobalConfigs,
  propagateGlobalChangesToProjects,
  pruneGlobalEntriesFromRegisteredProjects,
  writeConfigFile as writeConfigFileUngated,
} from "../config-gate/propagate.js";
import { withGateToken } from "../config-gate/gate-token.js";
import {
  mutateGlobal,
  writeScopeConfigTypes,
  writeConfigByScope,
  type GateDeps,
  type GateReport,
} from "../config-gate/index.js";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../../types";
import { initializeMatrix, matrix as activeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { sa } from "../__tests__/factories/skill-factories";
import { createMockAgent } from "../__tests__/factories/agent-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  buildGateReport,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
  buildAgentConfigs,
} from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { readGeneratedUnion } from "../__tests__/helpers/generated-types.js";
import { readTestTsConfig } from "../__tests__/helpers/config-io";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { loadSkillsFromAllSources } from "../loading";
import { DEFAULT_SOURCE } from "../configuration";
import { NO_CHANGES } from "../config-gate/classify.js";
import { fileExists } from "../../utils/fs";
import { SKILLS } from "../__tests__/test-fixtures";
import {
  CATEGORY_EXCLUSIVITY_MATRIX,
  EMPTY_MATRIX,
  FULLSTACK_PAIR_MATRIX,
  FULLSTACK_TRIO_MATRIX,
  REACT_HONO_WEB_API_DOMAINS_MATRIX,
  SINGLE_REACT_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import {
  CLAUDE_DIR,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
} from "../../consts";
import { generateConfigSource } from "../configuration/config-writer";

/** Holds the gate's write token: some fixtures are the global pair at the fake home. */
function writeConfigFile(...args: Parameters<typeof writeConfigFileUngated>): Promise<void> {
  return withGateToken(() => writeConfigFileUngated(...args));
}

/** Throws, so "a deregistration loads nothing" is asserted rather than assumed. */
const DEPS_A_DEREGISTRATION_MUST_NOT_NEED: GateDeps = {
  loadMatrix: () => {
    throw new Error("a deregistration must not need the matrix");
  },
  loadAgents: () => {
    throw new Error("a deregistration must not need the agent definitions");
  },
};

function deregisterProjectPath(projectDir: string): Promise<GateReport> {
  return mutateGlobal(
    { kind: "deregister-project", projectDir, provider: "claude" },
    DEPS_A_DEREGISTRATION_MUST_NOT_NEED,
  );
}

async function writeScopedConfigs(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  projectDir: string,
  projectConfigPath: string,
  projectInstallationExists: boolean,
): Promise<void> {
  await writeConfigByScope({
    finalConfig,
    matrix,
    agents,
    projectDir,
    projectConfigPath,
    projectInstallationExists,
  });
}

/** The writer only checks the file exists and imports it by path, so it can be empty. */
async function seedGlobalConfigTypes(homeDir: string): Promise<void> {
  const globalSourceDir = sourceFolderInUse(homeDir, "claude").dir;
  await mkdir(globalSourceDir, { recursive: true });
  await writeFile(
    path.join(globalSourceDir, STANDARD_FILES.CONFIG_TYPES_TS),
    "// global config-types placeholder",
  );
}

async function regenerateScopeConfigTypes(
  projectDir: string,
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Promise<void> {
  await writeScopeConfigTypes(projectDir, config, { matrix, agents });
}

/** Read-only file in a writable directory, so cleanup still removes it. */
const READ_ONLY_FILE = 0o444;

describe("local-installer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-installer-test-");
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("writeProjectConfig", () => {
    beforeEach(() => initializeMatrix(SINGLE_REACT_MATRIX));

    const fakeHome = useFakeHome(() => tempDir);
    const fakeHomeDir = (): string => fakeHome.dir;

    it("should create the config directory and seed the global pair it inherits from", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(await fileExists(sourceFolderInUse(tempDir, "claude").dir)).toBe(true);
      // A project write also ensures the global pair exists; `.claude/skills/` and
      // `.claude/agents/` belong to the copy and compile steps.
      expect(await fileExists(getProjectConfigPath(fakeHomeDir(), "claude"))).toBe(true);
      expect(await fileExists(path.join(tempDir, CLAUDE_DIR, "skills"))).toBe(false);
    });

    it("should write config into the source folder the project is on", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: tempDir,
      });
      expect(result.configPath).toBe(configPath);
    });

    it("should include source in config from sourceFlag", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
        sourceFlag: "github:my-org/skills",
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: "github:my-org/skills",
      });
    });

    it("should include source from sourceResult when no sourceFlag", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        sourceConfig: {
          source: "github:default/source",
          sourceOrigin: "project",
        },
      });

      await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: "github:default/source",
      });
    });

    it("should include marketplace in config when available", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        marketplace: "my-marketplace",
      });

      await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: tempDir,
        marketplaceName: "my-marketplace",
      });
    });

    it("should return correct result structure", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result).toStrictEqual({
        config: {
          name: path.basename(tempDir),
          agents: [],
          skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
          marketplace: tempDir,
        },
        configPath: getProjectConfigPath(tempDir, "claude"),
        wasMerged: false,
        // The only global change: this project was registered.
        propagation: buildGateReport([], {
          changes: { ...NO_CHANGES, projectsChanged: true },
        }),
      });
      expect(
        (await readdir(sourceFolderInUse(tempDir, "claude").dir)).sort(),
        "a project write lands both halves of the project's own pair",
      ).toStrictEqual([STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS].sort());
      expect(
        (await readdir(sourceFolderInUse(fakeHomeDir(), "claude").dir)).sort(),
        "a project write seeds both halves of the global pair it inherits from",
      ).toStrictEqual([STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS].sort());
    });

    it("should merge with existing config when present", async () => {
      const configDir = sourceFolderInUse(tempDir, "claude").dir;
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        generateConfigSource(
          buildProjectConfig({
            name: "existing-project",
            agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
            skills: [],
            author: "@existing",
          }),
          activeMatrix,
        ),
      );

      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.wasMerged).toBe(true);
      expect(result.existingConfigPath).toBe(getProjectConfigPath(tempDir, "claude"));
      expect(result.config.name).toBe("existing-project");
      expect(result.config.author).toBe("@existing");
    });

    it("stores no install mode on the config it writes", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(
        buildSkillConfigs([SKILLS.react.id], { origin: "eject" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: tempDir,
      });
    });

    it("should not set wasMerged when no existing config", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.wasMerged).toBe(false);
      expect(result.existingConfigPath).toBeUndefined();
    });

    it("should write valid config with satisfies ProjectConfig", async () => {
      const matrix = SINGLE_REACT_MATRIX;
      const selection = buildInstallSelection(buildSkillConfigs([SKILLS.react.id]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const configContent = await readFile(configPath, "utf-8");

      expect(configContent).not.toContain("defineConfig");
      expect(configContent).toContain("export default {");
      expect(configContent).toContain("satisfies ProjectConfig");

      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
        marketplace: tempDir,
      });
    });

    it("writes a seed payload's assignedStack verbatim, cross-domain rows included", async () => {
      // `assignedStack` rows are the sharer's choices and are never re-filtered by relevance, even
      // across domains.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const selectedAgents: AgentName[] = ["api-developer", "web-developer"];
      const selection = buildInstallSelection(
        buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        {
          selectedAgents,
          agentConfigs: buildAgentConfigs(selectedAgents),
          assignedStack: {
            "api-developer": {
              "web-framework": [sa("web-framework-react", true)],
            },
            "web-developer": {
              "web-framework": [sa("web-framework-react", false)],
            },
          },
        },
      );
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await writeProjectConfig({
        selection,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.config.stack).toStrictEqual({
        "api-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });

      const configPath = getProjectConfigPath(tempDir, "claude");
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.stack).toStrictEqual({
        "api-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        "web-developer": {
          "web-framework": ["web-framework-react"],
        },
      });
    });
  });

  describe("config identity and cross-scope curation", () => {
    const fakeHome = useFakeHome(() => tempDir);

    it("a global install is named for the product, never for the home directory", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const homeDir = fakeHome.dir;
      const selection = buildInstallSelection(
        buildSkillConfigs([SKILLS.react.id], { scope: "global" }),
      );
      const sourceResult = buildSourceResult(SINGLE_REACT_MATRIX, homeDir);

      const result = await writeProjectConfig({ selection, sourceResult, projectDir: homeDir });

      const configPath = getProjectConfigPath(homeDir, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config.name).toBe(DEFAULT_PLUGIN_NAME);
      expect(config.name).not.toBe(path.basename(homeDir));
      expect(result.config.name).toBe(DEFAULT_PLUGIN_NAME);

      expect(
        await fileExists(
          path.join(sourceFolderInUse(homeDir, "claude").dir, STANDARD_FILES.CONFIG_TYPES_TS),
        ),
      ).toBe(true);
    });
  });

  describe("writeScopedConfigs", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("should skip project config when no existing project installation and no project-scoped items", async () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");

      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      expect(await fileExists(globalConfigPath)).toBe(true);

      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has skills", async () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      expect(await fileExists(globalConfigPath)).toBe(true);
      expect(await fileExists(projectConfigPath)).toBe(true);

      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  describe("resolveInstallPaths", () => {
    it("should resolve project-scope paths relative to projectDir", () => {
      const result = resolveInstallPaths("/my/project", "project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/.agents-inc/claude/${STANDARD_FILES.CONFIG_TS}`);
    });

    it("should resolve global-scope paths relative to home directory", () => {
      const homeDir = os.homedir();
      const result = resolveInstallPaths("/my/project", "global");

      expect(result.skillsDir).toBe(path.join(homeDir, LOCAL_SKILLS_PATH));
      expect(result.agentsDir).toBe(path.join(homeDir, CLAUDE_DIR, "agents"));
      expect(result.configPath).toBe(getProjectConfigPath(homeDir, "claude"));
    });

    it("should default to project scope when no scope argument provided", () => {
      const result = resolveInstallPaths("/my/project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/.agents-inc/claude/${STANDARD_FILES.CONFIG_TS}`);
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
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
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
            "web-framework": [sa("web-framework-react", true)],
            "web-styling": [sa("web-styling-scss-modules", false)],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("preserves existing per-agent stack entry when incoming omits the agent", () => {
      // An agent moved to project scope is absent from incoming.stack; its existing entry survives.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
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
            "web-framework": [sa("web-framework-react", false)],
            "web-styling": [sa("web-styling-scss-modules", false)],
          },
        },
      });

      const { config } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["api-developer"]).toStrictEqual({
        "api-api": [{ id: "api-framework-hono", preloaded: false }],
      });
      expect(config.stack?.["api-developer"]).toStrictEqual(existing.stack?.["api-developer"]);
      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
    });

    it("appends new skill under existing category, preserving existing skill", () => {
      // Additive per skill: a project edit tombstones in its own config instead of removing from
      // global.
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
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-vue-composition-api", false)],
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
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer", "web-researcher"], {
        scope: "global",
      });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-researcher": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(config.stack?.["web-researcher"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("leaves changed false for a fully identical merge", () => {
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const sharedStack: NonNullable<ProjectConfig["stack"]> = {
        "web-developer": {
          "web-framework": [sa("web-framework-react", false)],
        },
      };
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        selectedDomains: ["web"],
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        selectedDomains: ["web"],
      });

      const { changed } = mergeGlobalConfigs(existing, incoming);

      expect(changed).toBe(false);
    });

    it("preserves existing skills when incoming omits a skill under an existing category", () => {
      // A project tombstone is expressed in the project config, never by rewriting global state.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-framework-vue-composition-api"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [
              sa("web-framework-react", false),
              sa("web-framework-vue-composition-api", false),
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
            "web-framework": [sa("web-framework-react", false)],
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
      // Existing `preloaded: true` wins; a project edit cannot flip it.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", true)],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
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
      // A category only the existing config holds survives a whole-category project tombstone.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
            "api-api": [sa("api-framework-hono", false)],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "api-api": [{ id: "api-framework-hono", preloaded: false }],
      });
      expect(changed).toBe(false);
    });

    it("does not mutate inputs and returns unaliased stack references", () => {
      // Exercises every clone path in additiveMergeStack: overlapping, existing-only and
      // incoming-only categories and agents.
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
              sa("web-framework-react", false),
              sa("web-framework-vue-composition-api", true),
            ],
            "web-styling": [sa("web-styling-scss-modules", false)],
          },
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer", "web-researcher"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", true)],
            "web-testing": [sa("web-testing-vitest", false)],
          },
          "web-researcher": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });

      const existingSnapshot = structuredClone(existing);
      const incomingSnapshot = structuredClone(incoming);

      const { config } = mergeGlobalConfigs(existing, incoming);

      expect(existing).toStrictEqual(existingSnapshot);
      expect(incoming).toStrictEqual(incomingSnapshot);

      // The overlapping (agent, category) pair is the path a shallow clone would corrupt.
      const mergedWebFramework = config.stack?.["web-developer"]?.["web-framework"];
      const existingWebFramework = existing.stack?.["web-developer"]?.["web-framework"];
      expect(mergedWebFramework).toBeDefined();
      expect(existingWebFramework).toBeDefined();
      const existingWebFrameworkLengthBefore = existingWebFramework!.length;
      const SENTINEL = sa("web-framework-react", true);
      mergedWebFramework!.push(SENTINEL);
      expect(existing.stack?.["web-developer"]?.["web-framework"]).toHaveLength(
        existingWebFrameworkLengthBefore,
      );
      expect(existing.stack?.["web-developer"]?.["web-framework"]).not.toContain(SENTINEL);
      expect(existing).toStrictEqual(existingSnapshot);

      const mergedWebReviewer = config.stack?.["web-researcher"]?.["web-framework"];
      expect(mergedWebReviewer).toBeDefined();
      mergedWebReviewer!.push(SENTINEL);
      expect(incoming).toStrictEqual(incomingSnapshot);
    });

    it("records the incoming marketplace and source when the global config has none", () => {
      // A fresh blank global config carries no source identity, and the global config is what
      // uninstall builds `<id>@<marketplace>` from.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        marketplaceName: "e2e-test-marketplace",
        marketplace: "/path/to/skills",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplaceName).toBe("e2e-test-marketplace");
      expect(config.marketplace).toBe("/path/to/skills");
      expect(changed, "newly recorded source identity must trigger the global write").toBe(true);
    });

    it("leaves the global config unnamed when the incoming adds no entry it lacks", () => {
      // A project's inlined global half names the project's marketplace, which is not the global's.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {},
        selectedDomains: [],
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        marketplaceName: "e2e-test-marketplace",
        marketplace: "/path/to/skills",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config).toStrictEqual(existing);
      expect(changed, "an identical merge must not rewrite the global config").toBe(false);
    });

    it("keeps the existing marketplace and source when the incoming init came from a different one", () => {
      // Fill-only: an already-recorded marketplace wins over a project's.
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplaceName: "first-marketplace",
        marketplace: "/path/to/first",
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplaceName: "second-marketplace",
        marketplace: "/path/to/second",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplaceName).toBe("first-marketplace");
      expect(config.marketplace).toBe("/path/to/first");
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

      expect(config.marketplaceName).toBeUndefined();
      expect(config.marketplace).toBeUndefined();
      expect(changed).toBe(false);
    });
  });

  describe("writeScopedConfigs with HOME isolation", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir, { setHome: false });

    it("should skip project config file when no existing config on disk and no project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      expect(await fileExists(globalConfigPath)).toBe(true);

      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);

      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      expect(await fileExists(globalConfigPath)).toBe(true);
      expect(await fileExists(projectConfigPath)).toBe(true);

      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      const projectContent = await readFile(projectConfigPath, "utf-8");
      expect(projectContent).not.toContain("import globalConfig");
      expect(projectContent).toContain("// global");
      expect(projectContent).toContain("web-framework-react");

      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  // Project types import from the fake home's config-types.ts (globalInstallRoot() reads
  // os.homedir() at call time).
  describe("writeScopedConfigs — project config-types imports from global", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("emits project config-types.ts with import from global and extended SkillId union", async () => {
      await seedGlobalConfigTypes(fakeHomeHandle.dir);

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      expect(typesContent).toContain("import type {");
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");
      expect(typesContent).toContain("Domain as GlobalDomain");
      expect(typesContent).toContain("Category as GlobalCategory");

      // Global-scoped entries too: the sibling config.ts inlines them.
      expect(typesContent).toContain(
        "export type SkillId = GlobalSkillId | 'web-framework-react' | 'web-testing-vitest'",
      );
      expect(typesContent).toContain(
        "export type AgentName = GlobalAgentName | 'web-developer' | 'web-researcher'",
      );
    });

    it("extends the global alias even when every item is global-scoped (pure propagation case)", async () => {
      await seedGlobalConfigTypes(fakeHomeHandle.dir);

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      // Written only because a project installation already exists.
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        true,
      );

      const projectTypesPath = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      expect(typesContent).toContain("SkillId as GlobalSkillId");

      // Inlined global rows are named by the project's own unions, not only by the import.
      expect(typesContent).toContain("export type SkillId = GlobalSkillId | 'web-framework-react'");
      expect(typesContent).toContain("export type AgentName = GlobalAgentName | 'web-developer'");
    });

    it("establishes the global pair first, so the project types take the import form", async () => {
      const projectDir = path.join(tempDir, "project-standalone");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const globalClaudeSource = sourceFolderInUse(fakeHomeHandle.dir, "claude").dir;
      expect(
        (await readdir(globalClaudeSource)).sort(),
        "the write that generates the project types creates the global pair it then imports from",
      ).toStrictEqual([STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS].sort());

      const projectTypesPath = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      const typesContent = await readFile(projectTypesPath, "utf-8");

      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("export type SkillId = GlobalSkillId | 'web-framework-react'");
    });

    // config.ts inlines active global rows, so its types must name them or it fails `tsc`.
    it("extends the global unions with the global-scoped entries config.ts inlines", async () => {
      await seedGlobalConfigTypes(fakeHomeHandle.dir);

      const projectDir = path.join(tempDir, "project-scope-pairing");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      await writeScopedConfigs(
        config,
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Control: the global row really is inlined.
      const projectConfigContent = await readFile(projectConfigPath, "utf-8");
      expect(projectConfigContent).toContain(
        "{ id: 'web-framework-react', scope: 'global', origin: 'agents-inc' }",
      );

      expect(readGeneratedUnion(typesContent, "SkillId")).toContain("'api-framework-hono'");
      expect(readGeneratedUnion(typesContent, "Category")).toContain("'api-api'");
      expect(readGeneratedUnion(typesContent, "Domain")).toContain("'api'");

      expect(readGeneratedUnion(typesContent, "SkillId")).toContain("'web-framework-react'");
      expect(readGeneratedUnion(typesContent, "Category")).toContain("'web-framework'");
      expect(readGeneratedUnion(typesContent, "Domain")).toContain("'web'");
    });

    // A domain can outlive its last skill, so the union reads `selectedDomains` too.
    it("covers a domain the config still names after its last skill row is gone", async () => {
      await seedGlobalConfigTypes(fakeHomeHandle.dir);

      const projectDir = path.join(tempDir, "project-orphaned-domain");
      const projectConfigPath = getProjectConfigPath(projectDir, "claude");
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
        selectedDomains: ["api", "meta"],
      });

      await writeScopedConfigs(
        config,
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const typesContent = await readFile(
        path.join(sourceFolderInUse(projectDir, "claude").dir, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );

      // Control: config.ts really names the domain.
      const projectConfigContent = await readFile(projectConfigPath, "utf-8");
      expect(projectConfigContent).toContain("const selectedDomains: Domain[] = ['api', 'meta']");

      expect(readGeneratedUnion(typesContent, "Domain")).toContain("'meta'");
    });
  });

  // After a compile pass, the types match the install write path's for the scope compiled.
  describe("regenerateScopeConfigTypes", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("rewrites standalone unions narrowed to the config's entries at global scope", async () => {
      const globalClaudeSource = sourceFolderInUse(fakeHomeHandle.dir, "claude").dir;
      await mkdir(globalClaudeSource, { recursive: true });
      const typesPath = path.join(globalClaudeSource, STANDARD_FILES.CONFIG_TYPES_TS);
      await writeFile(typesPath, 'export type SkillId = "api-framework-hono";\n');

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      // Declared, so the writer does not label it the user's own.
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      await regenerateScopeConfigTypes(fakeHomeHandle.dir, config, FULLSTACK_PAIR_MATRIX, agents);

      const typesContent = await readFile(typesPath, "utf-8");
      expect(typesContent).not.toContain("as GlobalSkillId");
      // Narrowed to the config: the removed skill is out though the matrix knows it.
      expect(typesContent).toContain("export type SkillId = 'web-framework-react'");
      expect(typesContent).toContain("export type AgentName = 'web-developer'");
      expect(typesContent).not.toContain("'api-framework-hono'");
    });

    describe("project scope with a global install present", () => {
      it("writes the import-and-extend form and leaves config.ts untouched", async () => {
        await seedGlobalConfigTypes(fakeHomeHandle.dir);

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        const config = buildProjectConfig({
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
            }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
          ],
          agents: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
          ],
        });
        await writeConfigFile(config, projectConfigPath);
        const configBefore = await readFile(projectConfigPath, "utf-8");

        await regenerateScopeConfigTypes(projectDir, config, FULLSTACK_TRIO_MATRIX, emptyAgents);

        const projectTypesPath = path.join(
          sourceFolderInUse(projectDir, "claude").dir,
          STANDARD_FILES.CONFIG_TYPES_TS,
        );
        const typesContent = await readFile(projectTypesPath, "utf-8");

        expect(typesContent).toContain("import type {");
        expect(typesContent).toContain("SkillId as GlobalSkillId");

        // Global rows included: config.ts names them.
        expect(typesContent).toContain(
          "export type SkillId = GlobalSkillId | 'web-framework-react' | 'web-testing-vitest'",
        );
        expect(typesContent).toContain(
          "export type AgentName = GlobalAgentName | 'web-developer' | 'web-researcher'",
        );

        expect(await readFile(projectConfigPath, "utf-8")).toBe(configBefore);
      });
    });

    it("falls back to standalone unions at project scope when no global types exist", async () => {
      // No global config-types.ts under the fake home, so the standalone path runs.
      const projectDir = path.join(tempDir, "project-standalone");
      await mkdir(sourceFolderInUse(projectDir, "claude").dir, { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      await regenerateScopeConfigTypes(projectDir, config, SINGLE_REACT_MATRIX, emptyAgents);

      const typesContent = await readFile(
        path.join(sourceFolderInUse(projectDir, "claude").dir, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );
      expect(typesContent).not.toContain("as GlobalSkillId");
      expect(typesContent).toContain("'web-framework-react'");
    });

    // Source tagging only annotates availableSources/activeSource, which the types writer never
    // reads, so both matrices must emit identical bytes.
    it("emits byte-identical config-types from an untagged and a source-tagged matrix", async () => {
      const globalClaudeSource = sourceFolderInUse(fakeHomeHandle.dir, "claude").dir;
      await mkdir(globalClaudeSource, { recursive: true });
      const typesPath = path.join(globalClaudeSource, STANDARD_FILES.CONFIG_TYPES_TS);

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      await writeConfigFile(config, path.join(globalClaudeSource, STANDARD_FILES.CONFIG_TS));

      await regenerateScopeConfigTypes(
        fakeHomeHandle.dir,
        config,
        createMockMatrix({ ...SKILLS.react }, { ...SKILLS.hono }),
        emptyAgents,
      );
      const untaggedTypes = await readFile(typesPath, "utf-8");
      expect(untaggedTypes).toContain("'web-framework-react'");
      expect(untaggedTypes).toContain("'api-framework-hono'");

      const taggedMatrix = createMockMatrix({ ...SKILLS.react }, { ...SKILLS.hono });
      await loadSkillsFromAllSources(
        taggedMatrix,
        { source: DEFAULT_SOURCE, sourceOrigin: "default" },
        fakeHomeHandle.dir,
      );
      const taggedReact = taggedMatrix.skills["web-framework-react"];
      expect(
        taggedReact?.availableSources?.map((source) => source.name),
        "the marketplace must annotate the skill — otherwise this test proves nothing",
      ).toContain(DEFAULT_PUBLIC_SOURCE_NAME);

      await regenerateScopeConfigTypes(fakeHomeHandle.dir, config, taggedMatrix, emptyAgents);
      const taggedTypes = await readFile(typesPath, "utf-8");

      expect(taggedTypes).toBe(untaggedTypes);
    });
  });

  describe("dropping a project's registration", () => {
    const fakeHomeHandle = useFakeHome(() => tempDir);
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    it("should remove project from global config's projects array", async () => {
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });
      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      await deregisterProjectPath(projectDir);

      const updatedConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(updatedConfig.projects).toStrictEqual([]);
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
      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

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
      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      const report = await deregisterProjectPath(anyDir);

      expect(report.globalWritten).toBe(false);
    });

    it("should do nothing when no global config exists", async () => {
      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      const report = await deregisterProjectPath(anyDir);

      expect(report.globalWritten).toBe(false);
    });

    // Only a symlinked ancestor tells `realpath` from `path.resolve`.
    it("should deregister a project reached through a symlinked ancestor", async () => {
      const sandbox = await realpath(tempDir);
      const realProjectDir = path.join(sandbox, "real", "project");
      const linkedProjectDir = path.join(sandbox, "link", "project");
      const projectConfigPath = getProjectConfigPath(linkedProjectDir, "claude");

      await mkdir(sourceFolderInUse(realProjectDir, "claude").dir, { recursive: true });
      await symlink(path.join(sandbox, "real"), path.join(sandbox, "link"), "dir");

      await writeScopedConfigs(
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
        EMPTY_MATRIX,
        emptyAgents,
        linkedProjectDir,
        projectConfigPath,
        true,
      );

      const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
      const registered = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(
        registered.projects,
        "registration must store the resolved path, never the symlinked one",
      ).toStrictEqual([realProjectDir]);

      await deregisterProjectPath(linkedProjectDir);

      const deregistered = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(
        deregistered.projects ?? [],
        "deregistering through the symlink must clear the entry registration stored",
      ).toStrictEqual([]);
    });
  });

  describe("propagateGlobalChangesToProjects", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    /** A registered project's own entry: a config declaring nothing is no installation to rewrite. */
    const A_PROJECT_SKILL = buildSkillConfigs(["web-testing-vitest"], { scope: "project" });
    // The fan-out merges global local skills under `os.homedir()`, so HOME must be the fake one.
    useFakeHome(() => tempDir);

    it("should return empty arrays when no projects registered", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });

      const result = await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      expect(result).toStrictEqual({
        updated: [],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [],
      });
    });

    it("reports a stale project path as gone", async () => {
      const stalePath = path.join(tempDir, "nonexistent-project");

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [stalePath],
      });

      const result = await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      expect(result).toStrictEqual({
        updated: [],
        unreadable: [],
        gone: [stalePath],
        notOurs: [],
        failed: [],
      });
    });

    it("reports a project whose rewrite fails as failed, and still reaches the next", async () => {
      async function plantProject(name: string): Promise<string> {
        const dir = path.join(tempDir, name);
        const configDir = sourceFolderInUse(dir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        await writeConfigFile(
          buildProjectConfig({ name, skills: A_PROJECT_SKILL, agents: [] }),
          path.join(configDir, STANDARD_FILES.CONFIG_TS),
        );
        return dir;
      }
      const unwritable = await plantProject("unwritable-project");
      const reached = await plantProject("reached-project");
      await chmod(getProjectConfigPath(unwritable, "claude"), READ_ONLY_FILE);

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: [],
        projects: [unwritable, reached],
      });

      const result = await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      expect(result).toStrictEqual({
        updated: [reached],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [unwritable],
      });
    });

    it("should skip current project dir", async () => {
      const projectA = path.join(tempDir, "project-a");
      const projectB = path.join(tempDir, "project-b");

      for (const dir of [projectA, projectB]) {
        const configDir = sourceFolderInUse(dir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const projectConfig = buildProjectConfig({
          name: path.basename(dir),
          skills: A_PROJECT_SKILL,
          agents: [],
        });
        await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));
      }

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectA, projectB],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        emptyAgents,
        "claude",
        projectA,
      );

      expect(result).toStrictEqual({
        updated: [projectB],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [],
      });
    });

    it("should update config-types.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: A_PROJECT_SKILL,
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const typesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      expect(await fileExists(typesPath)).toBe(true);

      const typesContent = await readFile(typesPath, "utf-8");
      expect(typesContent).toContain("web-framework-react");
    });

    it("should update config.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const configContent = await readFile(configPath, "utf-8");
      expect(configContent).toContain("web-framework-react");

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("should handle empty projects list", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: [],
        projects: [],
      });

      const result = await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      expect(result).toStrictEqual({
        updated: [],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [],
      });
    });

    it("drops a skill tombstone when the global skill has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.every((s) => s.id !== "web-framework-react")).toBe(true);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("preserves the dual-scope pair's tombstone while the global skill still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      // A dual-scope pair: the active project entry is what justifies masking the global install.
      // A bare tombstone with no such collision is orphaned and self-heals.
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.skills,
        "a tombstone whose global entry still exists must survive the write",
      ).toStrictEqual([
        { id: "web-framework-react", scope: "global", origin: "agents-inc", excluded: true },
        { id: "web-testing-vitest", scope: "project", origin: "eject" },
        { id: "web-framework-react", scope: "project", origin: "eject" },
      ]);
    });

    it("drops an agent tombstone when the global agent has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-researcher"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.agents.every((a) => a.name !== "web-developer")).toBe(true);
      expect(parsedConfig.agents.some((a) => a.name === "web-researcher")).toBe(true);
    });

    it("preserves the dual-scope pair's tombstone while the global agent still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      // Agents have no categories, so a same-name project sibling is the only justification.
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
          ...buildAgentConfigs(["web-developer"], { scope: "project" }),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.agents,
        "a tombstone whose global entry still exists must survive the write",
      ).toStrictEqual([
        { name: "web-developer", scope: "global", excluded: true },
        { name: "web-researcher", scope: "project" },
        { name: "web-developer", scope: "project" },
      ]);
    });
  });

  describe("propagateGlobalChangesToProjects — project config-types imports from global", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("emits import-and-extend project config-types when global install exists", async () => {
      await seedGlobalConfigTypes(fakeHomeHandle.dir);

      const projectDir = path.join(tempDir, "target-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

      const projectTypesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      const typesContent = await readFile(projectTypesPath, "utf-8");

      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");

      expect(typesContent).toContain(
        "export type SkillId = GlobalSkillId | 'web-framework-react' | 'web-testing-vitest'",
      );
      expect(typesContent).toContain(
        "export type AgentName = GlobalAgentName | 'web-developer' | 'web-researcher'",
      );
    });
  });

  // Global uninstall prunes every inlined global entry and keeps project-scoped ones. No global
  // config-types.ts remains, so regenerated project types are standalone.
  describe("pruneGlobalEntriesFromRegisteredProjects", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    // The prune reads `os.homedir()` too.
    useFakeHome(() => tempDir);

    it("prunes inlined global skills, agents, and stack refs while keeping project-scoped entries", async () => {
      const projectDir = path.join(tempDir, "registered-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
        ],
        agents: [
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
        ],
        stack: {
          "web-researcher": {
            "web-framework": [sa("web-framework-react", true)],
            "web-testing": [sa("web-testing-vitest", false)],
          },
        },
      });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      await writeConfigFile(projectConfig, configPath);

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      const result = await pruneGlobalEntriesFromRegisteredProjects(
        globalConfig,
        emptyAgents,
        "claude",
      );

      expect(result).toStrictEqual({
        updated: [projectDir],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [],
      });

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills).toStrictEqual([
        { id: "web-testing-vitest", scope: "project", origin: "eject" },
      ]);
      expect(parsedConfig.agents).toStrictEqual([{ name: "web-researcher", scope: "project" }]);
      expect(parsedConfig.stack).toStrictEqual({
        "web-researcher": { "web-testing": ["web-testing-vitest"] },
      });

      const typesContent = await readFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );
      expect(typesContent).toContain("'web-testing-vitest'");
      expect(typesContent).not.toContain("GlobalSkillId");
      expect(typesContent).not.toContain("GlobalAgentName");
    });

    it("collapses a dual-scope pair to project-only by dropping the global tombstone", async () => {
      const projectDir = path.join(tempDir, "registered-project");
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
      });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      await writeConfigFile(projectConfig, configPath);

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: [],
        projects: [projectDir],
      });

      await pruneGlobalEntriesFromRegisteredProjects(globalConfig, emptyAgents, "claude");

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills).toStrictEqual([
        { id: "web-framework-react", scope: "project", origin: "eject" },
      ]);
    });

    it("reports a deleted registered project dir as gone", async () => {
      const ghostDir = path.join(tempDir, "deleted-project");

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: [],
        projects: [ghostDir],
      });

      const result = await pruneGlobalEntriesFromRegisteredProjects(
        globalConfig,
        emptyAgents,
        "claude",
      );

      expect(result).toStrictEqual({
        updated: [],
        unreadable: [],
        gone: [ghostDir],
        notOurs: [],
        failed: [],
      });
    });
  });

  // A project skill in an exclusive category masks a different global one there with a tombstone.
  describe("cross-scope category exclusivity", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    describe("propagateGlobalChangesToProjects", () => {
      // The fan-out reads `os.homedir()` too.
      useFakeHome(() => tempDir);

      it("masks the global skill that collides with a project-owned skill in an exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"], { scope: "project" }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", origin: "eject" },
        ]);
      });

      it("reactivates the masked global skill once the project owns nothing in that exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // The project's own skill is gone, so the mask must not survive.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "a mask must not outlive the collision that produced it",
        ).toStrictEqual([{ id: "web-framework-react", scope: "global", origin: "agents-inc" }]);
      });

      it("reactivates the masked global skill once the project owns nothing in an optional exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Same, for client state.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-state-zustand"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-state-zustand"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(parsedConfig.skills, "a mask must not outlive its collision").toStrictEqual([
          { id: "web-state-zustand", scope: "global", origin: "agents-inc" },
        ]);
      });

      it("retains the mask while the project still owns a colliding skill in an optional exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Still colliding, so the mask stays.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: [
              ...buildSkillConfigs(["web-state-pinia"], { scope: "project" }),
              ...buildSkillConfigs(["web-state-zustand"], {
                scope: "global",
                origin: "agents-inc",
                excluded: true,
              }),
            ],
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-state-zustand"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          { id: "web-state-zustand", scope: "global", origin: "agents-inc", excluded: true },
          { id: "web-state-pinia", scope: "project", origin: "eject" },
        ]);
      });

      it("drops an orphaned agent mask once the project no longer owns that agent", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Agent mirror: the justifying project sibling is gone, so the global agent reappears.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.agents,
          "an agent mask must not outlive the project-owned sibling that produced it",
        ).toStrictEqual([{ name: "web-developer", scope: "global" }]);
      });

      it("keeps exactly one tombstone when the same global change propagates twice", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"], { scope: "project" }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");
        const afterFirstRun = await readFile(configPath, "utf-8");

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");
        const afterSecondRun = await readFile(configPath, "utf-8");

        expect(afterSecondRun, "propagation must be idempotent").toBe(afterFirstRun);

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(parsedConfig.skills).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", origin: "eject" },
        ]);
      });

      it("leaves a project-owned skill unmasked when the colliding global skill is in a non-exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = sourceFolderInUse(projectDir, "claude").dir;
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Non-exclusive: neither side gains a tombstone.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-styling-scss-modules"], { scope: "project" }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-styling-tailwind"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");
        const afterFirstRun = await readFile(configPath, "utf-8");

        await propagateGlobalChangesToProjects(globalConfig, emptyAgents, "claude");

        expect(await readFile(configPath, "utf-8")).toBe(afterFirstRun);

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "a non-exclusive category must keep both scopes active",
        ).toStrictEqual([
          { id: "web-styling-tailwind", scope: "global", origin: "agents-inc" },
          { id: "web-styling-scss-modules", scope: "project", origin: "eject" },
        ]);
      });
    });

    // Each case keeps the project out of `projects[]`, so propagation never runs.
    describe("writeScopedConfigs — project-scope save", () => {
      const fakeHomeHandle = useFakeHome(() => tempDir);

      it("masks the live global skill that collides with the project's own skill in an exclusive category", async () => {
        const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
            }),
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"], { scope: "project" }),
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", origin: "eject" },
        ]);
      });

      it("masks the live global install of a skill the project also owns at project scope", async () => {
        const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-testing-vitest"], {
              scope: "global",
              origin: EJECT_SOURCE,
            }),
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills,
          "one id must never be active at both scopes in the same project",
        ).toStrictEqual([
          { id: "web-testing-vitest", scope: "global", origin: "eject", excluded: true },
          { id: "web-testing-vitest", scope: "project", origin: "eject" },
        ]);
      });

      it("masks the live global install of an agent the project also owns at project scope", async () => {
        const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.agents,
          "one agent name must never be active at both scopes in the same project",
        ).toStrictEqual([
          { name: "web-developer", scope: "global", excluded: true },
          { name: "web-developer", scope: "project" },
        ]);
      });

      it("reconciles an unpaired ownership alongside an already-paired one in the same write", async () => {
        const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: [
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                origin: "agents-inc",
              }),
              ...buildSkillConfigs(["web-testing-vitest"], {
                scope: "global",
                origin: EJECT_SOURCE,
              }),
            ],
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        // React arrives paired; vitest arrives owned at project scope with no tombstone.
        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: [
              ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                origin: "agents-inc",
                excluded: true,
              }),
              ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
            ],
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills.filter((s) => s.id === "web-framework-react"),
          "an already-paired entry must survive the write unchanged",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-react", scope: "project", origin: "eject" },
        ]);
        expect(
          parsedConfig.skills.filter((s) => s.id === "web-testing-vitest"),
          "an unpaired ownership must be reconciled by the same write",
        ).toStrictEqual([
          { id: "web-testing-vitest", scope: "global", origin: "eject", excluded: true },
          { id: "web-testing-vitest", scope: "project", origin: "eject" },
        ]);
      });

      it("never writes a tombstone into the global config", async () => {
        const globalConfigPath = getProjectConfigPath(fakeHomeHandle.dir, "claude");
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
            }),
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = getProjectConfigPath(projectDir, "claude");
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"], { scope: "project" }),
            agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedGlobal = await readTestTsConfig<ProjectConfig>(globalConfigPath);
        expect(
          parsedGlobal.skills,
          "masking is project-local — the global config must stay untouched",
        ).toStrictEqual([{ id: "web-framework-react", scope: "global", origin: "agents-inc" }]);
        expect(parsedGlobal.agents).toStrictEqual([{ name: "web-developer", scope: "global" }]);
      });
    });
  });
});
