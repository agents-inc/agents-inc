import { mkdir } from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  createPermissionsFile,
  ensureBinaryExists,
  readTreeSnapshot,
  writeProjectConfig,
} from "../helpers/test-utils.js";

describe("init wizard — existing projects", () => {
  let wizard: InitWizard | undefined;
  let dashboard: DashboardSession | undefined;
  let editWizard: EditWizard | undefined;
  let tempDir: string | undefined;
  let source: E2ESource | undefined;

  beforeAll(ensureBinaryExists);

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

      // Create .claude/ directory with settings but no .claude-src/config.ts
      await createPermissionsFile(tempDir);

      wizard = await InitWizard.launch({
        projectDir: tempDir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
      });

      const output = wizard.stack.getOutput();
      expect(output).toContain("E2E Test Stack");
    });
  });

  describe("already initialized project", () => {
    it("should show dashboard when project already has a config", async () => {
      tempDir = await createTempDir();
      source = await createE2ESource();

      // A real installation: the project config declares a skill and an agent,
      // so detectInstallation treats it as installed and init shows the dashboard.
      await writeProjectConfig(tempDir, {
        name: "test-project",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: tempDir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The exit code alone cannot tell a dashboard from the setup wizard —
      // both exit 0 on Escape. The pair is what says which screen `init` chose.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain(STEP_TEXT.STACK);

      dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("dashboard on existing project", () => {
    async function createDashboardProject(
      options?: Parameters<typeof ProjectBuilder.editable>[0],
    ): Promise<string> {
      source = await createE2ESource();
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
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      const output = dashboard.getOutput();
      expect(output).toContain("Edit");
      expect(output).toContain("Compile");
      expect(output).toContain("Doctor");
      expect(output).toContain("List");
      expect(output).not.toContain(STEP_TEXT.STACK);

      dashboard.escape();
      await dashboard.waitForExit();
    });

    it("should navigate dashboard options with arrow keys", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      await dashboard.arrowDown();
      await dashboard.arrowDown();
      await dashboard.arrowUp();

      const output = dashboard.getOutput();
      expect(output).toContain("Edit");

      dashboard.escape();
      await dashboard.waitForExit();
    });

    it("should exit cleanly when pressing Escape", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // "Cleanly" is more than exit 0: leaving the dashboard is a read-only
      // act, so nothing under the project may be rewritten. mtimes are in the
      // snapshot, so a rewrite producing identical bytes still shows.
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });

    it("should exit cleanly when pressing Ctrl+C", async () => {
      const dashboardDir = await createDashboardProject({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: dashboardDir,
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const treeBefore = await readTreeSnapshot(dashboardDir);

      dashboard.ctrlC();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(await readTreeSnapshot(dashboardDir)).toStrictEqual(treeBefore);
    });
  });

  describe("dashboard when only global config exists", () => {
    it("should show dashboard when global config exists but no project config", async () => {
      source = await createE2ESource();
      tempDir = await createTempDir();

      // A real global installation: the global config declares a skill and an
      // agent, so detectGlobalInstallation treats it as installed and init in a
      // project without its own config falls back to it and shows the dashboard.
      await writeProjectConfig(tempDir, {
        name: "global-test",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      const workDir = path.join(tempDir, "work");
      await mkdir(workDir, { recursive: true });

      dashboard = await InitWizard.launchForDashboard({
        projectDir: workDir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
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

      dashboard.escape();

      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    });
  });

  describe("setup wizard when only a blank global config exists", () => {
    // RED counterpart to "dashboard when only global config exists": a global
    // config that declares no skills and no agents is content-less and must NOT
    // count as an installation, so `init` in a fresh, uninitialized project
    // routes to the setup wizard (stack selection), never the dashboard.
    //
    // detectInstallationInDir currently treats ANY .claude-src/config.ts as an
    // installation without inspecting its skills/agents, so detectInstallation
    // falls back to the blank global config and runDashboardFlow shows the
    // dashboard. The wait for the stack screen therefore times out today,
    // dumping the dashboard frame — this test goes green once the mis-routing
    // is fixed.
    it("should show the setup wizard, not the dashboard, when the global config declares no skills or agents", async () => {
      source = await createE2ESource();
      tempDir = await createTempDir();

      // Content-less global config at <fakeHome>/.claude-src/config.ts.
      await writeProjectConfig(tempDir, {
        name: "blank-global",
        skills: [],
        agents: [],
      });

      // Fresh, uninitialized project directory with no config of its own.
      const projectDir = path.join(tempDir, "work");
      await mkdir(projectDir, { recursive: true });

      // launchForDashboard is the raw-launch entry — it spawns `init` and
      // returns a screen wrapper; it does NOT force the dashboard. Using it
      // keeps the session assigned for afterEach cleanup even when the
      // stack-screen wait times out under the current bug.
      dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
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
