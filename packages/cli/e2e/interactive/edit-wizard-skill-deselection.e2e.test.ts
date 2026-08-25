import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { loadConfigOrFail } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Skill deselection behavior E2E test.
 *
 * Verifies that a skill CAN be deselected when it is the only one SELECTED in
 * its category, and that the deselection reaches config.ts — once for a
 * non-exclusive category (web-testing) and once for an exclusive one
 * (web-framework). Neither case is refused: `toggleTechnology` refuses a
 * deselection only for a globally-locked skill at project scope.
 */

describe("skill deselection", () => {
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should allow deselecting the only selected skill in a non-exclusive category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: E2E_SOURCE,
        cols: 120,
        rows: 40,
      });

      // Deselect vitest — the only selected skill in the non-exclusive web-testing
      // category, which also ships web-testing-visual-regression unselected.
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);

      // Complete the wizard
      const result = await wizard.build.saveFromBuild("edit");

      // Config should reflect the deselection (vitest removed, only react remains)
      await expectPhaseSuccess(result, {
        skillIds: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        compiledAgents: ["web-developer"],
      });

      await result.destroy();
    },
  );

  it(
    "should allow deselecting the only selected skill in an exclusive category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: E2E_SOURCE,
        cols: 120,
        rows: 40,
      });

      // Deselect react — the only selected skill in the exclusive web-framework
      // category, which also offers vue-composition-api.
      await wizard.build.selectSkill(E2E_SKILL.react.display);

      // Complete the wizard and verify it exits successfully
      const result = await wizard.build.saveFromBuild("edit");

      // Config should reflect the deselection (react removed from multi-skill category)
      await expectPhaseSuccess(result, {
        agents: ["web-developer"],
        compiledAgents: ["web-developer"],
      });

      // Which skills survive, read structurally. `expectPhaseSuccess` without
      // `skillIds` asserted nothing about them, so the deselection this spec is
      // named for was unobserved — and `toHaveConfig({ skillIds: [] })` cannot
      // stand in for it, because an empty expectation list checks nothing.
      const config = await loadConfigOrFail(result.project.dir);
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([]);

      await result.destroy();
    },
  );
});
