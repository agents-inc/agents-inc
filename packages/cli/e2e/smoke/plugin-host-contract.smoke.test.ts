import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hostFor } from "../../src/cli/lib/hosts/host-for.js";
import type { HostCallOptions, PluginHost } from "../../src/cli/lib/hosts/plugin-host.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupIsolatedClaudeHome,
  cleanupTempDir,
  codexHome,
  createIsolatedClaudeHome,
  createTempDir,
  type IsolatedClaudeHome,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

// The plugin-host contract against the real `claude` binary: the only layer that notices when Claude
// rewords the not-found message `uninstallPlugin` classifies. Skipped where `claude` is absent. The
// update cases run against the pinned `codex` as well, which is never skipped.

const NEVER_INSTALLED = "never-installed-plugin@never-registered-marketplace";

const UPDATED_SKILL = E2E_SKILL.react.id;

/** What a first build gives a plugin, and what a build after a content change gives it. */
const INSTALLED_VERSION = "1.0.0";
const OFFERED_VERSION = "2.0.0";

const SOURCE_EDIT = "## A section added to the marketplace after installation";

/** Edits the skill in the source, then rebuilds, so the marketplace offers its next version. */
async function offerANewVersionOf(fixture: E2EPluginSource, skillId: string): Promise<void> {
  await appendFile(
    path.join(fixture.sourceDir, SOURCE_PATHS.SKILLS_DIR, skillId, FILES.SKILL_MD),
    `\n\n${SOURCE_EDIT}\n`,
  );
  for (const build of [
    ["build", "plugins"],
    ["build", "marketplace"],
  ]) {
    const built = await CLI.run(build, { dir: fixture.sourceDir });
    expect(built.exitCode, `${build.join(" ")} failed: ${built.output}`).toBe(EXIT_CODES.SUCCESS);
  }
}

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

// Both hosts install a plugin into a directory named for its version, so that name is the version.
describe.skipIf(!claudeAvailable)(
  "the Claude host updating a plugin against the real binary",
  () => {
    let fixture: E2EPluginSource;
    let isolated: IsolatedClaudeHome;
    let projectTempDir: string;
    let projectDir: string;
    let pluginRef: string;
    let pinned: HostCallOptions;

    beforeAll(async () => {
      fixture = await createE2EPluginSource({ owned: true });
      isolated = await createIsolatedClaudeHome();
      pinned = { configDir: isolated.configDir };
      projectTempDir = await createTempDir();
      projectDir = path.join(projectTempDir, "project");
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
      pluginRef = `${UPDATED_SKILL}@${fixture.marketplaceName}`;

      await host.addMarketplace(fixture.sourceDir, pinned);
      await host.installPlugin(pluginRef, "project", projectDir, pinned);
      await offerANewVersionOf(fixture, UPDATED_SKILL);
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(fixture.tempDir);
      await cleanupTempDir(projectTempDir);
      await cleanupIsolatedClaudeHome(isolated);
    });

    it("holds the plugin at the version it was installed at, though a newer one is on offer", async () => {
      expect(
        (await host.listPlugins(projectDir, pinned)).map((plugin) => [
          plugin.pluginKey,
          path.basename(plugin.installPath),
        ]),
      ).toStrictEqual([[pluginRef, INSTALLED_VERSION]]);
    });

    it("keeps it there when only the marketplace listing is refreshed", async () => {
      await host.refreshMarketplace(fixture.marketplaceName, pinned);

      expect(
        (await host.listPlugins(projectDir, pinned)).map((plugin) => [
          plugin.pluginKey,
          path.basename(plugin.installPath),
        ]),
        "Claude's marketplace refresh moves no installed plugin, which is why the host has a member that does",
      ).toStrictEqual([[pluginRef, INSTALLED_VERSION]]);
    });

    it("moves it to the version the marketplace now offers once it is updated", async () => {
      await host.updatePlugin(pluginRef, "project", projectDir, pinned);

      expect(
        (await host.listPlugins(projectDir, pinned)).map((plugin) => [
          plugin.pluginKey,
          path.basename(plugin.installPath),
        ]),
        "the update must reach the installation the caller pinned, at the scope the plugin holds",
      ).toStrictEqual([[pluginRef, OFFERED_VERSION]]);
    });
  },
);

describe("the Codex host updating a plugin against the pinned binary", () => {
  const codex: PluginHost = hostFor("codex");

  let fixture: E2EPluginSource;
  let home: string;
  let projectDir: string;
  let pluginRef: string;
  let pinned: HostCallOptions;

  beforeAll(async () => {
    fixture = await createE2EPluginSource({ owned: true });
    home = await createTempDir();
    pinned = { configDir: codexHome(home) };
    projectDir = path.join(home, "project");
    await mkdir(projectDir, { recursive: true });
    pluginRef = `${UPDATED_SKILL}@${fixture.marketplaceName}`;

    await codex.addMarketplace(fixture.sourceDir, pinned);
    await codex.installPlugin(pluginRef, "global", projectDir, pinned);
    await offerANewVersionOf(fixture, UPDATED_SKILL);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(fixture.tempDir);
    await cleanupTempDir(home);
  });

  it("holds the plugin at the version it was installed at, though a newer one is on offer", async () => {
    expect(
      (await codex.listPlugins(projectDir, pinned)).map((plugin) => [
        plugin.pluginKey,
        path.basename(plugin.installPath),
      ]),
    ).toStrictEqual([[pluginRef, INSTALLED_VERSION]]);
  });

  it("moves it to the version the marketplace now offers once it is updated", async () => {
    await codex.updatePlugin(pluginRef, "global", projectDir, pinned);

    expect(
      (await codex.listPlugins(projectDir, pinned)).map((plugin) => [
        plugin.pluginKey,
        path.basename(plugin.installPath),
      ]),
      "Codex has no update verb, so this is the one place that shows its stand-in really installs the newer version",
    ).toStrictEqual([[pluginRef, OFFERED_VERSION]]);
  });
});
