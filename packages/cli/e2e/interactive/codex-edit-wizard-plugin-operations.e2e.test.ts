import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { isCodexCLIAvailable, runCodex } from "../fixtures/codex.js";
import { codexGlobalSkillsDir, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
} from "../helpers/test-utils.js";
import path from "path";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * The edit wizard's plugin operations, over a CODEX installation.
 *
 * **Why this file exists (CLI-894).** Every edit-wizard plugin spec carries
 * `describe.skipIf(!claudeAvailable)` and drives a Claude installation, so on a machine with no
 * `claude` — CI's runner — none of them runs, and on any machine none of them ever reached Codex.
 * Owner, 2026-09-26: _"otherwise we dont test this at all for codex"_. This lane drives the pinned
 * `@openai/codex` package, which is present wherever `bun install` ran, so it carries no `skipIf`.
 *
 * **What Codex adds that the Claude specs cannot show.** The Claude plugin specs build their
 * project with `ProjectBuilder.pluginProject`, which writes a config row and a settings switch and
 * installs nothing — so a removal there can only be asserted as NOT claimed. Here `init --from`
 * really registers the plugin with Codex, so the wizard's removal is observed in Codex's own
 * `plugin list`: the plugin is there before and gone after.
 *
 * Codex offers plugin installs at GLOBAL scope only (`codex-offered-placements.e2e.test.ts`), so the
 * plugin skill here is global. The ejected skill beside it keeps the configuration non-empty once
 * the plugin skill is gone, so the run is an edit rather than an emptying.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("the edit wizard over a Codex installation", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let wizard: EditWizard | undefined;

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
    await wizard?.destroy();
    wizard = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** A Codex install holding one plugin skill (global) and one ejected skill, and the plugin's ref. */
  async function codexInstallWithAPluginSkill(
    id: string,
    reactInstall: "plugin" | "eject" = "plugin",
  ): Promise<{ installed: TestEnvironment; ref: string }> {
    const installed = await createTestEnvironment({ permissions: false });
    env = installed;
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: reactInstall,
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
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
      ref: buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName),
    };
  }

  /** What the pinned binary says is installed in this HOME, as one JSON string to search. */
  async function pluginsCodexReports(target: TestEnvironment): Promise<string> {
    const listed = await runCodex(target.fakeHome, ["plugin", "list"], target.projectDir);
    expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
    return JSON.stringify(listed.json);
  }

  it(
    "removes a plugin skill deselected in the wizard, and Codex no longer lists the plugin",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit1");

      // Subject guard: the plugin really is registered with Codex before the wizard runs.
      expect(await pluginsCodexReports(installed)).toContain(ref);

      // At the GLOBAL installation, where the plugin skill lives: from a project, a global skill is
      // shown locked (`G`) and a toggle on it is refused, which is the product working.
      wizard = await EditWizard.launchInGlobal({
        projectDir: installed.fakeHome,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.selectSkill(E2E_SKILL.react.display);
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(
        await pluginsCodexReports(installed),
        "the wizard dropped the skill from the config and left its plugin registered with Codex",
      ).not.toContain(ref);
    },
  );

  it(
    "installs a skill selected in the wizard, and Codex lists its plugin",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed } = await codexInstallWithAPluginSkill("CdxEdit3");
      const added = buildMarketplacePluginRef(E2E_SKILL.zustand.id, fixture.marketplaceName);
      expect(await pluginsCodexReports(installed)).not.toContain(added);

      wizard = await EditWizard.launchInGlobal({
        projectDir: installed.fakeHome,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.selectSkill(E2E_SKILL.zustand.display);
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(
        await pluginsCodexReports(installed),
        "the wizard added the skill to the config and never registered its plugin with Codex",
      ).toContain(added);
    },
  );

  /**
   * Switching every skill's install mode in the wizard, in both directions — the Codex half of the
   * `install-mode-*` specs. The mode a skill is in is read off Codex and off the disk, never off the
   * narration: a plugin is one Codex lists, and an ejected skill is a directory under
   * `$CODEX_HOME/skills`.
   */
  // Pinned `it.fails` until 2026-09-26 (CLI-895): the plugin was registered and the ejected copy
  // under `$CODEX_HOME/skills` left behind, because `deleteLocalSkill` only knew Claude's
  // `.claude/skills` — so Codex read the skill twice. The Claude half is `install-mode-bulk`.
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

      const result = await switchEveryInstallMode(installed, "plugin");

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
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

      const result = await switchEveryInstallMode(installed, "eject");

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(await directoryExists(ejectedCopy)).toBe(true);
      expect(
        await pluginsCodexReports(installed),
        "the plugin outlived the switch, so Codex reads the skill twice",
      ).not.toContain(ref);
    },
  );

  // Pinned `it.fails` until 2026-09-26 for the same cause (CLI-895): a deselected ejected skill left
  // its copy under `$CODEX_HOME/skills`.
  it(
    "deletes the copy of an ejected skill deselected in the wizard",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed } = await codexInstallWithAPluginSkill("CdxEdit6");
      const ejectedCopy = path.join(codexGlobalSkillsDir(installed.fakeHome), E2E_SKILL.vitest.id);
      expect(await directoryExists(ejectedCopy), "the install ejected nothing to remove").toBe(
        true,
      );

      wizard = await EditWizard.launchInGlobal({
        projectDir: installed.fakeHome,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(
        await directoryExists(ejectedCopy),
        "the deselected skill's copy is still where Codex reads skills from",
      ).toBe(false);
    },
  );

  /** The global installation through the wizard, with every skill set to one install mode. */
  async function switchEveryInstallMode(installed: TestEnvironment, to: "plugin" | "eject") {
    wizard = await EditWizard.launchInGlobal({
      projectDir: installed.fakeHome,
      source: fixture,
      ...TERMINAL_SIZE.TALL,
    });
    // Generic, not `passThroughAllDomains`: that one presses Enter a fixed three times for the
    // three domains an init wizard selects, and this configuration names one.
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    if (to === "plugin") await sources.setAllPlugin();
    else await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    return confirm.confirm();
  }

  // The control: the same install through the same wizard, with nothing deselected. A wizard that
  // removed every plugin it passed through would satisfy the case above.
  it(
    "leaves the plugin registered when the wizard changes nothing",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { installed, ref } = await codexInstallWithAPluginSkill("CdxEdit2");

      // At the GLOBAL installation, where the plugin skill lives: from a project, a global skill is
      // shown locked (`G`) and a toggle on it is refused, which is the product working.
      wizard = await EditWizard.launchInGlobal({
        projectDir: installed.fakeHome,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(await pluginsCodexReports(installed)).toContain(ref);
    },
  );
});
