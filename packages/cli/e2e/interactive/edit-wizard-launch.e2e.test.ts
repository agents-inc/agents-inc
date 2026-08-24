import { mkdir } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  CLI_INVOKE_COMMAND,
  EXIT_CODES,
  STEP_TEXT,
  TERMINAL_SIZE,
  WIZARD_TAB_LABELS,
} from "../pages/constants.js";
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

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
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
    it("should open on the build step with the full wizard chrome painted", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 40, cols: 120 });

      const output = wizard.build.getOutput();
      expect(output).toContain(STEP_TEXT.BUILD);
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
      // The whole footer line rather than its three key captions: a step whose
      // rows bleed over the footer leaves each word present and splices the
      // overflow between them.
      expect(output).toContain(STEP_TEXT.FOOTER_HOTKEY_ROW);
      // Every tab, not the two this used to name — a tab bar missing the steps
      // a spec never mentions is indistinguishable from a complete one.
      for (const tabLabel of WIZARD_TAB_LABELS) {
        expect(output).toContain(tabLabel);
      }
    });

    it("should show pre-selected skills in the build step", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: [E2E_AGENT["web-developer"].name],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, rows: 40, cols: 120 });

      const output = wizard.build.getOutput();
      // The React skill tag should be visible
      expect(output).toContain("React");
      // Read the exclusive Framework category's own counter by name: the
      // `/Framework.*\(1 of 1\)/` this replaces matched any "(1 of 1)" painted
      // to the right of the header, including another category's on the same row.
      expect(await wizard.build.getExclusiveCategorySelectedCount("Framework")).toBe(1);
      // No scope-badge assertion here: this session runs against BUILT_IN_MATRIX
      // (no --marketplace), whose catalogue also holds "React Query" and "React
      // Native". getScopeBadgesForSkill matches a cell by substring, so it
      // resolves "React" to whichever of those the frame painted first and
      // reads that cell's badges. The badge form is pinned by
      // edit-wizard-detection.e2e.test.ts against the E2E source, where the
      // labels are collision-free.
    });
  });

  describe("multiple installed skills", () => {
    it("should handle edit with multiple installed skills", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: [E2E_AGENT["web-developer"].name],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({ projectDir: project.dir, ...TERMINAL_SIZE.TALL });

      const output = wizard.build.getOutput();
      // Framework category should show the pre-selected react skill
      expect(output).toMatch(/Framework.*\(1 of 1\)/);
      expect(output).toContain("React");

      // Testing sits below the fold of even the tall viewport, so scroll to it
      // rather than widening the terminal — the grid grows with the catalogue.
      await wizard.build.focusSkill("Vitest");
      const testingInView = wizard.build.getOutput();
      expect(testingInView).toContain("Testing");
      expect(testingInView).toContain("Vitest");
    });
  });

  describe("--marketplace flag", () => {
    it("should load skills from custom source directory", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: [E2E_AGENT["web-developer"].name],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      const output = wizard.build.getOutput();
      // The E2E source includes web-framework-react — the build step should show
      // skills from the custom source, by the TITLE that source gives them. A
      // fragment of the id would be painted by any grid carrying the id at all.
      expect(output).toContain(STEP_TEXT.BUILD);
      expect(output).toContain(E2E_SKILL.react.display);
    });
  });

  describe("newly added skill", () => {
    it("should show a new local skill alongside original skills in build step", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: [E2E_AGENT["web-developer"].name],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      // Create an additional local skill that was NOT in the original config.
      await createLocalSkill(project.dir, E2E_SKILL.vitest.id, {
        description: "Next generation testing framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: "vitest",
          contentHash: "e2e-hash-vitest",
        }),
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, ...TERMINAL_SIZE.TALL });

      const output = wizard.build.getOutput();
      // The original pre-selected skill should still be visible
      expect(output).toContain("React");

      // The newly added skill's category sits below the fold — scroll to it.
      await wizard.build.focusSkill("Vitest");
      expect(wizard.build.getOutput()).toContain("Vitest");
    });
  });

  describe("edit --help", () => {
    it("should display help text with command description", async () => {
      tempDir = await createTempDir();

      const result = await CLI.run(["edit", "--help"], { dir: tempDir });

      expect(result.output).toContain("edit");
      expect(result.output).toContain("Edit skills");
      expect(
        result.output,
        "naming a source is init's decision, so edit offers the catalogue config.ts names",
      ).not.toContain("--marketplace");
      expect(result.output, "every load revalidates, so there is nothing to force").not.toContain(
        "--refresh",
      );
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("global installation fallback", () => {
    it("should load wizard using global config when no project config exists", async () => {
      // Create a global installation (acts as HOME)
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: [E2E_AGENT["web-developer"].name],
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
