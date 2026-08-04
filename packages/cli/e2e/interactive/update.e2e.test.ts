import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  createLocalSkill,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";

/**
 * E2E tests for the `update` command.
 *
 * The update command checks local skills against source for available updates.
 * It shows an interactive confirmation prompt (unless --yes is passed).
 *
 * These tests spawn the actual CLI binary (zero mocks).
 *
 * Note: The update confirmation prompt is NOT the wizard, so interactive tests
 * use InteractivePrompt (which wraps TerminalSession internally).
 */

/**
 * Metadata for a local skill forked from `forkedFromId` at a stale hash
 * ("0000000"), so `update` flags it as outdated against the E2E source.
 */
function outdatedForkMetadata(displayName: string, forkedFromId: string): string {
  return [
    'author: "@agents-inc"',
    `displayName: ${displayName}`,
    "forkedFrom:",
    `  skillId: ${forkedFromId}`,
    '  contentHash: "0000000"',
    "  date: 2025-01-01",
  ].join("\n");
}

describe("update command", () => {
  let tempDir: string;
  let prompt: InteractivePrompt | undefined;
  let sourceTempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
    if (sourceTempDir) {
      await cleanupTempDir(sourceTempDir);
      sourceTempDir = undefined;
    }
  });

  describe("update --help", () => {
    it("should display help text with command description", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["update", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Update local skills from source");
      expect(stdout).toContain("--yes");
      expect(stdout).toContain("--source");
    });
  });

  describe("update --yes with no installation", () => {
    it("should warn when no local skills exist", async () => {
      tempDir = await createTempDir();

      const { exitCode, output } = await CLI.run(["update", "--yes"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("No local skills found");
    });
  });

  describe("interactive update", () => {
    it("should launch and show loading status for a project with skills", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["update"], projectDir);

      await prompt.waitForText(STEP_TEXT.LOADING_SKILLS, TIMEOUTS.WIZARD_LOAD);
    });

    it("should report all skills up to date when no outdated skills exist", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["update", "--yes"], projectDir);

      await prompt.waitForText("skills", TIMEOUTS.WIZARD_LOAD);

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      const output = prompt.getOutput();

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("up to date");
    });
  });

  describe("update with nonexistent skill name", () => {
    it("should show error containing the skill name", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, output } = await CLI.run(
        ["update", "nonexistent-skill-xyz", "--source", source.sourceDir],
        { dir: projectDir },
      );

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("nonexistent-skill-xyz");
      expect(output).toContain("not found");
    });

    it("should suggest similar skills via Did you mean", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, output } = await CLI.run(
        ["update", "framework", "--source", source.sourceDir],
        { dir: projectDir },
      );

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Did you mean");
    });
  });

  describe("update local-only skill", () => {
    it("should report that a local-only skill cannot be updated", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "cli-framework-cli-commander", {
        description: "A purely local skill with no source link",
      });

      const { exitCode, output } = await CLI.run(
        ["update", "cli-framework-cli-commander", "--source", source.sourceDir],
        { dir: projectDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("local-only");
      expect(output).toContain("Cannot update");
    });
  });

  describe("update with --source flag", () => {
    it("should use custom source directory and complete without error", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, output } = await CLI.run(
        ["update", "--yes", "--source", source.sourceDir],
        { dir: projectDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.LOADED_LOCAL);
    });
  });

  describe("update with multiple outdated skills", () => {
    it("should update all outdated skills when multiple exist", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;

      const project = await ProjectBuilder.editable({
        skills: [],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "web-meta-framework-nextjs", {
        metadata: outdatedForkMetadata("web-meta-framework-nextjs", "web-framework-react"),
      });

      await createLocalSkill(projectDir, "web-testing-cypress-e2e", {
        metadata: outdatedForkMetadata("web-testing-cypress-e2e", "web-testing-vitest"),
      });

      const { exitCode, output } = await CLI.run(
        ["update", "--yes", "--source", source.sourceDir],
        { dir: projectDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Updating web-framework-react");
      expect(output).toContain("Updating web-testing-vitest");
      expect(output).toContain("2 skill(s) updated");
    });
  });

  describe("update with exact skill name", () => {
    it("should update only the specified skill", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: [],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "web-meta-framework-nextjs", {
        metadata: outdatedForkMetadata("web-meta-framework-nextjs", "web-framework-react"),
      });

      const { exitCode, output } = await CLI.run(
        ["update", "web-framework-react", "--source", source.sourceDir, "--yes"],
        { dir: projectDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Updating web-framework-react");
      expect(output).toContain("1 skill(s) updated");
    });
  });

  describe("interactive update with outdated skills", () => {
    it("should show outdated skill table and confirmation prompt", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: [],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "web-meta-framework-nextjs", {
        metadata: outdatedForkMetadata("web-meta-framework-nextjs", "web-framework-react"),
      });

      prompt = new InteractivePrompt(["update", "--source", source.sourceDir], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UPDATE, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      expect(output).toContain("web-framework-react");
      expect(output).toContain(STEP_TEXT.CONFIRM_UPDATE);
    });

    it("should confirm and update all outdated skills interactively", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: [],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createLocalSkill(projectDir, "web-meta-framework-nextjs", {
        metadata: outdatedForkMetadata("web-meta-framework-nextjs", "web-framework-react"),
      });

      await createLocalSkill(projectDir, "web-testing-cypress-e2e", {
        metadata: outdatedForkMetadata("web-testing-cypress-e2e", "web-testing-vitest"),
      });

      prompt = new InteractivePrompt(["update", "--source", source.sourceDir], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UPDATE, TIMEOUTS.WIZARD_LOAD);

      await prompt.confirm();

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      const output = prompt.getOutput();

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Updating web-framework-react");
      expect(output).toContain("Updating web-testing-vitest");
      expect(output).toContain("2 skill(s) updated");
    });

    it("should use custom source via --source flag in interactive mode", async () => {
      const source = await createE2ESource();
      sourceTempDir = source.tempDir;
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["update", "--source", source.sourceDir], projectDir);

      await prompt.waitForText(STEP_TEXT.LOADED_LOCAL, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      expect(output).toContain(source.sourceDir);
    });
  });

  describe("cancellation", () => {
    it("should exit when Ctrl+C is pressed during source resolution", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(
        ["update", "--source", "https://example.invalid/nonexistent-repo.git"],
        projectDir,
      );

      await prompt.waitForText(STEP_TEXT.LOADING_SKILLS, TIMEOUTS.WIZARD_LOAD);

      await prompt.ctrlC();

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      // Ctrl+C during network fetch may exit 0 (clean cancellation) or 1 (interrupted)
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.ERROR]).toContain(exitCode);
    });
  });
});
