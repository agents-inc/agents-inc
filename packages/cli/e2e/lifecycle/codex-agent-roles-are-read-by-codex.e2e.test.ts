import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { isCodexCLIAvailable, resetCodexGlobalConfig, runCodex } from "../fixtures/codex.js";
import {
  assistantMessage,
  respondWith,
  startCodexResponsesMock,
  type CodexResponsesMock,
} from "../fixtures/codex-responses-mock.js";
import {
  codexGlobalAgentsDir,
  codexProjectAgentsDir,
  firstRequestOf,
  readCodexAgentRoles,
  readOnlyExecArgs,
  ROSTER_HEADING,
  ROSTER_PARAMETER,
  trustProjectInCodexGlobalConfig,
} from "../fixtures/codex-agent-roles.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  codexHome,
  flattenCliOutput,
} from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * The pinned Codex binary reads the role files we wrote: the role is in `spawn_agent`'s
 * `agent_type` roster on the wire (absent when nothing is registered), and `codex doctor` reports
 * no malformed role. The role id is the `name` key, not the filename. A project's roles need a
 * trust entry in the global config, which the install writes; an answer the user gave is kept.
 * No `skipIf`: Codex is a pinned devDependency, and a skip would read green.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

// Pinned to the project so scope is not a second variable.
const PINNED_TO_PROJECT = { scope: "project" } as const;

const CODEX_CONFIG_TOML = "config.toml";

function codexGlobalConfig(home: string): string {
  return path.join(codexHome(home), CODEX_CONFIG_TOML);
}

async function writeCodexGlobalConfig(home: string, content: string): Promise<void> {
  await mkdir(codexHome(home), { recursive: true });
  await writeFile(codexGlobalConfig(home), content, "utf-8");
}

/** Irrelevant; the request body is the subject. */
const ANY_PROMPT = "summarise this repository";

describe("Codex reads the agent roles a Codex compile wrote", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let mock: CodexResponsesMock | undefined;

  beforeAll(async () => {
    expect(
      await isCodexCLIAvailable(),
      "the pinned @openai/codex binary did not run — this lane never skips, so this is a failure",
    ).toBe(true);

    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await mock?.close();
    mock = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function whatCodexSent(home: string, cwd: string): Promise<string> {
    mock = await startCodexResponsesMock((_request, requestNumber) =>
      respondWith(requestNumber, (responseId) => [assistantMessage(responseId, "ok")]),
    );

    const run = await runCodexExec(home, cwd, mock);
    expect(run.exitCode, run.stderr).toBe(EXIT_CODES.SUCCESS);

    return firstRequestOf(mock);
  }

  function runCodexExec(home: string, cwd: string, against: CodexResponsesMock) {
    return runCodex(home, readOnlyExecArgs(against, ANY_PROMPT), cwd);
  }

  function publishGlobal(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
  }

  /** The one that needs a trust entry to be read at all. */
  function publishProject(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );
  }

  it(
    "offers no roles at all before an install, which is what makes the next test mean something",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await resetCodexGlobalConfig(env.fakeHome);

      const sent = await whatCodexSent(env.fakeHome, env.projectDir);

      expect(sent).toContain("spawn_agent");
      expect(
        sent,
        "spawn_agent already offers agent_type with nothing installed — the calibration is broken",
      ).not.toContain(ROSTER_PARAMETER);
    },
  );

  it(
    "offers the compiled sub-agent as a role once a global install has written it",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishGlobal("CdxRead1");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRead1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      await resetCodexGlobalConfig(env.fakeHome);

      const sent = await whatCodexSent(env.fakeHome, env.projectDir);

      expect(sent).toContain(ROSTER_PARAMETER);
      expect(sent).toContain(ROSTER_HEADING);
      expect(sent, `${WEB_DEV} is not among the roles Codex offers the model`).toContain(WEB_DEV);
    },
  );

  it(
    "takes the role id from the file's name key, not from the file it is written to",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishGlobal("CdxRead2");

      await runInitFromOnCodex(
        store,
        "CdxRead2",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );

      const roles = await readCodexAgentRoles(codexGlobalAgentsDir(env.fakeHome));
      const onlyRole = Object.values(roles)[0];

      expect(Object.keys(roles)).toStrictEqual([`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`]);
      expect(onlyRole, "the role file carries no name key, so Codex drops it whole").toContain(
        `name = "${WEB_DEV}"`,
      );
    },
  );

  it(
    "writes a role Codex reports no complaint about",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishGlobal("CdxRead3");

      await runInitFromOnCodex(
        store,
        "CdxRead3",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );

      // Subject guard: an empty agents directory draws no complaint either.
      expect(
        Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(env.fakeHome))),
        "the compile wrote no role file, so Codex had nothing to complain about",
      ).toStrictEqual([`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`]);

      const doctor = await runCodex(env.fakeHome, ["doctor"], env.projectDir);
      const reported = JSON.stringify(doctor.json);

      // `codex doctor --json` exits 1 here (no auth), so the report is read, not the exit code.
      expect(reported, `codex doctor printed no report: ${doctor.stderr}`).toContain(
        "schemaVersion",
      );

      // A malformed role bumps the total and leaves every category counter at 0.
      expect(reported).not.toContain("malformed agent role definition");
      expect(reported).not.toContain("must define `developer_instructions`");
      expect(reported).not.toContain("unknown field");
    },
  );

  /** The install trusts the project itself and says what it wrote; nothing is trusted by hand. */
  it(
    "trusts a project at install, says what it wrote, and Codex then offers the project's roles",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishProject("CdxRead4");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRead4",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(
        Object.keys(await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir))),
      ).toStrictEqual([`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`]);
      expect(await readFile(codexGlobalConfig(env.fakeHome), "utf-8")).toContain(
        `[projects."${env.projectDir}"]\ntrust_level = "trusted"`,
      );

      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUSTED);
      expect(said).toContain(env.projectDir);

      const sent = await whatCodexSent(env.fakeHome, env.projectDir);
      expect(sent).toContain(ROSTER_PARAMETER);
      expect(sent).toContain(WEB_DEV);
    },
  );

  /** `"untrusted"` is the user's decision: the install leaves it, and Codex offers no roles. */
  it(
    "leaves a project the user marked untrusted as it is, says so, and Codex offers nothing",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishProject("CdxRead5");
      const theirAnswer = `[projects."${env.projectDir}"]\ntrust_level = "untrusted"\n`;
      await writeCodexGlobalConfig(env.fakeHome, theirAnswer);

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRead5",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(await readFile(codexGlobalConfig(env.fakeHome), "utf-8")).toContain(theirAnswer);
      expect(await readFile(codexGlobalConfig(env.fakeHome), "utf-8")).not.toContain(
        'trust_level = "trusted"',
      );
      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_LEFT);

      const sent = await whatCodexSent(env.fakeHome, env.projectDir);
      expect(sent).not.toContain(ROSTER_PARAMETER);
    },
  );

  /**
   * The user's own table for this project: a second `[projects."<dir>"]` would be a duplicate Codex
   * refuses, so the key lands inside theirs.
   */
  it(
    "adds the trust inside the user's own table for the project, which Codex still reads",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishProject("CdxRead7");
      await writeCodexGlobalConfig(
        env.fakeHome,
        `[projects."${env.projectDir}"]\nsandbox_mode = "read-only"\n`,
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRead7",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const written = await readFile(codexGlobalConfig(env.fakeHome), "utf-8");
      expect(written.split(`[projects."${env.projectDir}"]`)).toHaveLength(2);
      expect(written).toContain('sandbox_mode = "read-only"');

      const sent = await whatCodexSent(env.fakeHome, env.projectDir);
      expect(sent).toContain(ROSTER_PARAMETER);
      expect(sent).toContain(WEB_DEV);
    },
  );

  it(
    "says nothing about trust once the entry is there, so the notice is a state rather than a banner",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishProject("CdxRead6");
      await trustProjectInCodexGlobalConfig(env.fakeHome, env.projectDir);

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRead6",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(said).not.toContain("trust");
    },
  );
});
