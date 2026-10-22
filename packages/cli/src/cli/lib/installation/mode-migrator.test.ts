import path from "path";
import { chmod, mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceLoadResult } from "../loading/source-loader";
import type { SkillId, SkillScope } from "../../types";
import { initMatrixAndSource } from "../__tests__/factories/config-factories";
import { createMatrixFromTestSkills } from "../__tests__/factories/matrix-factories";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "../__tests__/fixtures/create-test-source";
import { writeTestSkill } from "../__tests__/helpers/disk-writers";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { silenceConsole } from "../__tests__/helpers/silence-console";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { INSTALL_MODE_SKILLS } from "../__tests__/mock-data/mock-skills";
import { directoryExists, fileExists } from "../__tests__/test-fs-utils";
import { CLAUDE_DIR, DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE, STANDARD_FILES } from "../../consts";
import { resolveInstallPaths } from "./install-base-dir";
import {
  buildMigrationPlan,
  toEjectMigration,
  toPluginMigration,
} from "./__tests__/helpers/migration-plans";

vi.mock("../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

import {
  copyingBesideGlobalPlugins,
  detectMigrations,
  ejectCopyFailureError,
  executeMigration,
  installingBesideGlobalCopies,
  keepsGlobalInstall,
} from "./mode-migrator";
import { setVerbose } from "../../utils/logger";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { hostAt } from "../hosts/host-for.js";

// `hostAt` answers one shared host: the seam to the coding agent's plugin CLI.
const installPlugin = hostAt("/any-root").installPlugin;
const uninstallPlugin = hostAt("/any-root").uninstallPlugin;

const MARKETPLACE = "https://marketplace.example.com";
const REACT: SkillId = "web-framework-react";
const ZUSTAND: SkillId = "web-state-zustand";
const VITEST: SkillId = "web-testing-vitest";

/** No write bit, so creating a skills folder under it is refused; cleanup can still remove it. */
const UNWRITABLE_DIR = 0o555;
const WRITABLE_DIR = 0o755;

/**
 * Copies and deletes for real, between a source on disk, a project and a fake home; the plugin
 * host is the only double.
 */
function useMigrationDisk() {
  let dirs: TestDirs;
  let withMarketplace: SourceLoadResult;
  let withoutMarketplace: SourceLoadResult;

  beforeEach(async () => {
    dirs = await createTestSource({ skills: INSTALL_MODE_SKILLS });
    const matrix = createMatrixFromTestSkills(INSTALL_MODE_SKILLS);
    withoutMarketplace = initMatrixAndSource(matrix, dirs.sourceDir);
    withMarketplace = initMatrixAndSource(matrix, dirs.sourceDir, { marketplace: MARKETPLACE });
    vi.mocked(installPlugin).mockResolvedValue(undefined);
    vi.mocked(uninstallPlugin).mockResolvedValue("removed");
  });

  afterEach(async () => {
    const claudeDir = path.join(dirs.projectDir, CLAUDE_DIR);
    if (await directoryExists(claudeDir)) await chmod(claudeDir, WRITABLE_DIR);
    await cleanupTestSource(dirs);
  });

  const home = useFakeHome(() => dirs.tempDir);

  const rootOf = (scope: SkillScope): string => (scope === "global" ? home.dir : dirs.projectDir);
  const skillDirAt = (scope: SkillScope, id: SkillId): string =>
    path.join(resolveInstallPaths(rootOf(scope), scope).skillsDir, id);

  return {
    get dirs() {
      return dirs;
    },
    get projectDir() {
      return dirs.projectDir;
    },
    get withMarketplace() {
      return withMarketplace;
    },
    get withoutMarketplace() {
      return withoutMarketplace;
    },
    /** A skill's ejected working copy, as an earlier eject left it. */
    seedWorkingCopy: (scope: SkillScope, id: SkillId): Promise<string> =>
      writeTestSkill(resolveInstallPaths(rootOf(scope), scope).skillsDir, id),
    hasWorkingCopy: (scope: SkillScope, id: SkillId): Promise<boolean> =>
      fileExists(path.join(skillDirAt(scope, id), STANDARD_FILES.SKILL_MD)),
    skillsFolderExists: (scope: SkillScope): Promise<boolean> =>
      directoryExists(resolveInstallPaths(rootOf(scope), scope).skillsDir),
    refuseProjectSkillsFolder: async (): Promise<void> => {
      const claudeDir = path.join(dirs.projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });
      await chmod(claudeDir, UNWRITABLE_DIR);
    },
  };
}

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
    const disk = useMigrationDisk();

    it("copies the skill into the project and uninstalls its plugin, for a skill ejected in place", async () => {
      const plan = buildMigrationPlan({
        toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

      expect(await disk.hasWorkingCopy("project", REACT)).toBe(true);
      expect(uninstallPlugin).toHaveBeenCalledWith(
        `${REACT}@${MARKETPLACE}`,
        "project",
        disk.projectDir,
      );
      expect(result.ejectCopies.copied).toStrictEqual([REACT]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("installs the plugin and deletes the ejected working copy, for a skill switched to a plugin in place", async () => {
      await disk.seedWorkingCopy("project", ZUSTAND);
      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration(ZUSTAND, { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

      expect(await disk.hasWorkingCopy("project", ZUSTAND)).toBe(false);
      expect(installPlugin).toHaveBeenCalledWith(
        `${ZUSTAND}@${MARKETPLACE}`,
        "project",
        disk.projectDir,
      );
      expect(result.pluginInstalls).toStrictEqual({
        installed: [{ id: ZUSTAND, ref: `${ZUSTAND}@${MARKETPLACE}` }],
        failed: [],
      });
      expect(result.warnings).toStrictEqual([]);
    });

    it("touches neither disk nor host for an empty plan", async () => {
      const result = await executeMigration(
        buildMigrationPlan({ toEject: [], toPlugin: [], scopeChanges: [] }),
        disk.projectDir,
        disk.withMarketplace,
      );

      expect(await disk.skillsFolderExists("project")).toBe(false);
      expect(await disk.skillsFolderExists("global")).toBe(false);
      expect(installPlugin).not.toHaveBeenCalled();
      expect(uninstallPlugin).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        ejectCopies: { copied: [], failed: [] },
        pluginInstalls: { installed: [], failed: [] },
        warnings: [],
      });
    });

    it("reports a failed plugin install and keeps the ejected working copy", async () => {
      await disk.seedWorkingCopy("project", ZUSTAND);
      vi.mocked(installPlugin).mockRejectedValue(new Error("install failed"));
      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration(ZUSTAND, { from: "project", to: "project" })],
      });

      const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

      expect(
        await disk.hasWorkingCopy("project", ZUSTAND),
        "the ejected working copy must survive a migration whose plugin install failed",
      ).toBe(true);
      expect(
        result.pluginInstalls,
        "a failed install must be reported structurally so the caller can hard-error before writing config",
      ).toStrictEqual({ installed: [], failed: [{ id: ZUSTAND, error: "install failed" }] });
      expect(result.warnings).toStrictEqual([]);
    });

    it("keeps the working copy of the failed skill while migrating the successful one", async () => {
      await disk.seedWorkingCopy("project", ZUSTAND);
      await disk.seedWorkingCopy("project", REACT);
      vi.mocked(installPlugin)
        .mockRejectedValueOnce(new Error("install failed"))
        .mockResolvedValue(undefined);
      const plan = buildMigrationPlan({
        toPlugin: [
          toPluginMigration(ZUSTAND, { from: "project", to: "project" }),
          toPluginMigration(REACT, { from: "project", to: "project" }),
        ],
      });

      const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

      expect(result.pluginInstalls).toStrictEqual({
        installed: [{ id: REACT, ref: `${REACT}@${MARKETPLACE}` }],
        failed: [{ id: ZUSTAND, error: "install failed" }],
      });
      expect(await disk.hasWorkingCopy("project", ZUSTAND)).toBe(true);
      expect(await disk.hasWorkingCopy("project", REACT)).toBe(false);
    });

    it("refuses a plugin migration with no marketplace before deleting anything", async () => {
      await disk.seedWorkingCopy("project", ZUSTAND);
      const plan = buildMigrationPlan({
        toPlugin: [toPluginMigration(ZUSTAND, { from: "project", to: "project" })],
      });

      await expect(
        executeMigration(plan, disk.projectDir, disk.withoutMarketplace),
      ).rejects.toThrow(/marketplace could not be resolved/);

      expect(
        await disk.hasWorkingCopy("project", ZUSTAND),
        "the ejected working copy must survive a migration that cannot install it as a plugin",
      ).toBe(true);
      expect(installPlugin).not.toHaveBeenCalled();
    });

    it("refuses before deleting even when the first migration would keep its working copy", async () => {
      await disk.seedWorkingCopy("global", REACT);
      await disk.seedWorkingCopy("project", ZUSTAND);
      const plan = buildMigrationPlan({
        toPlugin: [
          toPluginMigration(REACT, { from: "global", to: "project" }),
          toPluginMigration(ZUSTAND, { from: "project", to: "project" }),
        ],
      });

      await expect(
        executeMigration(plan, disk.projectDir, disk.withoutMarketplace),
      ).rejects.toThrow(/marketplace could not be resolved/);

      expect(await disk.hasWorkingCopy("global", REACT)).toBe(true);
      expect(await disk.hasWorkingCopy("project", ZUSTAND)).toBe(true);
      expect(installPlugin).not.toHaveBeenCalled();
    });

    describe("global→project scope migration", () => {
      it("keeps the global plugin when ejecting into the project", async () => {
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "global", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(await disk.hasWorkingCopy("project", REACT)).toBe(true);
        expect(uninstallPlugin).not.toHaveBeenCalled();
        expect(result.ejectCopies.copied).toStrictEqual([REACT]);
        expect(result.warnings).toStrictEqual([]);
      });

      it("keeps the global working copy when switching to a project plugin", async () => {
        await disk.seedWorkingCopy("global", ZUSTAND);
        const plan = buildMigrationPlan({
          toPlugin: [toPluginMigration(ZUSTAND, { from: "global", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(await disk.hasWorkingCopy("global", ZUSTAND)).toBe(true);
        expect(installPlugin).toHaveBeenCalledWith(
          `${ZUSTAND}@${MARKETPLACE}`,
          "project",
          disk.projectDir,
        );
        expect(result.pluginInstalls.installed).toStrictEqual([
          { id: ZUSTAND, ref: `${ZUSTAND}@${MARKETPLACE}` },
        ]);
        expect(result.warnings).toStrictEqual([]);
      });
    });

    describe("same-scope migrations", () => {
      it("uninstalls the project plugin only, when ejecting at project scope", async () => {
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(
          uninstallPlugin,
          "the migration's own scope is unambiguous here, so a second call would be a both-scopes sweep dropping a registration the other scope still needs",
        ).toHaveBeenCalledExactlyOnceWith(`${REACT}@${MARKETPLACE}`, "project", disk.projectDir);
        expect(result.ejectCopies.copied).toStrictEqual([REACT]);
      });

      it("copies into the home folder and uninstalls the global plugin only, when ejecting at global scope", async () => {
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "global", to: "global" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(await disk.hasWorkingCopy("global", REACT)).toBe(true);
        expect(await disk.skillsFolderExists("project")).toBe(false);
        expect(
          uninstallPlugin,
          "the migration's own scope is unambiguous here, so a second call would be a both-scopes sweep dropping the project registration another scope still needs",
        ).toHaveBeenCalledExactlyOnceWith(`${REACT}@${MARKETPLACE}`, "global", disk.projectDir);
        expect(result.ejectCopies.copied).toStrictEqual([REACT]);
      });

      it("deletes the project working copy when switching to a project plugin", async () => {
        await disk.seedWorkingCopy("project", ZUSTAND);
        const plan = buildMigrationPlan({
          toPlugin: [toPluginMigration(ZUSTAND, { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(await disk.hasWorkingCopy("project", ZUSTAND)).toBe(false);
        expect(result.pluginInstalls.installed).toStrictEqual([
          { id: ZUSTAND, ref: `${ZUSTAND}@${MARKETPLACE}` },
        ]);
      });
    });

    describe("a copy the destination refused", () => {
      it("reports the failure structurally rather than as a warning nobody can act on", async () => {
        await disk.refuseProjectSkillsFolder();
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(
          result.ejectCopies,
          "a failed copy must be reported structurally so the caller can hard-error before any config records the eject",
        ).toStrictEqual({
          copied: [],
          failed: [{ id: REACT, error: expect.stringContaining("EACCES: permission denied") }],
        });
        expect(result.warnings).toStrictEqual([]);
      });

      it("leaves the plugin registered for a skill whose copy never landed", async () => {
        await disk.refuseProjectSkillsFolder();
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
        });

        await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(
          uninstallPlugin,
          "a skill whose local copy failed is still only installed as a plugin — dropping that registration would leave it installed nowhere",
        ).not.toHaveBeenCalled();
      });

      it("still copies the global-scoped skill when the project-scoped one fails", async () => {
        await disk.refuseProjectSkillsFolder();
        const plan = buildMigrationPlan({
          toEject: [
            toEjectMigration(REACT, { from: "project", to: "project" }),
            toEjectMigration(ZUSTAND, { from: "global", to: "global" }),
          ],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(
          await disk.hasWorkingCopy("global", ZUSTAND),
          "the global destination must still be attempted after a project-scope refusal — they are separate directories",
        ).toBe(true);
        expect(result.ejectCopies).toStrictEqual({
          copied: [ZUSTAND],
          failed: [{ id: REACT, error: expect.stringContaining("EACCES: permission denied") }],
        });
      });

      it("names a failed plugin uninstall as an uninstall, not as a failed copy", async () => {
        vi.mocked(uninstallPlugin).mockRejectedValue(new Error("spawn claude ENOENT"));
        const plan = buildMigrationPlan({
          toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
        });

        const result = await executeMigration(plan, disk.projectDir, disk.withMarketplace);

        expect(result.ejectCopies.copied).toStrictEqual([REACT]);
        expect(
          result.ejectCopies.failed,
          "an uninstall is diagnostic-only and must never be reported as work the migration failed to do",
        ).toStrictEqual([]);
        expect(result.warnings).toStrictEqual([
          `Could not uninstall plugin for ${REACT}: spawn claude ENOENT`,
        ]);
      });
    });
  });
});

describe("mode-migrator, what it says", () => {
  silenceConsole(["log", "warn"]);
  const disk = useMigrationDisk();

  beforeEach(() => setVerbose(true));
  afterEach(() => setVerbose(false));

  it("plans no scope change for a skill that stayed where it was", () => {
    const unchanged = buildSkillConfigs([REACT], { scope: "project", origin: EJECT_SOURCE });

    expect(detectMigrations(unchanged, unchanged)).toStrictEqual(buildMigrationPlan({}));
  });

  it("explains a failed eject copy and the two ways out", () => {
    expect(ejectCopyFailureError(2)).toBe(
      "Failed to copy 2 skill(s) for eject. Eject intent could not be honored. Check that the destination skills directory is writable, then apply the same id again with 'npx agents-inc edit --from <id>' — or switch the affected skills back to plugin mode.",
    );
  });

  it("says a skill copied into the project keeps its global plugin, one skill or several", () => {
    expect([copyingBesideGlobalPlugins(1), copyingBesideGlobalPlugins(2)]).toStrictEqual([
      "Copying 1 skill into this project (the global plugin stays)",
      "Copying 2 skills into this project (the global plugins stay)",
    ]);
  });

  it("says a skill installed as a plugin in the project keeps its global copy, one skill or several", () => {
    expect([installingBesideGlobalCopies(1), installingBesideGlobalCopies(2)]).toStrictEqual([
      "Installing 1 skill as a plugin in this project (the global copy stays)",
      "Installing 2 skills as plugins in this project (the global copies stay)",
    ]);
  });

  it("keeps the global install only for a skill moved from the global install into the project, as a copy or a plugin", () => {
    expect(
      [
        toEjectMigration(REACT, { from: "global", to: "project" }),
        toEjectMigration(REACT, { from: "project", to: "project" }),
        toEjectMigration(REACT, { from: "global", to: "global" }),
        toEjectMigration(REACT, { from: "project", to: "global" }),
        toPluginMigration(REACT, { from: "global", to: "project" }),
        toPluginMigration(REACT, { from: "project", to: "project" }),
        toPluginMigration(REACT, { from: "global", to: "global" }),
        toPluginMigration(REACT, { from: "project", to: "global" }),
      ].map(keepsGlobalInstall),
    ).toStrictEqual([true, false, false, false, true, false, false, false]);
  });

  it("names the source a plugin install found no marketplace in, and the two ways out", async () => {
    const plan = buildMigrationPlan({
      toPlugin: [toPluginMigration(ZUSTAND, { from: "project", to: "project" })],
    });

    await expect(executeMigration(plan, disk.projectDir, disk.withoutMarketplace)).rejects.toThrow(
      `Cannot install skills as plugins: marketplace could not be resolved from '${disk.dirs.sourceDir}'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.`,
    );
  });

  it("ejects without a marketplace, warning only that it could not uninstall the plugin", async () => {
    const plan = buildMigrationPlan({
      toEject: [toEjectMigration(REACT, { from: "project", to: "project" })],
    });

    const result = await executeMigration(plan, disk.projectDir, disk.withoutMarketplace);

    expect(await disk.hasWorkingCopy("project", REACT)).toBe(true);
    expect(result.warnings).toStrictEqual([
      `Could not uninstall plugin for ${REACT}: no marketplace configured`,
    ]);
    expect(uninstallPlugin).not.toHaveBeenCalled();
  });

  it("says each plugin it installed or uninstalled, and each global one it kept", async () => {
    await disk.seedWorkingCopy("global", VITEST);
    const plan = buildMigrationPlan({
      toEject: [
        toEjectMigration(REACT, { from: "project", to: "project" }),
        toEjectMigration(ZUSTAND, { from: "global", to: "project" }),
      ],
      toPlugin: [toPluginMigration(VITEST, { from: "global", to: "project" })],
    });

    await executeMigration(plan, disk.projectDir, disk.withMarketplace);

    expect(vi.mocked(console.log).mock.calls).toStrictEqual([
      [`  Uninstalled plugin for ${REACT}`],
      [`  Keeping global plugin for ${ZUSTAND} (migrated to project-eject)`],
      [`  Installed plugin for ${VITEST}`],
      [`  Keeping global local skill for ${VITEST} (migrated to project-plugin)`],
    ]);
  });

  it("deletes the global working copy of a skill that became a global plugin", async () => {
    await disk.seedWorkingCopy("global", ZUSTAND);
    const plan = buildMigrationPlan({
      toPlugin: [toPluginMigration(ZUSTAND, { from: "global", to: "global" })],
    });

    await executeMigration(plan, disk.projectDir, disk.withMarketplace);

    expect(await disk.hasWorkingCopy("global", ZUSTAND)).toBe(false);
  });
});
