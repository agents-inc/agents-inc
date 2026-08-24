import path from "path";
import { sharedSourcePath } from "../../src/cli/lib/__tests__/helpers/shared-source.js";
import { writeE2ESourceInto } from "./create-e2e-source.js";
import { createE2ESource } from "./create-e2e-source.js";
import type { E2ESource } from "./create-e2e-source.js";
import { runCLI, writeTestPackageJson } from "./test-utils.js";
import { E2E_MARKETPLACE_NAME } from "../pages/constants.js";
import { PLUGINS_DIST_PATH } from "../../src/cli/consts.js";
import type { RelationshipDefinitions } from "../../src/cli/types/index.js";

export type E2EPluginSource = E2ESource & {
  marketplaceName: string;
  pluginsDir: string;
};

/**
 * Creates a complete plugin source for E2E tests: builds the E2E source,
 * compiles skill plugins, and generates marketplace.json.
 *
 * This is the canonical setup helper for all plugin-mode E2E tests.
 * The build chain is: createE2ESource() -> build plugins -> build marketplace.
 *
 * The marketplace is published under the shared, STABLE `E2E_MARKETPLACE_NAME`
 * unless a spec names its own. It used to be `e2e-test-${Date.now()}`, which no
 * assertion could name: a marketplace's name is the namespace its skill ids are
 * written in, so a per-run name leaves both the identity and every id it prefixes
 * unassertable. Registrations are per-invocation (every spawned CLI gets its own
 * HOME), and the one spec that registers into the real HOME re-adds
 * unconditionally, so a fixed name replaces a stale entry rather than colliding
 * with it.
 *
 * @throws if either build step fails (non-zero exit code)
 */
export async function createE2EPluginSource(options?: {
  /** Overrides {@link E2E_MARKETPLACE_NAME} — for specs whose subject IS the name. */
  marketplaceName?: string;
  relationships?: Partial<RelationshipDefinitions>;
  /**
   * Build a private, WRITABLE fixture instead of taking the shared frozen one.
   *
   * Only a spec that writes into its source after this returns needs it — one that runs a build
   * again, or rewrites `package.json`. See `__tests__/helpers/shared-source.ts` for why the shared
   * one is frozen rather than merely shared.
   */
  owned?: boolean;
}): Promise<E2EPluginSource> {
  // The shared fixture already IS the output of the two builds below, run once in `globalSetup`
  // and frozen. Reaching for it costs nothing; building another costs ~1.65s, and 51 call sites
  // were each paying that — about 84 seconds a run. Any option means the caller wants a fixture
  // this one is not, so it builds its own.
  if (options === undefined || Object.keys(options).length === 0) {
    return sharedPluginSource();
  }

  const { sourceDir, tempDir } = await createE2ESource(
    options.relationships ? { relationships: options.relationships } : undefined,
  );

  const buildPluginsResult = await runCLI(["build", "plugins"], sourceDir);
  if (buildPluginsResult.exitCode !== 0) {
    throw new Error(
      `build plugins failed (exit ${buildPluginsResult.exitCode}):\n${buildPluginsResult.combined}`,
    );
  }

  const marketplaceName = options.marketplaceName ?? E2E_MARKETPLACE_NAME;
  await writeTestPackageJson(sourceDir, { name: marketplaceName });
  const buildMarketplaceResult = await runCLI(["build", "marketplace"], sourceDir);
  if (buildMarketplaceResult.exitCode !== 0) {
    throw new Error(
      `build marketplace failed (exit ${buildMarketplaceResult.exitCode}):\n${buildMarketplaceResult.combined}`,
    );
  }

  const pluginsDir = path.join(sourceDir, PLUGINS_DIST_PATH);

  return { sourceDir, tempDir, marketplaceName, pluginsDir };
}

/**
 * Builds a plugin-capable source into `dir` — the two CLI builds, in order.
 *
 * Shared with `globalSetup`, which runs it once into the shared fixture before freezing it, so the
 * shared tree and a privately-built one are the same tree by construction rather than by two
 * descriptions that have to be kept in step.
 */
export async function buildPluginSourceInto(dir: string): Promise<void> {
  const sourceDir = path.join(dir, "fixture");
  await writeE2ESourceInto(sourceDir);

  const builtPlugins = await runCLI(["build", "plugins"], sourceDir);
  if (builtPlugins.exitCode !== 0) {
    throw new Error(
      `build plugins failed (exit ${builtPlugins.exitCode}):\n${builtPlugins.combined}`,
    );
  }

  await writeTestPackageJson(sourceDir, { name: E2E_MARKETPLACE_NAME });

  const builtMarketplace = await runCLI(["build", "marketplace"], sourceDir);
  if (builtMarketplace.exitCode !== 0) {
    throw new Error(
      `build marketplace failed (exit ${builtMarketplace.exitCode}):\n${builtMarketplace.combined}`,
    );
  }
}

/** The shared frozen fixture, described the way a freshly built one is. */
function sharedPluginSource(): E2EPluginSource {
  const sourceDir = path.join(sharedSourcePath(), "fixture");

  return {
    sourceDir,
    tempDir: sharedSourcePath(),
    marketplaceName: E2E_MARKETPLACE_NAME,
    pluginsDir: path.join(sourceDir, PLUGINS_DIST_PATH),
  };
}
