import path from "path";
import os from "os";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  isClaudeCLIAvailable,
  claudePluginMarketplaceAdd,
  claudePluginInstall,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
  renderSkillMd,
  writeProjectConfig,
  writeAgentFile,
  skillsPath,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";

/**
 * Plugin-mode uninstall E2E tests — core cleanup with Claude CLI.
 *
 * P-UNINSTALL-1: Full plugin chain uninstall with Claude CLI
 *   - Builds a plugin source, registers marketplace, installs a plugin,
 *     sets up config, then runs `uninstall --yes` and verifies cleanup.
 *
 * Reference: e2e-framework-design.md, Section 4.3
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("uninstall with plugins calls Claude CLI", () => {
  let fixture: E2EPluginSource;
  let projectDir: string;
  let projectTempDir: string;
  // Real HOME is needed so the CLI can find the plugin registry at
  // ~/.claude/plugins/installed_plugins.json (written by claudePluginInstall).
  const realHome = process.env.HOME || os.homedir();

  beforeAll(async () => {
    await ensureBinaryExists();

    // Step 1: Build plugin source (source -> build plugins -> build marketplace)
    fixture = await createE2EPluginSource();

    // Step 2: Create an isolated project directory
    projectTempDir = await createTempDir();
    projectDir = path.join(projectTempDir, "project");
    await mkdir(projectDir, { recursive: true });

    // Step 3: Register marketplace with Claude CLI
    await claudePluginMarketplaceAdd(fixture.sourceDir);

    // Step 4: Install a plugin via Claude CLI
    const pluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
    await claudePluginInstall(pluginRef, "project", projectDir);

    // Step 5: Create config.ts referencing the installed plugin
    await writeProjectConfig(projectDir, {
      name: "plugin-uninstall-test",
      skills: [
        {
          id: E2E_SKILL.react.id,
          scope: "project",
          source: fixture.marketplaceName,
        },
      ],
      agents: [{ name: "web-developer", scope: "project" }],
      domains: ["web"],
    });

    // Step 6: Create local skill with forkedFrom metadata (so skill uninstall works)
    const skillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, FILES.SKILL_MD),
      renderSkillMd(E2E_SKILL.react.id, "React framework", "# React\n\nTest content."),
    );
    await writeFile(path.join(skillDir, FILES.METADATA_YAML), FORKED_FROM_METADATA);

    // Step 7: Create agents directory
    await writeAgentFile(projectDir, "web-developer", { frontmatter: true, body: "" });

    // Note: No createPermissionsFile() here. The claudePluginInstall() call
    // in Step 4 creates .claude/settings.json with enabledPlugins. We must
    // not overwrite it with a permissions-only file.
  }, TIMEOUTS.INTERACTIVE);

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
    if (projectTempDir) await cleanupTempDir(projectTempDir);
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
      // Use real HOME so the CLI finds the plugin registry and can call
      // `claude plugin uninstall` to deregister the plugin.
      uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { HOME: realHome },
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
      // The uninstall command logs "  Uninstalled plugin '<name>'" per plugin
      expect(uninstallResult.stdout).toContain("Uninstalled plugin");
    });

    it("should clean up plugin from settings", async () => {
      await expect({ dir: projectDir }).toHaveNoPlugins();
    });

    it("should clean up skills and agents", async () => {
      await expectCleanUninstall(projectDir);
    });

    it("should remove the config manifest directory by default", async () => {
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(false);
    });
  });
});
