import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { cleanupFixture, cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `doctor` on a HEALTHY Codex installation: Skills Installed, Agents Compiled and Layout read the
 * Codex layout (no `.claude/`, `.toml` roles), and Placements Offered counts installations. The
 * wrong rows were `warn` and exited 0, so every assertion reads the row's own sentence.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Pinned to the project so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

const CLAUDE_STATE_DIR = ".claude";

describe("doctor on a healthy Codex installation", () => {
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

  /** The cheapest healthy installation there is. */
  async function installOnCodex(target: TestEnvironment): Promise<void> {
    store.publish(
      "CdxDoc01",
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
      "CdxDoc01",
      { dir: target.projectDir, globalHome: target.fakeHome },
      fixture.sourceDir,
    );
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
  }

  it(
    "finds the eject-mode skill where the layout put it, and names no Claude directory",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installOnCodex(env);

      const examined = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(examined.output);

      expect(said).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED);
      expect(said).toContain("1/1 eject-mode skill installed");
      // Broad on purpose: a different row also named the same directory.
      expect(said, "no doctor row may name Claude's state directory here").not.toContain(
        CLAUDE_STATE_DIR,
      );

      // Proves nothing alone, but a later change making either row a `fail` is not silent.
      expect(examined.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    },
  );

  /** The positive verdict beside the negative, which a row that said nothing would satisfy. */
  it(
    "does not ask for a recompile that would write nothing",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installOnCodex(env);

      const examined = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(examined.output);

      expect(said).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      expect(said).not.toContain("needs recompilation");
      expect(said).toContain("1/1 agent compiled");
    },
  );

  it(
    "says which folder each scope is on, as a sentence",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      await installOnCodex(env);

      const examined = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(examined.output);

      expect(said).toContain(STEP_TEXT.DOCTOR_ROW_LAYOUT);
      // The predicate, not just the subject.
      expect(said).toContain(`This project is on ${DIRS.SOURCE_CODEX}/`);
    },
  );
});
