import path from "path";
import { sharedSourcePath } from "../../src/cli/lib/__tests__/helpers/shared-source.js";
import { buildE2EMarketplaceInto } from "./create-e2e-source.js";
import { createE2ESource } from "./create-e2e-source.js";
import type { E2ESource } from "./create-e2e-source.js";
import { E2E_MARKETPLACE_NAME } from "../pages/constants.js";
import { PLUGINS_DIST_PATH } from "../../src/cli/consts.js";
import type { RelationshipDefinitions } from "../../src/cli/types/index.js";

export type E2EPluginSource = E2ESource & {
  marketplaceName: string;
  pluginsDir: string;
};

/** Without options, returns the shared frozen fixture instead of building one. */
export async function createE2EPluginSource(options?: {
  marketplaceName?: string;
  relationships?: Partial<RelationshipDefinitions>;
  /** A private writable fixture, for specs that write into their source. */
  owned?: boolean;
}): Promise<E2EPluginSource> {
  if (options === undefined || Object.keys(options).length === 0) {
    return sharedPluginSource();
  }

  const marketplaceName = options.marketplaceName ?? E2E_MARKETPLACE_NAME;
  const { sourceDir, tempDir } = await createE2ESource({
    marketplaceName,
    ...(options.relationships && { relationships: options.relationships }),
  });

  const pluginsDir = path.join(sourceDir, PLUGINS_DIST_PATH);

  return { sourceDir, tempDir, marketplaceName, pluginsDir };
}

/** Also run by `globalSetup` to build the shared fixture, so both trees match by construction. */
export async function buildPluginSourceInto(dir: string): Promise<void> {
  await buildE2EMarketplaceInto(path.join(dir, "fixture"));
}

function sharedPluginSource(): E2EPluginSource {
  const sourceDir = path.join(sharedSourcePath(), "fixture");

  return {
    sourceDir,
    tempDir: sharedSourcePath(),
    marketplaceName: E2E_MARKETPLACE_NAME,
    pluginsDir: path.join(sourceDir, PLUGINS_DIST_PATH),
  };
}
