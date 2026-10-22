import path from "path";
import { mkdir, readdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import {
  runEditFrom,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  flattenCliOutput,
  loadConfigOrFail,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { CLI_INVOKE_COMMAND, DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * A bare `init --from` creates Claude's installation, so a remedy that hands one out over a lone
 * Codex installation names Codex; following it leaves Codex, not Claude. Each Codex case sits beside
 * its Claude control.
 */

const INSTALLED_ID = "LoneCdx01";
/** Restates the installation with a second skill, so applying it is a change. */
const CHANGED_ID = "LoneCdx02";

const SYNTAX_ERROR = renderUnparseableConfigTs();

/** The provider folders a root's `.agents-inc/` holds. */
async function providerFolders(root: string): Promise<string[]> {
  return (await readdir(path.join(root, DIRS.SOURCE_ROOT))).sort();
}

describe("recreating a lone Codex installation", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({ skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() } }),
    );
    store.publish(
      CHANGED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
        },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function homeHolding(provider: "claude" | "codex"): Promise<TestEnvironment> {
    env = await createTestEnvironment();
    const home = { dir: env.fakeHome, globalHome: env.fakeHome };
    const installed =
      provider === "codex"
        ? await runInitFromOnCodex(store, INSTALLED_ID, home, sourceDir)
        : await runInitFrom(store, INSTALLED_ID, home, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return env;
  }

  function runAtHome(environment: TestEnvironment, args: string[]) {
    return CLI.run(args, { dir: environment.fakeHome }, { env: { HOME: environment.fakeHome } });
  }

  it(
    "names Codex in the recreate tip's init half, and following the tip leaves Codex",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const environment = await homeHolding("codex");
      await writeCorruptConfig(environment.fakeHome, SYNTAX_ERROR);

      const doctor = await runAtHome(environment, ["doctor"]);

      expect(flattenCliOutput(doctor.output)).toContain(
        `${CLI_INVOKE_COMMAND} init --from <id> --provider codex'`,
      );

      const uninstalled = await runAtHome(environment, ["uninstall", "--yes"]);
      expect(uninstalled.exitCode, uninstalled.output).toBe(EXIT_CODES.SUCCESS);
      const reinstalled = await runInitFromOnCodex(
        store,
        INSTALLED_ID,
        { dir: environment.fakeHome, globalHome: environment.fakeHome },
        sourceDir,
      );
      expect(reinstalled.exitCode, reinstalled.output).toBe(EXIT_CODES.SUCCESS);

      expect(await providerFolders(environment.fakeHome)).toStrictEqual(["codex"]);
      expect(
        (await loadConfigOrFail(environment.fakeHome)).skills.map(({ id }) => id),
      ).toStrictEqual([E2E_SKILL.react.id]);
    },
  );

  it(
    "control: over a lone Claude installation the tip is bare, and following it leaves Claude",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const environment = await homeHolding("claude");
      await writeCorruptConfig(environment.fakeHome, SYNTAX_ERROR);

      const doctor = await runAtHome(environment, ["doctor"]);

      expect(flattenCliOutput(doctor.output)).toContain(
        `${CLI_INVOKE_COMMAND} init --from <id>' with an id from`,
      );

      const uninstalled = await runAtHome(environment, ["uninstall", "--yes"]);
      expect(uninstalled.exitCode, uninstalled.output).toBe(EXIT_CODES.SUCCESS);
      const reinstalled = await runInitFrom(
        store,
        INSTALLED_ID,
        { dir: environment.fakeHome, globalHome: environment.fakeHome },
        sourceDir,
      );
      expect(reinstalled.exitCode, reinstalled.output).toBe(EXIT_CODES.SUCCESS);

      expect(await providerFolders(environment.fakeHome)).toStrictEqual(["claude"]);
    },
  );

  it(
    "names Codex in the no-terminal refusal's init half, and following it installs Codex in a clean project",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const environment = await homeHolding("codex");

      const refused = await runEditFrom(store, CHANGED_ID, {
        dir: environment.fakeHome,
        globalHome: environment.fakeHome,
      });

      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.ERROR);
      expect(flattenCliOutput(refused.output)).toContain(
        `init --from ${CHANGED_ID} --provider codex' in a clean directory`,
      );

      const cleanProject = path.join(environment.tempDir, "clean-project");
      await mkdir(cleanProject, { recursive: true });
      const followed = await runInitFromOnCodex(
        store,
        CHANGED_ID,
        { dir: cleanProject, globalHome: environment.fakeHome },
        sourceDir,
      );

      expect(followed.exitCode, followed.output).toBe(EXIT_CODES.SUCCESS);
      expect(await providerFolders(cleanProject)).toStrictEqual(["codex"]);
    },
  );
});
