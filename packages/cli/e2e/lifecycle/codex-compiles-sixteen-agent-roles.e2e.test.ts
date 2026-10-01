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

/**
 * What a Codex compile WRITES: sixteen of the eighteen shipped sub-agents as agent ROLE
 * DEFINITION files, the two summoners absent, and one line saying why.
 *
 * **Every claim here is paired with a Claude control in the same file**, because a refusal on its
 * own cannot tell a correctly-scoped filter from one that has swallowed its whole domain. A
 * payload naming three sub-agents compiles three `.md` files on Claude and one `.toml` on Codex;
 * without the Claude leg, a Codex compile that dropped everything reads exactly the same.
 *
 * **The roster is asserted by MEMBER, never by count.** `toHaveLength(1)` cannot see a swap — drop
 * `web-developer` and keep `skill-summoner` and the count is unchanged while the result is exactly
 * backwards, which is the failure this file exists to catch.
 *
 * **The file EXTENSION is part of the claim.** Until C5 there was no Codex renderer at all, and
 * the defect the guard existed against was `web-developer.md` — Claude's own format — written into
 * `.codex/agents/` by a compile that then reported success. Codex ignores such a file, nothing can
 * recognise it as ours again, and the run exits 0. So the assertions read filenames rather than
 * counting entries.
 *
 * **Why both summoners in one payload and one line for both.** All seventeen shipped stacks list
 * both, so the drop line fires on every Codex install; printed once per agent it would be two
 * lines on every install forever, and printed once per stack it would be seventeen. The spec pins
 * that exactly ONE line of the run's output names either of them, and that it names both.
 *
 * Written before the Codex agent renderer existed. Red on an empty `.codex/agents` and on the
 * absent drop line.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The two the owner ruled out of v1, and the one that stays — the whole subject in one payload. */
const AGENTS_IN_PLAY = [WEB_DEV, ...CODEX_AGENTS_LEFT_OUT] as const;

/** A sub-agent entry keeping its agent in the project, so scope is not a second variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * A reasoning effort no shipped sub-agent declares, which is why a payload has to set it.
 *
 * `high` rather than `xhigh` or `max` for no reason beyond being the middle of the five: all five
 * of this product's levels were put through the pinned binary's role deserializer and every one
 * registered, so which is chosen here is not a claim — `agent-role-toml.test.ts` is where the
 * roster is covered by member.
 */
const TUNED_EFFORT = "high";

/**
 * A model set on the sub-agent's entry. `sonnet` rather than `opus`, which every bundled agent
 * declares, so the Claude control proves the CONFIGURED value arrived rather than a default.
 */
const CONFIGURED_MODEL = "sonnet";

/** The role file each compiled sub-agent lands in, on each host. */
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

  /** One payload naming all three sub-agents, ejecting its skill so no host binary is needed. */
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

      // Both names, so the line covers both agents rather than one of them.
      for (const summoner of CODEX_AGENTS_LEFT_OUT) expect(said).toContain(summoner);

      // ONE line carries them. Counted on the raw output, because `flattenCliOutput` collapses
      // every run of whitespace and leaves nothing to count lines with. Seventeen shipped stacks
      // list both summoners and every Codex install drops them, so "once per stack" would be
      // seventeen lines and "once per agent" two — on every install, forever.
      const linesNamingASummoner = stripAnsi(output)
        .split("\n")
        .filter((line) => CODEX_AGENTS_LEFT_OUT.some((summoner) => line.includes(summoner)));

      expect(
        linesNamingASummoner,
        "the sub-agents Codex leaves out are reported on more than one line",
      ).toHaveLength(1);
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

      // The half-routed path this whole funnel exists against: Claude's own format, in Codex's
      // agents directory, reported as a successful compile.
      const everyRoleFile = await listFiles(codexProjectAgentsDir(env.projectDir));

      // Subject guard, and it is the whole test: "no .md file" is satisfied for free by a compile
      // that wrote nothing at all, which is exactly the state this spec was written against.
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
   * The per-agent reasoning effort a shared configuration carries reaches the role file.
   *
   * **It is a whole-chain claim and nothing else covers the chain.** The renderer is unit-tested
   * in `@workspace/compile` and `resolver.ts` is unit-tested for preferring the config's effort
   * over the definition's, but nothing joined the two — and the defect this replaces was exactly
   * a join: `effort` was dropped on the floor between an `AgentConfig` that carried it and a role
   * file that never mentioned it, so an install rendered byte-identically whatever the user asked
   * for. No shipped sub-agent declares an effort, so only a payload that sets one can ask this at
   * all.
   *
   * **The lines are compared as MEMBERS of the file's line list, not with `toContain` on the
   * text.** `model_reasoning_effort = "high"` has `effort = "high"` inside it, so a substring
   * check for the forbidden spelling can never fail — and that spelling is the one Codex answers
   * with `unknown field \`effort\``, dropping the whole file and the sub-agent with it.
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

      // Claude's own spelling, in the frontmatter block — the same value under a different key is
      // the whole of what the Codex renderer translates.
      expect((agent ?? "").split("\n")).toContain(`effort: ${TUNED_EFFORT}`);
    },
  );

  /**
   * **NO ROLE FILE NAMES A MODEL, EVEN ONE THE CONFIGURATION SET.** Every model this product can
   * name is Claude's, and a role naming one registers on Codex and then cannot be spawned: on a
   * real ChatGPT subscription, codex-cli 0.157.1, 2026-09-26, every compiled sub-agent failed with
   * `The 'opus' model is not supported when using Codex with a ChatGPT account.` Nothing offline
   * saw it, because every spec stopped at registration. The payload SETS a model, so a renderer
   * that passed one through has something to pass. That the compile line then names "Claude
   * models" is `codex-compile-reports-what-it-cannot-express.e2e.test.ts`'s, via `CODEX_UNEXPRESSIBLE`.
   *
   * Its control is the Claude case below: the same payload does put the model in Claude's
   * frontmatter, so the absence here is the Codex renderer's decision, not a model that never
   * arrived.
   */
  it(
    "writes no model into the role file, even one the configuration set",
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

  /** One sub-agent whose entry SETS a model, so a renderer that passes it through has one to pass. */
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
