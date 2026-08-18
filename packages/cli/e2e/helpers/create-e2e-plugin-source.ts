import path from "path";
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
}): Promise<E2EPluginSource> {
  const { sourceDir, tempDir } = await createE2ESource(
    options?.relationships ? { relationships: options.relationships } : undefined,
  );

  const buildPluginsResult = await runCLI(["build", "plugins"], sourceDir);
  if (buildPluginsResult.exitCode !== 0) {
    throw new Error(
      `build plugins failed (exit ${buildPluginsResult.exitCode}):\n${buildPluginsResult.combined}`,
    );
  }

  const marketplaceName = options?.marketplaceName ?? E2E_MARKETPLACE_NAME;
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
