import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestSkill } from "../helpers/disk-writers.js";
import { buildAgentConfigs } from "../factories/config-factories.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { CLAUDE_DIR } from "../../../consts";
import { VITEST_MATRIX } from "../mock-data/mock-matrices";
import { writeTestTsConfig } from "../helpers/config-io.js";

describe("list command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-list-test-"));

    initializeMatrix(VITEST_MATRIX);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("command behavior", () => {
    it("should run without error when no installation exists", async () => {
      const { error } = await runCliCommand(["list"]);

      expect(error).toBeUndefined();
    });

    it("should work with ls alias", async () => {
      const { error } = await runCliCommand(["ls"]);

      expect(error).toBeUndefined();
    });

    it("should show installation info when local installation exists", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, "agents");
      const skillsDir = path.join(claudeDir, "skills");

      await mkdir(agentsDir, { recursive: true });
      await mkdir(skillsDir, { recursive: true });

      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
      });

      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        "# Web Developer\n\nTest agent content.",
      );

      await writeTestSkill(skillsDir, "web-testing-vitest");

      const { error } = await runCliCommand(["list"]);

      expect(error).toBeUndefined();
    });
  });

  describe("flags", () => {
    it("should accept --help flag", async () => {
      const { stdout } = await runCliCommand(["list", "--help"]);

      expect(stdout).toContain("Show installation information");
    });
  });
});
