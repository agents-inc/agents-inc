import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * A selection the matrix rejects is advisory: it does not stop the install, and the user only
 * learns about it because the command says so afterwards. `edit` always did; `init` used to
 * install in silence, which meant the same broken roster was reported or not depending on which
 * command the user happened to reach it through.
 *
 * The source below binds React to a framework the stack never selects, so the default selection
 * carries exactly one unmet requirement. Every skill is ejected at the sources step: the warning
 * is owed before any install work, and eject mode needs no marketplace, so this spec neither
 * shells out to the Claude CLI nor depends on one being installed.
 */

/** One unmet requirement in the default selection: React needs a framework the stack omits. */
const UNMET_REQUIREMENT_RULES = {
  requires: [
    {
      skill: E2E_SKILL.react.slug,
      needs: [E2E_SKILL["vue-composition-api"].slug],
      reason: "React needs the Vue composition API — deliberately unmet",
    },
  ],
};

/** The line the post-wizard report owes the user, worded by the validator itself. */
const EXPECTED_VALIDATION_WARNING = `${E2E_SKILL.react.display} ${STEP_TEXT.VALIDATION_REQUIRES} ${E2E_SKILL["vue-composition-api"].display}`;

describe("init surfaces a rejected selection after the wizard", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource({ relationships: UNMET_REQUIREMENT_RULES });
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "warns that the selected skill's requirement is unmet, and still installs",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject({
        source: { sourceDir, tempDir: sourceTempDir },
        ...TERMINAL_SIZE.TALL,
      });

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.output).toContain(EXPECTED_VALIDATION_WARNING);
      expect(result.output).toContain(STEP_TEXT.INIT_SUCCESS);
    },
  );
});
