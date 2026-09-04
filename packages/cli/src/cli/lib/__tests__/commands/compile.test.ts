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
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import { expectValidAgentMarkdown } from "../assertions";
import { writeTestTsConfig } from "../helpers/config-io.js";

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

  /**
   * The type unions in `config-types.ts` are derived from the seated catalogue, so a
   * pass that could not seat one has nothing to derive them from. Writing them anyway
   * narrows every union to what the built-in catalogue happens to carry — dropping every
   * marketplace-only and local category — and at global scope propagates that into every
   * registered project, from a failure that used to be a warning and no write.
   *
   * Which assertion carries the red: `config-types.ts` existing at all after the run.
   */
  describe("a failed matrix seat", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    /** A marketplace path nothing is at, so the seat's fetch refuses before any matrix exists. */
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

      const output = stdout + stderr + (error?.message || "");
      expect(output, "the run must say why the catalogue could not be loaded").toContain(
        "Local marketplace not found",
      );
      expect(
        await fileExists(
          path.join(localDirs.projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS),
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
