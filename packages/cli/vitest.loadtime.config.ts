import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";
import { z } from "zod";

import mutationConfig from "./vitest.mutation.config.ts";

// For the load-time pass over dist-only code. `bun scripts/run-rebuild-loadtime-files.ts` rebuilds
// the list from a first pass's report.
const FILES_THAT_LOAD_DIST: readonly string[] = z
  .array(z.string())
  .parse(
    JSON.parse(readFileSync(new URL("./vitest.loadtime.files.json", import.meta.url), "utf8")),
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
