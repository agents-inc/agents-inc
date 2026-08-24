import path from "path";
import {
  buildSharedSource,
  removeSharedSource,
} from "../src/cli/lib/__tests__/helpers/shared-source.js";
import { buildPluginSourceInto } from "./helpers/create-e2e-plugin-source.js";
import { buildSharedE2ESourceInto } from "./helpers/create-e2e-source.js";
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
 * that quietly rebuilds hides the fact that someone ran it against the wrong tree. `turbo` orders
 * a build ahead of `test:e2e` and `test:smoke` through `dependsOn`, and since 2026-08-23 that is
 * the only thing that does — the `pretest:e2e` and `pretest:smoke` hooks were removed because
 * turbo runs those tasks concurrently and each hook's build raced the ordered one. So this refusal
 * now covers a bare `bun run test:e2e` as well as `npx vitest --config e2e/vitest.config.ts`,
 * which was always outside any script hook and is how most scoped runs here are made.
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

  // The two shared fixtures, built once here and frozen together: the plugin-capable tree at
  // `fixture/` and the plain, marketplace-less one at `plain/` ({@link E2E_SOURCE}). One root, one
  // freeze, one teardown — they differ only by the two builds run over the second, and a spec
  // picks between them by which install mode its subject is. ~1.65s once instead of 51 times,
  // about 84 seconds a run. Frozen with `chmod -R a-w` so a spec that writes into a source it does
  // not own fails AT THE WRITE rather than corrupting every spec scheduled after it —
  // `src/cli/lib/__tests__/helpers/shared-source.ts` carries the full reasoning.
  await buildSharedSource(async (root) => {
    await buildPluginSourceInto(root);
    await buildSharedE2ESourceInto(root);
  });

  return async () => {
    await removeSharedSource();

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
