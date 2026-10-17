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
  fileExists,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";
import type { Marketplace } from "../../src/cli/types/index.js";

// Smoke tests for the real `claude plugin` commands, each pinned to a per-test config dir. Skipped
// where `claude` is absent.

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

      expect(Array.isArray(marketplaces)).toBe(true);
    });

    it("should add a marketplace from a local directory source", async () => {
      tempDir = await createTempDir();

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

      const claudeDir = path.join(projectDir, DIRS.CLAUDE);
      await mkdir(claudeDir, { recursive: true });

      // Must fail promptly rather than hang.
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

      // Claude's not-found message is classified as `absent`, not thrown.
      await expect(
        claudePluginUninstall("nonexistent-plugin@nonexistent-marketplace", "project", projectDir, {
          configDir: isolated.configDir,
        }),
      ).resolves.toBe("absent");
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

      await claudePluginInstall(
        "nonexistent-plugin@nonexistent-marketplace",
        "project",
        projectDir,
        {
          configDir: isolated.configDir,
        },
      ).catch(() => {});

      expect(await fileExists(settingsPath)).toBe(false);
    });
  });
});
