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
import {
  CODEX_REFUSED_CELL,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  codexHome,
  createLocalSkill,
  flattenCliOutput,
  readTreeSnapshot,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * Every `--from` refusal is decided before the run lists or asks, and a refused run writes nothing.
 * Covered here: writing over a hand-written skill at a carried id, a configuration with nothing
 * placeable, and a placement the host does not offer. Each is paired with the run it must still
 * allow.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The id intake mints for an added skill (`external-<category>-<name>`). */
const CARRIED_ID = "external-web-tooling-brainstorming";
const CARRIED_CATEGORY = "web-tooling";
const CARRIED_REPO = "obra/superpowers";

const REACT_ONLY_ID = "HandWritten0";
const CARRYING_ID = "HandWritten1";
const UNKNOWN_SKILL = "totally-unknown-skill";

const NOTHING_PLACEABLE_ID = "NothingPlaceable1";
const ONE_PLACEABLE_ID = "OnePlaceable1";
/** The one cell Codex does not offer. */
const PLUGIN_IN_PROJECT_ID = "PluginInProject1";
const PLUGIN_ADDED_IN_PROJECT_ID = "PluginInProject2";

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

describe("--from refusals come before the lists and the question", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      REACT_ONLY_ID,
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
      CARRYING_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [CARRIED_ID]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [CARRIED_ID]: buildSeedExternalSkill({
            categoryId: CARRIED_CATEGORY,
            repo: CARRIED_REPO,
            files: {
              [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
            },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      NOTHING_PLACEABLE_ID,
      buildSeedPayload({
        skills: {
          [UNKNOWN_SKILL]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
      }),
    );
    store.publish(
      ONE_PLACEABLE_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [UNKNOWN_SKILL]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      PLUGIN_ADDED_IN_PROJECT_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      PLUGIN_IN_PROJECT_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
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

  /** No `forkedFrom`: the field that says a shared configuration put a directory here. */
  async function writeHandWrittenSkill(projectDir: string): Promise<void> {
    await createLocalSkill(projectDir, CARRIED_ID, {
      description: "The house's own way of brainstorming",
      metadata: renderMetadataYaml({
        author: "@vince",
        displayName: "House Brainstorming",
        category: CARRIED_CATEGORY,
        slug: "house-brainstorming",
        cliDescription: "The house's own way of brainstorming",
        usageGuidance: "Use when brainstorming the way this house does",
        contentHash: "a1b2c3d",
        custom: true,
      }),
    });
  }

  /** Not HOME whole: the project sits inside it, and a load's cache is not an install. */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
      readTreeSnapshot(codexHome(environment.fakeHome)),
    ]);
    return { project, home };
  }

  function launchInit(
    environment: TestEnvironment,
    id: string,
    extraArgs: readonly string[] = [],
  ): InteractivePrompt {
    return new InteractivePrompt(
      ["init", "--from", id, "--marketplace", E2E_SOURCE.sourceDir, ...extraArgs],
      environment.projectDir,
      { env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome } },
    );
  }

  function launchEdit(environment: TestEnvironment, id: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
  }

  async function installIntoProject(environment: TestEnvironment, id: string): Promise<void> {
    const installed = await runInitFrom(
      store,
      id,
      { dir: environment.projectDir, globalHome: environment.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
  }

  describe("init --from over a hand-written skill at a carried skill's id", () => {
    it(
      "refuses before it lists or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await writeHandWrittenSkill(env.projectDir);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, CARRYING_ID);
        // The question or the exit: waiting on the exit alone would time out naming nothing.
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        // First, because it is the defect: a run that asks here refuses the yes.
        expect(
          shown,
          "a refused install must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(shown, "a refused install must not first list what it would install").not.toContain(
          STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
        );

        // Subject guard: the run reached its decision and refused for this reason.
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(prompt.getOutput())).toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );
        expect(flattenCliOutput(prompt.getOutput())).toContain(CARRIED_ID);
        // Content and mtime everywhere a run can write, the user's own skill above all.
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "with no terminal, refuses before it lists, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await writeHandWrittenSkill(env.projectDir);
        const before = await snapshotInstallSurfaces(env);

        const { exitCode, output } = await runInitFrom(
          store,
          CARRYING_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );

        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION);
        // Without a terminal the lists print and the run carries on, so a late refusal prints a
        // plan for nothing.
        expect(output, "a refused install must not first list what it would install").not.toContain(
          STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
        );
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: with no directory at the carried id, lists and asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, CARRYING_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).toContain(CARRIED_ID);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("edit --from over a hand-written skill at a carried skill's id", () => {
    it(
      "refuses before it shows the plan or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installIntoProject(env, REACT_ONLY_ID);
        await writeHandWrittenSkill(env.projectDir);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, CARRYING_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "a refused apply must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(
          shown,
          "a refused apply must not first show a plan for what it would install",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_NOTHING_REMOVED);

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(prompt.getOutput())).toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );
        expect(flattenCliOutput(prompt.getOutput())).toContain(CARRIED_ID);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: over the directory a previous apply of the same configuration wrote, asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        // Installed by `init --from`: only the real installer writes the provenance that marks a
        // carried directory.
        await installIntoProject(env, CARRYING_ID);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, CARRYING_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

        expect(prompt.getOutput()).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(flattenCliOutput(prompt.getOutput())).not.toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("init --from a configuration this catalogue can place nothing of", () => {
    it(
      "refuses before it lists or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, NOTHING_PLACEABLE_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "a refused install must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_NOTHING_INSTALLABLE);
        // The skip explains the refusal, so it names the missing id.
        expect(said).toContain(STEP_TEXT.CATALOG_DOES_NOT_KNOW);
        expect(said).toContain(UNKNOWN_SKILL);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: with one skill it can place beside the unknown one, lists and asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, ONE_PLACEABLE_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(flattenCliOutput(shown)).toContain(STEP_TEXT.CATALOG_DOES_NOT_KNOW);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(STEP_TEXT.SHARED_CONFIG_NOTHING_INSTALLABLE);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("init --from on Codex, asking for a placement Codex does not offer", () => {
    it(
      "refuses before it lists or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, PLUGIN_IN_PROJECT_ID, PROVIDER_CODEX);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "a refused install must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(shown, "a refused install must not first list what it would install").not.toContain(
          STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
        );

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(CODEX_REFUSED_CELL);
        expect(said).toContain(E2E_SKILL.react.id);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: on Claude, which offers that placement, lists and asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotInstallSurfaces(env);

        prompt = launchInit(env, PLUGIN_IN_PROJECT_ID, PROVIDER_CLAUDE);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(CODEX_REFUSED_CELL);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("edit --from on Codex, asking for a placement Codex does not offer", () => {
    it(
      "refuses before it shows the plan or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        const installed = await runInitFromOnCodex(
          store,
          REACT_ONLY_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, PLUGIN_ADDED_IN_PROJECT_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(
          shown,
          "a refused apply must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(
          shown,
          "a refused apply must not first show a plan for what it would install",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(CODEX_REFUSED_CELL);
        expect(said).toContain(E2E_SKILL.vitest.id);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: on Claude, which offers that placement, shows the plan and asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installIntoProject(env, REACT_ONLY_ID);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, PLUGIN_ADDED_IN_PROJECT_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(CODEX_REFUSED_CELL);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });
});
