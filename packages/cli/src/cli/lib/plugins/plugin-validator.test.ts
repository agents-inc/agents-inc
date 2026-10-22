import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  validateSkillFrontmatter,
  validateAgentFrontmatter,
  validatePlugin,
  validateAllPlugins,
} from "./plugin-validator";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { renderAgentMd } from "../__tests__/content-generators.js";
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

  async function writePluginJson(dir: string, manifest: Record<string, unknown>) {
    await writePluginJsonText(dir, JSON.stringify(manifest));
  }

  async function writePluginJsonText(dir: string, text: string) {
    await mkdir(path.join(dir, PLUGIN_MANIFEST_DIR), { recursive: true });
    await writeFile(path.join(dir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE), text);
  }

  /** A README keeps the structure's one recommendation out of what a manifest spec asserts. */
  async function writeReadme(dir: string) {
    await writeFile(path.join(dir, STANDARD_FILES.README_MD), "# Test Plugin");
  }

  describe("a plugin's structure", () => {
    it("passes a plugin with a manifest and a README", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", description: "A test plugin" });
      await writeReadme(tempDir);

      expect(await validatePlugin(tempDir)).toStrictEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    });

    it("should fail if plugin directory does not exist", async () => {
      const nonexistentPath = path.join(tempDir, "nonexistent");

      const result = await validatePlugin(nonexistentPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([`Plugin directory does not exist: ${nonexistentPath}`]);
    });

    it("should fail if .claude-plugin/plugin.json missing", async () => {
      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing .claude-plugin/ directory");
    });

    it("should fail if plugin.json is missing but .claude-plugin exists", async () => {
      await mkdir(path.join(tempDir, PLUGIN_MANIFEST_DIR), { recursive: true });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing .claude-plugin/plugin.json");
    });

    it("should warn if README.md is missing", async () => {
      await writePluginJson(tempDir, { name: "test-plugin" });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Missing README.md (recommended for documentation)");
    });
  });

  describe("a plugin's manifest", () => {
    beforeEach(async () => {
      await writeReadme(tempDir);
    });

    it("should pass for valid manifest", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail if JSON is invalid", async () => {
      await writePluginJsonText(tempDir, "{ invalid json }");

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid JSON");
    });

    it("should fail if JSON parses to something other than an object", async () => {
      await writePluginJsonText(tempDir, JSON.stringify(["not", "a", "manifest"]));

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([`${PLUGIN_MANIFEST_FILE} must contain a JSON object`]);
    });

    it("should fail if name missing", async () => {
      await writePluginJson(tempDir, { version: "1.0.0" });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("name");
    });

    it("should fail if name not kebab-case", async () => {
      await writePluginJson(tempDir, { name: "TestPlugin" });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name must be kebab-case: "TestPlugin"');
    });

    it("should fail if version is not valid semver", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", version: 1 });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("version");
    });

    it("should pass with valid semver version", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        version: "3.2.1",
        description: "Test plugin",
      });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
    });

    it("should fail if version is invalid semver", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", version: "v1.0" });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors).toContain(
        'version "v1.0" is not valid semver (expected: major.minor.patch)',
      );
    });

    it("should warn if description missing", async () => {
      await writePluginJson(tempDir, { name: "test-plugin" });

      const result = await validatePlugin(tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toStrictEqual([
        "Missing description field (recommended for discoverability)",
      ]);
    });

    it("should fail if skills path does not exist", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", skills: "./skills/" });

      const result = await validatePlugin(tempDir);

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

      const result = await validatePlugin(tempDir);

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

    it("refuses an empty name through the schema alone, with no second kebab-case error", async () => {
      const agentPath = path.join(tempDir, "agent.md");
      // YAML's empty string: a bare `name:` parses as null.
      const emptyYamlString = '""';
      await writeFile(agentPath, renderAgentMd(emptyYamlString, "Expert frontend developer"));

      expect(await validateAgentFrontmatter(agentPath)).toStrictEqual({
        valid: false,
        errors: [
          "name: Invalid string: must match pattern /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/",
          "name: Too small: expected string to have >=1 characters",
        ],
        warnings: [],
      });
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

  describe("the agents a plugin declares", () => {
    const AGENTS_PATH = "./agents/";

    async function writeAgentsPlugin(): Promise<string> {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        description: "Test",
        agents: AGENTS_PATH,
      });
      await writeFile(path.join(tempDir, STANDARD_FILES.README_MD), "# Test");
      return path.join(tempDir, "agents");
    }

    it("validates no agent files where the agents path is missing", async () => {
      await writeAgentsPlugin();

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({
        valid: false,
        errors: [`Agents path does not exist: ${AGENTS_PATH}`],
        warnings: [],
      });
    });

    it("warns about an agents directory holding no .md files, and stays valid", async () => {
      const agentsDir = await writeAgentsPlugin();
      await mkdir(agentsDir, { recursive: true });

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
        warnings: [`Agents directory exists but contains no .md files: ${AGENTS_PATH}`],
      });
    });

    it("says nothing about an agents directory holding a valid agent", async () => {
      const agentsDir = await writeAgentsPlugin();
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "test-agent.md"), renderAgentMd("test-agent"));

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({ valid: true, errors: [], warnings: [] });
    });

    it("names each refused agent file by its path in the plugin", async () => {
      const agentsDir = await writeAgentsPlugin();
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "bad-agent.md"), renderAgentMd("Bad_Agent"));

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({
        valid: false,
        errors: [
          `${path.join("agents", "bad-agent.md")}: name: Invalid string: must match pattern /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`,
          `${path.join("agents", "bad-agent.md")}: name must be kebab-case: "Bad_Agent"`,
        ],
        warnings: [],
      });
    });

    it("reads none of the plugin's own files as agents where the agents path is empty", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", description: "Test", agents: "" });
      await writeReadme(tempDir);

      expect(await validatePlugin(tempDir)).toStrictEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    });
  });

  describe("the skills a plugin declares", () => {
    it("adds no empty-directory warning to a skills path that does not exist", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        description: "Test",
        skills: "./skills/",
      });
      await writeFile(path.join(tempDir, STANDARD_FILES.README_MD), "# Test");

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({
        valid: false,
        errors: ["Skills path does not exist: ./skills/"],
        warnings: [],
      });
    });

    it("keeps a plugin whose skills directory is empty valid, with only the warning", async () => {
      await writePluginJson(tempDir, {
        name: "test-plugin",
        description: "Test",
        skills: "./skills/",
      });
      await mkdir(path.join(tempDir, STANDARD_DIRS.SKILLS), { recursive: true });
      await writeFile(path.join(tempDir, STANDARD_FILES.README_MD), "# Test");

      const result = await validatePlugin(tempDir);

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
        warnings: ["Skills directory exists but contains no SKILL.md files: ./skills/"],
      });
    });

    it("looks for no SKILL.md files where the skills path is empty", async () => {
      await writePluginJson(tempDir, { name: "test-plugin", description: "Test", skills: "" });
      await writeReadme(tempDir);

      expect(await validatePlugin(tempDir)).toStrictEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    });
  });

  describe("validateAllPlugins over a directory that is not all plugins", () => {
    it("validates only the subdirectories that carry a plugin manifest directory", async () => {
      const pluginDir = path.join(tempDir, "plugin-one");
      await writePluginJson(pluginDir, { name: "plugin-one", description: "One" });
      await writeFile(path.join(pluginDir, STANDARD_FILES.README_MD), "# One");
      await mkdir(path.join(tempDir, "not-a-plugin"), { recursive: true });

      const result = await validateAllPlugins(tempDir);

      expect(result.results.map(({ name }) => name)).toStrictEqual(["plugin-one"]);
      expect(result.valid).toBe(true);
    });

    it("refuses a directory with no plugin in it, naming where plugins must live", async () => {
      await mkdir(path.join(tempDir, "not-a-plugin"), { recursive: true });

      const result = await validateAllPlugins(tempDir);

      expect(result).toStrictEqual({
        valid: false,
        results: [
          {
            name: tempDir,
            result: {
              valid: false,
              errors: [
                `No plugins found in directory: ${tempDir}. Plugins must contain a .claude-plugin/ directory.`,
              ],
              warnings: [],
            },
          },
        ],
        summary: { total: 0, valid: 0, invalid: 1, withWarnings: 0 },
      });
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
      expect(firstElement(result.results).result.errors).toStrictEqual([
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

/** Semantic Versioning 2.0.0's own grammar, read edge by edge. */
describe("a plugin manifest's semantic version", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("plugin-validator-semver-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function versionValid(version: string): Promise<boolean> {
    await mkdir(path.join(tempDir, PLUGIN_MANIFEST_DIR), { recursive: true });
    await writeFile(
      path.join(tempDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
      JSON.stringify({ name: "test-plugin", version, description: "Test plugin" }),
    );
    return (await validatePlugin(tempDir)).valid;
  }

  it.each([
    "10.20.30",
    "1.0.0-alpha",
    "1.0.0-100",
    "1.0.0-12a",
    "1.0.0-alpha.10",
    "1.0.0-alpha.beta",
    "1.0.0-alpha.2b",
    "1.0.0+build",
    "1.0.0+build.10",
    "1.0.0-rc.1+build.10",
  ])("accepts %s", async (version) => {
    expect(await versionValid(version)).toBe(true);
  });

  it.each(["v1.0.0", "1.0.0junk", "01.0.0", "1.0.0-01", "1.0.0+"])(
    "refuses %s",
    async (version) => {
      expect(await versionValid(version)).toBe(false);
    },
  );
});
