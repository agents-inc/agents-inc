import { ensureMarketplace } from "./ensure-marketplace.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type MarketplaceRequirement =
  { ok: true; marketplace: string; registered: boolean } | { ok: false; error: string };

/**
 * Resolves the marketplace required for plugin operations. Plugin install
 * intent is inviolable — callers must hard-error on `ok: false` rather than
 * silently falling back to eject or skipping, and must do so BEFORE any
 * filesystem mutation so a failure leaves no partial state on disk.
 */
export async function requireMarketplace(
  sourceResult: SourceLoadResult,
  purpose: string,
): Promise<MarketplaceRequirement> {
  const mpResult = await ensureMarketplace(sourceResult);
  if (!mpResult.marketplace) {
    return {
      ok: false,
      error:
        `Cannot ${purpose}: marketplace could not be resolved from source '${sourceResult.sourceConfig.source}'. ` +
        `Plugin install mode requires a marketplace — fix the source or switch the affected skills to eject mode.`,
    };
  }
  return { ok: true, marketplace: mpResult.marketplace, registered: mpResult.registered };
}
