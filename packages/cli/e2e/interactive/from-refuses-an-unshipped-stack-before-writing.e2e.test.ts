import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  E2E_AGENT,
  E2E_SKILL,
  E2E_STACK_DESCRIPTION,
  E2E_STACK_ID,
} from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  flattenCliOutput,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

import type { TreeSnapshotEntry } from "../helpers/test-utils.js";
import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";

/**
 * A shared configuration naming a stack its marketplace does not ship is refused before anything
 * is written — by `init --from` and by `edit --from` alike.
 *
 * A payload's `stackId` is metadata: its skills and their assignments are the data, and the stack
 * supplies only the `description` the installed `config.ts` records. The editor writes a
 * marketplace's own stack id into every configuration it mints from that marketplace, so an id
 * minted before the marketplace's author renamed or dropped the stack names one the marketplace no
 * longer ships — as does a built-in stack id over any marketplace but the default one.
 *
 * Both producers looked the id up only when they came to write the configuration — after the run
 * had registered the marketplace and installed and enabled its plugins, or copied its skills. So
 * the refusal landed on a half-finished install: plugins enabled in the project with no
 * `.agents-inc/` beside them, or skill directories no configuration names. Every other `--from`
 * refusal is decided before the run lists what it would install, which
 * `interactive/from-refusals-come-before-the-question` holds, and this one has to be as well.
 *
 * Each refusal is paired, in this file, with the run it must still allow: the same configuration
 * naming the stack the marketplace DOES ship installs from `init --from` and records that stack's
 * description, and `edit --from` shows its plan and asks.
 *
 * Which assertion carries the red against the unfixed build differs by door. With no terminal
 * `init --from` installs and then refuses, so it is the snapshot. `edit --from` needs a terminal,
 * where a run reaches its writes only through a yes, and a refusal decided before the question
 * leaves no question to answer — so there it is the question.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * A stack the marketplace does not ship: the id a configuration minted before the marketplace's
 * author renamed the stack still carries. Composed from the id it does ship, so the two cannot
 * coincide.
 */
const UNSHIPPED_STACK_ID = `${E2E_STACK_ID}-before-the-rename`;

/** React in the project: the installation `edit --from` is applied over. */
const REACT_ONLY_ID = "ReactOnly1";
/** React ejected into the project, under the unshipped stack. */
const UNSHIPPED_EJECT_ID = "UnshippedEject1";
/** React installed as a plugin into the project, under the unshipped stack. */
const UNSHIPPED_PLUGIN_ID = "UnshippedPlugin1";
/** React ejected into the project, under the stack the marketplace ships. */
const SHIPPED_EJECT_ID = "ShippedEject1";
/** React as installed, and Vitest added beside it, under the unshipped stack. */
const UNSHIPPED_APPLY_ID = "UnshippedApply1";
/** The same apply, under the stack the marketplace ships. */
const SHIPPED_APPLY_ID = "ShippedApply1";

/** A skill in the project, on web-developer. */
function projectSkill(install: SeedSkill["install"] = "eject"): SeedSkill {
  return buildSeedSkill({ install, scope: "project", assignments: { [WEB_DEV]: "lazy" } });
}

/** A configuration with web-developer pinned to the project, beside the skills it is handed. */
function projectConfiguration(
  stackId: SeedPayload["stackId"],
  skills: SeedPayload["skills"],
): SeedPayload {
  return buildSeedPayload({ stackId, skills, agents: { [WEB_DEV]: { scope: "project" } } });
}

const claudeAvailable = await isClaudeCLIAvailable();

describe("--from refuses a stack its marketplace does not ship before writing anything", () => {
  let store: SeedConfigStore;
  let pluginSource: E2EPluginSource;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
    store = await startSeedConfigStore();
    store.publish(
      REACT_ONLY_ID,
      projectConfiguration(null, { [E2E_SKILL.react.id]: projectSkill() }),
    );
    store.publish(
      UNSHIPPED_EJECT_ID,
      projectConfiguration(UNSHIPPED_STACK_ID, { [E2E_SKILL.react.id]: projectSkill() }),
    );
    store.publish(
      UNSHIPPED_PLUGIN_ID,
      projectConfiguration(UNSHIPPED_STACK_ID, { [E2E_SKILL.react.id]: projectSkill("plugin") }),
    );
    store.publish(
      SHIPPED_EJECT_ID,
      projectConfiguration(E2E_STACK_ID, { [E2E_SKILL.react.id]: projectSkill() }),
    );
    store.publish(
      UNSHIPPED_APPLY_ID,
      projectConfiguration(UNSHIPPED_STACK_ID, {
        [E2E_SKILL.react.id]: projectSkill(),
        [E2E_SKILL.vitest.id]: projectSkill(),
      }),
    );
    store.publish(
      SHIPPED_APPLY_ID,
      projectConfiguration(E2E_STACK_ID, {
        [E2E_SKILL.react.id]: projectSkill(),
        [E2E_SKILL.vitest.id]: projectSkill(),
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
   * Every file the environment holds, by content and mtime: the project, and the HOME its
   * installations, the plugin registry and the Claude CLI's own state all live under. Read whole
   * rather than folder by folder, because "nothing was written" is a claim about all of it.
   */
  async function snapshotEverything(
    environment: TestEnvironment,
  ): Promise<Record<string, TreeSnapshotEntry>> {
    const snapshot = await readTreeSnapshot(environment.tempDir);
    // `readTreeSnapshot` answers `{}` for a directory that is not there, so two reads of the wrong
    // path would agree for free. The environment's two permission files are always here.
    expect(Object.keys(snapshot).length).toBeGreaterThan(0);
    return snapshot;
  }

  /** `edit --from <id>` in a real terminal, in the project, under the environment's HOME. */
  function launchEdit(environment: TestEnvironment, id: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], environment.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
    });
  }

  describe("init --from", () => {
    it("with no terminal, refuses an unshipped stack before it lists, and writes nothing", async () => {
      env = await createTestEnvironment();
      const before = await snapshotEverything(env);

      const { exitCode, output } = await runInitFrom(
        store,
        UNSHIPPED_EJECT_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        E2E_SOURCE.sourceDir,
      );

      // The subject guard for the snapshot below: the run reached its decision and refused for
      // this reason, naming the stack it was asked for.
      expect(exitCode, output).toBe(EXIT_CODES.ERROR);
      const said = flattenCliOutput(output);
      expect(said).toContain(STEP_TEXT.SHARED_CONFIG_STACK_NOT_OFFERED);
      expect(said).toContain(`'${UNSHIPPED_STACK_ID}'`);

      expect(
        await readTreeSnapshot(env.tempDir),
        "a configuration naming a stack its marketplace does not ship must be refused before any skill is copied",
      ).toStrictEqual(before);
      expect(output, "a refused install must not first list what it would install").not.toContain(
        STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
      );
    });

    it.skipIf(!claudeAvailable)(
      "as a plugin, with no terminal, refuses an unshipped stack before it registers anything",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        const before = await snapshotEverything(env);

        const { exitCode, output } = await runInitFrom(
          store,
          UNSHIPPED_PLUGIN_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          pluginSource.sourceDir,
        );

        expect(exitCode, output).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(output);
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_STACK_NOT_OFFERED);
        expect(said).toContain(`'${UNSHIPPED_STACK_ID}'`);

        // HOME whole holds the Claude CLI's plugin registry and the marketplaces it knows, and the
        // project holds the settings that enable a plugin, so this one comparison covers all three.
        expect(
          await readTreeSnapshot(env.tempDir),
          "a configuration naming a stack its marketplace does not ship must be refused before a marketplace is registered or a plugin installed",
        ).toStrictEqual(before);
        expect(output, "a refused install must not first list what it would install").not.toContain(
          STEP_TEXT.SHARED_CONFIG_LIST_PROJECT,
        );
      },
    );

    it("control: naming the stack the marketplace ships, installs and records that stack's description", async () => {
      env = await createTestEnvironment();

      const { exitCode, output } = await runInitFrom(
        store,
        SHIPPED_EJECT_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        E2E_SOURCE.sourceDir,
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(flattenCliOutput(output)).not.toContain(STEP_TEXT.SHARED_CONFIG_STACK_NOT_OFFERED);
      expect(
        (await loadConfigOrFail(env.projectDir)).description,
        "the stack resolved, so the configuration records its description",
      ).toBe(E2E_STACK_DESCRIPTION);
      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    });
  });

  describe("edit --from", () => {
    /** An installation in the project, made the way a user makes one. */
    async function installReactIntoProject(environment: TestEnvironment): Promise<void> {
      const installed = await runInitFrom(
        store,
        REACT_ONLY_ID,
        { dir: environment.projectDir, globalHome: environment.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    }

    it(
      "refuses an unshipped stack before it shows the plan or asks, and writes nothing",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installReactIntoProject(env);
        const before = await snapshotEverything(env);

        prompt = launchEdit(env, UNSHIPPED_APPLY_ID);
        // The question OR the exit: a run that asks waits for an answer, so waiting for the exit
        // alone would end in a timeout that names nothing.
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        // First, because it is the defect: a yes to this question copies the skill and only then
        // refuses, leaving it on disk with no configuration naming it.
        expect(
          shown,
          "a configuration naming a stack its marketplace does not ship must be refused before the user is asked to apply it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(
          shown,
          "a refused apply must not first show a plan for what it would install",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);

        // The subject guard for the two negatives: the run reached its decision and refused for
        // this reason, rather than never starting.
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        const said = flattenCliOutput(prompt.getOutput());
        expect(said).toContain(STEP_TEXT.SHARED_CONFIG_STACK_NOT_OFFERED);
        expect(said).toContain(`'${UNSHIPPED_STACK_ID}'`);
        expect(await readTreeSnapshot(env.tempDir)).toStrictEqual(before);
      },
    );

    it(
      "control: naming the stack the marketplace ships, shows the plan and asks",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        env = await createTestEnvironment();
        await installReactIntoProject(env);
        const before = await snapshotEverything(env);

        prompt = launchEdit(env, SHIPPED_APPLY_ID);
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);
        expect(shown).toContain(E2E_SKILL.vitest.id);
        expect(shown).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(flattenCliOutput(shown)).not.toContain(STEP_TEXT.SHARED_CONFIG_STACK_NOT_OFFERED);

        await prompt.deny();
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
        expect(await readTreeSnapshot(env.tempDir)).toStrictEqual(before);
      },
    );
  });
});
