import { mkdir } from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { TIMEOUTS, DIRS, FILES, SOURCE_PATHS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  claudePluginInstall,
  claudePluginMarketplaceAdd,
  cleanupFixture,
  cleanupIsolatedClaudeHome,
  cleanupTempDir,
  createIsolatedClaudeHome,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  listFiles,
  readTestFile,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";

import "../matchers/setup.js";

/**
 * Full plugin chain proof-of-concept: the build -> register -> install chain
 * against the real Claude CLI, using the E2E source fixture.
 *
 * Every Claude CLI call is pinned to a per-run config dir, so the marketplace
 * registration and the plugin registry this chain produces live inside a temp
 * tree and are removed with it. Nothing here reaches the installation on the
 * machine running the suite — `home-isolation.smoke.test.ts` is the spec that
 * pins that mechanism.
 *
 * Chain under test:
 *   createE2ESource() -> build plugins -> build marketplace -> claude plugin marketplace add -> claude plugin install
 *
 * NOTE: These are smoke tests for the Claude CLI binary integration, NOT pure E2E
 * tests for our CLI. Steps 3-5 call the Claude CLI directly.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "full plugin chain: build -> register -> install -> verify",
  () => {
    let fixture: E2EPluginSource;
    let projectDir: string;
    let projectTempDir: string;
    let isolated: IsolatedClaudeHome;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      isolated = await createIsolatedClaudeHome();

      // Create an isolated project directory for plugin installation
      projectTempDir = await createTempDir();
      projectDir = path.join(projectTempDir, "project");
      await mkdir(projectDir, { recursive: true });
      // Create .claude dir for plugin context
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(fixture);
      if (projectTempDir) await cleanupTempDir(projectTempDir);
      await cleanupIsolatedClaudeHome(isolated);
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
      await claudePluginMarketplaceAdd(fixture.sourceDir, { configDir: isolated.configDir });
      // If it doesn't throw, registration succeeded (or was already registered)
    });

    // Step 4: Install a plugin
    it("should install a plugin via claude plugin install", async () => {
      const pluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
      await claudePluginInstall(pluginRef, "project", projectDir, {
        configDir: isolated.configDir,
      });
      // If it doesn't throw, installation succeeded
    });

    // Step 5: Verify the installed plugin exists on disk
    it("should have the plugin in the registry after install", async () => {
      // The registry belongs to the run's own config dir, which is `<home>/.claude`
      // — the same path the matcher derives from a home.
      await expect({ dir: isolated.home }).toHavePluginInRegistry(
        `${E2E_SKILL.react.id}@${fixture.marketplaceName}`,
        "project",
      );
    });
  },
);
