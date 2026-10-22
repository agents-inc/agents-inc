import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { agentsPath, cleanupTempDir, listFiles, loadConfigOrFail } from "../helpers/test-utils.js";
import { ADDED_MARKER, EXIT_CODES, STEP_TEXT, panelRow } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` with no terminal prints the panel a terminal run shows at its question, then
 * installs without asking. The terminal half is `interactive/init-from-lists-then-asks`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_SKILL = E2E_SKILL.react.id;
const GLOBAL_SKILL = E2E_SKILL.vitest.id;

const SPLIT_ID = "ListCi01";
const ALL_GLOBAL_ID = "ListCi02";

const PROJECT = STEP_TEXT.PANEL_PROJECT_SCOPE;
const GLOBAL = STEP_TEXT.PANEL_GLOBAL_SCOPE;
const PROJECT_SKILL_ROW = panelRow(ADDED_MARKER, E2E_SKILL.react.display);
const PROJECT_AGENT_ROW = panelRow(ADDED_MARKER, WEB_DEV);
const GLOBAL_SKILL_ROW = panelRow(ADDED_MARKER, E2E_SKILL.vitest.display);
const GLOBAL_AGENT_ROW = panelRow(ADDED_MARKER, API_DEV);

describe("init --from <id> with no terminal", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();

    store.publish(
      SPLIT_ID,
      buildSeedPayload({
        skills: {
          [PROJECT_SKILL]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [GLOBAL_SKILL]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
      }),
    );
    store.publish(
      ALL_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          [GLOBAL_SKILL]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [API_DEV]: { scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("prints the panel of what goes into the project and what into the global install, and installs without asking", async () => {
    env = await createTestEnvironment();

    const { exitCode, output } = await runInitFrom(
      store,
      SPLIT_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    // Present first: an ordering against a missing row reads -1, which passes for nothing.
    for (const shown of [
      PROJECT,
      GLOBAL,
      PROJECT_SKILL_ROW,
      PROJECT_AGENT_ROW,
      GLOBAL_SKILL_ROW,
      GLOBAL_AGENT_ROW,
    ]) {
      expect(output).toContain(shown);
    }
    // One row per scope in each column, so a row's line falls between its scope's labels.
    expect(output.indexOf(PROJECT)).toBeLessThan(output.indexOf(PROJECT_SKILL_ROW));
    expect(output.indexOf(PROJECT_SKILL_ROW)).toBeLessThan(output.indexOf(GLOBAL));
    expect(output.indexOf(PROJECT_AGENT_ROW)).toBeLessThan(output.indexOf(GLOBAL));
    expect(output.indexOf(GLOBAL)).toBeLessThan(output.indexOf(GLOBAL_SKILL_ROW));
    expect(output.indexOf(GLOBAL)).toBeLessThan(output.indexOf(GLOBAL_AGENT_ROW));
    // The panel above is the subject guard for this negative.
    expect(output, "with no terminal there is nobody to ask").not.toContain(
      STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM,
    );

    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(
      projectConfig.skills.filter((skill) => skill.scope === "project").map((s) => s.id),
    ).toStrictEqual([PROJECT_SKILL]);
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${API_DEV}.md`]);
  });

  it("prints only the global install in the panel at the home directory", async () => {
    env = await createTestEnvironment();

    const { exitCode, output } = await runInitFrom(
      store,
      ALL_GLOBAL_ID,
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(GLOBAL);
    expect(output).toContain(GLOBAL_SKILL_ROW);
    expect(output).toContain(GLOBAL_AGENT_ROW);
    // The Global rows above are the subject guard.
    expect(output, "the home directory is the global install, so no Project").not.toContain(
      PROJECT,
    );

    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
  });
});
