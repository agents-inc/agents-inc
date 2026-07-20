import path from "path";
import { createE2ESource } from "./create-e2e-source.js";
import type { E2ESource } from "./create-e2e-source.js";
import { runCLI, writeTestPackageJson } from "./test-utils.js";
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
 * @throws if either build step fails (non-zero exit code)
 */
export async function createE2EPluginSource(options?: {
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

  const marketplaceName = options?.marketplaceName ?? `e2e-test-${Date.now()}`;
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
