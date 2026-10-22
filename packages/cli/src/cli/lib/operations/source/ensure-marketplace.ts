import type { PluginHost } from "../../hosts/plugin-host.js";
import { fetchMarketplace } from "../../loading/index.js";
import { warn } from "../../../utils/logger.js";
import { getErrorMessage } from "../../../utils/errors.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type MarketplaceResult = {
  marketplace: string | null;
  registered: boolean;
};

/**
 * Registers the marketplace, or refreshes it when it exists. A resolution failure is warned here
 * because `requireMarketplace`'s error cannot tell its cause.
 */
export async function ensureMarketplace(
  sourceResult: SourceLoadResult,
  host: PluginHost,
): Promise<MarketplaceResult> {
  const marketplace = await resolveMarketplaceName(sourceResult);
  if (marketplace === null) return { marketplace: null, registered: false };

  const exists = await host.marketplaceExists(marketplace);

  if (!exists) {
    const marketplaceSource = sourceResult.sourceConfig.source.replace(/^github:/, "");
    await host.addMarketplace(marketplaceSource);
    return { marketplace, registered: true };
  }

  try {
    await host.refreshMarketplace(marketplace);
  } catch {
    warn("Could not update marketplace — continuing with cached version");
  }

  return { marketplace, registered: false };
}

/** Fetched, and recorded on `sourceResult`, when the load left it unresolved. */
async function resolveMarketplaceName(sourceResult: SourceLoadResult): Promise<string | null> {
  if (sourceResult.marketplace) return sourceResult.marketplace;

  const source = sourceResult.sourceConfig.source;
  try {
    const marketplaceResult = await fetchMarketplace(source);
    sourceResult.marketplace = marketplaceResult.marketplace.name;
    return sourceResult.marketplace;
  } catch (error) {
    warn(`Could not resolve a marketplace from '${source}': ${getErrorMessage(error)}`);
    return null;
  }
}
