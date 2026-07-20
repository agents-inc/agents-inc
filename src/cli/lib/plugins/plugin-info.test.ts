import os from "os";
import path from "path";
import type { Dirent } from "fs";
import { describe, it, expect, vi } from "vitest";
import {
  getPluginInfo,
  formatPluginDisplay,
  getInstallationInfo,
  formatInstallationDisplay,
  type PluginInfo,
  type InstallationInfo,
} from "./plugin-info";
import type { Installation } from "../installation";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";

vi.mock("fs/promises", () => ({
  readdir: vi.fn(),
}));

vi.mock("./plugin-finder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plugin-finder")>()),
  getProjectPluginsDir: vi.fn(),
}));

vi.mock("./plugin-discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plugin-discovery")>()),
  listPluginNames: vi.fn(),
  discoverAllPluginSkills: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../utils/fs");

vi.mock("../installation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../installation")>()),
  detectInstallation: vi.fn(),
}));

vi.mock("../configuration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../configuration")>()),
  loadProjectConfig: vi.fn(),
}));

import { readdir } from "fs/promises";
import { getProjectPluginsDir } from "./plugin-finder";
import { discoverAllPluginSkills, listPluginNames } from "./plugin-discovery";
import { directoryExists } from "../../utils/fs";
import { detectInstallation } from "../installation";
import { loadProjectConfig } from "../configuration";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";

const mockedReaddir = vi.mocked(readdir);
const mockedGetProjectPluginsDir = vi.mocked(getProjectPluginsDir);
const mockedListPluginNames = vi.mocked(listPluginNames);
const mockedDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);
const mockedDirectoryExists = vi.mocked(directoryExists);
const mockedDetectInstallation = vi.mocked(detectInstallation);
const mockedLoadProjectConfig = vi.mocked(loadProjectConfig);

describe("plugin-info", () => {
  describe("getPluginInfo", () => {
    it("should return null when no plugins exist", async () => {
      mockedListPluginNames.mockResolvedValue([]);

      const result = await getPluginInfo();

      expect(result).toBeNull();
    });

    it("should return plugin info with skill count from plugin names", async () => {
      mockedListPluginNames.mockResolvedValue(["react@my-marketplace", "zustand@my-marketplace"]);
      const pluginsDir = path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR);
      mockedGetProjectPluginsDir.mockReturnValue(pluginsDir);

      const result = await getPluginInfo();

      expect(result).toStrictEqual({
        name: DEFAULT_PLUGIN_NAME,
        version: "0.0.0",
        skillCount: 2,
        agentCount: 0,
        path: pluginsDir,
      });
    });

    it("should return null when listPluginNames throws", async () => {
      mockedListPluginNames.mockRejectedValue(new Error("ENOENT"));

      const result = await getPluginInfo();

      expect(result).toBeNull();
    });

    it("should accept custom projectDir", async () => {
      mockedListPluginNames.mockResolvedValue(["react@marketplace"]);
      const customPluginsDir = path.join("/custom", CLAUDE_DIR, PLUGINS_SUBDIR);
      mockedGetProjectPluginsDir.mockReturnValue(customPluginsDir);

      const result = await getPluginInfo("/custom");

      expect(mockedListPluginNames).toHaveBeenCalledWith("/custom");
      expect(result).not.toBeNull();
      expect(result!.path).toBe(customPluginsDir);
    });
  });

  describe("formatPluginDisplay", () => {
    it("should format plugin info correctly", () => {
      const pluginsDir = path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR);
      const info: PluginInfo = {
        name: "my-plugin",
        version: "1.2.3",
        skillCount: 5,
        agentCount: 3,
        path: pluginsDir,
      };

      const result = formatPluginDisplay(info);

      expect(result).toContain("Plugin: my-plugin v1.2.3");
      expect(result).toContain("Skills: 5");
      expect(result).toContain("Agents: 3");
      expect(result).toContain(`Path:   ${pluginsDir}`);
    });

    it("should format info with zero counts", () => {
      const info: PluginInfo = {
        name: "empty-plugin",
        version: "0.0.0",
        skillCount: 0,
        agentCount: 0,
        path: path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR),
      };

      const result = formatPluginDisplay(info);

      expect(result).toContain("Skills: 0");
      expect(result).toContain("Agents: 0");
    });
  });

  describe("getInstallationInfo", () => {
    it("should return null when no installation is detected", async () => {
      mockedDetectInstallation.mockResolvedValue(null);

      const result = await getInstallationInfo();

      expect(result).toBeNull();
    });

    it("should return local installation info", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const agentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const skillsDir = path.join("/project", CLAUDE_DIR, "skills");
      const installation: Installation = {
        mode: "eject",
        configPath,
        agentsDir,
        skillsDir,
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(true);

      // Exact paths, not suffixes: getInstallationInfo also counts the global
      // scope, whose dirs share the same trailing segments.
      // Boundary cast: mock readdir return type for each branch
      mockedReaddir.mockImplementation((dirPath) => {
        const dir = dirPath as string;
        if (dir === skillsDir) {
          return Promise.resolve([
            createDirent("web-framework-react", { isDir: true }),
            createDirent("web-state-zustand", { isDir: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        if (dir === agentsDir) {
          return Promise.resolve([
            createDirent("web-developer.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        return Promise.resolve([]) as unknown as ReturnType<typeof readdir>;
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "my-local-project", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).toStrictEqual({
        mode: "eject",
        name: "my-local-project",
        version: "eject",
        skillCount: 2,
        agentCount: 1,
        configPath,
        agentDirs: [agentsDir],
        skillsDir,
      });
    });

    it("counts skills and agents at both scopes and names both agents directories", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectSkillsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalSkillsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      const installation: Installation = {
        mode: "eject",
        configPath,
        agentsDir: projectAgentsDir,
        skillsDir: projectSkillsDir,
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(true);

      // Boundary cast: mock readdir return type for each branch
      mockedReaddir.mockImplementation((dirPath) => {
        const dir = dirPath as string;
        if (dir === projectSkillsDir) {
          return Promise.resolve([
            createDirent("web-framework-react", { isDir: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        if (dir === globalSkillsDir) {
          return Promise.resolve([
            createDirent("web-state-zustand", { isDir: true }),
            createDirent("web-testing-vitest", { isDir: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        if (dir === projectAgentsDir) {
          return Promise.resolve([
            createDirent("web-developer.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        if (dir === globalAgentsDir) {
          return Promise.resolve([
            createDirent("api-developer.md", { isFile: true }),
            createDirent("web-reviewer.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        return Promise.resolve([]) as unknown as ReturnType<typeof readdir>;
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "dual-scope-project", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount, "skills installed at both scopes must be counted").toBe(3);
      expect(result!.agentCount, "agents compiled at both scopes must be counted").toBe(3);
      expect(
        result!.agentDirs,
        "both directories holding agents must be reported, global first",
      ).toStrictEqual([globalAgentsDir, projectAgentsDir]);
    });

    it("names only the global agents directory when every agent is installed globally", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalSkillsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, agentsDir: projectAgentsDir }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [globalSkillsDir]: [createDirent("web-framework-react", { isDir: true })],
        [globalAgentsDir]: [
          createDirent("web-developer.md", { isFile: true }),
          createDirent("api-developer.md", { isFile: true }),
        ],
      });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "global-only", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.agentCount).toBe(2);
      expect(
        result!.agentDirs,
        "the project agents directory holds nothing and must not be reported",
      ).toStrictEqual([globalAgentsDir]);
    });

    it("names only the project agents directory when every agent is installed in the project", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectSkillsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, agentsDir: projectAgentsDir }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: [createDirent("web-framework-react", { isDir: true })],
        [projectAgentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "project-only", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.agentCount).toBe(1);
      expect(
        result!.agentDirs,
        "the global agents directory holds nothing and must not be reported",
      ).toStrictEqual([projectAgentsDir]);
    });

    it("names no agents directory when no scope holds compiled agents", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "no-agents", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.agentCount).toBe(0);
      expect(result!.agentDirs, "no directory holds agents, so none may be named").toStrictEqual(
        [],
      );
    });

    it("counts the home root only once when the installation is global", async () => {
      const homeDir = os.homedir();
      const configPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const agentsDir = path.join(homeDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const skillsDir = path.join(homeDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      const installation: Installation = {
        mode: "eject",
        configPath,
        agentsDir,
        skillsDir,
        projectDir: homeDir,
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(true);

      // Boundary cast: mock readdir return type for each branch
      mockedReaddir.mockImplementation((dirPath) => {
        const dir = dirPath as string;
        if (dir === skillsDir) {
          return Promise.resolve([
            createDirent("web-framework-react", { isDir: true }),
            createDirent("web-state-zustand", { isDir: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        if (dir === agentsDir) {
          return Promise.resolve([
            createDirent("web-developer.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        return Promise.resolve([]) as unknown as ReturnType<typeof readdir>;
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "global", skills: [] }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount, "the home root must not be counted twice").toBe(2);
      expect(result!.agentCount, "the home root must not be counted twice").toBe(1);
      expect(result!.agentDirs, "the home root must not be named twice").toStrictEqual([agentsDir]);
    });

    it("should return plugin installation info", async () => {
      const agentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const installation: Installation = {
        mode: "plugin",
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentsDir,
        skillsDir: path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR),
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(true);

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "my-plugin",
          skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        }),
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      });

      // Plugin mode uses discoverAllPluginSkills instead of readdir
      mockedDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          description: "React",
          path: "/global/cache/react",
        },
      } as Record<string, import("../../types").SkillDefinition>);

      // Exact path, not a suffix: getInstallationInfo also counts the global
      // agents dir, which shares the same trailing segment.
      // Boundary cast: mock readdir return type for each branch
      mockedReaddir.mockImplementation((dirPath) => {
        const dir = dirPath as string;
        if (dir === agentsDir) {
          return Promise.resolve([
            createDirent("agent-1.md", { isFile: true }),
            createDirent("agent-2.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        return Promise.resolve([]) as unknown as ReturnType<typeof readdir>;
      });

      const result = await getInstallationInfo();

      expect(result).toStrictEqual({
        mode: "plugin",
        name: "my-plugin",
        version: "plugin",
        skillCount: 1,
        agentCount: 2,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [agentsDir],
        skillsDir: path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR),
      });
    });

    it("should use default name when local config has no name", async () => {
      const mockConfigPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const installation: Installation = {
        mode: "eject",
        configPath: mockConfigPath,
        agentsDir: path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS),
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(false);
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "", agents: [], skills: [] }),
        configPath: mockConfigPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.name).toBe(DEFAULT_PLUGIN_NAME);
    });

    it("should use default name when loadProjectConfig returns null", async () => {
      const installation: Installation = {
        mode: "eject",
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentsDir: path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS),
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(false);
      mockedLoadProjectConfig.mockResolvedValue(null);

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.name).toBe(DEFAULT_PLUGIN_NAME);
      expect(result!.version).toBe("0.0.0");
    });

    it("should handle readdir errors gracefully for skills", async () => {
      const mockConfigPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const installation: Installation = {
        mode: "eject",
        configPath: mockConfigPath,
        agentsDir: path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS),
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
        projectDir: "/project",
      };

      mockedDetectInstallation.mockResolvedValue(installation);
      mockedDirectoryExists.mockResolvedValue(true);
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "test", agents: [], skills: [] }),
        configPath: mockConfigPath,
      });

      mockedReaddir.mockRejectedValue(new Error("EACCES permission denied"));

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount).toBe(0);
      expect(result!.agentCount).toBe(0);
    });
  });

  describe("formatInstallationDisplay", () => {
    it("should format eject installation info", () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const agentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info: InstallationInfo = {
        mode: "eject",
        name: "my-project",
        version: "eject",
        skillCount: 5,
        agentCount: 3,
        configPath,
        agentDirs: [agentsDir],
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
      };

      const result = formatInstallationDisplay(info);

      expect(result).toContain("Installation: my-project (eject mode)");
      expect(result).toContain("Mode:    Eject");
      expect(result).toContain("Skills:  5");
      expect(result).toContain("Agents:  3");
      expect(result).toContain(`Config:  ${configPath}`);
      expect(result).toContain(`Agents:  ${agentsDir}`);
    });

    it("prints one agents path line per directory that holds agents", () => {
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info: InstallationInfo = {
        mode: "eject",
        name: "dual-scope-project",
        version: "eject",
        skillCount: 3,
        agentCount: 3,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [globalAgentsDir, projectAgentsDir],
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
      };

      const result = formatInstallationDisplay(info);

      expect(result).toContain(`Agents:  ${globalAgentsDir}`);
      expect(result).toContain(`Agents:  ${projectAgentsDir}`);
    });

    it("prints no directory the agents are not in", () => {
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info: InstallationInfo = {
        mode: "eject",
        name: "global-only",
        version: "eject",
        skillCount: 7,
        agentCount: 9,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [globalAgentsDir],
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
      };

      const result = formatInstallationDisplay(info);

      expect(result).toContain(`Agents:  ${globalAgentsDir}`);
      expect(result, "a directory holding no agents must not appear in the report").not.toContain(
        projectAgentsDir,
      );
    });

    it("should format plugin installation info", () => {
      const info: InstallationInfo = {
        mode: "plugin",
        name: "my-plugin",
        version: "1.2.3",
        skillCount: 10,
        agentCount: 5,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS)],
        skillsDir: path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR),
      };

      const result = formatInstallationDisplay(info);

      expect(result).toContain("Installation: my-plugin v1.2.3");
      expect(result).toContain("Mode:    Plugin");
      expect(result).toContain("Skills:  10");
      expect(result).toContain("Agents:  5");
    });

    it("should show zero counts correctly", () => {
      const info: InstallationInfo = {
        mode: "eject",
        name: "empty-project",
        version: "eject",
        skillCount: 0,
        agentCount: 0,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [],
        skillsDir: path.join("/project", CLAUDE_DIR, "skills"),
      };

      const result = formatInstallationDisplay(info);

      expect(result).toContain("Skills:  0");
      expect(result).toContain("Agents:  0");
      expect(
        result,
        "with no agents anywhere the report must name no agents directory",
      ).not.toContain(path.join(CLAUDE_DIR, STANDARD_DIRS.AGENTS));
    });
  });
});

/** Eject-mode installation rooted at `/project`, i.e. a project context whose global root is HOME. */
function buildInstallation(overrides: Partial<Installation> = {}): Installation {
  return {
    mode: "eject",
    configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
    agentsDir: path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    skillsDir: path.join("/project", CLAUDE_DIR, STANDARD_DIRS.SKILLS),
    projectDir: "/project",
    ...overrides,
  };
}

/** Makes `readdir` return the listed entries for those exact directories, and nothing anywhere else. */
function mockReaddirByDir(entriesByDir: Record<string, Dirent[]>): void {
  mockedReaddir.mockImplementation(
    (dirPath) =>
      // Boundary cast: readdir's overloaded return type cannot be inferred from a mock
      Promise.resolve(entriesByDir[dirPath as string] ?? []) as unknown as ReturnType<
        typeof readdir
      >,
  );
}

function createDirent(name: string, opts: { isDir?: boolean; isFile?: boolean }) {
  // Boundary cast: mock Dirent for test — only implements methods used by production code
  return {
    name,
    isDirectory: () => opts.isDir ?? false,
    isFile: () => opts.isFile ?? false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "",
    path: "",
  } as unknown as import("fs").Dirent;
}
