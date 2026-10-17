import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runEditFrom,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from` with a configuration that removes nothing: only the plan heading changes, the
 * confirm is still asked and a decline still changes nothing. Installed by `init --from` so
 * provenance is the installer's own.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const INSTALLED_ID = "AddsOnly01";
const ADDS_ONLY_ID = "AddsOnly02";

const INSTALLED_SKILL = E2E_SKILL.react;
const ADDED_SKILL = E2E_SKILL.vitest;

describe("edit --from a configuration that removes nothing", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  function publish(id: string, skills: readonly string[]): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: Object.fromEntries(
          skills.map((skillId) => [
            skillId,
            buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
          ]),
        ),
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  /** A HOME of its own: at the home root the command refuses a project-scoped configuration. */
  async function installFromNothing(): Promise<{ dir: string; globalHome: string }> {
    const env = await createTestEnvironment();
    tempDirs.push(env.tempDir);
    publish(INSTALLED_ID, [INSTALLED_SKILL.id]);

    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    return project;
  }

  function launch(id: string, project: { dir: string; globalHome: string }): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], project.dir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
    });
  }

  it("says nothing is removed, and asks anyway", { timeout: TIMEOUTS.INTERACTIVE }, async () => {
    const project = await installFromNothing();
    publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);

    prompt = launch(ADDS_ONLY_ID, project);
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_NOTHING_REMOVED, TIMEOUTS.WIZARD_LOAD);

    const planned = prompt.getOutput();
    // A removal heading over an empty list would be a lie; the line above is the subject guard.
    expect(
      planned,
      "a configuration that takes nothing away must not open by promising removals",
    ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW);
    // Still asks: applying the whole configuration is a change either way.
    expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
  });

  it(
    "applies the whole configuration once approved, on both surfaces",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installFromNothing();
      publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);

      prompt = launch(ADDS_ONLY_ID, project);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      // Both surfaces: config entry and directory can each look right alone.
      const config = await loadConfigOrFail(project.dir);
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
        [INSTALLED_SKILL.id, ADDED_SKILL.id].sort(),
      );
      expect(await listFiles(skillsPath(project.dir))).toStrictEqual(
        [INSTALLED_SKILL.id, ADDED_SKILL.id].sort(),
      );
    },
  );

  it(
    "leaves the installation byte-identical when declined",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installFromNothing();
      publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);
      const before = await readTreeSnapshot(project.dir);

      prompt = launch(ADDS_ONLY_ID, project);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.deny();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode).toBe(EXIT_CODES.CANCELLED);
      // Nothing at all moved: a decline must not rewrite config.ts or recompile.
      expect(await readTreeSnapshot(project.dir)).toStrictEqual(before);
    },
  );

  it("refuses without a terminal, and spends nothing on the store", async () => {
    const project = await installFromNothing();
    publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);
    const before = await readTreeSnapshot(project.dir);
    const spentInstalling = store.requests.length;

    const { exitCode, output } = await runEditFrom(store, ADDS_ONLY_ID, project);

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_NEEDS_TERMINAL);
    // The refusal does not depend on the configuration, so it is not fetched.
    expect(store.requests.slice(spentInstalling)).toStrictEqual([]);
    expect(await readTreeSnapshot(project.dir)).toStrictEqual(before);
  });
});
