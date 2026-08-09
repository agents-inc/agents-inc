import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readdir, readFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, directoryExists, fileExists } from "../test-fs-utils";
import { buildTestProjectConfig } from "../factories/config-factories.js";
import { EXIT_CODES } from "../../exit-codes";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import {
  VALID_LOCAL_SKILL,
  SKILL_WITHOUT_METADATA,
  SKILL_WITHOUT_METADATA_CUSTOM,
} from "../mock-data/mock-skills";
import { CLAUDE_DIR } from "../../../consts";
import { expectValidAgentMarkdown } from "../assertions";

describe("compile command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-compile-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("basic execution", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["compile"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should fail when no plugin exists", async () => {
      const { error } = await runCliCommand(["compile"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  describe("flag validation", () => {
    it("should accept --verbose flag", async () => {
      const { error } = await runCliCommand(["compile", "--verbose"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["compile", "-v"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("rejects --source — a recompile reads the source its config records", async () => {
      const { error } = await runCliCommand(["compile", "--source", "/some/path"]);

      expect(error?.message).toContain("Nonexistent flag: --source");
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("rejects the -s shorthand for the same reason", async () => {
      const { error } = await runCliCommand(["compile", "-s", "/some/path"]);

      expect(error?.message).toContain("Nonexistent flag: -s");
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("rejects --refresh, which no command carries any more", async () => {
      const { error } = await runCliCommand(["compile", "--refresh"]);

      expect(error?.message).toContain("Nonexistent flag: --refresh");
    });
  });

  describe("metadata.yaml requirement for local skills", () => {
    // The project config declares an agent so the project is detected as an
    // installation (a config that declares neither skills nor agents is
    // content-less and is not treated as installed). Compile then discovers the
    // on-disk local skills these cases exercise, same as the sibling
    // "compilation output" cases above.
    let localDirs: TestDirs;

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    it("should include a skill that has both SKILL.md and metadata.yaml", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      const output = stdout + (error?.message || "");
      // Skill should be discovered (not skipped)
      expect(output).not.toContain("missing metadata.yaml");
      expect(output).toContain("Discovered 1 local skill");
    });

    it("should skip a skill with SKILL.md but no metadata.yaml and emit a warning", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [SKILL_WITHOUT_METADATA],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stderr, stdout, error } = await runCliCommand(["compile"]);

      const allOutput = stdout + stderr + (error?.message || "");
      // Warning should be emitted with the skill name and mention metadata.yaml
      expect(allOutput).toContain("web-tooling-incomplete");
      expect(allOutput).toContain("metadata.yaml");
      expect(allOutput).toContain("skipped");
    });

    it("should include the skill directory path in the warning message", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [SKILL_WITHOUT_METADATA_CUSTOM],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stderr, stdout, error } = await runCliCommand(["compile"]);

      const allOutput = stdout + stderr + (error?.message || "");
      // Warning should contain the skill name
      expect(allOutput).toContain("web-tooling-custom");
      // Warning should contain the path hint
      expect(allOutput).toContain(".claude/skills/");
    });
  });

  describe("compilation output", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    it("should produce compiled agent files in .claude/agents/", async () => {
      localDirs = await createTestSource({
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer", "api-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      const output = stdout + (error?.message || "");
      expect(output).toMatch(/\d+ project agents rewritten, \d+ unchanged/);
      expect(output).toContain("compile complete");

      const agentsDir = path.join(localDirs.projectDir, CLAUDE_DIR, "agents");
      expect(await directoryExists(agentsDir)).toBe(true);

      const entries = await readdir(agentsDir);
      expect(entries).toContain("web-developer.md");
      expect(entries).toContain("api-developer.md");
    });

    it("should produce non-empty agent markdown files with frontmatter", async () => {
      localDirs = await createTestSource({
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      await runCliCommand(["compile"]);

      const agentPath = path.join(localDirs.projectDir, CLAUDE_DIR, "agents", "web-developer.md");
      expect(await fileExists(agentPath)).toBe(true);

      const content = await readFile(agentPath, "utf-8");
      expectValidAgentMarkdown(content, "web-developer");
    });

    it("should report discovery and compilation counts in output", async () => {
      localDirs = await createTestSource({
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      const output = stdout + (error?.message || "");
      expect(output).toContain("Discovered 1 local skill");
      // First compile of a fresh source, so every agent is a genuine write — the
      // summary's two numbers are what it counts, not the roster it walked.
      expect(output).toMatch(/[1-9]\d* project agents rewritten, 0 unchanged/);
    });
  });

  describe("error handling", () => {
    it("should error when no skills found", async () => {
      const { error } = await runCliCommand(["compile"]);
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should include actionable guidance in error message", async () => {
      const { error } = await runCliCommand(["compile"]);
      // Without installation, command errors with guidance to run init first
      expect(error?.message).toContain("No installation found");
    });
  });
});
