import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { seedDefaultSourceCache } from "../fixtures/default-source-cache.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { CLI } from "../fixtures/cli.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_BUILTIN_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SkillId } from "../../src/cli/types/index.js";

/**
 * A run from a project that adds nothing to the global install registers the project there, and
 * changes nothing else in the global config.
 *
 * The global `config.ts` is the machine's: every registered project inherits it. A project run
 * that only touches the project has no business rewriting it, and the one line it does owe it is
 * the project's own registration in `projects`. What it wrote instead was the marketplace NAME
 * of the catalogue the project was set up from, filled into a global config that recorded none
 * — the global install's own `marketplace` left standing beside it, so the pair named two
 * different catalogues at once. That fill is right where the run ADDS global entries, because
 * those entries came from that marketplace; the last spec here is that case, in the same file so
 * the two move together.
 *
 * The global install is made from the DEFAULT public marketplace, which is the one install that
 * records no marketplace name: the name is read out of a marketplace's own manifest, and the
 * default catalogue is vendored into the binary rather than read off disk. That is the state the
 * hand-run found (a global install from `github:agents-inc/skills` with no `marketplaceName`),
 * reached offline through the seeded cache. The project is set up from the E2E marketplace, whose
 * manifest names it {@link E2E_MARKETPLACE_NAME}.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const REVIEWER = E2E_BUILTIN_AGENT.reviewer.name;

/** The global install's one skill, from the default catalogue. */
const GLOBAL_SKILL = "shared-tooling-git-hooks" as const satisfies SkillId;

/**
 * The skill the seeded checkout leaves out. The fixture's own parameter, and nothing here names
 * it, so which skill it is does not matter beyond being one no payload below asks for.
 */
const NOT_IN_THE_CHECKOUT = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

/** The global install: one default-catalogue skill on one bundled sub-agent, both global. */
const GLOBAL_INSTALL_ID = "GlobalOnly1";
/** React on web-developer, both in the project — nothing global. */
const PROJECT_ONLY_ID = "ProjectOnly1";
/** The same project, plus Vitest — still nothing global. */
const PROJECT_GROWS_ID = "ProjectGrows1";
/** React in the project, and Vitest on api-developer in the global install. */
const ADDS_GLOBAL_ID = "AddsGlobal1";

describe("a project run that adds nothing global", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();

    store.publish(
      GLOBAL_INSTALL_ID,
      buildSeedPayload({
        skills: {
          [GLOBAL_SKILL]: buildSeedSkill({
            scope: "global",
            assignments: { [REVIEWER]: "lazy" },
          }),
        },
        agents: { [REVIEWER]: { scope: "global" } },
      }),
    );
    store.publish(
      PROJECT_ONLY_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      PROJECT_GROWS_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      ADDS_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
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

  /** A fresh HOME holding a checkout of the default marketplace, so installing from it is offline. */
  async function takeEnvironment(): Promise<TestEnvironment> {
    const environment = await createTestEnvironment();
    await seedDefaultSourceCache(environment.fakeHome, { omitting: NOT_IN_THE_CHECKOUT });
    return environment;
  }

  /**
   * The global install, made at HOME from the default marketplace: no `--marketplace`, and a
   * payload naming none, which is what leaves its config without a marketplace name.
   */
  async function installGlobalFromTheDefaultMarketplace(home: string): Promise<void> {
    const installed = await CLI.run(
      ["init", "--from", GLOBAL_INSTALL_ID],
      { dir: home, globalHome: home },
      { env: { AGENTS_INC_API_URL: store.url } },
    );
    expect(installed.exitCode, `global install failed: ${installed.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  }

  /** `init --from <id>` in the project, from the E2E marketplace. */
  async function installIntoProject(environment: TestEnvironment, id: string): Promise<void> {
    const installed = await runInitFrom(
      store,
      id,
      { dir: environment.projectDir, globalHome: environment.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `project install failed: ${installed.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  }

  /** The global install's content: its skills and its compiled sub-agents. */
  function globalContent(home: string): Promise<Record<string, unknown>> {
    return readTreeSnapshot(path.join(home, DIRS.CLAUDE));
  }

  it(
    "an install registers the project and leaves the rest of the global config as it was",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await takeEnvironment();
      await installGlobalFromTheDefaultMarketplace(env.fakeHome);

      const globalBefore = await loadConfigOrFail(env.fakeHome);
      // The precondition the defect needs, held rather than assumed: a global install that
      // records no marketplace name, under a project whose marketplace has one.
      expect(globalBefore.marketplaceName).toBeUndefined();
      const typesBefore = await readTestFile(configTypesTsPath(env.fakeHome));
      const contentBefore = await globalContent(env.fakeHome);

      await installIntoProject(env, PROJECT_ONLY_ID);

      // The subject guard: the project really was set up from a marketplace with a name, so a
      // global config that stays unnamed is the merge declining to copy it, not a name that was
      // never there to copy.
      expect((await loadConfigOrFail(env.projectDir)).marketplaceName).toBe(E2E_MARKETPLACE_NAME);

      expect(
        await loadConfigOrFail(env.fakeHome),
        "a project install that adds nothing global may only register the project in the global config",
      ).toStrictEqual({ ...globalBefore, projects: [realpathSync(env.projectDir)] });
      expect(await readTestFile(configTypesTsPath(env.fakeHome))).toBe(typesBefore);
      expect(await globalContent(env.fakeHome)).toStrictEqual(contentBefore);
    },
  );

  it(
    "an edit leaves the global config byte-identical",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await takeEnvironment();
      // The project first, so its registration is already in the global config and this edit
      // has no line of its own to add there. A project install onto a machine with nothing
      // global writes the blank global pair and registers itself in it.
      await installIntoProject(env, PROJECT_ONLY_ID);
      await installGlobalFromTheDefaultMarketplace(env.fakeHome);

      const globalBefore = await loadConfigOrFail(env.fakeHome);
      expect(globalBefore.marketplaceName).toBeUndefined();
      expect(globalBefore.projects).toStrictEqual([realpathSync(env.projectDir)]);
      const globalFolderBefore = await readTreeSnapshot(
        path.dirname(configTypesTsPath(env.fakeHome)),
      );
      const contentBefore = await globalContent(env.fakeHome);

      prompt = new InteractivePrompt(["edit", "--from", PROJECT_GROWS_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(exitCode, `edit failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);

      // The subject guard: the edit really changed the project, so an untouched global config is
      // the edit leaving it alone rather than an edit that wrote nothing at all.
      expect(
        (await loadConfigOrFail(env.projectDir)).skills
          .filter((skill) => skill.scope === "project")
          .map((skill) => skill.id),
      ).toStrictEqual([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);

      expect(
        await loadConfigOrFail(env.fakeHome),
        "a project edit that adds nothing global must not change the global config",
      ).toStrictEqual(globalBefore);
      // Content and mtime of both files in the global folder: a rewrite that produced the same
      // bytes is a write all the same.
      expect(await readTreeSnapshot(path.dirname(configTypesTsPath(env.fakeHome)))).toStrictEqual(
        globalFolderBefore,
      );
      expect(await globalContent(env.fakeHome)).toStrictEqual(contentBefore);
    },
  );

  it(
    "control: an install that adds a global entry records where it came from in the global config",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      // A project-only install first leaves the blank global config, registered and naming no
      // marketplace — so what the second install writes is a fill, through the same merge.
      const first = path.join(env.fakeHome, "first-project");
      await mkdir(first);
      const installedFirst = await runInitFrom(
        store,
        PROJECT_ONLY_ID,
        { dir: first, globalHome: env.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installedFirst.exitCode, `first install failed: ${installedFirst.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const blank = await loadConfigOrFail(env.fakeHome);
      expect(blank.marketplace).toBeUndefined();
      expect(blank.marketplaceName).toBeUndefined();

      await installIntoProject(env, ADDS_GLOBAL_ID);

      const globalAfter = await loadConfigOrFail(env.fakeHome);
      expect(globalAfter.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.vitest.id]);
      // The entries this run added came from the E2E marketplace, so the global config says so.
      expect(globalAfter.marketplace).toBe(E2E_SOURCE.sourceDir);
      expect(globalAfter.marketplaceName).toBe(E2E_MARKETPLACE_NAME);
      expect(globalAfter.projects).toStrictEqual([
        realpathSync(first),
        realpathSync(env.projectDir),
      ]);
    },
  );
});
