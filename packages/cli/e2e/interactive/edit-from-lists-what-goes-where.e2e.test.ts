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
import {
  ADDED_MARKER,
  CHANGED_MARKER,
  EXIT_CODES,
  STEP_TEXT,
  TIMEOUTS,
  panelRow,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from`'s confirm shows the panel: what goes into the project under Project and what into
 * the global install under Global, as `init --from` does; at home only Global. The no-terminal
 * refusal stays in `interactive/edit-from-apply-that-removes-nothing`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_SKILL = E2E_SKILL.react.id;
const NEW_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;
const NEW_GLOBAL_SKILL = E2E_SKILL.vitest.id;
const GLOBAL_SKILL = E2E_SKILL.vitest.id;
const ANOTHER_GLOBAL_SKILL = E2E_SKILL["research-methodology"].id;

const PROJECT_INSTALLED_ID = "ListEdit01";
const PROJECT_APPLY_ID = "ListEdit02";
const HOME_INSTALLED_ID = "ListEdit03";
const HOME_APPLY_ID = "ListEdit04";

const PROJECT = STEP_TEXT.PANEL_PROJECT_SCOPE;
const GLOBAL = STEP_TEXT.PANEL_GLOBAL_SCOPE;
const NEW_PROJECT_SKILL_ROW = panelRow(ADDED_MARKER, E2E_SKILL["visual-regression"].display);
const NEW_GLOBAL_SKILL_ROW = panelRow(ADDED_MARKER, E2E_SKILL.vitest.display);
const ANOTHER_GLOBAL_SKILL_ROW = panelRow(ADDED_MARKER, E2E_SKILL["research-methodology"].display);
const GLOBAL_AGENT_ROW = panelRow(ADDED_MARKER, API_DEV);
const CHANGED_PROJECT_AGENT_ROW = panelRow(CHANGED_MARKER, WEB_DEV);
const CHANGED_GLOBAL_AGENT_ROW = panelRow(CHANGED_MARKER, API_DEV);

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
    "shows what goes into the project under Project and what into the global install under Global, from a project",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(PROJECT_INSTALLED_ID, "project");

      const { session, planned } = await openApply(
        PROJECT_APPLY_ID,
        environment.projectDir,
        environment.fakeHome,
      );

      // Present first: an ordering against a missing row reads -1, which passes for nothing.
      for (const shown of [
        PROJECT,
        GLOBAL,
        NEW_PROJECT_SKILL_ROW,
        CHANGED_PROJECT_AGENT_ROW,
        NEW_GLOBAL_SKILL_ROW,
        GLOBAL_AGENT_ROW,
      ]) {
        expect(planned).toContain(shown);
      }
      // Both columns hold one row per scope here, so a row's line falls between its scope's labels.
      expect(planned.indexOf(PROJECT)).toBeLessThan(planned.indexOf(NEW_PROJECT_SKILL_ROW));
      expect(
        planned.indexOf(NEW_PROJECT_SKILL_ROW),
        "a project-scoped skill must not be shown as going into the global install",
      ).toBeLessThan(planned.indexOf(GLOBAL));
      expect(planned.indexOf(PROJECT)).toBeLessThan(planned.indexOf(CHANGED_PROJECT_AGENT_ROW));
      expect(planned.indexOf(CHANGED_PROJECT_AGENT_ROW)).toBeLessThan(planned.indexOf(GLOBAL));
      expect(planned.indexOf(GLOBAL)).toBeLessThan(planned.indexOf(NEW_GLOBAL_SKILL_ROW));
      expect(planned.indexOf(GLOBAL)).toBeLessThan(planned.indexOf(GLOBAL_AGENT_ROW));

      // The panel joins the question rather than replace it.
      await session.deny();
      expect(await session.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    },
  );

  it(
    "shows only the global install at the home directory",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(HOME_INSTALLED_ID, "home");

      const { session, planned } = await openApply(
        HOME_APPLY_ID,
        environment.fakeHome,
        environment.fakeHome,
      );

      expect(planned).toContain(ANOTHER_GLOBAL_SKILL_ROW);
      expect(planned).toContain(CHANGED_GLOBAL_AGENT_ROW);
      expect(planned.indexOf(GLOBAL)).toBeLessThan(planned.indexOf(ANOTHER_GLOBAL_SKILL_ROW));
      expect(planned.indexOf(GLOBAL)).toBeLessThan(planned.indexOf(CHANGED_GLOBAL_AGENT_ROW));
      // The Global rows are the subject guard: home has no project to show.
      expect(planned, "the home directory is the global install, so no Project").not.toContain(
        PROJECT,
      );

      await session.deny();
      expect(await session.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    },
  );
});
