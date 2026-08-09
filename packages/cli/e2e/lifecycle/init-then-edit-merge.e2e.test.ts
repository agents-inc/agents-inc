import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Init -> Edit merge lifecycle E2E test.
 *
 * Verifies that running `cc init` to completion, then running `cc edit`
 * with changes, produces a merged config (not an overwrite). The original
 * skills from init should be preserved alongside new skills added in edit.
 */

/**
 * The skill the edit phase adds: the E2E source's SPARE — assigned to no agent by
 * the stack, in a category that is not exclusive.
 *
 * Named rather than reached by arrow keys, and this skill rather than any other,
 * because both halves are load-bearing. A blind keystroke lands on nothing, and
 * every OTHER skill a default install leaves behind is an exclusive alternate of
 * one it took — pressing Space on those swaps nothing in and the config comes back
 * byte-identical, which a count-based assertion accepts as a merge.
 */
const ADDED_SKILL = E2E_SKILL["visual-regression"];

/** A skill the INIT installed, so the merge can be shown to have kept it. */
const PRESERVED_SKILL = E2E_SKILL.vitest;

describe("init -> edit merge: config preserved across lifecycle", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  describe("full init then edit with changes", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    /**
     * The subject is the DELTA, so both halves are asserted as set differences and
     * on both surfaces the merge writes to: `config.ts` and the compiled agent.
     *
     * Three defects used to hide underneath each other here. Phase 1 drove the wizard
     * in plugin mode against a marketplace-less source and hard-errored, so every
     * assertion below it was dead; the install landed at global scope while the
     * assertions read the project dir; and the fixture had no skill an edit could add
     * that was not an exclusive swap. The spec ended on
     * `editSkillIds.length >= initSkillIds.length`, which a no-op edit satisfies.
     */
    it(
      "should merge config after init -> edit with skill addition (no duplicates)",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // ================================================================
        // Phase 1: Init via wizard
        // ================================================================

        // launchInGlobal, not launch: an eject install lands at the DEFAULT (global)
        // scope, so with HOME elsewhere the config, agents and skills would be written
        // somewhere this spec never looks. Collapsing HOME onto projectDir puts every
        // artefact where the assertions below read it — the same reasoning
        // local-lifecycle records for its own eject phase.
        const initWizard = await InitWizard.launchInGlobal({
          source: { sourceDir, tempDir: sourceTempDir },
          projectDir,
        });
        // Explicit eject via the Sources step's `l` hotkey. `completeWithDefaults()`
        // leaves the wizard in plugin mode, and the E2E source carries no
        // marketplace.json, so the install hard-errors ("Cannot install plugin
        // skills: marketplace could not be resolved") before Phase 1 finishes —
        // which meant this spec never reached the merge assertions it exists for.
        const initResult = await completeWithLocalSources(initWizard);
        await initResult.destroy();

        // --- Phase 1 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );

        const initSkillIds = await readConfigSkillIds(projectDir);
        expectNoDuplicates(initSkillIds, "skills after init");

        // Verify agent frontmatter and skill content
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        // The pre-state the merge is measured against: the spare is what the edit
        // will add, so an install that already took it would make Phase 2 a no-op
        // that every "still present" assertion below would pass anyway.
        expect(initSkillIds, "the skill the edit adds must not be installed yet").not.toContain(
          ADDED_SKILL.id,
        );
        expect(initSkillIds, "the skill the merge must keep has to be installed first").toContain(
          PRESERVED_SKILL.id,
        );

        const originalSkillSet = new Set(initSkillIds);

        // ================================================================
        // Phase 2: Edit -- add a skill by navigating to a new category
        // ================================================================

        // launchInGlobal for the same reason Phase 1 used it, and it must be the SAME
        // collapse: `EditWizard.launch()` allocates its own HOME, so the edit would run
        // as a PROJECT-context edit over a config whose every entry is global-scoped —
        // writing the global halves and recompiling the global agents into a directory
        // this spec never looks at, and leaving projectDir's compiled agent untouched.
        // The config assertions still passed there (global rows are inlined into the
        // project config); only the compiled-agent half caught it.
        const editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          ...TERMINAL_SIZE.TALL,
        });

        // Add a NAMED skill. A blind `navigateDown()` + `toggleFocusedSkill()` stood
        // here and added nothing at all — the edit reported "No changes made" and
        // config.ts came back byte-identical, so the merge this spec exists to check
        // was never exercised. The floor assertion it used to end on
        // (`editSkillIds.length >= initSkillIds.length`) was satisfied by that no-op.
        await editWizard.build.selectSkill(ADDED_SKILL.display);

        // Navigate through: Build -> Sources -> Agents -> Confirm -> Complete.
        // `l` for the same reason Phase 1 uses it: a newly selected skill defaults to
        // PLUGIN mode, and this source carries no marketplace.json, so accepting the
        // Sources defaults hard-errors ("marketplace could not be resolved") before
        // the merge is written. The already-installed skills are ejected already, so
        // `l` changes only the skill this edit adds.
        const sources = await editWizard.build.passThroughAllDomains();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const editResult = await confirm.confirm();

        await editResult.destroy();

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: editResult.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );

        const editSkillIds = await readConfigSkillIds(projectDir);

        expectNoDuplicates(editSkillIds, "skills after edit");

        // All original skills should still be present (merge, not overwrite)
        for (const originalId of originalSkillSet) {
          expect(editSkillIds, `Original skill ${originalId} must be preserved`).toContain(
            originalId,
          );
        }

        // The merge contract, not a floor. `>= initSkillIds.length` was satisfied by
        // an edit that added five skills, and by one that removed a skill while
        // adding two — the two set differences say which actually happened, and
        // naming the added id is what separates a merge from a re-selection.
        expect(
          initSkillIds.filter((id) => !editSkillIds.includes(id)),
          "an edit that adds a skill must remove none",
        ).toStrictEqual([]);
        expect(
          editSkillIds.filter((id) => !originalSkillSet.has(id)),
          "the one toggle above must add exactly the skill it named",
        ).toStrictEqual([ADDED_SKILL.id]);

        // The edit announced that it changed something. Two generic absences stood
        // here ("Failed to", "ENOENT"); neither could tell a completed edit from one
        // that failed with different wording. Placed AFTER the merge assertions so
        // the set-difference above is what carries the red, not this line.
        expect(editResult.rawOutput).toContain(STEP_TEXT.EDIT_SUCCESS);

        // The same merge on the OTHER surface it writes. A config that merged while
        // the compiled agent was rewritten from the edit alone is the overwrite this
        // spec exists to catch, and config assertions cannot see it.
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });
        await expect({ dir: projectDir }).toHaveAgentDynamicSkills("web-developer", {
          skillIds: [ADDED_SKILL.id, PRESERVED_SKILL.id],
        });
      },
    );
  });
});
