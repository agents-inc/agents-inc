import {
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
} from "../src/cli/utils/exec.js";
import { getErrorMessage } from "../src/cli/utils/errors.js";

const E2E_MARKETPLACE_PREFIX = "e2e-test-";

export default async function setup() {
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
