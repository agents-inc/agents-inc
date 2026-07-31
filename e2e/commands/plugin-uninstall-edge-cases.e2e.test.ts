import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
  fileExists,
  readTestFile,
  renderSkillMd,
  writeProjectConfig,
  writeAgentFile,
  agentsPath,
  skillsPath,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

/**
 * Plugin-mode uninstall E2E tests — edge cases.
 *
 * P-UNINSTALL-3: Uninstall with plugin config but no real plugins installed.
 *   - Config references plugin-mode skills, but no plugins exist on disk.
 *   - Verifies uninstall completes gracefully and cleans up local files.
 *
 * Also tests:
 *   - Preserving non-CLI plugins in settings.json
 *   - Uninstall when Claude CLI is not on PATH
 *   - --all flag behavior
 *
 * Reference: e2e-framework-design.md, Section 4.3
 */

/**
 * Creates a standard uninstall test project with config, a skill, and agents.
 * Returns the project directory and paths to key directories for assertions.
 */
async function createUninstallableProject(
  tempDir: string,
  options: {
    configName: string;
    skillSource: string;
    settingsJson?: string;
  },
): Promise<{ projectDir: string; skillDir: string; agentsDir: string }> {
  const projectDir = path.join(tempDir, "project");

  await writeProjectConfig(projectDir, {
    name: options.configName,
    skills: [
      {
        id: "web-framework-react",
        scope: "project",
        source: options.skillSource,
      },
    ],
    agents: [{ name: "web-developer", scope: "project" }],
    domains: ["web"],
  });

  const skillDir = path.join(skillsPath(projectDir), "web-framework-react");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, FILES.SKILL_MD),
    renderSkillMd("web-framework-react", "React framework", "# React\n\nTest content."),
  );
  await writeFile(path.join(skillDir, FILES.METADATA_YAML), FORKED_FROM_METADATA);

  const agentsDir = agentsPath(projectDir);
  await writeAgentFile(projectDir, "web-developer", { frontmatter: true, body: "" });

  if (options.settingsJson) {
    const claudeDir = path.join(projectDir, DIRS.CLAUDE);
    await writeFile(path.join(claudeDir, FILES.SETTINGS_JSON), options.settingsJson);
  }

  return { projectDir, skillDir, agentsDir };
}

describe("uninstall with plugin config but no installed plugins", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should complete gracefully when config references plugins that are not installed", async () => {
    tempDir = await createTempDir();
    const { projectDir, skillDir, agentsDir } = await createUninstallableProject(tempDir, {
      configName: "phantom-plugin-project",
      skillSource: "nonexistent-marketplace",
    });

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Skills and agents should still be cleaned up even without real plugins
    expect(await directoryExists(skillDir)).toBe(false);
    expect(await directoryExists(agentsDir)).toBe(false);
  });

  it("should remove local skills and agents even without plugin uninstall", async () => {
    tempDir = await createTempDir();
    const { projectDir, skillDir, agentsDir } = await createUninstallableProject(tempDir, {
      configName: "no-plugins-project",
      skillSource: "some-marketplace",
    });

    expect(await directoryExists(skillDir)).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);

    const { exitCode } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    expect(await directoryExists(skillDir)).toBe(false);
    expect(await directoryExists(agentsDir)).toBe(false);
  });

  it("should handle settings.json with plugins that are not in config", async () => {
    tempDir = await createTempDir();
    const { projectDir, skillDir } = await createUninstallableProject(tempDir, {
      configName: "local-only-project",
      skillSource: "eject",
      settingsJson: JSON.stringify({
        permissions: { allow: ["Read(*)"] },
        enabledPlugins: {
          "manual-plugin@some-marketplace": true,
        },
      }),
    });

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await directoryExists(skillDir)).toBe(false);

    // Manual plugin entry should be preserved in settings.json
    const settingsPath = path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    expect(await fileExists(settingsPath), "settings.json must exist after uninstall").toBe(true);
    const settingsContent = await readTestFile(settingsPath);
    const settings = JSON.parse(settingsContent);
    expect(settings.enabledPlugins?.["manual-plugin@some-marketplace"]).toBe(true);
  });

  it("should also remove config by default when no plugins exist", async () => {
    tempDir = await createTempDir();
    const { projectDir } = await createUninstallableProject(tempDir, {
      configName: "config-removal-test",
      skillSource: "fake-marketplace",
    });

    const configDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], {
      dir: projectDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // "also" means on top of the skills and agents: assert the whole clean state,
    // not just the config dir, so leftover skill dirs cannot survive unnoticed.
    await expectCleanUninstall(projectDir, { removeConfig: true });
  });
});

describe("uninstall preserves non-CLI plugins", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should preserve manually-placed plugins in settings.json after uninstall", async () => {
    tempDir = await createTempDir();
    const { projectDir, skillDir } = await createUninstallableProject(tempDir, {
      configName: "preserve-manual-plugins-test",
      skillSource: "some-marketplace",
      settingsJson: JSON.stringify({
        permissions: { allow: ["Read(*)"] },
        enabledPlugins: {
          "web-framework-react@some-marketplace": true,
          "manual-plugin@other-marketplace": true,
        },
      }),
    });

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    const settingsPath = path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    expect(await fileExists(settingsPath), "settings.json must exist after uninstall").toBe(true);
    const settingsContent = await readTestFile(settingsPath);
    const settings = JSON.parse(settingsContent);
    expect(settings.enabledPlugins?.["manual-plugin@other-marketplace"]).toBe(true);

    expect(await directoryExists(skillDir)).toBe(false);
  });

  it("should not remove enabledPlugins entries that are not in config", async () => {
    tempDir = await createTempDir();
    const { projectDir } = await createUninstallableProject(tempDir, {
      configName: "multi-plugin-test",
      skillSource: "marketplace-a",
      settingsJson: JSON.stringify({
        permissions: { allow: ["Read(*)"] },
        enabledPlugins: {
          "web-framework-react@marketplace-a": true,
          "some-other-skill@marketplace-b": true,
          "third-party-tool@external-source": true,
        },
      }),
    });

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    const settingsPath = path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    expect(await fileExists(settingsPath), "settings.json must exist after uninstall").toBe(true);
    const settingsContent = await readTestFile(settingsPath);
    const settings = JSON.parse(settingsContent);
    expect(settings.enabledPlugins?.["some-other-skill@marketplace-b"]).toBe(true);
    expect(settings.enabledPlugins?.["third-party-tool@external-source"]).toBe(true);
  });
});

describe("uninstall without Claude CLI on PATH", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should complete uninstall when claude binary is not available", async () => {
    tempDir = await createTempDir();
    const { projectDir, skillDir, agentsDir } = await createUninstallableProject(tempDir, {
      configName: "no-claude-cli-test",
      skillSource: "some-marketplace",
      settingsJson: JSON.stringify({
        permissions: { allow: ["Read(*)"] },
        enabledPlugins: {
          "web-framework-react@some-marketplace": true,
        },
      }),
    });

    expect(await directoryExists(skillDir)).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);

    // Use a minimal PATH that includes node and basic Unix utilities but NOT claude.
    const minimalPath = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":");

    const { exitCode, stdout, stderr } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      {
        env: {
          PATH: minimalPath,
          HOME: projectDir,
        },
      },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await directoryExists(skillDir)).toBe(false);

    expect(await directoryExists(agentsDir)).toBe(false);

    expect(stderr).not.toContain("claude");
    expect(stdout).not.toContain("claude: command not found");
  });
});
