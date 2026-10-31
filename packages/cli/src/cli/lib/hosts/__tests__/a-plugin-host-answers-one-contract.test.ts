import { describe, expect, it } from "vitest";

import type { SkillScope } from "../../../types/config.js";
import type { HostPlugin, PluginHost, PluginRemovalOutcome } from "../plugin-host.js";
import { hostFor } from "../host-for.js";
import { bindsItsOfferedPlacements, refuseUnofferedPlacement } from "../offered-placements.js";

/** Written out rather than read off `keyof PluginHost`, so a membership change is reported. */
const PLUGIN_HOST_MEMBERS = [
  "addMarketplace",
  "installPlugin",
  "installsProjectScopedPlugins",
  "isAvailable",
  "listPlugins",
  "marketplaceExists",
  "offeredPlacements",
  "provider",
  "refreshMarketplace",
  "uninstallPlugin",
  "updatePlugin",
] as const satisfies readonly (keyof PluginHost)[];

const CELL_SEPARATOR = "+";

const CLAUDE_OFFERED_CELLS = [
  "eject+global",
  "eject+project",
  "plugin+global",
  "plugin+project",
] as const;

function cellName(placement: { mode: string; scope: SkillScope }): string {
  return `${placement.mode}${CELL_SEPARATOR}${placement.scope}`;
}

const EXPECTED_MEMBER_KINDS: Record<(typeof PLUGIN_HOST_MEMBERS)[number], string> = {
  addMarketplace: "function",
  installPlugin: "function",
  installsProjectScopedPlugins: "boolean",
  isAvailable: "function",
  listPlugins: "function",
  marketplaceExists: "function",
  offeredPlacements: "object",
  provider: "string",
  refreshMarketplace: "function",
  uninstallPlugin: "function",
  updatePlugin: "function",
};

const A_PLUGIN: HostPlugin = {
  pluginKey: "web-framework-react@a-marketplace",
  installPath: "/somewhere/plugins/cache/a-marketplace/web-framework-react/1.0.0",
  enabled: true,
};

/** A second implementation, so a contract only Claude could satisfy fails here. */
function fakePluginHost(): PluginHost {
  const installed = new Map<string, HostPlugin>([[A_PLUGIN.pluginKey, A_PLUGIN]]);
  const marketplaces = new Set<string>(["a-marketplace"]);

  return {
    provider: "claude",
    offeredPlacements: [
      { mode: "plugin", scope: "global" },
      { mode: "plugin", scope: "project" },
      { mode: "eject", scope: "global" },
      { mode: "eject", scope: "project" },
    ],
    installsProjectScopedPlugins: true,
    isAvailable: () => Promise.resolve(true),
    marketplaceExists: (name: string) => Promise.resolve(marketplaces.has(name)),
    addMarketplace: (source: string) => {
      marketplaces.add(source);
      return Promise.resolve();
    },
    refreshMarketplace: () => Promise.resolve(),
    installPlugin: (pluginRef: string) => {
      installed.set(pluginRef, { pluginKey: pluginRef, installPath: "/somewhere", enabled: true });
      return Promise.resolve();
    },
    uninstallPlugin: (pluginRef: string): Promise<PluginRemovalOutcome> =>
      Promise.resolve(installed.delete(pluginRef) ? "removed" : "absent"),
    updatePlugin: () => Promise.resolve(),
    listPlugins: () => Promise.resolve([...installed.values()]),
  };
}

/** Codex's shape: plugins install for the machine, so plugin+project is not offered. */
function globalOnlyPluginHost(): PluginHost {
  return {
    ...fakePluginHost(),
    offeredPlacements: [
      { mode: "plugin", scope: "global" },
      { mode: "eject", scope: "global" },
      { mode: "eject", scope: "project" },
    ],
    installsProjectScopedPlugins: false,
  };
}

const HOSTS: readonly { name: string; host: PluginHost }[] = [
  { name: "a fake host", host: fakePluginHost() },
  { name: "the Claude host", host: hostFor("claude") },
  { name: "the Codex host", host: hostFor("codex") },
];

describe("every plugin host answers the same roster", () => {
  // Read off the host's own keys, so a class instance (methods on the prototype) fails too.
  it.each(HOSTS)("carries exactly the members the seam declares — $name", ({ host }) => {
    expect(
      Object.keys(host).sort(),
      "a member added, renamed or dropped on one host is a call site that works on one host only",
    ).toStrictEqual([...PLUGIN_HOST_MEMBERS]);
  });

  it.each(HOSTS)("answers each member with the kind the seam declares — $name", ({ host }) => {
    const kinds = Object.fromEntries(
      PLUGIN_HOST_MEMBERS.map((member) => [member, typeof host[member]]),
    );

    expect(
      kinds,
      "a member present under the right name and the wrong kind satisfies a roster check and fails at the call",
    ).toStrictEqual(EXPECTED_MEMBER_KINDS);
  });

  it.each(HOSTS)("names no member after the host it was extracted from — $name", ({ host }) => {
    expect(
      Object.keys(host).filter((member) => member.toLowerCase().includes("claude")),
      "the seam carries one host's vocabulary, so a second host implements a name that describes a binary it is not",
    ).toStrictEqual([]);
  });
});

describe("the placements a host offers", () => {
  it("names all four cells for Claude", () => {
    expect(
      hostFor("claude").offeredPlacements.map(cellName).sort(),
      "Claude installs plugins at either scope and copies skills at either scope, so all four mode/scope cells are offered",
    ).toStrictEqual([...CLAUDE_OFFERED_CELLS]);
  });

  it.each(HOSTS)(
    "agrees with the plugin+project cell about whether that placement exists — $name",
    ({ host }) => {
      const offersPluginProject = host.offeredPlacements.some(
        (placement) => placement.mode === "plugin" && placement.scope === "project",
      );

      expect(
        { flag: host.installsProjectScopedPlugins, cell: offersPluginProject },
        "the flag and the cell answer the same question in two places, so a refusal can name a placement the host also offers",
      ).toStrictEqual({ flag: offersPluginProject, cell: offersPluginProject });
    },
  );

  it.each(HOSTS)("offers no cell twice — $name", ({ host }) => {
    const cells = host.offeredPlacements.map(cellName);

    expect(
      cells.length,
      "a duplicated cell makes a roster of offered placements read longer than the set of placements",
    ).toBe(new Set(cells).size);
  });
});

// Paired over a three-cell host: Claude offers every cell, so it has nothing to refuse.
describe("a plugin placement the host does not offer", () => {
  const A_REF = "web-framework-react@a-marketplace";

  it("is refused, naming the cells the host does offer", async () => {
    const host = bindsItsOfferedPlacements(globalOnlyPluginHost());

    await expect(
      host.installPlugin(A_REF, "project", "/a-project"),
      "a refusal that names no alternative leaves the user to guess which of the other cells to ask for, and a refusal written as a provider name has to be rewritten for every host after it",
    ).rejects.toThrow(
      "Refusing to install web-framework-react@a-marketplace as plugin+project: the claude host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
    );
  });

  it("does not stop the same host installing at a cell it DOES offer", async () => {
    const host = bindsItsOfferedPlacements(globalOnlyPluginHost());

    await host.installPlugin(A_REF, "global", "/a-project");

    expect(
      (await host.listPlugins("/a-project")).map((plugin) => plugin.pluginKey),
      "without this half a guard that refused everything would satisfy the case above and install nothing at all",
    ).toContain(A_REF);
  });

  it.each(HOSTS)("never fires for a cell the host advertises — $name", ({ host }) => {
    const advertised = host.offeredPlacements.filter((placement) => placement.mode === "plugin");

    expect(
      advertised.flatMap((placement) => {
        try {
          refuseUnofferedPlacement(host, placement, A_REF);
          return [];
        } catch {
          return [cellName(placement)];
        }
      }),
      "a host that refuses a placement it also offers is a host whose two answers to one question disagree, and both read as correct on their own",
    ).toStrictEqual([]);
  });
});

describe("removing a plugin says whether there was one", () => {
  it("answers removed for a plugin the host has", async () => {
    const host = fakePluginHost();

    expect(
      await host.uninstallPlugin(A_PLUGIN.pluginKey, "global", "/a-project"),
      "a plugin that was installed and is now gone is the only case a caller may count as removed",
    ).toBe("removed");
  });

  it("answers absent for a plugin the host does not have", async () => {
    const host = fakePluginHost();

    expect(
      await host.uninstallPlugin("never-installed@a-marketplace", "global", "/a-project"),
      "absent is what stops uninstall reporting a removal it did not perform",
    ).toBe("absent");
  });

  it("stops listing a plugin it has removed", async () => {
    const host = fakePluginHost();
    await host.uninstallPlugin(A_PLUGIN.pluginKey, "global", "/a-project");

    expect(
      await host.listPlugins("/a-project"),
      "an outcome of removed while the plugin is still listed is the shape codex plugin remove has, and the reason the outcome is classified from a list rather than an exit code",
    ).toStrictEqual([]);
  });
});

describe("a listed plugin", () => {
  it("carries its key, where it is installed and whether it is enabled", async () => {
    const [plugin] = await fakePluginHost().listPlugins("/a-project");

    expect(
      plugin,
      "a listing without the enabled switch cannot tell an installed plugin from one a project has turned off",
    ).toStrictEqual(A_PLUGIN);
  });
});

describe("asking for a host", () => {
  it("answers the Claude host for Claude", () => {
    expect(
      hostFor("claude").provider,
      "the host a caller gets must be the host for the provider it asked about",
    ).toBe("claude");
  });

  it("answers the Codex host for Codex, never Claude's", () => {
    expect(
      hostFor("codex").provider,
      "answering Claude's host would install Claude's plugins into a Codex installation and exit 0",
    ).toBe("codex");
  });
});
