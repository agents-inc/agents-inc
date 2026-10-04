import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from <id>` at a terminal: the confirm it already asks also says what goes into the
 * project and what into the global install.
 *
 * The question was always there, because the apply is destructive; what it showed was only the
 * removals. A configuration that brings a global skill and a global sub-agent with it reaches the
 * user's own global install, which every project on the machine reads, so the entries arriving
 * there are listed under their own heading beside the ones arriving in the project — the same two
 * lists `init --from` prints. At the home directory the run edits the global install itself, so
 * only the global list is printed.
 *
 * The question is waited on directly: it is asked today, and the lists are what is missing. The
 * no-terminal refusal is unchanged and stays pinned in `interactive/edit-from-apply-that-removes-nothing`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** Installed in the project before the apply, and kept by it. */
const PROJECT_SKILL = E2E_SKILL.react.id;
/** What the apply adds to the project. */
const NEW_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;
/** What the apply brings to the global install, on a global sub-agent it brings too. */
const NEW_GLOBAL_SKILL = E2E_SKILL.vitest.id;
/** Installed in the global install before the home-directory apply, and kept by it. */
const GLOBAL_SKILL = E2E_SKILL.vitest.id;
/** What the home-directory apply adds to the global install. */
const ANOTHER_GLOBAL_SKILL = E2E_SKILL["research-methodology"].id;

const PROJECT_INSTALLED_ID = "ListEdit01";
const PROJECT_APPLY_ID = "ListEdit02";
const HOME_INSTALLED_ID = "ListEdit03";
const HOME_APPLY_ID = "ListEdit04";

const ANYTHING = "[\\s\\S]*";
const PROJECT_LIST = STEP_TEXT.SHARED_CONFIG_LIST_PROJECT;
const GLOBAL_LIST = STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL;

/** What the project gains, under the project heading and before the global one. */
const NEW_PROJECT_SKILL_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${NEW_PROJECT_SKILL}${ANYTHING}${GLOBAL_LIST}`,
);
const PROJECT_AGENT_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${WEB_DEV}${ANYTHING}${GLOBAL_LIST}`,
);
/** What the global install gains, under the global heading. */
const NEW_GLOBAL_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${NEW_GLOBAL_SKILL}`);
const GLOBAL_AGENT_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${API_DEV}`);
const ANOTHER_GLOBAL_SKILL_LISTED_GLOBALLY = new RegExp(
  `${GLOBAL_LIST}${ANYTHING}${ANOTHER_GLOBAL_SKILL}`,
);
/** The project's new skill printed after the global heading — under the wrong destination. */
const NEW_PROJECT_SKILL_LISTED_GLOBALLY = new RegExp(
  `${GLOBAL_LIST}${ANYTHING}${NEW_PROJECT_SKILL}`,
);

const onWebDeveloper = buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } });
const onApiDeveloper = buildSeedSkill({ scope: "global", assignments: { [API_DEV]: "lazy" } });

describe("edit --from <id> at a terminal lists what goes where in its confirm", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();

    store.publish(
      PROJECT_INSTALLED_ID,
      buildSeedPayload({
        skills: { [PROJECT_SKILL]: onWebDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "project" } },
      }),
    );
    store.publish(
      PROJECT_APPLY_ID,
      buildSeedPayload({
        skills: {
          [PROJECT_SKILL]: onWebDeveloper,
          [NEW_PROJECT_SKILL]: onWebDeveloper,
          [NEW_GLOBAL_SKILL]: onApiDeveloper,
        },
        agents: {
          [WEB_DEV]: { on: true, scope: "project" },
          [API_DEV]: { on: true, scope: "global" },
        },
      }),
    );
    store.publish(
      HOME_INSTALLED_ID,
      buildSeedPayload({
        skills: { [GLOBAL_SKILL]: onApiDeveloper },
        agents: { [API_DEV]: { on: true, scope: "global" } },
      }),
    );
    store.publish(
      HOME_APPLY_ID,
      buildSeedPayload({
        skills: { [GLOBAL_SKILL]: onApiDeveloper, [ANOTHER_GLOBAL_SKILL]: onApiDeveloper },
        agents: { [API_DEV]: { on: true, scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** An installation made by `init --from` at `dir`, under a HOME of its own. */
  async function installFrom(id: string, at: "project" | "home"): Promise<TestEnvironment> {
    const environment = await createTestEnvironment();
    env = environment;
    const dir = at === "project" ? environment.projectDir : environment.fakeHome;

    const installed = await runInitFrom(
      store,
      id,
      { dir, globalHome: environment.fakeHome },
      sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return environment;
  }

  /** Opens `edit --from <id>` at a real terminal, and what it showed with its question. */
  async function openApply(
    id: string,
    cwd: string,
    home: string,
  ): Promise<{ session: InteractivePrompt; planned: string }> {
    const session = new InteractivePrompt(["edit", "--from", id], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
    prompt = session;
    await session.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    return { session, planned: session.getOutput() };
  }

  it(
    "lists what goes into the project and what into the global install, from a project",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(PROJECT_INSTALLED_ID, "project");

      const { session, planned } = await openApply(
        PROJECT_APPLY_ID,
        environment.projectDir,
        environment.fakeHome,
      );

      expect(planned).toMatch(NEW_PROJECT_SKILL_LISTED_HERE);
      expect(planned).toMatch(PROJECT_AGENT_LISTED_HERE);
      expect(planned).toMatch(NEW_GLOBAL_SKILL_LISTED_GLOBALLY);
      expect(planned).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
      expect(
        planned,
        "a project-scoped skill must not be listed as going into the global install",
      ).not.toMatch(NEW_PROJECT_SKILL_LISTED_GLOBALLY);

      // Still the same question, and still answerable: the lists join it rather than replace it.
      await session.deny();
      expect(await session.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    },
  );

  it(
    "lists only the global install at the home directory",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(HOME_INSTALLED_ID, "home");

      const { session, planned } = await openApply(
        HOME_APPLY_ID,
        environment.fakeHome,
        environment.fakeHome,
      );

      expect(planned).toMatch(ANOTHER_GLOBAL_SKILL_LISTED_GLOBALLY);
      expect(planned).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
      // The global list matched above is the positive subject guard: the same frame carries the
      // lists, and the home directory has no project to list.
      expect(planned, "the home directory is the global install, so no project list").not.toContain(
        PROJECT_LIST,
      );

      await session.deny();
      expect(await session.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    },
  );
});
