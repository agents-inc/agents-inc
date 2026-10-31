import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { readdir, readFile } from "fs/promises";
import { missingArgsRefusal, parseRefusal, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { directoryExists, fileExists } from "../test-fs-utils";
import { buildTestProjectConfig } from "../factories/config-factories.js";
import { EXIT_CODES } from "../../exit-codes";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import {
  VALID_LOCAL_SKILL,
  SKILL_WITHOUT_METADATA,
  SKILL_WITHOUT_METADATA_CUSTOM,
} from "../mock-data/mock-skills";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { expectValidAgentMarkdown } from "../assertions";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { SKILLS } from "../test-fixtures";
import { sourceDir } from "../../installation/install-layout.js";

describe("compile command", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ cleanup } = await setupIsolatedHome("cc-compile-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("basic execution", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["compile"]);

      const output = error?.message || "";
      expect(
        output,
        "a recompile takes its target from the config, never from a positional",
      ).not.toContain(missingArgsRefusal(1));
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
      expect(output).not.toContain(parseRefusal("--verbose"));
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["compile", "-v"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-v"));
    });

    it("rejects --source — a recompile reads the source its config records", async () => {
      const { error } = await runCliCommand(["compile", "--source", "/some/path"]);

      expect(error?.message).toContain(parseRefusal("--source"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("rejects the -s shorthand for the same reason", async () => {
      const { error } = await runCliCommand(["compile", "-s", "/some/path"]);

      expect(error?.message).toContain(parseRefusal("-s"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("rejects --refresh, which no command carries any more", async () => {
      const { error } = await runCliCommand(["compile", "--refresh"]);

      expect(error?.message).toContain(parseRefusal("--refresh"));
    });
  });

  describe("metadata.yaml requirement for local skills", () => {
    // The declared agent makes the project count as an installation.
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

      const { stdout, stderr, error } = await runCliCommand(["compile"]);

      const output = stdout + stderr + (error?.message || "");
      expect(output).not.toContain("registered with the CLI (no metadata.yaml)");
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");
    });

    it("says one line for the folder it skipped for having no metadata.yaml, without naming it", async () => {
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
      expect(allOutput).toContain(
        "Warning: Skipped 1 skill in '.claude/skills/' that isn't registered with the CLI (no metadata.yaml).\n",
      );
      expect(allOutput, "the folder is named only under --verbose").not.toContain(
        "web-tooling-incomplete",
      );
    });

    it("names the skipped folder under --verbose, beside the same one line", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [SKILL_WITHOUT_METADATA_CUSTOM],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      process.chdir(localDirs.projectDir);

      const { stderr, stdout, error } = await runCliCommand(["compile", "--verbose"]);

      const allOutput = stdout + stderr + (error?.message || "");
      expect(allOutput).toContain(
        "Warning: Skipped 1 skill in '.claude/skills/' that isn't registered with the CLI (no metadata.yaml).\n",
      );
      expect(allOutput).toContain("web-tooling-custom");
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
      expect(output).toMatch(/\d+ project agents? rewritten, \d+ unchanged/);
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
      expect(output).not.toContain("Discovered 1 local skills");
      // A fresh source, so every agent is a genuine write.
      expect(output).toMatch(/[1-9]\d* project agents? rewritten, 0 unchanged/);
    });
  });

  /**
   * Without a seated catalogue, writing `config-types.ts` would narrow every union to the built-in
   * catalogue and, at global scope, propagate that into every registered project.
   */
  describe("a failed matrix seat", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    const missingMarketplaceIn = (tempDir: string) =>
      path.join(tempDir, "marketplace-that-is-gone");

    it("leaves config-types.ts unwritten rather than deriving the unions from the built-in catalogue", async () => {
      localDirs = await createTestSource({
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      await writeTestTsConfig(localDirs.projectDir, {
        ...buildTestProjectConfig(["web-developer"], []),
        marketplace: missingMarketplaceIn(localDirs.tempDir),
      });
      process.chdir(localDirs.projectDir);

      const { stdout, stderr, error } = await runCliCommand(["compile"]);

      // The warning carries a temp path, so where oclif wraps it depends on how long TMPDIR is.
      const output = flattenCliOutput(stdout + stderr + (error?.message || ""));
      expect(output, "the run must say why the catalogue could not be loaded").toContain(
        "Local marketplace not found",
      );
      expect(
        await fileExists(
          path.join(sourceDir(localDirs.projectDir, "claude"), STANDARD_FILES.CONFIG_TYPES_TS),
        ),
        "a pass with no catalogue must write no type unions",
      ).toBe(false);
      expect(output, "and must not claim it refreshed them").not.toContain(
        "Refreshed config-types.ts",
      );
      expect(output, "the unions it left alone may now be stale, and it must say so").toContain(
        "Could not refresh config-types.ts",
      );
    });

    it("still compiles the agents — the seat degrades the render, it does not abort the run", async () => {
      localDirs = await createTestSource({
        localSkills: [VALID_LOCAL_SKILL],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
        asPlugin: true,
      });
      await writeTestTsConfig(localDirs.projectDir, {
        ...buildTestProjectConfig(["web-developer"], []),
        marketplace: missingMarketplaceIn(localDirs.tempDir),
      });
      process.chdir(localDirs.projectDir);

      const { error } = await runCliCommand(["compile"]);

      expect(
        error,
        "a catalogue that cannot be loaded is a warning, not a refusal",
      ).toBeUndefined();
      const agentPath = path.join(localDirs.projectDir, CLAUDE_DIR, "agents", "web-developer.md");
      expect(await fileExists(agentPath)).toBe(true);
    });
  });

  /**
   * Pinned together: pinned-on agents with no skills still compile, while a config declaring skills
   * none of which is on disk is refused. Either alone passes a guard that swallowed the other.
   */
  describe("a pass that discovers no skills", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    it("compiles the sub-agents of an installation that declares no skills", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        projectConfig: buildTestProjectConfig(["web-developer"], []),
      });
      process.chdir(localDirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      expect(error, "a skill-less roster is something to compile, not nothing").toBeUndefined();
      expect(stdout).toContain("compile complete");
      const agentPath = path.join(localDirs.projectDir, CLAUDE_DIR, "agents", "web-developer.md");
      expect(await fileExists(agentPath)).toBe(true);
      expectValidAgentMarkdown(await readFile(agentPath, "utf-8"), "web-developer");
    });

    it("refuses an installation whose declared skills are all missing from disk", async () => {
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        projectConfig: buildTestProjectConfig(["web-developer"], [SKILLS.react.id]),
      });
      process.chdir(localDirs.projectDir);

      const { error } = await runCliCommand(["compile"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("No skills found. Run");
      expect(
        await directoryExists(path.join(localDirs.projectDir, CLAUDE_DIR, "agents")),
        "a refused pass must not rewrite a sub-agent without the skills its config names",
      ).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should error when no skills found", async () => {
      const { error } = await runCliCommand(["compile"]);
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should include actionable guidance in error message", async () => {
      const { error } = await runCliCommand(["compile"]);
      expect(error?.message).toContain("No installation found");
    });
  });
});
