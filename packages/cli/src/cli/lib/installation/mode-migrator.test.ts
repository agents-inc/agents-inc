import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceLoadResult } from "../loading/source-loader";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { buildSourceResult } from "../__tests__/factories/config-factories";
import { createMockCopiedSkill } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { WEB_PAIR_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts";
import {
  buildMigrationPlan,
  toEjectMigration,
  toPluginMigration,
} from "./__tests__/helpers/migration-plans";

// Typed against the functions they replace, so a stale default is a compile error.
vi.mock("../skills", () => ({
  deleteLocalSkill: vi
    .fn<(typeof import("../skills"))["deleteLocalSkill"]>()
    .mockResolvedValue(undefined),
  copySkillsToLocalFlattened: vi
    .fn<(typeof import("../skills"))["copySkillsToLocalFlattened"]>()
    .mockResolvedValue([]),
}));

vi.mock("../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

vi.mock("../../utils/logger");

import { detectMigrations, ejectCopyFailureError, executeMigration } from "./mode-migrator";
import { verbose } from "../../utils/logger";
import { deleteLocalSkill, copySkillsToLocalFlattened } from "../skills";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { hostAt } from "../hosts/host-for.js";

// `hostAt` answers one shared host, so these are the spies called.
const installPlugin = hostAt("/any-root").installPlugin;
const uninstallPlugin = hostAt("/any-root").uninstallPlugin;

describe("mode-migrator", () => {
  describe("detectMigrations", () => {
    it("should detect skills moving from plugin to eject", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
        buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
      );

      expect(result.toEject).toHaveLength(1);
      expect(firstElement(result.toEject).id).toBe("web-framework-react");
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should detect skills moving from eject to plugin", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
        buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
      );

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toHaveLength(1);
      expect(firstElement(result.toPlugin).id).toBe("web-framework-react");
    });

    it("should detect mixed migrations", () => {
      const result = detectMigrations(
        [
          ...buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
          ...buildSkillConfigs(["web-state-zustand"], { origin: EJECT_SOURCE }),
        ],
        [
          ...buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
          ...buildSkillConfigs(["web-state-zustand"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
        ],
      );

      expect(result.toEject).toHaveLength(1);
      expect(firstElement(result.toEject).id).toBe("web-framework-react");
      expect(result.toPlugin).toHaveLength(1);
      expect(firstElement(result.toPlugin).id).toBe("web-state-zustand");
    });

    it("should return empty plan when no migrations needed", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
        buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
      );

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should handle skills with no previous selection (new skill, no migration)", () => {
      const result = detectMigrations([], buildSkillConfigs(["web-framework-react"]));

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should handle skills removed in new selection (no migration)", () => {
      const result = detectMigrations(buildSkillConfigs(["web-framework-react"]), []);

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should detect scope changes when source stays the same", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: EJECT_SOURCE }),
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
      );

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
      expect(result.scopeChanges).toHaveLength(1);
      expect(result.scopeChanges[0]).toStrictEqual({
        id: "web-framework-react",
        oldSource: "eject",
        newSource: "eject",
        oldScope: "project",
        newScope: "global",
      });
    });

    it("should NOT detect scope change when source also changes", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: EJECT_SOURCE }),
        buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );

      expect(result.toPlugin).toHaveLength(1);
      expect(result.scopeChanges).toStrictEqual([]);
    });

    it("should only detect migrations for skills present in both old and new", () => {
      const result = detectMigrations(
        [
          ...buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
        buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
      );

      expect(result.toEject).toHaveLength(1);
      expect(firstElement(result.toEject).id).toBe("web-framework-react");
      expect(result.toPlugin).toStrictEqual([]);
    });
  });

  describe("executeMigration", () => {
    let tempDir: string;
    let sourceResult: SourceLoadResult;

    beforeEach(async () => {
      tempDir = await createTempDir("mode-migrator-test-");

      const matrix = WEB_PAIR_MATRIX;
      sourceResult = buildSourceResult(matrix, "/test/source", {
        marketplace: "https://marketplace.example.com",
      });
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    it("should copy skills to local and uninstall plugins for toEject skills", async () => {
      vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
        createMockCopiedSkill("web-framework-react"),
      ]);

      const plan = buildMigrationPlan({
        toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(copySkillsToLocalFlattened).toHaveBeenCalledWith(
        ["web-framework-react"],
        expect.stringContaining(".claude/skills"),
        sourceResult,
      );
      expect(uninstallPlugin).toHaveBeenCalledWith(
        "web-framework-react@https://marketplace.example.com",
        "project",
        tempDir,
      );
      expect(result.ejectCopies.copied).toStrictEqual(["web-framework-react"]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should archive and install plugins for toPlugin skills", async () => {
      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration("web-state-zustand", { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-state-zustand", "project");
      expect(installPlugin).toHaveBeenCalledWith(
        "web-state-zustand@https://marketplace.example.com",
        "project",
        tempDir,
      );
      expect(result.pluginInstalls.installed).toStrictEqual([
        {
          id: "web-state-zustand",
          ref: "web-state-zustand@https://marketplace.example.com",
        },
      ]);
      expect(result.pluginInstalls.failed).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should handle empty migration plan", async () => {
      const plan = buildMigrationPlan({ toEject: [], toPlugin: [], scopeChanges: [] });

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(copySkillsToLocalFlattened).not.toHaveBeenCalled();
      expect(deleteLocalSkill).not.toHaveBeenCalled();
      expect(installPlugin).not.toHaveBeenCalled();
      expect(uninstallPlugin).not.toHaveBeenCalled();
      expect(result.ejectCopies.copied).toStrictEqual([]);
      expect(result.pluginInstalls.installed).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should report a failed plugin install and preserve the ejected working copy", async () => {
      vi.mocked(installPlugin).mockRejectedValue(new Error("install failed"));

      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration("web-state-zustand", { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(
        deleteLocalSkill,
        "the ejected working copy must survive a migration whose plugin install failed",
      ).not.toHaveBeenCalled();
      expect(result.pluginInstalls.installed).toStrictEqual([]);
      expect(
        result.pluginInstalls.failed,
        "a failed install must be reported structurally so the caller can hard-error before writing config",
      ).toStrictEqual([{ id: "web-state-zustand", error: "install failed" }]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should keep the working copy of the failed skill while migrating the successful one", async () => {
      vi.mocked(installPlugin)
        .mockRejectedValueOnce(new Error("install failed"))
        .mockResolvedValue(undefined);

      const plan = buildMigrationPlan({
        toPlugin: [
          toPluginMigration("web-state-zustand", { from: "project", to: "project" }),
          toPluginMigration("web-framework-react", { from: "project", to: "project" }),
        ],
      });

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(result.pluginInstalls.installed).toStrictEqual([
        {
          id: "web-framework-react",
          ref: "web-framework-react@https://marketplace.example.com",
        },
      ]);
      expect(result.pluginInstalls.failed).toStrictEqual([
        { id: "web-state-zustand", error: "install failed" },
      ]);
      expect(deleteLocalSkill).toHaveBeenCalledOnce();
      expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-framework-react", "project");
    });

    it("should reject a plugin migration when no marketplace is configured, before deleting anything", async () => {
      const noMarketplaceSource = buildSourceResult(sourceResult.matrix, "/test/source");

      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration("web-state-zustand", { from: "project", to: "project" })],
      });

      await expect(executeMigration(plan, tempDir, noMarketplaceSource)).rejects.toThrow(
        /marketplace could not be resolved/,
      );

      expect(
        deleteLocalSkill,
        "the ejected working copy must survive a migration that cannot install it as a plugin",
      ).not.toHaveBeenCalled();
      expect(installPlugin).not.toHaveBeenCalled();
    });

    it("should reject before deleting even when a migration skips the delete step", async () => {
      const noMarketplaceSource = buildSourceResult(sourceResult.matrix, "/test/source");

      const plan = buildMigrationPlan({
        toPlugin: [
          toPluginMigration("web-framework-react", { from: "global", to: "project" }),
          toPluginMigration("web-state-zustand", { from: "project", to: "project" }),
        ],
      });

      await expect(executeMigration(plan, tempDir, noMarketplaceSource)).rejects.toThrow(
        /marketplace could not be resolved/,
      );

      expect(deleteLocalSkill).not.toHaveBeenCalled();
      expect(installPlugin).not.toHaveBeenCalled();
    });

    describe("global→project scope migration", () => {
      it("should NOT uninstall global plugin when ejecting to project scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "global", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(copySkillsToLocalFlattened).toHaveBeenCalled();
        expect(uninstallPlugin).not.toHaveBeenCalled();
        expect(result.ejectCopies.copied).toStrictEqual(["web-framework-react"]);
        expect(result.warnings).toStrictEqual([]);
      });

      it("should NOT delete global local skill when switching to project plugin", async () => {
        vi.mocked(installPlugin).mockResolvedValue(undefined);

        const plan = buildMigrationPlan({
          toPlugin: [toPluginMigration("web-state-zustand", { from: "global", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(deleteLocalSkill).not.toHaveBeenCalled();
        expect(installPlugin).toHaveBeenCalledWith(
          "web-state-zustand@https://marketplace.example.com",
          "project",
          tempDir,
        );
        expect(result.pluginInstalls.installed).toStrictEqual([
          {
            id: "web-state-zustand",
            ref: "web-state-zustand@https://marketplace.example.com",
          },
        ]);
        expect(result.warnings).toStrictEqual([]);
      });
    });

    describe("same-scope migrations", () => {
      it("should uninstall project plugin when ejecting to project scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(uninstallPlugin).toHaveBeenCalledWith(
          "web-framework-react@https://marketplace.example.com",
          "project",
          tempDir,
        );
        expect(
          uninstallPlugin,
          "the migration's own scope is unambiguous here, so a second call would be a both-scopes sweep dropping a registration the other scope still needs",
        ).toHaveBeenCalledTimes(1);
        expect(result.ejectCopies.copied).toStrictEqual(["web-framework-react"]);
      });

      it("should uninstall global plugin when ejecting to global scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "global", to: "global" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(uninstallPlugin).toHaveBeenCalledWith(
          "web-framework-react@https://marketplace.example.com",
          "global",
          tempDir,
        );
        expect(
          uninstallPlugin,
          "the migration's own scope is unambiguous here, so a second call would be a both-scopes sweep dropping the project registration another scope still needs",
        ).toHaveBeenCalledTimes(1);
        expect(result.ejectCopies.copied).toStrictEqual(["web-framework-react"]);
      });

      it("should delete project local skill when switching to project plugin", async () => {
        vi.mocked(installPlugin).mockResolvedValue(undefined);

        const plan = buildMigrationPlan({
          toPlugin: [toPluginMigration("web-state-zustand", { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-state-zustand", "project");
        expect(result.pluginInstalls.installed).toStrictEqual([
          {
            id: "web-state-zustand",
            ref: "web-state-zustand@https://marketplace.example.com",
          },
        ]);
      });
    });

    describe("a copy the destination refused", () => {
      const UNWRITABLE = "EACCES: permission denied, mkdir";

      afterEach(() => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([]);
        vi.mocked(uninstallPlugin).mockResolvedValue("removed");
      });

      it("reports the failure structurally rather than as a warning nobody can act on", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockRejectedValue(new Error(UNWRITABLE));

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(
          result.ejectCopies.failed,
          "a failed copy must be reported structurally so the caller can hard-error before any config records the eject",
        ).toStrictEqual([{ id: "web-framework-react", error: UNWRITABLE }]);
        expect(result.ejectCopies.copied).toStrictEqual([]);
        expect(result.warnings).toStrictEqual([]);
      });

      it("leaves the plugin registered for a skill whose copy never landed", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockRejectedValue(new Error(UNWRITABLE));

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
        });

        await executeMigration(plan, tempDir, sourceResult);

        expect(
          uninstallPlugin,
          "a skill whose local copy failed is still only installed as a plugin — dropping that registration would leave it installed nowhere",
        ).not.toHaveBeenCalled();
      });

      it("still copies the global-scoped skill when the project-scoped one fails", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockImplementation(async (skillIds) => {
          if (skillIds.includes("web-framework-react")) throw new Error(UNWRITABLE);
          return skillIds.map((id) => createMockCopiedSkill(id));
        });

        const plan = buildMigrationPlan({
          toEject: [
            toEjectMigration("web-framework-react", { from: "project", to: "project" }),
            toEjectMigration("web-state-zustand", { from: "global", to: "global" }),
          ],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        // Read here, not at describe time: the isolated-home spy is installed per test.
        const globalSkillsDir = path.join(os.homedir(), ".claude", "skills");
        expect(
          copySkillsToLocalFlattened,
          "the global destination must still be attempted after a project-scope refusal — they are separate directories",
        ).toHaveBeenCalledWith(["web-state-zustand"], globalSkillsDir, sourceResult);
        expect(result.ejectCopies.copied).toStrictEqual(["web-state-zustand"]);
        expect(result.ejectCopies.failed).toStrictEqual([
          { id: "web-framework-react", error: UNWRITABLE },
        ]);
      });

      it("names a failed plugin uninstall as an uninstall, not as a failed copy", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);
        vi.mocked(uninstallPlugin).mockRejectedValue(new Error("spawn claude ENOENT"));

        const plan = buildMigrationPlan({
          toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(result.ejectCopies.copied).toStrictEqual(["web-framework-react"]);
        expect(
          result.ejectCopies.failed,
          "an uninstall is diagnostic-only and must never be reported as work the migration failed to do",
        ).toStrictEqual([]);
        expect(result.warnings).toStrictEqual([
          "Could not uninstall plugin for web-framework-react: spawn claude ENOENT",
        ]);
      });
    });
  });
});

describe("mode-migrator, what it says", () => {
  const MARKETPLACE = "https://marketplace.example.com";
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("mode-migrator-said-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const withMarketplace = () =>
    buildSourceResult(WEB_PAIR_MATRIX, "/test/source", { marketplace: MARKETPLACE });
  const withoutMarketplace = () => buildSourceResult(WEB_PAIR_MATRIX, "/test/source");

  it("plans no scope change for a skill that stayed where it was", () => {
    const unchanged = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: EJECT_SOURCE,
    });

    expect(detectMigrations(unchanged, unchanged)).toStrictEqual(buildMigrationPlan({}));
  });

  it("explains a failed eject copy and the two ways out", () => {
    expect(ejectCopyFailureError(2)).toBe(
      "Failed to copy 2 skill(s) for eject. Eject intent could not be honored. Check that the destination skills directory is writable, then apply the same id again with 'npx agents-inc edit --from <id>' — or switch the affected skills back to plugin mode.",
    );
  });

  it("names the source a plugin install found no marketplace in, and the two ways out", async () => {
    const plan = buildMigrationPlan({
      toPlugin: [toPluginMigration("web-state-zustand", { from: "project", to: "project" })],
    });

    await expect(executeMigration(plan, tempDir, withoutMarketplace())).rejects.toThrow(
      "Cannot install skills as plugins: marketplace could not be resolved from '/test/source'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.",
    );
  });

  it("ejects without a marketplace, warning only that it could not uninstall the plugin", async () => {
    vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
      createMockCopiedSkill("web-framework-react"),
    ]);
    const plan = buildMigrationPlan({
      toEject: [toEjectMigration("web-framework-react", { from: "project", to: "project" })],
    });

    const result = await executeMigration(plan, tempDir, withoutMarketplace());

    expect(result.warnings).toStrictEqual([
      "Could not uninstall plugin for web-framework-react: no marketplace configured",
    ]);
    expect(uninstallPlugin).not.toHaveBeenCalled();
  });

  it("says each plugin it installed or uninstalled, and each global one it kept", async () => {
    vi.mocked(copySkillsToLocalFlattened).mockImplementation(async (ids) =>
      ids.map((id) => createMockCopiedSkill(id)),
    );
    vi.mocked(uninstallPlugin).mockResolvedValue("removed");
    vi.mocked(installPlugin).mockResolvedValue(undefined);
    const plan = buildMigrationPlan({
      toEject: [
        toEjectMigration("web-framework-react", { from: "project", to: "project" }),
        toEjectMigration("web-state-zustand", { from: "global", to: "project" }),
      ],
      toPlugin: [toPluginMigration("web-testing-vitest", { from: "global", to: "project" })],
    });

    await executeMigration(plan, tempDir, withMarketplace());

    expect(vi.mocked(verbose).mock.calls).toStrictEqual([
      ["Uninstalled plugin for web-framework-react"],
      ["Keeping global plugin for web-state-zustand (migrated to project-eject)"],
      ["Installed plugin for web-testing-vitest"],
      ["Keeping global local skill for web-testing-vitest (migrated to project-plugin)"],
    ]);
  });

  it("deletes the global working copy of a skill that became a global plugin", async () => {
    vi.mocked(installPlugin).mockResolvedValue(undefined);
    const plan = buildMigrationPlan({
      toPlugin: [toPluginMigration("web-state-zustand", { from: "global", to: "global" })],
    });

    await executeMigration(plan, tempDir, withMarketplace());

    expect(deleteLocalSkill).toHaveBeenCalledExactlyOnceWith(
      tempDir,
      "web-state-zustand",
      "global",
    );
  });
});
