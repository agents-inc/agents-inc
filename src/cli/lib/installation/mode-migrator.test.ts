import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceLoadResult } from "../loading/source-loader";
import type { MigrationPlan } from "./mode-migrator";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { buildSourceResult } from "../__tests__/factories/config-factories";
import { createMockCopiedSkill } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { WEB_PAIR_MATRIX } from "../__tests__/mock-data/mock-matrices";

// Mock dependencies before imports
vi.mock("../skills", () => ({
  deleteLocalSkill: vi.fn().mockResolvedValue(undefined),
  copySkillsToLocalFlattened: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../utils/exec", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/exec")>()),
  claudePluginInstall: vi.fn().mockResolvedValue(undefined),
  claudePluginUninstall: vi.fn().mockResolvedValue(undefined),
  claudePluginUninstallBestEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/logger");

import { detectMigrations, executeMigration } from "./mode-migrator";
import { deleteLocalSkill, copySkillsToLocalFlattened } from "../skills";
import {
  claudePluginInstall,
  claudePluginUninstall,
  claudePluginUninstallBestEffort,
} from "../../utils/exec";

describe("mode-migrator", () => {
  describe("detectMigrations", () => {
    it("should detect skills moving from plugin to eject", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        buildSkillConfigs(["web-framework-react"]),
      );

      expect(result.toEject).toHaveLength(1);
      expect(result.toEject[0].id).toBe("web-framework-react");
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should detect skills moving from eject to plugin", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"]),
        buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
      );

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toHaveLength(1);
      expect(result.toPlugin[0].id).toBe("web-framework-react");
    });

    it("should detect mixed migrations", () => {
      const result = detectMigrations(
        [
          ...buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
        [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-state-zustand"], { source: "agents-inc" }),
        ],
      );

      expect(result.toEject).toHaveLength(1);
      expect(result.toEject[0].id).toBe("web-framework-react");
      expect(result.toPlugin).toHaveLength(1);
      expect(result.toPlugin[0].id).toBe("web-state-zustand");
    });

    it("should return empty plan when no migrations needed", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
      );

      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should handle skills with no previous selection (new skill, no migration)", () => {
      const result = detectMigrations([], buildSkillConfigs(["web-framework-react"]));

      // New skills are not migrations (no old entry to compare)
      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should handle skills removed in new selection (no migration)", () => {
      const result = detectMigrations(buildSkillConfigs(["web-framework-react"]), []);

      // Removed skills are not migrations (no new entry to compare)
      expect(result.toEject).toStrictEqual([]);
      expect(result.toPlugin).toStrictEqual([]);
    });

    it("should detect scope changes when source stays the same", () => {
      const result = detectMigrations(
        buildSkillConfigs(["web-framework-react"]),
        buildSkillConfigs(["web-framework-react"], { scope: "global" }),
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
        buildSkillConfigs(["web-framework-react"]),
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );

      // Source changed (eject -> agents-inc), so this is a toPlugin, not a scopeChange
      expect(result.toPlugin).toHaveLength(1);
      expect(result.scopeChanges).toStrictEqual([]);
    });

    it("should only detect migrations for skills present in both old and new", () => {
      const result = detectMigrations(
        [
          ...buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
        buildSkillConfigs(["web-framework-react"]),
      );

      // Only react is in both old and new with a source change
      expect(result.toEject).toHaveLength(1);
      expect(result.toEject[0].id).toBe("web-framework-react");
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

      const plan: MigrationPlan = {
        toEject: [
          {
            id: "web-framework-react",
            oldSource: "agents-inc",
            newSource: "eject",
            oldScope: "project",
            newScope: "project",
          },
        ],
        toPlugin: [],
        scopeChanges: [],
      };

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(copySkillsToLocalFlattened).toHaveBeenCalledWith(
        ["web-framework-react"],
        expect.stringContaining(".claude/skills"),
        sourceResult,
      );
      expect(claudePluginUninstall).toHaveBeenCalledWith(
        "web-framework-react@https://marketplace.example.com",
        "project",
        tempDir,
      );
      expect(result.ejectedSkills).toStrictEqual(["web-framework-react"]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should archive and install plugins for toPlugin skills", async () => {
      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [
          {
            id: "web-state-zustand",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
        ],
        scopeChanges: [],
      };

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-state-zustand");
      expect(claudePluginInstall).toHaveBeenCalledWith(
        "web-state-zustand@https://marketplace.example.com",
        "project",
        tempDir,
      );
      expect(result.pluginizedSkills).toStrictEqual(["web-state-zustand"]);
      expect(result.failedPluginInstalls).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should handle empty migration plan", async () => {
      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [],
        scopeChanges: [],
      };

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(copySkillsToLocalFlattened).not.toHaveBeenCalled();
      expect(deleteLocalSkill).not.toHaveBeenCalled();
      expect(claudePluginInstall).not.toHaveBeenCalled();
      expect(claudePluginUninstall).not.toHaveBeenCalled();
      expect(claudePluginUninstallBestEffort).not.toHaveBeenCalled();
      expect(result.ejectedSkills).toStrictEqual([]);
      expect(result.pluginizedSkills).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should report a failed plugin install and preserve the ejected working copy", async () => {
      vi.mocked(claudePluginInstall).mockRejectedValue(new Error("install failed"));

      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [
          {
            id: "web-state-zustand",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
        ],
        scopeChanges: [],
      };

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(
        deleteLocalSkill,
        "the ejected working copy must survive a migration whose plugin install failed",
      ).not.toHaveBeenCalled();
      expect(result.pluginizedSkills).toStrictEqual([]);
      expect(
        result.failedPluginInstalls,
        "a failed install must be reported structurally so the caller can hard-error before writing config",
      ).toStrictEqual([{ id: "web-state-zustand", error: "install failed" }]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should keep the working copy of the failed skill while migrating the successful one", async () => {
      vi.mocked(claudePluginInstall)
        .mockRejectedValueOnce(new Error("install failed"))
        .mockResolvedValue(undefined);

      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [
          {
            id: "web-state-zustand",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
          {
            id: "web-framework-react",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
        ],
        scopeChanges: [],
      };

      const result = await executeMigration(plan, tempDir, sourceResult);

      expect(result.pluginizedSkills).toStrictEqual(["web-framework-react"]);
      expect(result.failedPluginInstalls).toStrictEqual([
        { id: "web-state-zustand", error: "install failed" },
      ]);
      expect(deleteLocalSkill).toHaveBeenCalledOnce();
      expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-framework-react");
    });

    it("should reject a plugin migration when no marketplace is configured, before deleting anything", async () => {
      const noMarketplaceSource = buildSourceResult(sourceResult.matrix, "/test/source");

      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [
          {
            id: "web-state-zustand",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
        ],
        scopeChanges: [],
      };

      await expect(executeMigration(plan, tempDir, noMarketplaceSource)).rejects.toThrow(
        /marketplace could not be resolved/,
      );

      expect(
        deleteLocalSkill,
        "the ejected working copy must survive a migration that cannot install it as a plugin",
      ).not.toHaveBeenCalled();
      expect(claudePluginInstall).not.toHaveBeenCalled();
    });

    it("should reject before deleting even when a migration skips the delete step", async () => {
      const noMarketplaceSource = buildSourceResult(sourceResult.matrix, "/test/source");

      const plan: MigrationPlan = {
        toEject: [],
        toPlugin: [
          {
            id: "web-framework-react",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "global",
            newScope: "project",
          },
          {
            id: "web-state-zustand",
            oldSource: "eject",
            newSource: "agents-inc",
            oldScope: "project",
            newScope: "project",
          },
        ],
        scopeChanges: [],
      };

      await expect(executeMigration(plan, tempDir, noMarketplaceSource)).rejects.toThrow(
        /marketplace could not be resolved/,
      );

      expect(deleteLocalSkill).not.toHaveBeenCalled();
      expect(claudePluginInstall).not.toHaveBeenCalled();
    });

    describe("global→project scope migration", () => {
      it("should NOT uninstall global plugin when ejecting to project scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan: MigrationPlan = {
          toEject: [
            {
              id: "web-framework-react",
              oldSource: "agents-inc",
              newSource: "eject",
              oldScope: "global",
              newScope: "project",
            },
          ],
          toPlugin: [],
          scopeChanges: [],
        };

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(copySkillsToLocalFlattened).toHaveBeenCalled();
        expect(claudePluginUninstall).not.toHaveBeenCalled();
        expect(claudePluginUninstallBestEffort).not.toHaveBeenCalled();
        expect(result.ejectedSkills).toStrictEqual(["web-framework-react"]);
        expect(result.warnings).toStrictEqual([]);
      });

      it("should NOT delete global local skill when switching to project plugin", async () => {
        vi.mocked(claudePluginInstall).mockResolvedValue(undefined);

        const plan: MigrationPlan = {
          toEject: [],
          toPlugin: [
            {
              id: "web-state-zustand",
              oldSource: "eject",
              newSource: "agents-inc",
              oldScope: "global",
              newScope: "project",
            },
          ],
          scopeChanges: [],
        };

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(deleteLocalSkill).not.toHaveBeenCalled();
        expect(claudePluginInstall).toHaveBeenCalledWith(
          "web-state-zustand@https://marketplace.example.com",
          "project",
          tempDir,
        );
        expect(result.pluginizedSkills).toStrictEqual(["web-state-zustand"]);
        expect(result.warnings).toStrictEqual([]);
      });
    });

    describe("same-scope migrations", () => {
      it("should uninstall project plugin when ejecting to project scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan: MigrationPlan = {
          toEject: [
            {
              id: "web-framework-react",
              oldSource: "agents-inc",
              newSource: "eject",
              oldScope: "project",
              newScope: "project",
            },
          ],
          toPlugin: [],
          scopeChanges: [],
        };

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(claudePluginUninstall).toHaveBeenCalledWith(
          "web-framework-react@https://marketplace.example.com",
          "project",
          tempDir,
        );
        expect(result.ejectedSkills).toStrictEqual(["web-framework-react"]);
      });

      it("should uninstall global plugin when ejecting to global scope", async () => {
        vi.mocked(copySkillsToLocalFlattened).mockResolvedValue([
          createMockCopiedSkill("web-framework-react"),
        ]);

        const plan: MigrationPlan = {
          toEject: [
            {
              id: "web-framework-react",
              oldSource: "agents-inc",
              newSource: "eject",
              oldScope: "global",
              newScope: "global",
            },
          ],
          toPlugin: [],
          scopeChanges: [],
        };

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(claudePluginUninstall).toHaveBeenCalledWith(
          "web-framework-react@https://marketplace.example.com",
          "user",
          tempDir,
        );
        expect(result.ejectedSkills).toStrictEqual(["web-framework-react"]);
      });

      it("should delete project local skill when switching to project plugin", async () => {
        vi.mocked(claudePluginInstall).mockResolvedValue(undefined);

        const plan: MigrationPlan = {
          toEject: [],
          toPlugin: [
            {
              id: "web-state-zustand",
              oldSource: "eject",
              newSource: "agents-inc",
              oldScope: "project",
              newScope: "project",
            },
          ],
          scopeChanges: [],
        };

        const result = await executeMigration(plan, tempDir, sourceResult);

        expect(deleteLocalSkill).toHaveBeenCalledWith(tempDir, "web-state-zustand");
        expect(result.pluginizedSkills).toStrictEqual(["web-state-zustand"]);
      });
    });
  });
});
