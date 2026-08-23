import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  flattenCliOutput,
  runEditFrom,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
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

/**
 * The destructive apply from nothing, over the one plan shape no spec has ever driven: a
 * configuration that takes nothing away.
 *
 * `edit --from` makes the project MATCH the payload, and every spec of it so far has applied a
 * payload that leaves something out — so every one of them has read the removal heading. A
 * payload that only adds takes the other branch of `planHeading`, and the interesting claim is
 * that only the heading changes: the configuration is still applied whole, so the confirm is
 * still asked and a decline still has something to decline.
 *
 * The installation is made by `init --from` rather than written by a fixture, which is the
 * other half of what this file adds. Provenance is what decides whether the apply may remove a
 * directory at all, and a real install is the only thing that stamps it — a fixture has to be
 * told to, and a fixture told to do it agrees with whatever the installer does.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const INSTALLED_ID = "AddsOnly01";
const ADDS_ONLY_ID = "AddsOnly02";

/** What the install brings, and what the configuration below therefore already has. */
const INSTALLED_SKILL = E2E_SKILL.react;
/** What the applied configuration adds on top, and the only difference between the two. */
const ADDED_SKILL = E2E_SKILL.vitest;

describe("edit --from a configuration that removes nothing", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A configuration naming `skills`, all project-scoped and assigned to the one sub-agent. */
  function publish(id: string, skills: readonly string[]): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: Object.fromEntries(
          skills.map((skillId) => [
            skillId,
            buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
          ]),
        ),
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  /**
   * A project installed from nothing by `init --from`, with a HOME of its own.
   *
   * The two roots are separate because the payload is project-scoped, and at the home root the
   * two scopes are one directory — the command refuses a project-scoped configuration there
   * rather than applying it somewhere else.
   */
  async function installFromNothing(): Promise<{ dir: string; globalHome: string }> {
    const env = await createTestEnvironment();
    tempDirs.push(env.tempDir);
    publish(INSTALLED_ID, [INSTALLED_SKILL.id]);

    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    return project;
  }

  /** Starts `edit --from <id>` in a real terminal, against the stub store. */
  function launch(id: string, project: { dir: string; globalHome: string }): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], project.dir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
    });
  }

  it("says nothing is removed, and asks anyway", { timeout: TIMEOUTS.INTERACTIVE }, async () => {
    const project = await installFromNothing();
    publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);

    prompt = launch(ADDS_ONLY_ID, project);
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_NOTHING_REMOVED, TIMEOUTS.WIZARD_LOAD);

    const planned = prompt.getOutput();
    // The heading is a promise about the lines under it, so the removal one over an empty
    // list would be a lie. The line matched above is the positive subject guard for this
    // negative — both describe the same frame.
    expect(
      planned,
      "a configuration that takes nothing away must not open by promising removals",
    ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW);
    // And it still asks: what is being confirmed is the whole configuration being applied,
    // which is a change to this project whether or not anything leaves it.
    expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
  });

  it(
    "applies the whole configuration once approved, on both surfaces",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installFromNothing();
      publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);

      prompt = launch(ADDS_ONLY_ID, project);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      // Both surfaces, because either alone can look right while the other lies: a config entry
      // for a directory nothing wrote, or a directory nothing declares.
      const config = await loadConfigOrFail(project.dir);
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
        [INSTALLED_SKILL.id, ADDED_SKILL.id].sort(),
      );
      expect(await listFiles(skillsPath(project.dir))).toStrictEqual(
        [INSTALLED_SKILL.id, ADDED_SKILL.id].sort(),
      );
    },
  );

  it(
    "leaves the installation byte-identical when declined",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installFromNothing();
      publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);
      const before = await readTreeSnapshot(project.dir);

      prompt = launch(ADDS_ONLY_ID, project);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.deny();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode).toBe(EXIT_CODES.CANCELLED);
      // Not "the addition did not arrive" — nothing at all moved. A decline that rewrote
      // config.ts or recompiled an agent would still be a change the user refused.
      expect(await readTreeSnapshot(project.dir)).toStrictEqual(before);
    },
  );

  it("refuses without a terminal, and spends nothing on the store", async () => {
    const project = await installFromNothing();
    publish(ADDS_ONLY_ID, [INSTALLED_SKILL.id, ADDED_SKILL.id]);
    const before = await readTreeSnapshot(project.dir);
    const spentInstalling = store.requests.length;

    const { exitCode, output } = await runEditFrom(store, ADDS_ONLY_ID, project);

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_NEEDS_TERMINAL);
    // The refusal does not depend on what the configuration says, so a run that was already
    // over must not first fetch it — and it must not have touched anything either.
    expect(store.requests.slice(spentInstalling)).toStrictEqual([]);
    expect(await readTreeSnapshot(project.dir)).toStrictEqual(before);
  });
});
