import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TIMEOUTS } from "../pages/constants.js";
import { ensureBinaryExists, cleanupTempDir } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";

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
          {
            skills: ["react", "vue-composition-api"],
            reason: "Choose one frontend framework",
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
      // Contrast: in non-exclusive categories, conflicting skills DO show
      // "(incompatible)" markers (covered by unit tests and the filter test).
      expect(output).not.toContain("(incompatible)");
    },
  );
});
