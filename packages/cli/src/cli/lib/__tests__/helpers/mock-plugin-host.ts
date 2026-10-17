import { vi } from "vitest";

import type { PluginHost } from "../../hosts/plugin-host.js";

/** A PluginHost whose every verb is a spy; mock `lib/hosts/host-for.js` to return it. */
export function createMockPluginHost(overrides: Partial<PluginHost> = {}): PluginHost {
  return {
    provider: "claude",
    offeredPlacements: [
      { mode: "plugin", scope: "global" },
      { mode: "plugin", scope: "project" },
      { mode: "eject", scope: "global" },
      { mode: "eject", scope: "project" },
    ],
    installsProjectScopedPlugins: true,
    isAvailable: vi.fn<PluginHost["isAvailable"]>().mockResolvedValue(true),
    marketplaceExists: vi.fn<PluginHost["marketplaceExists"]>().mockResolvedValue(true),
    addMarketplace: vi.fn<PluginHost["addMarketplace"]>().mockResolvedValue(undefined),
    refreshMarketplace: vi.fn<PluginHost["refreshMarketplace"]>().mockResolvedValue(undefined),
    installPlugin: vi.fn<PluginHost["installPlugin"]>().mockResolvedValue(undefined),
    uninstallPlugin: vi.fn<PluginHost["uninstallPlugin"]>().mockResolvedValue("removed"),
    listPlugins: vi.fn<PluginHost["listPlugins"]>().mockResolvedValue([]),
    ...overrides,
  };
}
