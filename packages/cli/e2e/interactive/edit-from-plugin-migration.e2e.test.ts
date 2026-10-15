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
 * `edit --from` switching a skill's install mode between an ejected copy and a plugin.
 *
 * The entire suite is skipped when the Claude CLI is not available. The eject direction alone,
 * which needs no Claude CLI, is `edit-eject-migration-reports-copies.e2e.test.ts`.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const AS_PLUGIN_ID = "AsPlugin1";
const AS_EJECT_ID = "AsEject01";

/** The project's one skill, installed the way `install` names, on its one sub-agent. */
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
  /**
   * A global HOME the TEST owns: the Claude CLI keeps its plugin bookkeeping there, and the
   * round trip below needs both of its applies to read the same one.
   */
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

  /** An ejected project whose config also names the fixture's marketplace. */
  async function ejectedProject(): Promise<ProjectHandle> {
    return ProjectBuilder.localProjectWithMarketplace({
      marketplace: fixture.sourceDir,
      skills: [E2E_SKILL.react.id],
      marketplaceName: fixture.marketplaceName,
      agents: [...E2E_AGENTS.WEB],
      domains: ["web"],
    });
  }

  /** Applies `id` in `project` at a real terminal under `home`, answering yes. */
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

        // The whole composed narration line, count included: the bare verb
        // cannot tell a switch TO plugin from the switch BACK that the sibling
        // case drives, and the count is what tells a per-skill switch from a
        // bulk one.
        expect(result.rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );
        expect(result.rawOutput).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

        await expect(project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
        });

        // The config and the install are written by different code, and the orphan-entry
        // class is exactly the case where the first happened and the second did not.
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect(project).toHavePlugin(reactPluginRef);
        // The Claude CLI keeps its own bookkeeping under HOME whatever scope it enabled
        // the plugin at, so the registry half is asserted against the run's HOME.
        await expect({ dir: sharedHome }).toHavePluginInRegistry(reactPluginRef);

        await expect(project).toHaveCompiledAgent(WEB_DEV);
      },
    );

    /**
     * The DEPARTURE half, and the only place in this suite it can be asserted for Claude.
     *
     * `toHavePlugin` reads `.claude/settings.json`, and only a real `claude plugin
     * install` puts a key there that a later `claude plugin uninstall` will take back out
     * — measured against Claude Code 2.1.239, hand-written state (settings.json alone, or
     * settings.json plus an `installed_plugins.json` record at either scope) is answered
     * with `not found in installed plugins`, which `claudePluginUninstall` swallows by
     * design. So this test installs for real in phase one and switches back in phase two,
     * with ONE HOME across both: the Claude CLI keeps its bookkeeping there.
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

        // The subject guard. Without it the negative below passes for a phase one that
        // never installed anything, which is the whole failure mode this test exists for.
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

        // The claim no spec could make before: the config says eject AND the external
        // effect followed it. A migration that rewrote the config and left the plugin
        // installed leaves the skill installed twice, and every other assertion here is
        // green in that state. The guard after phase one is what makes this non-vacuous —
        // the matcher also fails an ABSENT registry, so without it a phase one that never
        // installed would satisfy the negation for free.
        await expect({ dir: sharedHome }).not.toHavePluginInRegistry(reactPluginRef);

        // KNOWN GAP: the project's `enabledPlugins` still names the plugin here, so the
        // settings.json half of the departure cannot be asserted. It is the Claude CLI's
        // write, not ours: measured on Claude Code 2.1.239, `claude plugin uninstall <key>
        // --scope project` removes `installed_plugins.json` and leaves
        // `.claude/settings.json` byte-identical, so a switched skill is left enabled
        // against a plugin that is no longer installed. Owner ruling owed on whether the
        // migration should clear the key itself; until then this line would pin the defect
        // rather than the contract:
        //   await expect(project).not.toHavePlugin(reactPluginRef);
      },
    );
  });
});
