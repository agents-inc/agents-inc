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
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";

/**
 * The placement check is a pre-flight, so an offerable first row is not installed before an
 * unofferable second one aborts.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Pinned to the project so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** Must be TRUE, not merely present. */
const NOTHING_WAS_CHANGED = "Nothing has been changed.";

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
      const offerable = pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName);

      store.publish(
        "CdxMixed",
        buildSeedPayload({
          skills: {
            // Offerable: plugin + global. First, because the installer walks the rows in order.
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            // Unofferable: plugin + project.
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

      // Checked against Codex's own registry: an orphan there is invisible to every command.
      const listed = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
      expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        JSON.stringify(listed.json),
        `${offerable} was installed by a refused run`,
      ).not.toContain(offerable);
      expect(listed.json).toStrictEqual([{ installed: [], available: [] }]);

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

      expect(said, "a Codex install must not name Claude's state directory").not.toContain(
        CLAUDE_STATE_DIR,
      );
      expect(said).toContain(path.join(env.projectDir, DIRS.CODEX_PROJECT_SKILLS));
    },
  );
});
