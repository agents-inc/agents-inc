import path from "path";
import { fileURLToPath } from "url";

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import {
  assertDistIsPresent,
  guardAgainstDistReplacement,
} from "../src/cli/lib/testing/dist-staleness.js";

// Fails a spec whose dist/ was replaced (e.g. by a concurrent build) while it ran. Hooks, not
// globalSetup, because a globalSetup teardown throw is logged and the run still exits 0.
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assertDistUnchanged = guardAgainstDistReplacement(CLI_ROOT);

beforeAll(() => {
  assertDistIsPresent(CLI_ROOT);
});

beforeEach(assertDistUnchanged);
afterEach(assertDistUnchanged);

// Also after a spec's own beforeAll throws, which skips the beforeEach/afterEach guards.
afterAll(assertDistUnchanged);
