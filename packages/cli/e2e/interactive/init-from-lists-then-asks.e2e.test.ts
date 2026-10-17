import path from "path";
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
import {
  agentsPath,
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * `init --from` at a terminal lists what goes into the project and the global install, asks, and
 * writes nothing until yes; yes installs what a non-terminal run installs. Waits are on the
 * question or the exit. At home only the global list; global skills already held are listed as
 * skipped. The no-terminal half is `commands/init-from-lists-without-a-terminal`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_SKILL = E2E_SKILL.react.id;
const GLOBAL_SKILL = E2E_SKILL.vitest.id;

const SPLIT_ID = "ListAsk01";
const ALL_GLOBAL_ID = "ListAsk02";

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

const ANYTHING = "[\\s\\S]*";
const PROJECT_LIST = STEP_TEXT.SHARED_CONFIG_LIST_PROJECT;
const GLOBAL_LIST = STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL;

/** Under the project heading, before the global one. */
const PROJECT_SKILL_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${PROJECT_SKILL}${ANYTHING}${GLOBAL_LIST}`,
);
const PROJECT_AGENT_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${WEB_DEV}${ANYTHING}${GLOBAL_LIST}`,
);
const GLOBAL_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${GLOBAL_SKILL}`);
const GLOBAL_AGENT_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${API_DEV}`);
/** Printed after the global heading: the wrong destination. */
const PROJECT_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${PROJECT_SKILL}`);
const SKIPPED_LIST = STEP_TEXT.SHARED_CONFIG_LIST_SKIPPED;
const GLOBAL_SKILL_LISTED_AS_SKIPPED = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${PROJECT_SKILL}${ANYTHING}${SKIPPED_LIST}${ANYTHING}${GLOBAL_SKILL}`,
);

describe("init --from <id> at a terminal", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();

    // One skill and sub-agent at each scope, so each list has something only it can hold.
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
    // The only shape the home directory accepts.
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

  function launch(id: string, cwd: string, home: string): InteractivePrompt {
    return new InteractivePrompt(["init", "--from", id, "--marketplace", sourceDir], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
  }

  /** Not HOME whole: the project sits inside it, and a load's cache is not an install. */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
    ]);
    return { project, home };
  }

  describe("in a project", () => {
    it(
      "lists what goes into the project and what into the global install, then asks, with nothing written yet",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);
        // Subject guard: the permission files make the project snapshot non-empty.
        expect(Object.keys(before.project)).not.toStrictEqual([]);

        prompt = launch(SPLIT_ID, env.projectDir, env.fakeHome);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "init --from at a terminal must ask before it installs a shared configuration",
        ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

        expect(shown).toMatch(PROJECT_SKILL_LISTED_HERE);
        expect(shown).toMatch(PROJECT_AGENT_LISTED_HERE);
        expect(shown).toMatch(GLOBAL_SKILL_LISTED_GLOBALLY);
        expect(shown).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
        expect(
          shown,
          "a project-scoped skill must not be listed as going into the global install",
        ).not.toMatch(PROJECT_SKILL_LISTED_GLOBALLY);

        expect(
          await snapshotInstallSurfaces(env),
          "nothing may be written while the question is waiting for an answer",
        ).toStrictEqual(before);
      },
    );

    it(
      "writes nothing and exits with the cancel code when declined",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launch(SPLIT_ID, env.projectDir, env.fakeHome);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(
          prompt.getOutput(),
          "init --from at a terminal must ask before it installs a shared configuration",
        ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

        await prompt.deny();
        const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

        expect(exitCode).toBe(EXIT_CODES.CANCELLED);
        // Nothing at all moved, at either scope.
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it("installs both halves once approved", { timeout: TIMEOUTS.INTERACTIVE }, async () => {
      env = await createTestEnvironment();

      prompt = launch(SPLIT_ID, env.projectDir, env.fakeHome);
      await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
      expect(
        prompt.getOutput(),
        "init --from at a terminal must ask before it installs a shared configuration",
      ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(exitCode, `install failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.skills.filter((skill) => skill.scope === "project").map((s) => s.id),
      ).toStrictEqual([PROJECT_SKILL]);
      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
      expect(globalConfig.agents.map((agent) => agent.name)).toStrictEqual([API_DEV]);

      expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
      expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${API_DEV}.md`]);
    });
  });

  describe("in a project under a global install", () => {
    it(
      "names the global skills it skips because the global install already holds them",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        // The global install first, exactly as the configuration states it.
        const installed = await runInitFrom(
          store,
          ALL_GLOBAL_ID,
          { dir: env.fakeHome, globalHome: env.fakeHome },
          sourceDir,
        );
        expect(installed.exitCode, `global install failed: ${installed.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        const before = await snapshotInstallSurfaces(env);

        prompt = launch(SPLIT_ID, env.projectDir, env.fakeHome);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "init --from at a terminal must ask before it installs a shared configuration",
        ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(
          shown,
          "a global skill the global install already holds must be listed as skipped",
        ).toMatch(GLOBAL_SKILL_LISTED_AS_SKIPPED);
        // The skipped list is the subject guard: nothing goes into the global install.
        expect(shown, "a skipped skill is not going into the global install").not.toContain(
          GLOBAL_LIST,
        );

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("at the home directory", () => {
    it("lists only the global install, then asks", { timeout: TIMEOUTS.INTERACTIVE }, async () => {
      env = await createTestEnvironment();

      prompt = launch(ALL_GLOBAL_ID, env.fakeHome, env.fakeHome);
      await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
      const shown = prompt.getOutput();

      expect(
        shown,
        "init --from at a terminal must ask before it installs a shared configuration",
      ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
      expect(shown).toMatch(GLOBAL_SKILL_LISTED_GLOBALLY);
      expect(shown).toMatch(GLOBAL_AGENT_LISTED_GLOBALLY);
      // The global list is the subject guard: home has no project to list.
      expect(shown, "the home directory is the global install, so no project list").not.toContain(
        PROJECT_LIST,
      );

      await prompt.deny();
      expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    });
  });
});
