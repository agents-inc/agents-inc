import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * E2E tests for the edit wizard — mode migration between local and plugin.
 *
 * Test scenarios:
 *   P-EDIT-3: Mode migration local -> plugin
 *   P-EDIT-4: Mode migration plugin -> local
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit wizard — plugin mode migration", () => {
  let fixture: E2EPluginSource;
  let wizard: EditWizard | undefined;
  /**
   * A global HOME the TEST owns, for the one flow that spans two wizards. A home a wizard
   * allocated for itself is removed by its own `destroy()`, so handing the first wizard's
   * home to the second hands it a directory that is on its way out.
   */
  let sharedHome: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (sharedHome) {
      await cleanupTempDir(sharedHome);
      sharedHome = undefined;
    }
  });

  describe("mode migration local -> plugin", () => {
    it(
      "should switch skills from local to plugin mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.localProjectWithMarketplace({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });

        wizard = await EditWizard.launchInProject({
          projectDir: project.dir,
          source: fixture,
        });

        // Build -> Sources (customize view)
        const sources = await wizard.build.advanceToSources();

        // Press "p" hotkey to set ALL skills to plugin mode
        await sources.setAllPlugin();

        // Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        // The whole composed narration line, count included: the bare verb
        // cannot tell a switch TO plugin from the switch BACK that the sibling
        // block drives, and the count is what tells a per-skill switch from a
        // bulk one.
        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );
        expect(rawOutput).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
        });

        // The config and the install are written by different code, and the orphan-entry
        // class is exactly the case where the first happened and the second did not — this
        // spec certified that state for as long as the install failed on every run.
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect(result.project).toHavePlugin(reactPluginRef);
        // The Claude CLI keeps its own bookkeeping under HOME whatever scope it enabled
        // the plugin at, so the registry half is asserted against the wizard's global home.
        await expect({ dir: wizard.globalHome }).toHavePluginInRegistry(reactPluginRef);

        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );

    /**
     * The DEPARTURE half, and the only place in this suite it can be asserted.
     *
     * `toHavePlugin` reads `.claude/settings.json`, and only a real `claude plugin
     * install` puts a key there that a later `claude plugin uninstall` will take back out
     * — measured against Claude Code 2.1.239, hand-written state (settings.json alone, or
     * settings.json plus an `installed_plugins.json` record at either scope) is answered
     * with `not found in installed plugins`, which `claudePluginUninstall` swallows by
     * design. So this test installs for real in phase one and switches back in phase two,
     * with ONE global home across both: the Claude CLI keeps its bookkeeping there, and a
     * second wizard on a fresh home would leave the uninstall looking for a plugin nobody
     * installed. The home is allocated by the test rather than by the first wizard,
     * because a wizard that allocates its own removes it in `destroy()`.
     */
    it(
      "should drop the plugin registration when a real install is switched back to eject",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await ProjectBuilder.localProjectWithMarketplace({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });
        const source = { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir };
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;

        const globalHome = await createTempDir();
        sharedHome = globalHome;
        wizard = await EditWizard.launchInProject({
          projectDir: project.dir,
          source,
          globalHome,
          ...TERMINAL_SIZE.TALL,
        });

        const toPlugin = await wizard.build.advanceToSources();
        await toPlugin.setAllPlugin();
        const installed = await (await (await toPlugin.advance()).acceptDefaults("edit")).confirm();
        expect(await installed.exitCode).toBe(EXIT_CODES.SUCCESS);

        // The subject guard. Without it the negative below passes for a phase one that
        // never installed anything, which is the whole failure mode this test exists for.
        await expect(installed.project).toHavePlugin(reactPluginRef);
        await expect({ dir: globalHome }).toHavePluginInRegistry(reactPluginRef);

        await wizard.destroy();
        wizard = await EditWizard.launchInProject({
          projectDir: project.dir,
          source,
          globalHome,
          ...TERMINAL_SIZE.TALL,
        });

        const toEject = await wizard.build.advanceToSources();
        await toEject.setAllLocal();
        const ejected = await (await (await toEject.advance()).acceptDefaults("edit")).confirm();
        expect(await ejected.exitCode).toBe(EXIT_CODES.SUCCESS);

        await expect(ejected.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: "eject",
        });
        await expect(ejected.project).toHaveSkillCopied(E2E_SKILL.react.id);

        // The claim no spec could make before: the config says eject AND the external
        // effect followed it. A migration that rewrote the config and left the plugin
        // installed leaves the skill installed twice, and every other assertion here is
        // green in that state. The guard after phase one is what makes this non-vacuous —
        // the matcher also fails an ABSENT registry, so without it a phase one that never
        // installed would satisfy the negation for free.
        await expect({ dir: globalHome }).not.toHavePluginInRegistry(reactPluginRef);

        // KNOWN GAP: the project's `enabledPlugins` still names the plugin here, so the
        // settings.json half of the departure cannot be asserted. It is the Claude CLI's
        // write, not ours: measured on Claude Code 2.1.239, `claude plugin uninstall <key>
        // --scope project` removes `installed_plugins.json` and leaves
        // `.claude/settings.json` byte-identical, so a switched skill is left enabled
        // against a plugin that is no longer installed. Owner ruling owed on whether the
        // migration should clear the key itself; until then this line would pin the defect
        // rather than the contract:
        //   await expect(ejected.project).not.toHavePlugin(reactPluginRef);
      },
    );
  });

  describe("mode migration plugin -> eject", () => {
    it(
      "should switch skills from plugin to eject mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });

        // The fixture's own contract, asserted before the wizard touches anything:
        // `pluginProject` claims plugin origin in config.ts, so the one file the product
        // and `toHavePlugin` both read has to agree with it. It did not until the fixture
        // was widened, and every spec built on it therefore checked the install direction
        // and could not check the uninstall one.
        //
        // It still cannot check the uninstall one HERE, and the reason is the Claude CLI's
        // rather than the product's: hand-written plugin state is not uninstallable.
        // Measured against Claude Code 2.1.239 — `claude plugin uninstall <key> --scope
        // project` answers `not found in installed plugins` and leaves settings.json
        // byte-identical, with the key present in `installed_plugins.json` at user scope,
        // at project scope, and absent. `claudePluginUninstall` swallows exactly that
        // wording by design, so the migration completes and the key stays. The departure
        // is asserted in the round-trip test below, which has a REAL install to remove.
        const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect(project).toHavePlugin(reactPluginRef);

        wizard = await EditWizard.launchInProject({
          projectDir: project.dir,
          source: fixture,
        });

        // Build -> Sources (customize view)
        const sources = await wizard.build.advanceToSources();

        // Press "l" hotkey to set ALL skills to eject mode
        await sources.setAllLocal();

        // Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
        );
        expect(rawOutput).not.toContain(STEP_TEXT.PLUGIN_NATIVE);

        // The switch line announces INTENT. The plugin direction then narrates
        // each install and a count; this direction really copies files and says
        // nothing about them, so the run's only account of what it did to disk is
        // the config it wrote afterwards. Reported in the command's own words for
        // an eject copy, and with no destination path: the migration splits its
        // copies between the project and $HOME by each skill's own scope, so a
        // single directory would misname the global half.
        expect(rawOutput).toContain(
          `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX}`,
        );

        await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: "eject",
        });

        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
