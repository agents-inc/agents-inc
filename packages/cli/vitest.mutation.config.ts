import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig, mergeConfig, type Plugin } from "vitest/config";

import baseConfig from "./vitest.config.ts";

// Stryker runs from the repo root, so the root is set back to this package.
const CLI_ROOT = fileURLToPath(new URL(".", import.meta.url));

// Stryker's vitest runner passes `pool: "threads"` to createVitest and vitest 4.1 copies it onto
// every project, where `process.chdir` throws. `configureVitest` runs after that copy, and the pool
// is read from `project.config` when files are scheduled, so the projects go back to forks.
const forksPool: Plugin = {
  name: "stryker-forks-pool",
  configureVitest({ project }) {
    project.config.pool = "forks";
  },
};

// In Stryker's copy these read instrumented source rather than the source they check. Found by
// recording every read of a mutated file made in a test worker during a plain run.
const READS_SOURCE_TEXT = [
  "scripts/check-boundary-union-casts.test.ts",
  "scripts/check-findings-frontmatter.test.ts",
  "scripts/check-mirrored-constants.test.ts",
  "scripts/check-spawn-doors.test.ts",
  "scripts/check-spec-name-vocabulary.test.ts",
  "scripts/check-symbol-citations.test.ts",
  "scripts/generate-matrix-package.test.ts",
  "src/cli/lib/__tests__/claude-plugin-imports-are-funnelled.test.ts",
  "src/cli/lib/__tests__/config-gate-enforcement.test.ts",
  "src/cli/lib/__tests__/config-types-agent-defs-agree.test.ts",
  "src/cli/lib/__tests__/e2e-runner-environment.test.ts",
  "src/cli/lib/__tests__/edit-decides-scope-once.test.ts",
  "src/cli/lib/__tests__/failure-reporting-classification.test.ts",
  "src/cli/lib/__tests__/handed-out-invocations.test.ts",
  "src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts",
  "src/cli/lib/__tests__/host-path-literals-are-funnelled.test.ts",
  "src/cli/lib/__tests__/host-path-symbols-are-funnelled.test.ts",
  "src/cli/lib/__tests__/kebab-name-judges-agree.test.ts",
  "src/cli/lib/__tests__/shared-fixture-writers.test.ts",
  "src/cli/lib/__tests__/source-folder-literals-are-funnelled.test.ts",
  "src/cli/lib/__tests__/spec-gates.test.ts",
  "src/cli/lib/__tests__/tested-exports-reach-production.test.ts",
  "src/cli/lib/configuration/__tests__/config-types-writer.test.ts",
  "src/cli/lib/configuration/__tests__/config-writer-import-ban.test.ts",
  "src/cli/lib/configuration/__tests__/renderers-come-from-the-shared-package.test.ts",
  "src/cli/lib/hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts",
];

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: CLI_ROOT,
    plugins: [forksPool],
    test: { exclude: [...configDefaults.exclude, ...READS_SOURCE_TEXT] },
  }),
);
