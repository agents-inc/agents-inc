import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  ensureBinaryExists,
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { CLI_INVOKE_COMMAND } from "../../src/cli/consts.js";
import "../matchers/setup.js";
import path from "path";

/**
 * E2E tests for the `edit` command wizard — launch, display, and error handling.
 *
 * Tests wizard startup, error states, skill display, custom source loading,
 * help output, and global config fallback.
 */
describe("edit wizard — launch and display", () => {
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;
  let sourceTempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (sourceTempDir) {
      await cleanupTempDir(sourceTempDir);
      sourceTempDir = undefined;
    }
  });

  describe("no installation", () => {
    it("should error when no installation exists", async () => {
      tempDir = await createTempDir();
      const emptyDir = path.join(tempDir, "empty");
      await mkdir(emptyDir, { recursive: true });

      const result = await CLI.run(["edit"], { dir: emptyDir });

      expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(result.output).toContain(STEP_TEXT.NO_INSTALLATION);
      expect(result.output).toContain(`${CLI_INVOKE_COMMAND} init`);
    });
  });

  describe("wizard launch", () => {
    it("should display startup messages for an existing installation", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir });

      const output = wizard.build.getOutput();
      expect(output).toContain("Framework");
    });

    it("should show skills loaded status", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir });

      const output = wizard.build.getOutput();
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
    });

    it("should show pre-selected skills in the build step", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 40, cols: 120 });

      const output = wizard.build.getOutput();
      // Framework category should show the pre-selected skill count
      expect(output).toMatch(/Framework.*\(1 of 1\)/);
      // The React skill tag should be visible
      expect(output).toContain("React");
    });

    it("should reach the build step wizard view", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 40, cols: 120 });

      const output = wizard.build.getOutput();
      // Should show the domain tab bar with Web selected
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
      // Should show the build step navigation instructions
      expect(output).toContain("SPACE");
      expect(output).toContain("ENTER");
      expect(output).toContain("ESC");
      // Should show the wizard step indicators
      expect(output).toContain("Skills");
      expect(output).toContain("Confirm");
    });
  });

  describe("multiple installed skills", () => {
    it("should handle edit with multiple installed skills", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 60, cols: 120 });

      const output = wizard.build.getOutput();
      // Framework category should show the pre-selected react skill
      expect(output).toMatch(/Framework.*\(1 of 1\)/);
      // Testing category should be visible
      expect(output).toContain("Testing");
      // Both skill tags should be visible
      expect(output).toContain("React");
      expect(output).toContain("Vitest");
    });
  });

  describe("--source flag", () => {
    it("should load skills from custom source directory", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      const source = await createE2ESource();
      sourceTempDir = source.tempDir;

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source,
        rows: 60,
        cols: 120,
      });

      const output = wizard.build.getOutput();
      // The E2E source includes web-framework-react — the build step should show
      // skills from the custom source
      expect(output).toContain("Framework");
      // E2E source uses skill IDs as displayNames (e.g. "web-framework-react")
      expect(output).toContain("react");
    });
  });

  describe("newly added skill", () => {
    it("should show a new local skill alongside original skills in build step", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      // Create an additional local skill that was NOT in the original config.
      await createLocalSkill(project.dir, "web-testing-vitest", {
        description: "Next generation testing framework",
        metadata: `author: "@test"\ndisplayName: web-testing-vitest\nslug: vitest\ncategory: web-testing\ndomain: web\ncontentHash: "e2e-hash-vitest"\n`,
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 60, cols: 120 });

      const output = wizard.build.getOutput();
      // The original pre-selected skill should still be visible
      expect(output).toContain("React");
      // The newly added skill tag should be visible in the build step.
      expect(output).toContain("Vitest");
    });
  });

  describe("edit --help", () => {
    it("should display help text with command description", async () => {
      tempDir = await createTempDir();

      const result = await CLI.run(["edit", "--help"], { dir: tempDir });

      expect(result.output).toContain("edit");
      expect(result.output).toContain("Edit skills");
      expect(result.output).toContain("--source");
      expect(result.output).toContain("--refresh");
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("global installation fallback", () => {
    it("should load wizard using global config when no project config exists", async () => {
      // Create a global installation (acts as HOME)
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      // Create a working directory WITHOUT config (forces global fallback)
      const workDir = path.join(tempDir, "work");
      await mkdir(workDir, { recursive: true });

      // Launch edit with HOME pointing to the global project directory
      wizard = await EditWizard.launch({
        projectDir: workDir,
        env: { HOME: project.dir },
      });

      const output = wizard.build.getOutput();
      // Global config's React skill should be pre-selected in the build step
      expect(output).toContain("React");
    });
  });
});
