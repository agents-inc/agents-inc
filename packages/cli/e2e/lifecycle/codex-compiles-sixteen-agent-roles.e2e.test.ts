import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CODEX_AGENTS_LEFT_OUT,
  codexGlobalAgentsDir,
  codexProjectAgentsDir,
  readCodexAgentRoles,
} from "../fixtures/codex-agent-roles.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
  listFiles,
  readCompiledAgents,
  stripAnsi,
} from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The two left out of v1, and the one that stays. */
const AGENTS_IN_PLAY = [WEB_DEV, ...CODEX_AGENTS_LEFT_OUT] as const;

// Pinned to the project so scope is not a second variable.
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** No shipped sub-agent declares an effort, so the payload sets one; which level is not a claim. */
const TUNED_EFFORT = "high";

/** Not `opus`, which every bundled agent declares, so the control proves the configured value. */
const CONFIGURED_MODEL = "sonnet";

function claudeAgentFiles(agents: readonly string[]): string[] {
  return agents.map((agent) => `${agent}.md`).sort();
}

function codexRoleFiles(agents: readonly string[]): string[] {
  return agents.map((agent) => `${agent}${FILES.CODEX_AGENT_EXTENSION}`).sort();
}

describe("a Codex compile writes sixteen of the eighteen sub-agents", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Ejects its skill so no host binary is needed. */
  function publishThreeAgents(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: Object.fromEntries(
              AGENTS_IN_PLAY.map((agent) => [agent, "lazy"] as const),
            ),
          }),
        },
        agents: Object.fromEntries(
          AGENTS_IN_PLAY.map((agent) => [agent, PINNED_TO_PROJECT] as const),
        ),
      }),
    );
  }

  it(
    "writes a .toml role for every sub-agent it compiles, and none for the two it leaves out",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishThreeAgents("CdxRoles1");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const roles = await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir));

      expect(Object.keys(roles).sort()).toStrictEqual(codexRoleFiles([WEB_DEV]));
      for (const summoner of CODEX_AGENTS_LEFT_OUT) {
        expect(
          Object.keys(roles),
          `${summoner} was compiled onto Codex, which v1 leaves out`,
        ).not.toContain(`${summoner}${FILES.CODEX_AGENT_EXTENSION}`);
      }
    },
  );

  it(
    "compiles all three on Claude, which is what makes the Codex omission a decision",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishThreeAgents("CdxRoles2");

      const { exitCode, output } = await runInitFromOnClaude(
        store,
        "CdxRoles2",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      expect((await listFiles(agentsPath(env.projectDir))).sort()).toStrictEqual(
        claudeAgentFiles(AGENTS_IN_PLAY),
      );
    },
  );

  it(
    "says once, in one line, which sub-agents Codex does not get and why",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishThreeAgents("CdxRoles3");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles3",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      // Counted on the raw output: `flattenCliOutput` collapses the line breaks. Only lines naming
      // Codex count, since the pre-install roster list names both summoners too.
      const linesSayingCodexLeavesThemOut = stripAnsi(output)
        .split("\n")
        .filter(
          (line) =>
            line.includes("Codex") &&
            CODEX_AGENTS_LEFT_OUT.some((summoner) => line.includes(summoner)),
        );

      expect(
        linesSayingCodexLeavesThemOut,
        "the sub-agents Codex leaves out are reported on more than one line",
      ).toHaveLength(1);
      for (const summoner of CODEX_AGENTS_LEFT_OUT) {
        expect(linesSayingCodexLeavesThemOut[0]).toContain(summoner);
      }
    },
  );

  it(
    "says nothing about the summoners on Claude, where both are compiled",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishThreeAgents("CdxRoles4");

      const { exitCode, output } = await runInitFromOnClaude(
        store,
        "CdxRoles4",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      expect(said).not.toContain("Codex");
    },
  );

  it(
    "writes no Claude-format agent anywhere a Codex install can reach",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishThreeAgents("CdxRoles5");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles5",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const everyRoleFile = await listFiles(codexProjectAgentsDir(env.projectDir));

      expect(
        everyRoleFile.sort(),
        "the compile wrote no role file at all, so the absence below proves nothing",
      ).toStrictEqual(codexRoleFiles([WEB_DEV]));
      expect(everyRoleFile.filter((file) => file.endsWith(".md"))).toStrictEqual([]);

      expect(await readCompiledAgents(env.projectDir)).toStrictEqual({});
      expect(await readCompiledAgents(env.fakeHome)).toStrictEqual({});
      expect(await directoryExists(path.join(env.projectDir, ".claude"))).toBe(false);
    },
  );

  it(
    "puts a global installation's roles under CODEX_HOME rather than in the project",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxRoles6",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" } },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles6",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      expect(
        Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(env.fakeHome))).sort(),
      ).toStrictEqual(codexRoleFiles([WEB_DEV]));
      expect(
        Object.keys(await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir))),
      ).toStrictEqual([]);
    },
  );

  /**
   * Lines are compared as members: `model_reasoning_effort = "high"` contains `effort = "high"`,
   * the spelling Codex refuses.
   */
  it(
    "carries a configured effort into the role file, under the key Codex accepts",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxRoles7",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { ...PINNED_TO_PROJECT, effort: TUNED_EFFORT } },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles7",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const roles = await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir));
      const role = roles[`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`];
      expect(role, "no role file was written, so nothing below is a measurement").toBeDefined();

      const lines = (role ?? "").split("\n");
      expect(lines).toContain(`model_reasoning_effort = "${TUNED_EFFORT}"`);
      expect(lines, "the spelling Codex refuses, which costs the whole file").not.toContain(
        `effort = "${TUNED_EFFORT}"`,
      );
    },
  );

  it(
    "carries the same effort into Claude's own frontmatter, which is what makes the key a translation",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxRoles8",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { ...PINNED_TO_PROJECT, effort: TUNED_EFFORT } },
        }),
      );

      const { exitCode, output } = await runInitFromOnClaude(
        store,
        "CdxRoles8",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const compiled = await readCompiledAgents(env.projectDir);
      const agent = compiled[`${WEB_DEV}.md`];
      expect(
        agent,
        "no Claude agent was compiled, so nothing below is a measurement",
      ).toBeDefined();

      expect((agent ?? "").split("\n")).toContain(`effort: ${TUNED_EFFORT}`);
    },
  );

  /** A role naming a Claude model registers on Codex but cannot be spawned. */
  it(
    "writes no Claude model into the role file, even one the configuration set",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishWithAModel("CdxRoles9");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxRoles9",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const roles = await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir));
      const role = roles[`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`];
      expect(role, "no role file was written, so nothing below is a measurement").toBeDefined();

      expect(
        (role ?? "").split("\n").filter((line) => /^model\s*=/.test(line)),
        "a Claude model reached a Codex role, which Codex refuses to spawn",
      ).toStrictEqual([]);
    },
  );

  it(
    "puts that same model in Claude's frontmatter, which makes the Codex absence a decision",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishWithAModel("CdxRoles10");

      const { exitCode, output } = await runInitFromOnClaude(
        store,
        "CdxRoles10",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const agent = (await readCompiledAgents(env.projectDir))[`${WEB_DEV}.md`];
      expect(
        agent,
        "no Claude agent was compiled, so nothing below is a measurement",
      ).toBeDefined();
      expect((agent ?? "").split("\n")).toContain(`model: ${CONFIGURED_MODEL}`);
    },
  );

  /** Sets a model, so a renderer that passes it through has one to pass. */
  function publishWithAModel(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { ...PINNED_TO_PROJECT, model: CONFIGURED_MODEL } },
      }),
    );
  }
});
