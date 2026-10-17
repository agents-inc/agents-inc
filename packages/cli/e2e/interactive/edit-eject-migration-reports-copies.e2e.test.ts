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
 * The eject direction of a mode switch, without the Claude CLI: copies happen before the
 * best-effort plugin uninstall, so the copy account must be printed either way.
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
      // Recorded against a marketplace, so eject is a real plugin-to-eject migration.
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

      // Proof the migration ran, eject direction, one skill.
      expect(rawOutput).toContain(
        `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
      );
      // No destination path: copies split between project and HOME by each skill's scope.
      expect(rawOutput).toContain(
        `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX}`,
      );

      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: "eject",
      });
    },
  );
});
