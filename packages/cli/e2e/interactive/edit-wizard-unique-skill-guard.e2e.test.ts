import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists, loadConfigOrFail } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Skill deselection behavior E2E test.
 *
 * Verifies that a skill CAN be deselected when it is the only skill in a
 * non-required category (no guard fires, skill is removed from config).
 * Multi-skill categories also allow normal toggling.
 *
 * Note: The exclusive+required guard (which blocks deselection) cannot be
 * tested at E2E level because the E2E source has no category that is both
 * exclusive and required with only one skill. That edge case is covered by
 * the unit test in wizard-store.test.ts.
 */

describe("unique skill in category guard", () => {
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

  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should allow deselecting the only skill in a non-required single-skill category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: { sourceDir, tempDir: sourceTempDir },
        cols: 120,
        rows: 40,
      });

      // Deselect vitest — web-testing is not required, so deselection succeeds
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);

      // Verify no toast message appeared (guard no longer fires for non-required categories)
      const output = wizard.build.getOutput();
      expect(output).not.toContain("Cannot deselect the only skill in this category");

      // Complete the wizard
      const result = await wizard.build.saveFromBuild("edit");

      // Config should reflect the deselection (vitest removed, only react remains)
      await expectPhaseSuccess(result, {
        skillIds: ["web-framework-react"],
        agents: ["web-developer"],
        compiledAgents: ["web-developer"],
      });

      await result.destroy();
    },
  );

  it(
    "should allow deselecting in a category with multiple skills",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: { sourceDir, tempDir: sourceTempDir },
        cols: 120,
        rows: 40,
      });

      // Attempt to deselect react — web-framework has 2 skills (react + vue)
      await wizard.build.selectSkill(E2E_SKILL.react.display);

      // Verify no toast message appeared
      const output = wizard.build.getOutput();
      expect(output).not.toContain("Cannot deselect the only skill in this category");

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
