import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";

describe("init wizard — flags and permissions", () => {
  let wizard: InitWizard | undefined;
  let editWizard: EditWizard | undefined;
  let source: E2ESource | undefined;

  beforeAll(ensureBinaryExists);

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

  describe("--source flag", () => {
    it("should load custom source and display its stack", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain(STEP_TEXT.STACK);
      expect(output).toContain("Minimal stack for E2E testing");
    });
  });

  describe("flag combinations", () => {
    it("should load skills from custom source with edit --source", async () => {
      const dashboardProject = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      source = await createE2ESource();

      editWizard = await EditWizard.launch({
        projectDir: dashboardProject.dir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
        ...TERMINAL_SIZE.TALL,
      });

      const output = editWizard.build.getOutput();
      expect(output).toContain(STEP_TEXT.BUILD);
      expect(output).toContain("react");
    });
  });

  describe("permission checker", () => {
    // BUG: permission checker renders a blocking Ink component with no exit handler
    // when no .claude/settings.json exists. The component has no useInput/exit handler,
    // so the process hangs forever.
    it.fails("should exit after showing permission notice without settings.json", async () => {
      wizard = await InitWizard.launch({ skipPermissions: true });
      const result = await wizard.completeWithDefaults();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });
});
