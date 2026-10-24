import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, listFiles, loadConfigOrFail, skillsPath } from "../helpers/test-utils.js";
import { EJECT_SOURCE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from` writes a display name onto each entry it adds, as `init --from` does, and the
 * entries it keeps keep theirs: the global one the project inlines comes back through the loader
 * from the global config.ts. Approved at a terminal, because with none the command refuses a
 * change. The fixture's ids are in no catalogue the CLI ships, so only the marketplace can name
 * them.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const INSTALLED_ID = "NamedEdit1";
const ADDS_ZUSTAND_ID = "NamedEdit2";

function onApiDeveloper(skillIds: readonly string[]) {
  return Object.fromEntries(
    skillIds.map((id) => [
      id,
      buildSeedSkill({ install: "eject", scope: "project", assignments: { [API_DEV]: "lazy" } }),
    ]),
  );
}

describe("edit --from records the display name of each skill it adds", () => {
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          ...onApiDeveloper([E2E_SKILL.hono.id]),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      ADDS_ZUSTAND_ID,
      buildSeedPayload({
        skills: onApiDeveloper([E2E_SKILL.hono.id, E2E_SKILL.zustand.id]),
        agents: { [API_DEV]: { scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "names the skill it adds, and every entry it keeps keeps its name",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      const installed = await runInitFrom(store, INSTALLED_ID, project, E2E_SOURCE.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

      prompt = new InteractivePrompt(["edit", "--from", ADDS_ZUSTAND_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await loadConfigOrFail(env.projectDir)).skills,
        "the added entry records its name, and the inlined global entry and the project's own keep theirs",
      ).toStrictEqual([
        {
          id: E2E_SKILL.react.id,
          scope: "global",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.react.display,
        },
        {
          id: E2E_SKILL.hono.id,
          scope: "project",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.hono.display,
        },
        {
          id: E2E_SKILL.zustand.id,
          scope: "project",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.zustand.display,
        },
      ]);
      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual(
        [E2E_SKILL.hono.id, E2E_SKILL.zustand.id].sort(),
      );
      expect(
        await loadConfigOrFail(env.fakeHome),
        "an edit from the project leaves the global config as it was",
      ).toStrictEqual(globalConfigBefore);
    },
  );
});
