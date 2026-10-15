import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import "../matchers/setup.js";

/**
 * `edit --from` in plugin mode on a Claude installation: a skill the configuration adds is
 * installed as a plugin, one it leaves out is uninstalled, an apply that changes nothing installs
 * nothing, and a declined apply installs and records nothing.
 *
 * The installation is made by `init --from`, so its plugins are really registered with the Claude
 * CLI and a removal is one the host can observe. The Codex half is
 * `codex-edit-from-plugin-operations.e2e.test.ts`.
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const INSTALLED_ID = "PlugOps01";

const projectPlugin = buildSeedSkill({
  install: "plugin",
  scope: "project",
  assignments: { [WEB_DEV]: "lazy" },
});

/** A configuration holding `skills`, with web-developer pinned to the project. */
const configurationOf = (skills: SeedPayload["skills"]): SeedPayload =>
  buildSeedPayload({ skills, agents: { [WEB_DEV]: { on: true, scope: "project" } } });

describe.skipIf(!claudeAvailable)("edit --from — plugin mode operations", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** A project installed by `init --from` with `skills` as project plugins, under its own HOME. */
  async function installedWith(
    skills: SeedPayload["skills"],
  ): Promise<{ project: ProjectHandle; home: string }> {
    env = await createTestEnvironment({ permissions: false });
    store.publish(INSTALLED_ID, configurationOf(skills));
    const project = { dir: env.projectDir, globalHome: env.fakeHome };

    const installed = await runInitFrom(store, INSTALLED_ID, project, fixture.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return { project, home: env.fakeHome };
  }

  /** Opens `edit --from <id>` over `project` at a real terminal, up to its question. */
  async function openApply(
    { project, home }: { project: ProjectHandle; home: string },
    id: string,
    configuration: SeedPayload,
  ): Promise<InteractivePrompt> {
    store.publish(id, configuration);
    prompt = new InteractivePrompt(["edit", "--from", id], project.dir, {
      ...TERMINAL_SIZE.TALL,
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    return prompt;
  }

  /** Applies `configuration` over the installation, answering yes. */
  async function applyApproved(
    installation: { project: ProjectHandle; home: string },
    id: string,
    configuration: SeedPayload,
  ): Promise<{ exitCode: number; rawOutput: string }> {
    const opened = await openApply(installation, id, configuration);
    await opened.confirm();
    const exitCode = await opened.waitForExit(TIMEOUTS.PLUGIN_INSTALL);
    return { exitCode, rawOutput: opened.getRawOutput() };
  }

  it(
    "uninstalls a plugin skill the configuration leaves out",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const installation = await installedWith({
        [E2E_SKILL.react.id]: projectPlugin,
        [E2E_SKILL.vitest.id]: projectPlugin,
      });
      const { project, home } = installation;
      const vitestRef = buildMarketplacePluginRef(E2E_SKILL.vitest.id, fixture.marketplaceName);
      // Subject guard: the plugin the apply must take away really is registered.
      await expect({ dir: home }).toHavePluginInRegistry(vitestRef);

      const result = await applyApproved(
        installation,
        "PlugDrop1",
        configurationOf({ [E2E_SKILL.react.id]: projectPlugin }),
      );

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: fixture.marketplaceName,
      });
      await expect({ dir: home }).not.toHavePluginInRegistry(vitestRef);
      await expect(project).toHaveCompiledAgentContent(WEB_DEV, {
        notContains: [E2E_SKILL.vitest.id],
      });
    },
  );

  it(
    "installs a plugin skill the configuration adds",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const installation = await installedWith({ [E2E_SKILL.react.id]: projectPlugin });
      const { project } = installation;

      const result = await applyApproved(
        installation,
        "PlugAdd01",
        configurationOf({
          [E2E_SKILL.react.id]: projectPlugin,
          [E2E_SKILL.pinia.id]: projectPlugin,
        }),
      );

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(result.rawOutput).toContain(
        `Installed ${buildMarketplacePluginRef(E2E_SKILL.pinia.id, fixture.marketplaceName)}`,
      );
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
        origin: fixture.marketplaceName,
      });
      await expect(project).toHaveCompiledAgentContent(WEB_DEV, {
        contains: [E2E_SKILL.pinia.id],
      });
    },
  );

  it(
    "completes an unchanged apply without installing a plugin",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const installation = await installedWith({ [E2E_SKILL.react.id]: projectPlugin });
      const { project } = installation;

      const result = await applyApproved(
        installation,
        "PlugSame1",
        configurationOf({ [E2E_SKILL.react.id]: projectPlugin }),
      );

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(result.rawOutput).not.toContain(STEP_TEXT.INSTALLING_PLUGINS);
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
    },
  );

  /**
   * The one pending change is an ADD, the case above where the install happens, so a declined
   * apply that committed anyway would show it as a plugin install.
   */
  it(
    "installs nothing and records nothing when an apply adding a plugin skill is declined",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const installation = await installedWith({ [E2E_SKILL.react.id]: projectPlugin });
      const configBefore = await readTestFile(configTsPath(installation.project.dir));

      const opened = await openApply(
        installation,
        "PlugNo001",
        configurationOf({
          [E2E_SKILL.react.id]: projectPlugin,
          [E2E_SKILL.pinia.id]: projectPlugin,
        }),
      );
      await opened.deny();
      const exitCode = await opened.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode).toBe(EXIT_CODES.CANCELLED);
      expect(opened.getRawOutput()).not.toContain(STEP_TEXT.INSTALLING_PLUGINS);
      expect(
        await readTestFile(configTsPath(installation.project.dir)),
        "a declined apply must not record the pending skill in config.ts",
      ).toBe(configBefore);
    },
  );
});
