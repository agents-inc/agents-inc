import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture, ensureBinaryExists } from "../helpers/test-utils.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * The eject direction of a mode switch, without the Claude CLI.
 *
 * `edit-wizard-plugin-migration.e2e.test.ts` drives the same switch against a real
 * plugin marketplace and is skipped wherever the Claude binary is absent, so on
 * its own it leaves this behaviour unguarded on those machines. Nothing in the
 * eject direction needs that binary to reach the copies: `executeMigration` copies
 * each skill BEFORE it attempts the plugin uninstall, and the uninstall is
 * best-effort, so the copy count is produced either way.
 *
 * What it must produce with it is the account of the work. The plugin direction
 * narrates per-skill installs and a count; this direction prints its intent and
 * then goes quiet, though `MigrationResult.ejectedSkills` has the answer and is
 * read by nobody.
 */
describe("switching a skill to eject mode reports the copies it made", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;

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
  });

  it(
    "names the count of local copies, in the words the command already uses for one",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // An install whose skill is recorded against a marketplace, so switching it
      // to eject is a genuine plugin -> eject migration.
      const project = await ProjectBuilder.pluginProject({
        skills: [E2E_SKILL.react.id],
        marketplaceName: E2E_MARKETPLACE_NAME,
        agents: [...E2E_AGENTS.WEB],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, source });

      const sources = await wizard.build.advanceToSources();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const rawOutput = result.rawOutput;
      // Proof of execution: the migration ran, in the eject direction, for one
      // skill. Without this the count line could be asserted on a run that never
      // switched anything.
      expect(rawOutput).toContain(
        `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
      );
      // …and the copies it performed are named. No destination path: the
      // migration splits its copies between the project and $HOME by each skill's
      // own scope, so one directory would misname the other half.
      expect(rawOutput).toContain(
        `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX}`,
      );

      // Both sides of the state change: the copy is on disk and the config records
      // the new source.
      await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: "eject",
      });
    },
  );
});
