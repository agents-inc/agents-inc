import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { foundByName } from "../helpers/found-by-name.js";
import { pathHoldingOnly } from "../helpers/path-holding-only.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  FORKED_FROM_METADATA,
  readTestFile,
  sourceFolderIn,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { withCodexOnIt } from "../fixtures/codex-on-path.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { buildClaudeSettings } from "../../src/cli/lib/__tests__/factories/claude-settings-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * Plugin-mode uninstall edge cases: plugin config with no plugins installed, preserving non-CLI
 * plugins in settings.json, no Claude CLI on PATH, and --all.
 */

/**
 * `enabledPlugins` writes a `.claude/settings.json` switching those keys on; without it there is no
 * settings file.
 */
async function createUninstallableProject(
  tempDir: string,
  options: {
    configName: string;
    skillSource: string;
    enabledPlugins?: readonly string[];
  },
): Promise<{ projectDir: string; skillDir: string; agentsDir: string }> {
  const projectDir = path.join(tempDir, "project");

  await writeProjectConfig(
    projectDir,
    buildProjectConfig({
      name: options.configName,
      skills: buildSkillConfigs([E2E_SKILL.react.id], {
        scope: "project",
        origin: options.skillSource,
      }),
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      selectedDomains: ["web"],
    }),
  );

  const skillDir = await createLocalSkill(projectDir, E2E_SKILL.react.id, {
    description: "React framework",
    body: "# React\n\nTest content.",
    metadata: FORKED_FROM_METADATA,
  });

  const agentsDir = agentsPath(projectDir);
  await writeAgentFile(projectDir, "web-developer", { frontmatter: true, body: "" });

  if (options.enabledPlugins) {
    await writeFile(
      path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON),
      JSON.stringify(buildClaudeSettings(options.enabledPlugins)),
    );
  }

  return { projectDir, skillDir, agentsDir };
}

describe("uninstall with plugin config but no installed plugins", () => {
  let tempDir: string;

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
      enabledPlugins: ["manual-plugin@some-marketplace"],
    });

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await directoryExists(skillDir)).toBe(false);

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

    const configDir = sourceFolderIn(projectDir);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], {
      dir: projectDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // "also" means on top of skills and agents, so the whole clean state is asserted.
    await expectCleanUninstall(projectDir, { removeConfig: true });
  });
});

describe("uninstall preserves non-CLI plugins", () => {
  let tempDir: string;

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
      enabledPlugins: ["web-framework-react@some-marketplace", "manual-plugin@other-marketplace"],
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
      enabledPlugins: [
        "web-framework-react@marketplace-a",
        "some-other-skill@marketplace-b",
        "third-party-tool@external-source",
      ],
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
      enabledPlugins: ["web-framework-react@some-marketplace"],
    });

    expect(await directoryExists(skillDir)).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);

    // Only node and sh, linked individually: node's bin directory is where a global npm install
    // puts `claude`.
    const pathWithoutClaude = await pathHoldingOnly({ root: tempDir }, ["node", "sh"]);

    // Subject guard on the PATH the command gets: `CLI.run` prepends the pinned codex.
    expect(
      await foundByName("claude", withCodexOnIt(pathWithoutClaude)),
      "the uninstall below would run with a claude on its PATH, so it could not show the binary's absence is survived",
    ).toBe("");

    const { exitCode, stdout, stderr } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      {
        env: {
          PATH: pathWithoutClaude,
          HOME: projectDir,
        },
      },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await directoryExists(skillDir)).toBe(false);

    expect(await directoryExists(agentsDir)).toBe(false);

    // Specific failure shapes, not the word "claude", which correct output also carries.
    expect(stderr).not.toContain("command not found");
    expect(stderr).not.toContain("ENOENT");
    expect(stdout).not.toContain("claude: command not found");
  });
});
