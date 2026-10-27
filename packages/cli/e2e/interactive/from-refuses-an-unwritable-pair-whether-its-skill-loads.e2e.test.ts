import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, E2E_SOURCE, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  renderUnparseableMetadataYaml,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * A link assigning a project-scoped skill to a sub-agent that rests at global is refused, naming the
 * pair, and refused the same way when that skill's metadata.yaml will not load: the pair is the
 * link's, and `init --from` and `edit --from` otherwise put the sub-agent in the global install
 * without it (CLI-935). Each refusal sits beside the same link loading cleanly and beside the same
 * failed load with the sub-agent pinned to the project, which still installs into the project. The
 * pinned specs are also what shows the broken fixture's skill fails to load: a refusal prints no
 * load warning, so the refused specs cannot. Observed red against the unfixed build: both refusals
 * of a failed load, while every control was green.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** Assigned to no agent in the fixture's stack, so breaking it moves nothing else. */
const UNLOADED = E2E_SKILL["visual-regression"].id;
const HONO = E2E_SKILL.hono.id;

const UNWRITABLE_PAIR = `${UNLOADED} -> ${WEB_DEV}`;
const SKIPPED_WITHOUT_IT = `${STEP_TEXT.CATALOG_COULD_NOT_LOAD} ${UNLOADED} sub-agent(s) installed without ${UNLOADED}, ${STEP_TEXT.INSTALLED_WITHOUT_THE_SKILL} ${WEB_DEV}`;

const PAIRED_ID = "Unpaired01";
const PINNED_ID = "Pinned0001";
const BASE_ID = "HonoBase01";
const EDIT_PAIRED_ID = "AddPaired1";
const EDIT_PINNED_ID = "AddPinned1";

const onWebDeveloper = buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } });
const honoInTheProject = {
  skills: { [HONO]: buildSeedSkill({ scope: "project", assignments: { [API_DEV]: "lazy" } }) },
  agents: { [API_DEV]: { scope: "project" } },
} as const;

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

describe("--from a project-scoped skill on a sub-agent that rests at global", () => {
  let failing: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    failing = await createE2ESource();
    await writeFile(
      path.join(failing.sourceDir, SOURCE_PATHS.SKILLS_DIR, UNLOADED, FILES.METADATA_YAML),
      renderUnparseableMetadataYaml(),
    );
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(failing);
  });

  beforeEach(() => {
    store.publish(PAIRED_ID, buildSeedPayload({ skills: { [UNLOADED]: onWebDeveloper } }));
    store.publish(
      PINNED_ID,
      buildSeedPayload({
        skills: { [UNLOADED]: onWebDeveloper },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(BASE_ID, buildSeedPayload(honoInTheProject));
    store.publish(
      EDIT_PAIRED_ID,
      buildSeedPayload({
        skills: { ...honoInTheProject.skills, [UNLOADED]: onWebDeveloper },
        agents: honoInTheProject.agents,
      }),
    );
    store.publish(
      EDIT_PINNED_ID,
      buildSeedPayload({
        skills: { ...honoInTheProject.skills, [UNLOADED]: onWebDeveloper },
        agents: { ...honoInTheProject.agents, [WEB_DEV]: { scope: "project" } },
      }),
    );
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Not HOME whole: the project sits inside it, and a load's cache is not an install. */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
    ]);
    return { project, home };
  }

  async function initFrom(environment: TestEnvironment, id: string, source: E2ESource) {
    return runInitFrom(
      store,
      id,
      { dir: environment.projectDir, globalHome: environment.fakeHome },
      source.sourceDir,
    );
  }

  function launchEdit(environment: TestEnvironment, id: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
  }

  describe("init --from", () => {
    it.each([
      ["loads", () => E2E_SOURCE],
      ["fails to load", () => failing],
    ] as const)(
      "refuses it when the skill %s, naming the pair, and installs nothing at either scope",
      { timeout: TIMEOUTS.LIFECYCLE },
      async (_load, source) => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        const { exitCode, output } = await initFrom(env, PAIRED_ID, source());

        expect(exitCode, `the pair is the link's, whatever loads:\n${output}`).toBe(
          EXIT_CODES.ERROR,
        );
        const said = flattenCliOutput(output);
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNWRITABLE_PAIR);
        expect(said, "both halves named, so the re-share can fix it").toContain(UNWRITABLE_PAIR);
        expect(
          await snapshotInstallSurfaces(env),
          "a refused link writes no sub-agent and no config at either scope",
        ).toStrictEqual(before);
      },
    );

    it(
      "control: installs the sub-agent into the project without the skill when it is pinned there",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();

        const { exitCode, output, stderr } = await initFrom(env, PINNED_ID, failing);

        expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
        expect(flattenCliOutput(stderr), "the fixture's skill failed to load").toContain(
          SKIPPED_WITHOUT_IT,
        );
        const config = await loadConfigOrFail(env.projectDir);
        expect({
          skills: config.skills,
          agents: config.agents.map(({ name, scope }) => ({ name, scope })),
        }).toStrictEqual({ skills: [], agents: [{ name: WEB_DEV, scope: "project" }] });
        expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
        expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
      },
    );
  });

  describe("edit --from, in a project", () => {
    it.each([
      ["loads", () => E2E_SOURCE],
      ["fails to load", () => failing],
    ] as const)(
      "refuses it when the skill %s before it shows the plan or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async (_load, source) => {
        env = await createTestEnvironment();
        const installed = await initFrom(env, BASE_ID, source());
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, EDIT_PAIRED_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "the pair is the link's, so the apply is refused before the user is asked",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(shown, "and before the panel offers the sub-agent globally").not.toContain(
          STEP_TEXT.PANEL_HEADER,
        );
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNWRITABLE_PAIR);
        expect(said).toContain(UNWRITABLE_PAIR);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: applies it into the project without the skill when the sub-agent is pinned there",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const installed = await initFrom(env, BASE_ID, failing);
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

        prompt = launchEdit(env, EDIT_PINNED_ID);
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(
          flattenCliOutput(prompt.getOutput()),
          "the fixture's skill failed to load",
        ).toContain(SKIPPED_WITHOUT_IT);
        await prompt.confirm();

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.SUCCESS);
        const config = await loadConfigOrFail(env.projectDir);
        expect({
          skills: config.skills.map(({ id }) => id),
          agents: Object.fromEntries(config.agents.map(({ name, scope }) => [name, scope])),
        }).toStrictEqual({
          skills: [HONO],
          agents: { [API_DEV]: "project", [WEB_DEV]: "project" },
        });
        expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual(
          [`${API_DEV}.md`, `${WEB_DEV}.md`].sort(),
        );
        expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
      },
    );
  });
});
