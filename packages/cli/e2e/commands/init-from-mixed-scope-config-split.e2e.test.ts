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
 * Mixed project and global skills make `init --from` write both config.ts files, and the closing
 * block names both.
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
    // Each half has assignments of its own to write.
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

      await expect({ dir: fakeHome }).toHaveConfig();
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // Asserted on the text too: the loader supplies the directory name when the field is absent.
      const projectName = path.basename(projectDir);
      expect(await readTestFile(configTsPath(projectDir))).toContain(`name: '${projectName}'`);
      expect((await loadConfigOrFail(projectDir)).name).toBe(projectName);

      expect(result.output).toContain(STEP_TEXT.CONFIGURATION_LABEL);
      expect(result.output).toContain(configTsPath(projectDir));
      expect(result.output).toContain(configTsPath(fakeHome));

      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain(E2E_SKILL.react.id);
      expect(globalSkillIds).toContain(E2E_SKILL.vitest.id);

      const projectReactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(projectReactEntries.map((entry) => entry.scope)).toStrictEqual(["project"]);

      await expect({ dir: fakeHome }).toHaveCompiledAgent(WEB_DEV);

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
