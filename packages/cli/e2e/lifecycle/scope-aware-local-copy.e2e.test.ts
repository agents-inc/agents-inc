import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
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

/**
 * Scope-aware local skill copying E2E tests.
 *
 * These tests verify that local skill copies respect per-skill scope:
 *   - Project-scoped local skills -> <project>/.claude/skills/
 *   - Global-scoped local skills  -> ~/.claude/skills/
 *
 * All tests require the Claude CLI for plugin install/uninstall operations.
 */

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

  /** The E2E stack at HOME, every skill installed `install`. */
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

        // React in the project and the rest global; react and vitest local, the rest
        // plugins (mixed mode). A project skill never reaches the global web-developer, so
        // the project's React is assigned to no sub-agent.
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

        // Should be mixed mode (some local, some plugin)
        expect(rawOutput).toContain("Mixed");

        // --- Scope-aware copy assertions ---
        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      },
    );
  });

  /**
   * The two migration tests run at GLOBAL edit scope (HOME == cwd == fakeHome).
   *
   * The subject is not the driving context: a
   * global-scoped skill's install-mode migration resolves its paths from its own scope, so the
   * local copy is written to and removed from `$HOME`. Global scope is where that switch is
   * legitimate, so it is where it is now pinned. The old `not.toHaveSkillCopied(projectDir)`
   * assertions are gone rather than carried over — with no project install in the run at all,
   * they would pass against an empty directory and prove nothing. The global config's recorded
   * `source` takes their place: it is the config half of the same claim, and it moves.
   */
  describe("edit source switch -- scope-aware migration", () => {
    it(
      "should copy to HOME when switching global-scope skill from plugin to local",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome } = env;

        // Phase 1: Init in plugin mode -- all skills global scope, plugin source
        await installGlobally(fakeHome, "plugin");

        const reactBefore = await readSkillEntries(fakeHome, E2E_SKILL.react.id);
        expect(
          reactBefore.map((entry) => entry.origin),
          "react must start plugin-sourced",
        ).toEqual([fixture.marketplaceName]);

        // Phase 2: Edit the global install -- every skill local
        await applyFromSeed(store, "Ejected1", e2eStackPayload({ install: "eject" }), {
          dir: fakeHome,
          home: fakeHome,
        });

        // --- Assertions ---
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
        expect(
          (await readSkillEntries(fakeHome, E2E_SKILL.react.id)).map((entry) => entry.origin),
          "the global config must record the eject source the migration performed",
        ).toEqual([EJECT_SOURCE]);
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

        // Phase 1: Init in eject mode -- all skills global scope
        await installGlobally(fakeHome, "eject");

        // Verify Phase 1: Skills were copied to HOME
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        // Phase 2: Edit the global install -- every skill a plugin
        const { output: rawOutput } = await applyFromSeed(
          store,
          "Plugins1",
          e2eStackPayload({ install: "plugin" }),
          { dir: fakeHome, home: fakeHome },
        );

        expect(rawOutput).toContain("Switching");
        expect(rawOutput).toContain(`to ${STEP_TEXT.PLUGIN_NATIVE}`);

        // --- Assertions ---
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
