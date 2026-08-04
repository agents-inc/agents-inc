import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import {
  compileSkillPlugin,
  compileAllSkillPlugins,
  printCompilationSummary,
  type CompiledSkillPlugin,
} from "./skill-plugin-compiler";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { writeTestSkill } from "../__tests__/helpers/disk-writers.js";
import { renderSkillMd } from "../__tests__/content-generators";
import { initializeMatrix } from "../matrix/matrix-provider";
import { computeSkillFolderHash } from "../versioning";
import {
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";

describe("skill-plugin-compiler", () => {
  let tempDir: string;
  let skillsDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("skill-compiler-test-");
    skillsDir = path.join(tempDir, STANDARD_DIRS.SKILLS);
    outputDir = path.join(tempDir, "output");
    await mkdir(skillsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    initializeMatrix(
      createMockMatrix(
        SKILLS.react,
        SKILLS.vue,
        SKILLS.zustand,
        SKILLS.pinia,
        SKILLS.scss,
        SKILLS.vitest,
        SKILLS.hono,
        SKILLS.drizzle,
      ),
    );
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("compileSkillPlugin", () => {
    it("should create plugin directory structure", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react");

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      const pluginDir = result.pluginPath;
      const stats = await stat(pluginDir);
      expect(stats.isDirectory()).toBe(true);

      const skillsSubDir = path.join(pluginDir, STANDARD_DIRS.SKILLS, "web-framework-react");
      const skillsStats = await stat(skillsSubDir);
      expect(skillsStats.isDirectory()).toBe(true);
    });

    it("should generate valid plugin.json", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-state-zustand");

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      const manifestPath = path.join(result.pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.name).toBe("web-state-zustand");
      expect(manifest.version).toBe("1.0.0");
      // contentHash and updated are no longer in manifest - stored internally
      expect(manifest.contentHash).toBeUndefined();
      expect(manifest.updated).toBeUndefined();
      expect(manifest.skills).toBe("./skills/");
    });

    it("should copy SKILL.md with frontmatter", async () => {
      const skillContent =
        "---\nname: web-styling-scss-modules\ndescription: SCSS Modules styling\ncategory: test\n---\n\n# SCSS Modules Content\n\nStyling guide.";
      const skillPath = await writeTestSkill(skillsDir, "web-styling-scss-modules", {
        skillContent,
      });

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      const copiedSkillMd = path.join(
        result.pluginPath,
        STANDARD_DIRS.SKILLS,
        "web-styling-scss-modules",
        STANDARD_FILES.SKILL_MD,
      );
      const content = await readFile(copiedSkillMd, "utf-8");

      expect(content).toContain("---");
      expect(content).toContain("name: web-styling-scss-modules");
      expect(content).toContain("description: SCSS Modules styling");
      expect(content).toContain("# SCSS Modules Content");
    });

    it("should copy examples directory when present", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-testing-vitest");

      // Create examples directory
      const examplesDir = path.join(skillPath, STANDARD_DIRS.EXAMPLES);
      await mkdir(examplesDir, { recursive: true });
      await writeFile(path.join(examplesDir, "basic.test.ts"), "// test example");

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      const copiedExamples = path.join(
        result.pluginPath,
        STANDARD_DIRS.SKILLS,
        "web-testing-vitest",
        STANDARD_DIRS.EXAMPLES,
      );
      const stats = await stat(copiedExamples);
      expect(stats.isDirectory()).toBe(true);

      const exampleContent = await readFile(path.join(copiedExamples, "basic.test.ts"), "utf-8");
      expect(exampleContent).toBe("// test example");
    });

    it("should generate README.md", async () => {
      const skillPath = await writeTestSkill(skillsDir, "api-database-drizzle");

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const content = await readFile(readmePath, "utf-8");

      expect(content).toContain("# api-database-drizzle");
      expect(content).toContain("api-database-drizzle skill");
      expect(content).toContain("## Installation");
      expect(content).toContain('"api-database-drizzle"');
    });

    it("should use custom skill name when provided", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-state-pinia");

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
        skillName: "custom-name",
      });

      expect(result.skillName).toBe("custom-name");
      expect(result.manifest.name).toBe("custom-name");
    });

    it("should throw error when SKILL.md is missing", async () => {
      const skillPath = path.join(skillsDir, "missing-skill");
      await mkdir(skillPath, { recursive: true });
      // Don't create SKILL.md

      await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(
        /is missing required SKILL\.md file/,
      );
    });

    it("should throw error when frontmatter is invalid", async () => {
      const skillPath = path.join(skillsDir, "bad-skill");
      await mkdir(skillPath, { recursive: true });
      await writeFile(path.join(skillPath, STANDARD_FILES.SKILL_MD), "# No frontmatter here");

      await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(
        /has invalid or missing YAML frontmatter/,
      );
    });

    it("should get author from metadata.yaml", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        extraMetadata: { author: "@vince" },
      });

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      // Author should come from metadata.yaml
      expect(result.manifest.author?.name).toBe("@vince");
    });

    it("should succeed without metadata.yaml", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-vue-composition-api", {
        skipMetadata: true,
      });

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      // No author when metadata.yaml doesn't exist
      expect(result.manifest.author).toBeUndefined();
    });

    it("should use hash-based versioning on recompile", async () => {
      const skillContent1 = renderSkillMd(
        "web-framework-vue-composition-api",
        "Vue skill",
        "# Vue version 1",
      );
      const skillPath = await writeTestSkill(skillsDir, "web-framework-vue-composition-api", {
        skillContent: skillContent1,
      });

      // First compile
      const result1 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result1.manifest.version).toBe("1.0.0");

      // Recompile without changes - version should stay the same
      const result2 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result2.manifest.version).toBe("1.0.0");

      // Modify the skill content
      const newContent = renderSkillMd(
        "web-framework-vue-composition-api",
        "Vue skill",
        "# Vue version 2 - updated content",
      );
      await writeFile(path.join(skillPath, STANDARD_FILES.SKILL_MD), newContent);

      // Update metadata.yaml contentHash to reflect new SKILL.md content
      const newHash = await computeSkillFolderHash(skillPath);
      const metadataPath = path.join(skillPath, STANDARD_FILES.METADATA_YAML);
      const metadataContent = await readFile(metadataPath, "utf-8");
      const updatedMetadata = metadataContent.replace(
        /contentHash: [a-f0-9]+/,
        `contentHash: ${newHash}`,
      );
      await writeFile(metadataPath, updatedMetadata);

      // Recompile with changes - version should bump major (1.0.0 -> 2.0.0)
      const result3 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result3.manifest.version).toBe("2.0.0");
    });
  });

  describe("compileAllSkillPlugins", () => {
    it("should compile multiple skills from directory", async () => {
      await writeTestSkill(skillsDir, "web-framework-react");
      await writeTestSkill(skillsDir, "web-state-zustand");
      await writeTestSkill(skillsDir, "api-framework-hono");

      const { compiled: results } = await compileAllSkillPlugins(skillsDir, outputDir);

      expect(results).toHaveLength(3);
      const skillNames = results.map((r) => r.skillName);
      expect(skillNames).toContain("web-framework-react");
      expect(skillNames).toContain("web-state-zustand");
      expect(skillNames).toContain("api-framework-hono");
    });

    it("should create plugin directories for each skill", async () => {
      await writeTestSkill(skillsDir, "web-framework-react");
      await writeTestSkill(skillsDir, "api-framework-hono");

      const { compiled: results } = await compileAllSkillPlugins(skillsDir, outputDir);

      for (const result of results) {
        const stats = await stat(result.pluginPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it("should handle empty skills directory", async () => {
      const { compiled: results, failed } = await compileAllSkillPlugins(skillsDir, outputDir);
      expect(results).toHaveLength(0);
      expect(failed).toHaveLength(0);
    });

    it("should use frontmatter.name as skill name (not directory name)", async () => {
      await writeTestSkill(skillsDir, "api-database-drizzle", {
        skillContent: renderSkillMd("actual-skill-name", "Skill description", "# Content"),
      });

      const { compiled: results } = await compileAllSkillPlugins(skillsDir, outputDir);

      expect(results).toHaveLength(1);
      // Should use frontmatter.name, not directory name
      expect(results[0].skillName).toBe("actual-skill-name");
    });

    it("should continue compiling other skills when one fails", async () => {
      // Create valid skill
      await writeTestSkill(skillsDir, "web-framework-react");

      // Create invalid skill (no frontmatter) - intentionally raw for error testing
      const badSkillPath = path.join(skillsDir, "bad-skill");
      await mkdir(badSkillPath, { recursive: true });
      await writeFile(path.join(badSkillPath, STANDARD_FILES.SKILL_MD), "# No frontmatter");

      // Create another valid skill
      await writeTestSkill(skillsDir, "web-state-zustand");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { compiled: results, failed } = await compileAllSkillPlugins(skillsDir, outputDir);

      // Should have compiled the valid skills
      expect(results).toHaveLength(2);
      const skillNames = results.map((r) => r.skillName);
      expect(skillNames).toContain("web-framework-react");
      expect(skillNames).toContain("web-state-zustand");

      // The failed skill is reported by directory basename so callers can skip pruning
      expect(failed).toStrictEqual(["bad-skill"]);

      // Should have warned about the failed skill
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));

      vi.restoreAllMocks();
    });

    it("should log success messages for compiled skills", async () => {
      await writeTestSkill(skillsDir, "web-framework-react");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await compileAllSkillPlugins(skillsDir, outputDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[OK]"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-framework-react"));

      vi.restoreAllMocks();
    });

    it("should return correct manifest for each compiled skill", async () => {
      await writeTestSkill(skillsDir, "web-framework-react");
      await writeTestSkill(skillsDir, "api-framework-hono");

      const { compiled: results } = await compileAllSkillPlugins(skillsDir, outputDir);

      for (const result of results) {
        // Plugin name = skill name (no prefix)
        expect(result.manifest.name).toBe(result.skillName);
        expect(result.manifest.version).toBe("1.0.0");
      }
    });
  });

  describe("printCompilationSummary", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should print count of compiled plugins", () => {
      const results: CompiledSkillPlugin[] = [
        {
          pluginPath: "/out/react",
          manifest: { name: "react", version: "1.0.0" },
          skillName: "react",
        },
        {
          pluginPath: "/out/zustand",
          manifest: { name: "zustand", version: "2.0.0" },
          skillName: "zustand",
        },
        {
          pluginPath: "/out/hono",
          manifest: { name: "hono", version: "3.0.0" },
          skillName: "hono",
        },
      ];

      printCompilationSummary(results);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 3 skill plugins"));
    });

    it("should print each skill name with version", () => {
      const results: CompiledSkillPlugin[] = [
        {
          pluginPath: "/out/react",
          manifest: { name: "react", version: "1.0.0" },
          skillName: "react",
        },
        {
          pluginPath: "/out/zustand",
          manifest: { name: "zustand", version: "5.0.0" },
          skillName: "zustand",
        },
      ];

      printCompilationSummary(results);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("react"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("v1.0.0"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("zustand"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("v5.0.0"));
    });

    it("should handle empty results array", () => {
      printCompilationSummary([]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 0 skill plugins"));
    });

    it("should handle single result", () => {
      const results: CompiledSkillPlugin[] = [
        {
          pluginPath: "/out/react",
          manifest: { name: "react", version: "1.0.0" },
          skillName: "react",
        },
      ];

      printCompilationSummary(results);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 1 skill plugins"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("react"));
    });
  });
});
