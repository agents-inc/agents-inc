import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import {
  runEditUi,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE, E2E_STACK_DESCRIPTION } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, createTempDir, loadConfigOrFail } from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * A share round trip keeps the stack's description, the only trace a stack leaves in `config.ts`,
 * while `stackId` stays null: an id would overlay the stack's whole expansion and resurrect agents
 * the sharer removed. The id is minted by `edit --ui`, since `share` refuses ejected skills.
 */
describe("a share round trip that starts from an applied stack", () => {
  let store: SeedConfigStore;
  let origin: string;
  let rebuilt: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  // Per attempt, not per file: under `retry: 1` a retry would install over the first attempt.
  beforeEach(async () => {
    store.reset();
    origin = await createTempDir();
    rebuilt = await createTempDir();
  });

  afterEach(async () => {
    await Promise.all([origin, rebuilt].map(cleanupTempDir));
  });

  it(
    "reinstalls a configuration that still describes itself as the stack did",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      await installE2EStackGlobally(store, origin);

      // Control: an origin with no description would satisfy the comparison below for free.
      const before = await loadConfigOrFail(origin);
      expect(
        before.description,
        "the origin has no description to lose, so the round trip below has nothing to carry",
      ).toBe(E2E_STACK_DESCRIPTION);

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

      const after = await loadConfigOrFail(rebuilt);

      expect(
        after.description,
        "the wire carried no description and the payload names no stack to resolve one from, so the rebuild describes itself with nothing",
      ).toBe(E2E_STACK_DESCRIPTION);

      expect(
        after.stack,
        "a stack recorded on the way back in would come from the stack YAML rather than from the curation that was shared",
      ).toStrictEqual(before.stack);
    },
  );
});
