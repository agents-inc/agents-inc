import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { KEYS, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * What `selectSkill` SPENDS, and what it leaves behind.
 *
 * `selectSkill` now confirms its Space press against the rendered cell and
 * re-presses one that the grid never shows landing — the same closed loop the
 * Tab walk beside it already runs. Space is the one key in this grid that
 * cannot take a blind retry: it is a TOGGLE, so a re-press of a press that DID
 * land turns the selection back off. A retry loop is therefore only safe while
 * it spends exactly one press whenever one press was enough, and no assertion
 * anywhere else in the suite can see that — every other spec reads where the
 * selection ENDED, which a double press satisfies for free on any skill toggled
 * an even number of times.
 *
 * So the press ledger is the subject here, and both directions of the toggle
 * are pinned: a double press is invisible on a select-then-deselect pair read
 * from the config, and a spec that only selected would miss a loop that
 * confirms the badge APPEARING and cannot see it go.
 *
 * Read-only session: the wizard is aborted, so `config.ts` and the project's
 * skills directory must come out byte-for-byte unchanged.
 *
 * HOW THIS WAS WATCHED GO RED, because it cannot be red before the change it
 * guards — the failure it exists against is one that change could introduce, so
 * a reader repeating the "revert the fix" procedure would find it green and
 * conclude wrongly that it was already covered. Four mutations were run instead:
 * a blind extra press added to the retry loop, and the confirmation made blind
 * to a landed press, each reddening the press-count assertion at three Spaces
 * for one toggle; the loop's first press suppressed on the real PTY, which the
 * retry recovered from with one real press spent, proving the loop closes; and
 * every press suppressed, which reddened the exhaustion report. The two
 * unchanged-state assertions were checked by mutating the FIXTURE rather than
 * the source — a line appended to `config.ts` for one, a directory created
 * under the skills path for the other, each run on its own so neither could
 * hide behind the other's red — because a spec asserting that nothing was
 * written is satisfied by a bug that skipped the write.
 */
describe("build step — what selectSkill spends", () => {
  let tempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  const spacesPressed = (keys: readonly string[]): readonly string[] =>
    keys.filter((key) => key === KEYS.SPACE);

  it(
    "presses Space once per toggle, in both directions",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      const projectDir = project.dir;
      tempDir = path.dirname(projectDir);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      // SELECT. zustand is absent from the install, so its cell opens with no
      // scope badge and gains one the moment the toggle lands — which is the
      // signal the confirmation reads, and the subject guard for the count.
      const beforeSelect = wizard.build.keystrokes().length;
      await wizard.build.selectSkill(E2E_SKILL.zustand.display);
      const selectSpend = wizard.build.keystrokes().slice(beforeSelect);

      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.zustand.display),
        "the select must have landed — without this the press count below is a count of nothing",
      ).toStrictEqual(["G"]);
      expect(
        spacesPressed(selectSpend),
        "one landed press must not be re-pressed: a second Space would toggle the selection back off",
      ).toStrictEqual([KEYS.SPACE]);

      // DESELECT. The same loop in the other direction — the badge goes rather
      // than arrives, and a confirmation written only for the arrival would
      // re-press here until it exhausted its budget.
      const beforeDeselect = wizard.build.keystrokes().length;
      await wizard.build.selectSkill(E2E_SKILL.zustand.display);
      const deselectSpend = wizard.build.keystrokes().slice(beforeDeselect);

      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.zustand.display),
        "the deselect must have landed — the cell keeps no scope badge once nothing selects it",
      ).toStrictEqual([]);
      expect(spacesPressed(deselectSpend), "the deselect must cost one press too").toStrictEqual([
        KEYS.SPACE,
      ]);

      // The walk never left the category holding both cells, so the second
      // selectSkill had nowhere to travel and no keystroke but Space to spend.
      expect(
        deselectSpend,
        "a second selectSkill on the focused cell must press nothing but Space",
      ).toStrictEqual([KEYS.SPACE]);

      await wizard.abortAndDestroy();
      wizard = undefined;

      expect(
        await readTestFile(configTsPath(projectDir)),
        "an aborted edit must leave config.ts byte-for-byte unchanged",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "an aborted edit must install nothing",
      ).toStrictEqual(skillDirsBefore);
    },
  );
});
