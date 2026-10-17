import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  listFiles,
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
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * At the home directory both scopes are one directory, so `init --from` must refuse project-scoped
 * entries rather than write them into the global config. Controls: an all-global payload at home,
 * and the same payload inside a project.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("init --from <id>: project-scoped content at the global root", () => {
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

  it("refuses a project-scoped payload run at the home directory, and installs nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "HomeProj1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
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
    // Both kinds named: only the sharer knows which they meant to move.
    expect(said).toContain(`skill ${E2E_SKILL.react.id}`);
    expect(said).toContain(`sub-agent ${WEB_DEV}`);

    // The refusal lands before the install, so no success line.
    expect(said).not.toContain(STEP_TEXT.INIT_SUCCESS);

    await expectNoSourceFolder(
      env.fakeHome,
      "the refusal lands before the install, so the home holds nothing",
    );
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
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
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
    // The global skill is not the problem and must not be listed.
    expect(said).not.toContain(`skill ${E2E_SKILL.vitest.id}`);

    await expectNoSourceFolder(
      env.fakeHome,
      "the refusal lands before the install, so the home holds nothing",
    );
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("refuses a payload whose only project-scoped entry is a sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    // All skills global; a project-pinned sub-agent at home still writes `scope: "project"` into
    // the global config.
    store.publish(
      "HomeAgt03",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
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

    await expectNoSourceFolder(
      env.fakeHome,
      "the refusal lands before the install, so the home holds nothing",
    );
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("installs an all-global payload at the home directory", async () => {
    env = await createTestEnvironment({ permissions: false });
    // No `agents` entry, so the sub-agent rests at the global default: correct here.
    store.publish(
      "HomeGlob4",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
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
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
    );
    expect(homeConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "global" }));
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
  });

  it("installs the same project-scoped payload from a project directory", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The payload the first spec refuses, run inside a project.
    store.publish(
      "HomeProj1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
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
    expect(projectConfig.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
    );
    expect(projectConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([]);
  });
});
