// Builds each workspace's Stryker config from stryker.config.json, which is packages/cli's first pass.
import { readFileSync } from "node:fs"

const cliFirstPass = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8")
)

/** A first pass over one workspace's in-process tests, with `ignoreStatic` on. */
export function firstPass({ name, dir, tsconfigFile, mutate }) {
  return {
    ...cliFirstPass,
    vitest: {
      ...cliFirstPass.vitest,
      configFile: `${dir}/vitest.mutation.config.ts`,
    },
    tsconfigFile,
    buildCommand: undefined,
    mutate,
    incrementalFile: `reports/stryker-incremental.${name}.json`,
  }
}

/**
 * The same with `ignoreStatic` off, which Stryker's command line can't set. Its own incremental file,
 * or incremental mode would reuse the first pass's results without running them.
 */
export function staticPass(config, name) {
  return {
    ...config,
    ignoreStatic: false,
    incrementalFile: `reports/stryker-incremental.${name}.static.json`,
  }
}
