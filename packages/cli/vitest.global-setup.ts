import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureSharedMarketplaceCheckout } from "./src/cli/lib/__tests__/helpers/shared-marketplace-checkout.js";
import { assertDistIsFresh } from "./src/cli/lib/testing/dist-staleness.js";

// The rule this enforces is in src/, not here (CLI-460). At the time that split
// was made, a file at this level sat in no tsconfig of this package and matched
// no `files` block in eslint.config.js, so nothing type-checked or linted the
// scan that stands between the whole suite and a false green — both halves
// closed on 2026-08-22, and the scan stays in src/ because that is where it has
// tests. What is left here is the part that cannot move: vitest resolves
// `globalSetup` to a file and calls its `setup` export, and this file's own
// location is the package root every path is measured from. It runs before
// dist/ freshness is known, so the module it imports stays dependency-free —
// see the note on assertDistIsFresh.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  await assertDistIsFresh(CLI_ROOT);

  // The one checkout of the default marketplace every isolated home borrows, fetched here
  // because globalSetup is the only place in the run where nothing is racing it. Ordered after
  // the freshness refusal so a stale dist/ is still the first thing anyone is told about.
  // src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts carries the reasoning.
  await ensureSharedMarketplaceCheckout();
}
