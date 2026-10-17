import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * A bare `edit` from a project with no config of its own falls back to the global installation,
 * hands that to the editor, and writes nothing.
 */

const STACK_AT_HOME_ID = "StackHm3";

describe("edit with global-only installation (no project config)", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installGlobalOnly(): Promise<TestEnvironment> {
    const created = await createTestEnvironment();
    store.publish(STACK_AT_HOME_ID, e2eStackPayload({ scope: "global" }));
    const installed = await runInitFrom(
      store,
      STACK_AT_HOME_ID,
      { dir: created.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `Global init failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return created;
  }

  /** No TTY, so the link is printed. */
  function editFromProject({ fakeHome, projectDir }: TestEnvironment) {
    return CLI.run(
      ["edit"],
      { dir: projectDir, globalHome: fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );
  }

  it(
    "edit launches from project dir with global-only installation",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await installGlobalOnly();
      store.reset();

      expect(
        await fileExists(configTsPath(env.projectDir)),
        "Project config must NOT exist before edit (global-only setup)",
      ).toBe(false);

      const { exitCode, output } = await editFromProject(env);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);

      expect(store.minted).toHaveLength(1);
      expect(output).toContain(`Shared as ${firstElement(store.minted)}`);

      expect(
        await fileExists(configTsPath(env.projectDir)),
        "an edit falling back to the global installation must not write a project config",
      ).toBe(false);
      await expect({ dir: env.fakeHome }).toHaveConfig({
        agents: ["web-developer"],
      });
    },
  );

  it(
    "edit with global fallback preserves global skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await installGlobalOnly();
      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      const { exitCode, output } = await editFromProject(env);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);

      expect(await readTestFile(globalConfigPath)).toStrictEqual(globalConfigBefore);
      expect(
        await directoryExists(skillsPath(env.fakeHome)),
        "Global skills directory must still exist after project edit",
      ).toBe(true);
      expect(
        await directoryExists(agentsPath(env.fakeHome)),
        "Global agents directory must still exist after project edit",
      ).toBe(true);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("web-developer");
    },
  );
});
