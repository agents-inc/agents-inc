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
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * `edit --from <id>` in a project names the project half of a `[P][G]` pair it drops as a removal.
 *
 * A configuration that leaves out a skill or sub-agent the project holds at BOTH scopes drops the
 * project's own copy, and the global install's copy takes over — that is the behaviour, and it is
 * right: from a project the global install is left exactly as it is. What the confirm said about
 * it was not. The id survives at global scope, so the plan built its removals by id found nothing
 * removed and opened on "Nothing is removed", and it counted the scope move as an arrival into the
 * global install, which the run never writes to. So the plan names the dropped half under the
 * removal heading, saying the project's copy goes and the global one takes over, and lists nothing
 * as arriving in the global install.
 *
 * Every install is made by `init --from` — the global install at HOME first, then the project
 * under it — so each pair is the one the installer writes, global tombstone and all. Each leg also
 * adds a skill to the project, so the apply demonstrably ran, and holds the global install to a
 * whole-tree snapshot taken before it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** In the global install, and in the project as well where a leg pairs it. */
const REACT = E2E_SKILL.react.id;
/** The project's own skill, on its own sub-agent, in every configuration below. */
const VITEST = E2E_SKILL.vitest.id;
/** What each apply adds to the project — its proof that the apply ran. */
const ADDED_PROJECT_SKILL = E2E_SKILL["visual-regression"].id;

const GLOBAL_ID = "DropHalf01";
const SKILL_PAIR_ID = "DropHalf02";
const AGENT_PAIR_ID = "DropHalf03";
const APPLY_ID = "DropHalf04";

const ANYTHING = "[\\s\\S]*";
/** A removal plan naming `subject`, then saying its project copy goes and the global one stays. */
function namedAsDroppedHalf(subject: string): RegExp {
  return new RegExp(
    `${STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW}${ANYTHING}${subject}${ANYTHING}` +
      `${STEP_TEXT.SHARED_CONFIG_PROJECT_COPY_REMOVED}${ANYTHING}${STEP_TEXT.SHARED_CONFIG_GLOBAL_TAKES_OVER}`,
  );
}

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

    // The global install: React on the global web-developer.
    store.publish(
      GLOBAL_ID,
      buildSeedPayload({
        skills: { [REACT]: onGlobalWebDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      }),
    );
    // A project holding React of its own beside the global one — React [P][G] — on the project's
    // own sub-agent, so no sub-agent is paired.
    store.publish(
      SKILL_PAIR_ID,
      buildSeedPayload({
        skills: { [REACT]: onApiDeveloper, [VITEST]: onApiDeveloper },
        agents: apiDeveloperHere,
      }),
    );
    // A project holding web-developer of its own beside the global one — web-developer [P][G] —
    // and no React of its own.
    store.publish(
      AGENT_PAIR_ID,
      buildSeedPayload({
        skills: { [VITEST]: onApiDeveloper },
        agents: { [WEB_DEV]: { on: true, scope: "project" }, ...apiDeveloperHere },
      }),
    );
    // What both legs apply: the project's own skill, plus one it adds — leaving out React and
    // web-developer, whose project halves are what it drops.
    store.publish(
      APPLY_ID,
      buildSeedPayload({
        skills: { [VITEST]: onApiDeveloper, [ADDED_PROJECT_SKILL]: onApiDeveloper },
        agents: apiDeveloperHere,
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

  /** The global install at HOME, then `projectId` installed into the project under it. */
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

  /** Every folder the global install keeps: its skills and agents, and its config pair. */
  function snapshotGlobalInstall(home: string): Promise<Record<string, TreeSnapshotEntry>[]> {
    return Promise.all(
      [path.join(home, DIRS.CLAUDE), path.join(home, DIRS.SOURCE_ROOT)].map(readTreeSnapshot),
    );
  }

  /** Opens `edit --from` at a real terminal in the project, and what it showed with its question. */
  async function openApply(environment: TestEnvironment): Promise<string> {
    prompt = new InteractivePrompt(["edit", "--from", APPLY_ID], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    return prompt.getOutput();
  }

  /** Answers yes, and holds the run to a clean exit. */
  async function approve(): Promise<void> {
    if (!prompt) throw new Error("approve() needs the apply opened first");
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
  }

  /** The project's own skills — the half a project run is entitled to change. */
  async function projectScopedSkillIds(projectDir: string): Promise<string[]> {
    const config = await loadConfigOrFail(projectDir);
    return config.skills.filter((skill) => skill.scope === "project").map((skill) => skill.id);
  }

  it(
    "names a skill's project copy as removed, and lists nothing arriving in the global install",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installPair(SKILL_PAIR_ID);
      // The subject guard: React is the project's own as well as the global install's.
      expect(await listFiles(skillsPath(environment.projectDir))).toContain(REACT);
      expect(await listFiles(skillsPath(environment.fakeHome))).toStrictEqual([REACT]);
      const globalBefore = await snapshotGlobalInstall(environment.fakeHome);

      const planned = await openApply(environment);

      expect(
        planned,
        "the plan must name the project's React copy as removed, with the global one taking over",
      ).toMatch(namedAsDroppedHalf(REACT));
      expect(
        planned,
        "a plan that drops a project copy must not say nothing is removed",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_NOTHING_REMOVED);
      // The project list is the positive guard for the negative below: the lists were printed.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
      expect(
        planned,
        "dropping a project copy writes nothing into the global install, so nothing is listed arriving there",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL);

      await approve();

      // What the plan named is what happened: the project's copy is gone, the global one is
      // untouched, and the project gained the skill the configuration adds.
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
    "names a sub-agent's project copy as removed, and lists nothing arriving in the global install",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const environment = await installPair(AGENT_PAIR_ID);
      // The subject guard: web-developer is compiled into the project as well as the global install.
      await expect({ dir: environment.projectDir }).toHaveCompiledAgent(WEB_DEV);
      await expect({ dir: environment.fakeHome }).toHaveCompiledAgent(WEB_DEV);
      const globalBefore = await snapshotGlobalInstall(environment.fakeHome);

      const planned = await openApply(environment);

      expect(
        planned,
        "the plan must name the project's web-developer copy as removed, with the global one taking over",
      ).toMatch(namedAsDroppedHalf(WEB_DEV));
      expect(
        planned,
        "a plan that drops a project copy must not say nothing is removed",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_NOTHING_REMOVED);
      // The project list is the positive guard for the negative below: the lists were printed.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
      expect(
        planned,
        "dropping a project copy writes nothing into the global install, so nothing is listed arriving there",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL);

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
});
