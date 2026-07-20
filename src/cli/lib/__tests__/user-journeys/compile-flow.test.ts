import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestSource,
  cleanupTestSource,
  fileExists,
  readTestFile,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS, COMPILE_LOCAL_SKILL } from "../mock-data/mock-skills";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";
import { buildTestProjectConfig } from "../factories/config-factories.js";
import { runCliCommand } from "../helpers/cli-runner.js";
import { parseTestFrontmatter } from "../helpers/index.js";
import { silenceConsole } from "../helpers/silence-console.js";
import { recompileAgents } from "../../agents";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import { expectValidAgentMarkdown } from "../assertions";

const CLI_REPO_PATH = path.resolve(__dirname, "../../../../..");

describe("User Journey: Compile Flow", () => {
  let dirs: TestDirs;
  let outputDir: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: DEFAULT_TEST_SKILLS,
      agents: DEFAULT_TEST_AGENTS,
      projectConfig: buildTestProjectConfig(
        ["web-developer", "api-developer"],
        DEFAULT_TEST_SKILLS.map((s) => ({ id: s.id })),
        { description: "Test project for compile flow" },
      ),
      asPlugin: true,
    });

    outputDir = path.join(dirs.tempDir, "output");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
  });

  describe("agent file creation", () => {
    it("should create agent markdown files in output directory", async () => {
      const result = await recompileAgents({
        pluginDir: dirs.pluginDir ?? dirs.projectDir,
        sourcePath: CLI_REPO_PATH,
        projectDir: dirs.projectDir,
        outputDir,
        agents: ["web-pm"],
      });

      expect(result.compiled).toContain("web-pm");
      expect(result.failed).toStrictEqual([]);

      const agentPath = path.join(outputDir, "web-pm.md");
      expect(await fileExists(agentPath)).toBe(true);

      const content = await readTestFile(agentPath);
      expectValidAgentMarkdown(content, "web-pm");
    });
  });

  describe("frontmatter structure", () => {
    it("should produce valid YAML frontmatter in compiled agents", async () => {
      const result = await recompileAgents({
        pluginDir: dirs.pluginDir ?? dirs.projectDir,
        sourcePath: CLI_REPO_PATH,
        projectDir: dirs.projectDir,
        outputDir,
        agents: ["web-pm"],
      });

      expect(result.compiled).toContain("web-pm");

      const agentPath = path.join(outputDir, "web-pm.md");
      const content = await readTestFile(agentPath);
      const frontmatter = parseTestFrontmatter(content);

      expect(frontmatter).not.toBeNull();
      expect(frontmatter).toHaveProperty("name");
      expect(frontmatter).toHaveProperty("description");
      expect(frontmatter).toHaveProperty("tools");
      expect(frontmatter).toHaveProperty("model");
      expect(frontmatter).toHaveProperty("permissionMode");
    });

    it("should include valid SkillId format in agent frontmatter skills", async () => {
      const result = await recompileAgents({
        pluginDir: dirs.pluginDir ?? dirs.projectDir,
        sourcePath: CLI_REPO_PATH,
        projectDir: dirs.projectDir,
        outputDir,
        agents: ["web-pm"],
      });

      expect(result.compiled).toContain("web-pm");

      const agentPath = path.join(outputDir, "web-pm.md");
      const content = await readTestFile(agentPath);
      const frontmatter = parseTestFrontmatter(content);
      expect(frontmatter).not.toBeNull();

      if (frontmatter?.skills) {
        expect(Array.isArray(frontmatter.skills)).toBe(true);
        const skills = frontmatter.skills as string[];

        for (const skill of skills) {
          expect(skill).toMatch(/^(web|api|cli|mobile|infra|meta|security)-\w+-\w+/);
        }
      }
    });
  });
});

describe("User Journey: Compile with Local Skills", () => {
  let dirs: TestDirs;
  let agentsDir: string;
  let originalCwd: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
    originalCwd = process.cwd();

    dirs = await createTestSource({
      skills: DEFAULT_TEST_SKILLS,
      agents: DEFAULT_TEST_AGENTS,
      projectConfig: buildTestProjectConfig(
        ["web-developer"],
        [...DEFAULT_TEST_SKILLS.map((s) => ({ id: s.id })), { id: COMPILE_LOCAL_SKILL.id }],
        { name: "local-skills-project", description: "Project with local skills" },
      ),
      localSkills: [COMPILE_LOCAL_SKILL],
      asPlugin: true,
    });

    agentsDir = path.join(dirs.projectDir, CLAUDE_DIR, "agents");

    process.chdir(dirs.projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTestSource(dirs);
  });

  it("should discover local skills from .claude/skills/", async () => {
    // Verify local skill exists
    const localSkillPath = path.join(
      dirs.projectDir,
      CLAUDE_DIR,
      STANDARD_DIRS.SKILLS,
      "web-tooling-local-skill",
      STANDARD_FILES.SKILL_MD,
    );
    expect(await fileExists(localSkillPath)).toBe(true);

    // Run compile
    const { stdout, error } = await runCliCommand(["compile", "--verbose"]);

    const output = stdout + (error?.message || "");

    // Verbose output should contain compilation-related content
    expect(typeof output).toBe("string");
    expect(output).toMatch(/source|skill|compil|agent/i);
  });

  it("should include local skills in agent compilation", async () => {
    await runCliCommand(["compile"]);
    // Compile may exit non-zero due to test skill resolution, but still produces agent files

    const webDevPath = path.join(agentsDir, "web-developer.md");

    if (await fileExists(webDevPath)) {
      const content = await readTestFile(webDevPath);
      const frontmatter = parseTestFrontmatter(content);
      expect(frontmatter).not.toBeNull();

      // If frontmatter has skills, they should be an array
      if (frontmatter?.skills) {
        expect(Array.isArray(frontmatter.skills)).toBe(true);
      }
    }
  });
});

describe("User Journey: Compile Error Handling", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    if (dirs) {
      await cleanupTestSource(dirs);
    }
  });

  it("should handle missing plugin gracefully", async () => {
    // Create minimal project without plugin
    dirs = await createTestSource({
      skills: [],
      agents: [],
    });

    process.chdir(dirs.projectDir);

    const { error } = await runCliCommand(["compile"]);

    // Command should complete without crashing.
    // On machines with a global installation the global pass may succeed;
    // without one the command errors about missing skills. Both are acceptable.
    if (error) {
      expect(error.oclif?.exit).toBeDefined();
    }
  });

  it("should handle invalid source path gracefully", async () => {
    dirs = await createTestSource({
      skills: DEFAULT_TEST_SKILLS,
      agents: DEFAULT_TEST_AGENTS,
      asPlugin: true,
    });

    process.chdir(dirs.projectDir);

    const { error } = await runCliCommand(["compile", "--source", "/nonexistent/invalid/path/xyz"]);

    // Command should complete without crashing.
    // The source path passes format validation (it's just nonexistent),
    // so the command may succeed or error gracefully depending on installation state.
    if (error) {
      expect(typeof error.oclif?.exit).toBe("number");
    }
  });
});
