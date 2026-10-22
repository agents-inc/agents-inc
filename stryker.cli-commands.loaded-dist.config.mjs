// The load-time pass for code only `dist/` runs. oclif imports dist commands inside a test, so
// perTest coverage (the vitest runner's under "all" and "off" alike) never marks their load static.
// This vitest config loads every dist command in a setup file first, so their mutants are static.
import staticConfig from "./stryker.cli-commands.static.config.mjs"

export default {
  ...staticConfig,
  vitest: {
    ...staticConfig.vitest,
    configFile: "packages/cli/vitest.loadtime.config.ts",
  },
  // A survivor runs every collected file; the default leaves no room for their start-up.
  timeoutMS: 300000,
  incrementalFile: "reports/stryker-incremental.cli-commands.loaded-dist.json",
}
