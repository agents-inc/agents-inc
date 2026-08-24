import { describe, it, expect, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { E2E_STACK_NAME } from "../helpers/create-e2e-source.js";

import "../matchers/setup.js";

/**
 * The stack step is the only step that paints the six-row ASCII banner, and at
 * TERMINAL_SIZE.SHORT — the wizard's own advertised minimum — those six rows
 * left the stack list a viewport under SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS, where
 * useRowScroll stops clipping. The list then painted straight over the scratch
 * row, the hotkey row and the footer. The banner is now gated on
 * LOGO_MIN_TERMINAL_ROWS (src/cli/consts.ts) and dropped below it.
 *
 * Only that instance is fixed. The bail-instead-of-clip behaviour in
 * useRowScroll / useSectionScroll below MIN_VIEWPORT_ROWS is untouched and is
 * still reachable by any step whose viewport is squeezed that far.
 */
describe("init wizard — stack step banner", () => {
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "renders the whole stack list and an unbroken footer at the minimum terminal height",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ ...TERMINAL_SIZE.SHORT });

      const screen = wizard.stack.getScreen();

      // Positive subjects first, so the negative below is known to be about a
      // frame that really painted the step. How far the overpaint reaches
      // scales with the list's length: against the real marketplace's dozen
      // stacks it splices content into the footer between the hotkey words,
      // which is what the whole-line FOOTER_HOTKEY_ROW match catches. This
      // source carries one stack, so the overflow is two rows and stops short
      // of the footer — there it overwrites the stack row itself, which is why
      // E2E_STACK_NAME is the assertion that goes red on the unfixed binary.
      expect(screen).toContain(E2E_STACK_NAME);
      expect(screen).toContain(STEP_TEXT.START_FROM_SCRATCH);
      expect(screen).toContain(STEP_TEXT.FOOTER_HOTKEY_ROW);

      expect(screen).not.toContain(STEP_TEXT.LOGO_BANNER);
    },
  );

  it(
    "paints the banner above the stack list when the terminal is tall enough",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ ...TERMINAL_SIZE.TALL });

      const screen = wizard.stack.getScreen();

      expect(screen).toContain(STEP_TEXT.LOGO_BANNER);
      expect(screen).toContain(E2E_STACK_NAME);
      expect(screen).toContain(STEP_TEXT.START_FROM_SCRATCH);
      expect(screen).toContain(STEP_TEXT.FOOTER_HOTKEY_ROW);
    },
  );
});
