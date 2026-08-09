import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { ensureBinaryExists, cleanupTempDir } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

/** Display name of the non-exclusive `meta-reviewing` category. */
const CODE_REVIEW_CATEGORY = "Code Review";

/**
 * Verifies that incompatibility markers are suppressed in exclusive (radio)
 * categories. When a category only allows one selection, showing "(incompatible)"
 * on the other options is redundant noise.
 */

describe("init wizard -- exclusive category incompatibility suppression", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();

    source = await createE2ESource({
      relationships: {
        conflicts: [
          // Both members sit in `web-framework`, which is exclusive — the case
          // under test.
          {
            skills: ["react", "vue-composition-api"],
            reason: "Choose one frontend framework",
          },
          // Both members sit in `meta-reviewing`, which is NOT exclusive. This
          // pair exists so the suppression can be told from the annotation
          // being gone everywhere: without it, deleting "(incompatible)" from
          // the renderer outright would pass the first spec.
          {
            skills: ["reviewing", "cli-reviewing"],
            reason: "Pick one review guide",
          },
        ],
      },
    });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should not show incompatible label for skills in exclusive categories",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ source });

      // Select E2E Test Stack (pre-selects React in the exclusive Framework category)
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Navigate right to Vue (second skill in the Framework category)
      await build.navigateRight();

      // Toggle labels to reveal advisory markers on the focused skill
      await build.toggleLabels();

      const output = build.getOutput();

      // Positive assertions: verify Vue is visible so the test isn't vacuous
      expect(output).toContain("Vue");

      // The output should NOT contain "(incompatible)" because the Framework
      // category is exclusive -- the single-selection constraint already
      // prevents conflicts, making the marker redundant.
      expect(output).not.toContain("(incompatible)");
    },
  );

  it(
    "should still show the incompatible label for a conflicting skill in a non-exclusive category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ source, ...TERMINAL_SIZE.TALL });

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Web -> API -> Methodology. The Code Review category header is the
      // sentinel that the second Enter landed on the meta grid rather than
      // falling through to the Sources step.
      await build.advanceDomain();
      await build.advanceDomain();
      expect(build.getOutput()).toContain(CODE_REVIEW_CATEGORY);

      // The stack selects both review skills, and a selected option is never
      // annotated. Deselecting one leaves it unselected and conflicting with
      // the other, which is the state the marker describes; selectSkill leaves
      // focus on the cell it toggled, and the marker renders only for the
      // focused option once labels are on.
      await build.selectSkill(E2E_SKILL["cli-reviewing"].display);
      await build.toggleLabels();

      const output = build.getOutput();
      expect(output).toContain(E2E_SKILL["cli-reviewing"].display);
      expect(output).toContain("(incompatible)");
    },
  );
});
