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
  ensureBinaryExists,
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
 * D-308 — a project's exclusive stack categories must survive a command that
 * rewrites `config.ts` for an unrelated reason.
 *
 * `eject skills` records the source it read from: it reads the project config
 * with the LENIENT loader, overlays `source`, and writes the result back through
 * `writeProjectPartial`. The lenient loader does not normalize stack values, and
 * the writer compacted every exclusive category to its BARE value on the previous
 * write — so on re-emit those categories fail the writer's `Array.isArray` test
 * and are dropped. The user asked to save a source and silently lost their stack.
 *
 * The install is a real one (`init --from`, the non-interactive install path), so
 * the config under test is the one the CLI itself wrote — the compact bare form
 * is the input the defect needs, and a hand-built fixture could not supply it
 * honestly.
 *
 * `web-framework` is exclusive in the matrix; `web-testing` is not. Asserting on
 * both means the failure reads as one missing KEY rather than as a stack that
 * disappeared wholesale.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Published id for the shared configuration the install is driven from. */
const SHARED_CONFIG_ID = "Exclusiv";

/**
 * The stack the install writes and the eject must leave alone: one exclusive
 * category (`web-framework`) and one non-exclusive one (`web-testing`), both
 * lazily assigned to the same sub-agent.
 */
const EXPECTED_STACK = {
  "web-framework": [sa(E2E_SKILL.react.id)],
  "web-testing": [sa(E2E_SKILL.vitest.id)],
};

/** The bare, array-less form the writer emits for an exclusive category. */
const BARE_EXCLUSIVE_ENTRY = new RegExp(`"web-framework":\\s*"${E2E_SKILL.react.id}"`);

describe("eject preserves a project's exclusive stack categories", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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
            [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          },
          // The stack under test is the PROJECT's, so the sub-agent holding it has to be pinned
          // there: a payload naming no agent scope takes the shared selection default and the
          // sub-agent — with its stack — lands in the user's own ~/.claude instead.
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );

      const install = await runInitFrom(store, SHARED_CONFIG_ID, project, sourceDir);
      expect(install.exitCode, `install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-conditions: the install really produced the exclusive category, and
      // really wrote it in the compact bare form the defect feeds on.
      expect(
        (await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV],
        "the install must record both stack categories",
      ).toStrictEqual(EXPECTED_STACK);
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "the writer must emit the exclusive category in its bare, array-less form",
      ).toMatch(BARE_EXCLUSIVE_ENTRY);

      // No source override: `eject` reads the source this install recorded at `init` time.
      const eject = await CLI.run(["eject", "skills"], project);
      expect(eject.exitCode, `eject failed: ${eject.output}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        (await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV],
        "recording a source must not drop the exclusive stack category",
      ).toStrictEqual(EXPECTED_STACK);

      // ...and the config the eject rewrote is still a config a user can compile.
      const typecheck = await typecheckGeneratedConfig(path.dirname(configTsPath(env.projectDir)));
      expect(
        typecheck.exitCode,
        `the rewritten config pair must type-check.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
