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

// build plugins -> build marketplace -> `claude plugin marketplace add` -> `claude plugin install`,
// against the real Claude CLI with a per-run config dir.

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

      projectTempDir = await createTempDir();
      projectDir = path.join(projectTempDir, "project");
      await mkdir(projectDir, { recursive: true });
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(fixture);
      if (projectTempDir) await cleanupTempDir(projectTempDir);
      await cleanupIsolatedClaudeHome(isolated);
    });

    it("should have built plugin directories with manifests", async () => {
      const pluginDirs = await listFiles(fixture.pluginsDir);
      expect(pluginDirs.length).toBeGreaterThanOrEqual(1);

      const firstDir = pluginDirs[0];
      if (!firstDir) throw new Error("Expected at least one plugin directory");
      const firstPlugin = path.join(fixture.pluginsDir, firstDir);
      expect(
        await fileExists(
          path.join(firstPlugin, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.PLUGIN_JSON),
        ),
      ).toBe(true);
    });

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

    it("should register the marketplace via claude plugin marketplace add", async () => {
      await claudePluginMarketplaceAdd(fixture.sourceDir, { configDir: isolated.configDir });
    });

    it("should install a plugin via claude plugin install", async () => {
      const pluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
      await claudePluginInstall(pluginRef, "project", projectDir, {
        configDir: isolated.configDir,
      });
    });

    it("should have the plugin in the registry after install", async () => {
      // The run's config dir is `<home>/.claude`, which the matcher derives from a home.
      await expect({ dir: isolated.home }).toHavePluginInRegistry(
        `${E2E_SKILL.react.id}@${fixture.marketplaceName}`,
        "project",
      );
    });
  },
);
