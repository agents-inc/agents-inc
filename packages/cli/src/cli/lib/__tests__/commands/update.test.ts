import path from "path";
import { mkdir } from "fs/promises";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { CLAUDE_SRC_DIR, EJECT_SOURCE } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type { ProjectConfig } from "../../../types";

/**
 * `update` refreshes every marketplace its installation names, and the seam under test is the one
 * directly below it: `refreshMarketplace` on the `PluginHost` the folder answers. Everything above
 * that — reading the installation's config, deciding which marketplaces it actually uses, and
 * refusing to run without the host's binary — is real here, which is the whole point: the
 * command's only job is to derive that marketplace list and hand it over once per name.
 *
 * The command class is imported directly rather than driven through `runCliCommand`,
 * because that helper resolves commands out of `dist/` where a module mock cannot reach.
 */

const { mockMarketplaceUpdate, mockHostAvailable } = vi.hoisted(() => ({
  mockMarketplaceUpdate: vi.fn<PluginHost["refreshMarketplace"]>(),
  mockHostAvailable: vi.fn<PluginHost["isAvailable"]>(),
}));

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost({
    refreshMarketplace: mockMarketplaceUpdate,
    isAvailable: mockHostAvailable,
  });
  return { hostAt: () => host, hostFor: () => host };
});

const { default: Update } = await import("../../../commands/update.js");

const MARKETPLACE = "agents-inc";
const OTHER_MARKETPLACE = "acme-skills";
const MARKETPLACE_FAILURE = "Failed to update marketplace: network unreachable";

/**
 * The refresh summary's two halves. `claude plugin marketplace update` re-reads a marketplace's
 * listing and leaves every installed plugin at the version it was installed at, so the summary may
 * not claim the update is complete, and says the plugins were left as they were.
 */
const FALSE_COMPLETION_CLAIM = "Update complete!";
const PLUGINS_UNCHANGED = "Installed plugins were not changed";

/** Marketplace names handed to the host, in call order. */
function updatedMarketplaces(): string[] {
  return mockMarketplaceUpdate.mock.calls.map(([name]) => name);
}

/** Runs the command, returning the oclif error it threw (or `undefined` on success). */
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
    // The config loader falls back to $HOME when the cwd carries no config, so an
    // unstubbed HOME would let the developer's own installation decide these results.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    mockHostAvailable.mockResolvedValue(true);
    mockMarketplaceUpdate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  /** Writes the `config.ts` the command reads its marketplaces out of, under the legacy folder. */
  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides), CLAUDE_SRC_DIR);
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
      // Exhaustive: a repeat call would refresh the same marketplace twice, and a name
      // the config never used would refresh something nobody asked about.
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

    it("says the listings were refreshed and the installed plugins were not changed", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });

      const { stdout, error } = await captureOutput(() => Update.run([], { root: CLI_ROOT }));

      expect(error).toBeUndefined();
      expect(updatedMarketplaces()).toStrictEqual([MARKETPLACE]);
      expect(
        stdout,
        "a marketplace refresh leaves every installed plugin at its version, so nothing is complete",
      ).not.toContain(FALSE_COMPLETION_CLAIM);
      expect(stdout).toContain(PLUGINS_UNCHANGED);
    });

    it("exits non-zero when a marketplace refresh fails", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: MARKETPLACE })],
      });
      mockMarketplaceUpdate.mockRejectedValueOnce(new Error(MARKETPLACE_FAILURE));

      const error = await runUpdate();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(MARKETPLACE);
    });
  });

  describe("installations with nothing to refresh", () => {
    it("never touches the Claude CLI for an eject-only installation", async () => {
      await installConfig({
        skills: [buildSkillConfig("web-framework-react", { origin: EJECT_SOURCE })],
      });

      const error = await runUpdate();

      expect(error, "an eject-only install is a successful no-op").toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
      expect(
        mockHostAvailable,
        "nothing needs the Claude CLI, so its absence must not be able to fail the run",
      ).not.toHaveBeenCalled();
    });

    it("succeeds without an installation", async () => {
      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
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
    });
  });
});
