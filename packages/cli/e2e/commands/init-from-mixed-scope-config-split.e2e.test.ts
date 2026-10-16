import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  fileExists,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readConfigSkillIds,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * When some skills are project-scoped and others are global-scoped, `init --from` writes TWO
 * config files:
 *   - ~/.agents-inc/claude/config.ts (global-scoped items)
 *   - <projectDir>/.agents-inc/claude/config.ts (project-scoped items)
 *
 * and its closing block names both, because a mixed install writes assignments into each.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const MIXED_ID = "MixedSc1";

describe("init --from — mixed scope config split", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    // A project-scoped skill on a project-scoped sub-agent, and a global-scoped skill on a global
    // one: each half has assignments of its own to write.
    store.publish(
      MIXED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: {
          [WEB_DEV]: { on: true, scope: "global" },
          [API_DEV]: { on: true, scope: "project" },
        },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "should write TWO config files when skills have mixed scopes",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await createTestEnvironment();
      const { fakeHome, projectDir } = env;

      const result = await runInitFrom(
        store,
        MIXED_ID,
        { dir: projectDir, globalHome: fakeHome },
        source.sourceDir,
      );

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // Both config files should exist
      await expect({ dir: fakeHome }).toHaveConfig();
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // The project config is named for the project it configures — the same
      // identity `eject` writes and the loader repairs a missing name to.
      // Asserted on the written text as well as structurally: the loader
      // SUPPLIES the directory name when the field is absent, so a structural
      // read alone would pass over a config that never carried one.
      const projectName = path.basename(projectDir);
      expect(await readTestFile(configTsPath(projectDir))).toContain(`name: '${projectName}'`);
      expect((await loadConfigOrFail(projectDir)).name).toBe(projectName);

      // A MIXED install writes assignments into both files, so the closing block owes the user
      // both paths.
      expect(result.output).toContain(STEP_TEXT.CONFIGURATION_LABEL);
      expect(result.output).toContain(configTsPath(projectDir));
      expect(result.output).toContain(configTsPath(fakeHome));

      // Global config should NOT contain the project-scoped skill (scope-specific check)
      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain(E2E_SKILL.react.id);
      expect(globalSkillIds).toContain(E2E_SKILL.vitest.id);

      const projectReactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(projectReactEntries.map((entry) => entry.scope)).toStrictEqual(["project"]);

      // web-developer is the global sub-agent, so it compiles under HOME
      await expect({ dir: fakeHome }).toHaveCompiledAgent(WEB_DEV);

      // config-types.ts must exist at both scopes
      expect(
        await fileExists(configTypesTsPath(fakeHome)),
        "Global config-types.ts must exist",
      ).toBe(true);
      expect(
        await fileExists(configTypesTsPath(projectDir)),
        "Project config-types.ts must exist",
      ).toBe(true);
    },
  );
});
