import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES, SOURCE_PATHS, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import {
  CLI_ROOT,
  createTempDir,
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
} from "../helpers/test-utils.js";

/**
 * E2E tests using the REAL local skills repository.
 *
 * These tests verify the full end-to-end flow with actual marketplace data
 * instead of the synthetic E2E test source. They use --source pointed at the
 * local clone to avoid network calls while still exercising real skill content.
 *
 * Set SKILLS_SOURCE env var to override the default location. The suite is
 * automatically skipped when the directory is absent (e.g. on CI or other
 * machines).
 *
 * A single beforeAll runs the full init flow once; subsequent tests verify
 * different aspects of the installed project.
 */

// Resolve the skills repo: env override, or sibling to the git toplevel
const SKILLS_SOURCE = process.env.SKILLS_SOURCE ?? path.resolve(CLI_ROOT, "../skills");

const REAL_INSTALL_TIMEOUT = TIMEOUTS.PLUGIN_INSTALL;

const hasSkillsSource = await directoryExists(path.join(SKILLS_SOURCE, SOURCE_PATHS.SKILLS_DIR));

describe.skipIf(!hasSkillsSource)("real marketplace", () => {
  let projectDir: string;
  let wizard: InitWizard | undefined;
  let initOutput: string;
  // Default-scope install content (compiled agents) lands in HOME. Thread ONE
  // shared HOME through the init and every follow-up CLI.run so they resolve the
  // same global root; config.ts stays under projectDir. The afterAll owns
  // cleanup (the reuse-param launch does not).
  let sharedHome: string;

  beforeAll(async () => {
    await ensureBinaryExists();

    projectDir = await createTempDir();
    sharedHome = await createTempDir();

    wizard = await InitWizard.launchInProject({
      source: { sourceDir: SKILLS_SOURCE, tempDir: "" },
      projectDir,
      globalHome: sharedHome,
      loadTimeout: TIMEOUTS.INSTALL,
    });
    // Real source has variable domains (Web, API, CLI, Shared), use generic path
    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomainsGeneric();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    initOutput = result.output;
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();
  }, REAL_INSTALL_TIMEOUT);

  afterAll(async () => {
    await wizard?.destroy();
    wizard = undefined;

    if (projectDir) {
      await cleanupTempDir(projectDir);
    }
    if (sharedHome) {
      await cleanupTempDir(sharedHome);
    }
  });

  describe("init with real marketplace", () => {
    it("should have rendered real stacks during stack selection", () => {
      // The CLI's built-in stacks include "Next.js Full-Stack" — verify its
      // skills were installed (stack selection screen is cleared after wizard)
      expect(initOutput).toContain("web-framework-react@agents-inc");
      expect(initOutput).toContain("web-meta-framework-nextjs@agents-inc");
    });

    it("should have used the real marketplace for plugin installation", () => {
      expect(initOutput).toContain("agents-inc");
    });

    it("should have created config.ts with agents-inc source", async () => {
      await expect({ dir: projectDir }).toHaveConfig({
        source: "agents-inc",
        agents: ["web-developer"],
      });
    });

    it("should have compiled agents with real content", async () => {
      await expect({ dir: sharedHome }).toHaveCompiledAgent("web-developer");
    });

    it("should have displayed completion details", () => {
      expect(initOutput).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
      expect(initOutput).toContain(STEP_TEXT.CONFIGURATION_LABEL);
    });
  });

  describe("compile with real installed project", () => {
    it("should compile agents to project output directory", async () => {
      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir, globalHome: sharedHome },
        {
          env: { AGENTSINC_SOURCE: undefined },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: sharedHome }).toHaveCompiledAgent("web-developer");
    });
  });

  describe("edit with real marketplace", () => {
    let editWizard: EditWizard | undefined;

    afterEach(async () => {
      if (editWizard) {
        await editWizard.abortAndDestroy(TIMEOUTS.EXIT);
        editWizard = undefined;
      }
    });

    it("should show the build step with pre-selected skills", async () => {
      editWizard = await EditWizard.launchInProject({
        projectDir,
        globalHome: sharedHome,
        cols: 120,
        rows: 40,
      });

      const output = editWizard.build.getOutput();
      expect(output).toMatch(/Framework \*/);
    });
  });

  describe("list after real install", () => {
    it("should show installed skills and agents", async () => {
      const { exitCode, stdout } = await CLI.run(["list"], {
        dir: projectDir,
        globalHome: sharedHome,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).not.toContain(STEP_TEXT.NO_INSTALLATION);
      expect(stdout).toMatch(/skills/i);
      expect(stdout).toMatch(/agents/i);
    });
  });
});
