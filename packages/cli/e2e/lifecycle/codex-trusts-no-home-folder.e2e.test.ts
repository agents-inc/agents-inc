import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CODEX_AGENTS_LEFT_OUT,
  codexGlobalAgentsDir,
  codexProjectAgentsDir,
  readCodexAgentRoles,
} from "../fixtures/codex-agent-roles.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { codexConfigFile } from "../fixtures/codex-plugin-switch.js";
import { resetCodexGlobalConfig } from "../fixtures/codex.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  fileExists,
  flattenCliOutput,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * From the home folder, `<home>/.codex/agents` is Codex's global roles folder, which Codex reads
 * without a trust entry; only a project's own roles need one. Each refusal sits beside the
 * project install that is still trusted.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const AT_HOME_ID = "CdxHome01";
const IN_A_PROJECT_ID = "CdxHome02";

const WEB_DEV_ROLE = [`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`];

const THEIR_OWN_CODEX_CONFIG = 'model_reasoning_effort = "high"\n';

describe("Codex trusts no home folder", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    store.publish(
      AT_HOME_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
    store.publish(
      IN_A_PROJECT_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill({ scope: "project" }) },
        agents: { [WEB_DEV]: { scope: "project" } },
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

  async function installedAtHome(home: string): Promise<string> {
    const { exitCode, output } = await runInitFromOnCodex(
      store,
      AT_HOME_ID,
      { dir: home, globalHome: home },
      sourceDir,
    );
    const said = flattenCliOutput(output);
    expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    return said;
  }

  async function theirOwnCodexConfig(home: string): Promise<void> {
    await mkdir(path.dirname(codexConfigFile(home)), { recursive: true });
    await writeFile(codexConfigFile(home), THEIR_OWN_CODEX_CONFIG, "utf-8");
  }

  function expectCodexNoticesSaid(said: string): void {
    for (const leftOut of CODEX_AGENTS_LEFT_OUT) {
      expect(said, "the Codex notices were never reached").toContain(leftOut);
    }
  }

  it(
    "init at home writes the global roles and leaves the user's Codex configuration as they wrote it",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const home = env.fakeHome;
      await theirOwnCodexConfig(home);

      const said = await installedAtHome(home);

      expect(Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(home)))).toStrictEqual(
        WEB_DEV_ROLE,
      );
      expect((await loadConfigOrFail(home)).skills.map(({ id }) => id)).toStrictEqual([
        E2E_SKILL.react.id,
      ]);
      expectCodexNoticesSaid(said);

      expect(
        await readTestFile(codexConfigFile(home)),
        "init added the home folder to Codex's trusted projects",
      ).toBe(THEIR_OWN_CODEX_CONFIG);
      expect(said, "init told the user it trusted the home folder").not.toContain(
        STEP_TEXT.CODEX_PROJECT_TRUSTED,
      );
    },
  );

  it(
    "compile at home, over the global roles, writes no Codex configuration and says nothing about trust",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const home = env.fakeHome;
      await installedAtHome(home);
      // A home whose Codex configuration holds no entry for it, whatever the install wrote.
      await resetCodexGlobalConfig(home);

      const { exitCode, output } = await CLI.run(["compile"], { dir: home, globalHome: home });
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(home)))).toStrictEqual(
        WEB_DEV_ROLE,
      );
      expectCodexNoticesSaid(said);

      expect(
        await fileExists(codexConfigFile(home)),
        "compile created a Codex configuration to trust the home folder",
      ).toBe(false);
      expect(said, "compile told the user it trusted the home folder").not.toContain(
        STEP_TEXT.CODEX_PROJECT_TRUSTED,
      );
    },
  );

  it(
    "control: init in a project under that home still trusts the project, and says so",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const home = env.fakeHome;
      await theirOwnCodexConfig(home);

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        IN_A_PROJECT_ID,
        { dir: env.projectDir, globalHome: home },
        sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(
        Object.keys(await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir))),
      ).toStrictEqual(WEB_DEV_ROLE);
      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUSTED);
      expect(await readTestFile(codexConfigFile(home))).toBe(
        `${THEIR_OWN_CODEX_CONFIG}\n[projects."${env.projectDir}"]\ntrust_level = "trusted"\n`,
      );
    },
  );
});
