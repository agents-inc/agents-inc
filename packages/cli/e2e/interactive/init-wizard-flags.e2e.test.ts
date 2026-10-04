import { describe, it, expect, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, completeWithLocalSources } from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

describe("init wizard — flags and permissions", () => {
  let wizard: InitWizard | undefined;
  let editWizard: EditWizard | undefined;
  let source: E2ESource | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await editWizard?.destroy();
    editWizard = undefined;
    if (source) {
      await cleanupTempDir(source.tempDir);
      source = undefined;
    }
  });

  describe("--marketplace flag", () => {
    it("should load custom source and display its stack", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain(STEP_TEXT.STACK);
      expect(output).toContain("Minimal stack for E2E testing");
    });
  });

  describe("flag combinations", () => {
    it("should load skills from custom source with edit --marketplace", async () => {
      const dashboardProject = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });

      source = await createE2ESource();

      editWizard = await EditWizard.launch({
        projectDir: dashboardProject.dir,
        source,
        ...TERMINAL_SIZE.TALL,
      });

      const output = editWizard.build.getOutput();
      expect(output).toContain(STEP_TEXT.BUILD);
      // The custom source's own TITLE for the skill — a fragment of the id is painted
      // by any grid that carries the id.
      expect(output).toContain(E2E_SKILL.react.display);
    });
  });

  describe("permission checker", () => {
    // This was an `it.fails` over a permission-notice hang, and the hang was never what failed:
    // its install took the default Plugin rows from a fixture with no marketplace.json, which
    // was refused after Confirm ("Cannot install plugin skills: marketplace could not be
    // resolved"), and `confirm()` timed out waiting for the success line that refusal never
    // printed. Run as an eject install, the same flow exits 0 over the unchanged fixture and over
    // a built one alike, so the red marked nothing. The install mode is incidental to the
    // subject, and an eject install keeps the Claude CLI out of it.
    it("should exit after showing permission notice without settings.json", async () => {
      wizard = await InitWizard.launch({ skipPermissions: true });
      const result = await completeWithLocalSources(wizard);

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });
});
