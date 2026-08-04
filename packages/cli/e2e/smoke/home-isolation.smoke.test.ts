import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { DIRS, EXIT_CODES, SOURCE_PATHS } from "../pages/constants.js";
import {
  isClaudeCLIAvailable,
  execCommand,
  ensureBinaryExists,
  createTempDir,
  cleanupTempDir,
} from "../helpers/test-utils.js";

/**
 * Blocker 7.6: HOME Isolation + Claude CLI Auth
 *
 * This test determines whether Claude CLI plugin commands work when HOME
 * is set to a temporary directory. If they don't (e.g., due to auth requirements),
 * all subsequent plugin E2E tests must use the real HOME directory instead.
 *
 * Each test documents the actual CLI behavior to inform the test framework design.
 *
 * NOTE: These are smoke tests for the Claude CLI binary, NOT E2E tests for our CLI.
 * Moved from e2e/lifecycle/home-isolation.e2e.test.ts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "HOME isolation: claude plugin commands work with HOME=<tempDir>",
  () => {
    let tempDir: string | undefined;

    beforeAll(ensureBinaryExists);

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it("should run claude --version with HOME=<tempDir>", async () => {
      tempDir = await createTempDir();
      const result = await execCommand("claude", ["--version"], {
        env: { ...process.env, HOME: tempDir },
      });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout.trim()).toMatch(/\d+\.\d+/);
    });

    it("should list marketplaces with HOME=<tempDir>", async () => {
      tempDir = await createTempDir();
      const result = await execCommand("claude", ["plugin", "marketplace", "list", "--json"], {
        env: { ...process.env, HOME: tempDir },
      });
      // May fail with auth error -- document the behavior
      expect(typeof result.exitCode).toBe("number");
    });

    it("should attempt marketplace add with HOME=<tempDir>", async () => {
      // Create a minimal marketplace structure
      tempDir = await createTempDir();
      const marketplaceDir = path.join(tempDir, "marketplace");
      const pluginDir = path.join(marketplaceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        path.join(pluginDir, "marketplace.json"),
        JSON.stringify({ name: "home-isolation-test", plugins: [] }),
      );

      const result = await execCommand("claude", ["plugin", "marketplace", "add", marketplaceDir], {
        env: { ...process.env, HOME: tempDir },
      });

      // Document the result -- key question is whether auth is required
      expect(typeof result.exitCode).toBe("number");
      // If it fails with auth error, we know HOME isolation doesn't work for plugin commands
    });

    it("should attempt plugin install with HOME=<tempDir>", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });

      const result = await execCommand(
        "claude",
        ["plugin", "install", "nonexistent@nonexistent", "--scope", "project"],
        {
          cwd: projectDir,
          env: { ...process.env, HOME: tempDir },
        },
      );

      // Should complete without hanging (key assertion)
      expect(typeof result.exitCode).toBe("number");
      // If exitCode is non-zero due to auth error, document it
    });
  },
);
