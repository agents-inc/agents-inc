import { describe, expect, it } from "vitest";

import { hostFor } from "../host-for.js";
import { refuseUnofferedPlacement, refuseUnofferedPlacements } from "../offered-placements.js";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import type { InstallPlacement, PluginHost } from "../plugin-host.js";

/** Members rather than a count, which a swapped cell would leave green. */
const CODEX_CELLS = ["eject+global", "eject+project", "plugin+global"] as const;

const CLAUDE_CELLS = ["eject+global", "eject+project", "plugin+global", "plugin+project"] as const;

/** No Codex plugin subcommand takes a scope. */
const PLUGIN_PROJECT: InstallPlacement = { mode: "plugin", scope: "project" };

const PLUGIN_GLOBAL: InstallPlacement = { mode: "plugin", scope: "global" };

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

describe("a configuration's skills checked against the Codex host", () => {
  const PLUGIN_ORIGIN = "agents-inc";

  it("refuses a plugin skill at project scope, naming it and the cells Codex offers", () => {
    const skills = buildSkillConfigs([SUBJECT], { scope: "project", origin: PLUGIN_ORIGIN });

    expect(() => refuseUnofferedPlacements(skills, hostFor("codex"))).toThrow(
      "Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
    );
  });

  it("lets an ejected skill at project scope through", () => {
    const skills = buildSkillConfigs([SUBJECT], { scope: "project" });

    expect(() => refuseUnofferedPlacements(skills, hostFor("codex"))).not.toThrow();
  });

  it("skips an excluded row, which places nothing", () => {
    const skills = buildSkillConfigs([SUBJECT], {
      scope: "project",
      origin: PLUGIN_ORIGIN,
      excluded: true,
    });

    expect(() => refuseUnofferedPlacements(skills, hostFor("codex"))).not.toThrow();
  });
});
