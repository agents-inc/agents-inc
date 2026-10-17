import path from "path";
import { readFile, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import { DIRS, STANDARD_FILES } from "../../src/cli/consts.js";
import "../matchers/setup.js";

/**
 * A `compile` right after `init` leaves `config-types.ts` byte-identical, `// Custom` labels
 * included. The marketplace declares `web-developer` as the user's own, so a CLI-only roster and a
 * marketplace-aware one disagree.
 */
const STACK_AT_HOME_ID = "StackHm1";

describe("the sub-agent unions an install generates", () => {
  let source: { sourceDir: string; tempDir: string };
  let testTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(STACK_AT_HOME_ID, e2eStackPayload({ scope: "global" }));

    // Appended, so nothing about the sub-agent is restated here.
    const marketplaceAgentMetadata = path.join(
      source.sourceDir,
      DIRS.agents,
      "web-developer",
      STANDARD_FILES.AGENT_METADATA_YAML,
    );
    const declared = await readFile(marketplaceAgentMetadata, "utf-8");
    await writeFile(marketplaceAgentMetadata, `${declared.trimEnd()}\ncustom: true\n`);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    if (source.tempDir) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (testTempDir) await cleanupTempDir(testTempDir);
  });

  it(
    "survives a compile that changed nothing, with the marketplace calling a sub-agent its own",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      testTempDir = env.tempDir;
      const home = env.fakeHome;

      const installed = await runInitFrom(store, STACK_AT_HOME_ID, { dir: home }, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      const typesAfterInit = await readTestFile(configTypesTsPath(home));
      const configAfterInit = await readTestFile(configTsPath(home));
      const agentsAfterInit = await readCompiledAgents(home);

      // An exact match: a leading `// Custom` would sit inside the alias.
      expect(readGeneratedUnion(typesAfterInit, "AgentName")).toBe(
        ` ${E2E_STACK_AGENTS.map((name) => `'${name}'`).join(" | ")}`,
      );

      const refreshed = await CLI.run(["compile"], { dir: home, globalHome: home });

      expect(refreshed.exitCode, refreshed.output).toBe(EXIT_CODES.SUCCESS);
      expect(refreshed.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

      // The whole file: the labelling sits in a comment line no union reader returns.
      expect(await readTestFile(configTypesTsPath(home))).toBe(typesAfterInit);

      expect(await readTestFile(configTsPath(home))).toBe(configAfterInit);

      expect(await readCompiledAgents(home)).toStrictEqual(agentsAfterInit);
    },
  );
});
