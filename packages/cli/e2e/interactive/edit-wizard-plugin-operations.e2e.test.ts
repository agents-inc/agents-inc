import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  configTsPath,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the edit wizard in plugin mode — skill install/uninstall
 * and cancellation.
 *
 * Test scenarios:
 *   P-EDIT-1: Add skill via edit triggers plugin install
 *   P-EDIT-2: Remove skill via edit triggers plugin uninstall
 *   + No-change completion
 *   + Cancellation safety
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit wizard — plugin mode operations", () => {
  let fixture: E2EPluginSource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("remove skill triggers plugin uninstall", () => {
    /**
     * **Renamed and re-aimed on 2026-09-22 by D11(b), and the old assertion is recorded here
     * rather than overwritten.** It read `expect(rawOutput).toContain("Removed")` beside
     * `toContain("plugin")`, and the fixture's own comment says why that could never have been an
     * observation: `web-styling-tailwind` is claimed by the config and installed NOWHERE —
     * `pluginProject` writes a config row and a settings switch and runs no `claude plugin
     * install` at all. So the line it pinned was the command counting what it had ASKED for, which
     * is the defect D11(b) retires: `uninstallPluginSkills` now reports only what the host
     * answered `removed` for, and the host answers `absent` here.
     *
     * The paired case — a removal that really happened, reported — is
     * `lib/operations/skills/uninstall-plugin-skills.test.ts`'s `absent`/`removed` pair over the
     * same function, and `lifecycle/codex-uninstall-reports-what-it-observed.e2e.test.ts` end to
     * end against a plugin the run really registered. Neither can live here: nothing in this
     * file's fixture ever registers one.
     */
    it(
      "removes a plugin skill from the config without claiming a removal it never observed",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        // web-styling-tailwind is claimed by the config and installed nowhere — the
        // wizard cannot resolve it, so removing it is what this run has to uninstall.
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(
          rawOutput,
          "the host answered `absent`, so a line counting a removal is a claim about intent",
        ).not.toContain("Removed");

        // Config should only contain the surviving skill
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
        });

        // The removed skill must NOT appear in compiled agent content
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          notContains: ["web-styling-tailwind"],
        });
      },
    );

    it(
      "should update config after removing a plugin skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
          compiledAgents: [],
        });
      },
    );

    it(
      "should recompile agents after removing a plugin skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );
  });

  describe("add skill triggers plugin install", () => {
    it(
      "should install added plugin skills when navigating to a new skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
          ...TERMINAL_SIZE.TALL,
        });

        // Arrow down to next skill and select it
        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain("Installed");
        expect(rawOutput).toContain("plugin");

        // Config should include both the original and the newly added skill
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
          origin: fixture.marketplaceName,
        });

        // Agents should be recompiled after adding a skill
        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });

  describe("plugin mode completion without skill changes", () => {
    /**
     * **Named for installs alone since 2026-09-26, and the dropped assertion is recorded here.** It
     * also read `expect(rawOutput).not.toContain("Removed")`, which could not fail: this fixture
     * switches its plugin on in settings.json and never installs it, so the host answers `absent`
     * and `Removed <n> plugin(s)` cannot print. Measured on Claude Code 2.1.283, a bundle whose
     * unchanged edit uninstalled every skill left this case green, while one that installed every
     * skill turned it red on the install negative. A removal half needs a plugin the run installed.
     */
    it(
      "completes an unchanged edit without installing a plugin",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).not.toContain("Installed");

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
        });
        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });

  /**
   * **Until 2026-09-26 this could not fail, twice over.** It aborted with nothing pending, so no
   * cancellation, working or broken, had a plugin to install; and it negated `Installing plugin:`
   * and `Uninstalling plugin:`, which the CLI never prints. It now makes the same selection "add
   * skill triggers plugin install" completes — the case in this file where the install happens —
   * and aborts instead, so the install negative names the banner that completion prints.
   *
   * It says nothing about uninstalling, because nothing it does could uninstall: the one pending
   * change is an ADD, so even a cancellation that committed would reach `applyPluginChanges` with
   * no removal to make, and nothing in this fixture installs a plugin the host could report
   * removed (see the note on the removal case above). A removal half needs a fixture that
   * installs one first.
   */
  describe("cancellation in plugin mode", () => {
    it("installs nothing and records nothing when an edit with a pending plugin skill is cancelled", async () => {
      // The install case's own fixture, so its keys below reach the skill that case installs.
      const project = await ProjectBuilder.pluginProject({
        skills: [E2E_SKILL.react.id],
        marketplaceName: fixture.marketplaceName,
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      // Read once the wizard is up, not before `launch`: `launch` records the fixture's source
      // into this very file (`recordInstallSource`) before it spawns the CLI, so a copy taken
      // earlier differs from a config the cancelled run never touched.
      const configBefore = await readTestFile(configTsPath(project.dir));

      // A pending ADD, by the keys the install case above completes: without one there is nothing
      // a cancellation could fail to hold back.
      await wizard.build.navigateDown();
      await wizard.build.toggleFocusedSkill();

      // abortAndDestroy pins the exit code to CANCELLED itself; this test's own
      // subject is that no plugin operation ran, which the assertions below carry.
      await wizard.abortAndDestroy(TIMEOUTS.EXIT);

      const rawOutput = wizard.getRawOutput();
      expect(rawOutput).not.toContain(STEP_TEXT.INSTALLING_PLUGINS);
      expect(
        await readTestFile(configTsPath(project.dir)),
        "a cancelled edit must not record the pending skill in config.ts",
      ).toBe(configBefore);
    });
  });
});
