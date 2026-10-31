import { ensureMarketplace } from "./ensure-marketplace.js";
import type { PluginLeftSwitchedOn } from "../../hosts/codex-plugin-switch.js";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type MarketplaceRequirement =
  | {
      ok: true;
      marketplace: string;
      registered: boolean;
      leftOn: readonly PluginLeftSwitchedOn[];
    }
  | { ok: false; error: string };

/** Callers must hard-error on `ok: false`, never fall back to eject, before touching disk. */
export async function requireMarketplace(
  sourceResult: SourceLoadResult,
  purpose: string,
  host: PluginHost,
): Promise<MarketplaceRequirement> {
  const mpResult = await ensureMarketplace(sourceResult, host);
  if (!mpResult.marketplace) {
    return {
      ok: false,
      error:
        `Cannot ${purpose}: marketplace could not be resolved from '${sourceResult.sourceConfig.source}'. ` +
        `Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.`,
    };
  }
  return {
    ok: true,
    marketplace: mpResult.marketplace,
    registered: mpResult.registered,
    leftOn: mpResult.leftOn,
  };
}
