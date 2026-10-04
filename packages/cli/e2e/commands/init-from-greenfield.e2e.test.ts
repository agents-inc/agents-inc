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
 * `init --from <id>` installs into a clean project, and only ADDS to the global install above it.
 *
 * A shared configuration is installed WHOLE into the project — its `assignments` map replaces the
 * ownership-derived stack rather than merging with it — so a directory that already has an
 * installation of its own is refused, naming `uninstall` (`commands/init-from-shared-config` pins
 * it).
 *
 * The global install is different, because it is not this project's: every project on the machine
 * reads it. So a configuration carrying global entries is not refused over one. It adds the global
 * skills the global install lacks, each together with its assignment — a row on the global
 * sub-agent the configuration gives it to, even one the global install already holds — and every
 * entry the global install already holds stays exactly as installed: its skill files, its
 * sub-agent and the rows that sub-agent already has, with the configuration's differing sub-agent
 * named as kept. A payload with nothing global leaves the global install's content alone entirely,
 * and only registers the project in it.
 *
 * The last spec is a payload the config model cannot express at all: a project-pinned skill
 * assigned to a sub-agent that rests global. Those stack rows have no section to be written into,
 * so the decode refuses rather than dropping them silently.
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

    // Both sub-agents rest global, so each configuration states the same global web-developer —
    // with a different skill row. The first one installed it, so the second one adds its row to it
    // and is told the sub-agent keeps the row it already had.
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

    // What the global installation already holds, captured before the second run. Snapshots
    // rather than listings, because a file REWRITTEN in place leaves a listing identical; these
    // carry content and mtime, so a rewrite reddens.
    const globalConfigBefore = await loadConfigOrFail(env.fakeHome);
    const installedSkillBefore = await readTreeSnapshot(
      path.join(skillsPath(env.fakeHome), E2E_SKILL.react.id),
    );

    // `readTreeSnapshot` answers `{}` for an absent directory, so an install that never happened
    // would satisfy the comparisons below for free. Both sides must hold something first.
    expect(Object.keys(installedSkillBefore).length).toBeGreaterThan(0);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(globalConfigBefore.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    // A different project entirely, with no installation of its own: the global install above it
    // is added to, not refused over.
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
      new RegExp(`${STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED}[\\s\\S]*${WEB_DEV}`),
    );

    // The skill the global install lacked arrives, on both surfaces...
    const globalConfigAfter = await loadConfigOrFail(env.fakeHome);
    expect(globalConfigAfter.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.hono.id].sort(),
    );
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.hono.id].sort(),
    );
    // ...together with its assignment: the global web-developer the configuration gives it to
    // gains its row, beside the row it already had, and its compiled file loads both...
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
    // ...and everything it already held stays exactly as installed: the skill's entry and its
    // files, and the sub-agent.
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

    // The proof the second project was really set up, rather than the comparisons above passing
    // by a run that did nothing: it has a config of its own and is registered in the global one.
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
        // Pinned, because a project skill never reaches a sub-agent that rests global — and a
        // sub-agent pinned into the project is the other half of "nothing global here".
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

    // The global installation is a bystander: it neither blocked this install nor had its content
    // rewritten by it. Structural rather than byte-wise, and per key rather than wholesale — the
    // gated write DOES register the new project in the global config, which is the proof this run
    // reached the write at all rather than passing the assertions by doing nothing.
    const globalConfigAfter = await loadConfigOrFail(env.fakeHome);
    expect(globalConfigAfter.skills).toStrictEqual(globalConfigBefore.skills);
    expect(globalConfigAfter.agents).toStrictEqual(globalConfigBefore.agents);
    expect(globalConfigAfter.projects).toStrictEqual([env.projectDir, secondProjectDir]);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual(globalSkillsBefore);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual(globalAgentsBefore);
  });

  /**
   * The same bystander, from a payload whose skill comes from a domain the global install holds
   * none of. A domain belongs in the global config with a global skill from it, so a project that
   * adds an API skill for itself leaves the global install's domains where they were — and with
   * them the rest of the file, but for the project it registers.
   */
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
    // No `agents` entry pins web-developer, so it rests at the shared selection default — global —
    // while the skill is pinned to the project. Those stack rows have nowhere to be written.
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
    // Both halves of the pair, named: neither one alone tells the sharer what to change.
    expect(said).toContain(`${E2E_SKILL.react.id} -> ${WEB_DEV}`);

    // The refusal is a decode failure, so nothing was installed at either scope.
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
