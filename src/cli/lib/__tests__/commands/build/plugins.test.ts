import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../../test-fs-utils";
import { renderSkillMd } from "../../content-generators";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_FILES } from "../../../../consts";
import type { PluginManifest } from "../../../../types";

describe("build:plugins command", () => {
  let tempDir: string;
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, cleanup } = await setupIsolatedHome("build-plugins-test-home-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("basic execution", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["build:plugins"]);

      // Should not have argument parsing errors
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should complete with 0 skills when no skills directory exists", async () => {
      // projectDir has no skills directory - command still runs
      const { stdout, error } = await runCliCommand(["build:plugins"]);

      // Command completes (may succeed with 0 skills or error gracefully)
      // The key is it doesn't crash with argument errors
      const output = stdout + (error?.message || "");
      expect(output.toLowerCase()).not.toContain("missing required arg");
    });
  });

  describe("flag validation", () => {
    it("should accept --output-dir flag with path", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputPath]);

      // Should not error on --output-dir flag
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -o shorthand for output-dir", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "-o", outputPath]);

      // Should accept -o shorthand
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --skill flag", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "web/framework/react"]);

      // Should not error on --skill flag
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --verbose flag", async () => {
      const { error } = await runCliCommand(["build:plugins", "--verbose"]);

      // Should not error on --verbose flag
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["build:plugins", "-v"]);

      // Should accept -v shorthand
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("combined flags", () => {
    it("should accept multiple flags together", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand([
        "build:plugins",
        "--output-dir",
        outputPath,
        "--verbose",
      ]);

      // Should accept all flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept shorthand flags together", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "-o", outputPath, "-v"]);

      // Should accept all shorthand flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --skill with --output-dir", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand([
        "build:plugins",
        "--skill",
        "react",
        "--output-dir",
        outputPath,
      ]);

      // Should accept both flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --skill with --verbose", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "react", "--verbose"]);

      // Should accept both flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("error handling", () => {
    it("should error when specific skill not found", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "nonexistent-skill-xyz"]);

      // Should exit with error when skill not found
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("missing required SKILL.md file");
    });
  });

  describe("plugin output verification", () => {
    let skillsDir: string;
    let outputDir: string;

    beforeEach(async () => {
      skillsDir = path.join(projectDir, "src", "skills");
      outputDir = path.join(projectDir, "dist", "plugins");
    });

    it("should produce plugin directory with plugin.json for a single skill", async () => {
      // Create a valid skill with frontmatter
      const skillDir = path.join(skillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React framework"),
      );

      const { stdout, error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();

      // Plugin directory should exist
      const pluginDir = path.join(outputDir, "web-framework-react");
      expect(await directoryExists(pluginDir)).toBe(true);

      // plugin.json should exist inside .claude-plugin/
      const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      expect(await fileExists(manifestPath)).toBe(true);

      // Parse and verify manifest content
      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest: PluginManifest = JSON.parse(manifestContent);
      expect(manifest.name).toBe("web-framework-react");
      expect(manifest.description).toBe("React framework");
      expect(manifest.version).toBe("1.0.0");
    });

    it("should copy SKILL.md into the plugin skills subdirectory", async () => {
      const skillDir = path.join(skillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React framework"),
      );

      await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      // SKILL.md should be copied into skills/{skillName}/ inside plugin dir
      const copiedSkillMd = path.join(
        outputDir,
        "web-framework-react",
        "skills",
        "web-framework-react",
        STANDARD_FILES.SKILL_MD,
      );
      expect(await fileExists(copiedSkillMd)).toBe(true);

      const content = await readFile(copiedSkillMd, "utf-8");
      expect(content).toContain("name: web-framework-react");
      expect(content).toContain("React framework");
    });

    it("should generate README.md in plugin directory", async () => {
      const skillDir = path.join(skillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React framework"),
      );

      await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      const readmePath = path.join(outputDir, "web-framework-react", "README.md");
      expect(await fileExists(readmePath)).toBe(true);

      const content = await readFile(readmePath, "utf-8");
      expect(content).toContain("# web-framework-react");
      expect(content).toContain("React framework");
    });

    it("should compile multiple skills and report count in stdout", async () => {
      // Create two skills
      for (const name of ["web-framework-react", "api-framework-hono"]) {
        const skillDir = path.join(skillsDir, name);
        await mkdir(skillDir, { recursive: true });
        await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(name));
      }

      const { stdout, error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Compiled 2 skill plugins");

      // Both plugin directories should exist
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(true);
    });

    it("should compile a specific skill with --skill flag", async () => {
      // Create two skills but only compile one
      for (const name of ["web-framework-react", "api-framework-hono"]) {
        const skillDir = path.join(skillsDir, name);
        await mkdir(skillDir, { recursive: true });
        await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(name));
      }

      const { stdout, error } = await runCliCommand([
        "build:plugins",
        "--output-dir",
        outputDir,
        "--skill",
        "web-framework-react",
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Compiled web-framework-react");

      // Only the targeted skill should be compiled
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(false);
    });

    it("should report plugin compilation complete in stdout", async () => {
      const skillDir = path.join(skillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );

      const { stdout, error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Plugin compilation complete!");
    });
  });

  describe("stale plugin pruning", () => {
    let skillsDir: string;
    let outputDir: string;

    beforeEach(async () => {
      skillsDir = path.join(projectDir, "src", "skills");
      outputDir = path.join(projectDir, "dist", "plugins");
    });

    async function writeSkill(name: string): Promise<void> {
      const skillDir = path.join(skillsDir, name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(name));
    }

    async function writePluginDir(name: string, manifest: PluginManifest): Promise<string> {
      const pluginDir = path.join(outputDir, name);
      await mkdir(path.join(pluginDir, PLUGIN_MANIFEST_DIR), { recursive: true });
      await writeFile(
        path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
        JSON.stringify({ version: "1.0.0", ...manifest }),
      );
      return pluginDir;
    }

    it("should prune a stale skill plugin whose source was removed", async () => {
      await writeSkill("web-framework-react");
      const orphanDir = await writePluginDir("old-removed-skill", {
        name: "old-removed-skill",
        skills: "./skills/",
      });

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      // Current skill survives, stale orphan is deleted
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(orphanDir)).toBe(false);
    });

    it("should NOT prune in single-skill mode", async () => {
      await writeSkill("web-framework-react");
      await writeSkill("api-framework-hono");
      const orphanDir = await writePluginDir("old-removed-skill", {
        name: "old-removed-skill",
        skills: "./skills/",
      });

      const { error } = await runCliCommand([
        "build:plugins",
        "--output-dir",
        outputDir,
        "--skill",
        "web-framework-react",
      ]);

      expect(error).toBeUndefined();
      // Single-skill mode must not treat every other plugin as an orphan
      expect(await directoryExists(orphanDir)).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(false);
    });

    it("should NOT prune when a skill fails to compile (partial-failure safety)", async () => {
      await writeSkill("web-framework-react");
      const orphanDir = await writePluginDir("old-removed-skill", {
        name: "old-removed-skill",
        skills: "./skills/",
      });

      // A skill with no frontmatter fails to compile and is indistinguishable from a removed one
      const badSkillDir = path.join(skillsDir, "bad-skill");
      await mkdir(badSkillDir, { recursive: true });
      await writeFile(path.join(badSkillDir, STANDARD_FILES.SKILL_MD), "# no frontmatter");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      // Pruning is skipped entirely, so the orphan is preserved rather than falsely deleted
      expect(await directoryExists(orphanDir)).toBe(true);
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
    });

    it("should not delete directories that are not plugin dirs", async () => {
      await writeSkill("web-framework-react");
      const nonPluginDir = path.join(outputDir, "not-a-plugin");
      await mkdir(nonPluginDir, { recursive: true });
      await writeFile(path.join(nonPluginDir, "notes.txt"), "unrelated file");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      // A directory without .claude-plugin/plugin.json is left untouched
      expect(await directoryExists(nonPluginDir)).toBe(true);
      expect(await fileExists(path.join(nonPluginDir, "notes.txt"))).toBe(true);
    });

    it("should preserve agent plugins when pruning skill orphans", async () => {
      await writeSkill("web-framework-react");
      const agentDir = await writePluginDir("agent-cli-developer", {
        name: "agent-cli-developer",
        agents: "./agents/",
      });

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      // Agent plugins are out of scope for skill-only pruning and must survive
      expect(await directoryExists(agentDir)).toBe(true);
    });
  });
});
