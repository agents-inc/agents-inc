import path from "path";
import { rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  codexProjectSkillsDir,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { cleanupFixture, cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, doctorRow, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/** `doctor` exits 0 on a `warn` row, so every assertion reads the row's own sentence. */

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
      // Broad on purpose, so any row naming it fails.
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

/**
 * One project holding both installations of one configuration, the Codex half broken: each block is
 * read off its own installation's folders, so the Codex half's losses are named and the Claude
 * half's rows stay whole.
 */
describe("doctor over a project holding a Claude and a Codex installation", () => {
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

  /** One configuration installed on both providers, each half whole. */
  async function installBothHalves(sharedId: string): Promise<{ dir: string; globalHome: string }> {
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    store.publish(
      sharedId,
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
    for (const install of [runInitFromOnClaude, runInitFromOnCodex]) {
      const { exitCode, output } = await install(store, sharedId, project, fixture.sourceDir);
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    }
    return project;
  }

  it(
    "calls two healthy installations healthy, exiting 0",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const project = await installBothHalves("BothDoc0");

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(stdout).toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_INSTALLATIONS,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          `2 ${STEP_TEXT.DOCTOR_INSTALLATIONS_EACH_CHECKED}\n`,
        ),
      );
      expect(stdout).toMatch(/Summary: \d+ passed, 0 warnings, 0 errors\n/);
      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    },
  );

  it(
    "reports each installation in a block of its own, naming what the Codex half lost",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const project = await installBothHalves("BothDoc1");
      await rm(path.join(project.dir, DIRS.CODEX, DIRS.AGENTS, `${WEB_DEV}.toml`));
      await rm(path.join(codexProjectSkillsDir(project.dir), E2E_SKILL.react.id), {
        recursive: true,
      });

      const { stdout } = await CLI.run(["doctor"], project);

      expect(stdout).toContain(
        [
          "  The claude installation",
          "    Config Valid            ✓  This project: .agents-inc/claude/config.ts is valid",
          "    Layout                  ✓  The global installation is on .agents-inc/claude/",
          "    Layout                  ✓  This project is on .agents-inc/claude/",
          "    Placements Offered      ✓  Every configured skill is placeable",
        ].join("\n"),
      );
      const agentCompiled = doctorRow(
        STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        "1/1 agent compiled",
      );
      expect(stdout).toMatch(
        new RegExp(
          `The claude installation[\\s\\S]*${agentCompiled.source}[\\s\\S]*The codex installation`,
        ),
      );
      expect(stdout).toContain(
        [
          "  The codex installation",
          "    Config Valid            ✓  This project: .agents-inc/codex/config.ts is valid",
          "    Layout                  ✓  The global installation is on .agents-inc/codex/",
          "    Layout                  ✓  This project is on .agents-inc/codex/",
          "    Placements Offered      ✓  Every configured skill is placeable",
        ].join("\n"),
      );
      expect(stdout).toContain(
        [
          "    Agents Compiled         !  1 agent needs recompilation",
          `                               - ${WEB_DEV} (missing)`,
          "    No Orphans",
        ].join("\n"),
      );
      expect(stdout).toContain(
        [
          "    Skills Installed        !  1 skill missing from disk",
          `                               - ${E2E_SKILL.react.id} (not found in ${DIRS.CODEX_PROJECT_SKILLS}/)`,
          "    Plugins Installed",
        ].join("\n"),
      );
      expect(
        stdout,
        "the tip names the installation, so following it does not meet the refusal",
      ).toContain(
        "  Tip: Run 'npx agents-inc compile --provider codex' to generate missing agent files\n",
      );
    },
  );
});
