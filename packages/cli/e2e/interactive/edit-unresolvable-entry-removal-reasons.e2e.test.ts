import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  skillsPath,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import type { SkillId } from "../../src/cli/types/index.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * An entry the wizard could not resolve is removed — and the Changes block says WHY it went,
 * which is the only removal the user did not ask for and so the only one that owes a reason.
 *
 * There are two ways to become unresolvable and they are not the same fault. A marketplace
 * entry the source no longer carries is gone from the catalogue; a local entry is gone from
 * the disk. Both used to print "not present in <source>", which named the marketplace for a
 * skill the marketplace never had anything to do with.
 *
 * The third way — local files present, metadata.yaml unreadable — is not a removal at all:
 * it stops the run, and is pinned by `edit-refuses-unusable-local-skill-metadata`.
 */

/** Claimed by both fixtures' configs, carried by neither source. */
const DROPPED_SKILL: SkillId = "web-styling-tailwind";

const claudeAvailable = await isClaudeCLIAvailable();

describe("edit — why an unresolvable entry went", () => {
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("a local entry whose skill files are gone", () => {
    let sourceFixture: E2ESource;

    beforeAll(async () => {
      await ensureBinaryExists();
      sourceFixture = await createE2ESource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(sourceFixture);
    });

    it(
      "names the directory the skill is missing from, not the marketplace",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // An eject-sourced entry with no files written for it: the source never carried the
        // skill either, so nothing can resolve it and the merge drops the entry.
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: [DROPPED_SKILL],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        const missingSkillDir = path.join(skillsPath(project.dir), DROPPED_SKILL);

        // The whole line: the command's own scope-tagged removal row AND the reason, which
        // for a local install is where the files should have been and were not.
        expect(
          rawOutput,
          "a local entry's removal must name the directory its skill is missing from",
        ).toContain(
          `${REMOVED_MARKER} ${DROPPED_SKILL} [P] (${STEP_TEXT.REMOVED_REASON_FILES_GONE} ${missingSkillDir})`,
        );
        expect(
          rawOutput,
          "the marketplace must not be blamed for files missing from the install",
        ).not.toContain(`[P] (${STEP_TEXT.REMOVED_REASON_NOT_IN_SOURCE}`);

        const config = await loadConfigOrFail(result.project.dir);
        expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);

        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          notContains: [DROPPED_SKILL],
        });
      },
    );
  });

  describe.skipIf(!claudeAvailable)("a marketplace entry the source no longer carries", () => {
    let pluginFixture: E2EPluginSource;

    beforeAll(async () => {
      await ensureBinaryExists();
      pluginFixture = await createE2EPluginSource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(pluginFixture);
    });

    it(
      "names the source the skill is not present in",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: [DROPPED_SKILL],
          marketplaceName: pluginFixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: pluginFixture,
          ...TERMINAL_SIZE.TALL,
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        expect(
          rawOutput,
          "a marketplace entry's removal must name the source that dropped it",
        ).toContain(
          `${REMOVED_MARKER} ${DROPPED_SKILL} [P] (${STEP_TEXT.REMOVED_REASON_NOT_IN_SOURCE} ${pluginFixture.marketplaceName})`,
        );
        expect(
          rawOutput,
          "a skill that was never ejected has no local files to report missing",
        ).not.toContain(STEP_TEXT.REMOVED_REASON_FILES_GONE);

        const config = await loadConfigOrFail(result.project.dir);
        expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      },
    );
  });
});
