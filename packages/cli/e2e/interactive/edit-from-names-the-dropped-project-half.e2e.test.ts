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
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  ADDED_MARKER,
  DIRS,
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
  UNCHANGED_MARKER,
  panelRow,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * `edit --from` in a project marks the project half of a dropped `[P][G]` pair removed in its panel,
 * the global copy kept as it stands, and nothing arriving globally. Installs are made by `init
 * --from`; each leg adds a project skill to prove the apply ran and snapshots the global install.
 * A project-only entry moved to the global install shows removed here and added there: its project
 * copy goes.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const REACT = E2E_SKILL.react.id;
const VITEST = E2E_SKILL.vitest.id;
const ADDED_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;

const GLOBAL_ID = "DropHalf01";
const SKILL_PAIR_ID = "DropHalf02";
const AGENT_PAIR_ID = "DropHalf03";
const APPLY_ID = "DropHalf04";
const PROJECT_ONLY_ID = "DropHalf05";
const MOVED_TO_GLOBAL_ID = "DropHalf06";

const onGlobalWebDeveloper = buildSeedSkill({
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
});
const onApiDeveloper = buildSeedSkill({ scope: "project", assignments: { [API_DEV]: "lazy" } });
const apiDeveloperHere = {
  [API_DEV]: { on: true, scope: "project" },
} satisfies SeedPayload["agents"];

describe("edit --from <id> in a project names the project half of a pair it drops", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();

    store.publish(
      GLOBAL_ID,
      buildSeedPayload({
        skills: { [REACT]: onGlobalWebDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      }),
    );
    // React [P][G] on the project's own sub-agent.
    store.publish(
      SKILL_PAIR_ID,
      buildSeedPayload({
        skills: { [REACT]: onApiDeveloper, [VITEST]: onApiDeveloper },
        agents: apiDeveloperHere,
      }),
    );
    // web-developer [P][G], and no project React.
    store.publish(
      AGENT_PAIR_ID,
      buildSeedPayload({
        skills: { [VITEST]: onApiDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "project" }, ...apiDeveloperHere },
      }),
    );
    // Leaves out React and web-developer, whose project halves it drops.
    store.publish(
      APPLY_ID,
      buildSeedPayload({
        skills: { [VITEST]: onApiDeveloper, [ADDED_PROJECT_SKILL]: onApiDeveloper },
        agents: apiDeveloperHere,
      }),
    );
    // React and web-developer in the project alone, then both moved to the global install.
    store.publish(
      PROJECT_ONLY_ID,
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
        },
        agents: { [WEB_DEV]: { on: true, scope: "project" } },
      }),
    );
    store.publish(
      MOVED_TO_GLOBAL_ID,
      buildSeedPayload({
        skills: { [REACT]: onGlobalWebDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installPair(projectId: string): Promise<TestEnvironment> {
    const environment = await createTestEnvironment();
    env = environment;
    for (const [id, dir] of [
      [GLOBAL_ID, environment.fakeHome],
      [projectId, environment.projectDir],
    ] as const) {
      const installed = await runInitFrom(
        store,
        id,
        { dir, globalHome: environment.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install of ${id} failed: ${installed.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
    }
    return environment;
  }

  function snapshotGlobalInstall(home: string): Promise<Record<string, TreeSnapshotEntry>[]> {
    return Promise.all(
      [path.join(home, DIRS.CLAUDE), path.join(home, DIRS.SOURCE_ROOT)].map(readTreeSnapshot),
    );
  }

  async function openApply(environment: TestEnvironment, id = APPLY_ID): Promise<string> {
    prompt = new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    return prompt.getOutput();
  }

  async function approve(): Promise<void> {
    if (!prompt) throw new Error("approve() needs the apply opened first");
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
  }

  async function projectScopedSkillIds(projectDir: string): Promise<string[]> {
    const config = await loadConfigOrFail(projectDir);
    return config.skills.filter((skill) => skill.scope === "project").map((skill) => skill.id);
  }

  it(
    "marks a skill's project copy removed, the global one kept, and nothing arriving in the global install",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installPair(SKILL_PAIR_ID);
      // Subject guard: React is the project's and the global install's.
      expect(await listFiles(skillsPath(environment.projectDir))).toContain(REACT);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([REACT]);
      const globalBefore = await snapshotGlobalInstall(environment.fakeHome);

      const planned = await openApply(environment);

      expect(planned, "the panel must mark the project's React copy removed").toContain(
        panelRow(REMOVED_MARKER, E2E_SKILL.react.display),
      );
      expect(planned, "the global React takes over as it stands").toContain(
        panelRow(UNCHANGED_MARKER, E2E_SKILL.react.display),
      );
      expect(
        planned,
        "dropping a project copy writes nothing into the global install, so nothing arrives there",
      ).not.toContain(panelRow(ADDED_MARKER, E2E_SKILL.react.display));

      await approve();

      // What the plan named is what happened.
      expect((await projectScopedSkillIds(environment.projectDir)).sort()).toStrictEqual(
        [VITEST, ADDED_PROJECT_SKILL].sort(),
      );
      expect(await listFiles(skillsPath(environment.projectDir))).not.toContain(REACT);
      expect(
        await snapshotGlobalInstall(environment.fakeHome),
        "a project apply must leave the global install as it found it",
      ).toStrictEqual(globalBefore);
    },
  );

  it(
    "marks a sub-agent's project copy removed, the global one kept, and nothing arriving in the global install",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installPair(AGENT_PAIR_ID);
      // Subject guard: web-developer is compiled at both scopes.
      await expect({ dir: environment.projectDir }).toHaveCompiledAgent(WEB_DEV);
      await expect({ dir: environment.fakeHome }).toHaveCompiledAgent(WEB_DEV);
      const globalBefore = await snapshotGlobalInstall(environment.fakeHome);

      const planned = await openApply(environment);

      expect(planned, "the panel must mark the project's web-developer copy removed").toContain(
        panelRow(REMOVED_MARKER, WEB_DEV),
      );
      expect(planned, "the global web-developer takes over as it stands").toContain(
        panelRow(UNCHANGED_MARKER, WEB_DEV),
      );
      expect(
        planned,
        "dropping a project copy writes nothing into the global install, so nothing arrives there",
      ).not.toContain(panelRow(ADDED_MARKER, WEB_DEV));

      await approve();

      expect((await projectScopedSkillIds(environment.projectDir)).sort()).toStrictEqual(
        [VITEST, ADDED_PROJECT_SKILL].sort(),
      );
      await expect({ dir: environment.projectDir }).not.toHaveCompiledAgent(WEB_DEV);
      expect(
        await snapshotGlobalInstall(environment.fakeHome),
        "a project apply must leave the global install as it found it",
      ).toStrictEqual(globalBefore);
    },
  );

  it(
    "marks a project-only skill and sub-agent it moves to the global install removed here and added there",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await createTestEnvironment();
      env = environment;
      const installed = await runInitFrom(
        store,
        PROJECT_ONLY_ID,
        { dir: environment.projectDir, globalHome: environment.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // Subject guard: React and web-developer are the project's alone.
      expect(await listFiles(skillsPath(environment.projectDir))).toStrictEqual([REACT]);
      await expect({ dir: environment.projectDir }).toHaveCompiledAgent(WEB_DEV);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([]);

      const planned = await openApply(environment, MOVED_TO_GLOBAL_ID);

      expect(planned, "the panel must mark React's project copy as going").toContain(
        panelRow(REMOVED_MARKER, E2E_SKILL.react.display),
      );
      expect(planned, "and React as arriving in the global install").toContain(
        panelRow(ADDED_MARKER, E2E_SKILL.react.display),
      );
      expect(planned, "the panel must mark web-developer's project copy as going").toContain(
        panelRow(REMOVED_MARKER, WEB_DEV),
      );
      expect(planned, "and web-developer as arriving in the global install").toContain(
        panelRow(ADDED_MARKER, WEB_DEV),
      );

      await approve();

      // What the plan named is what happened, on both sides of the move.
      expect(await listFiles(skillsPath(environment.projectDir))).toStrictEqual([]);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([REACT]);
      await expect({ dir: environment.projectDir }).not.toHaveCompiledAgent(WEB_DEV);
      await expect({ dir: environment.fakeHome }).toHaveCompiledAgent(WEB_DEV);
    },
  );
});
