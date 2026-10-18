import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

import mutationConfig from "./vitest.mutation.config.ts";

// For the load-time pass over dist-only code. oclif imports dist inside a test, so coverage credits
// a module's load to one test per file; the preload setup loads every command first, which makes
// those mutants static. Collected: the files that load dist (measured from a perTest pass's
// coverage) and the test files added since, which load dist or import a command's source; no other
// file can observe a command module's load-time code.
const FILES_THAT_LOAD_DIST: readonly string[] = JSON.parse(
  readFileSync(new URL("./vitest.loadtime.files.json", import.meta.url), "utf8"),
);

const inDir = (dir: string) => FILES_THAT_LOAD_DIST.filter((file) => file.includes(dir));
const COMMANDS = inDir("src/cli/lib/__tests__/commands/");
const INTEGRATION = FILES_THAT_LOAD_DIST.filter(
  (file) =>
    file.includes("src/cli/lib/__tests__/integration/") ||
    file.includes("src/cli/lib/__tests__/user-journeys/"),
);
const UNIT = FILES_THAT_LOAD_DIST.filter(
  (file) => !COMMANDS.includes(file) && !INTEGRATION.includes(file),
);

// The projects are replaced, not merged: mergeConfig would append these to the base three.
export default defineConfig({
  ...mutationConfig,
  test: {
    ...mutationConfig.test,
    setupFiles: ["./vitest.setup.ts", "./vitest.loadtime.preload.setup.ts"],
    projects: [
      { extends: true, test: { name: "unit", include: UNIT } },
      { extends: true, test: { name: "integration", include: INTEGRATION } },
      { extends: true, test: { name: "commands", include: COMMANDS, retry: 1 } },
    ],
  },
});
