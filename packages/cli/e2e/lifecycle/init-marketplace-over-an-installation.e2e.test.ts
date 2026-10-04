import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import {
  createTestEnvironment,
  finishWizard,
  initGlobalWithEject,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, E2E_SOURCE, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  flattenCliOutput,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_NAME,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import type { DashboardSession } from "../pages/dashboard-session.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * `init --marketplace <Y>` where an installation already serves the directory takes the route a
 * bare `init` takes there — and the marketplace it names is the one the run uses.
 *
 * The journey is two marketplaces across scopes: a global installation made from X, then
 * `init --marketplace Y` from a project with no installation of its own. A bare `init` there
 * opens the global installation's dashboard, whose Edit sets the project up; naming Y changes
 * only where that setup reads its catalogue from and what the project's `config.ts` records. The
 * global installation stays on X, untouched. Until this ruling the flag was dropped: the
 * dashboard's Edit loaded X's catalogue and wrote X into the project's `config.ts`.
 *
 * Where the folder has an installation of its OWN, the marketplace it was installed from is fixed,
 * so naming a different one is refused with exit 2 and the stored one named; naming the same one is
 * a bare `init`. Each refusal here is paired in this file with the run it must still allow — the
 * same flag under a global installation, and the stored marketplace named back — so a guard grown
 * to swallow either reddens rather than reading as covered.
 *
 * X is the fixture without its spare skill and Y is the full shared fixture, so Y's catalogue is
 * the only one offering the spare: the build grid can say which catalogue the setup read without a
 * pick being made. Nothing is picked, because a fresh pick in a project defaults to global scope
 * and the global installation is the half that must not move.
 *
 * Observed red against the unfixed build: the dashboard's Edit wrote X into the project's
 * `config.ts` and offered no spare, and the own-installation case printed the dashboard and exited
 * 0. The two controls are green there and must stay green.
 */

/** Ships only in Y, so the grid offering it is the proof the setup read Y. */
const ONLY_IN_Y = E2E_SKILL["visual-regression"];

/** Offered by both, so the frame the absence is read from is a painted grid. */
const IN_BOTH = E2E_SKILL.react;

/** The marketplace named on the command line in every case. */
const NAMED = E2E_SOURCE;

describe("init --marketplace where an installation already serves the directory", () => {
  let installedFrom: E2ESource;
  let environment: TestEnvironment | undefined;
  let dashboard: DashboardSession | undefined;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    installedFrom = await createE2ESource({ withoutSkills: [ONLY_IN_Y.id] });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(installedFrom);
  });

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
    await wizard?.destroy();
    wizard = undefined;
    if (environment) {
      await cleanupTempDir(environment.tempDir);
      environment = undefined;
    }
  });

  /** A global installation from X, made by the wizard, under a project holding nothing. */
  async function underAGlobalInstallation(): Promise<TestEnvironment> {
    const made = await createTestEnvironment();
    environment = made;
    const globalInstall = await initGlobalWithEject(installedFrom, made.fakeHome);
    expect(globalInstall.exitCode, `the global install failed: ${globalInstall.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    return made;
  }

  /** A project installation of its own from X, made by the wizard. */
  async function withItsOwnInstallation(): Promise<TestEnvironment> {
    const made = await createTestEnvironment();
    environment = made;
    wizard = await InitWizard.launch({
      projectDir: made.projectDir,
      source: installedFrom,
      env: { HOME: made.fakeHome },
    });
    const projectInstall = await finishWizard(await completeWithLocalSources(wizard));
    wizard = undefined;
    expect(projectInstall.exitCode, `the project install failed: ${projectInstall.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    return made;
  }

  it(
    "sets the project up from the named marketplace through the dashboard's Edit, leaving the global installation on its own",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await underAGlobalInstallation();
      const globalBefore = await loadConfigOrFail(fakeHome);
      const globalSkillsBefore = await listFiles(skillsPath(fakeHome));
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      expect(globalBefore.marketplace, "the global installation was made from X").toBe(
        installedFrom.sourceDir,
      );

      // `init --marketplace <NAMED>` in the project, in a real terminal.
      dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: NAMED,
        env: { HOME: fakeHome },
      });
      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      const build = await dashboard.selectEdit();
      // Read now and asserted at the end, so the file's headline assertion — what config.ts
      // records — is the one a red run reports first.
      const grid = build.getScreen();

      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      await confirm.waitForReady();
      const panel = confirm.getScreen();
      const setup = await finishWizard(await confirm.confirm());
      expect(setup.exitCode, `the project setup failed: ${setup.output}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfig = await loadConfigOrFail(projectDir);
      expect(
        projectConfig.marketplace,
        "the project is set up from the marketplace the command named, so its config.ts records that one",
      ).toBe(NAMED.sourceDir);

      const globalAfter = await loadConfigOrFail(fakeHome);
      expect(globalAfter.marketplace, "the global installation stays on its own marketplace").toBe(
        installedFrom.sourceDir,
      );
      expect(globalAfter.skills, "and its skills are untouched").toStrictEqual(globalBefore.skills);
      expect(globalAfter.agents, "and its sub-agents").toStrictEqual(globalBefore.agents);
      expect(globalAfter.stack, "and what each sub-agent is given").toStrictEqual(
        globalBefore.stack,
      );
      expect(await listFiles(skillsPath(fakeHome))).toStrictEqual(globalSkillsBefore);
      expect(await readCompiledAgents(fakeHome)).toStrictEqual(globalAgentsBefore);

      expect(grid, "the grid the absence below is read from was painted").toContain(
        IN_BOTH.display,
      );
      expect(
        grid,
        "new picks come from the named marketplace's catalogue, the only one shipping this skill",
      ).toContain(ONLY_IN_Y.display);
      expect(
        panel,
        "the confirm panel names the marketplace the project is set up from, not the global install's ejected skills",
      ).toContain(`${STEP_TEXT.PANEL_MARKETPLACE} ${E2E_MARKETPLACE_NAME}`);
    },
  );

  it(
    "takes the route a bare init takes under a global installation where no terminal can show the dashboard",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await underAGlobalInstallation();
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(
        ["init", "--marketplace", NAMED.sourceDir],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        run.output,
        "a marketplace named beside a global installation is not refused — the folder has no installation of its own",
      ).toContain(STEP_TEXT.DASHBOARD);
      // One snapshot for both scopes: the project is nested inside the fake HOME.
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it(
    "refuses a different marketplace where the folder has its own installation, naming the one it was installed from",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await withItsOwnInstallation();
      const before = await readTreeSnapshot(fakeHome);

      const refused = await CLI.run(
        ["init", "--marketplace", NAMED.sourceDir],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      // Carries the red against the unfixed build: it printed this installation's dashboard and
      // exited 0, as if the marketplace named had been accepted.
      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.INVALID_ARGS);
      expect(
        refused.output,
        "the installation's dashboard must not stand in for the refusal",
      ).not.toContain(STEP_TEXT.DASHBOARD);
      // oclif hard-wraps error text at the terminal width, which can split a path mid-word, so
      // the path is compared with whitespace taken out of the output. No path here holds a space.
      expect(
        flattenCliOutput(refused.output).replace(/ /g, ""),
        "the refusal names the marketplace this installation was made from, which is fixed",
      ).toContain(installedFrom.sourceDir);
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it(
    "takes the route a bare init takes where the folder's own installation came from the marketplace named",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await withItsOwnInstallation();
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(
        ["init", "--marketplace", installedFrom.sourceDir],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.output, "naming the stored marketplace is a bare init").toContain(
        STEP_TEXT.DASHBOARD,
      );
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  /**
   * A folder on disk is one marketplace however its path is spelled, so the stored one named back
   * relatively, or with a trailing slash, is still the stored one.
   */
  it.each([
    [
      "relative to the project",
      (projectDir: string) => path.relative(projectDir, installedFrom.sourceDir),
    ],
    ["with a trailing slash", () => `${installedFrom.sourceDir}/`],
  ])(
    "takes the route a bare init takes where the marketplace named is the folder's own, spelled %s",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (_spelling, spell) => {
      const { fakeHome, projectDir } = await withItsOwnInstallation();
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(
        ["init", "--marketplace", spell(projectDir)],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.output, "the stored marketplace, spelled another way, is a bare init").toContain(
        STEP_TEXT.DASHBOARD,
      );
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );
});

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The marketplace the global installation is made from, and the one `init --marketplace` names in
 * the project. Inside {@link E2E_MARKETPLACE_PREFIX} for the reason the `new-marketplace` spec gives.
 */
const GLOBAL_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}acme`;
const PROJECT_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}plain`;

/** The global installation's one skill: the first scaffold's, in its marketplace's namespace. */
const GLOBAL_SKILL = `${GLOBAL_MARKETPLACE}-example-skill`;

/**
 * The same journey between two marketplaces that share no skill, under a global installation of
 * plugins.
 *
 * Above, X ships nothing Y does not and the global installation is ejected, so every global skill
 * is in the catalogue the setup loads — Y carries it, or its copy under `~/.claude/skills` is
 * merged in. Neither holds here: each marketplace ships only its own skill, and a plugin leaves no
 * copy of the catalogue's metadata on disk, only its SKILL.md in Claude's plugin cache. Both are
 * made by the CLI's own scaffolder and build steps, as an author makes one, and the global one is
 * installed as plugins through the wizard.
 *
 * The global installation stays on X, shown locked: its skill is not reported as missing, is not
 * listed as removed, and its compiled sub-agent keeps the usage sentence X's catalogue states.
 * Nothing is picked in the project, for the reason the first test above gives.
 *
 * Observed red against the unfixed build: the setup said the global skill "is not present in the
 * loaded source", listed it as a global removal "not present in" Y, and rewrote the global
 * `web-developer.md` with the placeholder usage sentence — while the global config still held it.
 */
describe.skipIf(!claudeAvailable)(
  "init --marketplace beside a global plugin installation from a marketplace sharing no skill",
  () => {
    let marketplacesDir: string;
    let globalMarketplace: E2ESource;
    let projectMarketplace: E2ESource;
    let environment: TestEnvironment | undefined;
    let wizard: InitWizard | undefined;
    let dashboard: DashboardSession | undefined;

    beforeAll(async () => {
      marketplacesDir = await createTempDir();
      for (const name of [GLOBAL_MARKETPLACE, PROJECT_MARKETPLACE]) {
        const scaffold = await CLI.run(["new", "marketplace", name], { dir: marketplacesDir });
        expect(scaffold.exitCode, scaffold.output).toBe(EXIT_CODES.SUCCESS);
        const marketplaceDir = { dir: path.join(marketplacesDir, name) };
        const plugins = await CLI.run(["build", "plugins"], marketplaceDir);
        expect(plugins.exitCode, plugins.output).toBe(EXIT_CODES.SUCCESS);
        const manifest = await CLI.run(["build", "marketplace"], marketplaceDir);
        expect(manifest.exitCode, manifest.output).toBe(EXIT_CODES.SUCCESS);
      }
      globalMarketplace = {
        sourceDir: path.join(marketplacesDir, GLOBAL_MARKETPLACE),
        tempDir: marketplacesDir,
      };
      projectMarketplace = {
        sourceDir: path.join(marketplacesDir, PROJECT_MARKETPLACE),
        tempDir: marketplacesDir,
      };
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(marketplacesDir);
    });

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
      await dashboard?.destroy();
      dashboard = undefined;
      if (environment) {
        await cleanupTempDir(environment.tempDir);
        environment = undefined;
      }
    });

    it(
      "keeps the global installation's plugin skill locked and its sub-agent as compiled",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const made = await createTestEnvironment();
        environment = made;
        const { fakeHome, projectDir } = made;

        // The global installation: X's starter stack, committed as plugins row by row.
        wizard = await InitWizard.launch({
          source: globalMarketplace,
          projectDir: fakeHome,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });
        const domains = await wizard.stack.selectFirstStack();
        const grid = await domains.advanceTo(STEP_TEXT.BUILD_FOOTER);
        const installSources = await grid.passThroughAllDomainsGeneric();
        await installSources.waitForReady();
        await installSources.commitPluginOnEveryRow();
        const installAgents = await installSources.advance();
        const install = await finishWizard(
          await (await installAgents.acceptDefaults("init")).confirm(),
        );
        wizard = undefined;
        expect(install.exitCode, `the global install failed: ${install.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );

        const pluginKey = buildMarketplacePluginRef(GLOBAL_SKILL, GLOBAL_MARKETPLACE);
        const globalBefore = await loadConfigOrFail(fakeHome);
        const globalAgentsBefore = await readCompiledAgents(fakeHome);
        expect(
          globalBefore.skills,
          "the global installation holds X's skill, installed as X's plugin",
        ).toStrictEqual([{ id: GLOBAL_SKILL, scope: "global", origin: GLOBAL_MARKETPLACE }]);
        await expect({ dir: fakeHome }).toHavePluginInRegistry(pluginKey, "user");

        // `init --marketplace <Y>` in the project, through the dashboard's Edit.
        dashboard = await InitWizard.launchForDashboard({
          projectDir,
          source: projectMarketplace,
          env: { HOME: fakeHome },
        });
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
        const build = await dashboard.selectEdit(STEP_TEXT.BUILD_FOOTER);
        const setupGrid = build.getScreen();
        const sources = await build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        await confirm.waitForReady();
        const panel = confirm.getScreen();
        const setup = await finishWizard(await confirm.confirm());
        expect(setup.exitCode, `the project setup failed: ${setup.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        expect(
          panel,
          "the confirm panel names the marketplace the project is set up from",
        ).toContain(`${STEP_TEXT.PANEL_MARKETPLACE} ${PROJECT_MARKETPLACE}`);
        expect(
          panel,
          "not the marketplace the global installation above it was made from",
        ).not.toContain(`${STEP_TEXT.PANEL_MARKETPLACE} ${GLOBAL_MARKETPLACE}`);

        expect(
          await readCompiledAgents(fakeHome),
          "the global sub-agent keeps the usage sentence X's catalogue states for its skill",
        ).toStrictEqual(globalAgentsBefore);
        expect(
          setupGrid,
          "the global skill is carried into the setup rather than reported missing from it",
        ).not.toContain(STEP_TEXT.INSTALLED_SKILL_ABSENT_FROM_SOURCE);
        expect(setupGrid, "the frame that absence is read from is the setup's grid").toContain(
          STEP_TEXT.BUILD_FOOTER,
        );
        expect(setup.output, "nothing global is listed as removed").not.toContain(
          STEP_TEXT.REMOVED_REASON_NOT_IN_SOURCE,
        );
        expect(setup.output, "nothing changed, since nothing was picked").toContain(
          STEP_TEXT.EDIT_UNCHANGED,
        );

        const globalAfter = await loadConfigOrFail(fakeHome);
        expect(globalAfter.marketplace, "the global installation stays on X").toBe(
          globalMarketplace.sourceDir,
        );
        expect(globalAfter.skills).toStrictEqual(globalBefore.skills);
        expect(globalAfter.agents).toStrictEqual(globalBefore.agents);
        expect(globalAfter.stack).toStrictEqual(globalBefore.stack);
        await expect({ dir: fakeHome }).toHavePluginInRegistry(pluginKey, "user");

        expect(
          (await loadConfigOrFail(projectDir)).marketplace,
          "the project is set up from the marketplace the command named",
        ).toBe(projectMarketplace.sourceDir);
      },
    );
  },
);
