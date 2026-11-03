import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { CODEX_AGENTS_LEFT_OUT } from "../fixtures/codex-agent-roles.js";
import { configIn, INSTALL_WITH } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupFixture, cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { Provider } from "../../src/cli/consts.js";

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const [SUMMONER] = CODEX_AGENTS_LEFT_OUT;

const BESIDE_A_PROJECT_AGENT = "GlobCount1";
const EVERY_AGENT_GLOBAL = "GlobCount2";
const HOME_INSTALLATION = "GlobCount3";

/** Two global sub-agents, one of which Codex never compiles; Claude compiles both. */
const CASES = [
  {
    provider: "codex",
    hint: STEP_TEXT.COMPILE_GLOBAL_SCOPE_HINT_ONE,
    installing: STEP_TEXT.INSTALLING_ONE_SKILL_ACROSS_ONE,
  },
  {
    provider: "claude",
    hint: STEP_TEXT.COMPILE_GLOBAL_SCOPE_HINT_TWO,
    installing: STEP_TEXT.INSTALLING_ONE_SKILL_ACROSS_TWO,
  },
] as const satisfies readonly { provider: Provider; hint: string; installing: string }[];

/**
 * The home's installation goes in first, then the project names no provider unless it is Codex. A
 * Claude project under a Codex home is the subject: another provider's global never reaches it.
 */
const UNDER_AN_INSTALLED_HOME = [
  {
    home: "codex",
    project: "claude",
    installing: STEP_TEXT.INSTALLING_ONE_SKILL_ACROSS_TWO,
    compiled: STEP_TEXT.COMPILED_TWO_AGENTS,
  },
  {
    home: "codex",
    project: "codex",
    installing: STEP_TEXT.INSTALLING_ONE_SKILL_ACROSS_ONE,
    compiled: STEP_TEXT.COMPILED_ONE_AGENT,
  },
  {
    home: "claude",
    project: "claude",
    installing: STEP_TEXT.INSTALLING_ONE_SKILL_ACROSS_TWO,
    compiled: STEP_TEXT.COMPILED_TWO_AGENTS,
  },
] as const satisfies readonly {
  home: Provider;
  project: Provider;
  installing: string;
  compiled: string;
}[];

describe("the global sub-agents a project install points home to", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  const envs: TestEnvironment[] = [];

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
    // Ejected, so no host binary is needed; a sub-agent no skill reaches is not installed.
    store.publish(
      BESIDE_A_PROJECT_AGENT,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded", [SUMMONER]: "preloaded" },
          }),
        },
        agents: {
          [WEB_DEV]: { scope: "project" },
          [API_DEV]: { scope: "global" },
          [SUMMONER]: { scope: "global" },
        },
      }),
    );
    store.publish(
      EVERY_AGENT_GLOBAL,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded", [SUMMONER]: "preloaded" },
          }),
        },
        agents: { [API_DEV]: { scope: "global" }, [SUMMONER]: { scope: "global" } },
      }),
    );
    // Another skill on a sub-agent the project's own names, so a compile from either covers both.
    store.publish(
      HOME_INSTALLATION,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [API_DEV]: { scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
    await Promise.all(envs.map((env) => cleanupTempDir(env.tempDir)));
  });

  async function freshEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    envs.push(env);
    return env;
  }

  async function installInto(
    project: ProjectHandle,
    provider: Provider,
    id: string,
  ): Promise<string> {
    const { exitCode, stdout, output } = await INSTALL_WITH[provider](
      store,
      id,
      project,
      fixture.sourceDir,
    );
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    return stdout;
  }

  async function installFromAProject(
    provider: Provider,
    id: string,
  ): Promise<{ env: TestEnvironment; stdout: string }> {
    const env = await freshEnvironment();
    const stdout = await installInto(
      { dir: env.projectDir, globalHome: env.fakeHome },
      provider,
      id,
    );
    return { env, stdout };
  }

  describe.each(CASES)("on $provider", ({ provider, hint, installing }) => {
    it(
      "init counts, after the project's own steps, only the global sub-agents this host compiles",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const { stdout } = await installFromAProject(provider, BESIDE_A_PROJECT_AGENT);

        expect(stdout).toContain(`  3. ${hint}\n`);
      },
    );

    describe("with every sub-agent global", () => {
      let installed: { env: TestEnvironment; stdout: string };

      beforeAll(async () => {
        installed = await installFromAProject(provider, EVERY_AGENT_GLOBAL);
      }, TIMEOUTS.PLUGIN_TEST);

      it("init announces its skill across only the sub-agents this host compiles", () => {
        expect(installed.stdout).toContain(`${installing}\n`);
      });

      it("init points at the global config and counts only the sub-agents this host compiles", () => {
        expect(installed.stdout).toContain(
          [
            "To customize agent-skill assignments:",
            `  1. Edit ${configIn(installed.env.fakeHome, provider)}`,
            `  2. ${hint}`,
            "",
          ].join("\n"),
        );
      });

      it(
        "compile in the project counts only the global sub-agents this host compiles",
        { timeout: TIMEOUTS.PLUGIN_TEST },
        async () => {
          const { env } = installed;

          const { exitCode, stdout, output } = await CLI.run(["compile"], {
            dir: env.projectDir,
            globalHome: env.fakeHome,
          });

          expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
          expect(stdout).toContain(`${STEP_TEXT.NO_AGENTS_TO_RECOMPILE}\n${hint}\n`);
        },
      );
    });
  });

  describe.each(UNDER_AN_INSTALLED_HOME)(
    "on $project, under a home holding a $home installation",
    ({ home, project, installing, compiled }) => {
      it(
        "init announces its skill across as many sub-agents as it then compiles",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          const env = await freshEnvironment();
          await installInto(
            { dir: env.fakeHome, globalHome: env.fakeHome },
            home,
            HOME_INSTALLATION,
          );

          const stdout = await installInto(
            { dir: env.projectDir, globalHome: env.fakeHome },
            project,
            EVERY_AGENT_GLOBAL,
          );

          expect(stdout).toContain(`${installing}\n`);
          expect(stdout).toContain(`\n${compiled}\n`);
        },
      );
    },
  );
});
