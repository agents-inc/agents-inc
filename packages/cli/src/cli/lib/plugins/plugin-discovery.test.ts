import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import { createMockSkillDefinition } from "../__tests__/factories/skill-factories.js";

/**
 * Discovery reads the installed set off the SEAM, which is what C3 declared and did not wire.
 *
 * The mock is `lib/hosts/host-for.js` rather than Claude's two files: a spec that mocked
 * `installed_plugins.json` and `settings.json` would go on passing for a discovery path wired
 * straight to Claude, which is exactly the state it is here to stop. `createMockPluginHost` is the
 * shared spy host, so a member this module starts calling fails at the assertion rather than as a
 * TypeError from inside the code under test.
 */

// Typed against the real functions, so a definition this spec hands back that the loader could no
// longer answer — a field renamed or dropped — is a compile error rather than a green spec.
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

/** The one host every `hostAt` answer in this file is, so a spy set here is the spy called. */
const mockListPlugins = vi.mocked(hostAt("/any-root").listPlugins);

const REACT_SKILL_ID = "web-framework-react";

/** One entry as a host reports it: the two fields discovery reads, plus the switch it filters on. */
function installed(pluginKey: string, installPath: string, enabled = true) {
  return { pluginKey, installPath, enabled };
}

describe("plugin-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every path exists unless a case says otherwise: the manifest check is discovery's own and
    // is the subject of its own cases below.
    mockFileExists.mockResolvedValue(true);
  });

  describe("getVerifiedPluginInstallPaths", () => {
    it("asks the host that owns the installation under the project it was given", async () => {
      mockListPlugins.mockResolvedValue([]);

      await getVerifiedPluginInstallPaths("/my/project");

      expect(
        mockListPlugins,
        "the project is what makes the listing 'as seen from one project' — a host asked about the wrong one answers another project's switches",
      ).toHaveBeenCalledWith("/my/project");
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

    it("looks for the manifest inside the directory the host named", async () => {
      mockListPlugins.mockResolvedValue([installed("react@my-marketplace", "/cache/react")]);

      await getVerifiedPluginInstallPaths("/project");

      expect(mockFileExists).toHaveBeenCalledWith(
        path.join("/cache/react", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
      );
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

      const reactId = REACT_SKILL_ID;
      const zustandId = "web-state-zustand";

      mockLoadPluginSkills
        .mockResolvedValueOnce({
          [reactId]: createMockSkillDefinition(reactId, {
            path: "skills/web-framework-react/",
            description: "React skill",
          }),
        })
        .mockResolvedValueOnce({
          [zustandId]: createMockSkillDefinition(zustandId, {
            path: "skills/web-state-zustand/",
            description: "Zustand skill",
          }),
        });

      const result = await discoverAllPluginSkills("/project");

      expect(Object.keys(result)).toHaveLength(2);
      expect(result[reactId]).toStrictEqual({
        id: reactId,
        path: "skills/web-framework-react/",
        description: "React skill",
      });
      expect(result[zustandId]).toStrictEqual({
        id: zustandId,
        path: "skills/web-state-zustand/",
        description: "Zustand skill",
      });
      expect(mockLoadPluginSkills).toHaveBeenCalledWith("/cache/react");
      expect(mockLoadPluginSkills).toHaveBeenCalledWith("/cache/zustand");
    });

    it("should allow later plugins to override earlier ones (same skill ID)", async () => {
      mockListPlugins.mockResolvedValue([
        installed("react@marketplace-a", "/cache/react-a"),
        installed("react@marketplace-b", "/cache/react-b"),
      ]);

      const skillId = REACT_SKILL_ID;

      mockLoadPluginSkills
        .mockResolvedValueOnce({
          [skillId]: createMockSkillDefinition(skillId, {
            path: "skills/web-framework-react/",
            description: "Old description",
          }),
        })
        .mockResolvedValueOnce({
          [skillId]: createMockSkillDefinition(skillId, {
            path: "skills/web-framework-react/",
            description: "New description",
          }),
        });

      const result = await discoverAllPluginSkills("/project");

      expect(Object.keys(result)).toHaveLength(1);
      expect(result[skillId]).toStrictEqual({
        id: skillId,
        path: "skills/web-framework-react/",
        description: "New description",
      });
    });

    it("should handle loadPluginSkills errors gracefully with verbose logging", async () => {
      mockListPlugins.mockResolvedValue([
        installed("broken-plugin", "/cache/broken"),
        installed("good-plugin", "/cache/good"),
      ]);

      const skillId = REACT_SKILL_ID;

      mockLoadPluginSkills.mockRejectedValueOnce(new Error("Parse error")).mockResolvedValueOnce({
        [skillId]: createMockSkillDefinition(skillId, {
          path: "skills/web-framework-react/",
          description: "React",
        }),
      });

      const result = await discoverAllPluginSkills("/project");

      // Should still have the good plugin's skills
      expect(Object.keys(result)).toHaveLength(1);
      expect(result[skillId]).toStrictEqual({
        id: skillId,
        path: "skills/web-framework-react/",
        description: "React",
      });
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

    it("should pass projectDir to the host", async () => {
      mockListPlugins.mockResolvedValue([]);

      await discoverAllPluginSkills("/my/project");

      expect(mockListPlugins).toHaveBeenCalledWith("/my/project");
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

    it("should pass projectDir to the host", async () => {
      mockListPlugins.mockResolvedValue([]);

      await listPluginNames("/custom/project");

      expect(mockListPlugins).toHaveBeenCalledWith("/custom/project");
    });
  });
});
