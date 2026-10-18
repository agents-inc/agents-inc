import path from "node:path";
import { fileURLToPath } from "node:url";

import { Config } from "@oclif/core";

// Loads every dist command through oclif before a file's first test, so their load-time code runs
// outside any test: Stryker's coverage then marks those mutants static and runs every collected
// test against each. oclif's later loads in the file reuse these same module instances.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = await Config.load({ root: CLI_ROOT });
await Promise.all(config.commands.map((command) => command.load()));
