import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CODEX_UNEXPRESSIBLE,
  codexProjectAgentsDir,
  readCodexAgentRoles,
} from "../fixtures/codex-agent-roles.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { cleanupFixture, cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";

/**
 * The six things a Codex agent role file cannot express, reported ONCE per compile.
 *
 * **Why reported at all, rather than quietly not emitted.** A frontmatter field with no Codex
 * expression cannot be guessed at: Codex's deserializer is strict, and one unlisted key drops the
 * WHOLE file. So the renderer omits these — and an omission the user is not told about is a
 * sub-agent whose permission mode, isolation or preloaded skills silently stopped applying. The
 * one that bites hardest today is `tools`: it is a configuration struct on Codex rather than an
 * allowlist, so **the five read-only sub-agents can still edit files there**, which is a fact
 * about the host and not a bug this CLI can fix.
 *
 * Measured against the pinned `@openai/codex` 0.155.1, 2026-09-22, each role file on its own under
 * a pinned HOME and CODEX_HOME with the global config deleted first:
 *
 *     tools = ["Read"]   -> data did not match any variant of untagged enum
 *                           WebSearchToolConfigInput          (whole file dropped)
 *     permissionMode     -> unknown field `permissionMode`    (whole file dropped)
 *     isolation          -> unknown field `isolation`         (whole file dropped)
 *     experimental       -> unknown field `experimental`      (whole file dropped)
 *     skills = ["a"]     -> invalid type: string "a", expected struct BundledSkillsConfig
 *     skills = { enabled = true }                             (accepted — a toggle, not a preload list)
 *
 * **Once per compile, not once per agent and not once per scope.** Sixteen sub-agents times two
 * scopes is thirty-two lines of one fact. The spec counts occurrences rather than asserting
 * presence, because presence is satisfied by thirty-two of them.
 *
 * **Paired with the Claude control in the same file.** Claude expresses all six, so the line must
 * be absent from a Claude run — without that leg, a notice printed unconditionally on every
 * provider reads exactly the same.
 *
 * Written before the Codex agent renderer existed. Red on the absent line.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry keeping its agent in the project, so scope is not a second variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** How many times `needle` appears in `haystack`. */
function occurrencesOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("a Codex compile reports what Codex cannot express", () => {
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

  /** One ejected skill on one project sub-agent — the smallest payload that compiles an agent. */
  function publishOneAgent(id: string): void {
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
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );
  }

  it(
    "names every one of the six, exactly once, in one run",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishOneAgent("CdxExpr1");

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxExpr1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      for (const setting of CODEX_UNEXPRESSIBLE) {
        expect(
          occurrencesOf(said, setting),
          `"${setting}" is named ${occurrencesOf(said, setting)} times — the line is printed once per compile, not once per sub-agent`,
        ).toBe(1);
      }
    },
  );

  it(
    "says it again on a later compile, and still only once",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishOneAgent("CdxExpr2");

      await runInitFromOnCodex(
        store,
        "CdxExpr2",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );

      const { exitCode, output } = await CLI.run(["compile"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      for (const setting of CODEX_UNEXPRESSIBLE) {
        expect(occurrencesOf(said, setting), `"${setting}" on a recompile`).toBe(1);
      }
    },
  );

  it(
    "says none of it on Claude, which expresses all six",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishOneAgent("CdxExpr3");

      const { exitCode, output } = await runInitFromOnClaude(
        store,
        "CdxExpr3",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      for (const setting of CODEX_UNEXPRESSIBLE) {
        expect(
          said,
          `a Claude install reported "${setting}" as unexpressible, which it is not`,
        ).not.toContain(setting);
      }
    },
  );

  it(
    "emits none of the six as a key, which is what makes the report the only record of them",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      publishOneAgent("CdxExpr4");

      await runInitFromOnCodex(
        store,
        "CdxExpr4",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );

      const roles = await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir));
      const everyRole = Object.values(roles).join("\n");

      expect(everyRole, "a role file with no content was written").not.toBe("");
      for (const key of [
        "tools =",
        "disallowed_tools",
        "permissionMode",
        "isolation",
        "experimental",
        "reasoning_effort =",
      ]) {
        expect(
          everyRole,
          `a role file emits ${key}, which Codex refuses — the whole file is dropped`,
        ).not.toContain(key);
      }
      expect(
        everyRole,
        "a role file names a Claude model, which Codex refuses to spawn",
      ).not.toMatch(/^model\s*=/m);
    },
  );
});
