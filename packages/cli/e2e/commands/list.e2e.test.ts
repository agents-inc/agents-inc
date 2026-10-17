import path from "path";
import { mkdir, readdir, writeFile } from "fs/promises";
import { describe, it, expect, afterAll, beforeAll, afterEach } from "vitest";
import {
  cleanupFixture,
  configTsPath,
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  writeAgentFile,
  writeAgentStubs,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  DIRS,
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  FILES,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";

describe("list command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should report no installation in an empty directory and point at init", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(stdout).toContain("init");
  });

  it("should answer to the ls alias identically", async () => {
    tempDir = await createTempDir();

    const viaList = await CLI.run(["list"], { dir: tempDir });
    const viaAlias = await CLI.run(["ls"], { dir: tempDir });

    expect(viaAlias.exitCode).toBe(EXIT_CODES.SUCCESS);
    // A routing claim: same command, same report.
    expect(viaAlias.stdout).toBe(viaList.stdout);
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["list", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("Show installation information");
  });

  it("should display help text with ls --help alias", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["ls", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
  });

  describe("with local installation", () => {
    it("should report the installation's mode, config path and its exact counts", async () => {
      const skills = [E2E_SKILL.react.id, E2E_SKILL.vitest.id];
      const agents = [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name];
      const project = await ProjectBuilder.editable({ skills, agents });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name);
      await writeAgentFile(projectDir, E2E_AGENT["api-developer"].name);

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Installation:");
      expect(stdout).toContain("Mode:");
      expect(stdout).toContain("Eject");
      expect(stdout).toContain("Config:");
      expect(stdout).toContain(FILES.CONFIG_TS);

      // Whole labelled rows anchored to the line: a bare digit matches the banner or a path, and
      // `Agents:` labels both a count and a path.
      expect(stdout).toMatch(new RegExp(`^\\s*Skills:\\s+${skills.length}$`, "m"));
      expect(stdout).toMatch(new RegExp(`^\\s*Agents:\\s+${agents.length}$`, "m"));
    });
  });

  /**
   * `Skills: N` counts the config's skills minus tombstones, which neither the plugin registry nor
   * `.claude/skills/` answers alone. The dashboard reads the same producer, so both are held to one
   * constant.
   */
  describe("with a mixed installation", () => {
    /** Declared in config, owning no directory on disk. */
    const MARKETPLACE_SKILL_IDS = [E2E_SKILL.zustand.id, E2E_SKILL.vitest.id];

    const EJECTED_SKILL_IDS = [E2E_SKILL.react.id];

    const DECLARED_SKILL_COUNT = MARKETPLACE_SKILL_IDS.length + EJECTED_SKILL_IDS.length;

    /** Declared by no configuration: another tool's skill. */
    const UNDECLARED_SKILL_DIR = "context7-mcp";

    /** HOME is a sibling of the project, so the global scope is a second root. */
    async function buildMixedInstall(): Promise<{ project: ProjectHandle; home: string }> {
      const project = await ProjectBuilder.editable({
        skills: EJECTED_SKILL_IDS,
        globalSkills: MARKETPLACE_SKILL_IDS,
        globalSkillsSource: E2E_MARKETPLACE_NAME,
        agents: [E2E_AGENT["web-developer"].name],
      });
      tempDir = path.dirname(project.dir);
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });
      return { project, home };
    }

    it("counts the plugin skills, which own no directory on disk", async () => {
      const { project, home } = await buildMixedInstall();
      const configBefore = await readTestFile(configTsPath(project.dir));

      const { exitCode, stdout } = await CLI.run(["list"], project, { env: { HOME: home } });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the fixture's origins make this a mixed install").toContain("Mixed");
      expect(
        stdout,
        "a mixed installation manages its plugin skills as much as its ejected ones",
      ).toMatch(skillCountRow(DECLARED_SKILL_COUNT));

      expect(await readTestFile(configTsPath(project.dir)), "list must not rewrite config.ts").toBe(
        configBefore,
      );
      expect(
        (await readdir(skillsPath(project.dir))).sort(),
        "list must not add or remove a skill directory",
      ).toStrictEqual([...EJECTED_SKILL_IDS].sort());
    });

    /**
     * Driven here, not in its own spec: the claim is that two surfaces agree about one
     * installation.
     */
    it("reports that same number on the dashboard", async () => {
      const { project, home } = await buildMixedInstall();
      const configBefore = await readTestFile(configTsPath(project.dir));

      const { exitCode, stdout } = await CLI.run(["init"], project, { env: { HOME: home } });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "an installed project gets the dashboard").toContain(STEP_TEXT.DASHBOARD);
      expect(
        stdout,
        "the dashboard and list read one installation, so they cannot report two numbers",
      ).toMatch(new RegExp(`Skills:\\s+${DECLARED_SKILL_COUNT} installed`));

      expect(
        await readTestFile(configTsPath(project.dir)),
        "the dashboard must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await readdir(skillsPath(project.dir))).sort(),
        "the dashboard must not add or remove a skill directory",
      ).toStrictEqual([...EJECTED_SKILL_IDS].sort());
    });

    it("does not count a skill directory the configuration never declared", async () => {
      const { project, home } = await buildMixedInstall();
      await createLocalSkill(project.dir, UNDECLARED_SKILL_DIR);

      const { exitCode, stdout } = await CLI.run(["list"], project, { env: { HOME: home } });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(
        stdout,
        "a directory this CLI never installed is not part of what it reports it manages",
      ).toMatch(skillCountRow(DECLARED_SKILL_COUNT));
      expect(
        (await readdir(skillsPath(project.dir))).sort(),
        "the undeclared directory is still on disk — it is unreported, not removed",
      ).toStrictEqual([...EJECTED_SKILL_IDS, UNDECLARED_SKILL_DIR].sort());
    });

    /** Files can outlive a tombstone, so only the entry excludes it. */
    it("does not count a tombstoned entry", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });

      await writeProjectConfig(projectDir, {
        name: "tombstoned-mixed-install",
        marketplaceName: E2E_MARKETPLACE_NAME,
        skills: [
          ...buildSkillConfigs(EJECTED_SKILL_IDS, { scope: "project" }),
          ...buildSkillConfigs(MARKETPLACE_SKILL_IDS, {
            scope: "global",
            origin: E2E_MARKETPLACE_NAME,
          }),
          ...buildSkillConfigs([E2E_SKILL.pinia.id], {
            scope: "global",
            origin: E2E_MARKETPLACE_NAME,
            excluded: true,
          }),
        ],
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
      });
      for (const skillId of EJECTED_SKILL_IDS) {
        await createLocalSkill(projectDir, skillId);
      }

      const { exitCode, stdout } = await CLI.run(
        ["list"],
        { dir: projectDir },
        {
          env: { HOME: home },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(
        stdout,
        "a tombstone records a skill this project has excluded, not one it manages",
      ).toMatch(skillCountRow(DECLARED_SKILL_COUNT));
    });
  });

  describe("with multiple skills installed", () => {
    // Known gap: `list` shows counts, not skill ids.
    it.fails("should show all skill IDs in output", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(E2E_SKILL.react.id);
      expect(stdout).toContain(E2E_SKILL.vitest.id);
      expect(stdout).toContain(E2E_SKILL.zustand.id);
    });
  });

  describe("skill type distinction", () => {
    // Known gap: `list` does not distinguish CLI-managed from user-created skills.
    it.fails("should distinguish CLI-managed and user-created skills in output", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "web-utilities-date-fns", {
        description: "A user-created custom skill",
        metadata: renderMetadataYaml({
          custom: true,
          author: "@local",
          displayName: "My Custom Helper",
          category: "web-utilities",
          contentHash: "custom-hash",
        }),
      });

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(E2E_SKILL.react.id);
      expect(stdout).toContain(E2E_SKILL.vitest.id);
      expect(stdout).toContain("web-utilities-date-fns");
      expect(stdout).toMatch(/custom|user|local/i);
    });
  });

  describe("edge cases", () => {
    it("should handle project with skills directory but no config", async () => {
      tempDir = await createTempDir();

      await mkdir(skillsPath(tempDir), { recursive: true });
      await createLocalSkill(tempDir, "web-animation-css-animations");

      const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.NO_INSTALLATION);
    });

    it("should answer to the ls alias identically on a local installation", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      const viaList = await CLI.run(["list"], { dir: project.dir });
      const viaAlias = await CLI.run(["ls"], { dir: project.dir });

      expect(viaAlias.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(viaAlias.stdout).toContain("Installation:");
      expect(viaAlias.stdout).toBe(viaList.stdout);
    });
  });

  describe("global installation fallback", () => {
    it("should show global installation details when no project config exists", async () => {
      tempDir = await createTempDir();

      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      await mkdir(path.join(skillsPath(globalHome), E2E_SKILL.react.id), { recursive: true });

      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["list"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Installation:");
      expect(stdout).toContain("Eject");
      expect(stdout).toContain("Skills:");
    });
  });

  describe("with a plugin installation", () => {
    let pluginSource: E2EPluginSource;

    beforeAll(async () => {
      pluginSource = await createE2EPluginSource();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await cleanupFixture(pluginSource);
    });

    it(
      "counts plugin skills enabled at the home root from a project directory",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const globalSkillIds = [E2E_SKILL.react.id, E2E_SKILL.zustand.id];
        const install = await createScopedPluginInstall({
          pluginsDir: pluginSource.pluginsDir,
          marketplace: pluginSource.marketplaceName,
          globalSkillIds,
          projectSkillIds: [],
        });
        tempDir = install.tempDir;
        const commandEnv = { HOME: install.home };
        const configBefore = await readTestFile(configTsPath(install.projectDir));

        // Control: read from the home root the plugins have always been reported, so fewer from the
        // project is a lost scope.
        const fromHome = await CLI.run(["list"], { dir: install.home }, { env: commandEnv });
        expect(fromHome.exitCode).toBe(EXIT_CODES.SUCCESS);
        expect(fromHome.stdout, "the home root reports the plugins enabled under it").toMatch(
          skillCountRow(globalSkillIds.length),
        );

        const fromProject = await CLI.run(
          ["list"],
          { dir: install.projectDir },
          { env: commandEnv },
        );

        expect(fromProject.exitCode).toBe(EXIT_CODES.SUCCESS);
        expect(
          fromProject.stdout,
          "a project owns everything installed globally, so it reports the globally enabled plugin skills too",
        ).toMatch(skillCountRow(globalSkillIds.length));
        expect(
          await readTestFile(configTsPath(install.projectDir)),
          "list must not rewrite config.ts",
        ).toBe(configBefore);
      },
    );

    it(
      "counts a plugin skill enabled at both scopes once",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const install = await createScopedPluginInstall({
          pluginsDir: pluginSource.pluginsDir,
          marketplace: pluginSource.marketplaceName,
          globalSkillIds: [E2E_SKILL.react.id, E2E_SKILL.zustand.id],
          projectSkillIds: [E2E_SKILL.zustand.id, E2E_SKILL.vitest.id],
        });
        tempDir = install.tempDir;
        const commandEnv = { HOME: install.home };

        const { exitCode, stdout } = await CLI.run(
          ["list"],
          { dir: install.projectDir },
          { env: commandEnv },
        );

        expect(exitCode).toBe(EXIT_CODES.SUCCESS);
        // Three distinct skills, so four means the scopes were added, not merged.
        expect(
          stdout,
          "the two scopes merge by skill id, so a skill enabled at both is one skill and not two",
        ).toMatch(skillCountRow(3));
        expect(
          stdout,
          "one compiled agent under each root, and a project context owns both",
        ).toMatch(agentCountRow(2));
      },
    );
  });
});

/**
 * Anchored to the whole line: `Agents:` labels a count row and path rows, and digits occur in the
 * banner and paths.
 */
function skillCountRow(count: number): RegExp {
  return new RegExp(`^\\s*Skills:\\s+${count}$`, "m");
}

function agentCountRow(count: number): RegExp {
  return new RegExp(`^\\s*Agents:\\s+${count}$`, "m");
}

const PLUGIN_REGISTRY_VERSION = 1;
const PLUGIN_VERSION = "1.0.0";
const PLUGIN_INSTALLED_AT = "2026-01-01T00:00:00.000Z";
const READ_PERMISSION = "Read(*)";

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

function pluginKeysFor(skillIds: string[], marketplace: string): string[] {
  return skillIds.map((id) => `${id}@${marketplace}`);
}

/**
 * A finished plugin install with plugins enabled under both roots and one registry in the home
 * root, written directly so no Claude CLI is needed. Plugin mode copies no skills into
 * `.claude/skills/`.
 */
async function createScopedPluginInstall(options: {
  pluginsDir: string;
  marketplace: string;
  globalSkillIds: string[];
  projectSkillIds: string[];
}): Promise<{ tempDir: string; home: string; projectDir: string }> {
  const installTempDir = await createTempDir();
  const home = path.join(installTempDir, "home");
  const projectDir = path.join(installTempDir, "project");
  const installedSkillIds = [...new Set([...options.globalSkillIds, ...options.projectSkillIds])];

  const globalSkills = options.globalSkillIds.map((id) => ({
    id,
    scope: "global" as const,
    origin: options.marketplace,
  }));
  const projectSkills = options.projectSkillIds.map((id) => ({
    id,
    scope: "project" as const,
    origin: options.marketplace,
  }));

  await writeProjectConfig(home, {
    name: "global-plugin-install",
    marketplaceName: options.marketplace,
    skills: globalSkills,
    agents: [{ name: E2E_AGENT["api-developer"].name, scope: "global" }],
    selectedDomains: ["web"],
  });
  await writeProjectConfig(projectDir, {
    name: "project-plugin-install",
    marketplaceName: options.marketplace,
    skills: [...globalSkills, ...projectSkills],
    agents: [
      { name: E2E_AGENT["api-developer"].name, scope: "global" },
      { name: E2E_AGENT["web-developer"].name, scope: "project" },
    ],
    selectedDomains: ["web"],
  });

  await writeAgentStubs(home, [E2E_AGENT["api-developer"].name]);
  await writeAgentStubs(projectDir, [E2E_AGENT["web-developer"].name]);

  for (const [baseDir, skillIds] of [
    [home, options.globalSkillIds],
    [projectDir, options.projectSkillIds],
  ] as const) {
    await writeJsonFile(path.join(baseDir, DIRS.CLAUDE, FILES.SETTINGS_JSON), {
      permissions: { allow: [READ_PERMISSION] },
      enabledPlugins: Object.fromEntries(
        pluginKeysFor(skillIds, options.marketplace).map((key) => [key, true]),
      ),
    });
  }

  await writeJsonFile(path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON), {
    version: PLUGIN_REGISTRY_VERSION,
    plugins: Object.fromEntries(
      installedSkillIds.map((id) => [
        `${id}@${options.marketplace}`,
        [
          {
            scope: "user",
            installPath: path.join(options.pluginsDir, id),
            version: PLUGIN_VERSION,
            installedAt: PLUGIN_INSTALLED_AT,
          },
        ],
      ]),
    ),
  });

  return { tempDir: installTempDir, home, projectDir };
}
