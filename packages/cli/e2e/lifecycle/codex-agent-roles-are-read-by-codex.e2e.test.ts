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
 * The claim no file on disk can settle: **Codex reads what we wrote.**
 *
 * Every assertion here asks the PINNED `@openai/codex` 0.155.1 rather than this CLI. A role file
 * that is well-formed to us and malformed to Codex is dropped at startup with a warning nothing in
 * a normal run shows — so "the file is there" and "the sub-agent exists" are different claims, and
 * only the second one matters.
 *
 * **Two instruments, and neither is `debug prompt-input`.** That subcommand does NOT list agent
 * roles, which is what made an earlier pass in this programme conclude they did not exist at all.
 * What this file uses instead:
 *
 * 1. **The roster on the wire.** The installed roles travel in `spawn_agent`'s `agent_type`
 *    parameter description, under `Available roles:`, inside an `additional_tools` item of the
 *    Responses request body. The real binary composes one turn against a scripted stand-in and the
 *    spec reads what it sent. Calibrated BOTH WAYS in every test: with nothing registered,
 *    `agent_type` is absent from `spawn_agent` entirely — so an assertion that a role is present
 *    cannot pass on a rig that is simply not looking.
 * 2. **`codex doctor`'s startup warnings.** A malformed role bumps the TOTAL and leaves every
 *    named counter at zero — skills, hooks, plugins, MCP and deprecated all stay 0 — so the check
 *    reads the total and the messages and never a category counter.
 *
 * **The role id is the `name` key, not the filename.** Measured twice on 0.155.1, 2026-09-22: a
 * global role written to `web-developer-role.toml` whose `name` was `web-developer` reached the
 * roster as `web-developer`, and a project role in `anything.toml` whose `name` was `proj-role`
 * reached it as `proj-role`. The spec below asserts the roster names the AGENT, and separately
 * that the file's own `name` key carries it — those are the two halves that make the id claim
 * checkable without pinning a filename convention Codex does not care about.
 *
 * **A project's roles need a trust entry in the user's GLOBAL config, and the install writes it.**
 * Four silent kill switches, each measured across one sweep: no `[projects]` entry;
 * `trust_level = "untrusted"`; a trailing slash on the path key; and the entry declared in the
 * project's OWN `.codex/config.toml`, which Codex refuses as self-authorisation. All four register
 * nothing, with no warning anywhere. So the install writes the entry and prints what it wrote
 * (owner, 2026-09-26, CLI-893), and leaves an answer the user already gave. _Until then it only
 * detected the state and printed the line for the user to add._
 *
 * **What no offline rig can answer, and what therefore goes on the owner's hand-check list rather
 * than into an assertion here:** whether a SPAWNED sub-agent's context actually receives its
 * `developer_instructions`, whole and untruncated, and where they sit against Codex's own prompt,
 * `AGENTS.md` and skills. Registration is provable offline; delivery is not.
 *
 * NOTE: this file drives the real pinned binary. It carries no `skipIf` — Codex is a devDependency
 * at one exact version, so it is present wherever `bun install` ran, and a skip would read green.
 *
 * Written before the Codex agent renderer existed. Red on an empty agents directory, and on
 * `agent_type` never appearing.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry keeping its agent in the project, so scope is not a second variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** Codex's own global configuration file, spelled as every other Codex spec spells it. */
const CODEX_CONFIG_TOML = "config.toml";

function codexGlobalConfig(home: string): string {
  return path.join(codexHome(home), CODEX_CONFIG_TOML);
}

/** A global Codex config the user wrote before this CLI ever ran. */
async function writeCodexGlobalConfig(home: string, content: string): Promise<void> {
  await mkdir(codexHome(home), { recursive: true });
  await writeFile(codexGlobalConfig(home), content, "utf-8");
}

/** The prompt each turn carries. Its content is irrelevant; the request body is the subject. */
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

  /** One turn against the mock, returning everything the binary put on the wire. */
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

  /** The global-scope payload: one ejected skill, one sub-agent, both resting at global. */
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

  /** The project-scope payload, which is the one that needs a trust entry to be read at all. */
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

      // Subject guard: an empty agents directory draws no complaint either, which is the state
      // this spec was written against and would otherwise read as a clean bill of health.
      expect(
        Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(env.fakeHome))),
        "the compile wrote no role file, so Codex had nothing to complain about",
      ).toStrictEqual([`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`]);

      const doctor = await runCodex(env.fakeHome, ["doctor"], env.projectDir);
      const reported = JSON.stringify(doctor.json);

      // `codex doctor --json` exits 1 in this rig whatever the roles look like — its `auth` check
      // fails with no credentials — so the report is read and the exit code is not. A run that
      // printed nothing would satisfy every negative below.
      expect(reported, `codex doctor printed no report: ${doctor.stderr}`).toContain(
        "schemaVersion",
      );

      // The TOTAL and the messages. A malformed agent role bumps the total and leaves
      // `startup warning skills/hooks/plugins/MCP/deprecated` all at 0, so a category counter
      // cannot see it.
      expect(reported).not.toContain("malformed agent role definition");
      expect(reported).not.toContain("must define `developer_instructions`");
      expect(reported).not.toContain("unknown field");
    },
  );

  /**
   * **The install trusts the project itself, and says what it wrote** — owner, 2026-09-26: _"it
   * should be automated on install"_ (CLI-893). This case asserted the opposite until then: that
   * the CLI left the user's global config alone and printed the line for them to add. Nothing is
   * trusted by hand here, so Codex offering the role is the install's own doing.
   */
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

      // It said so, naming the project and the file it wrote into.
      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUSTED);
      expect(said).toContain(env.projectDir);

      // And Codex agrees: the role is on the wire with no trust written by hand.
      const sent = await whatCodexSent(env.fakeHome, env.projectDir);
      expect(sent).toContain(ROSTER_PARAMETER);
      expect(sent).toContain(WEB_DEV);
    },
  );

  /**
   * An answer the user already gave is theirs. `"untrusted"` is a decision, not a gap, so the
   * install leaves it, says so — and Codex, reading that answer, offers no roles.
   */
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
   * The user's own table for this project, holding something other than trust. A second
   * `[projects."<dir>"]` table is a duplicate Codex refuses to load — every setting in the file
   * with it — so the key has to land inside theirs. Codex offering the role is the proof it parsed.
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
