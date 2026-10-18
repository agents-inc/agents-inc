// The load-time pass for code that only `dist/` runs. oclif imports the dist command modules inside
// a test, so perTest coverage credits their load to one test per file and never marks it static
// (the vitest runner reports perTest coverage under "all" and "off" alike). The vitest config here
// loads every dist command in a setup file first, so their mutants are static and run every
// collected test: the files that load dist (vitest.loadtime.config.ts).
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
