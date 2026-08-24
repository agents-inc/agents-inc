import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { initGlobalWithEject } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE, E2E_STACK_DESCRIPTION } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * The one line a stack leaves behind, across a share round trip.
 *
 * A config records a stack's DESCRIPTION and never its id, so that sentence is the only trace an
 * applied stack leaves in `config.ts`. The payload used to carry neither: `configToSeedPayload`
 * writes `stackId: null` deliberately, and with no id to resolve the receiving install had nothing
 * to write, so a reinstall of a shared configuration silently described itself with nothing.
 *
 * **Recording the id instead is what this spec exists to rule out, not merely an alternative.**
 * `buildInstallConfig` spreads the loaded stack's own expansion first and lets the saved stack win
 * per agent, so a stack agent the sharer REMOVED would come back wholesale — which is the overlay
 * the `stackId: null` decision refuses, and it would regress `--from` in the direction that matters
 * most. Carrying the sentence carries the only thing a resolvable id ever supplied that the
 * assignments do not.
 *
 * `share-round-trip-compiled-bodies.e2e.test.ts` makes the same trip and compares `skills`,
 * `agents` and the compiled bodies. None of those can see this: a description is a config field
 * that reaches no compiled sub-agent, so both ends agreed on everything that spec reads while the
 * origin said "Minimal stack for E2E testing" and the rebuild said nothing at all.
 */
describe("a share round trip that starts from an applied stack", () => {
  let store: SeedConfigStore;
  let origin: string;
  let rebuilt: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  // Both ends are allocated per attempt rather than per file: the suite runs at `retry: 1` and
  // both are directories the run INSTALLS into, so a second wizard launch carried across a retry
  // would find the first attempt's installation and open the dashboard instead.
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
      const install = await initGlobalWithEject(E2E_SOURCE, origin);
      expect(install.exitCode, `the wizard install failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // The control for everything below. If the wizard end ever stops writing the stack's
      // description, the comparison at the bottom is satisfied by two configs that both say
      // nothing, and this spec passes without a subject.
      const before = await loadConfigOrFail(origin);
      expect(
        before.description,
        "the origin has no description to lose, so the round trip below has nothing to carry",
      ).toBe(E2E_STACK_DESCRIPTION);

      const shared = await runShare(store, { dir: origin, globalHome: origin });
      expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);

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

      // The id stays null through the trip. A payload that solved this by naming the stack would
      // satisfy the assertion above and overlay the stack's whole expansion on the way in, which
      // is the outcome the field exists to avoid.
      expect(
        after.stack,
        "a stack recorded on the way back in would come from the stack YAML rather than from the curation that was shared",
      ).toStrictEqual(before.stack);
    },
  );
});
