import { describe, it, expect, vi } from "vitest";
import path from "path";
import os from "os";
import {
  getUserPluginsDir,
  getCollectivePluginDir,
  getProjectPluginsDir,
  getPluginSkillsDir,
  getPluginAgentsDir,
  getPluginManifestPath,
  readPluginManifest,
  getPluginSkillIds,
} from "./plugin-finder";
import type { PluginManifest } from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import {
  CLAUDE_DIR,
  DEFAULT_PLUGIN_NAME,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_SUBDIR,
} from "../../consts";
import {
  EMPTY_MATRIX,
  SINGLE_REACT_MATRIX,
  REACT_ZUSTAND_HONO_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import { renderSkillMd } from "../__tests__/content-generators";

vi.mock("../../utils/fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/fs")>();
  return {
    ...original,
    fileExists: vi.fn(),
    readFile: vi.fn(),
    readFileSafe: vi.fn(),
    glob: vi.fn(),
  };
});

import { fileExists, readFile, readFileSafe, glob } from "../../utils/fs";

const mockedFileExists = vi.mocked(fileExists);
const mockedReadFile = vi.mocked(readFile);
const mockedReadFileSafe = vi.mocked(readFileSafe);
const mockedGlob = vi.mocked(glob);

const TEST_PLUGIN_SKILLS_PATH = "/plugin/skills";

describe("plugin-finder", () => {
  describe("getUserPluginsDir", () => {
    it("should return path under user home directory", () => {
      const result = getUserPluginsDir();

      expect(result).toBe(path.join(os.homedir(), CLAUDE_DIR, PLUGINS_SUBDIR));
    });
  });

  describe("getCollectivePluginDir", () => {
    it("should return path under provided project directory", () => {
      const result = getCollectivePluginDir("/my/project");

      expect(result).toBe(
        path.join("/my/project", CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME),
      );
    });

    it("should default to process.cwd() when no projectDir is provided", () => {
      const result = getCollectivePluginDir();

      expect(result).toBe(
        path.join(process.cwd(), CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME),
      );
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

  describe("getPluginSkillsDir", () => {
    it("should return skills subdirectory of plugin directory", () => {
      const result = getPluginSkillsDir("/path/to/plugin");

      expect(result).toBe(path.join("/path/to/plugin", "skills"));
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

  describe("getPluginSkillIds", () => {
    it("should return empty array when no SKILL.md files exist", async () => {
      initializeMatrix(EMPTY_MATRIX);
      mockedGlob.mockResolvedValue([]);

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should match skill by frontmatter name as direct skill ID", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["web-framework-react/SKILL.md"]);

      mockedReadFile.mockResolvedValue(
        renderSkillMd("web-framework-react", "React skill", "Content"),
      );

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual(["web-framework-react"]);
    });

    it("should skip skill when frontmatter name does not match any matrix skill ID", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["react/SKILL.md"]);

      mockedReadFile.mockResolvedValue(`---\nname: React\ndescription: React skill\n---\nContent`);

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should skip skill when frontmatter has no name", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["web-framework-react/SKILL.md"]);

      mockedReadFile.mockResolvedValue("# React\n\nA skill for React development.");

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should match skill by directory name using last part of ID", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["subdir/SKILL.md"]);

      mockedReadFile.mockResolvedValue("# No frontmatter match");

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should handle multiple SKILL.md files", async () => {
      initializeMatrix(REACT_ZUSTAND_HONO_MATRIX);
      mockedGlob.mockResolvedValue([
        "web-framework-react/SKILL.md",
        "web-state-zustand/SKILL.md",
        "api-framework-hono/SKILL.md",
      ]);

      mockedReadFile.mockImplementation((filePath) => {
        if (filePath.includes("react")) {
          return Promise.resolve(renderSkillMd("web-framework-react", "React", "Content"));
        }
        if (filePath.includes("zustand")) {
          return Promise.resolve(renderSkillMd("web-state-zustand", "Zustand", "Content"));
        }
        if (filePath.includes("hono")) {
          return Promise.resolve(renderSkillMd("api-framework-hono", "Hono", "Content"));
        }
        return Promise.resolve("");
      });

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toHaveLength(3);
      expect(result).toContain("web-framework-react");
      expect(result).toContain("web-state-zustand");
      expect(result).toContain("api-framework-hono");
    });

    it("should skip skills with no matching frontmatter name and no matching directory", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["unknown-skill/SKILL.md"]);

      mockedReadFile.mockResolvedValue(
        renderSkillMd("something-totally-different", "Test", "Content"),
      );

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should not match skill by case-insensitive name (exact ID required)", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["react/SKILL.md"]);

      mockedReadFile.mockResolvedValue("---\nname: react\ndescription: React\n---\nContent");

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should skip skill with no frontmatter regardless of directory name", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["Web-Framework-React/SKILL.md"]);

      mockedReadFile.mockResolvedValue("# No frontmatter");

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });

    it("should handle frontmatter with quoted name values", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["react/SKILL.md"]);

      mockedReadFile.mockResolvedValue(
        "---\nname: 'web-framework-react'\ndescription: React\n---\nContent",
      );

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual(["web-framework-react"]);
    });

    it("should handle frontmatter with double-quoted name values", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["react/SKILL.md"]);

      mockedReadFile.mockResolvedValue(
        '---\nname: "web-framework-react"\ndescription: React\n---\nContent',
      );

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual(["web-framework-react"]);
    });

    it("should skip nested directory when frontmatter is missing", async () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      mockedGlob.mockResolvedValue(["framework/web-framework-react/SKILL.md"]);

      mockedReadFile.mockResolvedValue("# No frontmatter");

      const result = await getPluginSkillIds(TEST_PLUGIN_SKILLS_PATH);

      expect(result).toStrictEqual([]);
    });
  });
});
