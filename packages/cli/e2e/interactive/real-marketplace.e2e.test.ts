import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES, SOURCE_PATHS, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import {
  MONOREPO_ROOT,
  agentsPath,
  createTempDir,
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import { BUILT_IN_STACK_DISPLAY, WEB_DOMAIN_AGENTS } from "../fixtures/expected-values.js";
import { listCompiledAgentNames } from "../../src/cli/lib/agents/list-compiled-agents.js";

/**
 * E2E tests using the REAL local skills repository.
 *
 * These tests verify the full end-to-end flow with actual marketplace data
 * instead of the synthetic E2E test source. They use --marketplace pointed at the
 * local clone to avoid network calls while still exercising real skill content.
 *
 * Set SKILLS_SOURCE env var to override the default location. The suite is
 * automatically skipped when the directory is absent (e.g. on CI or other
 * machines).
 *
 * A single beforeAll runs the full init flow once; subsequent tests verify
 * different aspects of the installed project.
 */

// Resolve the skills repo: env override, or sibling to the monorepo root (a separate
// checkout, hence MONOREPO_ROOT rather than the CLI package root)
const SKILLS_SOURCE = process.env.SKILLS_SOURCE ?? path.resolve(MONOREPO_ROOT, "../skills");

const REAL_INSTALL_TIMEOUT = TIMEOUTS.PLUGIN_INSTALL;

/**
 * The two skills this suite picks out of the real catalogue, by the display
 * title the clone's own `metadata.yaml` gives each — which is what the build
 * grid paints and therefore what `selectSkill` matches on.
 */
const REAL_SKILL_DISPLAY = {
  react: "React",
  nextjs: "Next.js",
} as const;

const hasSkillsSource = await directoryExists(path.join(SKILLS_SOURCE, SOURCE_PATHS.SKILLS_DIR));

describe.skipIf(!hasSkillsSource)("real marketplace", () => {
  let projectDir: string;
  let wizard: InitWizard | undefined;
  let initOutput: string;
  /** Append-only PTY output of the init session — the only surface that can prove a step never painted. */
  let initRawOutput: string;
  // Default-scope install content (compiled agents) lands in HOME. Thread ONE
  // shared HOME through the init and every follow-up CLI.run so they resolve the
  // same global root; config.ts stays under projectDir. The afterAll owns
  // cleanup (the reuse-param launch does not).
  let sharedHome: string;

  beforeAll(async () => {
    await ensureBinaryExists();

    projectDir = await createTempDir();
    sharedHome = await createTempDir();

    // The clone ships no config/stacks.ts, and the built-in stacks ARE this
    // repository's stacks — it is the public catalogue, read off a path — so the
    // wizard opens on the stack step offering them. "Start from scratch" is the
    // row that leaves the same empty selection the domains step used to open on
    // when this source offered no stacks at all.
    wizard = await InitWizard.launchInProject({
      source: { sourceDir: SKILLS_SOURCE, tempDir: "" },
      projectDir,
      globalHome: sharedHome,
      loadTimeout: TIMEOUTS.INSTALL,
    });

    const domain = await wizard.stack.selectScratch();

    // Web alone: both skills this suite installs are web skills, and one domain
    // keeps the roster the scratch preselection brings small enough to name.
    await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
    await domain.toggleDomain(STEP_TEXT.DOMAIN_MOBILE);
    const build = await domain.advance();

    await build.selectSkill(REAL_SKILL_DISPLAY.react);
    await build.selectSkill(REAL_SKILL_DISPLAY.nextjs);

    // Real source has variable domains (Web, API, CLI, Shared), use generic path
    const sources = await build.passThroughAllDomainsGeneric();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    initOutput = result.output;
    initRawOutput = wizard.getRawOutput();
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
    it("should have offered the built-in stacks for a checkout of the catalogue's own repository", () => {
      // Raw PTY output is append-only, so the step is provable from it whichever
      // way the answer goes. `initOutput` cannot answer this — the wizard clears
      // the screen on exit, and Ink overwrites frames in place.
      //
      // The inverse of what this pinned previously: the built-in stacks are the
      // public catalogue's stacks, that repository ships no config/stacks.ts, and
      // package identity is what says a path holds it. Keying on the source
      // STRING alone made a checkout of the catalogue offer none of its own
      // stacks.
      expect(initRawOutput).toContain(STEP_TEXT.STACK);
      expect(initRawOutput).toContain(BUILT_IN_STACK_DISPLAY);
      expect(initRawOutput).toContain(STEP_TEXT.DOMAINS);
    });

    it("should have installed the real skills picked from the catalogue", () => {
      // The stack selection screen is cleared after the wizard, so the skill
      // refs the install printed are what the picks are visible as.
      expect(initOutput).toContain("web-framework-react@agents-inc");
      expect(initOutput).toContain("web-meta-framework-nextjs@agents-inc");
    });

    it("should have used the real marketplace for plugin installation", () => {
      expect(initOutput).toContain("agents-inc");
    });

    it("should have created config.ts with agents-inc source", async () => {
      await expect({ dir: projectDir }).toHaveConfig({
        origin: "agents-inc",
        agents: ["web-developer"],
      });
    });

    it("should have installed exactly the sub-agents the selected domain brings", async () => {
      const expected = [...WEB_DOMAIN_AGENTS];

      expect(
        await readActiveAgentNames(projectDir),
        "config.ts must name exactly the sub-agents the selected domain preselects",
      ).toStrictEqual(expected);

      const compiled = await listCompiledAgentNames(agentsPath(sharedHome));
      expect(
        compiled.sort(),
        "the compiled agents on disk must be exactly that preselected roster",
      ).toStrictEqual(expected);
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
          env: { CC_MARKETPLACE: undefined },
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
