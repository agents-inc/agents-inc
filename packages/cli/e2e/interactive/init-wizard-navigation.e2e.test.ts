import { describe, it, expect, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, EXIT_CODES } from "../pages/constants.js";

describe("init wizard — navigation", () => {
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("Ctrl+C abort", () => {
    /**
     * The name is what this test asserts and no more. It used to read "should exit the wizard
     * without creating files", which claimed a filesystem guarantee it never looked at — and
     * could not have, because `abortAndDestroy` deletes the temp tree before returning, so the
     * directories any such assertion would read are gone by the time the test body resumes. A
     * name that promises more than the body checks is worse than a narrow one: the next reader
     * takes the claim as covered and writes nothing.
     *
     * That guarantee IS covered, from scratch and at both scopes, by
     * `lifecycle/cancelled-init-blank-global-config` — which asserts the absent project
     * `config.ts` and the absent skills and agents directories under both the project and the
     * fake HOME before it tears anything down. This test is the reachability half only: Ctrl+C
     * on the wizard's first frame ends the process rather than hanging it.
     */
    it("should exit as cancelled when Ctrl+C is pressed on the first step", async () => {
      wizard = await InitWizard.launch();

      // abortAndDestroy pins the exit code to CANCELLED itself, so it carries the
      // verdict for this test. A copy here could never go red — the funnel throws
      // first — and would read as coverage while providing none.
      await wizard.abortAndDestroy();
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

      // Escape-to-cancel does NOT go through abortAndDestroy, so this is the one
      // aborted-session path the funnel's assertion cannot reach — it is pinned here.
      const exitCode = await wizard.waitForExit();
      expect(exitCode, "cancelling the stack step with Escape must exit as cancelled").toBe(
        EXIT_CODES.CANCELLED,
      );
    });
  });
});
