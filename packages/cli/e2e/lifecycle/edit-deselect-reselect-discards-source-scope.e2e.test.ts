import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readSkillEntries,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * In-session deselect -> re-select of a PROJECT-ONLY eject skill.
 *
 * A skill installed at (scope: "project", source: "eject") that is deselected and
 * immediately re-selected inside the SAME `cc edit` session must come back exactly
 * as it was persisted. The round trip is a user-visible no-op: the skill keeps its
 * project scope, keeps its eject source, and its copied directory under
 * `<project>/.claude/skills/<id>/` stays on disk.
 *
 * The suite deliberately targets a project-only skill (no global install
 * underneath, no global tombstone). The existing dual-scope suites all exercise
 * the `[P][G]` shape, whose re-select is handled by reconcileSkillConfigs'
 * dedicated restore branch — that branch reads the persisted global entry and
 * carries its `source` across. A project-only skill misses that branch entirely
 * and falls through to the "add a brand-new skill" arm, so nothing in the suite
 * covers a re-select that has to recover a persisted PROJECT entry.
 */

describe("in-session deselect and re-select of a project-only eject skill", () => {
  let testTempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "preserves the persisted project scope, eject source and copied directory when a skill is deselected and re-selected in one session",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      // web-testing-vitest lands project-scoped + eject; web-framework-react stays
      // global-scoped + eject at HOME.
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      const globalConfigPath = configTsPath(fakeHome);

      // Setup proof: the skill is genuinely a project-scoped eject install, present
      // in the project config and copied to the project dir (not to HOME).
      const vitestEntriesBefore = await readSkillEntries(projectDir, E2E_SKILL.vitest.id);
      expect(
        vitestEntriesBefore,
        "vitest must be a project-scoped eject skill before the edit",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" }]);
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // One `cc edit` session: space to deselect the skill, space again to re-select
      // it, then save. Focus does not move on a toggle, so the second press lands on
      // the same row.
      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      await wizard.build.toggleFocusedSkill();
      // Web -> API domain.
      await wizard.build.advanceDomain();
      // API -> Methodology domain.
      await wizard.build.advanceDomain();
      // Methodology -> Sources -> Agents -> Confirm.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      await confirm.waitForReady();

      // The confirm summary must report the round-tripped skill as an unchanged
      // Project row. A rebuild from wizard defaults instead reports it leaving
      // Project and arriving at Global with a changed source.
      expect(
        await confirm.getSummaryDiffEntries(E2E_SKILL.vitest.display),
        `a deselect + re-select round trip must render the skill as unchanged at Project scope.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([{ scope: "Project", prefix: "•" }]);

      const result = await confirm.confirm();
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // Config: the round trip must restore the PERSISTED entry, not a wizard
      // default. A default rebuild reads back as scope "global" with the
      // marketplace source instead of "eject".
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.vitest.id),
        "a deselect + re-select round trip must leave the skill's scope and source as persisted",
      ).toStrictEqual(vitestEntriesBefore);

      // Filesystem: the ejected directory the deselect removed must be back (or
      // never have been removed), and the round trip must not relocate it to HOME.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);

      // Boundary: the sibling global eject skill and the global config are untouched
      // by a project-scope round trip.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(
        normalizeGlobalConfig(await readTestFile(globalConfigPath)),
        "global config must be unchanged by a project-scope deselect + re-select round trip",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );
});
