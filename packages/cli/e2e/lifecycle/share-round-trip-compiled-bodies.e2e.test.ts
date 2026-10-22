import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  runEditUi,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  loadConfigOrFail,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * Stack key order decides a body's skill-table order, which no config comparison can see. The id
 * is minted by `edit --ui`, since the origin ejects and `share` refuses ejected skills.
 */
describe("a share round trip compared on its compiled bodies", () => {
  let store: SeedConfigStore;
  let origin: string;
  let rebuilt: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  // Per attempt, not per file: under `retry: 1` both ends would be installed over.
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
      await installE2EStackGlobally(store, origin);

      const minted = await runEditUi(store, { dir: origin, globalHome: origin });
      expect(minted.exitCode, `edit --ui failed: ${minted.output}`).toBe(EXIT_CODES.SUCCESS);

      const reinstalled = await runInitFrom(
        store,
        firstElement(store.minted),
        { dir: rebuilt, globalHome: rebuilt },
        E2E_SOURCE.sourceDir,
      );
      expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Deliberately first: it says which assertion carries the red.
      const before = await loadConfigOrFail(origin);
      const after = await loadConfigOrFail(rebuilt);
      expect(after.skills).toStrictEqual(before.skills);
      expect(after.agents).toStrictEqual(before.agents);

      const originBodies = await readCompiledAgents(origin);
      const rebuiltBodies = await readCompiledAgents(rebuilt);

      // `readCompiledAgents` answers `{}` for a missing directory, so name the roster.
      expect(
        Object.keys(originBodies).sort(),
        "the origin compiled nothing, so the comparison below has no subject",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));

      expect(
        rebuiltBodies,
        "the two ends agree on the configuration and disagree on what it compiles to, which only a comparison across them can see",
      ).toStrictEqual(originBodies);
    },
  );
});
