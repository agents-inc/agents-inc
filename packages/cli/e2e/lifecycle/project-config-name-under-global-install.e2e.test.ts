import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { createGlobalOnlyEnvFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { configTsPath, loadConfigOrFail, readTestFile } from "../helpers/test-utils.js";
import { TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * A project set up under an existing global install names its config.ts for its own directory,
 * not for the global config the save reconciles against.
 */
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

    // Subject guard: the two identities must differ, or the bug is unreachable.
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

    // A project save must not rename the global config, and its roster must still be on disk.
    const globalConfig = await loadConfigOrFail(fakeHome);
    expect(globalConfig.name).not.toBe(path.basename(projectDir));
    await expect({ dir: fakeHome }).toHaveLocalSkills([...E2E_STACK_SKILL_IDS]);
    await expect({ dir: projectDir }).toHaveNoLocalSkills();
  });
});
