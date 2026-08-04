import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock fns are available when vi.mock factories run (hoisted to top)
const { mockLoadPluginSkills, mockGetVerifiedPluginInstallPaths } = vi.hoisted(() => ({
  mockLoadPluginSkills: vi.fn(),
  mockGetVerifiedPluginInstallPaths: vi.fn(),
}));

vi.mock("../loading", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading")>()),
  loadPluginSkills: mockLoadPluginSkills,
}));

vi.mock("./plugin-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plugin-settings")>()),
  getVerifiedPluginInstallPaths: mockGetVerifiedPluginInstallPaths,
}));

import { discoverAllPluginSkills, hasIndividualPlugins, listPluginNames } from "./plugin-discovery";

describe("plugin-discovery", () => {
  const REACT_SKILL_ID = "web-framework-react";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("discoverAllPluginSkills", () => {
    it("should return empty map when no plugins are enabled", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      const result = await discoverAllPluginSkills("/project");

      expect(result).toStrictEqual({});
    });

    it("should discover skills from verified plugin paths", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "react@my-marketplace", installPath: "/cache/react" },
        { pluginKey: "zustand@my-marketplace", installPath: "/cache/zustand" },
      ]);

      const reactId = REACT_SKILL_ID;
      const zustandId = "web-state-zustand";

      mockLoadPluginSkills
        .mockResolvedValueOnce({
          [reactId]: {
            id: reactId,
            path: "skills/web-framework-react/",
            description: "React skill",
          },
        })
        .mockResolvedValueOnce({
          [zustandId]: {
            id: zustandId,
            path: "skills/web-state-zustand/",
            description: "Zustand skill",
          },
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
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "react@marketplace-a", installPath: "/cache/react-a" },
        { pluginKey: "react@marketplace-b", installPath: "/cache/react-b" },
      ]);

      const skillId = REACT_SKILL_ID;

      mockLoadPluginSkills
        .mockResolvedValueOnce({
          [skillId]: {
            id: skillId,
            path: "skills/web-framework-react/",
            description: "Old description",
          },
        })
        .mockResolvedValueOnce({
          [skillId]: {
            id: skillId,
            path: "skills/web-framework-react/",
            description: "New description",
          },
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
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "broken-plugin", installPath: "/cache/broken" },
        { pluginKey: "good-plugin", installPath: "/cache/good" },
      ]);

      const skillId = REACT_SKILL_ID;

      mockLoadPluginSkills.mockRejectedValueOnce(new Error("Parse error")).mockResolvedValueOnce({
        [skillId]: {
          id: skillId,
          path: "skills/web-framework-react/",
          description: "React",
        },
      });

      const result = await discoverAllPluginSkills("/project");

      // Should still have the good plugin's skills
      expect(Object.keys(result)).toHaveLength(1);
      expect(result[skillId]).toStrictEqual({
        id: skillId,
        path: "skills/web-framework-react/",
        description: "React",
      });
    });

    it("should handle getVerifiedPluginInstallPaths errors gracefully", async () => {
      mockGetVerifiedPluginInstallPaths.mockRejectedValue(new Error("Unexpected error"));

      const result = await discoverAllPluginSkills("/project");

      expect(result).toStrictEqual({});
    });

    it("should pass projectDir to getVerifiedPluginInstallPaths", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      await discoverAllPluginSkills("/my/project");

      expect(mockGetVerifiedPluginInstallPaths).toHaveBeenCalledWith("/my/project");
    });
  });

  describe("hasIndividualPlugins", () => {
    it("should return false when no plugins are verified", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      const result = await hasIndividualPlugins("/project");

      expect(result).toBe(false);
    });

    it("should return true when verified plugins exist", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "react@my-marketplace", installPath: "/cache/react" },
      ]);

      const result = await hasIndividualPlugins("/project");

      expect(result).toBe(true);
    });

    it("should return true with multiple verified plugins", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "react@my-marketplace", installPath: "/cache/react" },
        { pluginKey: "zustand@my-marketplace", installPath: "/cache/zustand" },
      ]);

      const result = await hasIndividualPlugins("/project");

      expect(result).toBe(true);
    });

    it("should return false when getVerifiedPluginInstallPaths throws", async () => {
      mockGetVerifiedPluginInstallPaths.mockRejectedValue(new Error("Unexpected error"));

      const result = await hasIndividualPlugins("/project");

      expect(result).toBe(false);
    });

    it("should pass projectDir to getVerifiedPluginInstallPaths", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      await hasIndividualPlugins("/my/project");

      expect(mockGetVerifiedPluginInstallPaths).toHaveBeenCalledWith("/my/project");
    });
  });

  describe("listPluginNames", () => {
    it("should return empty array when no plugins are verified", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual([]);
    });

    it("should return all verified plugin keys", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([
        { pluginKey: "react@my-marketplace", installPath: "/cache/react" },
        { pluginKey: "zustand@my-marketplace", installPath: "/cache/zustand" },
      ]);

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual(["react@my-marketplace", "zustand@my-marketplace"]);
    });

    it("should return empty array when getVerifiedPluginInstallPaths throws", async () => {
      mockGetVerifiedPluginInstallPaths.mockRejectedValue(new Error("Unexpected error"));

      const result = await listPluginNames("/project");

      expect(result).toStrictEqual([]);
    });

    it("should pass projectDir to getVerifiedPluginInstallPaths", async () => {
      mockGetVerifiedPluginInstallPaths.mockResolvedValue([]);

      await listPluginNames("/custom/project");

      expect(mockGetVerifiedPluginInstallPaths).toHaveBeenCalledWith("/custom/project");
    });
  });
});
