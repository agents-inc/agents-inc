import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, EXIT_CODES } from "../pages/constants.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";

describe("init wizard — navigation", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("Ctrl+C abort", () => {
    it("should exit the wizard without creating files", async () => {
      wizard = await InitWizard.launch();

      wizard.abort();

      const exitCode = await wizard.waitForExit();
      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("Escape navigation", () => {
    it("should go back from domain selection to stack selection", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const stack = await domain.goBack();

      const output = stack.getOutput();
      expect(output).toContain(STEP_TEXT.STACK);
    });

    it("should go back from build step to domain selection", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      await build.goBack();

      const output = build.getOutput();
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
    });

    it("should go back from confirm step to agents step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      await confirm.goBack();

      // After going back from confirm, we should see the agents step
      const output = confirm.getOutput();
      expect(output).toContain(STEP_TEXT.AGENTS);
    });

    it("should cancel wizard when pressing Escape on initial stack selection", async () => {
      wizard = await InitWizard.launch();

      await wizard.stack.cancel();

      const exitCode = await wizard.waitForExit();
      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });
  });
});
