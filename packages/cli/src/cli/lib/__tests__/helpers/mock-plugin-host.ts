import { vi } from "vitest";

import type { PluginHost } from "../../hosts/plugin-host.js";

/**
 * A {@link PluginHost} whose every verb is a spy, for a spec about a CALLER of the seam.
 *
 * Shared rather than written per file because the roster is ten members long and a stub short of
 * one member fails at the call rather than at the mock — a caller reaching an undefined verb
 * reports a TypeError from inside the code under test, which reads as a product fault. Each spy is
 * typed against its own member, so a default answer the interface stops admitting — a verb whose
 * result changes shape — fails `tsc` here rather than being handed to every caller. The two
 * data members carry Claude's real answers, so a caller reading `offeredPlacements` (uninstall's
 * scope sweep is the one that does) sees a host that installs plugins at both scopes.
 *
 * **It is not the contract's fake.** `lib/hosts/__tests__/a-plugin-host-answers-one-contract.test.ts`
 * keeps its own in-file implementation deliberately: that one is a CONTROL, a second real
 * implementation whose whole job is to fail when the interface says something only Claude could
 * answer. This one answers nothing — every member is a spy, so it could satisfy any interface at
 * all and proves nothing about this one.
 *
 * Used inside a `vi.mock` factory for `lib/hosts/host-for.js`, which is the module every caller of
 * the seam reaches it through:
 *
 * ```ts
 * vi.mock("../../hosts/host-for.js", () => {
 *   const host = createMockPluginHost();
 *   return { hostAt: () => host, hostFor: () => host };
 * });
 * ```
 */
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
