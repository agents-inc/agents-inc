import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture, cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS, UNCHANGED_MARKER } from "../pages/constants.js";

/**
 * The Sources step's two bulk install-mode keys are withdrawn.
 *
 * `l` ("set all local") and `p` ("set all plugin") rewrote `source` on EVERY non-excluded
 * skill config, with no scope authority behind them: from a project edit they reached the
 * inherited global rows the same step renders as locked and non-focusable, so the bulk key
 * could do what the per-row toggle provably cannot. The resolution is removal — both keys go
 * from the key handler, from the footer hint band, and from the store.
 *
 * This file covers the SURFACE half of that: the step must not advertise the keys, and
 * pressing them must change nothing. The containment half — a project edit's bulk key must
 * not reach the global install — is
 * `lifecycle/project-edit-bulk-source-keys-leave-global-untouched.e2e.test.ts`.
 *
 * Both tests run at GLOBAL edit scope (`HOME === projectDir`), which is where the keys were
 * unambiguously legitimate. Withdrawing them is not a scope gate, so the sharpest place to
 * pin their absence is the context that had every right to them.
 *
 * WHICH ASSERTION CARRIES THE RED, and why both stay:
 *
 *   - The footer assertions go red against the unfixed binary: `WizardLayout` prints both
 *     hints while `step === "sources"`.
 *   - The confirm-step diff goes red against the unfixed binary: `p` flips react's source
 *     from `eject` to the marketplace, which `computeScopeDiff` classifies `mode-changed`
 *     and paints as `~`.
 *   - The before/after SCREEN comparison does NOT go red, and cannot: the Sources grid
 *     signals which install-mode cell is selected with colour and weight only
 *     (`SourceTag` — `color` / `bold` / `dimColor`), and the harness runs under `NO_COLOR`.
 *     A committed mode change is invisible in the captured text either way. It is kept
 *     because it still pins the keys against acquiring a VISIBLE effect — a toast, a focus
 *     move, a scroll — and it is documented here so a later reader does not mistake it for
 *     the guard and drop the two that are.
 */

describe("sources step — withdrawn bulk install-mode hotkeys", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

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
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "does not advertise the bulk install-mode keys in the footer hint band",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source,
        env: { HOME: project.dir },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const screen = sources.getScreen();

      // Positive subject guards, in the frame the negatives are asserted against: the Sources
      // step is the current screen, its grid is painted, and the footer row IS on screen — so
      // the hint band, which renders directly above that row, is inside the captured region. A
      // negative about a band that never painted would pass for free.
      expect(screen, "the Sources step must be the current screen").toContain(STEP_TEXT.SOURCES);
      expect(screen, "the install-mode grid must be painted").toContain(
        STEP_TEXT.INSTALL_MODE_LOCAL,
      );
      expect(screen, "the install-mode grid must be painted").toContain(
        STEP_TEXT.INSTALL_MODE_PLUGIN,
      );
      expect(screen, "the footer row must be painted below the hint band").toContain(
        STEP_TEXT.FOOTER_HOTKEY_ROW,
      );

      // The wizard may not advertise a key it does not honour. Both hints are painted ONLY on
      // the Sources step, so nothing earlier in this session could have left either in the
      // buffer — the negative is about what this step draws, not about scrollback.
      expect(screen, "the Sources step must not offer a set-all-local key").not.toContain(
        STEP_TEXT.FOOTER_SET_ALL_LOCAL,
      );
      expect(screen, "the Sources step must not offer a set-all-plugin key").not.toContain(
        STEP_TEXT.FOOTER_SET_ALL_PLUGIN,
      );

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "leaves every skill's install mode alone when the withdrawn bulk keys are pressed",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // `ProjectBuilder.editable` saves react at { scope: "project", source: "eject" }, so a
      // bulk switch to plugin mode is a real mode change the confirm step would report.
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source,
        env: { HOME: project.dir },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      // ONE key, one direction. Pressing `p` and then `l` from an eject baseline is a round
      // trip whose net effect is zero — it passes against the unfixed binary, which is how the
      // first draft of this spec was green for the wrong reason. `l`'s own inert-ness is pinned
      // behaviourally in the containment spec, against a plugin baseline it can actually move.
      const before = sources.getScreen();
      await sources.pressSetAllPluginHotkey();

      // Weak but genuine: nothing may MOVE. See the file header — a committed mode change is
      // colour-only in this grid, so this comparison cannot see one; it guards the key against
      // gaining a visible effect (toast, focus move, scroll) and carries none of the red.
      expect(
        sources.getScreen(),
        "no key on the Sources step handles P, so the frame cannot move",
      ).toBe(before);

      // The assertion that does carry the red. `p` flipped react eject -> marketplace against
      // the unfixed binary, which the confirm summary paints as a `~` mode-changed row; with
      // both keys withdrawn react is untouched and reads as the unchanged bullet.
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      await confirm.waitForReady();

      expect(
        await confirm.getSummaryDiffEntries(E2E_SKILL.react.display),
        `react must reach confirm unchanged, not mode-changed.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([{ scope: "Project", prefix: UNCHANGED_MARKER }]);

      // Read-only scenario: abort before the confirm Enter so nothing is written to disk.
      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );
});
