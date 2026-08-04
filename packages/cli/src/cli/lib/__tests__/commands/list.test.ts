import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { writeTestSkill } from "../helpers/disk-writers.js";
import { buildAgentConfigs } from "../factories/config-factories.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import { renderConfigTs } from "../content-generators";
import { VITEST_MATRIX } from "../mock-data/mock-matrices";

describe("list command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();

    tempDir = await createTempDir("cc-list-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    initializeMatrix(VITEST_MATRIX);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("command behavior", () => {
    it("should run without error when no installation exists", async () => {
      const { error } = await runCliCommand(["list"]);

      // Command handles "no installation" gracefully (logs message, returns without error)
      expect(error).toBeUndefined();
    });

    it("should work with ls alias", async () => {
      const { error } = await runCliCommand(["ls"]);

      // Alias should work the same as the full command
      expect(error).toBeUndefined();
    });

    it("should show installation info when local installation exists", async () => {
      // Create a minimal local installation
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, "agents");
      const skillsDir = path.join(claudeDir, "skills");

      await mkdir(agentsDir, { recursive: true });
      await mkdir(skillsDir, { recursive: true });

      // Write minimal config
      const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(claudeSrcDir, { recursive: true });
      await writeFile(
        path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          agents: buildAgentConfigs(["web-developer"]),
        }),
      );

      // Write a test agent
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        "# Web Developer\n\nTest agent content.",
      );

      // Write a test skill
      await writeTestSkill(skillsDir, "web-testing-vitest");

      const { error } = await runCliCommand(["list"]);

      // Should run successfully with a local installation
      expect(error).toBeUndefined();
    });
  });

  describe("flags", () => {
    it("should accept --help flag", async () => {
      const { stdout } = await runCliCommand(["list", "--help"]);

      // Help should display command summary
      expect(stdout).toContain("Show installation information");
    });
  });
});
