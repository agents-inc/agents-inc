import { writeFile } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import {
  DIRS,
  doctorRow,
  EXIT_CODES,
  FILES,
  HOME_SHORTHAND,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * In a project holding a Claude and a Codex installation, the global Codex config is read only by
 * the Codex block, so that block is where a global Codex config that cannot be loaded is named.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const EJECTED_INTO_THE_PROJECT = {
  install: "eject",
  scope: "project",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

const EJECTED_INTO_HOME = {
  install: "eject",
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

describe("doctor in a project holding a Claude and a Codex installation, under a global Codex installation", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment;

  let readable: CLIResult;
  let unreadable: CLIResult;
  let homeCodexConfig: string;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const home = { dir: env.fakeHome, globalHome: env.fakeHome };

    const inTheProject = buildSeedPayload({
      skills: { [E2E_SKILL.react.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT) },
      agents: { [WEB_DEV]: { scope: "project" } },
    });
    store.publish("ClaudePrj", inTheProject);
    store.publish("CodexPrj", inTheProject);
    store.publish(
      "CodexHom",
      buildSeedPayload({
        skills: { [E2E_SKILL.hono.id]: buildSeedSkill(EJECTED_INTO_HOME) },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );

    for (const install of [
      () => runInitFrom(store, "ClaudePrj", project, sourceDir),
      () => runInitFromOnCodex(store, "CodexPrj", project, sourceDir),
      () => runInitFromOnCodex(store, "CodexHom", home, sourceDir),
    ]) {
      const installed = await install();
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    }

    readable = await CLI.run(["doctor"], project);

    homeCodexConfig = path.join(env.fakeHome, DIRS.SOURCE_CODEX, FILES.CONFIG_TS);
    await writeFile(homeCodexConfig, renderUnparseableConfigTs());
    unreadable = await CLI.run(["doctor"], project);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
    await cleanupTempDir(env.tempDir);
  });

  it("passes the Codex block's Config Valid and reads its placements while the global Codex config loads", () => {
    expect(readable.stdout).toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_INSTALLATIONS,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        `2 ${STEP_TEXT.DOCTOR_INSTALLATIONS_EACH_CHECKED}`,
      ),
    );
    expect(readable.stdout).toMatch(
      new RegExp(
        `The codex installation\\n\\s+${
          doctorRow(
            STEP_TEXT.DOCTOR_CONFIG_CHECK,
            STEP_TEXT.DOCTOR_STATUS_PASS,
            `${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}\n`,
          ).source
        }`,
      ),
    );
    expect(readable.stdout).toMatch(
      new RegExp(
        `The codex installation[\\s\\S]*${
          doctorRow(
            STEP_TEXT.DOCTOR_ROW_PLACEMENTS,
            STEP_TEXT.DOCTOR_STATUS_PASS,
            STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE,
          ).source
        }`,
      ),
    );
  });

  it("fails the Codex block's Config Valid naming the global Codex config it cannot load, and exits 1", () => {
    expect(unreadable.stdout).toMatch(
      new RegExp(
        `The codex installation\\n\\s+${
          doctorRow(
            STEP_TEXT.DOCTOR_CONFIG_CHECK,
            STEP_TEXT.DOCTOR_STATUS_FAIL,
            `${STEP_TEXT.DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION} ${HOME_SHORTHAND}/${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS} ${STEP_TEXT.DOCTOR_CONFIG_UNREADABLE}\n`,
          ).source
        }`,
      ),
    );
    expect(unreadable.stdout, "the reason names the file the loader could not read").toContain(
      `${STEP_TEXT.CONFIG_LOAD_REASON} '${homeCodexConfig}'`,
    );
    expect(unreadable.exitCode, unreadable.stdout).toBe(EXIT_CODES.ERROR);
  });

  it("stands down the Codex block's placements, which read the global Codex config", () => {
    expect(unreadable.stdout).toMatch(
      new RegExp(
        `The codex installation[\\s\\S]*${
          doctorRow(
            STEP_TEXT.DOCTOR_ROW_PLACEMENTS,
            STEP_TEXT.DOCTOR_STATUS_SKIP,
            STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID,
          ).source
        }`,
      ),
    );
  });

  it("leaves the Claude block as it was, since it reads no Codex config", () => {
    expect(unreadable.stdout).toMatch(
      new RegExp(
        `The claude installation\\n\\s+${
          doctorRow(
            STEP_TEXT.DOCTOR_CONFIG_CHECK,
            STEP_TEXT.DOCTOR_STATUS_PASS,
            `${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}\n`,
          ).source
        }[\\s\\S]*?${
          doctorRow(
            STEP_TEXT.DOCTOR_ROW_PLACEMENTS,
            STEP_TEXT.DOCTOR_STATUS_PASS,
            STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE,
          ).source
        }[\\s\\S]*The codex installation`,
      ),
    );
  });
});
