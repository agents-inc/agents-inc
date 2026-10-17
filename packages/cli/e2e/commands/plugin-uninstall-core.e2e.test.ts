import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  FORKED_FROM_METADATA,
  claudePluginInstall,
  claudePluginMarketplaceAdd,
  cleanupFixture,
  cleanupIsolatedClaudeHome,
  cleanupTempDir,
  createIsolatedClaudeHome,
  createLocalSkill,
  createTempDir,
  isClaudeCLIAvailable,
  writeAgentFile,
  writeProjectConfig,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/** Plugin-mode `uninstall --yes` with the Claude CLI: full-chain cleanup. */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("uninstall with plugins calls Claude CLI", () => {
  let fixture: E2EPluginSource;
  let projectDir: string;
  let projectTempDir: string;
  // One temp tree is both the Claude config dir and the HOME `getUserPluginsDir()` reads, so
  // `uninstall` sees the registry `claudePluginInstall` wrote.
  let isolated: IsolatedClaudeHome;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    isolated = await createIsolatedClaudeHome();

    projectTempDir = await createTempDir();
    projectDir = path.join(projectTempDir, "project");
    await mkdir(projectDir, { recursive: true });

    await claudePluginMarketplaceAdd(fixture.sourceDir, { configDir: isolated.configDir });

    const pluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
    await claudePluginInstall(pluginRef, "project", projectDir, {
      configDir: isolated.configDir,
    });

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "plugin-uninstall-test",
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "project",
          origin: fixture.marketplaceName,
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        selectedDomains: ["web"],
      }),
    );

    // forkedFrom metadata, so skill uninstall applies.
    await createLocalSkill(projectDir, E2E_SKILL.react.id, {
      description: "React framework",
      body: "# React\n\nTest content.",
      metadata: FORKED_FROM_METADATA,
    });

    await writeAgentFile(projectDir, "web-developer", { frontmatter: true, body: "" });

    // No createPermissionsFile(): `claudePluginInstall()` already wrote settings.json with
    // enabledPlugins.
  }, TIMEOUTS.INTERACTIVE);

  afterAll(async () => {
    await cleanupFixture(fixture);
    if (projectTempDir) await cleanupTempDir(projectTempDir);
    await cleanupIsolatedClaudeHome(isolated);
  });

  describe("pre-conditions", () => {
    it("should have the plugin registered in settings before uninstall", async () => {
      const pluginKey = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
      await expect({ dir: projectDir }).toHavePlugin(pluginKey);
    });
  });

  describe("after uninstall --yes", () => {
    let uninstallResult: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      // The run's own HOME, so `uninstall` finds the registry the install wrote; `CLI.run` derives
      // CLAUDE_CONFIG_DIR from it.
      uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { HOME: isolated.home },
        },
      );
    }, TIMEOUTS.PLUGIN_INSTALL);

    it("should exit with code 0", () => {
      expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it("should report uninstall complete in output", () => {
      expect(uninstallResult.stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
    });

    it("should report per-plugin uninstall messages", () => {
      expect(uninstallResult.stdout).toContain("Uninstalled plugin");
    });

    it("should clean up plugin from settings", async () => {
      await expect({ dir: projectDir }).toHaveNoPlugins();
    });

    it("should clean up skills and agents", async () => {
      await expectCleanUninstall(projectDir);
    });

    it("should remove the config manifest directory by default", async () => {
      await expectNoSourceFolder(
        projectDir,
        "uninstall removes the config manifest's folder by default",
      );
    });
  });
});
