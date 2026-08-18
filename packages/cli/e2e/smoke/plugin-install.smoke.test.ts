import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS } from "../pages/constants.js";
import {
  isClaudeCLIAvailable,
  claudePluginMarketplaceList,
  claudePluginInstall,
  claudePluginUninstall,
  execCommand,
  createIsolatedClaudeHome,
  createTempDir,
  cleanupIsolatedClaudeHome,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";
import type { Marketplace } from "../../src/cli/types/index.js";

/**
 * Smoke tests for Claude CLI plugin commands.
 *
 * These tests verify that `claude plugin install`, `claude plugin marketplace add`,
 * and `claude plugin uninstall` work in the test environment. They call the real
 * `claude` binary via the exec utilities in src/cli/utils/exec.ts.
 *
 * Every call is pinned to a per-test config dir. The marketplace add below used
 * to land in the machine's own installation under a name outside
 * `E2E_MARKETPLACE_PREFIX`, so the suite's own sweep could never reach it — a
 * registration pointing at a temp directory that the same test then deleted.
 *
 * The entire suite is skipped when the Claude CLI is not available (e.g. CI
 * without Claude installed).
 *
 * NOTE: These are smoke tests for the Claude CLI binary, NOT E2E tests for our CLI.
 */

/**
 * The manifest this file writes and the registration it then reads back.
 *
 * Typed as `Marketplace` so the compiler enforces the required fields. It used
 * to be an untyped `{ name, plugins }` literal that the Claude CLI rejected on
 * `owner: expected object, received undefined` — invisible, because the only
 * assertion was that the exit code was a number.
 */
const SMOKE_MARKETPLACE: Marketplace = {
  name: "e2e-smoke-test-marketplace",
  version: "1.0.0",
  owner: { name: "agents-inc-e2e" },
  plugins: [],
};

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("claude plugin install (smoke)", () => {
  let tempDir: string;
  let isolated: IsolatedClaudeHome;

  beforeAll(async () => {
    await ensureBinaryExists();
    isolated = await createIsolatedClaudeHome();
  });

  afterAll(async () => {
    await cleanupIsolatedClaudeHome(isolated);
  });

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
      const marketplaces = await claudePluginMarketplaceList({ configDir: isolated.configDir });

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
        path.join(pluginDir, FILES.MARKETPLACE_JSON),
        JSON.stringify(SMOKE_MARKETPLACE),
      );

      const result = await execCommand("claude", ["plugin", "marketplace", "add", marketplaceDir], {
        env: { CLAUDE_CONFIG_DIR: isolated.configDir },
      });

      // Asserted rather than merely recorded: with the registration landing in a
      // temp config dir, whether the Claude CLI accepts this manifest shape is a
      // question the test can answer instead of tolerate.
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      const registered = await claudePluginMarketplaceList({ configDir: isolated.configDir });
      expect(registered.map((marketplace) => marketplace.name)).toContain(SMOKE_MARKETPLACE.name);
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
        claudePluginInstall("nonexistent-plugin@nonexistent-marketplace", "project", projectDir, {
          configDir: isolated.configDir,
        }),
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
        claudePluginUninstall("nonexistent-plugin@nonexistent-marketplace", "project", projectDir, {
          configDir: isolated.configDir,
        }),
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
        { cwd: projectDir, env: { CLAUDE_CONFIG_DIR: isolated.configDir } },
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
        { cwd: projectDir, env: { CLAUDE_CONFIG_DIR: isolated.configDir } },
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
        {
          configDir: isolated.configDir,
        },
      ).catch(() => {});

      // A failed install should not create or modify settings.json
      expect(await fileExists(settingsPath)).toBe(false);
    });
  });
});
