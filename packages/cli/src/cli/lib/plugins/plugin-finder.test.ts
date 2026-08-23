import { describe, it, expect, vi } from "vitest";
import path from "path";
import os from "os";
import {
  getUserPluginsDir,
  getProjectPluginsDir,
  getPluginAgentsDir,
  getPluginManifestPath,
  readPluginManifest,
} from "./plugin-finder";
import type { PluginManifest } from "../../types";
import {
  CLAUDE_DIR,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_SUBDIR,
} from "../../consts";

vi.mock("../../utils/fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/fs")>();
  return {
    ...original,
    fileExists: vi.fn(),
    readFileSafe: vi.fn(),
  };
});

import { fileExists, readFileSafe } from "../../utils/fs";

const mockedFileExists = vi.mocked(fileExists);
const mockedReadFileSafe = vi.mocked(readFileSafe);

describe("plugin-finder", () => {
  describe("getUserPluginsDir", () => {
    it("should return path under user home directory", () => {
      const result = getUserPluginsDir();

      expect(result).toBe(path.join(os.homedir(), CLAUDE_DIR, PLUGINS_SUBDIR));
    });
  });

  describe("getProjectPluginsDir", () => {
    it("should return plugins directory under provided project directory", () => {
      const result = getProjectPluginsDir("/my/project");

      expect(result).toBe(path.join("/my/project", CLAUDE_DIR, PLUGINS_SUBDIR));
    });

    it("should default to process.cwd() when no projectDir is provided", () => {
      const result = getProjectPluginsDir();

      expect(result).toBe(path.join(process.cwd(), CLAUDE_DIR, PLUGINS_SUBDIR));
    });
  });

  describe("getPluginAgentsDir", () => {
    it("should return agents subdirectory of plugin directory", () => {
      const result = getPluginAgentsDir("/path/to/plugin");

      expect(result).toBe(path.join("/path/to/plugin", "agents"));
    });
  });

  describe("getPluginManifestPath", () => {
    it("should return manifest path within .claude-plugin directory", () => {
      const result = getPluginManifestPath("/path/to/plugin");

      expect(result).toBe(path.join("/path/to/plugin", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE));
    });

    it("should handle paths with trailing slash", () => {
      const result = getPluginManifestPath("/some/output/dir/");

      expect(result).toBe("/some/output/dir/.claude-plugin/plugin.json");
    });

    it("should handle relative paths", () => {
      const result = getPluginManifestPath("dist/plugins");

      expect(result).toBe(path.join("dist/plugins", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE));
    });
  });

  describe("readPluginManifest", () => {
    it("should return null when manifest file does not exist", async () => {
      mockedFileExists.mockResolvedValue(false);

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("should return parsed manifest for valid JSON", async () => {
      const manifest: PluginManifest = {
        name: "my-plugin",
        version: "1.0.0",
        description: "A test plugin",
        skills: "./skills/",
      };

      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify(manifest));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toStrictEqual({
        name: "my-plugin",
        version: "1.0.0",
        description: "A test plugin",
        skills: "./skills/",
      });
    });

    it("should return null for invalid JSON", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue("not valid json {{{");

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("should return null when manifest has empty name", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify({ name: "", version: "1.0.0" }));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("should return null when manifest has no name field", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify({ version: "1.0.0" }));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("should return manifest with optional fields missing", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(
        JSON.stringify({ name: "minimal-plugin", category: "web-testing" }),
      );

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("minimal-plugin");
      expect(result!.version).toBeUndefined();
      expect(result!.description).toBeUndefined();
    });

    it("should return null when readFile throws", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockRejectedValue(new Error("EACCES permission denied"));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("when manifest name field is a number instead of string, should return null", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify({ name: 123, version: "1.0.0" }));

      const result = await readPluginManifest("/path/to/plugin");

      // Zod schema may coerce or fail; the name check verifies it's not a valid string
      expect(result).toBeNull();
    });

    it("when manifest JSON is an array instead of object, should return null", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify([{ name: "plugin" }]));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).toBeNull();
    });

    it("should handle manifest with author, keywords, and other fields", async () => {
      const manifest: PluginManifest = {
        name: "full-plugin",
        version: "2.0.0",
        description: "Full featured plugin",
        author: { name: "@vince", email: "vince@example.com" },
        keywords: ["web", "react"],
        skills: "./skills/",
        agents: "./agents/",
      };

      mockedFileExists.mockResolvedValue(true);
      mockedReadFileSafe.mockResolvedValue(JSON.stringify(manifest));

      const result = await readPluginManifest("/path/to/plugin");

      expect(result).not.toBeNull();
      expect(result!.author).toStrictEqual({ name: "@vince", email: "vince@example.com" });
      expect(result!.keywords).toStrictEqual(["web", "react"]);
      expect(result!.skills).toBe("./skills/");
      expect(result!.agents).toBe("./agents/");
    });
  });
});
