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
  ensureBinaryExists,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, initGlobalWithEject } from "../fixtures/dual-scope-helpers.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import { DIRS, STANDARD_FILES } from "../../src/cli/consts.js";
import "../matchers/setup.js";

/**
 * `init` writes `config-types.ts` and `compile` refreshes it from the config already on disk, so a
 * compile that follows an install with nothing in between must leave the file byte-identical.
 *
 * The leg this closes is the `AgentName` half of journey 11. `formatMaybeSectionedUnion` labels
 * every emitted union member by whether the LOADED sub-agent roster declares it — `// Custom` when
 * it does not — and the two commands used to load different rosters: `init` reached
 * CLI ∪ marketplace through `writeProjectConfig`, `compile` reached the CLI's own through
 * `loadAgentDefs`. One install was therefore labelled two ways, and which label a user's
 * committed file carried depended only on which command had run last.
 *
 * **The fixture has to make the two rosters disagree, and the shipped one cannot.**
 * `createE2ESource` declares `web-developer` and `api-developer`, both of which the CLI also
 * ships, so a marketplace-aware roster and a CLI-only roster name the same set and every existing
 * spec is blind to this by construction. The arrange below adds the one field that separates them:
 * the marketplace declares `web-developer` as the USER'S OWN, which a marketplace-aware roster
 * carries into `customAgentNames` and a CLI-only roster never sees.
 */
describe("the sub-agent unions an install generates", () => {
  let source: { sourceDir: string; tempDir: string };
  let testTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();

    // Append rather than re-render: nothing about the sub-agent is restated here, so this cannot
    // drift from what `createE2ESource` writes.
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

      const installed = await initGlobalWithEject(source.sourceDir, source.tempDir, home);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      const typesAfterInit = await readTestFile(configTypesTsPath(home));
      const configAfterInit = await readTestFile(configTsPath(home));
      const agentsAfterInit = await readCompiledAgents(home);

      // Surface 4, before the refresh. The members, spelled out from the stack's own roster —
      // a count cannot see one sub-agent swapped for another, and the leading `// Custom` this
      // used to carry is inside the alias, so an exact match is what rejects it.
      expect(readGeneratedUnion(typesAfterInit, "AgentName")).toBe(
        ` ${E2E_STACK_AGENTS.map((name) => `"${name}"`).join(" | ")}`,
      );

      const refreshed = await CLI.run(["compile"], { dir: home, globalHome: home });

      // Surface 2 — the refresh ran, so what follows is a comparison and not two reads of a file
      // nothing touched.
      expect(refreshed.exitCode, refreshed.output).toBe(EXIT_CODES.SUCCESS);
      expect(refreshed.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

      // Surface 4 — the whole file, because the labelling that used to move sits in a comment
      // line no union reader returns.
      expect(await readTestFile(configTypesTsPath(home))).toBe(typesAfterInit);

      // Surface 3 — the config is the refresh's INPUT and must survive it unedited.
      expect(await readTestFile(configTsPath(home))).toBe(configAfterInit);

      // Surface 1 — a refresh must not rewrite the compiled sub-agents either.
      expect(await readCompiledAgents(home)).toStrictEqual(agentsAfterInit);
    },
  );
});
