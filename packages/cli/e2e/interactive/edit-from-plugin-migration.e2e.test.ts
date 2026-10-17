import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import "../matchers/setup.js";

/**
 * `edit --from` switching a skill between ejected copy and plugin; skipped without the Claude CLI.
 * The eject direction alone is `edit-eject-migration-reports-copies.e2e.test.ts`.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const AS_PLUGIN_ID = "AsPlugin1";
const AS_EJECT_ID = "AsEject01";

const reactInstalledAs = (install: "plugin" | "eject") =>
  buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install,
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { on: true, scope: "project" } },
  });

describe.skipIf(!claudeAvailable)("edit --from — plugin mode migration", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  /** The Claude CLI keeps plugin bookkeeping in HOME, and both applies must read the same one. */
  let sharedHome: string | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
    store.publish(AS_PLUGIN_ID, reactInstalledAs("plugin"));
    store.publish(AS_EJECT_ID, reactInstalledAs("eject"));
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (sharedHome) {
      await cleanupTempDir(sharedHome);
      sharedHome = undefined;
    }
  });

  async function ejectedProject(): Promise<ProjectHandle> {
    return ProjectBuilder.localProjectWithMarketplace({
      marketplace: fixture.sourceDir,
      skills: [E2E_SKILL.react.id],
      marketplaceName: fixture.marketplaceName,
      agents: [...E2E_AGENTS.WEB],
      domains: ["web"],
    });
  }

  async function applyApproved(
    id: string,
    project: ProjectHandle,
    home: string,
  ): Promise<{ exitCode: number; rawOutput: string }> {
    await prompt?.destroy();
    prompt = new InteractivePrompt(["edit", "--from", id], project.dir, {
      ...TERMINAL_SIZE.TALL,
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.PLUGIN_INSTALL);
    return { exitCode, rawOutput: prompt.getRawOutput() };
  }

  describe("mode migration local -> plugin", () => {
    it(
      "should switch skills from local to plugin mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ejectedProject();
        sharedHome = await createTempDir();

        const result = await applyApproved(AS_PLUGIN_ID, project, sharedHome);

        expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);

        // The whole line, count included: the bare verb cannot tell the two directions apart.
        expect(result.rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );
        expect(result.rawOutput).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

        await expect(project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
        });

        // Config and install are written by different code; an orphan entry is the first without
        // the second.
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect(project).toHavePlugin(reactPluginRef);
        // The registry lives under HOME whatever the plugin's scope.
        await expect({ dir: sharedHome }).toHavePluginInRegistry(reactPluginRef);

        await expect(project).toHaveCompiledAgent(WEB_DEV);
      },
    );

    /**
     * Only a real `claude plugin install` writes a key a later uninstall removes; hand-written
     * state is answered `not found`. So phase one installs for real, with one HOME across both
     * phases.
     */
    it(
      "should drop the plugin registration when a real install is switched back to eject",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await ejectedProject();
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        sharedHome = await createTempDir();

        const installed = await applyApproved(AS_PLUGIN_ID, project, sharedHome);
        expect(installed.exitCode, installed.rawOutput).toBe(EXIT_CODES.SUCCESS);

        // Subject guard: without it the negative passes on a phase one that installed nothing.
        await expect(project).toHavePlugin(reactPluginRef);
        await expect({ dir: sharedHome }).toHavePluginInRegistry(reactPluginRef);

        const ejected = await applyApproved(AS_EJECT_ID, project, sharedHome);
        expect(ejected.exitCode, ejected.rawOutput).toBe(EXIT_CODES.SUCCESS);
        expect(ejected.rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
        );
        expect(ejected.rawOutput).not.toContain(STEP_TEXT.PLUGIN_NATIVE);

        await expect(project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: "eject",
        });
        await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);

        // Config says eject and the plugin is gone, or the skill is installed twice. The matcher
        // also fails an absent registry, hence the guard.
        await expect({ dir: sharedHome }).not.toHavePluginInRegistry(reactPluginRef);

        // KNOWN GAP: `claude plugin uninstall --scope project` leaves `.claude/settings.json`
        // untouched, so `enabledPlugins` still names the plugin. Ruling owed on whether the
        // migration should clear the key itself:
        //   await expect(project).not.toHavePlugin(reactPluginRef);
      },
    );
  });
});
