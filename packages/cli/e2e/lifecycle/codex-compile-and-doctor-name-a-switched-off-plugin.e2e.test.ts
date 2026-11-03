import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { codexProjectAgentsDir, readCodexAgentRoles } from "../fixtures/codex-agent-roles.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { codexConfigFile, switchOffCodexPlugin } from "../fixtures/codex-plugin-switch.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  flattenCliOutput,
  readTestFile,
} from "../helpers/test-utils.js";
import { doctorRow, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A plugin the user switched off in Codex is left out of the sub-agent and left off, and compile
 * and doctor say it is switched off; the same plugin removed outright is still "not found".
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const WEB_DEV_ROLE = `${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`;

const SWITCHED_OFF_PLUGIN = E2E_SKILL.react.id;
const SWITCHED_ON_PLUGIN = E2E_SKILL.hono.id;

const GLOBAL_PLUGIN_FOR_WEB_DEV = {
  install: "plugin",
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

type CompileThenDoctor = {
  compile: CLIResult;
  roles: Record<string, string>;
  doctor: CLIResult;
};

async function compileThenDoctor(project: ProjectHandle): Promise<CompileThenDoctor> {
  const compile = await CLI.run(["compile"], project);
  const roles = await readCodexAgentRoles(codexProjectAgentsDir(project.dir));
  const doctor = await CLI.run(["doctor"], project);
  return { compile, roles, doctor };
}

describe("compile and doctor over a Codex installation with one of its plugins switched off by the user", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment;

  let switchedOffKey: string;
  let switchedOnKey: string;
  let rolesInstalled: Record<string, string>;
  let listedSwitchedOff: CodexRun;
  let switchedOff: CompileThenDoctor;
  let listedAfterTheRuns: CodexRun;
  let configAfterTheRuns: string;
  let removal: CodexRun;
  let listedRemoved: CodexRun;
  let removed: CompileThenDoctor;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
    env = await createTestEnvironment({ permissions: false });
    const home = env.fakeHome;
    const project = { dir: env.projectDir, globalHome: home };
    switchedOffKey = pluginKeyFor(SWITCHED_OFF_PLUGIN, fixture.marketplaceName);
    switchedOnKey = pluginKeyFor(SWITCHED_ON_PLUGIN, fixture.marketplaceName);

    store.publish(
      "CdxOffNm",
      buildSeedPayload({
        skills: {
          [SWITCHED_OFF_PLUGIN]: buildSeedSkill(GLOBAL_PLUGIN_FOR_WEB_DEV),
          [SWITCHED_ON_PLUGIN]: buildSeedSkill(GLOBAL_PLUGIN_FOR_WEB_DEV),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    const installed = await runInitFromOnCodex(store, "CdxOffNm", project, fixture.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    rolesInstalled = await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir));

    await switchOffCodexPlugin(home, switchedOffKey);
    listedSwitchedOff = await runCodex(home, ["plugin", "list"], home);
    switchedOff = await compileThenDoctor(project);
    listedAfterTheRuns = await runCodex(home, ["plugin", "list"], home);
    configAfterTheRuns = await readTestFile(codexConfigFile(home));

    removal = await runCodex(home, ["plugin", "remove", switchedOffKey], home);
    listedRemoved = await runCodex(home, ["plugin", "list"], home);
    removed = await compileThenDoctor(project);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
    await cleanupTempDir(env.tempDir);
  });

  it("reaches Codex holding both plugins, one switched off, after an install that compiled both into the sub-agent", () => {
    expect(listedSwitchedOff.exitCode, listedSwitchedOff.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(
      listedSwitchedOff.json,
      "Codex must read the plugin as switched off, or nothing here is about a switched-off plugin",
    ).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({ pluginId: switchedOffKey, enabled: false }),
          expect.objectContaining({ pluginId: switchedOnKey, enabled: true }),
        ]),
      },
    ]);
    expect(rolesInstalled[WEB_DEV_ROLE], "the install compiled the plugin in").toContain(
      SWITCHED_OFF_PLUGIN,
    );
    expect(rolesInstalled[WEB_DEV_ROLE]).toContain(SWITCHED_ON_PLUGIN);
  });

  it("compiles the sub-agent without the switched-off plugin, keeping the one left on", () => {
    const { compile, roles } = switchedOff;

    expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
    expect(roles[WEB_DEV_ROLE], "the plugin left on stays in the sub-agent").toContain(
      SWITCHED_ON_PLUGIN,
    );
    expect(roles[WEB_DEV_ROLE], "a switched-off plugin is left out").not.toContain(
      SWITCHED_OFF_PLUGIN,
    );
  });

  it("has compile say the plugin is switched off, rather than that the skill was not found", () => {
    const said = flattenCliOutput(switchedOff.compile.output);

    expect(said).toContain(
      `Skill '${SWITCHED_OFF_PLUGIN}' ${STEP_TEXT.SKILL_PLUGIN_SWITCHED_OFF_WARNING}`,
    );
    expect(said).not.toContain(`'${SWITCHED_OFF_PLUGIN}' ${STEP_TEXT.SKILL_NOT_FOUND_WARNING}`);
    expect(said, "a plugin left on is not warned about").not.toContain(`'${SWITCHED_ON_PLUGIN}'`);
  });

  it("has doctor name the plugin as switched off in its plugins row, as a warning", () => {
    const { doctor } = switchedOff;

    expect(doctor.exitCode, doctor.stdout).toBe(EXIT_CODES.SUCCESS);
    expect(doctor.stdout).toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED,
        STEP_TEXT.DOCTOR_STATUS_WARN,
        `${STEP_TEXT.DOCTOR_ONE_PLUGIN_SWITCHED_OFF}\n`,
      ),
    );
    expect(doctor.stdout).toContain(
      `- ${SWITCHED_OFF_PLUGIN} ${STEP_TEXT.DOCTOR_PLUGIN_SWITCHED_OFF}\n`,
    );
    expect(doctor.stdout).not.toContain(STEP_TEXT.DOCTOR_NO_ENABLED_PLUGIN_FOUND);
    expect(doctor.stdout, "a plugin left on is not listed").not.toContain(
      `- ${SWITCHED_ON_PLUGIN} `,
    );
  });

  it("leaves the plugin switched off in Codex after both runs", () => {
    expect(listedAfterTheRuns.exitCode, listedAfterTheRuns.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(
      listedAfterTheRuns.json,
      "the user switched this plugin off; nothing a compile or a doctor run does switches it on",
    ).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({ pluginId: switchedOffKey, enabled: false }),
        ]),
      },
    ]);
    expect(configAfterTheRuns).toContain(`[plugins."${switchedOffKey}"]\nenabled = false`);
  });

  it("still says a plugin removed outright was not found, in compile and in doctor", () => {
    const { compile, roles, doctor } = removed;

    expect(removal.exitCode, removal.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(
      listedRemoved.json,
      "Codex holds the plugin left on, and no longer the one removed",
    ).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({ pluginId: switchedOnKey, enabled: true }),
        ]),
      },
    ]);
    expect(listedRemoved.json).toMatchObject([
      {
        installed: expect.not.arrayContaining([
          expect.objectContaining({ pluginId: switchedOffKey }),
        ]),
      },
    ]);

    const said = flattenCliOutput(compile.output);
    expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
    expect(said).toContain(`Skill '${SWITCHED_OFF_PLUGIN}' ${STEP_TEXT.SKILL_NOT_FOUND_WARNING}`);
    expect(said).not.toContain(STEP_TEXT.SKILL_PLUGIN_SWITCHED_OFF_WARNING);
    expect(roles[WEB_DEV_ROLE]).toContain(SWITCHED_ON_PLUGIN);
    expect(roles[WEB_DEV_ROLE]).not.toContain(SWITCHED_OFF_PLUGIN);

    expect(doctor.exitCode, doctor.stdout).toBe(EXIT_CODES.SUCCESS);
    expect(doctor.stdout).toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED,
        STEP_TEXT.DOCTOR_STATUS_WARN,
        `${STEP_TEXT.DOCTOR_ONE_SKILL_NOT_INSTALLED_AS_A_PLUGIN}\n`,
      ),
    );
    expect(doctor.stdout).toContain(
      `- ${SWITCHED_OFF_PLUGIN} ${STEP_TEXT.DOCTOR_NO_ENABLED_PLUGIN_FOUND}\n`,
    );
    expect(doctor.stdout).not.toContain(STEP_TEXT.DOCTOR_PLUGIN_SWITCHED_OFF);
  });
});
