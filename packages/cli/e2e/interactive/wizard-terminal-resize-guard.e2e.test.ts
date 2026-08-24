import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";

/**
 * The size gate has to survive the terminal changing size, not just the terminal
 * being small at launch.
 *
 * `BaseCommand.ensureTerminalSize` runs once, in `init()`, before Ink mounts —
 * so it stops you LAUNCHING small but not BECOMING small. A session started at a
 * comfortable height and then shrunk used to paint straight through its own
 * footer: the build grid's card borders overprinted the hotkey row and the
 * wizard was unusable with no indication why. `WizardLayout` now re-checks the
 * dimensions `useTerminalDimensions` already tracks and REPLACES the wizard tree
 * with the same resize prompt the startup gate prints.
 *
 * Why "the prompt is the last thing painted" is the assertion rather than the
 * absence of wizard text: the emulator keeps everything the session ever drew,
 * and shrinking pushes the pre-shrink frame into scrollback, so a `not.toContain`
 * on any wizard string would fail on residue whether or not the guard works.
 * What IS discriminating is the order — if the prompt merely covered a still-
 * mounted wizard, wizard rows would be drawn after it.
 */
const PROMPT_IS_CURRENT_FRAME = new RegExp(`${STEP_TEXT.RESIZE_PROMPT}\\.$`);

describe("wizard terminal-size guard on a mid-session resize", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "replaces the wizard with the resize prompt when the terminal shrinks below the minimum, and restores a usable wizard when it grows back",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({
        ...(source !== undefined && { source }),
        ...TERMINAL_SIZE.TALL,
      });

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Green guard: the build grid really is on screen before the shrink, so
      // the swap below is a swap and not an assertion about an empty session.
      expect(build.getScreen(), "the build grid must be painted before the resize").toContain(
        STEP_TEXT.BUILD,
      );

      await build.resizeBelowMinimum(
        TERMINAL_SIZE.BELOW_MINIMUM.cols,
        TERMINAL_SIZE.BELOW_MINIMUM.rows,
      );

      const shrunk = build.getScreen();
      expect(shrunk, "shrinking below the row minimum must print the resize prompt").toContain(
        STEP_TEXT.TOO_SHORT,
      );
      expect(
        shrunk,
        `the prompt must be the current frame — nothing painted after it. Screen:\n${shrunk}`,
      ).toMatch(PROMPT_IS_CURRENT_FRAME);

      await build.resizeAboveMinimum(TERMINAL_SIZE.TALL.cols, TERMINAL_SIZE.TALL.rows);

      const restored = build.getScreen();
      expect(restored, "growing back must repaint the wizard footer").toContain(
        STEP_TEXT.FOOTER_SELECT,
      );
      expect(
        restored,
        `the resize prompt must no longer be the current frame. Screen:\n${restored}`,
      ).not.toMatch(PROMPT_IS_CURRENT_FRAME);

      // The session survived the round trip: it still drives to completion, and
      // the install it produces is the stack default — config under the project
      // dir, ejected skills and compiled agents under the wizard's global HOME.
      // Sources are set to local because the standard E2E source ships no
      // marketplace, so the default plugin mode would hard-error at install.
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        agents: E2E_AGENTS.WEB_AND_API,
      });
      await expectPhaseSuccess(
        { project: { dir: wizard.globalHome }, exitCode: result.exitCode },
        {
          compiledAgents: E2E_AGENTS.WEB_AND_API,
          copiedSkills: [E2E_SKILL.react.id],
        },
      );
    },
  );
});
