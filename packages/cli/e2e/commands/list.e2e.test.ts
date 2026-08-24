import path from "path";
import { mkdir, writeFile } from "fs/promises";
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
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

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
    // The alias is a routing claim: same command, same report. Asserting one
    // shared substring cannot tell the alias apart from a different command that
    // happens to print it too.
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

      // Counts asserted as whole labelled rows against the fixture's own lists,
      // anchored to the line so the value is the count and nothing else. A bare
      // `toContain("2")` matches the version banner, a path segment, or any other
      // digit in the report — and `Agents:` labels two different rows here, a
      // count and a path.
      expect(stdout).toMatch(new RegExp(`^\\s*Skills:\\s+${skills.length}$`, "m"));
      expect(stdout).toMatch(new RegExp(`^\\s*Agents:\\s+${agents.length}$`, "m"));
    });
  });

  describe("with multiple skills installed", () => {
    // The list command currently only shows skill counts, not individual skill IDs.
    // This test asserts the user should see which skills are installed.
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
    // BUG: The list command only shows skill counts (e.g., "Skills: 3"), not individual
    // skill names or types. There is no distinction between CLI-managed skills (installed
    // from a source with forkedFrom metadata) and user-created skills (custom: true,
    // no forkedFrom). Users should be able to see which skills are custom vs managed.
    it.fails("should distinguish CLI-managed and user-created skills in output", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Add a user-created skill (custom: true, no forkedFrom)
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
      // The output should show individual skills with some kind of type indicator
      expect(stdout).toContain(E2E_SKILL.react.id);
      expect(stdout).toContain(E2E_SKILL.vitest.id);
      expect(stdout).toContain("web-utilities-date-fns");
      // There should be a visible distinction between managed and custom skills
      expect(stdout).toMatch(/custom|user|local/i);
    });
  });

  describe("edge cases", () => {
    it("should handle project with skills directory but no config", async () => {
      tempDir = await createTempDir();

      // Create .claude/skills/ with a skill but no config.ts
      await mkdir(skillsPath(tempDir), { recursive: true });
      await createLocalSkill(tempDir, "web-animation-css-animations");

      const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // Without config.ts, detectInstallation returns null
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

      // Create a "global home" directory with .claude-src/config.ts
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      // Create skills directory with a skill folder so skill count > 0
      await mkdir(path.join(skillsPath(globalHome), E2E_SKILL.react.id), { recursive: true });

      // Create a project directory WITHOUT config (so detectInstallation falls back to global)
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // Run list with HOME pointing to globalHome so detectGlobalInstallation finds the config
      const { exitCode, stdout } = await CLI.run(
        ["list"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // detectInstallation should fall back to the global config and show installation info
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

        // The home root is the control: the same install read from the root the
        // plugins are enabled under has always reported them, so a project
        // reporting fewer is the CLI losing a scope, not the fixture failing to
        // install one.
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
        // Zustand is enabled under both roots. Three distinct skills are
        // installed, so a report of four is the two scopes added rather than
        // merged.
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
 * The report's Skills / Agents count rows, anchored to the whole line so the
 * digit matched is the count and nothing else — `Agents:` labels both a count
 * row and one path row per directory, and a bare digit also occurs in the
 * version banner and in path segments.
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
 * Reproduces a completed plugin install whose plugins are enabled under two
 * different roots — `claude plugin install --scope user` writes the home root's
 * settings.json, `--scope project` writes the project's — while both resolve
 * through the single registry the Claude CLI keeps in the home root. Writing
 * the files directly reproduces the finished install without needing the Claude
 * CLI binary, so these tests run unconditionally.
 *
 * Both roots get a config.ts, the way a global install plus a project install
 * leaves them, so `list` detects an installation from either directory.
 * Plugin mode never copies skills into `.claude/skills/`, so none are written.
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
