import { captureOutput } from "@oclif/test";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT, runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { forgetTheProviderChosenForThisRun } from "../../installation/install-layout.js";
import { EXIT_CODES } from "../../exit-codes";

/**
 * Imported from source rather than run through `dist/`, so a `--provider` one spec names is
 * forgotten before the next: a dist module's state would outlive the spec that set it. The
 * `edit --from` applies run through `dist/`, as the other apply specs do, and name no provider.
 */
const { default: Compile } = await import("../../../commands/compile.js");
const { default: Doctor } = await import("../../../commands/doctor.js");
const { default: Edit } = await import("../../../commands/edit.js");
const { default: Init } = await import("../../../commands/init.js");

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

const SHARED_ID = "Shared1";
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");

/** The two commands of the recreate remedy, each half with the argument the spec expects. */
function recreateRemedy(scopeRoot: string, uninstallArgument: string, initArgument: string) {
  return `'npx agents-inc uninstall${uninstallArgument}' from '${scopeRoot}', which still works on a config it cannot read, then 'npx agents-inc init --from <id>${initArgument}'`;
}

function noTerminalRemedy(initArgument: string): string {
  return `Run 'npx agents-inc edit --from ${SHARED_ID}' from a terminal, or 'npx agents-inc init --from ${SHARED_ID}${initArgument}' in a clean directory`;
}

/**
 * A bare `init --from` creates Claude's installation, so a remedy that hands one out over a lone
 * Codex installation names Codex in that half; `uninstall` and `edit` act on a lone installation
 * of either provider bare. Each Codex case sits beside its Claude control.
 */
describe("a remedy handed out over the only installation in play", () => {
  useMockWorker();
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-remedy-bare-misses-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
  });

  afterEach(async () => {
    forgetTheProviderChosenForThisRun();
    await cleanupTestSource(dirs);
    await cleanup();
  });

  function serve(payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(SHARED_ID, payload));
  }

  /** An installation `edit --from` can read, holding one skill the payload below drops. */
  async function installedAt(root: string, folder: string): Promise<void> {
    await writeTestTsConfig(
      root,
      buildProjectConfig({
        name: "installation",
        marketplace: dirs.sourceDir,
        skills: buildSkillConfigs([VITEST], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
      folder,
    );
  }

  /** All global, so it applies at home as well as in a project, and changes what is installed. */
  function servesAChange(): void {
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [HONO]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "api-developer": { scope: "global" } },
      }),
    );
  }

  describe("recreating a config that will not load", () => {
    it("doctor names Codex in the init half alone", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), CODEX_FOLDER);

      const { stdout } = await captureOutput(() => Doctor.run([], { root: CLI_ROOT }));

      expect(stdout).toContain(
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), "", " --provider codex")} with an id from http://localhost:5173/editor\n`,
      );
    });

    it("a command refusing the config names Codex in the init half alone", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), CODEX_FOLDER);

      const { error } = await captureOutput(() => Compile.run([], { root: CLI_ROOT }));

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(recreateRemedy(process.cwd(), "", " --provider codex"));
    });

    it("a run that named Codex itself still names it in the init half", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), CODEX_FOLDER);

      const { error } = await captureOutput(() =>
        Compile.run(["--provider", "codex"], { root: CLI_ROOT }),
      );

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(recreateRemedy(process.cwd(), "", " --provider codex"));
    });

    it("control: over a lone Claude installation both halves stay bare", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), CLAUDE_FOLDER);

      const { stdout } = await captureOutput(() => Doctor.run([], { root: CLI_ROOT }));

      expect(stdout).toContain(
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), "", "")} with an id from http://localhost:5173/editor\n`,
      );
    });
  });

  describe("applying a shared configuration with no terminal to confirm at", () => {
    it("names Codex in the init half alone over a lone Codex project", async () => {
      await installedAt(projectDir, CODEX_FOLDER);
      servesAChange();

      const { error } = await runCliCommand(["edit", "--from", SHARED_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(noTerminalRemedy(" --provider codex"));
    });

    it("names Codex the same way where the only installation is a global Codex one", async () => {
      await installedAt(fakeHome, CODEX_FOLDER);
      servesAChange();

      const { error } = await runCliCommand(["edit", "--from", SHARED_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(noTerminalRemedy(" --provider codex"));
    });

    it("control: over a lone Claude project both halves stay bare", async () => {
      await installedAt(projectDir, CLAUDE_FOLDER);
      servesAChange();

      const { error } = await runCliCommand(["edit", "--from", SHARED_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(noTerminalRemedy(""));
    });
  });

  describe("opening a shared id as Codex over a Claude-only project", () => {
    beforeEach(async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "installation" }),
        CLAUDE_FOLDER,
      );
    });

    it("edit --ui --from hands out the install of the named provider, as init does", async () => {
      const { stdout } = await captureOutput(() =>
        Edit.run(["--ui", "--from", SHARED_ID, "--provider", "codex"], { root: CLI_ROOT }),
      );

      expect(stdout).toContain(
        `To install it here instead, run 'npx agents-inc init --from ${SHARED_ID} --provider codex'.\n`,
      );
    });

    it("init --ui --from hands out the same install", async () => {
      const { stdout } = await captureOutput(() =>
        Init.run(["--ui", "--from", SHARED_ID, "--provider", "codex"], { root: CLI_ROOT }),
      );

      expect(stdout).toContain(
        `To install it here instead, run 'npx agents-inc init --from ${SHARED_ID} --provider codex'.\n`,
      );
    });

    it("control: naming the installation it holds hands out the apply", async () => {
      const { stdout } = await captureOutput(() =>
        Edit.run(["--ui", "--from", SHARED_ID, "--provider", "claude"], { root: CLI_ROOT }),
      );

      expect(stdout).toContain(
        `To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID} --provider claude'.\n`,
      );
    });
  });
});
