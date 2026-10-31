import path from "path";
import { mkdir } from "fs/promises";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { EJECT_SOURCE, type Provider } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type { ProjectConfig } from "../../../types";

/**
 * The seams are `refreshMarketplace` and `updatePlugin` on the `PluginHost`; everything above them
 * is real. Imported directly because `runCliCommand` resolves out of `dist/`, where a module mock
 * can't reach.
 */

const {
  mockMarketplaceUpdate,
  mockPluginUpdate,
  mockHostAvailable,
  mockRefreshedThrough,
  mockUpdatedThrough,
} = vi.hoisted(() => ({
  mockMarketplaceUpdate: vi.fn<PluginHost["refreshMarketplace"]>(),
  mockPluginUpdate: vi.fn<PluginHost["updatePlugin"]>(),
  mockHostAvailable: vi.fn<PluginHost["isAvailable"]>(),
  mockRefreshedThrough: vi.fn<(provider: Provider) => void>(),
  mockUpdatedThrough: vi.fn<(provider: Provider) => void>(),
}));

/** One host per provider, and `hostAt` reads the provider off the disk as the real one does. */
vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const { providerInUse } = await import("../../installation/install-layout.js");
  const hostFor = (provider: Provider): PluginHost =>
    createMockPluginHost({
      provider,
      refreshMarketplace: (...args) => {
        mockRefreshedThrough(provider);
        return mockMarketplaceUpdate(...args);
      },
      updatePlugin: (...args) => {
        mockUpdatedThrough(provider);
        return mockPluginUpdate(...args);
      },
      isAvailable: mockHostAvailable,
    });
  return { hostAt: (root: string) => hostFor(providerInUse(root)), hostFor };
});

const { default: Update } = await import("../../../commands/update.js");

const MARKETPLACE = "agents-inc";
const OTHER_MARKETPLACE = "acme-skills";
const MARKETPLACE_FAILURE = "Failed to update marketplace: network unreachable";
const PLUGIN_FAILURE = 'Failed to update plugin "web-framework-react": Plugin not found';

/** Written out: a test building the reference with the product's own helper would move with it. */
const REACT_PLUGIN = "web-framework-react@agents-inc";
const VITEST_PLUGIN = "web-testing-vitest@agents-inc";
const HONO_PLUGIN = "api-framework-hono@acme-skills";

/** A literal: a test reading the folder off the product would move with it. */
const CODEX_FOLDER = ".agents-inc/codex";

function updatedMarketplaces(): string[] {
  return mockMarketplaceUpdate.mock.calls.map(([name]) => name);
}

/** Named fields, so a fourth `options` argument passed as `undefined` does not count as a change. */
function updatedPlugins(): { ref: string; scope: string; projectDir: string }[] {
  return mockPluginUpdate.mock.calls.map(([ref, scope, projectDir]) => ({
    ref,
    scope,
    projectDir,
  }));
}

async function runUpdate(): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
  return Update.run([], { root: CLI_ROOT }).then(
    () => undefined,
    (error: Error & { oclif?: { exit?: number } }) => error,
  );
}

describe("update command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-update-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // The config loader falls back to $HOME, so HOME must not be the developer's.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    mockHostAvailable.mockResolvedValue(true);
    mockMarketplaceUpdate.mockResolvedValue(undefined);
    mockPluginUpdate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  /** Writes the `config.ts` the command reads its marketplaces out of. */
  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides));
  }

  describe("marketplace refresh", () => {
    it("updates each marketplace the config's active skills name, once", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("web-testing-vitest", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });

      const error = await runUpdate();

      expect(error).toBeUndefined();
      // Exhaustive: no repeat refresh, and no marketplace the config never used.
      expect(updatedMarketplaces()).toStrictEqual([MARKETPLACE, OTHER_MARKETPLACE]);
    });

    it("ignores the eject sentinel — it names no marketplace", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE }),
          buildSkillConfig("web-testing-vitest", { origin: MARKETPLACE }),
        ],
      });

      await runUpdate();

      expect(updatedMarketplaces()).toStrictEqual([MARKETPLACE]);
    });

    it("ignores excluded entries — an excluded skill is not installed", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", {
            origin: OTHER_MARKETPLACE,
            excluded: true,
          }),
        ],
      });

      await runUpdate();

      expect(updatedMarketplaces()).toStrictEqual([MARKETPLACE]);
    });

    it("updates the installed plugin", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });

      const { error } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(error).toBeUndefined();
      expect(updatedMarketplaces()).toStrictEqual([MARKETPLACE]);
      expect(updatedPlugins().map(({ ref }) => ref)).toStrictEqual([REACT_PLUGIN]);
    });

    it("exits non-zero when a marketplace refresh fails, and updates no plugin", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });
      mockMarketplaceUpdate.mockRejectedValueOnce(new Error(MARKETPLACE_FAILURE));

      const error = await runUpdate();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(MARKETPLACE);
      expect(
        mockPluginUpdate,
        "a plugin updated from a listing that could not be refreshed is updated to nothing newer, and the run already failed",
      ).not.toHaveBeenCalled();
    });
  });

  describe("plugin update", () => {
    it("updates each plugin the config's active skills name, at the scope each was installed at", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE, scope: "project" }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE, scope: "global" }),
        ],
      });

      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(
        updatedPlugins(),
        "each skill carries its own scope; one scope for all updates the other scope's copy, or nothing",
      ).toStrictEqual([
        { ref: REACT_PLUGIN, scope: "project", projectDir: process.cwd() },
        { ref: HONO_PLUGIN, scope: "global", projectDir: process.cwd() },
      ]);
    });

    it("refreshes every marketplace listing before it updates any plugin", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });

      await runUpdate();

      // Without this the order below compares against Math.min() of nothing, which is Infinity.
      expect(updatedPlugins().map(({ ref }) => ref)).toStrictEqual([REACT_PLUGIN, HONO_PLUGIN]);
      expect(
        Math.max(...mockMarketplaceUpdate.mock.invocationCallOrder),
        "a plugin updated before its listing is refreshed is updated to the version it already has",
      ).toBeLessThan(Math.min(...mockPluginUpdate.mock.invocationCallOrder));
    });

    it("never asks the host to update an ejected skill, which is the user's own copy", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE }),
          buildSkillConfig("web-testing-vitest", { origin: MARKETPLACE }),
        ],
      });

      await runUpdate();

      expect(updatedPlugins().map(({ ref }) => ref)).toStrictEqual([VITEST_PLUGIN]);
    });

    it("never asks the host to update an excluded entry, which is not installed", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE, excluded: true }),
        ],
      });

      await runUpdate();

      expect(updatedPlugins().map(({ ref }) => ref)).toStrictEqual([REACT_PLUGIN]);
    });

    it("goes on updating the rest when one plugin fails, then exits non-zero naming it", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });
      mockPluginUpdate.mockRejectedValueOnce(new Error(PLUGIN_FAILURE));

      const error = await runUpdate();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(REACT_PLUGIN);
      expect(
        updatedPlugins().map(({ ref }) => ref),
        "one failure must not hide whether the plugins after it could be updated",
      ).toStrictEqual([REACT_PLUGIN, HONO_PLUGIN]);
    });
  });

  describe("installations with nothing to refresh", () => {
    it("never touches the Claude CLI for an eject-only installation", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE })],
      });
      mockHostAvailable.mockResolvedValue(false);

      const error = await runUpdate();

      expect(
        error,
        "nothing needs the Claude CLI, so its absence must not be able to fail the run",
      ).toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
      expect(mockPluginUpdate).not.toHaveBeenCalled();
    });

    it("succeeds without an installation", async () => {
      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
      expect(mockPluginUpdate).not.toHaveBeenCalled();
    });
  });

  describe("what update says", () => {
    /** Written out: a rendering assertion must not move with the constant it renders. */
    const EJECTED_SKILLS_LINE =
      "Ejected skills are yours to own — 'npx agents-inc update' does not change them.";

    function refreshLines(marketplace: string): string[] {
      return [`Refreshing marketplace ${marketplace}...`, `  Updated marketplace ${marketplace}`];
    }

    function pluginLines(pluginRef: string): string[] {
      return [`Updating plugin ${pluginRef}...`, `  Updated plugin ${pluginRef}`];
    }

    it("names each marketplace as it refreshes it, then each plugin as it updates it, then counts both", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });

      const { stdout, error } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          ...refreshLines(MARKETPLACE),
          ...refreshLines(OTHER_MARKETPLACE),
          ...pluginLines(REACT_PLUGIN),
          ...pluginLines(HONO_PLUGIN),
          "✓ Refreshed 2 marketplace listings and updated 2 installed plugins.",
          "",
        ].join("\n"),
      );
    });

    it("says first that ejected skills are left alone when some skills are ejected", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE }),
          buildSkillConfig("web-testing-vitest", { origin: MARKETPLACE }),
        ],
      });

      const { stdout } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(stdout).toBe(
        [
          EJECTED_SKILLS_LINE,
          ...refreshLines(MARKETPLACE),
          ...pluginLines(VITEST_PLUGIN),
          "✓ Refreshed 1 marketplace listing and updated 1 installed plugin.",
          "",
        ].join("\n"),
      );
    });

    it("says nothing about ejected skills when none is ejected", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });

      const { stdout } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(stdout).not.toContain(EJECTED_SKILLS_LINE);
    });

    it("says there is nothing to refresh for an eject-only installation", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE })],
      });

      const { stdout } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(stdout).toBe(
        [
          EJECTED_SKILLS_LINE,
          "No plugin marketplaces are configured — nothing to refresh.",
          "",
        ].join("\n"),
      );
    });

    it("warns that there is no installation to refresh", async () => {
      const { stdout, stderr } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(stdout).toBe("");
      expect(flattenCliOutput(stderr)).toBe(
        "Warning: No installation found. Run 'npx agents-inc init' first to set up Agents Inc.",
      );
    });

    it("warns for the marketplace that failed and still refreshes the rest", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });
      mockMarketplaceUpdate.mockRejectedValueOnce(new Error(MARKETPLACE_FAILURE));

      const { stdout, stderr, error } = await captureOutput(() =>
        Update.run([], { root: CLI_ROOT }),
      );

      expect(stdout).toBe(
        [`Refreshing marketplace ${MARKETPLACE}...`, ...refreshLines(OTHER_MARKETPLACE), ""].join(
          "\n",
        ),
      );
      expect(flattenCliOutput(stderr)).toBe(
        `Warning: Could not update marketplace ${MARKETPLACE}: ${MARKETPLACE_FAILURE}`,
      );
      expect(error?.message).toBe(`1 marketplace could not be updated: ${MARKETPLACE}`);
    });

    it("warns for the plugin that failed and still updates the rest", async () => {
      await installConfig({
        skills: [
          buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
          buildSkillConfig("api-framework-hono", { origin: OTHER_MARKETPLACE }),
        ],
      });
      mockPluginUpdate.mockRejectedValueOnce(new Error(PLUGIN_FAILURE));

      const { stdout, stderr, error } = await captureOutput(() =>
        Update.run([], { root: CLI_ROOT }),
      );

      expect(stdout).toBe(
        [
          ...refreshLines(MARKETPLACE),
          ...refreshLines(OTHER_MARKETPLACE),
          `Updating plugin ${REACT_PLUGIN}...`,
          ...pluginLines(HONO_PLUGIN),
          "",
        ].join("\n"),
      );
      expect(flattenCliOutput(stderr)).toBe(
        `Warning: Could not update plugin ${REACT_PLUGIN}: ${PLUGIN_FAILURE}`,
      );
      expect(error?.message).toBe(`1 plugin could not be updated: ${REACT_PLUGIN}`);
    });
  });

  describe("the tool a refresh runs through", () => {
    it("is the tool of the project's own installation", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
        }),
        CODEX_FOLDER,
      );

      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(mockRefreshedThrough.mock.calls).toStrictEqual([["codex"]]);
      expect(
        mockUpdatedThrough.mock.calls,
        "a Codex installation's plugins updated through Claude are updated in a tool that does not hold them",
      ).toStrictEqual([["codex"]]);
    });

    it("is the global installation's tool where the project's config is another tool's and declares nothing", async () => {
      // HOME is `tempDir`, whose Claude installation the run falls back to.
      await writeTestTsConfig(
        tempDir,
        buildProjectConfig({
          skills: [
            buildSkillConfig("web-framework-react", { origin: MARKETPLACE, scope: "global" }),
          ],
        }),
      );
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "project", skills: [], agents: [] }),
        CODEX_FOLDER,
      );

      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(updatedMarketplaces(), "HOME's marketplace is the one refreshed").toStrictEqual([
        MARKETPLACE,
      ]);
      expect(mockRefreshedThrough.mock.calls).toStrictEqual([["claude"]]);
    });

    it("is the global installation's tool where the project holds none and HOME holds only Codex's", async () => {
      await writeTestTsConfig(
        tempDir,
        buildProjectConfig({
          skills: [
            buildSkillConfig("web-framework-react", { origin: MARKETPLACE, scope: "global" }),
          ],
        }),
        CODEX_FOLDER,
      );

      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(updatedMarketplaces(), "HOME's marketplace is the one refreshed").toStrictEqual([
        MARKETPLACE,
      ]);
      expect(mockRefreshedThrough.mock.calls).toStrictEqual([["codex"]]);
    });
  });

  describe("Claude CLI availability", () => {
    it("refuses to refresh a marketplace when the Claude CLI is missing", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });
      mockHostAvailable.mockResolvedValue(false);

      const error = await runUpdate();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("Claude CLI not found");
      expect(
        mockMarketplaceUpdate,
        "the availability check gates the refresh, so nothing may be attempted after it fails",
      ).not.toHaveBeenCalled();
      expect(mockPluginUpdate).not.toHaveBeenCalled();
    });
  });
});
