import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { cleanupFixture, cleanupTempDir, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("scope-aware local skill copying", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;

  let tempDir: string | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  function installGlobally(home: string, install: "eject" | "plugin") {
    return installFromSeed(
      store,
      `Global${install}`,
      e2eStackPayload({ install }),
      { dir: home, home },
      fixture.sourceDir,
    );
  }

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("init mixed mode -- scope-aware local copy", () => {
    it(
      "should copy project-scoped local skills to project dir and global-scoped local skills to HOME dir",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Mixed mode. A project skill never reaches the global web-developer, so the project's
        // React is assigned to no sub-agent.
        const { output: rawOutput } = await installFromSeed(
          store,
          "Mixed1",
          e2eStackPayload({
            install: "eject",
            pluginSkills: E2E_STACK_SKILL_IDS.filter(
              (id) => id !== E2E_SKILL.react.id && id !== E2E_SKILL.vitest.id,
            ),
            projectSkills: [E2E_SKILL.react.id],
            unassigned: [E2E_SKILL.react.id],
          }),
          { dir: projectDir, home: fakeHome },
          fixture.sourceDir,
        );

        expect(rawOutput).toContain("Mixed");

        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      },
    );
  });

  /**
   * Run at global edit scope (HOME === cwd): a global skill's migration resolves paths from its own
   * scope, so the copy is written to and removed from `$HOME`.
   */
  describe("edit source switch -- scope-aware migration", () => {
    it(
      "should copy to HOME when switching global-scope skill from plugin to local",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome } = env;

        await installGlobally(fakeHome, "plugin");

        const reactBefore = await readSkillEntries(fakeHome, E2E_SKILL.react.id);
        expect(
          reactBefore.map((entry) => entry.origin),
          "react must start plugin-sourced",
        ).toEqual([fixture.marketplaceName]);

        await applyFromSeed(store, "Ejected1", e2eStackPayload({ install: "eject" }), {
          dir: fakeHome,
          home: fakeHome,
        });

        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
        expect(
          (await readSkillEntries(fakeHome, E2E_SKILL.react.id)).map((entry) => entry.origin),
          "the global config must record the eject source the migration performed",
        ).toEqual(["eject"]);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      },
    );

    it(
      "should delete from HOME when switching global-scope skill from local to plugin",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome } = env;

        await installGlobally(fakeHome, "eject");

        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        const { output: rawOutput } = await applyFromSeed(
          store,
          "Plugins1",
          e2eStackPayload({ install: "plugin" }),
          { dir: fakeHome, home: fakeHome },
        );

        expect(rawOutput).toContain("Switching");
        expect(rawOutput).toContain(`to ${STEP_TEXT.PLUGIN_NATIVE}`);

        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        expect(
          (await readSkillEntries(fakeHome, E2E_SKILL.react.id)).map((entry) => entry.origin),
          "the global config must record the marketplace source the migration performed",
        ).toEqual([fixture.marketplaceName]);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      },
    );
  });
});
