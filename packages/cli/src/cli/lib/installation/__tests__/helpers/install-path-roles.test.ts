import { describe, expect, it } from "vitest";

import { ROOT_SITE_REFUSED, attributeByRole, type RoleSite } from "./install-path-roles.js";

/** Two sites that do not overlap, and one nested inside the first — the contested case. */
const SITES: RoleSite[] = [
  { role: "agents@global", at: "host/agents" },
  { role: "skills@global", at: "host/skills" },
  { role: "settings@global", at: "host/settings.json" },
];

const OVERLAPPING_SITES: RoleSite[] = [...SITES, { role: "everything@global", at: "host" }];

describe("attributeByRole", () => {
  it("names the site that claims each path, and claims a file site only on that exact file", () => {
    expect(
      attributeByRole(
        ["host/agents/one.md", "host/skills/one/SKILL.md", "host/settings.json"],
        SITES,
      ).claims,
      "a site claims a path when the path IS it or sits inside it, and nothing else",
    ).toStrictEqual([
      { path: "host/agents/one.md", roles: ["agents@global"] },
      { path: "host/skills/one/SKILL.md", roles: ["skills@global"] },
      { path: "host/settings.json", roles: ["settings@global"] },
    ]);
  });

  it("reports a path no site claims rather than dropping it", () => {
    expect(
      attributeByRole(["host/agents/one.md", "host/hooks/gate.mjs"], SITES).unclaimed,
      "a path under no site is where the install wrote somewhere no role names — the whole signal",
    ).toStrictEqual(["host/hooks/gate.mjs"]);
  });

  it("reports a path two sites claim, and does not count it as unclaimed", () => {
    const attribution = attributeByRole(["host/agents/one.md"], OVERLAPPING_SITES);

    expect(
      { contested: attribution.contested, unclaimed: attribution.unclaimed },
      "a role widened to a parent directory swallows its siblings, and reads as a clean attribution unless the overlap is reported on its own",
    ).toStrictEqual({ contested: ["host/agents/one.md"], unclaimed: [] });
  });

  it("does not let a prefix that stops mid-segment claim a path", () => {
    expect(
      attributeByRole(["host/agents-inc/config.ts"], SITES).unclaimed,
      "`host/agents` must not claim `host/agents-inc` — the two directories differ by four characters and hold different products",
    ).toStrictEqual(["host/agents-inc/config.ts"]);
  });

  it("names every site that claimed something, and no site that claimed nothing", () => {
    expect(
      attributeByRole(["host/agents/one.md", "host/settings.json"], SITES).exercised,
      "a role claiming nothing is a role that moved, and an attribution that did not say so reads as complete",
    ).toStrictEqual(["agents@global", "settings@global"]);
  });

  it("refuses a site standing at the tree root, naming it", () => {
    expect(
      () => attributeByRole(["host/agents/one.md"], [{ role: "everything", at: "" }]),
      "a site at the root claims every path, so every tree it is handed reads as fully explained",
    ).toThrow(ROOT_SITE_REFUSED);
  });
});
