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
 * `doctor` on a HEALTHY Codex installation, which is the state no spec covered.
 *
 * Every Codex doctor spec before this one drove a BROKEN configuration — an unofferable placement
 * — so the rows that look at where a skill actually landed were never asked about an installation
 * that works. Driven as a user, the report on a clean Codex install was wrong in four ways at
 * once, and each is invisible to a spec that only ever sees the failing case:
 *
 * - **Skills Installed** composed `<scope root>/.claude/skills/<id>/SKILL.md` from a Claude
 *   constant and reported every eject-mode skill missing, naming a directory this installation
 *   does not have. The host-path lint ban cannot see it: it matches LITERALS, and this is a
 *   constant.
 * - **Agents Compiled** looked for `<name>.md` — Claude's extension, where `agentCodec` answers
 *   `.toml` for Codex — and called the absence "needs recompilation" over a file no release will
 *   ever put in a Codex agents directory, which is a remedy that writes nothing.
 * - **Layout** printed the scope's name and stopped — "This project", with no predicate — because
 *   the row's sentence is only built for a provider that HAS a legacy folder to move out of.
 * - the **Placements Offered** row counts findings and calls them installations, so one
 *   installation with two findings reports "2 unusable installations".
 *
 * **The exit code did NOT carry any of it, and that is the reason the state went unnoticed.** Both
 * wrong rows are `warn`, so `doctor` exited 0 over a report saying an installation that works is
 * missing its skills and owes a recompile. A spec asserting only the exit code sees a pass, which
 * is why every assertion below reads the row's own sentence.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry keeping its agent in the project, so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** Claude's own state directory, which no row about a Codex installation may name. */
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

  /** One eject + project skill, installed onto Codex — the cheapest healthy installation there is. */
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
      // The row's own verdict, in the words it prints when it found everything.
      expect(said).toContain("1/1 eject-mode skills installed");
      // And it may not have looked in a directory this installation does not own. Broad on
      // purpose: the row's own sentence is only half of what went wrong, and the other half was a
      // DIFFERENT row naming the same directory.
      expect(said, "no doctor row may name Claude's state directory here").not.toContain(
        CLAUDE_STATE_DIR,
      );

      // The exit code proves nothing on its own here — both rows this file is about are `warn`,
      // so the report was already exiting 0 while saying an installation that works is broken.
      // Asserted anyway, so a later change that makes either a `fail` is not silent.
      expect(examined.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    },
  );

  /**
   * **Re-pointed on 2026-09-22, and the original assertion is recorded rather than deleted.** It
   * required the row to say `No sub-agent renderer for codex yet` — true when this file was
   * written and made false by the renderer landing, which is an assertion this spec's own subject
   * outgrew rather than a regression. What has NOT changed is the defect it was written against:
   * the row said `1 agent needs recompilation - web-developer (missing)` on a healthy Codex
   * installation, because it looked for Claude's `.md` extension where `agentCodec` answers
   * `.toml`. That claim is the negative below, and it survives the re-point whole.
   *
   * **The positive half is what makes the negative mean anything.** `not.toContain` is satisfied
   * for free by a row that found nothing to say, and by a `doctor` that never reached this row at
   * all — so the row's own verdict is asserted beside it. The count is the ROW's, over the one
   * sub-agent this installation configures.
   */
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
      // The role file is `.toml` and it is where the layout puts it, so the row finds it.
      expect(said).toContain("1/1 agents compiled");
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
      // The predicate, not just the subject. "This project" alone is what the row printed.
      expect(said).toContain(`This project is on ${DIRS.SOURCE_CODEX}/`);
    },
  );
});
