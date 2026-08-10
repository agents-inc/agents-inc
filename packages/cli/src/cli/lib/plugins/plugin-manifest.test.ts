import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { readFile, stat } from "fs/promises";
import {
  generateAgentPluginManifest,
  generateSkillPluginManifest,
  writePluginManifest,
  getPluginDir,
} from "./plugin-manifest";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";

describe("plugin-manifest", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("plugin-manifest-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("generateSkillPluginManifest", () => {
    it("should generate manifest with skill name as plugin name (no prefix)", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.name).toBe("react");
    });

    it("should include skills path", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.skills).toBe("./skills/");
    });

    it("should not include agents path", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.agents).toBeUndefined();
    });

    it("should include author when provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        author: "@vince",
        authorEmail: "vince@example.com",
      });

      expect(manifest.author).toStrictEqual({
        name: "@vince",
        email: "vince@example.com",
      });
    });

    it("should include author without email when only name provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        author: "@vince",
      });

      expect(manifest.author).toStrictEqual({ name: "@vince" });
    });

    it("should include keywords when provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        keywords: ["web", "ui", "framework"],
      });

      expect(manifest.keywords).toStrictEqual(["web", "ui", "framework"]);
    });

    it("should not include keywords when empty array", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        keywords: [],
      });

      expect(manifest.keywords).toBeUndefined();
    });

    it("should include description when provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        description: "React skills for frontend development",
      });

      expect(manifest.description).toBe("React skills for frontend development");
    });

    it("should include category when provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        category: "web-framework",
      });

      expect(manifest.category).toBe("web-framework");
    });

    it("should not include category when not provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.category).toBeUndefined();
    });

    it("should use custom version when provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        version: "2.5.0",
      });

      expect(manifest.version).toBe("2.5.0");
    });

    it("should default to version 1.0.0", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.version).toBe("1.0.0");
    });

    it("should not include author when author name is not provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
        authorEmail: "orphan@example.com",
      });

      expect(manifest.author).toBeUndefined();
    });

    it("should not include description when not provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.description).toBeUndefined();
    });

    it("should not include keywords when not provided", () => {
      const manifest = generateSkillPluginManifest({
        skillName: "react",
      });

      expect(manifest.keywords).toBeUndefined();
    });
  });

  describe("generateAgentPluginManifest", () => {
    it("should generate manifest with agent- prefix", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.name).toBe("agent-web-developer");
    });

    it("should include agents path", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.agents).toBe("./agents/");
    });

    it("should not include skills path", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.skills).toBeUndefined();
    });

    it("should default to version 1.0.0", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.version).toBe("1.0.0");
    });

    it("should use custom version when provided", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
        version: "2.0.0",
      });

      expect(manifest.version).toBe("2.0.0");
    });

    it("should include description when provided", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
        description: "Agent for web development tasks",
      });

      expect(manifest.description).toBe("Agent for web development tasks");
    });

    it("should not include description when not provided", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.description).toBeUndefined();
    });

    it("should not include author field", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.author).toBeUndefined();
    });

    it("should not include keywords field", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.keywords).toBeUndefined();
    });

    it("should not include hooks field", () => {
      const manifest = generateAgentPluginManifest({
        agentName: "web-developer",
      });

      expect(manifest.hooks).toBeUndefined();
    });
  });

  describe("writePluginManifest", () => {
    it("should create .claude-plugin directory", async () => {
      const manifest = generateSkillPluginManifest({ skillName: "test" });

      await writePluginManifest(tempDir, manifest);

      const pluginDir = path.join(tempDir, PLUGIN_MANIFEST_DIR);
      const stats = await stat(pluginDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should write valid JSON", async () => {
      const manifest = generateSkillPluginManifest({
        skillName: "test",
        description: "Test skill",
      });

      await writePluginManifest(tempDir, manifest);

      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const content = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("test");
      expect(parsed.description).toBe("Test skill");
    });

    it("should overwrite existing manifest", async () => {
      const manifest1 = generateSkillPluginManifest({
        skillName: "original",
      });
      const manifest2 = generateSkillPluginManifest({
        skillName: "updated",
      });

      await writePluginManifest(tempDir, manifest1);
      await writePluginManifest(tempDir, manifest2);

      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const content = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("updated");
    });

    it("should return the manifest path", async () => {
      const manifest = generateSkillPluginManifest({ skillName: "test" });

      const result = await writePluginManifest(tempDir, manifest);

      expect(result).toBe(path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE));
    });

    it("should preserve all manifest fields in written JSON", async () => {
      const manifest = generateSkillPluginManifest({
        skillName: "fullstack",
        description: "Full-stack plugin",
        author: "@claude",
        authorEmail: "claude@example.com",
        version: "2.0.0",
        keywords: ["web", "react"],
      });

      await writePluginManifest(tempDir, manifest);

      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const content = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed).toStrictEqual({
        name: "fullstack",
        version: "2.0.0",
        skills: "./skills/",
        description: "Full-stack plugin",
        author: { name: "@claude", email: "claude@example.com" },
        keywords: ["web", "react"],
      });
    });

    it("should format JSON with 2-space indentation", async () => {
      const manifest = generateSkillPluginManifest({
        skillName: "test",
        description: "Test description",
      });

      await writePluginManifest(tempDir, manifest);

      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const content = await readFile(manifestPath, "utf-8");

      expect(content).toContain('  "name"');
      expect(content).toContain('  "description"');
    });
  });

  describe("getPluginDir", () => {
    it("should return .claude-plugin subdirectory", () => {
      const result = getPluginDir("/some/output/dir");

      expect(result).toBe("/some/output/dir/.claude-plugin");
    });

    it("should handle paths with trailing slash", () => {
      const result = getPluginDir("/some/output/dir/");

      expect(result).toBe("/some/output/dir/.claude-plugin");
    });

    it("should handle relative paths", () => {
      const result = getPluginDir("dist/plugins");

      expect(result).toBe(path.join("dist/plugins", PLUGIN_MANIFEST_DIR));
    });
  });
});
