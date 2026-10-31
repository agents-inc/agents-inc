import path from "path";
import { setUpSharedSource } from "../src/cli/lib/__tests__/helpers/shared-source.js";
import { buildPluginSourceInto } from "./helpers/create-e2e-plugin-source.js";
import { installCodexOnPath } from "./fixtures/codex-on-path.js";
import { buildSharedE2ESourceInto } from "./helpers/create-e2e-source.js";
import { fileURLToPath } from "url";

import { assertDistIsFresh } from "../src/cli/lib/testing/dist-staleness.js";
import {
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
} from "../src/cli/lib/hosts/claude-host.js";
import { getErrorMessage } from "../src/cli/utils/errors.js";
import { E2E_MARKETPLACE_PREFIX } from "./pages/constants.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Refuses a run whose dist/ is absent or stale (specs spawn bin/run.js, which loads dist/), and
// clears stale E2E marketplaces afterwards.
export default async function setup() {
  await assertDistIsFresh(CLI_ROOT);

  // The `codex` every spawned CLI resolves by name.
  await installCodexOnPath();

  // Built once per run, in a folder of its own, and frozen read-only, so a spec writing into a
  // shared source fails at the write.
  const removeSharedSource = await setUpSharedSource(async (root) => {
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
        console.warn(
          `Failed to remove stale marketplace '${marketplace.name}': ${getErrorMessage(err)}`,
        );
      }
    }
  };
}
