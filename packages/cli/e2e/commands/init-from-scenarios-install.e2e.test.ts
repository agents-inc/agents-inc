import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
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
  flattenCliOutput,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * `init --from <id>`: how a payload's per-skill `install` and `scope` land on disk, and what a
 * payload naming things this catalog does not have is allowed to do.
 *
 * `install` and `scope` are per SKILL, not per configuration, so one shared id can mix them —
 * and each combination routes files somewhere different: eject copies into a skills directory,
 * plugin registers with the Claude CLI instead, and global sends either to HOME rather than the
 * project. Unknown ids are never fatal: payloads carry catalog slugs precisely so a configuration
 * shared before a rename still installs everything else.
 *
 * Every payload here pins its sub-agent to `scope: "project"` in the `agents` map. A payload that
 * names no agent scope takes the shared selection default and lands in the user's own ~/.claude,
 * which would move the very directories and config halves these assertions read. Saying it on the
 * wire is also what keeps the skill-scope subject discriminating: the agent's destination has to be
 * fixed independently for "a global skill does not drag its agent with it" to mean anything.
 *
 * Covers Phase 5 scenarios 8, 10 and 11 of the tracker's `--from` matrix.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const UNKNOWN_SKILL_ID = "web-framework-not-in-this-catalog";
const UNKNOWN_AGENT_NAME = "not-a-sub-agent-either";

/** A sub-agent entry that keeps its agent in the project rather than at the default scope. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * The registry the Claude CLI keeps under the HOME it was run with, as a plain
 * map from plugin ref to its installation records.
 *
 * Read as text first and asserted on before parsing: a missing registry file
 * means the install never reached the Claude CLI at all, which is a different
 * (and more interesting) failure than a ref the registry does not carry.
 */
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
 * Asserts the skill content really landed where the registry says it did.
 *
 * The registry entry and the copied files are two separate acts of
 * `claude plugin install`, and only the second one is the skill. Reading the
 * path back out of the registry (rather than rebuilding the cache layout here)
 * is what makes this an end-to-end check of the install rather than of the
 * CLI's own naming convention.
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

    // The project config inlines the global entry, so it shows both — with the global one still
    // marked global rather than silently re-homed into the project.
    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(projectConfig.skills).toStrictEqual([
      ...buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
      ...buildSkillConfigs([E2E_SKILL.vitest.id]),
    ]);
    expect(projectConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    // The global config owns the global entry, and nothing else: a skill's scope never moves the
    // sub-agent that holds it, which the payload pinned into the project on its own authority.
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
    );
    expect(globalConfig.agents).toStrictEqual([]);

    // Exhaustive directory listings, not "contains": a skill copied to BOTH scopes would satisfy
    // a subset check at either one.
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

    // Skipping is never fatal — a catalog rename must not retroactively break every shared id.
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Named rather than counted, on both axes: a count cannot be acted on.
    expect(flattenCliOutput(output)).toContain(UNKNOWN_SKILL_ID);
    expect(flattenCliOutput(output)).toContain(UNKNOWN_AGENT_NAME);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual(buildSkillConfigs([E2E_SKILL.react.id]));
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
  });

  it("drops a sub-agent switched off, and the assignments naming it", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The web app never sends `on: false` — it omits an unselected sub-agent entirely. Defensive:
    // an explicit "off" must win over an assignment that would otherwise select the sub-agent.
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
    // The switched-off sub-agent's assignment said `preloaded` — that must not leak onto the
    // sub-agent that IS installed, and must not mint a stack entry of its own.
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
  });
});

/**
 * Plugin mode hands the install to the Claude CLI, so these need the real binary. The local E2E
 * source has no marketplace of its own — a payload asking for `install: "plugin"` against it fails
 * on marketplace resolution, which is its own (correct) error rather than anything this path
 * controls — so they run against a built plugin source instead.
 */
describe.skipIf(!claudeAvailable)("init --from <id>: mixed install modes", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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
      const reactRef = buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName);
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

      // "eject" is a source in its own right; anything else names the marketplace it came from,
      // which is what tells a later uninstall which registry key it owns.
      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(projectConfig.skills).toStrictEqual([
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global" }),
        ...buildSkillConfigs([E2E_SKILL.react.id], { origin: fixture.marketplaceName }),
      ]);
      expect(projectConfig.marketplaceName).toBe(fixture.marketplaceName);

      // A plugin skill is registered with the Claude CLI, never copied — so the project's skills
      // directory holds nothing, and only the ejected global one reaches HOME.
      await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.vitest.id]);

      // Three independent witnesses that the plugin really installed, because each
      // one alone has a passing state the others would catch: the registry record
      // (written even by an install that copied nothing), the content behind the
      // path that record names, and the settings entry that makes Claude load it.
      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(reactRef);
      await expectPluginContentInstalled(env.fakeHome, reactRef, E2E_SKILL.react.id);
      await expect({ dir: env.projectDir }).toHavePlugin(reactRef);

      // And that the CLI said so — the per-skill line, not the "N skill plugins"
      // count, which reads the same whether one skill installed or none did.
      expect(flattenCliOutput(output)).toContain(`Installed ${reactRef}`);
    },
  );

  it(
    "installs a global-scoped plugin skill at user scope when run in the home directory",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const reactRef = buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName);
      // The reported shape: `init --from` run at HOME against a real marketplace. The
      // payload's `scope: "global"` is what maps to the Claude CLI's `user` scope, so
      // the install is registered for every project rather than for this directory.
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

      // Home scope IS the collapse of project and global onto one directory: cwd,
      // HOME and the install root are all fakeHome.
      const { exitCode, output } = await runInitFrom(
        store,
        "HomeMode1",
        { dir: env.fakeHome, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Payload order, unlike the project case: a home install writes one config
      // rather than splitting by scope, so nothing re-groups the entries.
      const homeConfig = await loadConfigOrFail(env.fakeHome);
      expect(homeConfig.skills).toStrictEqual([
        ...buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "global",
          origin: fixture.marketplaceName,
        }),
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global" }),
      ]);
      expect(homeConfig.marketplaceName).toBe(fixture.marketplaceName);

      // Only the ejected skill is copied; the plugin one is registered instead.
      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.vitest.id]);

      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(reactRef, "user");
      await expectPluginContentInstalled(env.fakeHome, reactRef, E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHavePlugin(reactRef);
      expect(flattenCliOutput(output)).toContain(`Installed ${reactRef}`);
    },
  );
});
