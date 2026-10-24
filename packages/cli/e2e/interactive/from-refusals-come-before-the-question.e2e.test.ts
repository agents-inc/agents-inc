import path from "path";
import { mkdir, writeFile } from "fs/promises";
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
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  renderMetadataYaml,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  ADDED_MARKER,
  DIRS,
  EXIT_CODES,
  FILES,
  STEP_TEXT,
  TIMEOUTS,
  panelRow,
} from "../pages/constants.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * Every `--from` refusal is decided before the run lists or asks, and a refused run writes nothing.
 * Covered here: writing over a hand-written skill at a carried id, a carried id naming a path rather
 * than one directory, a carried file whose path climbs out of its skill's folder, a configuration
 * with nothing placeable, and a placement the host does not offer. Each is paired with the run it
 * must still allow.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The id intake mints for an added skill (`external-<category>-<name>`). */
const CARRIED_ID = "external-web-tooling-brainstorming";
const CARRIED_CATEGORY = "web-tooling";
const CARRIED_REPO = "obra/superpowers";

const REACT_ONLY_ID = "HandWritten0";
const CARRYING_ID = "HandWritten1";
const UNKNOWN_SKILL = "totally-unknown-skill";

/**
 * Carried skills whose ids are paths, which the worker never mints but a hand-posted link can carry:
 * one climbs from a project's skills folder into `$HOME`, one out of the scratch folder `edit` judges
 * a rewrite in.
 */
const ESCAPES_TO_HOME_ID = "EscapesHome1";
const ESCAPED_DIR_NAME = "escaped-dir";
const HOME_ESCAPING_CARRIED_ID = `../../../${ESCAPED_DIR_NAME}`;
const ESCAPES_SCRATCH_ID = "EscapesTemp1";
const VICTIM_DIR_NAME = "victim";
const SCRATCH_ESCAPING_CARRIED_ID = `../${VICTIM_DIR_NAME}`;
const VICTIM_FILE = "notes.txt";
const CARRIED_BYTES = "written by a shared configuration\n";

/** A carried file keyed out of `.claude/skills/<id>`, and one keyed into a folder inside it. */
const FILE_ESCAPES_TO_HOME_ID = "FileEscapesHome1";
const HOME_ESCAPING_FILE_KEY = `../../../../${ESCAPED_DIR_NAME}/${VICTIM_FILE}`;
const FILE_IN_A_FOLDER_ID = "FileInAFolder1";
const NESTED_FILE_KEY = `reference/${VICTIM_FILE}`;

const NOTHING_PLACEABLE_ID = "NothingPlaceable1";
const ONE_PLACEABLE_ID = "OnePlaceable1";
/** The one cell Codex does not offer. */
const PLUGIN_IN_PROJECT_ID = "PluginInProject1";
const PLUGIN_ADDED_IN_PROJECT_ID = "PluginInProject2";

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

/** Carries a file named as the one a victim directory holds, so a write there overwrites it. */
function carryingUnder(carriedId: string, victimFileKey = VICTIM_FILE) {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
      [carriedId]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    external: {
      [carriedId]: buildSeedExternalSkill({
        categoryId: CARRIED_CATEGORY,
        repo: CARRIED_REPO,
        files: {
          [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
          [victimFileKey]: CARRIED_BYTES,
        },
      }),
    },
    agents: { [WEB_DEV]: { scope: "project" } },
  });
}

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
    store.publish(ESCAPES_TO_HOME_ID, carryingUnder(HOME_ESCAPING_CARRIED_ID));
    store.publish(ESCAPES_SCRATCH_ID, carryingUnder(SCRATCH_ESCAPING_CARRIED_ID));
    store.publish(FILE_ESCAPES_TO_HOME_ID, carryingUnder(CARRIED_ID, HOME_ESCAPING_FILE_KEY));
    store.publish(FILE_IN_A_FOLDER_ID, carryingUnder(CARRIED_ID, NESTED_FILE_KEY));
    // Assigned to no sub-agent: one it is assigned to installs, empty, beside the warning.
    store.publish(
      NOTHING_PLACEABLE_ID,
      buildSeedPayload({
        skills: {
          [UNKNOWN_SKILL]: buildSeedSkill({
            scope: "project",
            assignments: {},
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
        expect(
          shown,
          "a refused install must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);

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
        // Without a terminal the panel prints and the run carries on, so a late refusal prints a
        // plan for nothing.
        expect(
          output,
          "a refused install must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);
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

        expect(shown).toContain(STEP_TEXT.PANEL_HEADER);
        expect(shown).toContain(panelRow(ADDED_MARKER, buildSeedExternalSkill().displayName));
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
          "a refused apply must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(prompt.getOutput())).toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );
        expect(flattenCliOutput(prompt.getOutput())).toContain(CARRIED_ID);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: over the directory a previous apply of the same configuration wrote, is not refused",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        // Installed by `init --from`: only the real installer writes the provenance that marks a
        // carried directory.
        await installIntoProject(env, CARRYING_ID);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEdit(env, CARRYING_ID);

        // The same configuration again changes nothing, so the run ends past the refusal
        // without asking.
        expect(await prompt.waitForExit(TIMEOUTS.WIZARD_LOAD)).toBe(EXIT_CODES.SUCCESS);
        expect(prompt.getOutput()).toContain(STEP_TEXT.EDIT_UNCHANGED);
        expect(flattenCliOutput(prompt.getOutput())).not.toContain(
          STEP_TEXT.SHARED_CONFIG_UNCARRIED_DESTINATION,
        );
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("init --from a carried skill whose id climbs out of the skills folder", () => {
    it(
      "with no terminal, refuses before it lists, and writes nothing where the id points",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        // Where `<project>/.claude/skills/../../../escaped-dir` lands: the project sits in HOME.
        const escapeTarget = path.join(env.fakeHome, ESCAPED_DIR_NAME);
        const before = await snapshotInstallSurfaces(env);

        const { exitCode, output } = await runInitFrom(
          store,
          ESCAPES_TO_HOME_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );

        // First, because it is the defect: unguarded, the carried files land here and stay.
        expect(await readTreeSnapshot(escapeTarget)).toStrictEqual({});
        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_ID_NAMES_NO_DIRECTORY);
        expect(flattenCliOutput(output)).toContain(HOME_ESCAPING_CARRIED_ID);
        expect(
          output,
          "a refused install must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });

  describe("init --from a carried skill whose file climbs out of its folder", () => {
    it(
      "with no terminal, refuses before it lists, and writes nothing where the file points",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        // Where `.claude/skills/<id>/../../../../escaped-dir` lands: the project sits in HOME.
        const escapeTarget = path.join(env.fakeHome, ESCAPED_DIR_NAME);
        const before = await snapshotInstallSurfaces(env);

        const { exitCode, output } = await runInitFrom(
          store,
          FILE_ESCAPES_TO_HOME_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );

        expect(await readTreeSnapshot(escapeTarget)).toStrictEqual({});
        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_WRONG_VERSION);
        expect(
          output,
          "a refused install must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: with the file in a folder of its own, lists and installs it there",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();

        const { exitCode, output } = await runInitFrom(
          store,
          FILE_IN_A_FOLDER_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );

        expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
        expect(output).toContain(STEP_TEXT.PANEL_HEADER);
        const carriedFile = path.join(skillsPath(env.projectDir), CARRIED_ID, NESTED_FILE_KEY);
        expect(await readTestFile(carriedFile)).toBe(CARRIED_BYTES);
        const config = await loadConfigOrFail(env.projectDir);
        expect(config.skills).toStrictEqual([
          buildSkillConfig(E2E_SKILL.react.id, {
            scope: "project",
            origin: "eject",
            displayName: E2E_SKILL.react.display,
          }),
          buildSkillConfig(CARRIED_ID, {
            scope: "project",
            origin: "eject",
            displayName: buildSeedExternalSkill().displayName,
          }),
        ]);
      },
    );
  });

  describe("edit --from a carried skill whose id climbs out of the scratch folder", () => {
    /** The folder `edit` judges a carried skill's rewrite in, holding a directory of the user's own. */
    async function seedScratchParentWithVictim(environment: TestEnvironment): Promise<string> {
      const scratchParent = path.join(environment.tempDir, "tmp");
      await mkdir(path.join(scratchParent, VICTIM_DIR_NAME), { recursive: true });
      await writeFile(path.join(scratchParent, VICTIM_DIR_NAME, VICTIM_FILE), "original\n");
      return scratchParent;
    }

    function launchEditJudgingIn(
      environment: TestEnvironment,
      id: string,
      scratchParent: string,
    ): InteractivePrompt {
      return new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome, TMPDIR: scratchParent },
      });
    }

    it(
      "refuses before it writes anything, shows the plan or asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installIntoProject(env, REACT_ONLY_ID);
        const scratchParent = await seedScratchParentWithVictim(env);
        const victim = path.join(scratchParent, VICTIM_DIR_NAME);
        const victimBefore = await readTreeSnapshot(victim);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEditJudgingIn(env, ESCAPES_SCRATCH_ID, scratchParent);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

        // First, because it is the defect: unguarded, the user's file is overwritten while the
        // question is still on screen, and a No does not restore it.
        expect(await readTreeSnapshot(victim)).toStrictEqual(victimBefore);
        expect(
          prompt.getOutput(),
          "a refused apply must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_ID_NAMES_NO_DIRECTORY);
        expect(said).toContain(SCRATCH_ESCAPING_CARRIED_ID);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );

    it(
      "control: a carried skill under the id intake mints shows the plan and asks, and leaves the user's directory beside the scratch folder alone",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installIntoProject(env, REACT_ONLY_ID);
        const scratchParent = await seedScratchParentWithVictim(env);
        // Not the folder whole: loading the config caches a transpiled copy there.
        const victim = path.join(scratchParent, VICTIM_DIR_NAME);
        const victimBefore = await readTreeSnapshot(victim);
        const before = await snapshotInstallSurfaces(env);

        prompt = launchEditJudgingIn(env, CARRYING_ID, scratchParent);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(shown).toContain(STEP_TEXT.PANEL_HEADER);
        expect(shown).toContain(panelRow(ADDED_MARKER, buildSeedExternalSkill().displayName));
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(
          STEP_TEXT.SHARED_CONFIG_ID_NAMES_NO_DIRECTORY,
        );

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await readTreeSnapshot(victim)).toStrictEqual(victimBefore);
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
        expect(shown).toContain(STEP_TEXT.PANEL_HEADER);
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
        expect(
          shown,
          "a refused install must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);

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

        expect(shown).toContain(STEP_TEXT.PANEL_HEADER);
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
          "a refused apply must not first show the panel of what it would install",
        ).not.toContain(STEP_TEXT.PANEL_HEADER);

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

        expect(shown).toContain(STEP_TEXT.PANEL_HEADER);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(CODEX_REFUSED_CELL);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await snapshotInstallSurfaces(env)).toStrictEqual(before);
      },
    );
  });
});
