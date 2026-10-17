import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  listFiles,
  readTreeSnapshot,
  loadConfigOrFail,
  skillsPath,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/**
 * `init --from` installs into a clean project and only adds to the global install: missing global
 * skills arrive with their assignment, existing entries stay as installed, and a payload with
 * nothing global only registers the project. The last spec is a pair the config model cannot
 * express, which the decode refuses.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("init --from <id> into a clean project", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("adds what a global installation lacks and leaves what it holds as installed", async () => {
    env = await createTestEnvironment({ permissions: false });
    const secondProjectDir = path.join(env.fakeHome, "second-project");
    await mkdir(secondProjectDir, { recursive: true });

    // Both configurations state the global web-developer with different rows, so the second adds
    // its row and says so.
    store.publish(
      "GlobalA01",
      buildSeedPayload({ skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() } }),
    );
    store.publish(
      "GlobalB02",
      buildSeedPayload({ skills: { [E2E_SKILL.hono.id]: ejectedGlobalSkill() } }),
    );

    const first = await runInitFrom(
      store,
      "GlobalA01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);

    // Snapshots, not listings: they carry mtime, so an in-place rewrite reddens.
    const globalConfigBefore = await loadConfigOrFail(env.fakeHome);
    const installedSkillBefore = await readTreeSnapshot(
      path.join(skillsPath(env.fakeHome), E2E_SKILL.react.id),
    );

    // `readTreeSnapshot` answers `{}` for an absent directory, so both sides must hold something.
    expect(Object.keys(installedSkillBefore).length).toBeGreaterThan(0);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(globalConfigBefore.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    // A different project with no installation: the global install is added to, not refused over.
    const second = await runInitFrom(
      store,
      "GlobalB02",
      { dir: secondProjectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(second.exitCode, `install failed: ${second.output}`).toBe(EXIT_CODES.SUCCESS);
    const said = flattenCliOutput(second.output);
    expect(said).toMatch(
      new RegExp(`${STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL}[\\s\\S]*${E2E_SKILL.hono.id}`),
    );
    expect(said).toMatch(
      new RegExp(
        `${STEP_TEXT.SHARED_CONFIG_ADDED_TO_GLOBAL}[\\s\\S]*sub-agent ${WEB_DEV}: \\+ ${E2E_SKILL.hono.id}`,
      ),
    );
    expect(said, "a sub-agent the run adds a skill to is not kept as installed").not.toContain(
      STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED,
    );

    const globalConfigAfter = await loadConfigOrFail(env.fakeHome);
    expect(globalConfigAfter.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.hono.id].sort(),
    );
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.hono.id].sort(),
    );
    // The global web-developer gains the new row beside its existing one, and its compiled file
    // loads both.
    expect(
      globalConfigAfter.stack,
      "a skill the global install lacked must arrive with its row, beside the rows already there",
    ).toStrictEqual({
      [WEB_DEV]: {
        "web-framework": [sa(E2E_SKILL.react.id)],
        "api-api": [sa(E2E_SKILL.hono.id)],
      },
    });
    await expect({ dir: env.fakeHome }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
    });
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
    // Everything already held stays exactly as installed.
    expect(
      globalConfigAfter.skills.filter((skill) => skill.id !== E2E_SKILL.hono.id),
      "a project install must not change a skill the global install holds",
    ).toStrictEqual(globalConfigBefore.skills);
    expect(
      globalConfigAfter.agents,
      "a project install must not change a sub-agent the global install holds",
    ).toStrictEqual(globalConfigBefore.agents);
    expect(
      await readTreeSnapshot(path.join(skillsPath(env.fakeHome), E2E_SKILL.react.id)),
    ).toStrictEqual(installedSkillBefore);

    // Proof the second project was really set up, so the comparisons are not passing on a no-op.
    await loadConfigOrFail(secondProjectDir);
    expect(globalConfigAfter.projects).toStrictEqual([env.projectDir, secondProjectDir]);
  });

  it("installs a payload with nothing global into a clean project despite a global installation", async () => {
    env = await createTestEnvironment({ permissions: false });
    const secondProjectDir = path.join(env.fakeHome, "second-project");
    await mkdir(secondProjectDir, { recursive: true });

    store.publish(
      "GlobalC03",
      buildSeedPayload({ skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() } }),
    );
    store.publish(
      "Project04",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // Pinned: a project skill never reaches a global sub-agent.
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );

    const first = await runInitFrom(
      store,
      "GlobalC03",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);

    const globalSkillsBefore = await listFiles(skillsPath(env.fakeHome));
    const globalAgentsBefore = await listFiles(agentsPath(env.fakeHome));
    const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

    const second = await runInitFrom(
      store,
      "Project04",
      { dir: secondProjectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(second.exitCode, `project-only install failed: ${second.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(await listFiles(skillsPath(secondProjectDir))).toStrictEqual([E2E_SKILL.vitest.id]);
    expect(await listFiles(agentsPath(secondProjectDir))).toStrictEqual([`${WEB_DEV}.md`]);

    // Per key, not byte-wise: the write does register the new project, which proves the run reached
    // it.
    const globalConfigAfter = await loadConfigOrFail(env.fakeHome);
    expect(globalConfigAfter.skills).toStrictEqual(globalConfigBefore.skills);
    expect(globalConfigAfter.agents).toStrictEqual(globalConfigBefore.agents);
    expect(globalConfigAfter.projects).toStrictEqual([env.projectDir, secondProjectDir]);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual(globalSkillsBefore);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual(globalAgentsBefore);
  });

  /** A domain the global install holds none of stays out of its config. */
  it("leaves the global config as it was, but for registering the project, when nothing global arrives from another domain", async () => {
    env = await createTestEnvironment({ permissions: false });
    const secondProjectDir = path.join(env.fakeHome, "second-project");
    await mkdir(secondProjectDir, { recursive: true });

    store.publish(
      "GlobalE05",
      buildSeedPayload({ skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() } }),
    );
    store.publish(
      "ApiOnly06",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.hono.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );

    const first = await runInitFrom(
      store,
      "GlobalE05",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);
    const { projects: _registeredBefore, ...globalBefore } = await loadConfigOrFail(env.fakeHome);
    expect(
      globalBefore.selectedDomains,
      "the global install holds web skills alone, so the API skill's domain is not among its own",
    ).toStrictEqual(["web"]);

    const second = await runInitFrom(
      store,
      "ApiOnly06",
      { dir: secondProjectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(second.exitCode, `project-only install failed: ${second.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(await listFiles(skillsPath(secondProjectDir))).toStrictEqual([E2E_SKILL.hono.id]);

    const { projects: registeredAfter, ...globalAfter } = await loadConfigOrFail(env.fakeHome);
    expect(
      globalAfter.selectedDomains,
      "a domain only the project's own skills come from must not join the global install's",
    ).toStrictEqual(globalBefore.selectedDomains);
    expect(globalAfter, "nothing global arrived, so nothing global changed").toStrictEqual(
      globalBefore,
    );
    expect(registeredAfter).toStrictEqual([env.projectDir, secondProjectDir]);
  });

  it("refuses a project-scoped skill assigned to a sub-agent that rests global, naming both", async () => {
    env = await createTestEnvironment({ permissions: false });
    // web-developer rests at the global default while its skill is pinned to the project, so the
    // rows have nowhere to go.
    store.publish(
      "Unpaired5",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "Unpaired5",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNWRITABLE_PAIR);
    // Both halves named: neither alone tells the sharer what to change.
    expect(said).toContain(`${E2E_SKILL.react.id} -> ${WEB_DEV}`);

    // A decode failure, so nothing is installed at either scope.
    await expectNoSourceFolder(
      env.projectDir,
      "the refusal is a decode failure, so nothing was installed at project scope",
    );
    await expectNoSourceFolder(
      env.fakeHome,
      "the refusal is a decode failure, so nothing was installed at global scope",
    );
  });
});
