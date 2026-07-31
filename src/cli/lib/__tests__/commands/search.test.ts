import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCliCommand } from "../helpers/cli-runner.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { EXIT_CODES } from "../../exit-codes";

const COMMAND_TIMEOUT = 30_000;

describe("search command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-search-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("argument validation", () => {
    it(
      "should exit with error when query arg is missing",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stderr, error } = await runCliCommand(["search"]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
        const output = stderr + (error?.message ?? "");
        expect(output).toContain("Missing 1 required arg");
      },
    );

    it("should accept the query positional", { timeout: COMMAND_TIMEOUT }, async () => {
      const sourceDirs = await createTestSource({ skills: DEFAULT_TEST_SKILLS });
      try {
        await writeTestTsConfig(projectDir, {
          name: "test-project",
          skills: [],
          agents: [],
          source: sourceDirs.sourceDir,
        });

        const { stdout, error } = await runCliCommand(["search", "react"]);

        expect(error).toBeUndefined();
        // The table prints headers when there are matches
        expect(stdout).toContain("ID");
        expect(stdout).toContain("Source");
        expect(stdout).toContain("Category");
        expect(stdout).toContain("Description");
      } finally {
        await cleanupTestSource(sourceDirs);
      }
    });
  });

  describe("output format", () => {
    it("should show loading message when starting", { timeout: COMMAND_TIMEOUT }, async () => {
      const { stdout } = await runCliCommand(["search", "anything"]);

      // Should show loading message as first output
      expect(stdout.toLowerCase()).toContain("loading");
    });
  });

  describe("with test source", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({ skills: DEFAULT_TEST_SKILLS });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: sourceDirs.sourceDir,
      });
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    it("should return results matching query", { timeout: COMMAND_TIMEOUT }, async () => {
      const { stdout, error } = await runCliCommand(["search", "react"]);

      expect(error).toBeUndefined();
      expect(stdout.toLowerCase()).toContain("react");
    });

    it(
      "should return no results for unlikely query without crashing",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stdout, stderr, error } = await runCliCommand(["search", "zzz-unlikely-query-xyz"]);

        // Should complete without crashing — warns about no results
        expect(error).toBeUndefined();
        // this.warn() writes to stderr in oclif
        const output = stdout + stderr;
        expect(output.toLowerCase()).toContain("no skills found");
      },
    );
  });
});
