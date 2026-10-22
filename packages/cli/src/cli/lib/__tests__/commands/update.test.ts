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
import { EJECT_SOURCE } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type { ProjectConfig } from "../../../types";

/**
 * The seam is `refreshMarketplace` on the `PluginHost`; everything above it is real. Imported
 * directly because `runCliCommand` resolves out of `dist/`, where a module mock can't reach.
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

/** `claude plugin marketplace update` leaves installed plugins alone, so "complete" is false. */
const FALSE_COMPLETION_CLAIM = "Update complete!";
const PLUGINS_UNCHANGED = "Installed plugins were not changed";

function updatedMarketplaces(): string[] {
  return mockMarketplaceUpdate.mock.calls.map(([name]) => name);
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
      mockHostAvailable.mockResolvedValue(false);

      const error = await runUpdate();

      expect(
        error,
        "nothing needs the Claude CLI, so its absence must not be able to fail the run",
      ).toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
    });

    it("succeeds without an installation", async () => {
      const error = await runUpdate();

      expect(error).toBeUndefined();
      expect(mockMarketplaceUpdate).not.toHaveBeenCalled();
    });
  });

  describe("what update says", () => {
    /** Written out: a rendering assertion must not move with the constant it renders. */
    const EJECTED_SKILLS_LINE =
      "Ejected skills are yours to own — 'npx agents-inc update' does not change them.";

    function refreshLines(marketplace: string): string[] {
      return [`Refreshing marketplace ${marketplace}...`, `  Updated marketplace ${marketplace}`];
    }

    it("names each marketplace as it refreshes it, then counts the listings", async () => {
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
          "✓ Refreshed 2 marketplace listings. Installed plugins were not changed.",
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
          "✓ Refreshed 1 marketplace listing. Installed plugins were not changed.",
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
