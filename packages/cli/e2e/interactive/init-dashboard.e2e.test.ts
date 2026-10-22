import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { stubBrowserOpener } from "../fixtures/browser-opener.js";
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
  createLocalSkillIn,
  createPermissionsFile,
  createTempDir,
  readTestFile,
  readTreeSnapshot,
  renderMetadataYaml,
  runCLI,
  writeConfigTypes,
  writeProjectConfig,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";
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
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * A bare `init` over an installation shows its dashboard (Edit, Compile, Doctor, List); with
 * nothing installed it takes the editor route. Launches point at the seed store, so a misread key
 * mints its id here. A scope holding a Claude and a Codex installation shows one block for each.
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

        const opener = await stubBrowserOpener(env.tempDir);

        dashboard = await DashboardSession.launch({
          projectDir: env.projectDir,
          env: { HOME: env.fakeHome, AGENTS_INC_API_URL: store.url, PATH: opener.path },
        });
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
        const treeBefore = await readTreeSnapshot(env.projectDir);

        await dashboard.chooseOneKeyAtATime(0, "❯ Edit in the web editor");

        const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);
        const output = dashboard.getOutput();
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(store.minted).toHaveLength(1);
        const mintedId = firstElement(store.minted);
        expect(output).toContain(`Shared as ${mintedId}`);
        expect(output).toContain(STEP_TEXT.EDITOR_URL);
        const opened = await readTestFile(opener.logPath);
        expect(opened, "the browser must be handed the editor").toContain(STEP_TEXT.EDITOR_URL);
        expect(opened, "the browser must be handed the id just minted").toContain(mintedId);
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

  /** Each installation compiled for real, so the counts are what each host's folder holds. */
  describe("over a scope holding a Claude and a Codex installation", () => {
    const SKILL_ID = E2E_SKILL.vitest.id;
    const CLAUDE_AGENTS = [WEB_DEV];
    const CODEX_AGENTS = ["cli-developer", "pm"] as const satisfies readonly AgentName[];

    async function installAndCompile(
      projectDir: string,
      home: string,
      provider: "claude" | "codex",
    ): Promise<void> {
      const sourceFolder = provider === "claude" ? DIRS.SOURCE_CLAUDE : DIRS.SOURCE_CODEX;
      const skillsDir =
        provider === "claude" ? path.join(DIRS.CLAUDE, DIRS.SKILLS) : DIRS.CODEX_PROJECT_SKILLS;
      await writeProjectConfigIn(
        projectDir,
        sourceFolder,
        buildProjectConfig({
          name: `dashboard-${provider}`,
          skills: buildSkillConfigs([SKILL_ID], { scope: "project", origin: "eject" }),
          agents: buildAgentConfigs(provider === "claude" ? CLAUDE_AGENTS : [...CODEX_AGENTS], {
            scope: "project",
          }),
        }),
      );
      await writeConfigTypes(projectDir, sourceFolder);
      await createLocalSkillIn(path.join(projectDir, skillsDir), SKILL_ID, {
        description: "Ejected so each installation has content to compile",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(SKILL_ID),
          contentHash: "hash-dashboard-providers",
        }),
      });
      const compiled = await runCLI(["compile", "--provider", provider], projectDir, {
        env: { HOME: home },
      });
      expect(compiled.exitCode, compiled.combined).toBe(EXIT_CODES.SUCCESS);
    }

    it("prints one block per provider, each with its own counts", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      const home = path.join(tempDir, "home");
      await mkdir(projectDir, { recursive: true });
      await mkdir(home, { recursive: true });
      await installAndCompile(projectDir, home, "claude");
      await installAndCompile(projectDir, home, "codex");

      const { exitCode, stdout } = await runCLI(["init"], projectDir, { env: { HOME: home } });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(
        [
          "",
          `  ${STEP_TEXT.DASHBOARD_PROVIDER}     claude`,
          "  Skills:       1 installed",
          `  Agents:       ${CLAUDE_AGENTS.length} compiled`,
          "  Mode:         Eject",
          "",
          `  ${STEP_TEXT.DASHBOARD_PROVIDER}     codex`,
          "  Skills:       1 installed",
          `  Agents:       ${CODEX_AGENTS.length} compiled`,
          "  Mode:         Eject",
          "",
          "  [Edit in the web editor]",
        ].join("\n"),
      );
    });

    it("prints the one block, naming no provider, where the scope holds one installation", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      const home = path.join(tempDir, "home");
      await mkdir(projectDir, { recursive: true });
      await mkdir(home, { recursive: true });
      await installAndCompile(projectDir, home, "codex");

      const { exitCode, stdout } = await runCLI(["init"], projectDir, { env: { HOME: home } });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(
        [
          "",
          "  Skills:       1 installed",
          `  Agents:       ${CODEX_AGENTS.length} compiled`,
          "  Mode:         Eject",
          "",
          "  [Edit in the web editor]",
        ].join("\n"),
      );
      expect(stdout).not.toContain(STEP_TEXT.DASHBOARD_PROVIDER);
    });
  });
});
