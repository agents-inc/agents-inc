import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * A global installation holds only global-scoped content, and `init --from` is the one producer
 * that never asked.
 *
 * The home directory IS the global scope — `resolveInstallPaths` sends both scopes to the same
 * directory there, and the config gate writes ONE config rather than splitting — so a payload's
 * `scope: "project"` entry does not land somewhere else, it lands in the global config wearing a
 * label that contradicts the file it is in. Nothing downstream can notice: `toClaudePluginScope`
 * maps the DECLARED scope, so what the boundary lets through becomes the truth, and a plugin skill
 * is registered against `$HOME` as a project rather than for the user.
 *
 * The interactive producer has always answered this question — `init.tsx` computes
 * `isHomeDirectory(projectDir)` and the wizard's scope toggles are inert under it — so the refusal
 * here is what puts the two producers back on the same rule rather than a new one.
 *
 * Two things this must NOT do, and each has its own spec: refuse an all-global payload at home (the
 * case the invariant exists to protect), and refuse a project-scoped payload anywhere else (project
 * scope is exactly right inside a project).
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry that keeps its agent in the project rather than at the default scope. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("init --from <id>: project-scoped content at the global root", () => {
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

  it("refuses a project-scoped payload run at the home directory, and installs nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "HomeProj1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "HomeProj1",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_HINT);
    // Named rather than counted, and both kinds: the skill and the sub-agent are separate
    // decisions in the payload, and only the sharer knows which one they meant to move.
    expect(said).toContain(`skill ${E2E_SKILL.react.id}`);
    expect(said).toContain(`sub-agent ${WEB_DEV}`);

    // A refused run reports no success of any kind — the refusal lands before the install spine,
    // not after it has already said the work was done.
    expect(said).not.toContain(STEP_TEXT.INIT_SUCCESS);

    // Nothing written, on every surface a home install writes to.
    expect(await listFiles(env.fakeHome)).not.toContain(DIRS.CLAUDE_SRC);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("refuses a mixed payload on the same terms, naming only what is project-scoped", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "HomeMix02",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "HomeMix02",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
    expect(said).toContain(`skill ${E2E_SKILL.react.id}`);
    // The global-scoped skill is not the problem and must not be listed as one — a sharer who
    // moves it to fix this message has been sent to change the wrong entry.
    expect(said).not.toContain(`skill ${E2E_SKILL.vitest.id}`);

    expect(await listFiles(env.fakeHome)).not.toContain(DIRS.CLAUDE_SRC);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("refuses a payload whose only project-scoped entry is a sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    // Every skill is global, so the skill half of the rule has nothing to say. A sub-agent pinned
    // to the project still writes `scope: "project"` into the global config and compiles its `.md`
    // into the same `~/.claude/agents/` a global one would, so the contradiction is identical.
    store.publish(
      "HomeAgt03",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "HomeAgt03",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
    expect(said).toContain(`sub-agent ${WEB_DEV}`);

    expect(await listFiles(env.fakeHome)).not.toContain(DIRS.CLAUDE_SRC);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("installs an all-global payload at the home directory", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The case the invariant exists to protect. No `agents` entry, so the sub-agent rests at the
    // shared selection default — which is global, and therefore correct here.
    store.publish(
      "HomeGlob4",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "HomeGlob4",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode, `all-global install at home failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    const homeConfig = await loadConfigOrFail(env.fakeHome);
    expect(homeConfig.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
    );
    expect(homeConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "global" }));
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
  });

  it("installs the same project-scoped payload from a project directory", async () => {
    env = await createTestEnvironment({ permissions: false });
    // Byte-for-byte the payload the first spec refuses. What changed is where it was run, which is
    // the whole of the rule: project scope is exactly right inside a project.
    store.publish(
      "HomeProj1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "HomeProj1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode, `project install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(projectConfig.skills).toStrictEqual(buildSkillConfigs([E2E_SKILL.react.id]));
    expect(projectConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    // Nothing project-scoped reached the home directory — the guard's subject is where the
    // install root is, not where the content ends up being mentioned.
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([]);
  });
});
