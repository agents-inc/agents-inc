import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS } from "../pages/constants.js";
import {
  isClaudeCLIAvailable,
  claudePluginMarketplaceList,
  claudePluginInstall,
  claudePluginUninstall,
  execCommand,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
} from "../helpers/test-utils.js";

/**
 * Smoke tests for Claude CLI plugin commands.
 *
 * These tests verify that `claude plugin install`, `claude plugin marketplace add`,
 * and `claude plugin uninstall` work in the test environment. They call the real
 * `claude` binary via the exec utilities in src/cli/utils/exec.ts.
 *
 * The entire suite is skipped when the Claude CLI is not available (e.g. CI
 * without Claude installed).
 *
 * NOTE: These are smoke tests for the Claude CLI binary, NOT E2E tests for our CLI.
 * Moved from e2e/commands/plugin-install.e2e.test.ts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("claude plugin install (smoke)", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("claude CLI availability", () => {
    it("should report the Claude CLI version", async () => {
      const result = await execCommand("claude", ["--version"], {});

      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout.trim()).toMatch(/\d+\.\d+/);
    });
  });

  describe("marketplace commands", () => {
    it("should list marketplaces without error", async () => {
      const marketplaces = await claudePluginMarketplaceList();

      // The list may be empty or populated -- we just verify it returns an array
      expect(Array.isArray(marketplaces)).toBe(true);
    });

    it("should add a marketplace from a local directory source", async () => {
      tempDir = await createTempDir();

      // Create a minimal marketplace structure that `claude plugin marketplace add`
      // expects: a directory with a marketplace.json in .claude-plugin/
      const marketplaceDir = path.join(tempDir, "test-marketplace");
      const pluginDir = path.join(marketplaceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        path.join(pluginDir, "marketplace.json"),
        JSON.stringify({
          name: "e2e-smoke-test-marketplace",
          plugins: [],
        }),
      );

      // Attempt to add the local directory as a marketplace.
      // This may fail if the Claude CLI rejects the format -- that's useful
      // information too. We capture the result to understand the behavior.
      const result = await execCommand(
        "claude",
        ["plugin", "marketplace", "add", marketplaceDir],
        {},
      );

      // Record what happened for diagnostic purposes
      const combined = result.stdout + result.stderr;

      // The command should either succeed or fail with a descriptive error.
      // We don't assert exitCode === 0 because the marketplace format may not
      // match what the Claude CLI expects. Instead, we verify the command
      // doesn't hang (which was the original concern).
      expect(typeof result.exitCode).toBe("number");
      expect(combined).toMatch(/.+/);
    });
  });

  describe("plugin install and uninstall", () => {
    it("should attempt plugin install and return a result without hanging", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // Create .claude directory so the CLI has a valid project context
      const claudeDir = path.join(projectDir, DIRS.CLAUDE);
      await mkdir(claudeDir, { recursive: true });

      // Attempt to install a nonexistent plugin to verify the command doesn't hang.
      // We expect this to fail (plugin doesn't exist) but the key assertion is
      // that the command completes within a reasonable time.
      await expect(
        claudePluginInstall("nonexistent-plugin@nonexistent-marketplace", "project", projectDir),
      ).rejects.toThrow("Plugin installation failed");
    });

    it("should attempt plugin uninstall and return a result without hanging", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const claudeDir = path.join(projectDir, DIRS.CLAUDE);
      await mkdir(claudeDir, { recursive: true });

      // Uninstalling a nonexistent plugin should succeed silently (the exec
      // wrapper treats "not installed" / "not found" as non-errors)
      await expect(
        claudePluginUninstall("nonexistent-plugin@nonexistent-marketplace", "project", projectDir),
      ).resolves.toBeUndefined();
    });
  });

  describe("plugin install with raw exec", () => {
    it("should run claude plugin install via raw execCommand and complete", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const result = await execCommand(
        "claude",
        ["plugin", "install", "fake-skill@fake-marketplace", "--scope", "project"],
        { cwd: projectDir },
      );

      // The command should complete (not hang) and return a non-zero exit code
      // since the plugin doesn't exist
      expect(typeof result.exitCode).toBe("number");
      expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);

      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/.+/);
    });

    it("should run claude plugin uninstall via raw execCommand and complete", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const result = await execCommand(
        "claude",
        ["plugin", "uninstall", "fake-skill@fake-marketplace", "--scope", "project"],
        { cwd: projectDir },
      );

      // Should complete without hanging
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("settings.json side effects", () => {
    it("should not create settings.json when plugin install fails", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const claudeDir = path.join(projectDir, DIRS.CLAUDE);
      await mkdir(claudeDir, { recursive: true });

      const settingsPath = path.join(claudeDir, FILES.SETTINGS_JSON);

      // Attempt an install that will fail
      await claudePluginInstall(
        "nonexistent-plugin@nonexistent-marketplace",
        "project",
        projectDir,
      ).catch(() => {});

      // A failed install should not create or modify settings.json
      expect(await fileExists(settingsPath)).toBe(false);
    });
  });
});
