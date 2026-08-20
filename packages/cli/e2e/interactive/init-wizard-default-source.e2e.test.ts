import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";

/**
 * E2E tests for the init wizard DEFAULT SOURCE code path.
 *
 * ALL existing init E2E tests use `--marketplace <tempDir>`, which bypasses the
 * `DEFAULT_SOURCE` / `BUILT_IN_MATRIX` code path entirely.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init wizard — stale marketplace update", () => {
  let fixtureV1: E2EPluginSource;
  let fixtureV2: E2EPluginSource;
  let wizard: InitWizard | undefined;
  let dashboard: DashboardSession | undefined;
  let sharedHome: string | undefined;
  let sharedProjectDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    sharedHome = await createTempDir();

    // Two DIRECTORIES publishing under ONE marketplace name — the shared default,
    // which every fixture already uses. That pairing is what the stale-update path
    // needs: the second init meets a name its HOME has already registered, from a
    // path that has moved. The name used to be `e2e-test-stale-${Date.now()}`; the
    // timestamp bought nothing, because both registrations land in `sharedHome`,
    // which is a fresh temp dir per run, and it bought a marketplace whose name no
    // longer matches the namespace its skill ids are written in.
    fixtureV1 = await createE2EPluginSource();
    fixtureV2 = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixtureV1);
    await cleanupFixture(fixtureV2);
    if (sharedHome) await cleanupTempDir(sharedHome);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await dashboard?.destroy();
    dashboard = undefined;
    if (sharedProjectDir) {
      await cleanupTempDir(sharedProjectDir);
      sharedProjectDir = undefined;
    }
  });

  it("should register marketplace on first init (v1)", async () => {
    wizard = await InitWizard.launch({
      source: { sourceDir: fixtureV1.sourceDir, tempDir: fixtureV1.tempDir },
      env: { HOME: sharedHome },
    });

    const result = await wizard.completeWithDefaults();
    expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

    const output = result.output;
    expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
    expect(output).toContain("Registering marketplace");

    await expect(result.project).toHaveConfig({
      skillIds: [E2E_SKILL.react.id],
      agents: ["web-developer"],
    });

    // Agents default to global scope, so they compile under the shared HOME
    // this phase installs into rather than under the project directory.
    await expect({ dir: sharedHome! }).toHaveCompiledAgent("web-developer");
  });

  it(
    "should update marketplace on second init (v2) without errors",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Precondition: the previous test ("should register marketplace on first
      // init (v1)") seeded sharedHome with v1's global config + marketplace.
      // A second `cc init` with the same sharedHome therefore lands on the
      // dashboard (global config present) rather than the wizard. The init
      // command still performs marketplace update at startup before rendering.
      sharedProjectDir = await createTempDir();

      dashboard = await InitWizard.launchForDashboard({
        projectDir: sharedProjectDir,
        source: { sourceDir: fixtureV2.sourceDir, tempDir: fixtureV2.tempDir },
        env: { HOME: sharedHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // The dashboard sentinel is the positive half: `not.toContain("Failed
      // to")` said nothing a failed run would not also satisfy — a run that
      // died before printing anything passes it.
      const output = dashboard.getOutput();
      expect(output).toContain(STEP_TEXT.DASHBOARD);
      expect(output).not.toContain("Registering marketplace");

      await dashboard.escape();
      const exitCode = await dashboard.waitForExit();
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    },
  );
});

// Guarded for the same reason as the block above, and the guard was simply
// missed here. This one is worth stating explicitly, though: the test asserts
// that init completes *without* an ENOENT, and a machine with no `claude` on
// its PATH produces `spawn claude ENOENT` for a reason that has nothing to do
// with the defect being tested. So without the guard the failure mode this
// test exists to catch is indistinguishable from an absent dependency — it
// cannot tell a real regression from a runner that never had the binary.
describe.skipIf(!claudeAvailable)("init wizard — default source eject mode ENOENT", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should complete init with default source without ENOENT",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject({
        noSource: true,
        env: { CC_MARKETPLACE: undefined },
      });

      // Use acceptStackDefaults() — selects first stack and presses "A" to
      // accept defaults, skipping domain traversal (BUILT_IN_MATRIX has more
      // domains than the E2E fixture so passThroughAllDomains() doesn't work).
      const result = await wizard.acceptStackDefaults();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const output = result.output;
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(output).not.toContain("ENOENT");
      await expect(result.project).toHaveConfig({
        origin: "agents-inc",
        agents: ["web-developer", "api-developer"],
      });

      // Compiled agents (default global scope) land under the wizard's global HOME.
      await expect({ dir: wizard.globalHome }).toHaveCompiledAgents();
    },
  );

  it("should load wizard with BUILT_IN_MATRIX when no source is provided", async () => {
    wizard = await InitWizard.launch({
      noSource: true,
      env: { CC_MARKETPLACE: undefined },
    });

    const screen = wizard.stack.getScreen();
    // BUILT_IN_MATRIX should contain real stacks (e.g., "Next.js Full-Stack")
    expect(screen).toContain("Next.js");
  });
});
