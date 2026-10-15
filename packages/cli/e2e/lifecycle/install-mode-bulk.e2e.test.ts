import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  directoryExists,
  skillsPath,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * Install-mode lifecycle E2E tests -- bulk switching.
 *
 * Tests the full flow of switching EVERY skill's install mode mid-lifecycle:
 *   9a: Init local -> edit switch ALL to plugin -> verify plugin state
 *   9b: Init plugin -> edit switch ALL to local -> verify local state
 *
 * These tests require the Claude CLI for plugin install/uninstall operations.
 *
 * Both tests switch the SOURCE of default-scope (global) skills mid-edit, so both
 * phases run as the GLOBAL install: HOME == cwd == projectDir, and all content +
 * config collapse onto projectDir (which every assertion below reads).
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode mid-lifecycle -- bulk switching", () => {
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

  /** A fresh directory that is both HOME and cwd for every run below. */
  async function globalRoot(): Promise<string> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("init local, edit switch all to plugin", () => {
    it(
      "should switch all skills from eject to plugin mode via edit --from",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const projectDir = await globalRoot();
        const site = { dir: projectDir, home: projectDir };

        // Phase 1: Init in eject mode
        const initResult = await installFromSeed(
          store,
          "Ejected1",
          e2eStackPayload({ install: "eject" }),
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

        // Phase 2: Edit -- every skill as a plugin
        const editResult = await applyFromSeed(
          store,
          "Plugins1",
          e2eStackPayload({ install: "plugin" }),
          site,
        );

        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: editResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            origin: fixture.marketplaceName,
            compiledAgents: E2E_AGENTS.WEB_AND_API,
          },
        );

        const rawOutput = editResult.output;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );

        // The narration is what the run SAID; the install mode is what it DID, and
        // that is this file's subject. A plugin-mode skill is registered in
        // settings.json and its ejected copy is gone from .claude/skills/.
        await expect({ dir: projectDir }).toHavePlugin(
          `${E2E_SKILL.react.id}@${fixture.marketplaceName}`,
        );
        expect(
          await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.react.id)),
          "switching to plugin mode must remove the ejected copy",
        ).toBe(false);
      },
    );
  });

  describe("init plugin, edit switch all to eject", () => {
    it(
      "should switch all skills from plugin to eject mode via edit --from",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const projectDir = await globalRoot();
        const site = { dir: projectDir, home: projectDir };

        // Phase 1: Init in plugin mode
        const initResult = await installFromSeed(
          store,
          "Plugins2",
          e2eStackPayload({ install: "plugin" }),
          site,
          fixture.sourceDir,
        );

        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            origin: fixture.marketplaceName,
            compiledAgents: E2E_AGENTS.WEB_AND_API,
          },
        );

        // Phase 2: Edit -- every skill ejected
        const editResult = await applyFromSeed(
          store,
          "Ejected2",
          e2eStackPayload({ install: "eject" }),
          site,
        );

        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: editResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            origin: "eject",
            copiedSkills: [E2E_SKILL.react.id],
          },
        );

        const rawOutput = editResult.output;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
        );

        // Same reasoning as the sibling above, in the other direction: the ejected
        // copy is back on disk and the plugin registration is gone.
        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).toHaveNoPlugins();

        // HOME, cwd and the install collapse onto projectDir (see the file header), so
        // that is where the recompile has to land.
        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
