import path from "path";
import { realpathSync } from "fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  createTestEnvironment,
  type DualScopeEnv,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { createDualScopeEnvFromSeed, installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { pluginKeyFor, readPluginRegistrations } from "../fixtures/plugin-install-state.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import {
  agentsPath,
  claudePluginInstall,
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  directoryExists,
  fileExists,
  flattenCliOutput,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  writeAgentFile,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
  panelRow,
} from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/** The loader throws while evaluating this file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** Carries no provenance marker, so it is never this CLI's to delete. */
const HAND_WRITTEN_AGENT = "my-custom-agent";

const claudeAvailable = await isClaudeCLIAvailable();

const ZUSTAND = E2E_SKILL.zustand;
const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Zustand as a plugin on web-developer, both at `scope`. */
function zustandPluginAt(scope: "global" | "project") {
  return buildSeedPayload({
    skills: {
      [ZUSTAND.id]: buildSeedSkill({
        install: "plugin",
        scope,
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope } },
  });
}

describe("uninstall removes a from-scratch install, scope by scope", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "removes the skills, agents, config and generated types of a global install",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const testEnv = await createTestEnvironment();
      tempDir = testEnv.tempDir;
      const { fakeHome } = testEnv;

      await installE2EStackGlobally(store, fakeHome);

      // Present beforehand, or a run that removed nothing would satisfy the post-conditions.
      expect((await listFiles(skillsPath(fakeHome))).length).toBeGreaterThan(0);
      expect(Object.keys(await readCompiledAgents(fakeHome)).length).toBeGreaterThan(0);
      expect(await fileExists(configTsPath(fakeHome))).toBe(true);
      expect(await fileExists(configTypesTsPath(fakeHome))).toBe(true);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.PANEL_HEADER);
      expect(output).toContain(`${REMOVED_MARKER} ${configTsPath(fakeHome)}`);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expectCleanUninstall(fakeHome, { removeConfig: true });
      expect(
        await fileExists(configTypesTsPath(fakeHome)),
        "config-types.ts must not outlive the config it was generated from",
      ).toBe(false);
    },
  );

  it(
    "removes only the project half of a dual-scope install and leaves the global half intact but deregistered",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      // Each snapshot is checked non-empty, or "unchanged" would hold trivially.
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      const globalSkillsBefore = (await listFiles(skillsPath(fakeHome))).sort();
      const globalConfigBefore = await loadConfigOrFail(fakeHome);
      const globalTypesBefore = await readTestFile(configTypesTsPath(fakeHome));
      expect(
        globalConfigBefore.projects,
        "the global config must have the project registered, or the deregistration below is vacuous",
      ).toStrictEqual([realpathSync(projectDir)]);
      expect(Object.keys(globalAgentsBefore).length).toBeGreaterThan(0);
      expect(globalSkillsBefore.length).toBeGreaterThan(0);

      expect(await fileExists(configTsPath(projectDir))).toBe(true);
      expect(Object.keys(await readCompiledAgents(projectDir)).length).toBeGreaterThan(0);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expectCleanUninstall(projectDir, { removeConfig: true });
      expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
      await expectNoSourceFolder(projectDir, "the project half is gone on every surface");

      // Byte comparisons: a rewrite that kept the files but changed them passes existence checks.
      expect(
        await readCompiledAgents(fakeHome),
        "a project uninstall must not rewrite the global compiled agents",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        (await listFiles(skillsPath(fakeHome))).sort(),
        "a project uninstall must not remove globally installed skills",
      ).toStrictEqual(globalSkillsBefore);
      expect(
        await loadConfigOrFail(fakeHome),
        "a project uninstall must deregister the project and change nothing else in the global config",
      ).toStrictEqual({ ...globalConfigBefore, projects: [] });
      expect(
        await readTestFile(configTypesTsPath(fakeHome)),
        "a project uninstall must leave the global config-types.ts byte-identical",
      ).toBe(globalTypesBefore);
    },
  );

  it(
    "still removes a real install whose config.ts has been corrupted",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const testEnv = await createTestEnvironment();
      tempDir = testEnv.tempDir;
      const { fakeHome } = testEnv;

      await installE2EStackGlobally(store, fakeHome);
      expect((await listFiles(skillsPath(fakeHome))).length).toBeGreaterThan(0);
      const agentsBeforeUninstall = await readCompiledAgents(fakeHome);
      expect(Object.keys(agentsBeforeUninstall).length).toBeGreaterThan(0);

      // Control for the sweep below: with no config, "removed everything" and "removed what this
      // CLI compiled" are the same claim until one file is neither.
      await writeAgentFile(fakeHome, HAND_WRITTEN_AGENT, { frontmatter: true });
      const handWrittenFile = path.join(agentsPath(fakeHome), `${HAND_WRITTEN_AGENT}.md`);
      const handWrittenBefore = await readTestFile(handWrittenFile);

      await writeCorruptConfig(fakeHome, SYNTAX_ERROR);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(
        output,
        "at the home directory the config uninstall could not read is the global one",
      ).toContain(STEP_TEXT.UNINSTALL_GLOBAL_CONFIG_UNREADABLE);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      expect(await fileExists(configTsPath(fakeHome))).toBe(false);
      expect(await fileExists(configTypesTsPath(fakeHome))).toBe(false);
      await expectNoSourceFolder(
        fakeHome,
        "the manifest goes even when uninstall tolerates a fault, so nothing of it is left",
      );
      await expect({ dir: fakeHome }).toHaveNoLocalSkills();

      // Compiled agents carry the provenance marker, so the plan claims them without the config.
      for (const agent of E2E_STACK_AGENTS) {
        expect(output).toContain(panelRow(REMOVED_MARKER, agent));
      }
      expect(output).not.toContain(panelRow(REMOVED_MARKER, HAND_WRITTEN_AGENT));
      expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
      expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
      expect(
        Object.keys(await readCompiledAgents(fakeHome)).sort(),
        "an unreadable config no longer strands the agents this CLI compiled, and never claimed the one it did not",
      ).toStrictEqual([`${HAND_WRITTEN_AGENT}.md`]);
      expect(await readTestFile(handWrittenFile)).toBe(handWrittenBefore);
    },
  );
});

describe.skipIf(!claudeAvailable)("a project uninstall and the plugins Claude holds", () => {
  let source: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  function zustandKey(): string {
    return pluginKeyFor(ZUSTAND.id, source.marketplaceName);
  }

  async function installZustandPlugin(
    on: TestEnvironment,
    id: string,
    scope: "global" | "project",
  ): Promise<void> {
    store.publish(id, zustandPluginAt(scope));
    const dir = scope === "global" ? on.fakeHome : on.projectDir;
    const { exitCode, output } = await runInitFrom(
      store,
      id,
      { dir, globalHome: on.fakeHome },
      source.sourceDir,
    );
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
  }

  async function zustandRegisteredAt(on: TestEnvironment): Promise<string[]> {
    const registrations = await readPluginRegistrations(on.fakeHome, zustandKey());
    return registrations.map(({ scope }) => scope).sort();
  }

  function uninstallInTheProject(on: TestEnvironment): Promise<CLIResult> {
    return CLI.run(["uninstall", "--yes"], { dir: on.projectDir, globalHome: on.fakeHome });
  }

  it(
    "leaves the global installation's plugin registered and enabled",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installZustandPlugin(env, "ZusGlob1", "global");
      await installZustandPlugin(env, "ZusProj1", "project");
      expect(
        await zustandRegisteredAt(env),
        "held at both scopes, or the global registration surviving is vacuous",
      ).toStrictEqual(["project", "user"]);

      const { exitCode, output } = await uninstallInTheProject(env);

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(await zustandRegisteredAt(env)).toStrictEqual(["user"]);
      await expect({ dir: env.fakeHome }).toHavePlugin(zustandKey());
    },
  );

  it(
    "still removes a registration at the user scope that no global installation holds",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installZustandPlugin(env, "ZusProj2", "project");
      await claudePluginInstall(zustandKey(), "user", env.projectDir, {
        configDir: path.join(env.fakeHome, DIRS.CLAUDE),
      });
      expect(await zustandRegisteredAt(env)).toStrictEqual(["project", "user"]);

      const { exitCode, output } = await uninstallInTheProject(env);

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(await zustandRegisteredAt(env)).toStrictEqual([]);
    },
  );

  it(
    "takes away the .claude/ its plugin install left, once Claude has emptied its plugin list",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installZustandPlugin(env, "ZusProj3", "project");
      await expect({ dir: env.projectDir }).toHavePlugin(zustandKey());

      const { exitCode, output } = await uninstallInTheProject(env);
      const said = flattenCliOutput(output);

      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
      expect(
        Object.keys(await readTreeSnapshot(path.join(env.projectDir, DIRS.CLAUDE))),
      ).toStrictEqual([]);
      expect(await directoryExists(path.join(env.projectDir, DIRS.CLAUDE))).toBe(false);
      expect(said).toContain(STEP_TEXT.UNINSTALL_CLAUDE_DIR_REMOVED);
      expect(said).not.toContain(STEP_TEXT.UNINSTALL_CLAUDE_DIR_KEPT);
    },
  );
});
