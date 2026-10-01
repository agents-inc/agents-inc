import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { runCodex } from "../fixtures/codex.js";
import {
  CODEX_OFFERED_CELLS,
  CODEX_REFUSED_CELL,
  codexGlobalSkillsDir,
  codexProjectSkillsDir,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
} from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";

/**
 * What a Codex install WRITES when it refuses, and what it SAYS when it succeeds.
 *
 * Both halves were found by driving `init --from <id> --provider codex` as a user rather than by
 * reading a spec, and both are about the same thing: the command talking about one host while
 * acting on another.
 *
 * **The refusal has to be a pre-flight, and it was a per-call guard.** `bindsItsOfferedPlacements`
 * refuses at `installPlugin`, which is inside the loop `installPluginSkills` runs one skill at a
 * time — so a payload whose FIRST plugin row is offerable and whose second is not installs a real
 * plugin into the user's Codex registry and only then aborts, printing a message that ends
 * "Nothing has been changed." Nothing removes that plugin afterwards: no `config.ts` was written,
 * so `uninstall` has no row naming it and `doctor` has no configuration to check it against. The
 * existing single-row refusal spec cannot see this — with one unofferable row there is nothing to
 * install before the refusal fires, so the loop's first iteration IS the refusal.
 *
 * **And the narration names Claude on a Codex install.** Two sentences: the copy step's "Copied N
 * skills to .claude/skills/" and the permission notice's "add to .claude/settings.json", both
 * composed from a Claude constant for every provider, so a run that touched no `.claude/`
 * directory ended by telling the user to go and edit one.
 *
 * **Every assertion here is on what a USER sees or what is on their disk**, because that is where
 * these defects live: each one type-checks, lints and passes every existing spec.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry keeping its agent in the project, so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** The sentence the refusal ends on, which this file requires to be TRUE rather than present. */
const NOTHING_WAS_CHANGED = "Nothing has been changed.";

/** Claude's own state directory, which no sentence a Codex install prints may name. */
const CLAUDE_STATE_DIR = ".claude";

describe("a Codex install talks about the host it is acting on", () => {
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

  it(
    "refuses a payload mixing an offered cell with the forbidden one BEFORE installing either",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const offerable = buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName);

      store.publish(
        "CdxMixed",
        buildSeedPayload({
          skills: {
            // Offerable: plugin + global. Installed first, because the installer walks the rows.
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            // Unofferable: plugin + project, the cell Codex has no way to fill.
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxMixed",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);

      expect(exitCode, said).not.toBe(EXIT_CODES.SUCCESS);
      expect(said).toContain(E2E_SKILL.hono.id);
      expect(said).toContain(CODEX_REFUSED_CELL);
      for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);
      expect(said).toContain(NOTHING_WAS_CHANGED);

      // The claim the message makes, checked against Codex's own registry rather than against a
      // file this CLI wrote. An orphan here is invisible to every command: no `config.ts` names
      // it, so `uninstall` has no row to sweep and `doctor` has no configuration to check.
      const listed = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
      expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        JSON.stringify(listed.json),
        `${offerable} was installed by a refused run`,
      ).not.toContain(offerable);
      expect(listed.json).toStrictEqual([{ installed: [], available: [] }]);

      // And nothing else was written either, at either scope.
      expect(await directoryExists(codexProjectSkillsDir(env.projectDir))).toBe(false);
      expect(await directoryExists(codexGlobalSkillsDir(env.fakeHome))).toBe(false);
      expect(await directoryExists(path.join(env.projectDir, ".agents-inc"))).toBe(false);
      expect(await directoryExists(path.join(env.fakeHome, ".agents-inc"))).toBe(false);
    },
  );

  it(
    "names the directory it wrote into, and no Claude path anywhere in the run",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxNarr1",
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

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxNarr1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);

      // The copy step's own line, which composed `.claude/skills` for every provider. It is the
      // FIRST place the run names a directory, six lines above the "Skills copied to:" block that
      // already reads the layout and contradicts it.
      expect(said, "a Codex install must not name Claude's state directory").not.toContain(
        CLAUDE_STATE_DIR,
      );
      expect(said).toContain(path.join(env.projectDir, DIRS.CODEX_PROJECT_SKILLS));
    },
  );

  /*
   * **A third case stood here until 2026-09-22 and was RETIRED rather than re-pointed.** It
   * required a Codex install to say `No sub-agents were compiled`, and its whole subject was the
   * silence where an explanation belonged: the sub-agents were selected, the configuration
   * recorded them, and the run printed `Compiled 0 agents` with nothing saying why.
   *
   * There is no zero any more. A Codex install compiles sixteen of the eighteen sub-agents as
   * agent role definition files, so the state that case described is unreachable and no assertion
   * over this fixture stands in its place — re-pointing it would have meant inventing a claim for
   * a spec whose own claim had gone.
   *
   * The half of it that outlived its subject — that the run names the provider it is talking
   * about — was not deleted with it. It has a file of its own:
   * `codex-compiles-sixteen-agent-roles.e2e.test.ts` requires the install to name both absent
   * sub-agents and say why on ONE line, with a Claude control asserting that line's absence.
   */
});
