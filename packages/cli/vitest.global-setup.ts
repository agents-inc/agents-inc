import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureSharedMarketplaceCheckout } from "./src/cli/lib/__tests__/helpers/shared-marketplace-checkout.js";
import { assertDistIsFresh } from "./src/cli/lib/testing/dist-staleness.js";

// This file's location is the package root; the imported check stays dependency-free.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  await assertDistIsFresh(CLI_ROOT);

  // Fetched once here, where nothing races it, after the freshness refusal.
  await ensureSharedMarketplaceCheckout();
}
