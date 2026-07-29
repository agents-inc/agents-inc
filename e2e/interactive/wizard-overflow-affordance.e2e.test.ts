import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import type { ConfirmStep } from "../pages/steps/confirm-step.js";
import "../matchers/setup.js";

/**
 * Wizard overflow behaviour at a small-but-valid terminal height (D-263).
 *
 * The wizard refuses to render below 80 cols / 15 rows, so TERMINAL_SIZE.SHORT
 * is the smallest geometry that still exercises the real layout. At that height
 * the confirm step's summary is taller than the box it is drawn in, so the step
 * must clip its content to that box AND tell the user there is more below.
 *
 * The overflow affordance is text-only ("N more below") — no scroll glyph — so
 * the assertion matches on the affordance wording the wizard actually paints.
 */
describe("wizard overflow at a short terminal height", () => {
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;
  let source: E2ESource | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (source) {
      await cleanupTempDir(source.tempDir);
      source = undefined;
    }
  });

  /**
   * Drives the wizard to the confirm step with the stack's full default
   * selection, so the summary is guaranteed to be taller than the viewport.
   *
   * passThroughAllDomainsGeneric is used rather than passThroughAllDomains
   * because at this height the domain -> build transition can land on the
   * second domain: DomainStep.acceptDefaults confirms the transition by
   * waiting for STEP_TEXT.BUILD, which the squeezed first build frame does not
   * always paint, so its closed-loop retry presses Enter again. The generic
   * variant advances until the sources step actually appears, so it is correct
   * for either outcome. Selections are untouched either way — every press is a
   * plain Enter, so the confirm summary is the stack default set.
   */
  async function driveToConfirmStep(): Promise<ConfirmStep> {
    const { tempDir: envTempDir, fakeHome, projectDir } = await createTestEnvironment();
    tempDir = envTempDir;
    source = await createE2ESource();

    wizard = await InitWizard.launchRaw({
      projectDir,
      source,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.SHORT,
    });

    await wizard.stack.waitForReady();

    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomainsGeneric();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    await confirm.waitForReady();

    return confirm;
  }

  it(
    "shows a scroll-down affordance when the confirm summary is taller than the viewport",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const confirm = await driveToConfirmStep();

      const screen = confirm.getScreen();

      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(screen).toContain("more below");
    },
  );

  it(
    "keeps the confirm summary inside its box border",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const confirm = await driveToConfirmStep();

      const screen = confirm.getScreen();

      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      // A horizontal border run is only ever drawn by a box edge, and "+ " only
      // ever by an added row of the summary. The two are adjacent on one line
      // only when the summary paints over the border it should be clipped
      // inside — a position-independent signature of the bleed that needs no
      // line scanning of the frame.
      expect(screen).not.toContain("─+ ");
    },
  );
});
