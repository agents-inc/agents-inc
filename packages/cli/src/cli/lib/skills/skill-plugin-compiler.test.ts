import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
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
import { renderSkillMd, renderUnparseableMetadataYaml } from "../__tests__/content-generators";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import { setVerbose } from "../../utils/logger";
import { initializeMatrix } from "../matrix/matrix-provider";
import { computeSkillFolderHash } from "../versioning";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { readInstallTree } from "../__tests__/helpers/golden-tree.js";
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

      const result1 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result1.manifest.version).toBe("1.0.0");

      const result2 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result2.manifest.version).toBe("1.0.0");

      const newContent = renderSkillMd(
        "web-framework-vue-composition-api",
        "Vue skill",
        "# Vue version 2 - updated content",
      );
      await writeFile(path.join(skillPath, STANDARD_FILES.SKILL_MD), newContent);

      const newHash = await computeSkillFolderHash(skillPath);
      const metadataPath = path.join(skillPath, STANDARD_FILES.METADATA_YAML);
      const metadataContent = await readFile(metadataPath, "utf-8");
      const updatedMetadata = metadataContent.replace(
        /contentHash: [a-f0-9]+/,
        `contentHash: ${newHash}`,
      );
      await writeFile(metadataPath, updatedMetadata);

      const result3 = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      expect(result3.manifest.version).toBe("2.0.0");
    });
  });

  describe("rebuilding a plugin over its earlier build", () => {
    async function writeFirstBuildSource(): Promise<string> {
      const skillPath = await writeTestSkill(skillsDir, "web-testing-vitest");
      await writeFile(path.join(skillPath, STANDARD_FILES.REFERENCE_MD), "# Reference");
      await mkdir(path.join(skillPath, STANDARD_DIRS.EXAMPLES), { recursive: true });
      await writeFile(path.join(skillPath, STANDARD_DIRS.EXAMPLES, "kept.md"), "# Kept");
      await writeFile(path.join(skillPath, STANDARD_DIRS.EXAMPLES, "removed.md"), "# Removed");
      await mkdir(path.join(skillPath, STANDARD_DIRS.SCRIPTS), { recursive: true });
      await writeFile(path.join(skillPath, STANDARD_DIRS.SCRIPTS, "setup.sh"), "echo setup");
      return skillPath;
    }

    async function removeFromSource(skillPath: string): Promise<void> {
      await rm(path.join(skillPath, STANDARD_DIRS.EXAMPLES, "removed.md"));
      await rm(path.join(skillPath, STANDARD_FILES.REFERENCE_MD));
      await rm(path.join(skillPath, STANDARD_DIRS.SCRIPTS), { recursive: true });
    }

    it("leaves exactly the files the source produces now, and none it produced before", async () => {
      const skillPath = await writeFirstBuildSource();
      const first = await compileSkillPlugin({ skillPath, outputDir });
      const firstTree = await readInstallTree(first.pluginPath);
      expect(Object.keys(firstTree.files).sort()).toStrictEqual([
        ".claude-plugin/.content-hash",
        ".claude-plugin/plugin.json",
        "README.md",
        "skills/web-testing-vitest/SKILL.md",
        "skills/web-testing-vitest/examples/kept.md",
        "skills/web-testing-vitest/examples/removed.md",
        "skills/web-testing-vitest/reference.md",
        "skills/web-testing-vitest/scripts/setup.sh",
      ]);

      await removeFromSource(skillPath);
      const second = await compileSkillPlugin({ skillPath, outputDir });

      expect(await readInstallTree(second.pluginPath)).toStrictEqual({
        files: {
          ".claude-plugin/.content-hash": await computeSkillFolderHash(skillPath),
          ".claude-plugin/plugin.json": firstTree.files[".claude-plugin/plugin.json"]?.replace(
            '"version": "1.0.0"',
            '"version": "2.0.0"',
          ),
          "README.md": firstTree.files["README.md"],
          "skills/web-testing-vitest/SKILL.md":
            firstTree.files["skills/web-testing-vitest/SKILL.md"],
          "skills/web-testing-vitest/examples/kept.md": "# Kept",
        },
        emptyDirectories: [],
      });
    });

    it("carries the earlier build's version forward, bumped because the content changed", async () => {
      const skillPath = await writeFirstBuildSource();
      await compileSkillPlugin({ skillPath, outputDir });

      await removeFromSource(skillPath);
      const { pluginPath, manifest } = await compileSkillPlugin({ skillPath, outputDir });

      expect(manifest.version).toBe("2.0.0");
      const written = JSON.parse(
        await readFile(path.join(pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE), "utf-8"),
      );
      expect(written.version).toBe("2.0.0");
    });

    it.each([
      [
        "a file this build does not",
        (pluginPath: string) =>
          path.join(
            pluginPath,
            STANDARD_DIRS.SKILLS,
            "web-testing-vitest",
            STANDARD_DIRS.EXAMPLES,
            "orphan.md",
          ),
      ],
      [
        "a file whose bytes this build does not reproduce",
        (pluginPath: string) => path.join(pluginPath, STANDARD_FILES.README_MD),
      ],
    ])(
      "takes a new version when its earlier build shipped %s, though the source is unchanged",
      async (_, earlierBuildFile) => {
        const skillPath = await writeFirstBuildSource();
        const first = await compileSkillPlugin({ skillPath, outputDir });
        const firstTree = await readInstallTree(first.pluginPath);
        await writeFile(earlierBuildFile(first.pluginPath), "# Left by an earlier build");

        const second = await compileSkillPlugin({ skillPath, outputDir });

        expect(second.manifest.version).toBe("2.0.0");
        expect(await readInstallTree(second.pluginPath)).toStrictEqual({
          files: {
            ...firstTree.files,
            ".claude-plugin/plugin.json": firstTree.files[".claude-plugin/plugin.json"]?.replace(
              '"version": "1.0.0"',
              '"version": "2.0.0"',
            ),
          },
          emptyDirectories: [],
        });
      },
    );

    it("takes a new version when only the manifest it writes changes", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        extraMetadata: { author: "@vince" },
      });
      await compileSkillPlugin({ skillPath, outputDir });
      const sourceHash = await computeSkillFolderHash(skillPath);

      await writeTestSkill(skillsDir, "web-framework-react", {
        extraMetadata: { author: "@someone-else" },
      });
      const { pluginPath, manifest } = await compileSkillPlugin({ skillPath, outputDir });

      expect(await computeSkillFolderHash(skillPath)).toBe(sourceHash);
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.author).toStrictEqual({ name: "@someone-else" });
      expect(
        JSON.parse(
          await readFile(path.join(pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE), "utf-8"),
        ),
      ).toStrictEqual(manifest);
    });

    it("keeps the version it bumped to when the next rebuild ships the same files", async () => {
      const skillPath = await writeFirstBuildSource();
      await compileSkillPlugin({ skillPath, outputDir });
      await removeFromSource(skillPath);
      const bumped = await compileSkillPlugin({ skillPath, outputDir });
      const bumpedTree = await readInstallTree(bumped.pluginPath);

      const rebuilt = await compileSkillPlugin({ skillPath, outputDir });

      expect(rebuilt.manifest.version).toBe("2.0.0");
      expect(await readInstallTree(rebuilt.pluginPath)).toStrictEqual(bumpedTree);
    });

    it("leaves the other plugins in the output directory as they were", async () => {
      const otherPlugin = await compileSkillPlugin({
        skillPath: await writeTestSkill(skillsDir, "web-framework-react"),
        outputDir,
      });
      const otherBefore = await readInstallTree(otherPlugin.pluginPath);
      const skillPath = await writeFirstBuildSource();
      await compileSkillPlugin({ skillPath, outputDir });

      await removeFromSource(skillPath);
      await compileSkillPlugin({ skillPath, outputDir });

      expect(await readInstallTree(otherPlugin.pluginPath)).toStrictEqual(otherBefore);
    });

    it("refuses, on every build, a folder holding files but no plugin manifest, and writes nothing", async () => {
      const skillPath = await writeFirstBuildSource();
      const pluginDir = path.join(outputDir, "web-testing-vitest");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(path.join(pluginDir, "notes.md"), "# Not written by a build");
      const refusal = `Skill 'web-testing-vitest' would be built into ${pluginDir}, which holds no ${path.join(PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)} and is not empty, so no earlier build made it and a rebuild would delete what it holds. Move its contents out, or build into another output directory. File: ${path.join(skillPath, STANDARD_FILES.SKILL_MD)}`;

      await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(refusal);
      await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(refusal);

      expect(await readInstallTree(outputDir)).toStrictEqual({
        files: { "web-testing-vitest/notes.md": "# Not written by a build" },
        emptyDirectories: [],
      });
    });

    it("leaves a file standing where the plugin's folder would go", async () => {
      const skillPath = await writeFirstBuildSource();
      await writeFile(path.join(outputDir, "web-testing-vitest"), "# Not a folder");

      await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(/ENOTDIR/);

      expect(await readInstallTree(outputDir)).toStrictEqual({
        files: { "web-testing-vitest": "# Not a folder" },
        emptyDirectories: [],
      });
    });

    it("builds into an empty folder no earlier build made", async () => {
      const skillPath = await writeFirstBuildSource();
      await mkdir(path.join(outputDir, "web-testing-vitest"));

      const { pluginPath } = await compileSkillPlugin({ skillPath, outputDir });

      expect(
        await readFile(path.join(pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE), "utf-8"),
      ).toContain('"version": "1.0.0"');
    });

    it.each(["", ".", "..", "../outside-the-output", "nested/name"])(
      "refuses a skill named '%s', which is not a folder directly inside the output directory, and writes nothing",
      async (name) => {
        const otherPlugin = await compileSkillPlugin({
          skillPath: await writeTestSkill(skillsDir, "web-framework-react"),
          outputDir,
        });
        const outputBefore = await readInstallTree(outputDir);
        const tempBefore = await readInstallTree(tempDir, { skip: ["skills"] });
        const skillPath = await writeTestSkill(skillsDir, "web-state-zustand", {
          // Quoted, so an empty name reaches the compiler as "" rather than as a YAML null.
          skillContent: renderSkillMd(JSON.stringify(name), "A name that is not a folder name"),
        });

        await expect(compileSkillPlugin({ skillPath, outputDir })).rejects.toThrow(
          `Skill 'web-state-zustand' is named '${name}', which is not a single folder name, so its plugin cannot be built inside the output directory. File: ${path.join(skillPath, STANDARD_FILES.SKILL_MD)}`,
        );
        expect(await readInstallTree(outputDir)).toStrictEqual(outputBefore);
        expect(await readInstallTree(tempDir, { skip: ["skills"] })).toStrictEqual(tempBefore);
        expect(otherPlugin.skillName).toBe("web-framework-react");
      },
    );

    it("refuses to build a plugin into the folder holding its own source, and writes nothing", async () => {
      const skillPath = await writeFirstBuildSource();
      const sourceBefore = await readInstallTree(skillsDir);

      await expect(compileSkillPlugin({ skillPath, outputDir: skillsDir })).rejects.toThrow(
        `Skill 'web-testing-vitest' would be built into ${skillPath}, which holds its own source, so building it would overwrite that source. Build into an output directory outside the skills directory. File: ${path.join(skillPath, STANDARD_FILES.SKILL_MD)}`,
      );
      expect(await readInstallTree(skillsDir)).toStrictEqual(sourceBefore);
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
      expect(firstElement(results).skillName).toBe("actual-skill-name");
    });

    it("should continue compiling other skills when one fails", async () => {
      await writeTestSkill(skillsDir, "web-framework-react");

      const badSkillPath = path.join(skillsDir, "bad-skill");
      await mkdir(badSkillPath, { recursive: true });
      await writeFile(path.join(badSkillPath, STANDARD_FILES.SKILL_MD), "# No frontmatter");

      await writeTestSkill(skillsDir, "web-state-zustand");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { compiled: results, failed } = await compileAllSkillPlugins(skillsDir, outputDir);

      expect(results).toHaveLength(2);
      const skillNames = results.map((r) => r.skillName);
      expect(skillNames).toContain("web-framework-react");
      expect(skillNames).toContain("web-state-zustand");

      // The failed skill is reported by directory basename so callers can skip pruning
      expect(failed).toStrictEqual(["bad-skill"]);

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

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 1 skill plugin:"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("react"));
    });
  });

  describe("what a compile says", () => {
    const consoleSpies = silenceConsole(["log", "warn"]);

    afterEach(() => setVerbose(false));

    it("says each step of a compile, copying the reference and the examples", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react");
      await writeFile(path.join(skillPath, STANDARD_FILES.REFERENCE_MD), "# Reference");
      await mkdir(path.join(skillPath, STANDARD_DIRS.EXAMPLES), { recursive: true });
      await writeFile(path.join(skillPath, STANDARD_DIRS.EXAMPLES, "usage.md"), "# Usage");
      setVerbose(true);

      const { pluginPath } = await compileSkillPlugin({ skillPath, outputDir });

      const said = [
        `  Compiling skill plugin: web-framework-react from ${skillPath}`,
        "    Copied SKILL.md",
        "    Copied reference.md",
        "    Copied examples/",
        "    Generated README.md",
        "    Wrote plugin.json for web-framework-react (v1.0.0)",
      ];
      expect(consoleSpies.log).toHaveBeenCalledTimes(said.length);
      said.forEach((line, index) =>
        expect(consoleSpies.log).toHaveBeenNthCalledWith(index + 1, line),
      );
      expect(
        await readFile(
          path.join(
            pluginPath,
            STANDARD_DIRS.SKILLS,
            "web-framework-react",
            STANDARD_FILES.REFERENCE_MD,
          ),
          "utf-8",
        ),
      ).toBe("# Reference");
      expect(consoleSpies.warn).not.toHaveBeenCalled();
    });

    it("says the version a rebuild settled on", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react");
      const { pluginPath } = await compileSkillPlugin({ skillPath, outputDir });
      await writeFile(
        path.join(pluginPath, STANDARD_FILES.README_MD),
        "# Left by an earlier build",
      );
      setVerbose(true);

      await compileSkillPlugin({ skillPath, outputDir });

      expect(consoleSpies.log).toHaveBeenLastCalledWith(
        "    Wrote plugin.json for web-framework-react (v2.0.0)",
      );
    });

    it("says nothing about a skill with no metadata.yaml", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        skipMetadata: true,
      });

      await compileSkillPlugin({ skillPath, outputDir });

      expect(consoleSpies.warn).not.toHaveBeenCalled();
    });

    it("warns about a metadata.yaml the schema refuses, naming the skill and why", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        extraMetadata: { category: 42 },
      });

      const result = await compileSkillPlugin({ skillPath, outputDir });

      expect(result.manifest.author).toBeUndefined();
      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        `  Warning: Invalid metadata.yaml at '${skillPath}': category: Invalid input: expected string, received number`,
      );
    });

    it("warns about a metadata.yaml it cannot parse, naming the skill and the parser's reason", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        skipMetadata: true,
      });
      await writeFile(
        path.join(skillPath, STANDARD_FILES.METADATA_YAML),
        renderUnparseableMetadataYaml(),
      );

      await compileSkillPlugin({ skillPath, outputDir });

      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(
          `Warning: Failed to read metadata.yaml at '${skillPath}': Nested mappings are not allowed`,
        ),
      );
    });

    it("names the SKILL.md whose frontmatter is invalid, and the failed skill's folder", async () => {
      const badSkillPath = path.join(skillsDir, "bad-skill");
      await mkdir(badSkillPath, { recursive: true });
      await writeFile(path.join(badSkillPath, STANDARD_FILES.SKILL_MD), "# No frontmatter");

      await compileAllSkillPlugins(skillsDir, outputDir);

      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        `  Warning: Failed to compile skill from 'bad-skill': Skill 'bad-skill' has invalid or missing YAML frontmatter in SKILL.md. File: ${path.join(badSkillPath, STANDARD_FILES.SKILL_MD)}`,
      );
    });

    it("spells a + in a skill's name as a dash in the plugin's name", async () => {
      const skillPath = await writeTestSkill(skillsDir, "web-framework-react", {
        skillContent: renderSkillMd("web-cpp+tools", "C++ tooling"),
      });

      expect((await compileSkillPlugin({ skillPath, outputDir })).skillName).toBe("web-cpp-tools");
    });
  });
});
