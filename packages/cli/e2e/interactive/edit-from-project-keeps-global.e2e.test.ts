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
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * `edit --from <id>` run inside a project never removes or changes anything in the global install.
 *
 * The global install is one installation every project on the machine reads, and a project run
 * was not started there. So a configuration applied from a project may change the project as it
 * likes, and may ADD a global entry the global install lacks — but a global skill, a global
 * sub-agent and that sub-agent's skill rows and tuning all stay exactly as they were, whatever the
 * configuration leaves out or says differently. Five shapes reached the global install before this
 * was ruled, one leg each: a configuration with no global entries emptied it; one carrying some
 * removed the global skills it lacked; one carrying the global skills but not the global
 * sub-agent's rows (which is what a share minted from a project carried) stripped those rows; and
 * one loading a global row differently, or tuning the global sub-agent differently, rewrote it.
 *
 * "Nothing changed" is a whole-tree snapshot of every folder the global install keeps, content and
 * mtime, taken before the run. Each leg also changes the PROJECT — it adds a skill there — so the
 * apply demonstrably ran: a run that did nothing at all would leave the global install alone too.
 *
 * Three controls sit beside those legs, because a guarantee pinned alone cannot tell a scoped
 * guard from one that swallowed everything: a configuration that carries the global entries
 * exactly as installed (which proves the byte-for-byte comparison is satisfiable by a real
 * apply); one that adds a global skill the global install lacks, which is allowed and lands with
 * its row on the global sub-agent; and the same removal run AT the home directory, which edits
 * the global install itself and so removes.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** The project's own skill, in every configuration below. */
const PROJECT_SKILL = E2E_SKILL.react.id;
/**
 * The skill every leg adds to the project, which is the leg's proof that the apply ran. It is in
 * the global install's own domain on purpose: a project skill from a domain the global install
 * does not have widens the global `config-types.ts` `Domain` union today, with nothing global
 * added — reported separately, and kept out of these legs so each one isolates the removal.
 */
const ADDED_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;
/** The two skills the installation puts in the global install, on the global sub-agent. */
const GLOBAL_SKILL = E2E_SKILL.vitest.id;
const OTHER_GLOBAL_SKILL = E2E_SKILL.zustand.id;
/** A skill the global install does not have, which the allowed leg adds to it. */
const NEW_GLOBAL_SKILL = E2E_SKILL["research-methodology"].id;
/** The global sub-agent's rows as the installation writes them: both global skills, lazy. */
const INSTALLED_GLOBAL_ROWS = {
  "web-testing": [sa(GLOBAL_SKILL)],
  "web-client-state": [sa(OTHER_GLOBAL_SKILL)],
};

const INSTALLED_ID = "KeepGlb00";
const NO_GLOBAL_ID = "KeepGlb01";
const SOME_GLOBAL_ID = "KeepGlb02";
const NO_GLOBAL_ROWS_ID = "KeepGlb03";
const SAME_GLOBAL_ID = "KeepGlb04";
const RELOADED_GLOBAL_ID = "KeepGlb08";
const RETUNED_GLOBAL_ID = "KeepGlb09";
const ADDS_GLOBAL_ID = "KeepGlb05";
const HOME_INSTALLED_ID = "KeepGlb06";
const HOME_REMOVES_ID = "KeepGlb07";

/** A project skill on the project's own sub-agent. */
const onProjectAgent = buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } });

/** The project half every configuration below carries: its own skill, plus the one it adds. */
const projectSkills = {
  [PROJECT_SKILL]: onProjectAgent,
  [ADDED_PROJECT_SKILL]: onProjectAgent,
};

/** A global skill on the global sub-agent, as the installation assigned it. */
const onGlobalAgent = buildSeedSkill({ scope: "global", assignments: { [API_DEV]: "lazy" } });

/** Each sub-agent switched on outright, as a share mints it. */
const projectAgent = { [WEB_DEV]: { on: true, scope: "project" } } satisfies SeedPayload["agents"];
const bothAgents = {
  [WEB_DEV]: { on: true, scope: "project" },
  [API_DEV]: { on: true, scope: "global" },
} satisfies SeedPayload["agents"];

describe("edit --from <id> in a project keeps the global install as it is", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();

    // What the project is installed from: its own skill on its own sub-agent, and two global
    // skills on a global sub-agent — the global install the legs below must not disturb.
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [PROJECT_SKILL]: onProjectAgent,
          [GLOBAL_SKILL]: onGlobalAgent,
          [OTHER_GLOBAL_SKILL]: onGlobalAgent,
        },
        agents: bothAgents,
      }),
    );
    store.publish(NO_GLOBAL_ID, buildSeedPayload({ skills: projectSkills, agents: projectAgent }));
    store.publish(
      SOME_GLOBAL_ID,
      buildSeedPayload({
        skills: { ...projectSkills, [GLOBAL_SKILL]: onGlobalAgent },
        agents: bothAgents,
      }),
    );
    // Both global skills, and the global sub-agent, but no row joining them — the shape a share
    // minted from a project used to carry for every global sub-agent.
    store.publish(
      NO_GLOBAL_ROWS_ID,
      buildSeedPayload({
        skills: {
          ...projectSkills,
          [GLOBAL_SKILL]: buildSeedSkill({ scope: "global" }),
          [OTHER_GLOBAL_SKILL]: buildSeedSkill({ scope: "global" }),
        },
        agents: bothAgents,
      }),
    );
    // The global entries all present, but a global row loaded differently, and the global
    // sub-agent tuned differently — a change to an existing global entry rather than a removal.
    store.publish(
      RELOADED_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          ...projectSkills,
          [GLOBAL_SKILL]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded" },
          }),
          [OTHER_GLOBAL_SKILL]: onGlobalAgent,
        },
        agents: bothAgents,
      }),
    );
    store.publish(
      RETUNED_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          ...projectSkills,
          [GLOBAL_SKILL]: onGlobalAgent,
          [OTHER_GLOBAL_SKILL]: onGlobalAgent,
        },
        agents: { ...bothAgents, [API_DEV]: { on: true, scope: "global", model: "haiku" } },
      }),
    );
    store.publish(
      SAME_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          ...projectSkills,
          [GLOBAL_SKILL]: onGlobalAgent,
          [OTHER_GLOBAL_SKILL]: onGlobalAgent,
        },
        agents: bothAgents,
      }),
    );
    store.publish(
      ADDS_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          ...projectSkills,
          [GLOBAL_SKILL]: onGlobalAgent,
          [OTHER_GLOBAL_SKILL]: onGlobalAgent,
          [NEW_GLOBAL_SKILL]: onGlobalAgent,
        },
        agents: bothAgents,
      }),
    );
    // The home directory's own pair: an all-global installation, and a configuration leaving one
    // of its skills out.
    store.publish(
      HOME_INSTALLED_ID,
      buildSeedPayload({
        skills: { [GLOBAL_SKILL]: onGlobalAgent, [OTHER_GLOBAL_SKILL]: onGlobalAgent },
        agents: { [API_DEV]: { on: true, scope: "global" } },
      }),
    );
    store.publish(
      HOME_REMOVES_ID,
      buildSeedPayload({
        skills: { [GLOBAL_SKILL]: onGlobalAgent },
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

  /**
   * A project installed from nothing by `init --from`, under a HOME of its own that the same run
   * gives a global install. Real installs rather than fixture-written configs, so the provenance
   * that decides what an apply may remove is the installer's own.
   */
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

  /** Every folder the global install keeps: its skills and agents, and its config pair. */
  function snapshotGlobalInstall(home: string): Promise<Record<string, TreeSnapshotEntry>[]> {
    return Promise.all(
      [
        path.join(home, DIRS.CLAUDE),
        path.join(home, DIRS.SOURCE_ROOT),
        path.join(home, DIRS.CLAUDE_SRC),
      ].map(readTreeSnapshot),
    );
  }

  /** Applies `id` with `edit --from` at a real terminal in `cwd`, answering yes. */
  async function applyApproved(id: string, cwd: string, home: string): Promise<void> {
    prompt = new InteractivePrompt(["edit", "--from", id], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
  }

  /** The project's own skills — the half a project run is entitled to change. */
  async function projectScopedSkillIds(projectDir: string): Promise<string[]> {
    const config = await loadConfigOrFail(projectDir);
    return config.skills.filter((skill) => skill.scope === "project").map((skill) => skill.id);
  }

  /** Applies `id` in the project and holds the global install to what it was before. */
  async function expectGlobalUntouchedByProjectApply(id: string): Promise<void> {
    const environment = await installFrom(INSTALLED_ID, "project");
    const globalBefore = await loadConfigOrFail(environment.fakeHome);
    const treeBefore = await snapshotGlobalInstall(environment.fakeHome);
    // The subject guard for every comparison below: the installation really did put both global
    // skills, the global sub-agent and its rows in the global install.
    expect(globalBefore.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [GLOBAL_SKILL, OTHER_GLOBAL_SKILL].sort(),
    );
    expect(globalBefore.agents.map((agent) => agent.name)).toStrictEqual([API_DEV]);
    expect(globalBefore.stack).toHaveProperty(API_DEV);

    await applyApproved(id, environment.projectDir, environment.fakeHome);

    // The proof the apply ran: the project gained the skill the configuration adds.
    expect((await projectScopedSkillIds(environment.projectDir)).sort()).toStrictEqual(
      [PROJECT_SKILL, ADDED_PROJECT_SKILL].sort(),
    );

    const globalAfter = await loadConfigOrFail(environment.fakeHome);
    expect(
      globalAfter.skills,
      "a project apply must not remove or change a skill in the global install",
    ).toStrictEqual(globalBefore.skills);
    expect(
      globalAfter.agents,
      "a project apply must not remove or change a sub-agent in the global install",
    ).toStrictEqual(globalBefore.agents);
    expect(
      globalAfter.stack,
      "a project apply must not change a global sub-agent's skill rows",
    ).toStrictEqual(globalBefore.stack);
    expect(
      await snapshotGlobalInstall(environment.fakeHome),
      "a project apply that adds nothing global must leave the global install byte-identical",
    ).toStrictEqual(treeBefore);
  }

  it(
    "keeps every global entry when the configuration has none",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(NO_GLOBAL_ID);
    },
  );

  it(
    "keeps the global skill the configuration leaves out",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(SOME_GLOBAL_ID);
    },
  );

  it(
    "keeps the global sub-agent's skill rows the configuration does not carry",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(NO_GLOBAL_ROWS_ID);
    },
  );

  it(
    "keeps a global sub-agent's row as installed when the configuration loads it differently",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(RELOADED_GLOBAL_ID);
    },
  );

  it(
    "keeps a global sub-agent's tuning when the configuration tunes it differently",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(RETUNED_GLOBAL_ID);
    },
  );

  it(
    "keeps the global install byte-identical when the configuration carries it exactly",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      await expectGlobalUntouchedByProjectApply(SAME_GLOBAL_ID);
    },
  );

  it(
    "adds a global skill the global install lacks, and keeps the rest",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(INSTALLED_ID, "project");
      const globalBefore = await loadConfigOrFail(environment.fakeHome);
      expect(globalBefore.stack).toStrictEqual({ [API_DEV]: INSTALLED_GLOBAL_ROWS });

      await applyApproved(ADDS_GLOBAL_ID, environment.projectDir, environment.fakeHome);

      const globalAfter = await loadConfigOrFail(environment.fakeHome);
      expect(globalAfter.skills.map((skill) => skill.id).sort()).toStrictEqual(
        [GLOBAL_SKILL, OTHER_GLOBAL_SKILL, NEW_GLOBAL_SKILL].sort(),
      );
      expect(globalAfter.agents.map((agent) => agent.name)).toStrictEqual(
        globalBefore.agents.map((agent) => agent.name),
      );
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual(
        [GLOBAL_SKILL, OTHER_GLOBAL_SKILL, NEW_GLOBAL_SKILL].sort(),
      );
      // The added skill arrives with its assignment: the global sub-agent the configuration gives
      // it to gains that row beside the rows it already had, and its compiled file loads it.
      expect(
        globalAfter.stack,
        "a skill added to the global install must arrive with its row, beside the rows already there",
      ).toStrictEqual({
        [API_DEV]: { ...INSTALLED_GLOBAL_ROWS, "meta-methodology": [sa(NEW_GLOBAL_SKILL)] },
      });
      await expect({ dir: environment.fakeHome }).toHaveAgentDynamicSkills(API_DEV, {
        skillIds: [GLOBAL_SKILL, OTHER_GLOBAL_SKILL, NEW_GLOBAL_SKILL],
      });
    },
  );

  it(
    "removes the global skill a configuration leaves out when run at the home directory",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installFrom(HOME_INSTALLED_ID, "home");

      await applyApproved(HOME_REMOVES_ID, environment.fakeHome, environment.fakeHome);

      // At the home directory the run edits the global install itself, so it is made to match.
      const globalAfter = await loadConfigOrFail(environment.fakeHome);
      expect(globalAfter.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([GLOBAL_SKILL]);
    },
  );
});
