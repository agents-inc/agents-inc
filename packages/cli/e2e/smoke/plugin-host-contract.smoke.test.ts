import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hostFor } from "../../src/cli/lib/hosts/host-for.js";
import type { PluginHost } from "../../src/cli/lib/hosts/plugin-host.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupIsolatedClaudeHome,
  cleanupTempDir,
  createIsolatedClaudeHome,
  createTempDir,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";
import { DIRS, TIMEOUTS } from "../pages/constants.js";

// The plugin-host contract against the real `claude` binary: the only layer that notices when Claude
// rewords the not-found message `uninstallPlugin` classifies. Skipped where `claude` is absent.

const NEVER_INSTALLED = "never-installed-plugin@never-registered-marketplace";

const host: PluginHost = hostFor("claude");
const claudeAvailable = await host.isAvailable();

describe.skipIf(!claudeAvailable)("the Claude host against the real binary", () => {
  let fixture: E2EPluginSource;
  let isolated: IsolatedClaudeHome;
  let projectTempDir: string;
  let projectDir: string;
  let pluginRef: string;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    isolated = await createIsolatedClaudeHome();
    projectTempDir = await createTempDir();
    projectDir = path.join(projectTempDir, "project");
    await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
    pluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
    await cleanupTempDir(projectTempDir);
    await cleanupIsolatedClaudeHome(isolated);
  });

  it("reports itself available, because the binary is on PATH", () => {
    expect(
      claudeAvailable,
      "the whole file is skipped without it, so a false answer here would hide every case below as a skip rather than a failure",
    ).toBe(true);
  });

  describe("marketplaces", () => {
    it("does not find one that has not been registered in this config tree", async () => {
      expect(
        await host.marketplaceExists(fixture.marketplaceName, {
          configDir: isolated.configDir,
        }),
        "a predicate answering true for an unregistered marketplace makes the install skip the registration it depends on",
      ).toBe(false);
    });

    it("finds it once it has been added, from the same source the CLI hands it", async () => {
      await host.addMarketplace(fixture.sourceDir, { configDir: isolated.configDir });

      expect(
        await host.marketplaceExists(fixture.marketplaceName, {
          configDir: isolated.configDir,
        }),
        "the list is read back through the same config dir the add wrote to, so this is registration and parsing at once",
      ).toBe(true);
    });
  });

  // `listPlugins` spawns nothing (it reads installed_plugins.json), so only this layer proves that is
  // where the real binary writes under a pinned CLAUDE_CONFIG_DIR.
  describe("listing what is installed, from the installation the caller pinned", () => {
    it("does not list a plugin this config tree has not installed", async () => {
      expect(
        (await host.listPlugins(projectDir, { configDir: isolated.configDir })).map(
          (plugin) => plugin.pluginKey,
        ),
        "without the negative a listing that answered everything would satisfy the case below",
      ).not.toContain(pluginRef);
    });

    it("lists it once the real binary has installed it into that tree", async () => {
      await host.installPlugin(pluginRef, "project", projectDir, {
        configDir: isolated.configDir,
      });

      expect(
        await host.listPlugins(projectDir, { configDir: isolated.configDir }),
        "this is the whole of what the configDir option buys: the registry read follows the tree the install wrote, so a smoke run never reads the machine's own ~/.claude",
      ).toContainEqual(expect.objectContaining({ pluginKey: pluginRef }));
    });

    it("stops listing it once it has been removed again", async () => {
      await host.uninstallPlugin(pluginRef, "project", projectDir, {
        configDir: isolated.configDir,
      });

      expect(
        (await host.listPlugins(projectDir, { configDir: isolated.configDir })).map(
          (plugin) => plugin.pluginKey,
        ),
        "a listing read from a tree the removal did not reach would go on naming a plugin that is gone",
      ).not.toContain(pluginRef);
    });
  });

  describe("removal, classified from what the binary actually answers", () => {
    it("answers absent for a plugin that was never installed", async () => {
      expect(
        await host.uninstallPlugin(NEVER_INSTALLED, "project", projectDir, {
          configDir: isolated.configDir,
        }),
        "this is the arm that reads Claude's own not-found message; when that message is reworded, this is the assertion that says so",
      ).toBe("absent");
    });

    it("answers removed for a plugin it has just installed", async () => {
      await host.installPlugin(pluginRef, "project", projectDir, {
        configDir: isolated.configDir,
      });

      expect(
        await host.uninstallPlugin(pluginRef, "project", projectDir, {
          configDir: isolated.configDir,
        }),
        "without this half, a host answering absent for everything satisfies the case above and removes nothing",
      ).toBe("removed");
    });

    it("answers absent when the same plugin is asked for a second time", async () => {
      expect(
        await host.uninstallPlugin(pluginRef, "project", projectDir, {
          configDir: isolated.configDir,
        }),
        "the second removal is the one uninstall must not count, and it is the same call that returned removed a moment ago",
      ).toBe("absent");
    });
  });
});
