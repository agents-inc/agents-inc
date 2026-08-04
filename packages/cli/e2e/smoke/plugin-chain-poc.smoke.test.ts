import { mkdir } from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { TIMEOUTS, DIRS, FILES, SOURCE_PATHS } from "../pages/constants.js";
import {
  isClaudeCLIAvailable,
  claudePluginMarketplaceAdd,
  claudePluginInstall,
  ensureBinaryExists,
  cleanupTempDir,
  fileExists,
  createTempDir,
  listFiles,
  readTestFile,
} from "../helpers/test-utils.js";

import "../matchers/setup.js";

/**
 * Blocker 7.1: Full Plugin Chain Proof-of-Concept
 *
 * This test proves the entire plugin build -> register -> install chain works
 * end-to-end using the E2E source fixture. It must pass before any plugin-mode
 * E2E tests can be written.
 *
 * The test uses the REAL HOME directory (not isolated) since Blocker 7.6
 * (HOME isolation) hasn't been resolved yet.
 *
 * Chain under test:
 *   createE2ESource() -> build plugins -> build marketplace -> claude plugin marketplace add -> claude plugin install
 *
 * NOTE: These are smoke tests for the Claude CLI binary integration, NOT pure E2E
 * tests for our CLI. Steps 3-5 call the Claude CLI directly.
 * Moved from e2e/integration/plugin-chain-poc.e2e.test.ts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "full plugin chain: build -> register -> install -> verify",
  () => {
    let fixture: E2EPluginSource;
    let projectDir: string;
    let projectTempDir: string;

    beforeAll(async () => {
      await ensureBinaryExists();
      fixture = await createE2EPluginSource();

      // Create an isolated project directory for plugin installation
      projectTempDir = await createTempDir();
      projectDir = path.join(projectTempDir, "project");
      await mkdir(projectDir, { recursive: true });
      // Create .claude dir for plugin context
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      if (fixture) await cleanupTempDir(fixture.tempDir);
      if (projectTempDir) await cleanupTempDir(projectTempDir);
    });

    // Step 1: Verify build plugins produced output
    it("should have built plugin directories with manifests", async () => {
      const pluginDirs = await listFiles(fixture.pluginsDir);
      expect(pluginDirs.length).toBeGreaterThanOrEqual(1);

      // Check at least one has .claude-plugin/plugin.json
      const firstDir = pluginDirs[0];
      if (!firstDir) throw new Error("Expected at least one plugin directory");
      const firstPlugin = path.join(fixture.pluginsDir, firstDir);
      expect(
        await fileExists(
          path.join(firstPlugin, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.PLUGIN_JSON),
        ),
      ).toBe(true);
    });

    // Step 2: Verify marketplace.json was built
    it("should have a valid marketplace.json", async () => {
      const marketplacePath = path.join(
        fixture.sourceDir,
        SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
        "marketplace.json",
      );
      expect(await fileExists(marketplacePath)).toBe(true);

      const content = await readTestFile(marketplacePath);
      const marketplace = JSON.parse(content);
      expect(marketplace.name).toBe(fixture.marketplaceName);
      expect(marketplace.plugins.length).toBeGreaterThanOrEqual(1);
    });

    // Step 3: Register marketplace with Claude CLI
    it("should register the marketplace via claude plugin marketplace add", async () => {
      await claudePluginMarketplaceAdd(fixture.sourceDir);
      // If it doesn't throw, registration succeeded (or was already registered)
    });

    // Step 4: Install a plugin
    it("should install a plugin via claude plugin install", async () => {
      const pluginRef = `web-framework-react@${fixture.marketplaceName}`;
      await claudePluginInstall(pluginRef, "project", projectDir);
      // If it doesn't throw, installation succeeded
    });

    // Step 5: Verify the installed plugin exists on disk
    it("should have the plugin in the registry after install", async () => {
      // Check the REAL home dir since we are NOT isolating HOME for this test
      const homeDir = process.env.HOME;
      if (!homeDir) throw new Error("HOME environment variable is not set");
      await expect({ dir: homeDir }).toHavePluginInRegistry(
        `web-framework-react@${fixture.marketplaceName}`,
        "project",
      );
    });
  },
);
