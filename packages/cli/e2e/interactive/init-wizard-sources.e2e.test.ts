import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import type { SourcesStep } from "../pages/steps/sources-step.js";
import { STEP_TEXT, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

describe("init wizard — source management", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  /**
   * Navigate to the sources step via: Stack -> Domain -> Build (all domains) -> Sources
   */
  async function navigateToSources(): Promise<{
    wizard: InitWizard;
    sources: SourcesStep;
  }> {
    const w = await InitWizard.launchInProject();
    const domain = await w.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomains();
    return { wizard: w, sources };
  }

  describe("source management — outcome verification", () => {
    it(
      "should complete install with all local sources after pressing L hotkey",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const { wizard: w, sources } = await navigateToSources();
        wizard = w;

        // Press "l" to set ALL sources to local
        await sources.setAllLocal();

        // Continue through: Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(STEP_TEXT.SKILLS_COPIED_TO);
        expect(output).not.toContain(STEP_TEXT.INSTALLING_PLUGINS);

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          source: "eject",
        });
        await expect({ dir: w.globalHome }).toHaveCompiledAgent("web-developer");
        await expect({ dir: w.globalHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      },
    );
  });
});
