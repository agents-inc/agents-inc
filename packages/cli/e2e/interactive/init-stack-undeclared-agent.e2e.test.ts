import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_STACK_DISPLAY, UNDECLARED_STACK_AGENT } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture } from "../helpers/test-utils.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";

/**
 * What a user is told when the marketplace they chose ships a stack naming a sub-agent this CLI
 * does not define.
 *
 * A marketplace's `config/stacks.ts` is authored by hand and nothing between that file and the
 * wizard narrows its agent keys, so an author's typo arrives typed `AgentName` and compiles.
 * Only `src/agents/` declares a sub-agent a compile pass can honour, so the name is dropped —
 * and until this landed it was dropped SILENTLY, at the wizard's own grid, which is the one
 * place nobody would look for the reason a stack came up short.
 *
 * The subject is the message reaching a SCREEN, which is why this runs the real binary rather
 * than asserting on the loader's return. `warn()` during a source load is buffered precisely
 * because stderr is what the wizard's first repaint scrolls away, and a buffered line that
 * loses the startup band reaches no surface at all — a load-time warning is only as real as the
 * frame that paints it.
 *
 * `TERMINAL_SIZE.TALL` is deliberate and not a stress geometry: the band is fixed-height and
 * evicts all but one row when the terminal is short, and which message wins that row is
 * `wizard-startup-band-priority.e2e.test.ts`'s subject rather than this one's.
 */
describe("a marketplace stack naming a sub-agent the CLI does not define", () => {
  let source: E2ESource;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    source = await createE2ESource({ withUndeclaredStackAgent: true });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "names the sub-agent it dropped on the startup band, rather than dropping it in silence",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ source, ...TERMINAL_SIZE.TALL });

      const screen = wizard.getScreen();

      expect(
        screen,
        "only the name says what to fix, so a count or a silent drop is no use to the author",
      ).toContain(UNDECLARED_STACK_AGENT);
      expect(
        screen,
        "the stack is dropped FROM rather than refused — its own step still opens on it",
      ).toContain(E2E_STACK_DISPLAY);
    },
  );

  /**
   * The subject guard for the case above, and it is not decoration: that one asserts a string is
   * PRESENT, and a fixture whose wizard printed the name for some unrelated reason — a grid row,
   * a roster line — would satisfy it without the band existing. Here the same launch against the
   * same source WITHOUT the undeclared agent must not show the name anywhere, which is what makes
   * its appearance above attributable to the warning.
   */
  it(
    "says nothing about it when the stack names only sub-agents the CLI declares",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const cleanSource = await createE2ESource();
      try {
        wizard = await InitWizard.launchInProject({
          source: cleanSource,
          ...TERMINAL_SIZE.TALL,
        });

        const screen = wizard.getScreen();

        expect(screen, "the same stack, reached the same way").toContain(E2E_STACK_DISPLAY);
        expect(
          screen,
          "nothing else on this screen prints the name, so its appearance above is the warning",
        ).not.toContain(UNDECLARED_STACK_AGENT);
      } finally {
        await cleanupFixture(cleanSource);
      }
    },
  );
});
