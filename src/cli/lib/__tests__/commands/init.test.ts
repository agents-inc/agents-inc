import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { getDashboardData, formatDashboardText } from "../../../commands/init";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import { renderConfigTs } from "../content-generators";
import { EXPECTED_SKILLS } from "../expected-values";

describe("init command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("already initialized — dashboard", () => {
    it("should show dashboard when project is already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        'export default { name: "test-project" };',
      );

      const { stdout, stderr, error } = await runCliCommand(["init"]);

      // Should NOT have an error exit code — dashboard exits with SUCCESS
      expect(error?.oclif?.exit).toBeUndefined();

      const combinedOutput = stdout + stderr + (error?.message || "");
      expect(combinedOutput).toContain("Agents Inc.");
      expect(combinedOutput).toContain("Skills:");
      expect(combinedOutput).toContain("Agents:");
      expect(combinedOutput).toContain("[Edit]");
      expect(combinedOutput).toContain("[Compile]");
      expect(combinedOutput).toContain("[Doctor]");
      expect(combinedOutput).toContain("[List]");
    });

    it("should show skill and agent counts in dashboard", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        }),
      );

      // Install the declared skills — the dashboard reports what is on disk
      for (const skillId of EXPECTED_SKILLS.WEB_DEFAULT) {
        await mkdir(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId), {
          recursive: true,
        });
      }

      // Create compiled agents
      const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Web Developer");
      await writeFile(path.join(agentsDir, "api-developer.md"), "# API Developer");

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(2);
      expect(data.agentCount).toBe(2);
      expect(data.mode).toBe("eject");

      const text = formatDashboardText(data);
      expect(text).toContain("2 installed");
      expect(text).toContain("2 compiled");
    });

    it("should show source when configured", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: [],
          source: TEST_SOURCE_URL,
        }),
      );

      const data = await getDashboardData(projectDir);
      expect(data.source).toBe("github:agents-inc/skills");

      const text = formatDashboardText(data);
      expect(text).toContain("github:agents-inc/skills");
    });

    it("should not modify existing config when already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const originalContent = 'export default { name: "test-project" };';
      await writeFile(configPath, originalContent);

      await runCliCommand(["init"]);

      const { readFile } = await import("fs/promises");
      const content = await readFile(configPath, "utf-8");
      expect(content).toBe(originalContent);
    });

    it("should exit with SUCCESS when already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        'export default { name: "test-project" };',
      );

      const { error } = await runCliCommand(["init"]);

      // No error exit code — dashboard exits cleanly
      expect(error?.oclif?.exit).toBeUndefined();
    });

    it("should show 0 counts when skills and agents are empty", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({ name: "test-project", skills: [] }),
      );

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(0);
      expect(data.agentCount).toBe(0);

      const text = formatDashboardText(data);
      expect(text).toContain("0 installed");
      expect(text).toContain("0 compiled");
    });
  });

  describe("formatDashboardText", () => {
    it("should format dashboard with all fields", () => {
      const text = formatDashboardText({
        skillCount: 12,
        agentCount: 3,
        mode: "plugin",
        source: TEST_SOURCE_URL,
      });

      expect(text).toContain("Agents Inc.");
      expect(text).toContain("12 installed");
      expect(text).toContain("3 compiled");
      expect(text).toContain("Plugin");
      expect(text).toContain("github:agents-inc/skills");
      expect(text).toContain("[Edit]");
      expect(text).toContain("[Compile]");
      expect(text).toContain("[Doctor]");
      expect(text).toContain("[List]");
    });

    it("should omit source line when not configured", () => {
      const text = formatDashboardText({
        skillCount: 0,
        agentCount: 0,
        mode: "eject",
      });

      expect(text).toContain("Eject");
      expect(text).not.toContain("Source:");
    });

    it("should show Eject for eject mode", () => {
      const text = formatDashboardText({
        skillCount: 5,
        agentCount: 2,
        mode: "eject",
      });

      expect(text).toContain("Eject");
    });

    it("should show Plugin for plugin mode", () => {
      const text = formatDashboardText({
        skillCount: 5,
        agentCount: 2,
        mode: "plugin",
      });

      expect(text).toContain("Plugin");
    });
  });
});
