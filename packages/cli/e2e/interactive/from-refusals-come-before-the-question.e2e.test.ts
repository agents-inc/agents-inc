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
 * Every `--from` refusal is decided before the run lists what it would install or asks whether to
 * install it — so a user is never asked to confirm something that will then be refused — and a
 * refused run writes nothing.
 *
 * The refusals that already worked that way: a carried skill asked for as a plugin, a carried
 * skill claiming a catalogue id, project-scoped content at the home directory, an existing
 * installation. Two did not, and each is a describe below.
 *
 * **The write-over of a hand-written skill.** A configuration can carry a skill no catalogue has,
 * its whole directory inline, under an id minted for it — `external-<category>-<name>`. A skill id
 * IS the directory the skill installs into, so where the project already keeps a directory of
 * that name that no shared configuration put there (the user's own skill, written by hand),
 * installing would write the payload's bytes over it. The run refuses that — after listing,
 * asking "Install this configuration?" (or "Apply this configuration?") and being told yes.
 *
 * **A configuration this catalogue can place nothing of.** Every id it names is one the loaded
 * catalogue does not know, so the decode keeps nothing — and `init` listed two empty lists, asked,
 * and only after the yes said there was nothing to install.
 *
 * **A placement the host does not offer.** Codex offers three of the four mode/scope cells, so a
 * configuration asking for the fourth is refused on Codex. `init` decides that in its install
 * spine, after the question, though the decoded configuration and the host are all it reads;
 * `edit` has no pre-flight for the configuration at all, so after the yes it starts installing and
 * fails on the host's own per-plugin guard.
 *
 * Each refusal here is paired, in this file, with the run it must still allow, so a guard grown to
 * refuse its whole domain could not stay green: with no directory at the carried id `init` lists
 * and asks; over a directory a previous apply of the same configuration wrote `edit` asks; with one
 * skill the catalogue can place beside the unknown one `init` lists and asks; and on Claude, which
 * offers every cell, the same configuration lists and asks, from either command.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The id intake mints for an added skill, and the category it was placed in. */
const CARRIED_ID = "external-web-tooling-brainstorming";
const CARRIED_CATEGORY = "web-tooling";
const CARRIED_REPO = "obra/superpowers";

/** React alone, in the project: an installation with nothing carried in it. */
const REACT_ONLY_ID = "HandWritten0";
/** React, and the carried skill beside it, both in the project. */
const CARRYING_ID = "HandWritten1";
/** An id no catalogue here knows — what the decode skips and reports. */
const UNKNOWN_SKILL = "totally-unknown-skill";

/** Only the unknown id: nothing this catalogue can place. */
const NOTHING_PLACEABLE_ID = "NothingPlaceable1";
/** React, and the unknown id beside it: one skill this catalogue can place. */
const ONE_PLACEABLE_ID = "OnePlaceable1";
/** React installed as a plugin into the project: the one cell Codex does not offer. */
const PLUGIN_IN_PROJECT_ID = "PluginInProject1";
/** React as installed, and Vitest added as a plugin into the project — the same cell, by `edit`. */
const PLUGIN_ADDED_IN_PROJECT_ID = "PluginInProject2";

/** The project, whole, and the folders an installation keeps under HOME. */
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

  /**
   * The user's own skill at the carried id: a real local skill, metadata and all, and no
   * `forkedFrom` — the one field that says a shared configuration put a directory here.
   */
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

  /**
   * Every place a run can write: the whole project, and each folder an installation keeps under
   * HOME. Not HOME whole — the project sits inside it, and the cache a load drops there is not an
   * install.
   */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE_SRC)),
      readTreeSnapshot(codexHome(environment.fakeHome)),
    ]);
    return { project, home };
  }

  /** `init --from <id>` in a real terminal, in the project, under the environment's HOME. */
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

  /** `edit --from <id>` in a real terminal, in the project, under the environment's HOME. */
  function launchEdit(environment: TestEnvironment, id: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
  }

  /** An installation in the project, made the way a user makes one. */
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
        // The question OR the exit: a run that asks waits for an answer, so waiting for the exit
        // alone would end in a timeout that names nothing. This hands the assertions below a run
        // that has either asked or stopped.
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        const shown = prompt.getOutput();

        // First, because it is the defect: a run that asks here goes on to refuse the yes, so
        // its exit is never reached without an answer.
        expect(
          shown,
          "a refused install must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
        expect(shown, "a refused install must not first list what it would install").not.toContain(
          STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
        );

        // The subject guard for the two negatives: the run reached its decision and refused for
        // this reason, rather than never starting.
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(prompt.getOutput())).toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );
        expect(flattenCliOutput(prompt.getOutput())).toContain(CARRIED_ID);
        // Content and mtime, under the project and every installation folder under HOME: the
        // user's own skill above all, which is what the refusal exists to protect.
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
        // Without a terminal the lists are printed and the run carries on, so a refusal that
        // comes after them prints a plan for an install that never happens.
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
        // Installed by `init --from` rather than by a fixture: what tells a carried directory
        // from a hand-written one is the provenance only the real installer writes.
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
        // The skip is the refusal's explanation, so it is said: which id this catalogue lacks.
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
