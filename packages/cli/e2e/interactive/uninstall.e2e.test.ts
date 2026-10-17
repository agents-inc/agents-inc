import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT } from "../pages/constants.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { cleanupTempDir, directoryExists, sourceFolderIn } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * `uninstall`'s Ink confirmation through a PTY. Cancellations pin `EXIT_CODES.CANCELLED`, since
 * `not.toBe(SUCCESS)` cannot tell a decline from a crash; "confirm with y" is the permitted case.
 */
describe("uninstall interactive", () => {
  let tempDir: string;
  let prompt: InteractivePrompt | undefined;

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("confirmation prompt", () => {
    it("should show confirmation prompt with files to remove", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.UNINSTALL_PREVIEW, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      expect(output).toContain("CLI-managed files");
      expect(output).toContain(STEP_TEXT.CONFIRM_UNINSTALL);
    });

    it("should show the y/N prompt defaulting to cancel", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      expect(output).toContain("y/N");
    });
  });

  describe("cancel with n", () => {
    it("should cancel when user types n", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.pressEnter();

      await prompt.deny();

      await prompt.waitForText(STEP_TEXT.UNINSTALL_CANCELLED, TIMEOUTS.EXIT);

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      expect(exitCode, "a declined uninstall is a cancellation, not a failure").toBe(
        EXIT_CODES.CANCELLED,
      );
    });

    it("should preserve files after cancellation", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const skillsDir = path.join(projectDir, DIRS.CLAUDE, "skills");
      const agentsDir = path.join(projectDir, DIRS.CLAUDE, "agents");

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.pressEnter();

      await prompt.deny();

      await prompt.waitForExit(TIMEOUTS.EXIT);

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await directoryExists(sourceFolderIn(projectDir))).toBe(true);
    });

    it("should cancel when user presses Enter (default is cancel)", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.pressEnter();

      await prompt.pressEnter();

      await prompt.waitForText(STEP_TEXT.UNINSTALL_CANCELLED, TIMEOUTS.EXIT);

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      expect(exitCode, "the y/N default is a cancellation, not a failure").toBe(
        EXIT_CODES.CANCELLED,
      );
    });
  });

  describe("confirm with y", () => {
    it("should proceed when user types y", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();

      await prompt.waitForText(STEP_TEXT.UNINSTALL_SUCCESS, TIMEOUTS.EXIT);

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it("should remove CLI-managed files after confirming", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const skillsDir = path.join(projectDir, DIRS.CLAUDE, "skills");
      const agentsDir = path.join(projectDir, DIRS.CLAUDE, "agents");

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();

      await prompt.waitForExit(TIMEOUTS.EXIT);

      expect(await directoryExists(skillsDir)).toBe(false);
      expect(await directoryExists(agentsDir)).toBe(false);
      // The manifest goes too, emptying the source folder.
      await expectNoSourceFolder(
        projectDir,
        "removing the config manifest empties the source folder, so uninstall takes it away",
      );
    });
  });

  describe("config manifest in confirmation prompt", () => {
    it("should show config manifest removal in the confirmation prompt by default", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.UNINSTALL_PREVIEW, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);
      expect(output).toContain(".agents-inc/claude/config.ts");
    });
  });

  describe("Ctrl+C during confirmation", () => {
    it("should exit cleanly when Ctrl+C is pressed", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.pressEnter();

      await prompt.ctrlC();

      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);
      expect(
        exitCode,
        "Ctrl+C settles promptConfirm through its onExit fallback, which is the same cancellation the n key takes",
      ).toBe(EXIT_CODES.CANCELLED);
    });

    it("should preserve files after Ctrl+C", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const skillsDir = path.join(projectDir, DIRS.CLAUDE, "skills");
      const agentsDir = path.join(projectDir, DIRS.CLAUDE, "agents");

      prompt = new InteractivePrompt(["uninstall"], projectDir);

      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      await prompt.pressEnter();

      await prompt.ctrlC();

      await prompt.waitForExit(TIMEOUTS.EXIT);

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await directoryExists(sourceFolderIn(projectDir))).toBe(true);
    });
  });
});
