import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  fileExists,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";

/**
 * `init --from`: per-skill `install` and `scope` route files (eject copies, plugin registers with
 * the Claude CLI, global goes to HOME); unknown ids are skipped, never fatal. Sub-agents are pinned
 * to the project so skill scope is the only variable.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const UNKNOWN_SKILL_ID = "web-framework-not-in-this-catalog";
const UNKNOWN_AGENT_NAME = "not-a-sub-agent-either";

const PINNED_TO_PROJECT = { scope: "project" } as const;

/** Read as text first: a missing registry means the install never reached the Claude CLI. */
async function readInstallPaths(home: string, ref: string): Promise<string[]> {
  const registryPath = path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON);
  expect(await fileExists(registryPath), `no plugin registry at ${registryPath}`).toBe(true);

  const registry: { plugins?: Record<string, Array<{ installPath?: string }>> } = JSON.parse(
    await readTestFile(registryPath),
  );
  const installations = registry.plugins?.[ref] ?? [];
  expect(installations.length, `registry carries no installation for "${ref}"`).toBeGreaterThan(0);

  return installations.map((installation) => {
    expect(installation.installPath, `installation for "${ref}" carries no installPath`).toBeTypeOf(
      "string",
    );
    return installation.installPath ?? "";
  });
}

/**
 * Reads the path from the registry rather than rebuilding the cache layout, so the install itself
 * is checked.
 */
async function expectPluginContentInstalled(home: string, ref: string, skillId: string) {
  for (const installPath of await readInstallPaths(home, ref)) {
    const skillMdPath = path.join(installPath, DIRS.SKILLS, skillId, FILES.SKILL_MD);
    expect(
      await fileExists(skillMdPath),
      `plugin "${ref}" registered ${installPath} but ${skillMdPath} does not exist`,
    ).toBe(true);
  }
}

const claudeAvailable = await isClaudeCLIAvailable();

describe("init --from <id>: install scopes and unknown ids", () => {
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

  it("routes each skill to the scope its own entry names", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Scopes01",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Scopes01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The project config inlines the global entry, still marked global.
    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(projectConfig.skills).toStrictEqual([
      ...buildSkillConfigs([E2E_SKILL.react.id], {
        scope: "global",
        displayName: E2E_SKILL.react.display,
      }),
      ...buildSkillConfigs([E2E_SKILL.vitest.id], { displayName: E2E_SKILL.vitest.display }),
    ]);
    expect(projectConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    // A skill's scope never moves the sub-agent that holds it.
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], {
        scope: "global",
        displayName: E2E_SKILL.react.display,
      }),
    );
    expect(globalConfig.agents).toStrictEqual([]);

    // Exhaustive: a skill copied to both scopes would pass a subset check.
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.vitest.id]);
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([]);
  });

  it("names both the skills and the sub-agents it skipped, and installs the rest", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Unknown1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy", [UNKNOWN_AGENT_NAME]: "lazy" },
          }),
          [UNKNOWN_SKILL_ID]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "Unknown1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    // A catalog rename must not break every shared id.
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).toContain(UNKNOWN_SKILL_ID);
    expect(flattenCliOutput(output)).toContain(UNKNOWN_AGENT_NAME);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { displayName: E2E_SKILL.react.display }),
    );
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
  });

  it("names HOME's skills folder when a run from a project put every copy there", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Report01",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "Report01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    const said = flattenCliOutput(output);
    expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said, "the folder the copies are in, not one spelled from the scope root").toContain(
      `Copied 2 skills to ${skillsPath(env.fakeHome)}/`,
    );
    // Subject guard: the copies are under HOME, and only there.
    expect((await listFiles(skillsPath(env.fakeHome))).sort()).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
    );
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
  });

  it("names the project's skills folder for a copy that landed in it, and counts one as one", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Report02",
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
      "Report02",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    const said = flattenCliOutput(output);
    expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said).toContain(`Copied 1 skill to ${skillsPath(env.projectDir)}/`);
    expect(said).toContain("Selected 1 skill");
    expect(said).not.toContain("Selected 1 skills");
    expect(said).toContain("Configuration saved (1 agent)");
    expect(said).toContain("Compiled 1 agent");
    expect(said).not.toContain("Compiled 1 agents");
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    await expect({ dir: env.fakeHome }).toHaveNoLocalSkills();
  });

  it("drops a sub-agent switched off, and the assignments naming it", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The web app omits unselected sub-agents; an explicit `on: false` must still win over an
    // assignment.
    store.publish(
      "SwitchOff",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy", [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT, [API_DEV]: { on: false } },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "SwitchOff",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));
    // The switched-off sub-agent's `preloaded` must not leak or mint a stack entry.
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
  });
});

/**
 * Plugin mode needs the real Claude binary and a built plugin source; the local E2E source has no
 * marketplace.
 */
describe.skipIf(!claudeAvailable)("init --from <id>: mixed install modes", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "installs a plugin skill and an ejected one from the same payload",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const reactRef = pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName);
      store.publish(
        "Modes001",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({
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
        "Modes001",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Anything but "eject" names its marketplace, which tells uninstall which registry key it
      // owns.
      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(projectConfig.skills).toStrictEqual([
        ...buildSkillConfigs([E2E_SKILL.vitest.id], {
          scope: "global",
          displayName: E2E_SKILL.vitest.display,
        }),
        ...buildSkillConfigs([E2E_SKILL.react.id], {
          origin: fixture.marketplaceName,
          displayName: E2E_SKILL.react.display,
        }),
      ]);
      expect(projectConfig.marketplaceName).toBe(fixture.marketplaceName);

      await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.vitest.id]);

      // Three witnesses, each catching what the others miss: the registry record, the content
      // behind its path, and the settings entry.
      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(reactRef);
      await expectPluginContentInstalled(env.fakeHome, reactRef, E2E_SKILL.react.id);
      await expect({ dir: env.projectDir }).toHavePlugin(reactRef);

      // The per-skill line, not the count, which reads the same whether one or none installed.
      const said = flattenCliOutput(output);
      expect(said).toContain(`Installed ${reactRef}`);

      // The copy names HOME's folder, and neither count pluralises one.
      expect(said).toContain(`Copied 1 local skill to ${skillsPath(env.fakeHome)}/`);
      expect(said).toContain("Installed 1 skill plugin");
      expect(said).not.toContain("Installed 1 skill plugins");
    },
  );

  it(
    "installs a global-scoped plugin skill at user scope when run in the home directory",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const reactRef = pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName);
      // `scope: "global"` maps to the Claude CLI's `user` scope.
      store.publish(
        "HomeMode1",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
        }),
      );

      // At home, cwd, HOME and the install root are all fakeHome.
      const { exitCode, output } = await runInitFrom(
        store,
        "HomeMode1",
        { dir: env.fakeHome, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // A home install writes one config, so entries stay in payload order.
      const homeConfig = await loadConfigOrFail(env.fakeHome);
      expect(homeConfig.skills).toStrictEqual([
        ...buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "global",
          origin: fixture.marketplaceName,
          displayName: E2E_SKILL.react.display,
        }),
        ...buildSkillConfigs([E2E_SKILL.vitest.id], {
          scope: "global",
          displayName: E2E_SKILL.vitest.display,
        }),
      ]);
      expect(homeConfig.marketplaceName).toBe(fixture.marketplaceName);

      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.vitest.id]);

      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(reactRef, "user");
      await expectPluginContentInstalled(env.fakeHome, reactRef, E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHavePlugin(reactRef);
      expect(flattenCliOutput(output)).toContain(`Installed ${reactRef}`);
    },
  );
});
