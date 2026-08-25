import os from "os";
import path from "path";
import type { Dirent } from "fs";
import { describe, it, expect, vi } from "vitest";
import {
  getInstallationInfo,
  formatInstallationDisplay,
  type InstallationInfo,
} from "./plugin-info";
import type { Installation } from "../installation";
import type { SkillDefinitionMap, SkillId } from "../../types";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  STANDARD_FILES,
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
import { createMockSkillDefinition } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";

const mockedReaddir = vi.mocked(readdir);
const mockedDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);
const mockedDirectoryExists = vi.mocked(directoryExists);
const mockedDetectInstallation = vi.mocked(detectInstallation);
const mockedLoadProjectConfig = vi.mocked(loadProjectConfig);

/** Skills a `claude plugin install --scope user` leaves enabled under the home root. */
const GLOBAL_PLUGIN_SKILLS: SkillDefinitionMap = {
  "web-framework-react": createMockSkillDefinition("web-framework-react"),
  "web-state-zustand": createMockSkillDefinition("web-state-zustand"),
};

/**
 * Skills a `claude plugin install --scope project` leaves enabled under the
 * project. Zustand is deliberately enabled at both scopes: one skill, two
 * registrations.
 */
const PROJECT_PLUGIN_SKILLS: SkillDefinitionMap = {
  "web-state-zustand": createMockSkillDefinition("web-state-zustand"),
  "web-testing-vitest": createMockSkillDefinition("web-testing-vitest"),
};

/**
 * The marketplace-carried half of a mixed installation's configuration. Held against `SkillId`
 * so retiring one of these ids reddens this line rather than a consumer four files away.
 */
const MARKETPLACE_SKILL_IDS = [
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
] as const satisfies readonly SkillId[];

/** The locally ejected half — the one skill of a mixed install that owns a directory on disk. */
const EJECTED_SKILL_ID = "web-mocks-msw" satisfies SkillId;

/**
 * A directory under `.claude/skills/` that no configuration declares — a skill a user dropped
 * in by hand, or one another tool installed. The CLI did not put it there and does not manage
 * it, so it is deliberately NOT a member of `SkillId`.
 */
const UNDECLARED_SKILL_DIR = "context7-mcp";

describe("plugin-info", () => {
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
        return Promise.resolve([]);
      });

      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "my-local-project",
          skills: buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
            origin: EJECT_SOURCE,
          }),
        }),
        configPath,
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
            createDirent("reviewer.md", { isFile: true }),
          ]) as unknown as ReturnType<typeof readdir>;
        }
        return Promise.resolve([]);
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
        return Promise.resolve([]);
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
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
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
      } satisfies Record<string, import("../../types").SkillDefinition>);

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
        return Promise.resolve([]);
      });

      const result = await getInstallationInfo();

      expect(result).toStrictEqual({
        mode: "plugin",
        name: "my-plugin",
        skillCount: 1,
        agentCount: 2,
        configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        agentDirs: [agentsDir],
      });
    });

    it("counts plugin skills enabled at the home root when the command runs in a project", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

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
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a project owns everything installed globally, so globally enabled plugin skills must be counted",
      ).toBe(2);
    });

    it("counts a plugin skill enabled at both scopes once", async () => {
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, STANDARD_DIRS.AGENTS);

      mockedDetectInstallation.mockResolvedValue(buildPluginInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      mockReaddirByDir({
        [globalAgentsDir]: [createDirent("api-developer.md", { isFile: true })],
        [projectAgentsDir]: [createDirent("web-developer.md", { isFile: true })],
      });
      mockPluginSkillsByDir({
        [os.homedir()]: GLOBAL_PLUGIN_SKILLS,
        "/project": PROJECT_PLUGIN_SKILLS,
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

    /**
     * The reported installation's own shape: a plugin install rooted at the home directory whose
     * registry no longer resolves everything the configuration declares. The configuration is what
     * says which skills this CLI put there, so a plugin the registry has since lost is still one
     * of them — and a report that drops it tells the user their install shrank.
     */
    it("counts a home-root plugin installation from its configuration, not from the registry", async () => {
      const homeDir = os.homedir();
      const configPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

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
      // The registry resolves two of the three the configuration declares.
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
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "every skill the configuration declares is one the CLI manages, resolvable or not",
      ).toBe(MARKETPLACE_SKILL_IDS.length);
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

  /**
   * What `Skills: N` counts: the skills THIS CLI put there, which is the configuration's `skills`
   * array minus its tombstones. Neither the plugin registry nor `.claude/skills/` answers that —
   * each holds only the half of an installation its own install path writes, and each also holds
   * entries the CLI never wrote.
   *
   * **The three modes are pinned separately and deliberately.** The report used to ask the
   * registry in `plugin` mode and the skills directory otherwise, so `mixed` — a shape neither
   * branch was written for — fell to the eject branch and reported the ejected copies alone,
   * which for a mostly-plugin install is a number close to zero. A fix that special-cases `mixed`
   * would leave the other two answering from a source that can disagree with the configuration,
   * so each mode gets a fixture where that source under-reports.
   */
  describe("the skill count is what the configuration declares", () => {
    const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
    const projectSkillsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.SKILLS);

    it("counts a mixed installation's plugin skills, which own no directory on disk", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ mode: "mixed", configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      // A mixed install ejects some skills and installs the rest as plugins, so only the ejected
      // one has a directory. Counting directories here counts the smaller half.
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
      // The registry a project reads is the user's, and it can be emptied out from under an
      // install — by a Claude CLI upgrade, or by a `claude plugin uninstall` run by hand.
      mockPluginSkillsByDir({});
      mockedLoadProjectConfig.mockResolvedValue({
        config: buildProjectConfig({
          name: "plugin-project",
          skills: buildSkillConfigs(MARKETPLACE_SKILL_IDS, { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
        }),
        configPath,
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(result!.skillCount).toBe(MARKETPLACE_SKILL_IDS.length);
    });

    it("counts an eject installation's skills when a copy has been deleted by hand", async () => {
      mockedDetectInstallation.mockResolvedValue(buildInstallation({ configPath }));
      mockedDirectoryExists.mockResolvedValue(true);
      // Two of the three declared copies survive; `doctor` is the surface that reports the third
      // as missing, and it is still a skill this installation is responsible for.
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
      // The tombstoned skill's files can outlive the exclusion — the tombstone masks a globally
      // installed skill for THIS project, it does not uninstall it.
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
      });

      const result = await getInstallationInfo();

      expect(result).not.toBeNull();
      expect(
        result!.skillCount,
        "a tombstone records a skill this project has excluded, not one it manages",
      ).toBe(2);
    });

    /**
     * The counterpart of the tombstone case above, and its control: an entry the configuration
     * declares twice is one skill. Without it, a count that simply took `skills.length` would
     * satisfy every other test here while reporting a dual-scope install one too high.
     */
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
      const configPath = path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const agentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
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
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
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
      const projectAgentsDir = path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS);
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

/** Eject-mode installation report for `/project`; override the fields a test asserts on. */
function buildInstallationInfo(overrides: Partial<InstallationInfo> = {}): InstallationInfo {
  return {
    mode: "eject",
    name: "my-project",
    skillCount: 5,
    agentCount: 3,
    configPath: path.join("/project", CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
    agentDirs: [path.join("/project", CLAUDE_DIR, STANDARD_DIRS.AGENTS)],
    ...overrides,
  };
}

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

/** Plugin-mode installation rooted at `/project`, whose skills live in the plugin registry. */
function buildPluginInstallation(overrides: Partial<Installation> = {}): Installation {
  return buildInstallation({
    mode: "plugin",
    skillsDir: path.join("/project", CLAUDE_DIR, PLUGINS_SUBDIR),
    ...overrides,
  });
}

/**
 * Makes `discoverAllPluginSkills` resolve the listed map for those exact base
 * directories, and an empty map anywhere else — the shape of a settings.json
 * that enables plugins under one root and not another.
 */
function mockPluginSkillsByDir(skillsByDir: Record<string, SkillDefinitionMap>): void {
  mockedDiscoverAllPluginSkills.mockImplementation((dir) =>
    Promise.resolve(skillsByDir[dir] ?? {}),
  );
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
