import {
  claudePluginMarketplaceExists,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceUpdate,
} from "../../../utils/exec.js";
import { fetchMarketplace } from "../../loading/index.js";
import { warn } from "../../../utils/logger.js";
import { getErrorMessage } from "../../../utils/errors.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type MarketplaceResult = {
  /** The resolved marketplace name, or null if no marketplace is configured. */
  marketplace: string | null;
  /** Whether a new marketplace was registered (vs. updated or already existed). */
  registered: boolean;
};

/**
 * Ensures the marketplace is registered with the Claude CLI.
 *
 * If the marketplace does not exist, registers it. If it exists, updates it.
 * Handles lazy marketplace name resolution when sourceResult.marketplace is undefined.
 *
 * Reports nothing on success — commands decide what to log based on the `registered`
 * flag — but never swallows a failure: `requireMarketplace` turns a null marketplace
 * into a hard error whose text cannot tell a transient fetch failure apart from a
 * source that genuinely ships no marketplace, so the cause is warned here or nowhere.
 */
export async function ensureMarketplace(
  sourceResult: SourceLoadResult,
): Promise<MarketplaceResult> {
  const source = sourceResult.sourceConfig.source;

  if (!sourceResult.marketplace) {
    try {
      const marketplaceResult = await fetchMarketplace(source);
      sourceResult.marketplace = marketplaceResult.marketplace.name;
    } catch (error) {
      warn(`Could not resolve a marketplace from '${source}': ${getErrorMessage(error)}`);
      return { marketplace: null, registered: false };
    }
  }

  const marketplace = sourceResult.marketplace;
  const exists = await claudePluginMarketplaceExists(marketplace);

  if (!exists) {
    const marketplaceSource = source.replace(/^github:/, "");
    await claudePluginMarketplaceAdd(marketplaceSource);
    return { marketplace, registered: true };
  }

  try {
    await claudePluginMarketplaceUpdate(marketplace);
  } catch {
    warn("Could not update marketplace — continuing with cached version");
  }

  return { marketplace, registered: false };
}
