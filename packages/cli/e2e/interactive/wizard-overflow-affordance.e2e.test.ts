import { describe, it, expect, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { ADDED_MARKER, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import type { ConfirmStep } from "../pages/steps/confirm-step.js";
import "../matchers/setup.js";

/**
 * Wizard overflow behaviour at a small-but-valid terminal height (D-263).
 *
 * The wizard refuses to render below 80 cols / 20 rows, so TERMINAL_SIZE.SHORT
 * is the smallest geometry that still exercises the real layout. At that height
 * the confirm step's summary is taller than the box it is drawn in, so the step
 * must clip its content to that box AND tell the user there is more below.
 *
 * The overflow affordance is text-only ("N more below") — no scroll glyph — so
 * the assertion matches on the affordance wording the wizard actually paints.
 */
/** A confirm-summary row that only a scrolled viewport paints at this height. */
const REVEALED_AGENT_ROW = `${ADDED_MARKER} ${E2E_AGENT["web-developer"].name}`;

describe("wizard overflow at a short terminal height", () => {
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;
  let source: E2ESource | undefined;

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
    "reveals a summary row the scroll-down affordance said was below the fold",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const confirm = await driveToConfirmStep();

      const before = confirm.getScreen();
      expect(before).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(before).toContain(STEP_TEXT.SCROLL_MORE_BELOW);
      // Sound as an absence because the string was never drawn: `+ <agent>` is
      // painted only by the confirm summary's added rows, and at offset 0 the
      // viewport is filled by the panel's marketplace/stack header. The agents
      // step renders the display title ("Web Developer"), not this name.
      expect(before).not.toContain(REVEALED_AGENT_ROW);

      // The affordance's counters are the panel's own bookkeeping and move
      // whether or not the content does — pinning `more below` becoming `more
      // above` stayed green with the scroll disabled outright. The revealed row
      // is the content the counter was talking about.
      await confirm.scrollSummaryToBottom();

      const after = confirm.getScreen();
      expect(after).toContain(REVEALED_AGENT_ROW);
    },
  );

  it(
    "keeps the confirm summary inside its box border",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const confirm = await driveToConfirmStep();

      // At scroll offset 0 the viewport is filled entirely by the panel's
      // marketplace/stack header, so no summary row is painted and the bleed
      // signature below cannot appear whether or not the bug exists. Run the
      // viewport to the end of its scroll range first, where the panel does
      // paint real rows.
      await confirm.scrollSummaryToBottom();

      const screen = confirm.getScreen();

      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      // Positive guard: the frame really does carry an added row of the
      // summary, so the negative assertion below is being made about a subject
      // that is on screen rather than about an empty viewport.
      expect(screen, "the scrolled confirm summary must paint an added row").toContain(
        REVEALED_AGENT_ROW,
      );
      // A horizontal border run is only ever drawn by a box edge, and "+ " only
      // ever by an added row of the summary. The two are adjacent on one line
      // only when the summary paints over the border it should be clipped
      // inside — a position-independent signature of the bleed that needs no
      // line scanning of the frame.
      expect(screen).not.toContain("─+ ");
    },
  );
});
