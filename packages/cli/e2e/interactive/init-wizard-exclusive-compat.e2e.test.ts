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
 * The `discourages` reason this spec's source authors. Named once because the
 * expectation reads it back off the rendered cell: the annotation carries the
 * author's own prose, so a second copy in the assertion would pin a duplicate
 * rather than the trip from source file to screen.
 *
 * It has to stay short enough that label, verdict and reason render on ONE line
 * at the viewport this spec launches. A longer reason wraps inside the tag's
 * border, which splits the string the expectation matches and reads as the
 * annotation having disappeared rather than as the reason having outgrown the row.
 */
const DISCOURAGE_REASON = "Screenshot diffs are slow to keep green beside a unit runner";

/**
 * The advisory annotation a grid cell carries, end to end: a relationship declared
 * in a source, through the wizard's derivation, to the word a user reads.
 *
 * The rendered form is `(verdict: reason)` — the verdict word, then the reason
 * behind it. The absence assertions below therefore match `"(incompatible"` and
 * stop before the reason: a closing paren matches nothing the renderer can emit,
 * which leaves an absence assertion passing whether or not the rule it names
 * still holds.
 *
 * Two rules meet here. An incompatibility is suppressed inside an exclusive (radio)
 * category, where the single-selection constraint already prevents the pairing and
 * the annotation is redundant noise — and preserved outside one. A discouragement
 * is never suppressed, because a soft warning warns and never takes the choice away;
 * it is also the only advisory whose whole existence IS its label, since an
 * incompatible cell also paints red and a required one also dims.
 */

describe("init wizard -- grid cell advisory annotations", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();

    source = await createE2ESource({
      relationships: {
        discourages: [
          // Both sit in `web-testing`, which is not exclusive, and the stack selects
          // only Vitest — so Visual Regression stays unselected beside a selected
          // skill that discourages it, which is the state the annotation describes.
          {
            skills: ["vitest", "visual-regression"],
            reason: DISCOURAGE_REASON,
          },
        ],
        conflicts: [
          // Both members sit in `web-framework`, which is exclusive — the case
          // under test.
          {
            skills: ["react", "vue-composition-api"],
            reason: "Choose one frontend framework",
          },
          // Both members sit in `meta-reviewing`, which is NOT exclusive. This
          // pair exists so the suppression can be told from the annotation
          // being gone everywhere: without it, deleting the incompatible
          // annotation from the renderer outright would pass the first spec.
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

      // The output must carry no incompatible annotation because the Framework
      // category is exclusive -- the single-selection constraint already
      // prevents conflicts, making the marker redundant.
      expect(output).not.toContain("(incompatible");
    },
  );

  it(
    "should show the discouraged label for an unselected skill a selected one discourages",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ source, ...TERMINAL_SIZE.TALL });

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // The marker renders only for the focused option once labels are on, and
      // focusing rather than selecting is the point: a selected cell is never
      // annotated at all.
      await build.focusSkill(E2E_SKILL["visual-regression"].display);
      await build.toggleLabels();

      const output = build.getOutput();
      expect(output).toContain(E2E_SKILL["visual-regression"].display);
      expect(output).toContain(`(discouraged: ${DISCOURAGE_REASON})`);

      // A soft warning never takes the choice away, so the cell must not also
      // read as ruled out.
      expect(output).not.toContain("(incompatible");
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

      // A conflict's rendered reason names the skill on the other side rather
      // than the prose the source authored -- "Pick one review guide" is what
      // the rule says, "conflicts with Reviewing" is what the cell says.
      expect(output).toContain(`(incompatible: conflicts with ${E2E_SKILL.reviewing.display})`);
    },
  );
});
