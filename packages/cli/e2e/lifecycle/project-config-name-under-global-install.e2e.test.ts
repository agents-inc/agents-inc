import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTestEnvironment,
  type DualScopeEnv,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { createGlobalOnlyEnvFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

import type { SeedPayload } from "@workspace/matrix/seed";

describe("project config identity under an existing global install", () => {
  let store: SeedConfigStore;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    env = await createGlobalOnlyEnvFromSeed(store);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await env?.destroy();
    await store.close();
  });

  it("names the project config for the project directory, not for the global config", async () => {
    const { fakeHome, projectDir } = env!;
    const projectName = path.basename(projectDir);
    const globalName = (await loadConfigOrFail(fakeHome)).name;

    expect(
      globalName,
      "the global install must be named something other than this project directory",
    ).not.toBe(projectName);

    // Asserted on the text too: the loader supplies the name when absent.
    expect(await readTestFile(configTsPath(projectDir))).toContain(`name: '${projectName}'`);
    expect((await loadConfigOrFail(projectDir)).name).toBe(projectName);
  });

  it("leaves the global config carrying its own name and roster", async () => {
    const { fakeHome, projectDir } = env!;

    const globalConfig = await loadConfigOrFail(fakeHome);
    expect(globalConfig.name).not.toBe(path.basename(projectDir));
    await expect({ dir: fakeHome }).toHaveLocalSkills([...E2E_STACK_SKILL_IDS]);
    await expect({ dir: projectDir }).toHaveNoLocalSkills();
  });
});

const GLOBAL_DESCRIPTION = "The global install";
const OWN_DESCRIPTION = "A project that says what it is";

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/** No `stackId`, as the CLI and the editor mint them, so no stack lends a description. */
function globalPayload(): SeedPayload {
  return buildSeedPayload({
    description: GLOBAL_DESCRIPTION,
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: "global" } },
  });
}

function projectPayload(description: string | undefined): SeedPayload {
  return buildSeedPayload({
    ...(description !== undefined && { description }),
    skills: {
      [E2E_SKILL.vitest.id]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [API_DEV]: "lazy" },
      }),
    },
    agents: { [API_DEV]: { scope: "project" } },
  });
}

/**
 * A project's config.ts inlines the global installation's entries but describes only the project:
 * installed from a configuration with no description, it carries none. A project installed with its
 * own description is the control.
 */
describe("project config description under a global install that has one", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "keeps the project's own description, and borrows none from the global installation",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const { fakeHome, projectDir: undescribedDir } = env;
      const describedDir = path.join(fakeHome, "described");
      await mkdir(describedDir, { recursive: true });
      store.publish("Global01", globalPayload());
      store.publish("NoDesc01", projectPayload(undefined));
      store.publish("OwnDesc1", projectPayload(OWN_DESCRIPTION));

      const atHome = await runInitFrom(store, "Global01", { dir: fakeHome }, E2E_SOURCE.sourceDir);
      expect(atHome.exitCode, `global install failed: ${atHome.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await loadConfigOrFail(fakeHome)).description,
        "the global installation has a description a project could borrow",
      ).toBe(GLOBAL_DESCRIPTION);

      const undescribed = await runInitFrom(
        store,
        "NoDesc01",
        { dir: undescribedDir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(undescribed.exitCode, `install failed: ${undescribed.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const described = await runInitFrom(
        store,
        "OwnDesc1",
        { dir: describedDir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(described.exitCode, `install failed: ${described.output}`).toBe(EXIT_CODES.SUCCESS);

      expect((await loadConfigOrFail(undescribedDir)).description).toBeUndefined();
      expect(await readTestFile(configTsPath(undescribedDir))).not.toContain(GLOBAL_DESCRIPTION);
      expect((await loadConfigOrFail(describedDir)).description).toBe(OWN_DESCRIPTION);
      expect(
        (await loadConfigOrFail(fakeHome)).description,
        "a project install leaves the global installation's description as it was",
      ).toBe(GLOBAL_DESCRIPTION);
    },
  );
});
