import path from "path";
import { fileURLToPath } from "url";

import { assertDistIsFresh } from "../src/cli/lib/testing/dist-staleness.js";
import {
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
} from "../src/cli/utils/exec.js";
import { getErrorMessage } from "../src/cli/utils/errors.js";
import { E2E_MARKETPLACE_PREFIX } from "./pages/constants.js";

/**
 * The package root every path this suite spawns is measured from, and this file's own location
 * is what makes it derivable — `globalSetup` is resolved to a file by vitest and called by
 * export, so nothing hands it a root.
 */
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Refuses the run before anything is collected when `dist/` is absent or predates the tree
 * compiled into it, and clears stale E2E marketplaces afterwards.
 *
 * **The refusal is the unit runner's, arriving at the door that needed it more.** Every spec here
 * spawns `node bin/run.js`, and oclif resolves that binary's commands from `oclif.commands.target`
 * — `./dist/commands`. `bin/run.js` is three lines and git tracks it, so it starts whatever the
 * state of the build, and the two failures below are what a spec is handed instead of a build
 * error:
 *
 * - `dist/` ABSENT: every command reports itself unknown and exits 127, so an assertion on the
 *   exit code reads `expected 127 to be 1`. It names nothing about a build and is
 *   indistinguishable from a regression the change under test caused. It cost one lane a full
 *   round of investigation.
 * - `dist/` STALE: the run goes GREEN over the previous build, which is the more expensive of
 *   the two — a command spec that survives its command's source being deleted reads as "nothing
 *   depended on it".
 *
 * A refusal rather than a rebuild, following {@link assertDistIsFresh}'s own posture: a suite
 * that quietly rebuilds hides the fact that someone ran it against the wrong tree. `pretest:e2e`
 * and `pretest:smoke` already build for `bun run test:e2e` and `bun run test:smoke`; this is the
 * half no script hook can reach, because `npx vitest --config e2e/vitest.config.ts` bypasses
 * both and is how most scoped runs here are actually made.
 *
 * Here rather than in `setup.ts` because the question is asked once per RUN, before a spec is
 * collected, and the scan behind it walks two source trees — where `setup.ts` is evaluated once
 * per spec file and carries the single-stat guard that suits that frequency. It is the same
 * split the unit runner already makes across `vitest.global-setup.ts` and `vitest.setup.ts`, so
 * no new wiring exists on either side.
 *
 * A throw from a globalSetup TEARDOWN is swallowed — caught, logged as `error during close`, and
 * the run still exits 0 (measured on vitest 4.1.10), which is why the replacement guard cannot
 * live here. A throw from setup is not: it aborts the run before collection.
 */
export default async function setup() {
  await assertDistIsFresh(CLI_ROOT);

  return async () => {
    let marketplaces;
    try {
      marketplaces = await claudePluginMarketplaceList();
    } catch {
      return;
    }

    const stale = marketplaces.filter((m) => m.name.startsWith(E2E_MARKETPLACE_PREFIX));

    for (const marketplace of stale) {
      try {
        await claudePluginMarketplaceRemove(marketplace.name);
      } catch (err) {
        // Best-effort cleanup — log but don't fail the suite
        console.warn(
          `Failed to remove stale marketplace '${marketplace.name}': ${getErrorMessage(err)}`,
        );
      }
    }
  };
}
