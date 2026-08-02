import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import type { SourcesStep } from "../pages/steps/sources-step.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";

/**
 * The wizard's settings overlay — the marketplace-source panel the sources step
 * opens on `s` — is withdrawn from the wizard. It is unreachable and unadvertised:
 * pressing `s` on the sources step leaves the user on the sources grid, and the
 * hotkey row never names a key that does nothing.
 *
 * Asserted as BEHAVIOUR, not as configuration: what a user can reach is the
 * contract, and a spec that read the switch instead would pass on a switch that
 * was wired to nothing.
 *
 * The keystrokes after `s` are the proof, not decoration. `s` alone could be
 * "swallowed and nothing repainted", which a negative assertion cannot tell apart
 * from "handled correctly" — so the run continues into the overlay's OWN keys: an
 * arrow (which repaints whichever view owns the keyboard) and `a`, the overlay's
 * add-source hotkey and a no-op on the sources grid. If the overlay were open,
 * those two presses would paint it and its add-source input. Enter is deliberately
 * never pressed: on the sources grid it advances the step.
 *
 * CURRENTLY RED, deliberately: `s` opens the overlay today, so the panel's heading
 * and its add-source row both appear in the captured output.
 */

/**
 * The hotkey row's caption for the settings key (wizard-layout.tsx). Kept local
 * rather than added to STEP_TEXT: it is the label this spec exists to see the
 * back of, and nothing else asserts on it.
 */
const SETTINGS_HOTKEY_CAPTION = "Settings";

describe("init wizard — the sources step opens no settings overlay", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  /** Stack -> Domain -> Build (all domains) -> Sources, as the sources specs do. */
  async function navigateToSources(): Promise<{ wizard: InitWizard; sources: SourcesStep }> {
    const w = await InitWizard.launchInProject();
    const domain = await w.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomains();
    return { wizard: w, sources };
  }

  it(
    "stays on the sources grid when S is pressed, and never advertises the key",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { wizard: w, sources } = await navigateToSources();
      wizard = w;
      await sources.waitForReady();

      // `openSettings()` is the page object's name for "press s" — the press is
      // what this spec is about, not the outcome the name assumes.
      await sources.openSettings();
      await sources.navigateDown();
      await sources.pressAddSource();

      const output = sources.getOutput();

      expect(output, "pressing S must not open the marketplace settings overlay").not.toContain(
        STEP_TEXT.CONFIGURED_MARKETPLACES,
      );
      expect(output, "the overlay's add-source row must never be reachable").not.toContain(
        STEP_TEXT.ADD_SOURCE,
      );
      expect(output, "the hotkey row must not advertise a settings key").not.toContain(
        SETTINGS_HOTKEY_CAPTION,
      );
      expect(output, "the wizard must still be on the sources step").toContain(STEP_TEXT.SOURCES);
    },
  );
});
