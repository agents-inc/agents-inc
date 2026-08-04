import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  validatePluginStructure,
  validatePluginManifest,
  validateSkillFrontmatter,
  validateAgentFrontmatter,
  validatePlugin,
  validateAllPlugins,
} from "./plugin-validator";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";

describe("plugin-validator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("plugin-validator-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** Write a plugin.json manifest at .claude-plugin/plugin.json */
  async function writePluginJson(dir: string, manifest: Record<string, unknown>) {
    await mkdir(path.join(dir, PLUGIN_MANIFEST_DIR), { recursive: true });
    await writeFile(
      path.join(dir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
      JSON.stringify(manifest),
    );
  }

  describe("validatePluginStructure", () => {
    it("should pass for valid plugin structure", async () => {
      await writePluginJson(tempDir, { name: "test-plugin" });
      await writeFile(path.join(tempDir, "README.md"), "# Test Plugin");

      const result = await validatePluginStructure(tempDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should fail if plugin directory does not exist", async () => {
      const nonexistentPath = path.join(tempDir, "nonexistent");

      const result = await validatePluginStructure(nonexistentPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([`Plugin directory does not exist: ${nonexistentPath}`]);
    });

    it("should fail if .claude-plugin/plugin.json missing", async () => {
      const result = await validatePluginStructure(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing .claude-plugin/ directory");
    });

    it("should fail if plugin.json is missing but .claude-plugin exists", async () => {
      await mkdir(path.join(tempDir, PLUGIN_MANIFEST_DIR), { recursive: true });

      const result = await validatePluginStructure(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing .claude-plugin/plugin.json");
    });

    it("should warn if README.md is missing", async () => {
      await writePluginJson(tempDir, { name: "test-plugin" });

      const result = await validatePluginStructure(tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Missing README.md (recommended for documentation)");
    });
  });

  describe("validatePluginManifest", () => {
    it("should pass for valid manifest", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "test-plugin",
          version: "1.0.0",
          description: "A test plugin",
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail if file does not exist", async () => {
      const nonexistentPath = path.join(tempDir, "nonexistent.json");

      const result = await validatePluginManifest(nonexistentPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([`Manifest file not found: ${nonexistentPath}`]);
    });

    it("should fail if JSON is invalid", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(manifestPath, "{ invalid json }");

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid JSON");
    });

    it("should fail if name missing", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          version: "1.0.0",
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("name");
    });

    it("should fail if name not kebab-case", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "TestPlugin", // PascalCase - invalid
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name must be kebab-case: "TestPlugin"');
    });

    it("should fail if version is not valid semver", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "test-plugin",
          version: 1, // Integer - should be semver string
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("version");
    });

    it("should pass with valid semver version", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "test-plugin",
          version: "3.2.1",
          description: "Test plugin",
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(true);
    });

    it("should fail if version is invalid semver", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "test-plugin",
          version: "v1.0", // Invalid semver format
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors).toContain(
        'version "v1.0" is not valid semver (expected: major.minor.patch)',
      );
    });

    it("should warn if description missing", async () => {
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: "test-plugin",
        }),
      );

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(true);
      expect(result.warnings).toStrictEqual([
        "Missing description field (recommended for discoverability)",
      ]);
    });

    it("should fail if skills path does not exist", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", skills: "./skills/" });
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Skills path does not exist: ./skills/");
    });

    it("should pass if skills path exists", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        description: "Test",
        skills: "./skills/",
      });
      await mkdir(path.join(tempDir, STANDARD_DIRS.SKILLS), { recursive: true });
      const manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);

      const result = await validatePluginManifest(manifestPath);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateSkillFrontmatter", () => {
    it("should pass for valid frontmatter", async () => {
      const skillPath = path.join(tempDir, STANDARD_FILES.SKILL_MD);
      await writeFile(
        skillPath,
        `---
name: test-skill
description: A test skill
---

# Test Skill

Content here.
`,
      );

      const result = await validateSkillFrontmatter(skillPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail if file does not exist", async () => {
      const result = await validateSkillFrontmatter(path.join(tempDir, STANDARD_FILES.SKILL_MD));

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("should fail if frontmatter missing", async () => {
      const skillPath = path.join(tempDir, STANDARD_FILES.SKILL_MD);
      await writeFile(skillPath, "# Test Skill\n\nNo frontmatter here.");

      const result = await validateSkillFrontmatter(skillPath);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Missing or invalid YAML frontmatter");
    });

    it("should fail if description missing", async () => {
      const skillPath = path.join(tempDir, STANDARD_FILES.SKILL_MD);
      await writeFile(
        skillPath,
        `---
name: test-skill
---

# Test Skill
`,
      );

      const result = await validateSkillFrontmatter(skillPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("description");
    });

    it("should fail if using unrecognized fields", async () => {
      const skillPath = path.join(tempDir, STANDARD_FILES.SKILL_MD);
      await writeFile(
        skillPath,
        `---
name: test-skill
description: A test skill
author: "@test"
category: web
version: "1.0.0"
---

# Test Skill
`,
      );

      const result = await validateSkillFrontmatter(skillPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes("Unrecognized key"))).toBe(true);
      expect(result.errors.some((e) => e.includes("author"))).toBe(true);
    });

    it("should pass with optional runtime fields", async () => {
      const skillPath = path.join(tempDir, STANDARD_FILES.SKILL_MD);
      await writeFile(
        skillPath,
        `---
name: test-skill
description: A test skill
model: sonnet
---

# Test Skill
`,
      );

      const result = await validateSkillFrontmatter(skillPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("validateAgentFrontmatter", () => {
    it("should pass for valid frontmatter", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      await writeFile(
        agentPath,
        `---
name: web-developer
description: Expert frontend developer
tools: Read, Write, Edit, Grep, Glob
---

# Frontend Developer Agent
`,
      );

      const result = await validateAgentFrontmatter(agentPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail if file does not exist", async () => {
      const result = await validateAgentFrontmatter(path.join(tempDir, "agent.md"));

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("should fail if name not kebab-case", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      await writeFile(
        agentPath,
        `---
name: FrontendDeveloper
description: Expert frontend developer
---

# Agent
`,
      );

      const result = await validateAgentFrontmatter(agentPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name must be kebab-case: "FrontendDeveloper"');
    });

    it("should fail if description missing", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      await writeFile(
        agentPath,
        `---
name: web-developer
---

# Agent
`,
      );

      const result = await validateAgentFrontmatter(agentPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("description");
    });

    it("should pass with skills array", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      await writeFile(
        agentPath,
        `---
name: web-developer
description: Expert frontend developer
tools: Read, Write, Edit
skills:
  - skill-react
  - skill-zustand
---

# Agent
`,
      );

      const result = await validateAgentFrontmatter(agentPath);

      expect(result.valid).toBe(true);
    });

    it("should pass with permission mode", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      await writeFile(
        agentPath,
        `---
name: web-developer
description: Expert frontend developer
permissionMode: acceptEdits
---

# Agent
`,
      );

      const result = await validateAgentFrontmatter(agentPath);

      expect(result.valid).toBe(true);
    });
  });

  describe("validatePlugin", () => {
    it("should pass for complete valid plugin", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        skills: "./skills/",
        agents: "./agents/",
      });
      await mkdir(path.join(tempDir, STANDARD_DIRS.SKILLS, "test-skill"), { recursive: true });
      await mkdir(path.join(tempDir, "agents"), { recursive: true });
      await writeFile(path.join(tempDir, "README.md"), "# Test Plugin");
      await writeFile(
        path.join(tempDir, STANDARD_DIRS.SKILLS, "test-skill", STANDARD_FILES.SKILL_MD),
        `---
name: test-skill
description: A test skill
---

# Test Skill
`,
      );

      await writeFile(
        path.join(tempDir, "agents", "test-agent.md"),
        `---
name: test-agent
description: A test agent
tools: Read, Write
---

# Test Agent
`,
      );

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should aggregate errors from all validations", async () => {
      await writePluginJson(tempDir, { name: "BadName", skills: "./skills/" });
      await mkdir(path.join(tempDir, STANDARD_DIRS.SKILLS, "bad-skill"), { recursive: true });

      await writeFile(
        path.join(tempDir, STANDARD_DIRS.SKILLS, "bad-skill", STANDARD_FILES.SKILL_MD),
        `---
name: bad-skill
---

# Bad Skill
`,
      );

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
      expect(result.errors.some((e) => e.includes("description"))).toBe(true);
    });

    it("should warn if skills directory empty", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        description: "Test",
        skills: "./skills/",
      });
      await mkdir(path.join(tempDir, STANDARD_DIRS.SKILLS), { recursive: true });
      await writeFile(path.join(tempDir, "README.md"), "# Test");

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("no SKILL.md files"))).toBe(true);
    });
  });

  describe("validateAllPlugins", () => {
    it("should validate multiple plugins", async () => {
      for (const name of ["plugin-one", "plugin-two"]) {
        const pluginDir = path.join(tempDir, name);
        await writePluginJson(pluginDir, { name, description: `${name} description` });
        await writeFile(path.join(pluginDir, "README.md"), `# ${name}`);
      }

      const result = await validateAllPlugins(tempDir);

      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.summary).toStrictEqual({
        total: 2,
        valid: 2,
        invalid: 0,
        withWarnings: 0,
      });
    });

    it("should fail if directory does not exist", async () => {
      const nonexistentDir = path.join(tempDir, "nonexistent");

      const result = await validateAllPlugins(nonexistentDir);

      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].result.errors).toStrictEqual([
        `Directory does not exist: ${nonexistentDir}`,
      ]);
      expect(result.summary).toStrictEqual({
        total: 0,
        valid: 0,
        invalid: 1,
        withWarnings: 0,
      });
    });

    it("should report mix of valid and invalid plugins", async () => {
      const validDir = path.join(tempDir, "valid-plugin");
      await writePluginJson(validDir, { name: "valid-plugin", description: "Valid" });
      await writeFile(path.join(validDir, "README.md"), "# Valid");

      const invalidDir = path.join(tempDir, "invalid-plugin");
      await writePluginJson(invalidDir, { description: "Invalid - missing name" });

      const result = await validateAllPlugins(tempDir);

      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.summary).toStrictEqual({
        total: 2,
        valid: 1,
        invalid: 1,
        withWarnings: 1,
      });
      const invalidResult = result.results.find((r) => !r.result.valid);
      expect(invalidResult).toBeDefined();
      expect(invalidResult!.result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("should count plugins with warnings", async () => {
      const pluginDir = path.join(tempDir, "warn-plugin");
      await writePluginJson(pluginDir, { name: "warn-plugin" }); // Missing description triggers warning
      await writeFile(path.join(pluginDir, "README.md"), "# Warn");

      const result = await validateAllPlugins(tempDir);

      expect(result.valid).toBe(true);
      expect(result.summary).toStrictEqual({
        total: 1,
        valid: 1,
        invalid: 0,
        withWarnings: 1,
      });
    });
  });
});
