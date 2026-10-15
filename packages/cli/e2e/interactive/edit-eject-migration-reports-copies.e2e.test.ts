import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture } from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * The eject direction of a mode switch, without the Claude CLI.
 *
 * `edit-from-plugin-migration.e2e.test.ts` drives the same switch against a real
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

const WEB_DEV = E2E_AGENT["web-developer"].name;
const EJECTED_ID = "Ejected01";

describe("switching a skill to eject mode reports the copies it made", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    // The installed skill, asked for as an ejected copy.
    store.publish(
      EJECTED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { on: true, scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
  });

  it(
    "names the count of local copies, in the words the command already uses for one",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // An install whose skill is recorded against a marketplace, so switching it
      // to eject is a genuine plugin -> eject migration.
      const project = await ProjectBuilder.pluginProject({
        marketplace: source.sourceDir,
        skills: [E2E_SKILL.react.id],
        marketplaceName: E2E_MARKETPLACE_NAME,
        agents: [...E2E_AGENTS.WEB],
        domains: ["web"],
      });

      prompt = new InteractivePrompt(["edit", "--from", EJECTED_ID], project.dir, {
        ...TERMINAL_SIZE.TALL,
        env: { AGENTS_INC_API_URL: store.url },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      const rawOutput = prompt.getRawOutput();

      expect(exitCode, rawOutput).toBe(EXIT_CODES.SUCCESS);

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
      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: "eject",
      });
    },
  );
});
