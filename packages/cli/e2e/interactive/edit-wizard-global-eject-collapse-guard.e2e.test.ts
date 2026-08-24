import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../src/cli/consts.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * `s` collapses a `[P][G]` pair back to `[G]` — and `wouldOverwriteGlobalEject` in
 * `stores/wizard-store.ts` refuses the press when doing so would land a project EJECT copy on top
 * of an ejected global install the live config does not already mask with a tombstone.
 *
 * The refusal was already load-bearing before anything asserted it. `ProjectBuilder.editable`
 * grew `globalSkillsSource` because of it: the fixture's default builds BOTH halves as ejects, so
 * every collapse spec written on that default presses into this guard, and the specs that need
 * the collapse to succeed have to name a marketplace for the global half to get out of its way.
 * What no spec did was wait on the string, and no sentinel carried it — so the guard could have
 * stopped firing, or started firing on every `s` anywhere, with the whole suite green.
 *
 * **The two cases here are one test each way round and neither means anything alone.** They build
 * the SAME installation and differ in one field — what the global half was installed FROM — so
 * "the badge did not move" is attributable to the eject/eject collision rather than to a scope
 * key that has stopped working. Read the other way: the permitted case is what says the guard has
 * not swallowed its whole domain, which is the failure mode a refusal-only pin cannot see.
 *
 * Both sessions are read-only — the wizard is aborted — so config.ts and the project skills
 * directory must come out byte-for-byte unchanged either way.
 */

const REACT = E2E_SKILL.react.id;
const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("edit wizard — the S collapse over an ejected global install", () => {
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

  it(
    "refuses the collapse when the global half is an eject the press would overwrite",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // `globalSkillsSource` is stated rather than left to the fixture default, even though the
      // default is this value: the eject/eject collision IS the precondition of the guard, and a
      // precondition inherited from a default is one a change to that default moves silently.
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [REACT, E2E_SKILL.vitest.id],
        globalSkills: [REACT],
        globalSkillsSource: EJECT_SOURCE,
        agents: [WEB_DEV],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Setup proof: both halves are ejects, which is the only shape this guard fires on. Without
      // it a refusal below could be any of the store's silent early returns instead.
      expect(
        await readSkillEntries(projectDir, REACT),
        "react must be an eject at BOTH scopes before the edit, or the guard has no subject",
      ).toStrictEqual([
        { id: REACT, scope: "global", origin: EJECT_SOURCE },
        { id: REACT, scope: "project", origin: EJECT_SOURCE },
      ]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      await wizard.build.focusSkill(E2E_SKILL.react.display);
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "the live active entry is the project copy, so the row opens on the P badge",
      ).toStrictEqual(["P"]);

      // The toast carries the verdict, and only the toast can. A badge that has not moved is
      // produced by this guard, by the component's global-context guard and by a keystroke the
      // wizard never received alike — three causes one unchanged row cannot tell apart.
      await wizard.build.toggleScopeOnFocusedSkillAwaiting(STEP_TEXT.ALREADY_EJECTED_AT_GLOBAL);

      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "a refused collapse must leave the row's badge at project scope",
      ).toStrictEqual(["P"]);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      expect(
        await readTestFile(configTsPath(projectDir)),
        "a refused collapse followed by an abort must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "a refused collapse followed by an abort must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);
    },
  );

  it(
    "allows the same collapse when the global half came from a marketplace",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Identical to the fixture above but for `globalSkillsSource`. Nothing else moves, so the
      // badge flip below is attributable to that one field.
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [REACT, E2E_SKILL.vitest.id],
        globalSkills: [REACT],
        globalSkillsSource: DEFAULT_PUBLIC_SOURCE_NAME,
        agents: [WEB_DEV],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      expect(
        await readSkillEntries(projectDir, REACT),
        "the global half must be marketplace-sourced, which is the one field this case changes",
      ).toStrictEqual([
        { id: REACT, scope: "global", origin: DEFAULT_PUBLIC_SOURCE_NAME },
        { id: REACT, scope: "project", origin: EJECT_SOURCE },
      ]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      await wizard.build.focusSkill(E2E_SKILL.react.display);
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "the live active entry is the project copy here too, so both cases start on the same badge",
      ).toStrictEqual(["P"]);

      await wizard.build.toggleScopeOnFocusedSkill();

      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "`s` must collapse the pair to global-only when no ejected global install is at risk",
      ).toStrictEqual(["G"]);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a permitted collapse must not rewrite config.ts either",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a permitted collapse must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);
    },
  );
});
