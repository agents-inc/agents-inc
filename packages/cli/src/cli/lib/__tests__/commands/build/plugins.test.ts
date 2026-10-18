import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { missingArgsRefusal, parseRefusal, runCliCommand } from "../../helpers/cli-runner.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../../test-fs-utils";
import { renderAgentMd, renderSkillMd } from "../../content-generators";
import { flattenCliOutput } from "../../helpers/flatten-cli-output.js";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_FILES } from "../../../../consts";
import type { PluginManifest } from "../../../../types";

async function writeSkill(skillsDir: string, name: string, description?: string): Promise<void> {
  const skillDir = path.join(skillsDir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(name, description));
}

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

      const output = error?.message || "";
      expect(
        output,
        "every skill is compiled unless --skill narrows it, so no positional is required",
      ).not.toContain(missingArgsRefusal(1));
    });

    it("should complete with 0 skills when no skills directory exists", async () => {
      const { stdout, error } = await runCliCommand(["build:plugins"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Compiled 0 skill plugins");
      expect(stdout).toContain("Plugin compilation complete!");
    });
  });

  describe("flag validation", () => {
    it("should accept --output-dir flag with path", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputPath]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output-dir"));
    });

    it("should accept -o shorthand for output-dir", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "-o", outputPath]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-o"));
    });

    it("should accept --skill flag", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "web/framework/react"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--skill"));
    });

    it("should accept --verbose flag", async () => {
      const { error } = await runCliCommand(["build:plugins", "--verbose"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--verbose"));
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["build:plugins", "-v"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-v"));
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

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output-dir"));
      expect(output).not.toContain(parseRefusal("--verbose"));
    });

    it("should accept shorthand flags together", async () => {
      const outputPath = path.join(tempDir, "output");

      const { error } = await runCliCommand(["build:plugins", "-o", outputPath, "-v"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-o"));
      expect(output).not.toContain(parseRefusal("-v"));
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

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--skill"));
      expect(output).not.toContain(parseRefusal("--output-dir"));
    });

    it("should accept --skill with --verbose", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "react", "--verbose"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--skill"));
      expect(output).not.toContain(parseRefusal("--verbose"));
    });
  });

  describe("error handling", () => {
    it("should error when specific skill not found", async () => {
      const { error } = await runCliCommand(["build:plugins", "--skill", "nonexistent-skill-xyz"]);

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
      await writeSkill(skillsDir, "web-framework-react", "React framework");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();

      const pluginDir = path.join(outputDir, "web-framework-react");
      expect(await directoryExists(pluginDir)).toBe(true);

      const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      expect(await fileExists(manifestPath)).toBe(true);

      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest: PluginManifest = JSON.parse(manifestContent);
      expect(manifest.name).toBe("web-framework-react");
      expect(manifest.description).toBe("React framework");
      expect(manifest.version).toBe("1.0.0");
    });

    it("should copy SKILL.md into the plugin skills subdirectory", async () => {
      await writeSkill(skillsDir, "web-framework-react", "React framework");

      await runCliCommand(["build:plugins", "--output-dir", outputDir]);

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
      await writeSkill(skillsDir, "web-framework-react", "React framework");

      await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      const readmePath = path.join(outputDir, "web-framework-react", "README.md");
      expect(await fileExists(readmePath)).toBe(true);

      const content = await readFile(readmePath, "utf-8");
      expect(content).toContain("# web-framework-react");
      expect(content).toContain("React framework");
    });

    it("should compile multiple skills and report count in stdout", async () => {
      for (const name of ["web-framework-react", "api-framework-hono"]) {
        await writeSkill(skillsDir, name);
      }

      const { stdout, error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Compiled 2 skill plugins");

      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(true);
    });

    it("should count a single compiled skill plugin in the singular", async () => {
      await writeSkill(skillsDir, "web-framework-react");

      const { stdout, error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Compiled 1 skill plugin");
      expect(stdout).not.toContain("Compiled 1 skill plugins");
    });

    it("should compile a specific skill with --skill flag", async () => {
      for (const name of ["web-framework-react", "api-framework-hono"]) {
        await writeSkill(skillsDir, name);
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

      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(false);
    });

    it("should report plugin compilation complete in stdout", async () => {
      await writeSkill(skillsDir, "web-framework-react");

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
      await writeSkill(skillsDir, "web-framework-react");
      const orphanDir = await writePluginDir("old-removed-skill", {
        name: "old-removed-skill",
        skills: "./skills/",
      });

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
      expect(await directoryExists(orphanDir)).toBe(false);
    });

    it("should NOT prune in single-skill mode", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      await writeSkill(skillsDir, "api-framework-hono");
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
      expect(await directoryExists(orphanDir)).toBe(true);
      expect(await directoryExists(path.join(outputDir, "api-framework-hono"))).toBe(false);
    });

    it("should NOT prune when a skill fails to compile (partial-failure safety)", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const orphanDir = await writePluginDir("old-removed-skill", {
        name: "old-removed-skill",
        skills: "./skills/",
      });

      // A skill with no frontmatter fails to compile, indistinguishable from a removed one.
      const badSkillDir = path.join(skillsDir, "bad-skill");
      await mkdir(badSkillDir, { recursive: true });
      await writeFile(path.join(badSkillDir, STANDARD_FILES.SKILL_MD), "# no frontmatter");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(await directoryExists(orphanDir)).toBe(true);
      expect(await directoryExists(path.join(outputDir, "web-framework-react"))).toBe(true);
    });

    it("should not delete directories that are not plugin dirs", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const nonPluginDir = path.join(outputDir, "not-a-plugin");
      await mkdir(nonPluginDir, { recursive: true });
      await writeFile(path.join(nonPluginDir, "notes.txt"), "unrelated file");

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(await directoryExists(nonPluginDir)).toBe(true);
      expect(await fileExists(path.join(nonPluginDir, "notes.txt"))).toBe(true);
    });

    it("should preserve agent plugins when pruning skill orphans", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const agentDir = await writePluginDir("agent-cli-developer", {
        name: "agent-cli-developer",
        agents: "./agents/",
      });

      const { error } = await runCliCommand(["build:plugins", "--output-dir", outputDir]);

      expect(error).toBeUndefined();
      expect(await directoryExists(agentDir)).toBe(true);
    });
  });

  describe("what a build says, line by line", () => {
    let skillsDir: string;
    let outputDir: string;

    beforeEach(async () => {
      skillsDir = path.join(projectDir, "src", "skills");
      outputDir = path.join(projectDir, "dist", "plugins");
    });

    function header(): string[] {
      return [
        "",
        "Compiling skill plugins",
        `  Skills directory: ${skillsDir}`,
        `  Output directory: ${outputDir}`,
        "",
      ];
    }

    it("names both directories, each skill it compiled, and the end of the run", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      await writeSkill(skillsDir, "api-framework-hono");

      const { stdout, error } = await runCliCommand(["build", "plugins"]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          ...header(),
          "Finding and compiling all skills...",
          "  [OK] api-framework-hono",
          "  [OK] web-framework-react",
          "Compiled 2 skill plugins",
          "",
          "Compiled 2 skill plugins:",
          "  - api-framework-hono (v1.0.0)",
          "  - web-framework-react (v1.0.0)",
          "",
          "✓ Plugin compilation complete!",
          "",
        ].join("\n"),
      );
    });

    it("names the one skill --skill compiles and where its plugin went", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const skillPath = path.join(skillsDir, "web-framework-react");

      const { stdout, error } = await runCliCommand([
        "build",
        "plugins",
        "--skill",
        "web-framework-react",
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          ...header(),
          `Compiling skill at ${skillPath}...`,
          "Compiled web-framework-react",
          `  Plugin path: ${path.join(outputDir, "web-framework-react")}`,
          "",
          "✓ Plugin compilation complete!",
          "",
        ].join("\n"),
      );
    });

    it("compiles the agents --agents-dir names after the skills, and says so", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const agentsDir = path.join(projectDir, "agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), renderAgentMd("web-developer"));

      const { stdout, error } = await runCliCommand(["build", "plugins", "--agents-dir", "agents"]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          ...header(),
          "Finding and compiling all skills...",
          "  [OK] web-framework-react",
          "Compiled 1 skill plugin",
          "",
          "Compiled 1 skill plugin:",
          "  - web-framework-react (v1.0.0)",
          "",
          "Compiling agent plugins",
          `  Agents directory: ${agentsDir}`,
          "",
          "Finding and compiling all agents...",
          "  [OK] agent-web-developer",
          "Compiled 1 agent plugin",
          "",
          "Compiled 1 agent plugin:",
          "  - agent-web-developer (v1.0.0)",
          "",
          "✓ Plugin compilation complete!",
          "",
        ].join("\n"),
      );
      expect(
        await directoryExists(path.join(outputDir, "agent-web-developer")),
        "the agent's plugin is written beside the skill plugins",
      ).toBe(true);
    });

    it("says which skills failed and why it will not prune", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      for (const bad of ["bad-skill", "worse-skill"]) {
        await mkdir(path.join(skillsDir, bad), { recursive: true });
        await writeFile(path.join(skillsDir, bad, STANDARD_FILES.SKILL_MD), "# no frontmatter");
      }

      const { stderr, error } = await runCliCommand(["build", "plugins"]);

      expect(error).toBeUndefined();
      expect(flattenCliOutput(stderr)).toContain(
        "Warning: Skipping stale-plugin pruning: 2 skill(s) failed to compile (bad-skill, worse-skill). A failed skill is indistinguishable from a removed one.",
      );
    });

    it("names each stale plugin it prunes", async () => {
      await writeSkill(skillsDir, "web-framework-react");
      const staleDir = path.join(outputDir, "old-removed-skill");
      await mkdir(path.join(staleDir, PLUGIN_MANIFEST_DIR), { recursive: true });
      await writeFile(
        path.join(staleDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
        JSON.stringify({ name: "old-removed-skill", version: "1.0.0", skills: "./skills/" }),
      );

      const { stdout } = await runCliCommand(["build", "plugins"]);

      expect(stdout).toContain(
        ["  - web-framework-react (v1.0.0)", "  Pruned stale plugin: old-removed-skill", ""].join(
          "\n",
        ),
      );
    });

    it("says the compilation failed, then why, when a skill cannot be compiled", async () => {
      const { stdout, error } = await runCliCommand([
        "build",
        "plugins",
        "--skill",
        "nonexistent-skill-xyz",
      ]);

      expect(stdout.endsWith("Compilation failed\n")).toBe(true);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("says what each step does under --verbose", async () => {
      await writeSkill(skillsDir, "web-framework-react");

      const compilingLine = `  Compiling skill plugin: web-framework-react from ${path.join(skillsDir, "web-framework-react")}`;

      const quiet = await runCliCommand(["build", "plugins"]);
      const verbose = await runCliCommand(["build", "plugins", "--verbose"]);

      expect(quiet.stdout).not.toContain(compilingLine);
      expect(verbose.stdout).toContain(compilingLine);
    });
  });
});
