import { mkdir } from "fs/promises";
import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_DISPLAY } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  createPermissionsFile,
  readTreeSnapshot,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

describe("init wizard — existing projects", () => {
  let wizard: InitWizard | undefined;
  let dashboard: DashboardSession | undefined;
  let editWizard: EditWizard | undefined;
  let tempDir: string | undefined;
  let source: E2ESource | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await dashboard?.destroy();
    dashboard = undefined;
    await editWizard?.destroy();
    editWizard = undefined;

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (source) {
      await cleanupTempDir(source.tempDir);
      source = undefined;
    }
  });

  describe("existing .claude directory without config", () => {
    it("should start fresh wizard when .claude/ exists but no config", async () => {
      tempDir = await createTempDir();
      source = await createE2ESource();

      // Create .claude/ directory with settings but no source folder and no config.ts
      await createPermissionsFile(tempDir);

      wizard = await InitWizard.launch({
        projectDir: tempDir,
        source,
      });

      const output = wizard.stack.getOutput();
      expect(output).toContain(E2E_STACK_DISPLAY);
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
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        }),
      );

      // A bare `init`: this installation records no marketplace, so naming one would be naming
      // a different marketplace than the one it was installed from.
      dashboard = await InitWizard.launchForDashboard({
        projectDir: tempDir,
        noSource: true,
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The exit code alone cannot tell a dashboard from the setup wizard —
      // both exit 0 on Escape. The pair is what says which screen `init` chose.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.STACK);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard on existing project", () => {
    /**
     * An installed project, launched below as a bare `init`: its config records no marketplace,
     * so naming one would be naming a different marketplace than the one it was installed from.
     */
    async function createDashboardProject(
      options?: Parameters<typeof ProjectBuilder.editable>[0],
    ): Promise<string> {
      const project = await ProjectBuilder.editable(options);
      tempDir = path.dirname(project.dir);
      return project.dir;
    }

    it("should show dashboard menu instead of setup wizard", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        noSource: true,
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      const output = dashboard.getOutput();
      expect(output).toContain("Edit");
      expect(output).toContain("Compile");
      expect(output).toContain("Doctor");
      expect(output).toContain("List");
      expect(output).not.toContain(STEP_TEXT.STACK);

      await dashboard.escape();
      await dashboard.waitForExit();
    });

    it("should navigate dashboard options with arrow keys", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        noSource: true,
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.arrowDown();
      await dashboard.arrowDown();
      await dashboard.arrowUp();

      const output = dashboard.getOutput();
      expect(output).toContain("Edit");

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
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        noSource: true,
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.chooseInOneBurst(2);
      await dashboard.waitForEither(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
        STEP_TEXT.BUILD_FOOTER,
        TIMEOUTS.WIZARD_LOAD,
      );

      const output = dashboard.getOutput();
      expect(output, "Down, Down, Enter from Edit lands on Doctor").toContain(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
      );
      expect(output, "the burst must not open the option it started on").not.toContain(
        STEP_TEXT.BUILD_FOOTER,
      );
    });

    it("should exit cleanly when pressing Escape", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        noSource: true,
      });

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
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        noSource: true,
      });

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
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({ projectDir: dashboardDir, bare: true });

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
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({ projectDir: dashboardDir, bare: true });

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
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({ projectDir: dashboardDir, bare: true });

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
        agents: ["web-developer"],
      });

      const { exitCode, stdout } = await CLI.run([], { dir: dashboardDir });

      expect(stdout, "the dashboard's text is printed").toContain(STEP_TEXT.DASHBOARD);
      expect(stdout, "and nothing after it").not.toContain(STEP_TEXT.ROOT_HELP_USAGE);
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard when only global config exists", () => {
    it("should show dashboard when global config exists but no project config", async () => {
      source = await createE2ESource();
      tempDir = await createTempDir();

      // A real global installation: the global config declares a skill and an
      // agent, so detectGlobalInstallation treats it as installed and init in a
      // project without its own config falls back to it and shows the dashboard.
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "global-test",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        }),
      );

      const workDir = path.join(tempDir, "work");
      await mkdir(workDir, { recursive: true });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: workDir,
        source,
        env: { HOME: tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The positive/negative pair the sibling block below asserts in reverse:
      // a global config with content routes to the dashboard, a blank one to
      // the setup wizard. Without the negative both specs assert "a screen
      // appeared".
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.STACK);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("setup wizard when only a blank global config exists", () => {
    // The counterpart to "dashboard when only global config exists": a global
    // config that declares no skills and no agents is content-less and must NOT
    // count as an installation, so `init` in a fresh, uninitialized project
    // routes to the setup wizard (stack selection), never the dashboard.
    //
    // `detectInstallationInDir` refuses a config that `declaresNoContent`, so
    // `detectInstallation` has no blank global config to fall back to. Before it
    // did, the dashboard showed here and the wait for the stack screen timed out
    // dumping the dashboard frame — which is how a regression reads today.
    it("should show the setup wizard, not the dashboard, when the global config declares no skills or agents", async () => {
      source = await createE2ESource();
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

      // launchForDashboard is the raw-launch entry — it spawns `init` and
      // returns a screen wrapper; it does NOT force the dashboard. Using it
      // keeps the session assigned for afterEach cleanup even when the
      // stack-screen wait times out on a regression.
      dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source,
        env: { HOME: tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.STACK, TIMEOUTS.WIZARD_LOAD);

      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.STACK);
      expect(output).not.toContain(STEP_TEXT.DASHBOARD);
    });
  });

  describe("startup message buffering", () => {
    it("should load wizard using global config when no project config exists", async () => {
      const { globalHome, subDir } = await ProjectBuilder.globalWithSubproject();

      // The edit command falls back to global config and launches the wizard
      editWizard = await EditWizard.launch({
        projectDir: subDir,
        env: { HOME: globalHome.dir },
      });

      // Verify the wizard loaded successfully with skills from the global config
      const output = editWizard.build.getOutput();
      expect(output).toContain("React");
    });
  });
});
