import os from "os";
import path from "path";
import type { Dirent } from "fs";
import { describe, it, expect, vi } from "vitest";
import {
  getInstallationInfo,
  formatInstallationDisplay,
  type InstallationInfo,
} from "./plugin-info";
import type { SkillDefinitionMap, SkillId } from "../../types";
import {
  CLAUDE_DIR,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
} from "../../consts";

vi.mock("fs/promises", () => ({
  readdir: vi.fn(),
}));

vi.mock("./plugin-discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plugin-discovery")>()),
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
import { discoverAllPluginSkills } from "./plugin-discovery";
import { directoryExists } from "../../utils/fs";
import { detectInstallation } from "../installation";
import { loadProjectConfig } from "../configuration";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import {
  buildInstallation,
  buildPluginInstallation,
} from "../__tests__/factories/installation-factories.js";
import { createMockSkillDefinition } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { getProjectConfigPath } from "../installation/install-base-dir.js";

const mockedReaddir = vi.mocked(readdir);
const mockedDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);
const mockedDirectoryExists = vi.mocked(directoryExists);
const mockedDetectInstallation = vi.mocked(detectInstallation);
const mockedLoadProjectConfig = vi.mocked(loadProjectConfig);

/** Agents directories resolve from `installation.projectDir`, never its `agentsDir`. */
const PROJECT_DIR = "/project";

const GLOBAL_PLUGIN_SKILLS: SkillDefinitionMap = {
  "web-framework-react": createMockSkillDefinition("web-framework-react"),
  "web-state-zustand": createMockSkillDefinition("web-state-zustand"),
};

/** Zustand is enabled at both scopes on purpose: one skill, two registrations. */
const PROJECT_PLUGIN_SKILLS: SkillDefinitionMap = {
  "web-state-zustand": createMockSkillDefinition("web-state-zustand"),
  "web-testing-vitest": createMockSkillDefinition("web-testing-vitest"),
};

const MARKETPLACE_SKILL_IDS = [
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
] as const satisfies readonly SkillId[];

const EJECTED_SKILL_ID = "web-mocks-msw" satisfies SkillId;

/** A skill directory no configuration declares, so deliberately not a `SkillId`. */
const UNDECLARED_SKILL_DIR = "context7-mcp";

describe("plugin-info", () => {
  describe("getInstallationInfo", () => {
    it("should return null when no installation is detected", async () => {
      mockedDetectInstallation.mockResolvedValue(null);

      const result = await getInstallationInfo();

      expect(result).toBeNull();
    });

    it("should return local installation info", async () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const agentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const skillsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({
          mode: "eject",
          configPath,
          agentsDir,
          skillsDir,
          projectDir: PROJECT_DIR,
        }),
      );
      mockedDirectoryExists.mockResolvedValue(true);

      // Exact paths: the global scope's dirs share the same trailing segments.
      mockReaddirByDir({
        [skillsDir]: [
          createDirent("web-framework-react", { isDir: true }),
          createDirent("web-state-zustand", { isDir: true }),
        ],
        [agentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "my-local-project",
          skills: buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
            origin: EJECT_SOURCE,
          }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).toStrictEqual({
        mode: "eject",
        name: "my-local-project",
        skillCount: 2,
        agentCount: 1,
        configPath,
        agentDirs: [agentsDir],
      });
    });

    it("counts skills and agents at both scopes and names both agents directories", async () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectSkillsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalSkillsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({
          configPath,
          agentsDir: projectAgentsDir,
          skillsDir: projectSkillsDir,
          projectDir: PROJECT_DIR,
        }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: [createDirent("web-framework-react", { isDir: true })],
        [globalSkillsDir]: [
          createDirent("web-state-zustand", { isDir: true }),
          createDirent("web-testing-vitest", { isDir: true }),
        ],
        [projectAgentsDir]: [createDirent("web-developer.md", { isFile: true })],
        [globalAgentsDir]: [
          createDirent("api-developer.md", { isFile: true }),
          createDirent("reviewer.md", { isFile: true }),
        ],
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "dual-scope-project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "project",
              origin: EJECT_SOURCE,
            }),
            ...buildSkillConfigs(["web-state-zustand", "web-testing-vitest"], {
              scope: "global",
              origin: EJECT_SOURCE,
            }),
          ],
        }),
        configPath,
        provider: "claude",
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
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalSkillsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, agentsDir: projectAgentsDir, projectDir: PROJECT_DIR }),
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
        provider: "claude",
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
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectSkillsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, agentsDir: projectAgentsDir, projectDir: PROJECT_DIR }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: [createDirent("web-framework-react", { isDir: true })],
        [projectAgentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "project-only", skills: [] }),
        configPath,
        provider: "claude",
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
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");

      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "no-agents", skills: [] }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.agentCount).toBe(0);
      expect(result!.agentDirs, "no directory holds agents, so none may be named").toStrictEqual(
        [],
      );
    });

    it("counts only the compiled agent files, not other files or folders", async () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const agentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, projectDir: PROJECT_DIR }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [agentsDir]: [
          createDirent("web-developer.md", { isFile: true }),
          createDirent("notes.txt", { isFile: true }),
          createDirent("archive.md", { isDir: true }),
        ],
      });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "counted", skills: [] }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result?.agentCount).toBe(1);
    });

    it("counts the home root only once when the installation is global", async () => {
      const homeDir = os.homedir();
      const configPath = getProjectConfigPath(homeDir, "claude");
      const agentsDir = path.join(homeDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const skillsDir = path.join(homeDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      mockedDetectInstallation.mockResolvedValue(
        buildInstallation({ configPath, agentsDir, skillsDir, projectDir: homeDir }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [skillsDir]: [
          createDirent("web-framework-react", { isDir: true }),
          createDirent("web-state-zustand", { isDir: true }),
        ],
        [agentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
            scope: "global",
            origin: EJECT_SOURCE,
          }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount, "the home root must not be counted twice").toBe(2);
      expect(result!.agentCount, "the home root must not be counted twice").toBe(1);
      expect(result!.agentDirs, "the home root must not be named twice").toStrictEqual([agentsDir]);
    });

    it("should return plugin installation info", async () => {
      const agentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);

      mockedDetectInstallation.mockResolvedValue(
        buildPluginInstallation({
          configPath: getProjectConfigPath(PROJECT_DIR, "claude"),
          agentsDir,
          projectDir: PROJECT_DIR,
        }),
      );
      mockedDirectoryExists.mockResolvedValue(true);

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "my-plugin",
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        }),
        configPath: getProjectConfigPath(PROJECT_DIR, "claude"),
        provider: "claude",
      });

      mockedDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": createMockSkillDefinition("web-framework-react", {
          description: "React",
          path: "/global/cache/react",
        }),
      });

      // Exact path: the global agents dir shares the same trailing segment.
      mockReaddirByDir({
        [agentsDir]: [
          createDirent("agent-1.md", { isFile: true }),
          createDirent("agent-2.md", { isFile: true }),
        ],
      });

      const result = await getInstallationInfo();

      expect(result).toStrictEqual({
        mode: "plugin",
        name: "my-plugin",
        skillCount: 1,
        agentCount: 2,
        configPath: getProjectConfigPath(PROJECT_DIR, "claude"),
        agentDirs: [agentsDir],
      });
    });

    it("counts plugin skills enabled at the home root when the command runs in a project", async () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");

      mockedDetectInstallation.mockResolvedValue(buildPluginInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockPluginSkillsByDir({ [os.homedir()]: GLOBAL_PLUGIN_SKILLS });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "globally-installed-plugins",
          skills: buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
            scope: "global",
            origin: "agents-inc",
          }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a project owns everything installed globally, so globally enabled plugin skills must be counted",
      ).toBe(2);
    });

    it("counts a plugin skill enabled at both scopes once", async () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);

      mockedDetectInstallation.mockResolvedValue(
        buildPluginInstallation({ configPath, projectDir: PROJECT_DIR }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [globalAgentsDir]: [createDirent("api-developer.md", { isFile: true })],
        [projectAgentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });
      mockPluginSkillsByDir({
        [os.homedir()]: GLOBAL_PLUGIN_SKILLS,
        [PROJECT_DIR]: PROJECT_PLUGIN_SKILLS,
      });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "dual-scope-plugins",
          skills: [
            ...buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
              scope: "global",
              origin: "agents-inc",
            }),
            ...buildSkillConfigs(["web-state-zustand", "web-testing-vitest"], {
              scope: "project",
              origin: "agents-inc",
            }),
          ],
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "the two scopes are merged by skill id, so a skill enabled at both is one skill and not two",
      ).toBe(3);
      expect(
        result!.agentCount,
        "a plugin installation's agents obey the same per-scope rule as its skills",
      ).toBe(2);
      expect(result!.agentDirs).toStrictEqual([globalAgentsDir, projectAgentsDir]);
    });

    it("counts a home-root plugin installation from its configuration, not from the registry", async () => {
      const homeDir = os.homedir();
      const configPath = getProjectConfigPath(homeDir, "claude");

      mockedDetectInstallation.mockResolvedValue(
        buildPluginInstallation({
          configPath,
          agentsDir: path.join(homeDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
          skillsDir: path.join(homeDir, CLAUDE_DIR, PLUGINS_SUBDIR),
          projectDir: homeDir,
        }),
      );
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockPluginSkillsByDir({ [homeDir]: GLOBAL_PLUGIN_SKILLS });
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "global-plugins",
          skills: buildSkillConfigs(MARKETPLACE_SKILL_IDS, {
            scope: "global",
            origin: DEFAULT_PUBLIC_SOURCE_NAME,
          }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "every skill the configuration declares is one the CLI manages, resolvable or not",
      ).toBe(MARKETPLACE_SKILL_IDS.length);
    });

    it("should use default name when local config has no name", async () => {
      const mockConfigPath = getProjectConfigPath(PROJECT_DIR, "claude");

      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath: mockConfigPath }));
      mockedDirectoryExists.mockResolvedValue(false);
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "", agents: [], skills: [] }),
        configPath: mockConfigPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.name).toBe(DEFAULT_PLUGIN_NAME);
    });

    it("should use default name when loadProjectConfig returns null", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation());
      mockedDirectoryExists.mockResolvedValue(false);
      mockedLoadProjectConfig.mockResolvedValue(null);

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.name).toBe(DEFAULT_PLUGIN_NAME);
    });

    it("should handle readdir errors gracefully for skills", async () => {
      const mockConfigPath = getProjectConfigPath(PROJECT_DIR, "claude");

      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath: mockConfigPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({ name: "test", agents: [], skills: [] }),
        configPath: mockConfigPath,
        provider: "claude",
      });

      mockedReaddir.mockRejectedValue(new Error("EACCES permission denied"));

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount).toBe(0);
      expect(result!.agentCount).toBe(0);
    });
  });

  // Each mode gets a fixture where the registry or skills directory under-reports the config.
  describe("the skill count is what the configuration declares", () => {
    const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
    const projectSkillsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

    it("counts a mixed installation's plugin skills, which own no directory on disk", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ mode: "mixed", configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: [createDirent(EJECTED_SKILL_ID, { isDir: true })],
      });
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "mixed-project",
          skills: [
            ...buildSkillConfigs(MARKETPLACE_SKILL_IDS, { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
            ...buildSkillConfigs([EJECTED_SKILL_ID], { origin: EJECT_SOURCE }),
          ],
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a mixed installation manages its plugin skills as much as its ejected ones",
      ).toBe(MARKETPLACE_SKILL_IDS.length + 1);
    });

    it("counts a plugin installation's skills when the registry resolves none of them", async () => {
      mockedDetectInstallation.mockResolvedValue(buildPluginInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "plugin-project",
          skills: buildSkillConfigs(MARKETPLACE_SKILL_IDS, { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount).toBe(MARKETPLACE_SKILL_IDS.length);
    });

    it("counts an eject installation's skills when a copy has been deleted by hand", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: MARKETPLACE_SKILL_IDS.slice(0, 2).map((id) =>
          createDirent(id, { isDir: true }),
        ),
      });
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "eject-project",
          skills: buildSkillConfigs(MARKETPLACE_SKILL_IDS, { origin: EJECT_SOURCE }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount).toBe(MARKETPLACE_SKILL_IDS.length);
    });

    it("does not count a skill directory the configuration never declared", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [projectSkillsDir]: [
          ...MARKETPLACE_SKILL_IDS.map((id) => createDirent(id, { isDir: true })),
          createDirent(UNDECLARED_SKILL_DIR, { isDir: true }),
        ],
      });
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "eject-project",
          skills: buildSkillConfigs(MARKETPLACE_SKILL_IDS, { origin: EJECT_SOURCE }),
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a directory this CLI never installed is not part of what it reports it manages",
      ).toBe(MARKETPLACE_SKILL_IDS.length);
    });

    it("does not count a tombstoned entry", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      // A tombstone masks a skill for this project; its files can remain.
      mockReaddirByDir({
        [projectSkillsDir]: MARKETPLACE_SKILL_IDS.map((id) => createDirent(id, { isDir: true })),
      });
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "tombstoned-project",
          skills: [
            ...buildSkillConfigs(MARKETPLACE_SKILL_IDS.slice(0, 2), {
              scope: "project",
              origin: EJECT_SOURCE,
            }),
            ...buildSkillConfigs(MARKETPLACE_SKILL_IDS.slice(2), {
              scope: "global",
              origin: EJECT_SOURCE,
              excluded: true,
            }),
          ],
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a tombstone records a skill this project has excluded, not one it manages",
      ).toBe(2);
    });

    it("counts a skill declared at both scopes once", async () => {
      mockedDetectInstallation.mockResolvedValue(buildPluginInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({});
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "dual-scope-project",
          skills: [
            ...buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
              scope: "global",
              origin: DEFAULT_PUBLIC_SOURCE_NAME,
            }),
            ...buildSkillConfigs(["web-state-zustand", "web-testing-vitest"], {
              scope: "project",
              origin: DEFAULT_PUBLIC_SOURCE_NAME,
            }),
          ],
        }),
        configPath,
        provider: "claude",
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "four entries name three skills, and a skill installed at both scopes is one skill",
      ).toBe(3);
    });
  });

  describe("formatInstallationDisplay", () => {
    it("should format eject installation info", () => {
      const configPath = getProjectConfigPath(PROJECT_DIR, "claude");
      const agentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info = buildInstallationInfo({
        name: "my-project",
        skillCount: 5,
        agentCount: 3,
        configPath,
        agentDirs: [agentsDir],
      });

      const result = formatInstallationDisplay(info);

      expect(result).toContain("Installation: my-project\n");
      expect(result).toContain("Mode:    Eject");
      expect(result).toContain("Skills:  5");
      expect(result).toContain("Agents:  3");
      expect(result).toContain(`Config:  ${configPath}`);
      expect(result).toContain(`Agents:  ${agentsDir}`);
    });

    it("prints one agents path line per directory that holds agents", () => {
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info = buildInstallationInfo({
        name: "dual-scope-project",
        skillCount: 3,
        agentCount: 3,
        agentDirs: [globalAgentsDir, projectAgentsDir],
      });

      const result = formatInstallationDisplay(info);

      expect(result).toContain(`Agents:  ${globalAgentsDir}`);
      expect(result).toContain(`Agents:  ${projectAgentsDir}`);
    });

    it("prints no directory the agents are not in", () => {
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info = buildInstallationInfo({
        name: "global-only",
        skillCount: 7,
        agentCount: 9,
        agentDirs: [globalAgentsDir],
      });

      const result = formatInstallationDisplay(info);

      expect(result).toContain(`Agents:  ${globalAgentsDir}`);
      expect(result, "a directory holding no agents must not appear in the report").not.toContain(
        projectAgentsDir,
      );
    });

    it("should format plugin installation info", () => {
      const info = buildInstallationInfo({
        mode: "plugin",
        name: "my-plugin",
        skillCount: 10,
        agentCount: 5,
      });

      const result = formatInstallationDisplay(info);

      expect(result).toContain("Installation: my-plugin\n");
      expect(result).toContain("Mode:    Plugin");
      expect(result).toContain("Skills:  10");
      expect(result).toContain("Agents:  5");
      expect(result, "the install mode must never be rendered as a version").not.toContain(
        "vplugin",
      );
    });

    it("labels a mixed installation as Mixed", () => {
      const result = formatInstallationDisplay(
        buildInstallationInfo({ mode: "mixed", name: "mixed-project" }),
      );

      expect(result).toContain("Installation: mixed-project\n");
      expect(result).toContain("Mode:    Mixed");
    });

    it("prints the report word for word when no directory holds agents", () => {
      const info = buildInstallationInfo({ name: "empty-project", agentCount: 0, agentDirs: [] });

      expect(formatInstallationDisplay(info)).toBe(
        `Installation: empty-project\n  Mode:    Eject\n  Skills:  5\n  Agents:  0\n  Config:  ${info.configPath}`,
      );
    });

    it("prints each agents directory on a line of its own", () => {
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const projectAgentsDir = path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const info = buildInstallationInfo({ agentDirs: [globalAgentsDir, projectAgentsDir] });

      expect(formatInstallationDisplay(info)).toContain(
        `Config:  ${info.configPath}\n  Agents:  ${globalAgentsDir}\n  Agents:  ${projectAgentsDir}`,
      );
    });

    it("should show zero counts correctly", () => {
      const info = buildInstallationInfo({
        name: "empty-project",
        skillCount: 0,
        agentCount: 0,
        agentDirs: [],
      });

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

function buildInstallationInfo(overrides: Partial<InstallationInfo> = {}): InstallationInfo {
  return {
    mode: "eject",
    name: "my-project",
    skillCount: 5,
    agentCount: 3,
    configPath: getProjectConfigPath(PROJECT_DIR, "claude"),
    agentDirs: [path.join(PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS)],
    ...overrides,
  };
}

function mockPluginSkillsByDir(skillsByDir: Record<string, SkillDefinitionMap>): void {
  mockedDiscoverAllPluginSkills.mockImplementation((dir) =>
    Promise.resolve(skillsByDir[dir] ?? {}),
  );
}

function mockReaddirByDir(entriesByDir: Record<string, Dirent[]>): void {
  mockedReaddir.mockImplementation(
    (dirPath) =>
      // Boundary cast: the mock is typed against readdir's last overload, not `withFileTypes`.
      Promise.resolve(entriesByDir[dirPath as string] ?? []) as unknown as ReturnType<
        typeof readdir
      >,
  );
}

function createDirent(name: string, opts: { isDir?: boolean; isFile?: boolean }): Dirent {
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
  };
}
