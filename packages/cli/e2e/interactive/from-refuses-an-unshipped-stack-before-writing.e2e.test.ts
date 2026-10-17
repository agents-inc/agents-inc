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
 * A configuration naming a stack its marketplace does not ship is refused before anything is
 * written, by `init --from` and `edit --from`. Each refusal is paired with the shipped stack
 * installing or asking. Against the unfixed build the snapshot carries the red for `init --from`,
 * the question for `edit --from`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Composed from the shipped id, so the two cannot coincide. */
const UNSHIPPED_STACK_ID = `${E2E_STACK_ID}-before-the-rename`;

const REACT_ONLY_ID = "ReactOnly1";
const UNSHIPPED_EJECT_ID = "UnshippedEject1";
const UNSHIPPED_PLUGIN_ID = "UnshippedPlugin1";
const SHIPPED_EJECT_ID = "ShippedEject1";
const UNSHIPPED_APPLY_ID = "UnshippedApply1";
const SHIPPED_APPLY_ID = "ShippedApply1";

function projectSkill(install: SeedSkill["install"] = "eject"): SeedSkill {
  return buildSeedSkill({ install, scope: "project", assignments: { [WEB_DEV]: "lazy" } });
}

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

  /** Everything, by content and mtime: "nothing was written" is a claim about all of it. */
  async function snapshotEverything(
    environment: TestEnvironment,
  ): Promise<Record<string, TreeSnapshotEntry>> {
    const snapshot = await readTreeSnapshot(environment.tempDir);
    // `readTreeSnapshot` answers `{}` for a missing directory; the two permission files are always
    // here.
    expect(Object.keys(snapshot).length).toBeGreaterThan(0);
    return snapshot;
  }

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

      // Subject guard: the run refused for this reason, naming the stack.
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

        // HOME holds the plugin registry and known marketplaces and the project holds settings, so
        // one comparison covers all three.
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
        // The question or the exit: waiting on the exit alone would time out naming nothing.
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        const shown = prompt.getOutput();

        // First, because it is the defect: a yes copies the skill and only then refuses.
        expect(
          shown,
          "a configuration naming a stack its marketplace does not ship must be refused before the user is asked to apply it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(
          shown,
          "a refused apply must not first show a plan for what it would install",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_PROJECT);

        // Subject guard: the run reached its decision and refused for this reason.
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
