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
 * A project's config.ts is named for the project directory it configures — the
 * identity `eject` passes as its `fallbackName` and the loader repairs a missing
 * `name` to.
 *
 * The greenfield half of this is pinned by init-from-mixed-scope-config-split.e2e.test.ts,
 * where nothing else is installed. This is the other half, and the dominant
 * real-world shape: a machine that already carries a GLOBAL install, and a
 * project set up underneath it. `loadProjectConfig` falls back to `os.homedir()`
 * for a project with no config of its own, so the "existing" config the save
 * reconciles against is the GLOBAL one — whose name identifies the global
 * installation and no directory here.
 */
describe("project config identity under an existing global install", () => {
  let store: SeedConfigStore;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    // Phase A installs globally at the fake HOME; Phase B sets the project up
    // underneath it with every skill and sub-agent left at global scope.
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

    // Subject guard: the two identities must actually differ here, or every
    // assertion below passes without the bug ever being reachable.
    expect(
      globalName,
      "the global install must be named something other than this project directory",
    ).not.toBe(projectName);

    // Asserted on the written text as well as structurally: the loader SUPPLIES
    // the directory name when the field is absent, so a structural read alone
    // would pass over a config that never carried one.
    expect(await readTestFile(configTsPath(projectDir))).toContain(`name: '${projectName}'`);
    expect((await loadConfigOrFail(projectDir)).name).toBe(projectName);
  });

  it("leaves the global config carrying its own name and roster", async () => {
    const { fakeHome, projectDir } = env!;

    // The other side of the same write: a project save must not rename the global
    // config either, and the roster it installed has to still be on disk under it.
    const globalConfig = await loadConfigOrFail(fakeHome);
    expect(globalConfig.name).not.toBe(path.basename(projectDir));
    await expect({ dir: fakeHome }).toHaveLocalSkills([...E2E_STACK_SKILL_IDS]);
    await expect({ dir: projectDir }).toHaveNoLocalSkills();
  });
});
