/**
 * The Codex host's roster, and the refusal that roster is for.
 *
 * **This file drives the DOOR, not the host module.** Everything it asks for comes through
 * `hostFor("codex")` and `refuseUnofferedPlacement`, the two a caller reaches the roster by.
 *
 * **Nothing here spawns.** The roster is data and the refusal is a pure function over it, which is
 * the whole reason `offeredPlacements` was made data rather than an `if (provider === "codex")` in
 * the installer: the rule can be checked without a binary, on a machine that has no Codex at all.
 * What the host does with a real `codex` lives in `e2e/lifecycle/codex-offered-placements.e2e.test.ts`
 * and `e2e/smoke/`.
 *
 * **Three pairings, and each exists because its half alone proves nothing:**
 *
 * - the refused cell against an offered one, on the SAME host — a refusal on its own cannot tell a
 *   correctly-scoped guard from one that has swallowed plugin mode entirely, since both leave the
 *   tree unchanged and both throw;
 * - the same cell against the CLAUDE host — which is what says `plugin+project` is refused because
 *   Codex cannot do it, not because the cell is unreachable;
 * - `installsProjectScopedPlugins` against the roster — the plan declares both, and a host whose
 *   flag says one thing and whose cells say another refuses a placement it also advertises, with
 *   each member reading as correct on its own in a different file.
 */

import { describe, expect, it } from "vitest";

import { hostFor } from "../host-for.js";
import { refuseUnofferedPlacement } from "../offered-placements.js";
import type { InstallPlacement, PluginHost } from "../plugin-host.js";

/**
 * The three cells a Codex installation offers, every one named and sorted.
 *
 * Members rather than a count: `toHaveLength(3)` is green for a roster that dropped
 * `eject + project` and gained `plugin + project`, which is the one swap this whole step is about.
 * Sorted because the plan fixes the SET and says nothing about an order.
 */
const CODEX_CELLS = ["eject+global", "eject+project", "plugin+global"] as const;

/** Claude's four, for the control. */
const CLAUDE_CELLS = ["eject+global", "eject+project", "plugin+global", "plugin+project"] as const;

/** The cell Codex has no way to fill: no Codex subcommand takes a scope. */
const PLUGIN_PROJECT: InstallPlacement = { mode: "plugin", scope: "project" };

/** The cell it fills instead, so the refusal below has a control on its own host. */
const PLUGIN_GLOBAL: InstallPlacement = { mode: "plugin", scope: "global" };

/** A skill id standing in for whatever a payload asked to be placed. */
const SUBJECT = "web-framework-react";

function cellNames(host: PluginHost): string[] {
  return host.offeredPlacements.map((cell) => `${cell.mode}+${cell.scope}`).sort();
}

describe("the Codex host's offered placements", () => {
  it("names itself as the Codex host", () => {
    expect(hostFor("codex").provider).toBe("codex");
  });

  it("offers exactly three cells, each one named", () => {
    expect(cellNames(hostFor("codex"))).toStrictEqual([...CODEX_CELLS]);
  });

  it("offers all four on Claude, which is what makes the missing cell a difference", () => {
    expect(cellNames(hostFor("claude"))).toStrictEqual([...CLAUDE_CELLS]);
  });

  it("says it installs no project-scoped plugin, and its roster says the same", () => {
    const host = hostFor("codex");
    const offersPluginProject = host.offeredPlacements.some(
      (cell) => cell.mode === "plugin" && cell.scope === "project",
    );

    expect(host.installsProjectScopedPlugins).toBe(false);
    expect(offersPluginProject).toBe(host.installsProjectScopedPlugins);
  });
});

describe("a plugin asked for at project scope on Codex", () => {
  it("is refused, naming the subject and all three cells the host does offer", () => {
    const host = hostFor("codex");

    let refusal: Error | undefined;
    try {
      refuseUnofferedPlacement(host, PLUGIN_PROJECT, SUBJECT);
    } catch (error) {
      refusal = error instanceof Error ? error : new Error(String(error));
    }

    expect(refusal, "plugin+project was not refused on the Codex host").toBeDefined();
    const message = refusal?.message ?? "";
    expect(message).toContain(SUBJECT);
    for (const cell of CODEX_CELLS) expect(message).toContain(cell);
  });

  it("does not stop the same host placing a plugin at global scope", () => {
    expect(() => refuseUnofferedPlacement(hostFor("codex"), PLUGIN_GLOBAL, SUBJECT)).not.toThrow();
  });

  it("is not refused on Claude, where the cell exists", () => {
    expect(() =>
      refuseUnofferedPlacement(hostFor("claude"), PLUGIN_PROJECT, SUBJECT),
    ).not.toThrow();
  });
});
