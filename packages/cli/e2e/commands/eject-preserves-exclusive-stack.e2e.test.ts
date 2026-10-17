import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import {
  cleanupTempDir,
  configTsPath,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import "../matchers/setup.js";

/**
 * A project's exclusive stack categories survive `eject skills` rewriting config.ts to record its
 * source. Installed by `init --from` so the config is in the compact bare form the CLI writes.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const SHARED_CONFIG_ID = "Exclusiv";

/** One exclusive and one non-exclusive category, so a loss reads as one missing key. */
const EXPECTED_STACK = {
  "web-framework": [sa(E2E_SKILL.react.id)],
  "web-testing": [sa(E2E_SKILL.vitest.id)],
};

/** The bare, array-less form the writer emits for an exclusive category. */
const BARE_EXCLUSIVE_ENTRY = new RegExp(`'web-framework':\\s*'${E2E_SKILL.react.id}'`);

describe("eject preserves a project's exclusive stack categories", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "keeps the exclusive category and its assignment after recording the source",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const project = { dir: env.projectDir, globalHome: env.fakeHome };

      store.publish(
        SHARED_CONFIG_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          // Pinned to the project, or the sub-agent and its stack land in ~/.claude.
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );

      const install = await runInitFrom(store, SHARED_CONFIG_ID, project, sourceDir);
      expect(install.exitCode, `install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-conditions: the exclusive category is there, in the bare form.
      expect(
        (await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV],
        "the install must record both stack categories",
      ).toStrictEqual(EXPECTED_STACK);
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "the writer must emit the exclusive category in its bare, array-less form",
      ).toMatch(BARE_EXCLUSIVE_ENTRY);

      // No source override: `eject` reads the source `init` recorded.
      const eject = await CLI.run(["eject", "skills"], project);
      expect(eject.exitCode, `eject failed: ${eject.output}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        (await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV],
        "recording a source must not drop the exclusive stack category",
      ).toStrictEqual(EXPECTED_STACK);

      const typecheck = await typecheckGeneratedConfig(path.dirname(configTsPath(env.projectDir)));
      expect(
        typecheck.exitCode,
        `the rewritten config pair must type-check.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
