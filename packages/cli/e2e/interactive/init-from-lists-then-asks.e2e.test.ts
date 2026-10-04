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
 * `init --from <id>` at a terminal: it says what goes where, then asks, and writes nothing until
 * it is told yes.
 *
 * A shared configuration is somebody else's choice of skills and sub-agents, and half of it may
 * land in the user's own global install, which every project on the machine reads. So before
 * anything is written the run lists the entries going into this project and the entries going
 * into the global install, each under its own heading, and asks. No writes nothing and exits with
 * the cancel code; yes installs exactly what a run without the question installs.
 *
 * The wait is on the question OR the process ending, never on the question alone: a run that
 * does not ask simply installs and exits, and the assertion that it asked is what has to report
 * that — a timeout would name nothing.
 *
 * At the home directory there is no project, so only the global list is printed. In a project
 * under a global install, a global skill the configuration names that the global install already
 * holds is skipped rather than installed, and a third list names it. The no-terminal half (the
 * lists, and no question) is `commands/init-from-lists-without-a-terminal`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** Installed into the project, on the project's own sub-agent. */
const PROJECT_SKILL = E2E_SKILL.react.id;
/** Installed into the global install, on a global sub-agent. */
const GLOBAL_SKILL = E2E_SKILL.vitest.id;

const SPLIT_ID = "ListAsk01";
const ALL_GLOBAL_ID = "ListAsk02";

/** The project, whole, and the folders an installation keeps under HOME. */
type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

const ANYTHING = "[\\s\\S]*";
const PROJECT_LIST = STEP_TEXT.SHARED_CONFIG_LIST_PROJECT;
const GLOBAL_LIST = STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL;

/** The project's own skill, printed under the project heading and before the global one. */
const PROJECT_SKILL_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${PROJECT_SKILL}${ANYTHING}${GLOBAL_LIST}`,
);
/** The project's own sub-agent, the same way. */
const PROJECT_AGENT_LISTED_HERE = new RegExp(
  `${PROJECT_LIST}${ANYTHING}${WEB_DEV}${ANYTHING}${GLOBAL_LIST}`,
);
/** The global skill, printed under the global heading. */
const GLOBAL_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${GLOBAL_SKILL}`);
/** The global sub-agent, the same way. */
const GLOBAL_AGENT_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${API_DEV}`);
/** The project's skill printed after the global heading — under the wrong destination. */
const PROJECT_SKILL_LISTED_GLOBALLY = new RegExp(`${GLOBAL_LIST}${ANYTHING}${PROJECT_SKILL}`);
const SKIPPED_LIST = STEP_TEXT.SHARED_CONFIG_LIST_SKIPPED;
/** The project's skill under the project heading, then the global skill under the skipped one. */
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

    // One skill and one sub-agent at each scope, so each list has something only it can hold.
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
    // The only shape the home directory accepts: a global installation holds global content.
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

  /** Starts `init --from <id>` in a real terminal, in `cwd`, under the environment's HOME. */
  function launch(id: string, cwd: string, home: string): InteractivePrompt {
    return new InteractivePrompt(["init", "--from", id, "--marketplace", sourceDir], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
  }

  /**
   * Every place an install can write: the whole project, and each folder an installation keeps
   * under HOME. Not HOME whole — the project sits inside it here, and a cache a load drops there is
   * not an install.
   */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE_SRC)),
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
        // The subject guard for the comparison at the end: the permission files the environment
        // writes make the project's snapshot non-empty, so "unchanged" is not two empty trees.
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
        // Not "the skills did not arrive" — nothing at all moved, at either scope.
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
        // The global install first: the configuration's global skill, on its global sub-agent,
        // exactly as the configuration states them.
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
        // The skipped list above is the subject guard: everything global this configuration
        // names is already installed, so nothing goes into the global install.
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
      // The global list matched above is the positive subject guard for this negative: the
      // same output carries the lists, and the home directory has no project to list.
      expect(shown, "the home directory is the global install, so no project list").not.toContain(
        PROJECT_LIST,
      );

      await prompt.deny();
      expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    });
  });
});
