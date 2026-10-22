import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import { createMockSkillDefinition } from "../__tests__/factories/skill-factories.js";
import type { SkillDefinitionMap } from "../../types";

// Mocks the host seam, not Claude's files, so a discovery path wired straight to Claude fails.
const { mockLoadPluginSkills, mockFileExists } = vi.hoisted(() => ({
  mockLoadPluginSkills: vi.fn<typeof import("../loading").loadPluginSkills>(),
  mockFileExists: vi.fn<typeof import("../../utils/fs").fileExists>(),
}));

vi.mock("../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

vi.mock("../loading", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading")>()),
  loadPluginSkills: mockLoadPluginSkills,
}));

vi.mock("../../utils/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/fs")>()),
  fileExists: mockFileExists,
}));

vi.mock("../../utils/logger");

import { hostAt } from "../hosts/host-for.js";
import { verbose } from "../../utils/logger";
import {
  discoverAllPluginSkills,
  getVerifiedPluginInstallPaths,
  listPluginNames,
} from "./plugin-discovery";

const mockListPlugins = vi.mocked(hostAt("/any-root").listPlugins);

const REACT_SKILL_ID = "web-framework-react";
const ZUSTAND_SKILL_ID = "web-state-zustand";

const REACT_MANIFEST = path.join("/cache/react", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);

function installed(pluginKey: string, installPath: string, enabled = true) {
  return { pluginKey, installPath, enabled };
}

/** The host answers per project, so an answer names the project it was asked about. */
function hostListsPerProject(byProject: Record<string, ReturnType<typeof installed>[]>): void {
  mockListPlugins.mockImplementation((projectDir) => Promise.resolve(byProject[projectDir] ?? []));
}

/** Each plugin directory holds its own skills, so a result names the directories that were read. */
function pluginDirsHold(byDir: Record<string, SkillDefinitionMap | Error>): void {
  mockLoadPluginSkills.mockImplementation((dir) => {
    const held = byDir[dir];
    return held instanceof Error ? Promise.reject(held) : Promise.resolve(held ?? {});
  });
}

describe("plugin-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileExists.mockResolvedValue(true);
    mockLoadPluginSkills.mockResolvedValue({});
  });

  describe("getVerifiedPluginInstallPaths", () => {
    it("answers with the plugins the host lists for the project it was given", async () => {
      hostListsPerProject({
        "/my/project": [installed("react@my-marketplace", "/cache/react")],
        "/other/project": [installed("zustand@my-marketplace", "/cache/zustand")],
      });

      expect(
        await getVerifiedPluginInstallPaths("/my/project"),
        "the project is what makes the listing 'as seen from one project' — a host asked about the wrong one answers another project's switches",
      ).toStrictEqual([{ pluginKey: "react@my-marketplace", installPath: "/cache/react" }]);
    });

    it("keeps only the plugins the host reports as enabled", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@my-marketplace", "/cache/react"),
        installed("zustand@my-marketplace", "/cache/zustand", false),
      ]);

      expect(
        await getVerifiedPluginInstallPaths("/project"),
        "a disabled plugin is installed and switched off, and loading its skills would put them in front of a model that was told not to have them",
      ).toStrictEqual([{ pluginKey: "react@my-marketplace", installPath: "/cache/react" }]);
    });

    it("drops a plugin whose recorded directory holds no manifest", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@my-marketplace", "/cache/react"),
        installed("zustand@my-marketplace", "/cache/zustand"),
      ]);
      mockFileExists.mockImplementation((file: string) =>
        Promise.resolve(file.startsWith("/cache/react")),
      );

      expect(
        await getVerifiedPluginInstallPaths("/project"),
        "a registry can outlive the cache directory it names, and the filesystem is the half no host answers",
      ).toStrictEqual([{ pluginKey: "react@my-marketplace", installPath: "/cache/react" }]);
    });

    it("keeps a plugin whose manifest sits inside the directory the host named", async () => {
      mockListPlugins.mockResolvedValue([installed("react@my-marketplace", "/cache/react")]);
      mockFileExists.mockImplementation((file: string) => Promise.resolve(file === REACT_MANIFEST));

      expect(await getVerifiedPluginInstallPaths("/project")).toStrictEqual([
        { pluginKey: "react@my-marketplace", installPath: "/cache/react" },
      ]);
    });

    it("answers an empty listing when the host cannot read its installation", async () => {
      mockListPlugins.mockRejectedValue(new Error("Invalid installed_plugins.json"));

      expect(
        await getVerifiedPluginInstallPaths("/project"),
        "doctor reads this to name missing skills, so a registry it cannot parse must be that row's finding rather than an aborted check",
      ).toStrictEqual([]);
    });
  });

  describe("discoverAllPluginSkills", () => {
    it("should return empty map when no plugins are enabled", async () => {
      mockListPlugins.mockResolvedValue([]);

      const result = await discoverAllPluginSkills("/project");

      expect(result).toStrictEqual({});
    });

    it("should discover skills from verified plugin paths", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@my-marketplace", "/cache/react"),
        installed("zustand@my-marketplace", "/cache/zustand"),
      ]);
      const react = createMockSkillDefinition(REACT_SKILL_ID, {
        path: "skills/web-framework-react/",
        description: "React skill",
      });
      const zustand = createMockSkillDefinition(ZUSTAND_SKILL_ID, {
        path: "skills/web-state-zustand/",
        description: "Zustand skill",
      });
      pluginDirsHold({
        "/cache/react": { [REACT_SKILL_ID]: react },
        "/cache/zustand": { [ZUSTAND_SKILL_ID]: zustand },
      });

      expect(await discoverAllPluginSkills("/project")).toStrictEqual({
        [REACT_SKILL_ID]: react,
        [ZUSTAND_SKILL_ID]: zustand,
      });
    });

    it("should allow later plugins to override earlier ones (same skill ID)", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@marketplace-a", "/cache/react-a"),
        installed("react@marketplace-b", "/cache/react-b"),
      ]);
      const later = createMockSkillDefinition(REACT_SKILL_ID, {
        path: "skills/web-framework-react/",
        description: "New description",
      });
      pluginDirsHold({
        "/cache/react-a": {
          [REACT_SKILL_ID]: createMockSkillDefinition(REACT_SKILL_ID, {
            path: "skills/web-framework-react/",
            description: "Old description",
          }),
        },
        "/cache/react-b": { [REACT_SKILL_ID]: later },
      });

      expect(await discoverAllPluginSkills("/project")).toStrictEqual({ [REACT_SKILL_ID]: later });
    });

    it("should handle loadPluginSkills errors gracefully with verbose logging", async () => {
      mockListPlugins.mockResolvedValue([
        installed("broken-plugin", "/cache/broken"),
        installed("good-plugin", "/cache/good"),
      ]);
      const react = createMockSkillDefinition(REACT_SKILL_ID, {
        path: "skills/web-framework-react/",
        description: "React",
      });
      pluginDirsHold({
        "/cache/broken": new Error("Parse error"),
        "/cache/good": { [REACT_SKILL_ID]: react },
      });

      expect(await discoverAllPluginSkills("/project")).toStrictEqual({ [REACT_SKILL_ID]: react });
      expect(
        vi.mocked(verbose),
        "the spec is named for the verbose line, so it has to be the thing that says one was written",
      ).toHaveBeenCalledWith("Failed to load skills from 'broken-plugin': Parse error");
    });

    it("should handle a host that cannot answer gracefully", async () => {
      mockListPlugins.mockRejectedValue(new Error("Unexpected error"));

      const result = await discoverAllPluginSkills("/project");

      expect(result).toStrictEqual({});
    });

    it("reads skills only from the plugins the host lists for the project it was given", async () => {
      hostListsPerProject({
        "/my/project": [installed("react@my-marketplace", "/cache/react")],
        "/other/project": [installed("zustand@my-marketplace", "/cache/zustand")],
      });
      const react = createMockSkillDefinition(REACT_SKILL_ID);
      pluginDirsHold({
        "/cache/react": { [REACT_SKILL_ID]: react },
        "/cache/zustand": { [ZUSTAND_SKILL_ID]: createMockSkillDefinition(ZUSTAND_SKILL_ID) },
      });

      expect(await discoverAllPluginSkills("/my/project")).toStrictEqual({
        [REACT_SKILL_ID]: react,
      });
    });
  });

  describe("listPluginNames", () => {
    it("should return empty array when no plugins are verified", async () => {
      mockListPlugins.mockResolvedValue([]);

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual([]);
    });

    it("should return all verified plugin keys", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@my-marketplace", "/cache/react"),
        installed("zustand@my-marketplace", "/cache/zustand"),
      ]);

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual(["react@my-marketplace", "zustand@my-marketplace"]);
    });

    it("should return empty array when the host cannot answer", async () => {
      mockListPlugins.mockRejectedValue(new Error("Unexpected error"));

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual([]);
    });

    it("names the plugins the host lists for the project it was given", async () => {
      hostListsPerProject({
        "/custom/project": [installed("react@my-marketplace", "/cache/react")],
        "/other/project": [installed("zustand@my-marketplace", "/cache/zustand")],
      });

      expect(await listPluginNames("/custom/project")).toStrictEqual(["react@my-marketplace"]);
    });
  });

  describe("what discovery says", () => {
    it("says how many enabled plugins it verified, and names a plugin whose manifest is gone", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@my-marketplace", "/cache/react"),
        installed("zustand@my-marketplace", "/cache/zustand"),
      ]);
      mockFileExists.mockImplementation((file: string) =>
        Promise.resolve(file.startsWith("/cache/react")),
      );

      await getVerifiedPluginInstallPaths("/project");

      expect(vi.mocked(verbose).mock.calls).toStrictEqual([
        [
          `Plugin 'zustand@my-marketplace' manifest does not exist at: '${path.join("/cache/zustand", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)}'`,
        ],
        ["Verified 1 plugin install paths"],
      ]);
    });

    it("says why it could not list the installed plugins", async () => {
      mockListPlugins.mockRejectedValue(new Error("Invalid installed_plugins.json"));

      await getVerifiedPluginInstallPaths("/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        "Failed to list installed plugins: Invalid installed_plugins.json",
      );
    });

    it("says no plugin is enabled for the project, and names each plugin it reads skills from", async () => {
      mockListPlugins.mockResolvedValue([]);
      await discoverAllPluginSkills("/project");
      expect(verbose).toHaveBeenCalledWith("No enabled plugins found for '/project'");

      vi.mocked(verbose).mockClear();
      mockListPlugins.mockResolvedValue([installed("react@my-marketplace", "/cache/react")]);
      mockLoadPluginSkills.mockResolvedValueOnce({});
      await discoverAllPluginSkills("/project");
      expect(verbose).toHaveBeenCalledWith(
        "Discovering skills from plugin: 'react@my-marketplace'",
      );
      expect(verbose).not.toHaveBeenCalledWith("No enabled plugins found for '/project'");
    });
  });
});
