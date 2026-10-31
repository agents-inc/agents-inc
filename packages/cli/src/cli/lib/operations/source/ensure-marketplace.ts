import {
  FailedLeavingPluginsSwitchedOnError,
  PluginsLeftSwitchedOnError,
  type PluginLeftSwitchedOn,
} from "../../hosts/codex-plugin-switch.js";
import type { PluginHost } from "../../hosts/plugin-host.js";
import { fetchMarketplace } from "../../loading/index.js";
import { warn } from "../../../utils/logger.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { codexPluginLeftSwitchedOn } from "../../../utils/messages.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type MarketplaceResult = {
  marketplace: string | null;
  registered: boolean;
  leftOn: readonly PluginLeftSwitchedOn[];
};

type RefreshOutcome = { refreshed: boolean; leftOn: readonly PluginLeftSwitchedOn[] };

/**
 * Registers the marketplace, or refreshes it when it exists. A resolution failure is warned here
 * because `requireMarketplace`'s error cannot tell its cause.
 */
export async function ensureMarketplace(
  sourceResult: SourceLoadResult,
  host: PluginHost,
): Promise<MarketplaceResult> {
  const marketplace = await resolveMarketplaceName(sourceResult);
  if (marketplace === null) return { marketplace: null, registered: false, leftOn: [] };

  const exists = await host.marketplaceExists(marketplace);

  if (!exists) {
    const marketplaceSource = sourceResult.sourceConfig.source.replace(/^github:/, "");
    await host.addMarketplace(marketplaceSource);
    return { marketplace, registered: true, leftOn: [] };
  }

  const outcome = await refreshOutcome(marketplace, host);
  warnOfShortfalls(outcome);
  return { marketplace, registered: false, leftOn: outcome.leftOn };
}

async function refreshOutcome(marketplace: string, host: PluginHost): Promise<RefreshOutcome> {
  try {
    await host.refreshMarketplace(marketplace);
    return { refreshed: true, leftOn: [] };
  } catch (error) {
    return outcomeOfRefusal(error);
  }
}

/** A switch the refresh turned back on is the one refusal that still leaves the listing refreshed. */
function outcomeOfRefusal(error: unknown): RefreshOutcome {
  if (error instanceof PluginsLeftSwitchedOnError) return { refreshed: true, leftOn: error.leftOn };
  if (error instanceof FailedLeavingPluginsSwitchedOnError) {
    return { refreshed: false, leftOn: error.leftOn };
  }
  return { refreshed: false, leftOn: [] };
}

function warnOfShortfalls({ refreshed, leftOn }: RefreshOutcome): void {
  if (!refreshed) warn("Could not update marketplace — continuing with cached version");
  for (const { pluginKey, configFile, reason } of leftOn) {
    warn(codexPluginLeftSwitchedOn(pluginKey, configFile, reason));
  }
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
