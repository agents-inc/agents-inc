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
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from <id>` with no terminal — a CI job or a script — prints the same two lists a
 * terminal run shows before its question, and then carries on without asking.
 *
 * There is nobody to answer, and `init --from` is the one install a pipeline can run, so it does
 * not stop; but what it put where is still worth a line in the job's log, and it is the same
 * statement the terminal run asks about. A run that asked here would hang or cancel a pipeline,
 * which is why the question's absence is asserted beside the lists.
 *
 * The terminal half is `interactive/init-from-lists-then-asks`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_SKILL = E2E_SKILL.react.id;
const GLOBAL_SKILL = E2E_SKILL.vitest.id;

const SPLIT_ID = "ListCi01";
const ALL_GLOBAL_ID = "ListCi02";

const ANYTHING = "[\\s\\S]*";
const PROJECT_LIST = STEP_TEXT.SHARED_CONFIG_LIST_PROJECT;
const GLOBAL_LIST = STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL;

/** The project's own skill and sub-agent, under the project heading and before the global one. */
const PROJECT_SKILL_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${PROJECT_SKILL}${ANYTHING}${GLOBAL_LIST}`,
);
const PROJECT_AGENT_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${WEB_DEV}${ANYTHING}${GLOBAL_LIST}`,
);
/** The global skill and sub-agent, under the global heading. */
const GLOBAL_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${GLOBAL_SKILL}`);
const GLOBAL_AGENT_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${API_DEV}`);

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

  it("prints what goes into the project and what into the global install, and installs without asking", async () => {
    env = await createTestEnvironment();

    const { exitCode, output } = await runInitFrom(
      store,
      SPLIT_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toMatch(PROJECT_SKILL_LISTED_HERE);
    expect(output).toMatch(PROJECT_AGENT_LISTED_HERE);
    expect(output).toMatch(GLOBAL_SKILL_LISTED_GLOBALLY);
    expect(output).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
    // The lists matched above are the subject guard for this negative: the same output carries
    // the statement, and nothing in it asks a question nobody is there to answer.
    expect(output, "with no terminal there is nobody to ask").not.toContain(
      STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM,
    );

    // It carried on: both halves are installed, each at its own scope.
    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(
      projectConfig.skills.filter((skill) => skill.scope === "project").map((s) => s.id),
    ).toStrictEqual([PROJECT_SKILL]);
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${API_DEV}.md`]);
  });

  it("prints only the global list at the home directory", async () => {
    env = await createTestEnvironment();

    const { exitCode, output } = await runInitFrom(
      store,
      ALL_GLOBAL_ID,
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toMatch(GLOBAL_SKILL_LISTED_GLOBALLY);
    expect(output).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
    // The global list above is the subject guard: the home directory has no project to list.
    expect(output, "the home directory is the global install, so no project list").not.toContain(
      PROJECT_LIST,
    );

    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
  });
});
