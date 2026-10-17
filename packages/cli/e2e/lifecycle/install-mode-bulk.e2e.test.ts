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
 * Switching EVERY skill's install mode mid-lifecycle, eject to plugin and back. Requires the Claude
 * CLI. Both run as the global install (HOME === cwd === projectDir).
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

        // A plugin-mode skill is registered in settings.json and has no ejected copy.
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

        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).toHaveNoPlugins();

        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
