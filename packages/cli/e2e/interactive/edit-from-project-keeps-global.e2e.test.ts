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
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
  matchedAsWritten,
} from "../helpers/test-utils.js";
import { CLI_INVOKE_COMMAND, DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * `edit --from` inside a project never removes or changes anything in the global install, though it
 * may add what the global install lacks. One leg per shape; each adds a project skill to prove the
 * apply ran and compares a whole-tree snapshot. Controls: global entries carried as installed, an
 * allowed global addition, and the same removal at home. What it keeps, it names with the run from
 * home that would change it — only where home would take that configuration.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_SKILL = E2E_SKILL.react.id;
/**
 * In the global install's own domain: a new domain would widen the global `Domain` union, a
 * separate issue.
 */
const ADDED_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;
const GLOBAL_SKILL = E2E_SKILL.vitest.id;
const OTHER_GLOBAL_SKILL = E2E_SKILL.zustand.id;
const NEW_GLOBAL_SKILL = E2E_SKILL["research-methodology"].id;
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

const onProjectAgent = buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } });

const projectSkills = {
  [PROJECT_SKILL]: onProjectAgent,
  [ADDED_PROJECT_SKILL]: onProjectAgent,
};

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
    // No row joins the global skills to the global sub-agent.
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
    // A changed load state and tuning on existing global entries, not a removal.
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

  /** Real installs, so the provenance that decides removals is the installer's own. */
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

  function snapshotGlobalInstall(home: string): Promise<Record<string, TreeSnapshotEntry>[]> {
    return Promise.all(
      [path.join(home, DIRS.CLAUDE), path.join(home, DIRS.SOURCE_ROOT)].map(readTreeSnapshot),
    );
  }

  async function applyApproved(id: string, cwd: string, home: string): Promise<void> {
    prompt = new InteractivePrompt(["edit", "--from", id], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
  }

  async function projectScopedSkillIds(projectDir: string): Promise<string[]> {
    const config = await loadConfigOrFail(projectDir);
    return config.skills.filter((skill) => skill.scope === "project").map((skill) => skill.id);
  }

  async function expectGlobalUntouchedByProjectApply(id: string): Promise<void> {
    const environment = await installFrom(INSTALLED_ID, "project");
    const globalBefore = await loadConfigOrFail(environment.fakeHome);
    const treeBefore = await snapshotGlobalInstall(environment.fakeHome);
    // Subject guard: the install really put both global skills, the sub-agent and its rows in the
    // global install.
    expect(globalBefore.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [GLOBAL_SKILL, OTHER_GLOBAL_SKILL].sort(),
    );
    expect(globalBefore.agents.map((agent) => agent.name)).toStrictEqual([API_DEV]);
    expect(globalBefore.stack).toHaveProperty(API_DEV);

    await applyApproved(id, environment.projectDir, environment.fakeHome);

    // Proof the apply ran.
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
      // The added skill arrives with its row on the global sub-agent, and its compiled file loads
      // it.
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

      // At home the run edits the global install itself.
      const globalAfter = await loadConfigOrFail(environment.fakeHome);
      expect(globalAfter.skills.map((skill) => skill.id)).toStrictEqual([GLOBAL_SKILL]);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([GLOBAL_SKILL]);
    },
  );

  async function planFromProject(id: string): Promise<string> {
    const environment = await installFrom(INSTALLED_ID, "project");
    prompt = new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    const planned = flattenCliOutput(prompt.getOutput());
    await prompt.deny();
    expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
    return planned;
  }

  it(
    "names the run from home that changes the global skill it keeps, for a configuration home takes",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const planned = await planFromProject(HOME_REMOVES_ID);

      expect(planned).toMatch(
        new RegExp(
          `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`skill ${E2E_SKILL.zustand.display}`)}`,
        ),
      );
      expect(
        planned,
        "the configuration is all global, so the same id applied from home changes what is kept",
      ).toContain(`${CLI_INVOKE_COMMAND} edit --from ${HOME_REMOVES_ID}`);
    },
  );

  it(
    "names no run from home for a configuration home would refuse",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const planned = await planFromProject(SOME_GLOBAL_ID);

      // Subject guard: something is kept, so a route could have been named.
      expect(planned).toMatch(
        new RegExp(
          `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`skill ${E2E_SKILL.zustand.display}`)}`,
        ),
      );
      expect(
        planned,
        "the configuration carries project-scoped skills, which home refuses, so no run there is named",
      ).not.toContain(`${CLI_INVOKE_COMMAND} edit`);
    },
  );
});
