import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT } from "../pages/constants.js";
import { cleanupTempDir, ensureBinaryExists, directoryExists } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the `uninstall` command interactive confirmation prompt.
 *
 * The uninstall command without --yes renders an Ink-based confirmation
 * prompt that shows what will be removed and asks "Are you sure you want
 * to uninstall?" using @inkjs/ui ConfirmInput (y/n keys).
 *
 * These tests spawn the actual CLI binary via PTY (zero mocks).
 *
 * Note: The uninstall confirmation is NOT the wizard, so it uses
 * InteractivePrompt (which wraps TerminalSession internally).
 *
 * **The three cancellations pin `EXIT_CODES.CANCELLED` at the call site rather than through a
 * funnel, and that is a decision rather than an omission.** The wizard was ruled the other way —
 * `expectCancelledExit` lives inside `abortAndDestroy()` — because thirty of its thirty-five
 * aborting specs never captured the exit code at all, so the verdict had to be moved somewhere
 * every abort passes through. Nothing of that shape is true here: all three sites already await
 * `waitForExit`, so none of them is MISSING the check, and what was wrong was its strength.
 * `not.toBe(SUCCESS)` cannot tell a clean decline from a crash on the confirm prompt — 1 and 4
 * both satisfy it — which is exactly what a command whose whole job is deleting files must not be
 * ambiguous about. A funnel would also have to live in `fixtures/interactive-prompt.ts`, hoisting
 * the verdict into a page object shared by every non-wizard prompt so that three specs could stop
 * writing one line each.
 *
 * The permitted case that makes these three mean anything is in this same file: "confirm with y"
 * exits SUCCESS and takes the directories with it. A refusal pinned alone cannot tell a guard that
 * is correctly scoped from one that declines everything.
 */
describe("uninstall interactive", () => {
  let tempDir: string;
  let prompt: InteractivePrompt | undefined;

  beforeAll(ensureBinaryExists);

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
      await prompt.pressEnter(); // Wait for stable render via transition delay

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
      await prompt.pressEnter(); // Wait for stable render via transition delay

      await prompt.deny();

      await prompt.waitForExit(TIMEOUTS.EXIT);

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(true);
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
      await prompt.pressEnter(); // Wait for stable render via transition delay

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
      // The config manifest is now removed by default, emptying .claude-src/
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(false);
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
      expect(output).toContain(DIRS.CLAUDE_SRC);
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
      await prompt.pressEnter(); // Wait for stable render via transition delay

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
      await prompt.pressEnter(); // Wait for stable render via transition delay

      await prompt.ctrlC();

      await prompt.waitForExit(TIMEOUTS.EXIT);

      expect(await directoryExists(skillsDir)).toBe(true);
      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(true);
    });
  });
});
