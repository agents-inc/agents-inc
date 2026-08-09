import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  flattenCliOutput,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * `init --from <id>` is greenfield-only.
 *
 * A shared configuration is installed WHOLE — its `assignments` map replaces the ownership-derived
 * stack rather than merging with it — so there is no coherent answer to what should happen when it
 * meets a setup that is already there. The command refuses instead of guessing, and names
 * `uninstall` as the way through.
 *
 * The refusal has two halves, and the second is the reason the first cannot simply be
 * "any installation anywhere": a project that is itself clean may still be about to write into the
 * user's own ~/.claude, and only a payload carrying global-scoped entries does that. A payload with
 * nothing global installs into a clean project regardless of what the home directory holds, which
 * is what the second spec here holds the first one to.
 *
 * The third refusal is a payload the config model cannot express at all: a project-pinned skill
 * assigned to a sub-agent that rests global. Those stack rows have no section to be written into,
 * so the decode refuses rather than dropping them silently.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A skill that lands in the user's own ~/.claude, and so makes a payload a global install. */
function globalSkill(skillId: string) {
  return { [skillId]: buildSeedSkill({ scope: "global", assignments: { [WEB_DEV]: "lazy" } }) };
}

describe("init --from <id>: greenfield only", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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

  it("refuses a payload with global-scoped entries when a global installation already exists", async () => {
    env = await createTestEnvironment({ permissions: false });
    const secondProjectDir = path.join(env.fakeHome, "second-project");
    await mkdir(secondProjectDir, { recursive: true });

    store.publish("GlobalA01", buildSeedPayload({ skills: globalSkill(E2E_SKILL.react.id) }));
    store.publish("GlobalB02", buildSeedPayload({ skills: globalSkill(E2E_SKILL.hono.id) }));

    const first = await runInitFrom(
      store,
      "GlobalA01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(await loadConfigOrFail(env.fakeHome)).toMatchObject({
      skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
    });

    // Everything the refused run must leave exactly as it found it, captured before it runs.
    const globalConfigBefore = await readTestFile(configTsPath(env.fakeHome));
    const globalSkillsBefore = await listFiles(skillsPath(env.fakeHome));
    const globalAgentsBefore = await listFiles(agentsPath(env.fakeHome));

    // A different project entirely — this one has no installation of its own, so the global
    // install is the only thing standing in the way.
    const second = await runInitFrom(
      store,
      "GlobalB02",
      { dir: secondProjectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_INSTALL);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNINSTALL_HINT);

    // The second project is untouched...
    expect(await listFiles(secondProjectDir)).not.toContain(DIRS.CLAUDE_SRC);
    // ...and so is the install that blocked it, on both sides.
    expect(await readTestFile(configTsPath(env.fakeHome))).toBe(globalConfigBefore);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual(globalSkillsBefore);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual(globalAgentsBefore);
  });

  it("installs a payload with nothing global into a clean project despite a global installation", async () => {
    env = await createTestEnvironment({ permissions: false });
    const secondProjectDir = path.join(env.fakeHome, "second-project");
    await mkdir(secondProjectDir, { recursive: true });

    store.publish("GlobalC03", buildSeedPayload({ skills: globalSkill(E2E_SKILL.react.id) }));
    store.publish(
      "Project04",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.vitest.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
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

  it("refuses a project-scoped skill assigned to a sub-agent that rests global, naming both", async () => {
    env = await createTestEnvironment({ permissions: false });
    // No `agents` entry pins web-developer, so it rests at the shared selection default — global —
    // while the skill is pinned to the project. Those stack rows have nowhere to be written.
    store.publish(
      "Unpaired5",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
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
    expect(await listFiles(env.projectDir)).not.toContain(DIRS.CLAUDE_SRC);
    expect(await listFiles(env.fakeHome)).not.toContain(DIRS.CLAUDE_SRC);
  });
});
