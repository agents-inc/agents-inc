import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import {
  getEnabledPluginKeys,
  getInstalledPluginsRegistryPath,
  listPluginInstallsForProject,
  listRegisteredPluginInstalls,
} from "./plugin-settings";
import { CLAUDE_DIR } from "../../consts";
import {
  buildLocalPluginInstallation,
  buildProjectPluginInstallation,
  buildUserPluginInstallation,
  renderEnabledPluginsSettings,
  renderInstalledPluginsRegistry,
} from "../__tests__/factories/plugin-registry-factories.js";

const { mockFileExists, mockReadFileSafe } = vi.hoisted(() => ({
  mockFileExists: vi.fn<typeof import("../../utils/fs").fileExists>(),
  mockReadFileSafe: vi.fn<typeof import("../../utils/fs").readFileSafe>(),
}));

vi.mock("../../utils/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/fs")>()),
  fileExists: mockFileExists,
  readFileSafe: mockReadFileSafe,
}));

vi.mock("../../utils/logger");

import { verbose } from "../../utils/logger";

describe("plugin-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEnabledPluginKeys", () => {
    it("should return empty array when settings.json does not exist", async () => {
      mockFileExists.mockResolvedValue(false);

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([]);
      expect(mockFileExists).toHaveBeenCalledWith(
        path.join("/project", CLAUDE_DIR, "settings.json"),
      );
    });

    it("should return enabled plugin keys from settings.json", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(
        renderEnabledPluginsSettings({
          "web-framework-react@my-marketplace": true,
          "web-state-zustand@my-marketplace": true,
        }),
      );

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([
        "web-framework-react@my-marketplace",
        "web-state-zustand@my-marketplace",
      ]);
    });

    it("should filter out disabled plugins", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(
        renderEnabledPluginsSettings({
          "web-framework-react@my-marketplace": true,
          "web-state-zustand@my-marketplace": false,
          "api-framework-hono@my-marketplace": true,
        }),
      );

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([
        "web-framework-react@my-marketplace",
        "api-framework-hono@my-marketplace",
      ]);
    });

    it("should return empty array when enabledPlugins is missing", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(JSON.stringify({}));

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([]);
    });

    it("should return empty array when enabledPlugins is empty", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(renderEnabledPluginsSettings({}));

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([]);
    });

    it("should enforce strict equality check (=== true)", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(
        renderEnabledPluginsSettings({
          "web-framework-react@my-marketplace": true,
          "web-state-zustand@my-marketplace": 1, // truthy but not true
          "api-framework-hono@my-marketplace": "yes", // truthy but not true
        }),
      );

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual(["web-framework-react@my-marketplace"]);
    });

    it("should return empty array when JSON parsing fails", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue("invalid json");

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([]);
    });

    it("should return empty array when file reading fails", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockRejectedValue(new Error("Read error"));

      const result = await getEnabledPluginKeys("/project");

      expect(result).toStrictEqual([]);
    });
  });

  describe("listPluginInstallsForProject", () => {
    const PLUGINS_DIR = "/plugins-dir";
    const REACT = "web-framework-react@my-marketplace";
    const ZUSTAND = "web-state-zustand@my-marketplace";

    it("resolves a project-scoped installation recorded against this project", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [REACT]: [
            buildProjectPluginInstallation("/cache/project/web-framework-react/1.0.0", "/project"),
          ],
        }),
      );

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "a record filed under this project is the one this project reads its skills out of",
      ).toStrictEqual([
        { pluginKey: REACT, installPath: "/cache/project/web-framework-react/1.0.0" },
      ]);
    });

    it("falls back to the user-scoped installation when this project has none", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [REACT]: [buildUserPluginInstallation("/cache/user/web-framework-react/1.0.0")],
        }),
      );

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "a globally installed plugin is reachable from every project, so a project with no record of its own still has it",
      ).toStrictEqual([{ pluginKey: REACT, installPath: "/cache/user/web-framework-react/1.0.0" }]);
    });

    it("prefers this project's own record over the user-scoped one", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [REACT]: [
            buildUserPluginInstallation("/cache/user/web-framework-react/1.0.0"),
            buildProjectPluginInstallation("/cache/project/web-framework-react/1.0.0", "/project"),
          ],
        }),
      );

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "answering both would load one plugin's skills twice and let the user-scoped version win by merge order",
      ).toStrictEqual([
        { pluginKey: REACT, installPath: "/cache/project/web-framework-react/1.0.0" },
      ]);
    });

    it("drops a key recorded only under a DIFFERENT project", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [REACT]: [
            buildProjectPluginInstallation(
              "/cache/somewhere-else/web-framework-react/1.0.0",
              "/somewhere-else",
            ),
          ],
        }),
      );

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "this is the whole difference from listRegisteredPluginInstalls: another project's install path is not this project's plugin",
      ).toStrictEqual([]);
    });

    it("answers every key it can resolve, not only the first", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [REACT]: [buildProjectPluginInstallation("/cache/web-framework-react/1.0.0", "/project")],
          [ZUSTAND]: [buildUserPluginInstallation("/cache/web-state-zustand/1.0.0")],
        }),
      );

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "the two scopes resolve through different arms, so a listing that answered one of them would still look right",
      ).toStrictEqual([
        { pluginKey: REACT, installPath: "/cache/web-framework-react/1.0.0" },
        { pluginKey: ZUSTAND, installPath: "/cache/web-state-zustand/1.0.0" },
      ]);
    });

    it("drops a key whose installations array is empty", async () => {
      mockReadFileSafe.mockResolvedValue(renderInstalledPluginsRegistry({ [REACT]: [] }));

      expect(
        await listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "a key with no installation recorded at all names no directory to read",
      ).toStrictEqual([]);
    });

    it("reads the registry from <pluginsDir>/installed_plugins.json", async () => {
      mockReadFileSafe.mockResolvedValue(renderInstalledPluginsRegistry({}));

      await listPluginInstallsForProject(PLUGINS_DIR, "/project");

      expect(
        mockReadFileSafe,
        "the directory is the caller's, so a listing that reached for the user's own tree could not be pointed at a pinned installation",
      ).toHaveBeenCalledWith(path.join(PLUGINS_DIR, "installed_plugins.json"), expect.any(Number));
    });

    it("throws for a registry that is there and cannot be parsed", async () => {
      mockReadFileSafe.mockResolvedValue("invalid json");

      await expect(
        listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "answering an empty listing for a corrupt registry reports every installed plugin as missing, in the words of whichever row asked",
      ).rejects.toThrow();
    });

    it("throws for a registry whose shape the schema refuses", async () => {
      mockReadFileSafe.mockResolvedValue(JSON.stringify({ version: "two", plugins: {} }));

      await expect(
        listPluginInstallsForProject(PLUGINS_DIR, "/project"),
        "its sibling throws for the same file, and two readers of one registry disagreeing about a failure is worse than either answer",
      ).rejects.toThrow(`Invalid installed_plugins.json`);
    });
  });

  describe("listRegisteredPluginInstalls", () => {
    it("should read the registry from <pluginsDir>/installed_plugins.json", async () => {
      mockReadFileSafe.mockResolvedValue(renderInstalledPluginsRegistry({}));

      const result = await listRegisteredPluginInstalls("/plugins-dir");

      expect(result).toStrictEqual([]);
      expect(mockReadFileSafe).toHaveBeenCalledWith(
        getInstalledPluginsRegistryPath("/plugins-dir"),
        expect.any(Number),
      );
    });

    it("should flatten install records across plugins into (pluginKey, installPath) pairs", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          "web-framework-react@my-marketplace": [
            buildUserPluginInstallation("/cache/my-marketplace/web-framework-react/1.0.0"),
          ],
          "web-state-zustand@my-marketplace": [
            buildUserPluginInstallation("/cache/my-marketplace/web-state-zustand/1.0.0"),
          ],
        }),
      );

      const result = await listRegisteredPluginInstalls("/plugins-dir");

      expect(result).toStrictEqual([
        {
          pluginKey: "web-framework-react@my-marketplace",
          installPath: "/cache/my-marketplace/web-framework-react/1.0.0",
        },
        {
          pluginKey: "web-state-zustand@my-marketplace",
          installPath: "/cache/my-marketplace/web-state-zustand/1.0.0",
        },
      ]);
    });

    it("should list every distinct installPath of a plugin with multiple installations", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          "web-framework-react@my-marketplace": [
            buildUserPluginInstallation("/cache/my-marketplace/web-framework-react/1.0.0"),
            buildProjectPluginInstallation(
              "/cache/my-marketplace/web-framework-react/2.0.0",
              "/project",
              { version: "2.0.0", installedAt: "2024-01-02" },
            ),
          ],
        }),
      );

      const result = await listRegisteredPluginInstalls("/plugins-dir");

      expect(result).toStrictEqual([
        {
          pluginKey: "web-framework-react@my-marketplace",
          installPath: "/cache/my-marketplace/web-framework-react/1.0.0",
        },
        {
          pluginKey: "web-framework-react@my-marketplace",
          installPath: "/cache/my-marketplace/web-framework-react/2.0.0",
        },
      ]);
    });

    it("should deduplicate installations sharing the same installPath", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          // Records differ in every field but the path, so only a path-keyed dedupe collapses them.
          "web-framework-react@my-marketplace": [
            buildUserPluginInstallation("/cache/my-marketplace/web-framework-react/1.0.0", {
              version: "1.0.0",
              installedAt: "2024-01-01",
            }),
            buildProjectPluginInstallation(
              "/cache/my-marketplace/web-framework-react/1.0.0",
              "/project",
              { version: "2.0.0", installedAt: "2024-01-02" },
            ),
          ],
        }),
      );

      const result = await listRegisteredPluginInstalls("/plugins-dir");

      expect(result).toStrictEqual([
        {
          pluginKey: "web-framework-react@my-marketplace",
          installPath: "/cache/my-marketplace/web-framework-react/1.0.0",
        },
      ]);
    });

    it("should throw when the registry is not valid JSON", async () => {
      mockReadFileSafe.mockResolvedValue("{ not valid json !!!");

      await expect(listRegisteredPluginInstalls("/plugins-dir")).rejects.toThrow();
    });

    it("should throw when the registry fails schema validation", async () => {
      mockReadFileSafe.mockResolvedValue(JSON.stringify({ plugins: "not-a-record" }));

      await expect(listRegisteredPluginInstalls("/plugins-dir")).rejects.toThrow(
        /Invalid installed_plugins\.json/,
      );
    });

    it("should refuse a project-scoped record that names no project", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          "web-framework-react@my-marketplace": [
            // Inline: no builder produces a project-scoped record without `projectPath`.
            {
              scope: "project",
              installPath: "/cache/my-marketplace/web-framework-react/1.0.0",
              version: "1.0.0",
              installedAt: "2024-01-01",
            },
          ],
        }),
      );

      await expect(listRegisteredPluginInstalls("/plugins-dir")).rejects.toThrow(
        /Invalid installed_plugins\.json/,
      );
    });

    it("should throw when reading the registry fails", async () => {
      mockReadFileSafe.mockRejectedValue(new Error("Read error"));

      await expect(listRegisteredPluginInstalls("/plugins-dir")).rejects.toThrow("Read error");
    });
  });

  describe("what reading the settings says", () => {
    const SETTINGS_PATH = path.join("/project", CLAUDE_DIR, "settings.json");
    const PLUGIN_KEY = "web-framework-react@my-marketplace";

    it("says there is no settings.json, and reads nothing", async () => {
      mockFileExists.mockResolvedValue(false);

      await getEnabledPluginKeys("/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        `No settings.json found at '${SETTINGS_PATH}'`,
      );
      expect(mockReadFileSafe).not.toHaveBeenCalled();
    });

    it("says how many plugins settings.json enables", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(renderEnabledPluginsSettings({ [PLUGIN_KEY]: true }));

      await getEnabledPluginKeys("/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith("Found 1 enabled plugins in settings.json");
    });

    it("says settings.json enables no plugins at all", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(JSON.stringify({ model: "opus" }));

      await getEnabledPluginKeys("/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        `No enabledPlugins found in '${SETTINGS_PATH}'`,
      );
    });

    it("answers no keys and says why for a settings.json of the wrong shape", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue(JSON.stringify({ enabledPlugins: "all of them" }));

      expect(await getEnabledPluginKeys("/project")).toStrictEqual([]);
      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^Invalid settings\.json structure: /),
      );
    });

    it("says why it could not read settings.json", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFileSafe.mockResolvedValue("{ not json");

      await getEnabledPluginKeys("/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^Failed to read settings\.json: /),
      );
    });

    it("says which plugin has no installation belonging to the project", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [PLUGIN_KEY]: [
            buildProjectPluginInstallation("/cache/elsewhere/react/1.0.0", "/somewhere-else"),
          ],
        }),
      );

      await listPluginInstallsForProject("/plugins-dir", "/project");

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        `No installation of '${PLUGIN_KEY}' belongs to '/project'`,
      );
    });

    it("reads a record installed at local scope", async () => {
      mockReadFileSafe.mockResolvedValue(
        renderInstalledPluginsRegistry({
          [PLUGIN_KEY]: [buildLocalPluginInstallation("/cache/local/react/1.0.0")],
        }),
      );

      expect(await listRegisteredPluginInstalls("/plugins-dir")).toStrictEqual([
        { pluginKey: PLUGIN_KEY, installPath: "/cache/local/react/1.0.0" },
      ]);
    });

    it("names every problem in a registry the schema refuses", async () => {
      mockReadFileSafe.mockResolvedValue(JSON.stringify({ version: "two", plugins: "none" }));

      await expect(listRegisteredPluginInstalls("/plugins-dir")).rejects.toThrow(
        "Invalid installed_plugins.json: version: Invalid input: expected number, received string; plugins: Invalid input: expected record, received string",
      );
    });
  });
});
