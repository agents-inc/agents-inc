import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture, ensureBinaryExists } from "../helpers/test-utils.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";

/**
 * What a wizard tells the user about a load that could not do everything, when the band it has
 * to say it in holds one row.
 *
 * The band is fixed-height by design: it sits above the step inside a root box sized to the
 * terminal, so growing it to fit the news would push the frame past the bottom of the screen and
 * its own header off the top. Below `LOGO_MIN_TERMINAL_ROWS` it therefore paints ONE message and
 * counts the rest. `edit` buffers two INFO lines before anything else can speak — the
 * catalogue's count, then the installation's — so in arrival order that single row went to
 * `Loaded N skills` and a warning the user might have had to act on was legible nowhere at all.
 * Nowhere is literal: `warn()` is buffered during the load precisely so it is not written to a
 * stderr the wizard's first repaint scrolls away, and a buffered line that loses the band
 * reaches no surface.
 *
 * **The two cases are one claim read from both ends and neither means anything alone.** An
 * absence is the whole point of the short case, and an absence proves nothing unless the thing
 * absent is a thing this run produces: a fixture whose `edit` never buffered an info line would
 * satisfy it for free, and so would a band that painted nothing. The tall case is that subject
 * guard — same fixture, same command, a budget of three rows, and there the info line IS
 * painted, beside the warning rather than instead of it. So the short case's absence is an
 * eviction and can be read as one.
 *
 * `TERMINAL_SIZE.SHORT` is not a stress geometry here, it is the only one that discriminates: at
 * `TALL` the defect and the fix render identically, which is why that case asserts coexistence
 * rather than order. `assertWizardScreenIsWhollyVisible` rides along on each launch's own footer
 * wait and is what would catch a band answering this by growing instead.
 */

/**
 * A skill the config claims and the E2E source does not carry, so hydration warns about it once
 * — the warning that has to win the row. Its id is the positive subject guard as well: an
 * unresolvable skill reaches no grid cell, so the id is on screen only because the band named it.
 */
const ABSENT_SKILL_ID = "web-styling-tailwind";

describe("the wizard startup band", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  /** An installation carrying one entry the loaded source cannot place. */
  async function projectWithOneAbsentSkill(): Promise<{ dir: string }> {
    return ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      unresolvableSkills: [ABSENT_SKILL_ID],
    });
  }

  it(
    "spends its only row on the warning rather than on the info line raised before it",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await projectWithOneAbsentSkill();

      wizard = await EditWizard.launchInProjectShort({
        projectDir: project.dir,
        source,
        ...TERMINAL_SIZE.SHORT,
      });

      const screen = wizard.build.getScreen();
      expect(screen, "the warning must be legible, or it reaches no surface at all").toContain(
        ABSENT_SKILL_ID,
      );
      expect(
        screen,
        "the info line was buffered FIRST, so a band painting in arrival order shows it instead",
      ).not.toContain(STEP_TEXT.LOADED);
    },
  );

  it(
    "paints the info line beside the warning once there are rows for both",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await projectWithOneAbsentSkill();

      wizard = await EditWizard.launchInProject({
        projectDir: project.dir,
        source,
        ...TERMINAL_SIZE.TALL,
      });

      const screen = wizard.build.getScreen();
      expect(screen, "the same warning, at a geometry with room to spare").toContain(
        ABSENT_SKILL_ID,
      );
      expect(
        screen,
        "and the info line this run really does raise — which is what makes its absence above an eviction",
      ).toContain(STEP_TEXT.LOADED);
    },
  );
});
