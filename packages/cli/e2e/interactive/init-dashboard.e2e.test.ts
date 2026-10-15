import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  readTreeSnapshot,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { browserOpenerCommand } from "../../src/cli/utils/open-url.js";

/**
 * A bare `init` over an installation shows its dashboard; where nothing is installed it takes the
 * editor route instead. The dashboard offers four commands — Edit in the web editor, Compile,
 * Doctor and List — and Edit hands the installation to the editor as `edit --ui` does.
 *
 * Every launch that a misread key could carry into Edit points the CLI at the seed store, so a
 * failing run mints its id here rather than on agentsinc.sh.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("init over an existing installation", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let dashboard: DashboardSession | undefined;
  let tempDir: string | undefined;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
    store.reset();

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (env) {
      await cleanupTempDir(env.tempDir);
      env = undefined;
    }
  });

  describe("existing .claude directory without config", () => {
    it("takes the editor route, not the dashboard, when .claude/ exists but no config", async () => {
      tempDir = await createTempDir();
      await createPermissionsFile(tempDir);

      const { exitCode, stdout } = await CLI.run(["init"], { dir: tempDir });

      expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
      expect(stdout).not.toContain(STEP_TEXT.DASHBOARD);
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await expectNoSourceFolder(tempDir, "the editor route installs nothing");
    });
  });

  describe("already initialized project", () => {
    it("should show dashboard when project already has a config", async () => {
      tempDir = await createTempDir();

      // A real installation: the project config declares a skill and an agent,
      // so detectInstallation treats it as installed and init shows the dashboard.
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "test-project",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        }),
      );

      dashboard = await DashboardSession.launch({ projectDir: tempDir });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The exit code alone cannot tell the dashboard from the editor route — both exit 0. The
      // pair is what says which one `init` chose.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.EDITOR_URL);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard on existing project", () => {
    /** An installed project, launched below as a bare `init`. */
    async function createDashboardProject(
      options?: Parameters<typeof ProjectBuilder.editable>[0],
    ): Promise<string> {
      const project = await ProjectBuilder.editable(options);
      tempDir = path.dirname(project.dir);
      return project.dir;
    }

    it("offers exactly the four commands, Edit in the web editor first", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The menu is the last thing on the screen, so anchoring both ends says there are four.
      expect(dashboard.getScreen()).toMatch(
        /\n\n❯ Edit in the web editor\n {2}Compile\n {2}Doctor\n {2}List$/,
      );
      expect(dashboard.getOutput()).not.toContain(STEP_TEXT.EDITOR_URL);

      await dashboard.escape();
      await dashboard.waitForExit();
    });

    it("should navigate dashboard options with arrow keys", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.arrowDown();
      await dashboard.arrowDown();
      await dashboard.arrowUp();

      await dashboard.waitForText("❯ Compile", TIMEOUTS.WIZARD_TRANSITION);
      expect(dashboard.getScreen()).toContain("Edit in the web editor");

      await dashboard.escape();
      await dashboard.waitForExit();
    });

    /**
     * Down, Down, Enter written at once — a fast typist, or a paste — reaches the CLI as one chunk,
     * and the dashboard handles the three keys with no frame painted between them. Two moves down
     * from Edit is Doctor however fast they came; the paced walk is the spec above.
     */
    it("should run the option the keys land on when they arrive in one burst", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({
        projectDir: dashboardDir,
        env: { AGENTS_INC_API_URL: store.url },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.chooseInOneBurst(2);
      await dashboard.waitForEither(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
        "Shared as",
        TIMEOUTS.WIZARD_LOAD,
      );

      const output = dashboard.getOutput();
      expect(output, "Down, Down, Enter from Edit lands on Doctor").toContain(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
      );
      expect(output, "the burst must not open the option it started on").not.toContain("Shared as");
    });

    /**
     * Edit runs `edit --ui`: an id is minted for this installation and the editor link printed.
     * The browser opener is stubbed on PATH, so a machine that has one opens no tab.
     */
    it(
      "opens the installation in the web editor when Edit is chosen",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        store.publish(
          "Dashbd01",
          buildSeedPayload({
            skills: {
              [E2E_SKILL.react.id]: buildSeedSkill({
                scope: "project",
                assignments: { [WEB_DEV]: "lazy" },
              }),
            },
            agents: { [WEB_DEV]: { on: true, scope: "project" } },
          }),
        );
        const installed = await runInitFrom(
          store,
          "Dashbd01",
          { dir: env.projectDir, globalHome: env.fakeHome },
          sourceDir,
        );
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        store.reset();

        const binDir = path.join(env.tempDir, "bin");
        await mkdir(binDir, { recursive: true });
        const opener = browserOpenerCommand(process.platform, STEP_TEXT.EDITOR_URL).command;
        await writeFile(path.join(binDir, opener), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

        dashboard = await DashboardSession.launch({
          projectDir: env.projectDir,
          env: {
            HOME: env.fakeHome,
            AGENTS_INC_API_URL: store.url,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
        });
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
        const treeBefore = await readTreeSnapshot(env.projectDir);

        await dashboard.chooseOneKeyAtATime(0, "❯ Edit in the web editor");

        const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);
        const output = dashboard.getOutput();
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(store.minted).toHaveLength(1);
        expect(output).toContain(`Shared as ${firstElement(store.minted)}`);
        expect(output).toContain(STEP_TEXT.EDITOR_URL);
        expect(
          await readTreeSnapshot(env.projectDir),
          "opening the editor reads the installation and rewrites nothing",
        ).toStrictEqual(treeBefore);
      },
    );

    it("should exit cleanly when pressing Escape", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // "Cleanly" is more than exit 0: leaving the dashboard is a read-only
      // act, so nothing under the project may be rewritten. mtimes are in the
      // snapshot, so a rewrite producing identical bytes still shows.
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    /**
     * Ctrl+C cancels, as it does at every other prompt — where Escape, the spec above, only steps
     * back out of the dashboard and exits 0. Neither writes anything.
     */
    it("should exit as cancelled when pressing Ctrl+C", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      await dashboard.ctrlC();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode, "Ctrl+C on the dashboard is a cancellation").toBe(EXIT_CODES.CANCELLED);
      expect(dashboard.getOutput()).toContain(STEP_TEXT.RUN_CANCELLED);
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    it("should exit as cancelled when pressing Ctrl+C on the dashboard shown with no command", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir, bare: true });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      await dashboard.ctrlC();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode, "Ctrl+C on the dashboard is a cancellation").toBe(EXIT_CODES.CANCELLED);
      expect(dashboard.getOutput()).toContain(STEP_TEXT.RUN_CANCELLED);
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    /**
     * A run with no command is, to oclif, a request for the root help — and the dashboard shown in
     * its place has answered it. Whichever way the dashboard is left, the run ends there.
     */
    it("should end the run when Escape leaves the dashboard shown with no command", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({ projectDir: dashboardDir, bare: true });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(dashboard.getOutput(), "Escape leaves the dashboard, not into the help").not.toContain(
        STEP_TEXT.ROOT_HELP_USAGE,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    /**
     * Chosen one key at a time rather than in a burst: the burst is the spec above's subject, and a
     * dashboard that misread one would open Edit and fail this spec on a timeout instead of on the
     * help listing it is about.
     */
    it("should end the run with the command chosen on the dashboard shown with no command", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      dashboard = await DashboardSession.launch({
        projectDir: dashboardDir,
        bare: true,
        env: { AGENTS_INC_API_URL: store.url },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.chooseOneKeyAtATime(2, STEP_TEXT.DASHBOARD_DOCTOR_FOCUSED);

      // A whole doctor run, so a real command's exit wait rather than a keypress's.
      const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = dashboard.getOutput();
      expect(output, "the chosen command ran").toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(output, "the run ends with the command, not with the help").not.toContain(
        STEP_TEXT.ROOT_HELP_USAGE,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    /** The same dashboard through a pipe, which prints its text in place of the menu. */
    it("should end the run after the dashboard a pipe is shown with no command", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: [WEB_DEV],
      });

      const { exitCode, stdout } = await CLI.run([], { dir: dashboardDir });

      expect(stdout, "the dashboard's text is printed").toContain(
        "  [Edit in the web editor]  [Compile]  [Doctor]  [List]",
      );
      expect(stdout, "and nothing after it").not.toContain(STEP_TEXT.ROOT_HELP_USAGE);
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard when only global config exists", () => {
    it("should show dashboard when global config exists but no project config", async () => {
      tempDir = await createTempDir();

      // A real global installation: the global config declares a skill and an
      // agent, so detectGlobalInstallation treats it as installed and init in a
      // project without its own config falls back to it and shows the dashboard.
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "global-test",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        }),
      );

      const workDir = path.join(tempDir, "work");
      await mkdir(workDir, { recursive: true });

      dashboard = await DashboardSession.launch({
        projectDir: workDir,
        env: { HOME: tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The positive/negative pair the sibling block below asserts in reverse:
      // a global config with content routes to the dashboard, a blank one to
      // the editor. Without the negative both specs assert "a screen appeared".
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.EDITOR_URL);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("the editor route when only a blank global config exists", () => {
    // The counterpart to "dashboard when only global config exists": a global config that
    // declares no skills and no agents is content-less and must NOT count as an installation, so
    // `init` in a fresh, uninitialized project takes the editor route, never the dashboard.
    //
    // `detectInstallationInDir` refuses a config that `declaresNoContent`, so
    // `detectInstallation` has no blank global config to fall back to.
    it("takes the editor route, not the dashboard, when the global config declares no skills or agents", async () => {
      tempDir = await createTempDir();

      // Content-less global config in the fake home's own source folder: no skills and no
      // agents, each stated, since the factory's defaults would otherwise supply one of each.
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "blank-global",
          skills: [],
          agents: [],
        }),
      );

      // Fresh, uninitialized project directory with no config of its own.
      const projectDir = path.join(tempDir, "work");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["init"],
        { dir: projectDir },
        { env: { HOME: tempDir } },
      );

      expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
      expect(stdout).not.toContain(STEP_TEXT.DASHBOARD);
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await expectNoSourceFolder(projectDir, "the editor route installs nothing");
    });
  });
});
