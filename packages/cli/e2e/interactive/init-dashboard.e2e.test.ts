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
 * A bare `init` over an installation shows its dashboard (Edit, Compile, Doctor, List); with
 * nothing installed it takes the editor route. Launches point at the seed store, so a misread key
 * mints its id here.
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

      // The config declares a skill and an agent, so detectInstallation treats it as installed.
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

      // Both routes exit 0; the output pair says which `init` chose.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.EDITOR_URL);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard on existing project", () => {
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

      // The menu is last on screen, so anchoring both ends says there are four.
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

    /** Keys written at once arrive as one chunk with no frame between them. */
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

    /** The browser opener is stubbed on PATH, so no tab opens. */
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
      // Leaving the dashboard is read-only; mtimes catch a same-bytes rewrite.
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    /** Ctrl+C cancels; Escape only steps out and exits 0. Neither writes. */
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

    /** To oclif a run with no command asks for root help, which the dashboard has answered. */
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

    /** One key at a time: a misread burst would open Edit and time out instead. */
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

      const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = dashboard.getOutput();
      expect(output, "the chosen command ran").toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(output, "the run ends with the command, not with the help").not.toContain(
        STEP_TEXT.ROOT_HELP_USAGE,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });

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

      // With no project config, `init` falls back to a global config that declares content.
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

      // The blank-global block below is the negative; without it both specs assert only that a
      // screen appeared.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.EDITOR_URL);

      await dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("the editor route when only a blank global config exists", () => {
    // `detectInstallationInDir` refuses a config that `declaresNoContent`, so a blank global config
    // is not an installation.
    it("takes the editor route, not the dashboard, when the global config declares no skills or agents", async () => {
      tempDir = await createTempDir();

      // No skills and no agents stated, since the factory's defaults would supply one of each.
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "blank-global",
          skills: [],
          agents: [],
        }),
      );

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
