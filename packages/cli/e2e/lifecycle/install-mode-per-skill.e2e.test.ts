import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, STEP_TEXT } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * Install-mode lifecycle E2E tests -- per-skill switching.
 *
 * Tests the full flow of switching ONE skill's install mode mid-lifecycle:
 *   9c: Init local -> edit switch ONE skill to plugin -> verify mixed state
 *
 * These tests require the Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode mid-lifecycle -- per-skill switching", () => {
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

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("per-skill install-mode switching -- mixed local and plugin", () => {
    it(
      "should support mixed install modes with per-skill switching",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");
        await mkdir(projectDir, { recursive: true });

        // This test switches ONE skill's install MODE (eject -> plugin) mid-edit, of
        // default-scope (global) skills, so both phases run as the GLOBAL install: HOME ==
        // cwd == projectDir, and all content + config collapse onto projectDir (every
        // assertion below reads it).
        const site = { dir: projectDir, home: projectDir };

        // Phase 1: Init in eject mode
        const initResult = await installFromSeed(
          store,
          "Ejected1",
          e2eStackPayload(),
          site,
          fixture.sourceDir,
        );

        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            origin: "eject",
            copiedSkills: [E2E_SKILL.react.id],
          },
        );

        // Phase 2: Edit -- ONLY React as a plugin.
        const editResult = await applyFromSeed(
          store,
          "ReactPlugin1",
          e2eStackPayload({ pluginSkills: [E2E_SKILL.react.id] }),
          site,
        );
        expect(editResult.output).toContain(STEP_TEXT.EDIT_SUCCESS);

        // Which direction the switch went, and how many skills it took. The
        // alternation `/[Ss]witch|[Ii]nstall/` that stood here passed on either
        // word, so it could not tell a switch to plugin mode from a switch back —
        // nor a per-skill switch from the bulk one the sibling spec drives.
        const rawOutput = editResult.output;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );

        // Structural, not a substring of the whole config text: `toContain(name)`
        // is satisfied by the config's `marketplace` field whether or not any
        // skill's `origin` moved.
        const switchedEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
        expect(switchedEntries.map((entry) => entry.origin)).toStrictEqual([
          fixture.marketplaceName,
        ]);

        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
