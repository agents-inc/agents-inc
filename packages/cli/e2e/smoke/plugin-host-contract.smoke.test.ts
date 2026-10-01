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

/**
 * The plugin-host contract, run against the real `claude` binary.
 *
 * It is the third of three layers, and the only one that can answer for the binary. Its siblings:
 * `src/cli/lib/hosts/__tests__/a-plugin-host-answers-one-contract.test.ts` runs the contract
 * against a fake host, which proves the interface is implementable by something that is not Claude;
 * `the-claude-host-spawns-what-it-spawns-today.test.ts` beside it records the argv, cwd and
 * environment of every call against a mocked `child_process`, which proves the wire did not move.
 * Neither can tell whether Claude still ANSWERS the way the classification assumes.
 *
 * **What only this file can hold.** `uninstallPlugin` answers `absent` by matching Claude's own
 * failure message — the wire spec asserts against a string recorded on 2026-09-21 from
 * `claude 2.1.278`:
 *
 * ```
 * ✘ Failed to uninstall plugin "nope@nowhere": Plugin "nope@nowhere" not found in installed plugins
 * ```
 *
 * A recorded string is a claim about a binary that ships on its own schedule. When Claude rewords
 * that line, the wire spec stays green — it asserts against its own fixture — and this file is what
 * goes red, because the real binary is what decides. That is the whole reason this is a smoke spec
 * rather than one more unit case.
 *
 * **Every call is pinned to a per-run config dir**, so the marketplace registration and the plugin
 * registry this file produces live in a temp tree and go with it. `home-isolation.smoke.test.ts` is
 * the spec that pins that mechanism; this one relies on it.
 *
 * **The removal pair is in this file rather than split across two.** An `absent`-only check cannot
 * tell a correct classification from a host that answers `absent` for everything: both leave the
 * assertion green while the second removes nothing and reports nothing wrong. So the plugin is
 * really installed, really removed, and then asked for a second time.
 *
 * NOTE: a smoke test for the `claude` binary's behaviour behind our seam, not an E2E test of a
 * command. It is skipped where `claude` is not installed.
 */

/** A plugin reference that has never been installed anywhere, for the absent arm. */
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

  /**
   * The listing, and the one member whose pinned installation nothing else can answer for.
   *
   * `listPlugins` spawns nothing — Claude has no `plugin list --json`, so the installs come from
   * `installed_plugins.json` and the switch from the project's settings — which means the wire
   * spec beside it cannot see this call at all, and the unit spec can only prove which PATH was
   * read. Whether that path is where the real binary actually writes when `CLAUDE_CONFIG_DIR` is
   * pinned is a fact about `claude`, and this is the only layer that holds it.
   *
   * The pair is in one describe for the reason the removal pair below is: a listing that answered
   * `[]` for everything would satisfy the negative and prove nothing.
   */
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
