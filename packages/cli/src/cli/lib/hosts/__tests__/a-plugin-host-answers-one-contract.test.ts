/**
 * The seam between this CLI and whichever host's plugin machinery it is talking to.
 *
 * Before C3 the CLI called Claude Code's plugin commands directly, from a handful of production
 * files, each of which was a place where "install a skill" was spelled in one host's vocabulary.
 * C3 puts a `PluginHost` between them. No figure is written here, because the whole point of the
 * step is to take it to zero and a number left behind would be wrong from the commit that lands —
 * run the census instead, from `packages/cli`:
 *
 * ```
 * grep -rln "claudePlugin" src/cli --include='*.ts*' | grep -v "hosts/\|__tests__" | grep -v '\.test\.'
 * ```
 *
 * **This file pins the seam's SHAPE and its static answers; it runs no host command.** The three
 * layers are deliberately separate files, because each can hold while the next breaks:
 *
 * - here — the contract, over a fake host and over Claude's, so "the interface says what it needs"
 *   is checked against something that is not Claude;
 * - `the-claude-host-spawns-what-it-spawns-today.test.ts` — the wire, every argv, cwd and
 *   environment variable the Claude host hands the binary, recorded rather than described;
 * - `e2e/smoke/plugin-host-contract.smoke.test.ts` — the binary, where Claude's own exit codes and
 *   messages decide the outcome, run only on a machine that has `claude`.
 *
 * **The fake is in this file rather than in a shared helper, and that is the design.** Its whole
 * job is to be the control for the assertions below — a second implementation, so a contract that
 * only Claude could satisfy fails here instead of being discovered in C4 — and the contract IS its
 * test: every assertion it appears in is a statement about it as much as about the interface. A
 * shared helper would need tests of its own to be trusted, and those tests would be these.
 *
 * **Everything below is this lane's PROPOSAL where the plan does not settle it**, and each such
 * line says so where it is declared. The plan (`todo/plans/CLI-codex-provider-plan.md`, step C3)
 * fixes the member roster, `PluginRemovalOutcome`, `HostPlugin`'s three fields and that
 * `offeredPlacements` answers four cells for Claude and three for Codex. It does not fix the shape
 * of a placement cell, whether a host is a value object, what `hostFor` does with a provider this
 * release has no host for, or the trailing options parameter — those are named as proposals in this
 * lane's report, for the implementer or the owner to overturn.
 */

import { describe, expect, it } from "vitest";

import type { SkillScope } from "../../../types/config.js";
import type { HostPlugin, PluginHost, PluginRemovalOutcome } from "../plugin-host.js";
import { hostFor } from "../host-for.js";
import { bindsItsOfferedPlacements, refuseUnofferedPlacement } from "../offered-placements.js";

/**
 * Every member the seam carries, and what kind of thing each one is.
 *
 * Written out rather than derived from the type: a roster read off `keyof PluginHost` would move
 * with the interface and could never report a member being added, removed or renamed, which is the
 * one thing a seam's roster is for. The plan's C3 entry is where this list comes from.
 *
 * The `satisfies` clause checks the list against the interface without deriving it: a member the
 * interface drops or renames stops compiling on this line, and one it gains is still reported by
 * the runtime comparison below, which is the half no type can see.
 */
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
] as const satisfies readonly (keyof PluginHost)[];

/**
 * The mode and scope words a placement cell is written in — the product's own, not a host's.
 *
 * `plugin` and `eject` are `INSTALL_MODES`; `global` and `project` are `SkillScope`. Claude's own
 * plugin scope vocabulary is `project | user`, and it is what `toClaudePluginScope` exists to
 * translate into at six production call sites today. A cell spelled in Claude's words would make
 * the seam's roster of offered placements untranslatable for any other host, which is the leak this
 * whole step is against.
 */
const CELL_SEPARATOR = "+";

/**
 * Claude's four offered cells, every one named, sorted so the assertion does not pin an order the
 * plan never states.
 *
 * Four rather than three is the whole of what separates the two hosts at this seam: Codex refuses
 * plugin+project, because it has no per-project plugin installation at all — no subcommand takes a
 * scope, and `codex plugin add` run inside a project writes the switch to the global config and
 * silently un-scopes it. C4 is where the three-cell host arrives; C3 only has to make the refusal
 * readable off the host rather than written as `if (provider === "codex")` in the installer.
 */
const CLAUDE_OFFERED_CELLS = [
  "eject+global",
  "eject+project",
  "plugin+global",
  "plugin+project",
] as const;

/** A placement cell as one comparable name. Nothing is picked out of anything — it is a spelling. */
function cellName(placement: { mode: string; scope: SkillScope }): string {
  return `${placement.mode}${CELL_SEPARATOR}${placement.scope}`;
}

/** The kind of each member, which is what the roster assertion compares. */
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
};

/** What one plugin the fake host has installed looks like, so the contract has something to find. */
const A_PLUGIN: HostPlugin = {
  pluginKey: "web-framework-react@a-marketplace",
  installPath: "/somewhere/plugins/cache/a-marketplace/web-framework-react/1.0.0",
  enabled: true,
};

/**
 * A second implementation of the seam, holding its installed plugins in memory.
 *
 * It exists to answer one question no assertion against Claude can: whether the contract says what
 * a CLI needs, or what Claude happens to do. A member that could only be implemented by shelling
 * out to `claude` shows up here as a member with nothing honest to return.
 *
 * It offers all four cells, because a fake that offered three would make the four-cell assertion
 * below true of Claude alone and the contract would stop being a contract.
 */
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
    listPlugins: () => Promise.resolve([...installed.values()]),
  };
}

/**
 * A host that installs plugins for a MACHINE rather than for a project: three cells, not four.
 *
 * It is the second control in this file, and it exists because the refusal
 * {@link bindsItsOfferedPlacements} adds has no reachable case on either host above — Claude
 * offers every cell, so its roster can never be wrong out loud. Its shape is Codex's, measured:
 * `codex plugin add` takes no scope, and run inside a project it writes the switch to the global
 * config and silently un-scopes it.
 */
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

/**
 * The hosts the static half of the contract runs against.
 *
 * Claude's comes through `hostFor` rather than being imported directly, because `hostFor` is the
 * door every caller will use and a host reachable only by deep import is a door nobody goes
 * through.
 */
const HOSTS: readonly { name: string; host: PluginHost }[] = [
  { name: "a fake host", host: fakePluginHost() },
  { name: "the Claude host", host: hostFor("claude") },
];

describe("every plugin host answers the same roster", () => {
  /**
   * The roster is read off the host's OWN keys, which also pins the host as a value object rather
   * than a class instance: a prototype hides its methods from `Object.keys`, and a roster nothing
   * can read is a roster nothing can hold. This lane's proposal, stated so it can be overturned
   * rather than discovered.
   */
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

  /**
   * The vocabulary half, which is the reason the seam exists rather than a second `exec.ts`.
   *
   * A member called `claudePluginInstall` behind an interface is the same coupling one indirection
   * further away: the next host has to implement a name that describes a binary it is not.
   */
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

  /**
   * The two members cannot disagree, and this is the assertion that says so.
   *
   * `installsProjectScopedPlugins` stops being a fallback switch in C3 and becomes the source of a
   * refusal, while `offeredPlacements` is what the refusal's message names. A host whose boolean
   * says one thing and whose cells say another refuses a placement it also offers — and both
   * members read as correct on their own, in different files.
   */
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

/**
 * What makes the roster binding rather than decorative, which the seam did not have until now.
 *
 * `offeredPlacements` was declared so a refusal could read data off the host instead of being
 * written as `if (provider === "codex")` in the installer — and then nothing consulted it, and the
 * contract did not require a host to refuse a placement it does not offer. A roster nobody reads
 * is not a rule: the installer goes on trying whatever it was asked for, and the roster reads as
 * correct because nothing ever contradicts it.
 *
 * **The pair is over {@link globalOnlyPluginHost}, and it has to be.** A refusal pinned on its own
 * cannot tell a correctly-scoped guard from one that has swallowed its whole domain, so the
 * allowed case sits beside it in this describe. And neither case can be written against Claude:
 * Claude offers all four cells, so there is no unoffered cell to refuse and no assertion here can
 * be wrong about it.
 *
 * **Mutation-checked in both directions, re-measured on 2026-09-26 over every spec in this
 * directory:**
 *
 * - the guard neutered to refuse NOTHING — the refusal case here goes red, and so do its Codex
 *   twins in `the-codex-host-offers-three-placements.test.ts` and
 *   `the-codex-host-speaks-codex.test.ts`;
 * - the guard neutered to refuse EVERYTHING — the allowed case and the two roster cases here go
 *   red, plus all three installing cases in `the-claude-host-spawns-what-it-spawns-today.test.ts`
 *   and the offered-cell controls in both Codex files. The Claude file going red through
 *   `hostFor("claude")` is what proves the door really does wrap the host it answers;
 * - `hostFor` handing back either host unwrapped — nothing goes red for Claude, which offers every
 *   cell, so its binding removes nothing observable; Codex's goes red in
 *   `the-codex-host-speaks-codex.test.ts`, "spawns nothing at all for the placement Codex does not
 *   offer", which is the spec that holds the door's wiring.
 */
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

/**
 * Removal, which is the one member whose answer a caller has to act on.
 *
 * Today `claudePluginUninstall` returns `void` and swallows Claude's "not installed" / "not found"
 * by name, so a caller cannot tell a plugin it removed from one that was never there — which is
 * the whole of why `uninstall` reports a count it did not observe (D11(b)). C3 introduces the
 * outcome; C4e is where uninstall starts reading it.
 *
 * **The pair is in this file on purpose.** An `absent`-only spec cannot tell a correct
 * classification from a host that answers `absent` for everything: both leave the assertion green
 * and the second removes nothing while reporting nothing wrong.
 */
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

/**
 * What a listed plugin carries, which is three fields and not two.
 *
 * `enabled` is the field this CLI has never had: Claude's discovery filters by the enabled switch
 * before it answers, so "installed but disabled" has no representation today. Codex keeps disabled
 * plugins in `installed[]` with the switch beside them, and "installed but disabled for this
 * project" is a doctor row that cannot be written without the field.
 */
describe("a listed plugin", () => {
  it("carries its key, where it is installed and whether it is enabled", async () => {
    const [plugin] = await fakePluginHost().listPlugins("/a-project");

    expect(
      plugin,
      "a listing without the enabled switch cannot tell an installed plugin from one a project has turned off",
    ).toStrictEqual(A_PLUGIN);
  });
});

/**
 * The door, and the one thing it must not do quietly.
 *
 * C2 deleted `DEFAULT_PROVIDER` so that no path could assume Claude by omission. Until C4 this
 * door refused Codex outright — "this release has a host for claude only" — and `it("refuses a
 * provider this release has no host for, by name")` stood here pinning that refusal. **C4 deleted
 * the refusal by building the host it was standing in for, so the spec was replaced rather than
 * broadened**: its subject no longer exists, and a test kept green by relaxing its matcher would
 * have gone on reading as a guard while guarding nothing.
 *
 * What it was protecting is still the claim, and it outlives the interim state: the failure is
 * silent in the direction that looks fine, because Claude's host would install Claude's plugins
 * for a Codex installation, exit 0 and leave every test green. So the pair below asks each
 * provider for a host and holds the answer against the provider that was ASKED for. Both halves
 * are needed — one alone cannot tell a door that routes from one that returns the same host twice.
 *
 * Every other claim about the Codex host lives in `the-codex-host-speaks-codex.test.ts` and
 * `the-codex-host-offers-three-placements.test.ts`; this is the routing alone.
 */
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
