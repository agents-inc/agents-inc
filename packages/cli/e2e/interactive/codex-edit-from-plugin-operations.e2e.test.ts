import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { isCodexCLIAvailable, runCodex } from "../fixtures/codex.js";
import { codexGlobalSkillsDir, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
} from "../helpers/test-utils.js";
import path from "path";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";
import "../matchers/setup.js";

/**
 * `edit --from` plugin operations over a Codex installation, driven by the pinned `@openai/codex`,
 * so no `skipIf`. Codex installs plugins only at global scope, so configurations are applied at
 * home; the ejected skill keeps each configuration non-empty.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const globalSkill = (install: SeedSkill["install"]): SeedSkill =>
  buildSeedSkill({ install, scope: "global", assignments: { [WEB_DEV]: "lazy" } });

const configurationOf = (skills: SeedPayload["skills"]): SeedPayload =>
  buildSeedPayload({ skills, agents: { [WEB_DEV]: { scope: "global" } } });

describe("edit --from over a Codex installation", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    expect(
      await isCodexCLIAvailable(),
      "the pinned @openai/codex binary did not run — this lane never skips, so this is a failure",
    ).toBe(true);
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

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

  async function codexInstallWithAPluginSkill(
    id: string,
    reactInstall: "plugin" | "eject" = "plugin",
  ): Promise<{ installed: TestEnvironment; ref: string }> {
    const installed = await createTestEnvironment({ permissions: false });
    env = installed;
    store.publish(
      id,
      configurationOf({
        [E2E_SKILL.react.id]: globalSkill(reactInstall),
        [E2E_SKILL.vitest.id]: globalSkill("eject"),
      }),
    );

    const { exitCode, output } = await runInitFromOnCodex(
      store,
      id,
      { dir: installed.projectDir, globalHome: installed.fakeHome },
      fixture.sourceDir,
    );
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

    return {
      installed,
      ref: pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName),
    };
  }

  async function pluginsCodexReports(target: TestEnvironment): Promise<string> {
    const listed = await runCodex(target.fakeHome, ["plugin", "list"], target.projectDir);
    expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
    return JSON.stringify(listed.json);
  }

  async function applyAtHome(
    installed: TestEnvironment,
    id: string,
    configuration: SeedPayload,
  ): Promise<{ exitCode: number; output: string }> {
    store.publish(id, configuration);
    prompt = new InteractivePrompt(["edit", "--from", id], installed.fakeHome, {
      ...TERMINAL_SIZE.TALL,
      env: { AGENTS_INC_API_URL: store.url, HOME: installed.fakeHome },
    });
    // A run that changes nothing ends without asking, so there is nothing to approve.
    await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    if (prompt.getOutput().includes(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM)) await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, output: prompt.getRawOutput() };
  }

  it(
    "removes a plugin skill the configuration leaves out, and Codex no longer lists the plugin",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit1");

      // Subject guard: the plugin is registered with Codex before the apply.
      expect(await pluginsCodexReports(installed)).toContain(ref);

      const result = await applyAtHome(
        installed,
        "CdxDrop1",
        configurationOf({ [E2E_SKILL.vitest.id]: globalSkill("eject") }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        await pluginsCodexReports(installed),
        "the apply dropped the skill from the config and left its plugin registered with Codex",
      ).not.toContain(ref);
    },
  );

  it(
    "installs a skill the configuration adds, and Codex lists its plugin",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed } = await codexInstallWithAPluginSkill("CdxEdit3");
      const added = pluginKeyFor(E2E_SKILL.zustand.id, fixture.marketplaceName);
      expect(await pluginsCodexReports(installed)).not.toContain(added);

      const result = await applyAtHome(
        installed,
        "CdxAdd01",
        configurationOf({
          [E2E_SKILL.react.id]: globalSkill("plugin"),
          [E2E_SKILL.vitest.id]: globalSkill("eject"),
          [E2E_SKILL.zustand.id]: globalSkill("plugin"),
        }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        await pluginsCodexReports(installed),
        "the apply added the skill to the config and never registered its plugin with Codex",
      ).toContain(added);
    },
  );

  /** The mode is read off Codex and the disk, never the narration. */
  it(
    "switches an ejected skill to a plugin Codex lists, and removes the ejected copy",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit4", "eject");
      const ejectedCopy = path.join(codexGlobalSkillsDir(installed.fakeHome), E2E_SKILL.react.id);
      expect(await directoryExists(ejectedCopy), "the install ejected nothing to switch").toBe(
        true,
      );
      expect(await pluginsCodexReports(installed)).not.toContain(ref);

      const result = await applyAtHome(
        installed,
        "CdxToPl1",
        configurationOf({
          [E2E_SKILL.react.id]: globalSkill("plugin"),
          [E2E_SKILL.vitest.id]: globalSkill("eject"),
        }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(await pluginsCodexReports(installed)).toContain(ref);
      expect(
        await directoryExists(ejectedCopy),
        "the ejected copy outlived the switch, so Codex now reads the skill twice",
      ).toBe(false);
    },
  );

  it(
    "switches a plugin skill to an ejected copy under CODEX_HOME, and removes the plugin",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit5", "plugin");
      const ejectedCopy = path.join(codexGlobalSkillsDir(installed.fakeHome), E2E_SKILL.react.id);
      expect(await pluginsCodexReports(installed)).toContain(ref);

      const result = await applyAtHome(
        installed,
        "CdxToEj1",
        configurationOf({
          [E2E_SKILL.react.id]: globalSkill("eject"),
          [E2E_SKILL.vitest.id]: globalSkill("eject"),
        }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(await directoryExists(ejectedCopy)).toBe(true);
      expect(
        await pluginsCodexReports(installed),
        "the plugin outlived the switch, so Codex reads the skill twice",
      ).not.toContain(ref);
    },
  );

  it(
    "deletes the copy of an ejected skill the configuration leaves out",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed } = await codexInstallWithAPluginSkill("CdxEdit6");
      const ejectedCopy = path.join(codexGlobalSkillsDir(installed.fakeHome), E2E_SKILL.vitest.id);
      expect(await directoryExists(ejectedCopy), "the install ejected nothing to remove").toBe(
        true,
      );

      const result = await applyAtHome(
        installed,
        "CdxDrop2",
        configurationOf({ [E2E_SKILL.react.id]: globalSkill("plugin") }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        await directoryExists(ejectedCopy),
        "the removed skill's copy is still where Codex reads skills from",
      ).toBe(false);
    },
  );

  // Control: re-applying as-is removes nothing.
  it(
    "leaves the plugin registered when the configuration changes nothing",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit2");

      const result = await applyAtHome(
        installed,
        "CdxSame1",
        configurationOf({
          [E2E_SKILL.react.id]: globalSkill("plugin"),
          [E2E_SKILL.vitest.id]: globalSkill("eject"),
        }),
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(await pluginsCodexReports(installed)).toContain(ref);
    },
  );
});
