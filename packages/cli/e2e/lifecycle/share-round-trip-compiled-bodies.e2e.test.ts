import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { initGlobalWithEject } from "../fixtures/dual-scope-helpers.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * The share round trip with the wizard at one end and `init --from` at the other, compared on
 * the artefact a user actually reads: the compiled sub-agent.
 *
 * `commands/share` already makes this trip and compares far more of it — config, skills
 * directory, agents directory, and four surfaces at EACH end. What it cannot do is see a
 * difference that is consistent within each installation, and it builds its origin with
 * `init --from` too, so both of its ends run the same producer.
 *
 * That combination let a real defect through. Five modules assemble a stack and only the
 * wizard's ordered its keys, so a configuration that matched field for field — seven skill
 * entries, two sub-agent entries, the same directories — compiled a `web-developer.md` with two
 * rows of its skill-activation table swapped. `agent.skills` is split into preloaded and
 * dynamic PRESERVING order, so the stack's key order in `config.ts` decides the order of the
 * table a sub-agent is handed; nothing else in the suite reads that.
 *
 * The comparison lived only in `handrun-journeys.ts`, which no script runs. This is the gate.
 */
describe("a share round trip that starts at the wizard", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;
  let origin: string;
  let rebuilt: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(sourceTempDir);
  });

  // Both ends are allocated per attempt rather than per file, because the suite runs at
  // `retry: 1` and both of them are directories the run INSTALLS into. Carried across a retry,
  // the wizard's second launch would find the first attempt's installation and open the
  // dashboard — so a genuine failure here would be followed by a timeout waiting for a stack
  // step, and the second error is the one a reader sees first.
  beforeEach(async () => {
    store.reset();
    origin = await createTempDir();
    rebuilt = await createTempDir();
  });

  afterEach(async () => {
    await Promise.all([origin, rebuilt].map(cleanupTempDir));
  });

  it(
    "compiles byte-identical sub-agents in a directory that has never seen any of it",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const install = await initGlobalWithEject(sourceDir, sourceTempDir, origin);
      expect(install.exitCode, `the wizard install failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const shared = await runShare(store, { dir: origin, globalHome: origin });
      expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);

      const reinstalled = await runInitFrom(
        store,
        firstElement(store.minted),
        { dir: rebuilt, globalHome: rebuilt },
        sourceDir,
      );
      expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // The config side first, and it is here to say which assertion carries the red rather
      // than to add reach: it held while the defect shipped. `skills` and `agents` are sorted
      // by the generator at both ends, and `stack` — the record whose key order decides the
      // compiled body — is compared key-order-insensitively by any deep equality. Everything a
      // configuration comparison can see agreed; the bytes below did not.
      const before = await loadConfigOrFail(origin);
      const after = await loadConfigOrFail(rebuilt);
      expect(after.skills).toStrictEqual(before.skills);
      expect(after.agents).toStrictEqual(before.agents);

      const originBodies = await readCompiledAgents(origin);
      const rebuiltBodies = await readCompiledAgents(rebuilt);

      // `readCompiledAgents` answers `{}` for a directory that is not there, so two
      // installations that compiled nothing satisfy the comparison below for free. The roster
      // is named rather than counted for the usual reason — a count cannot see a swap, and a
      // swap is the whole subject here.
      expect(
        Object.keys(originBodies).sort(),
        "the wizard end compiled nothing, so the comparison below has no subject",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));

      expect(
        rebuiltBodies,
        "the two ends agree on the configuration and disagree on what it compiles to, which only a comparison across them can see",
      ).toStrictEqual(originBodies);
    },
  );
});
