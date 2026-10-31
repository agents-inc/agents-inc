import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SkillId } from "../../../types/index.js";
import type { SkillConfig } from "../../../types/config.js";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

import { uninstallPluginSkills } from "./uninstall-plugin-skills";
import { hostAt } from "../../hosts/host-for.js";
import { buildSkillConfig } from "../../__tests__/helpers/index.js";

const mockUninstallPlugin = vi.mocked(hostAt("/any-root").uninstallPlugin);

const PROJECT_DIR = "/tmp/test-project";
/** The installation's marketplace; an entry installed from it records it as its `origin`. */
const MARKETPLACE = "agents-inc-marketplace";

describe("uninstallPluginSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should uninstall skills with scope from old config", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "global", origin: MARKETPLACE }),
    ];

    mockUninstallPlugin.mockResolvedValue("removed");

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(mockUninstallPlugin).toHaveBeenCalledTimes(2);
    expect(mockUninstallPlugin).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
    expect(mockUninstallPlugin).toHaveBeenCalledWith(
      `api-framework-hono@${MARKETPLACE}`,
      "global",
      PROJECT_DIR,
    );

    expect(result.uninstalled).toStrictEqual(["web-framework-react", "api-framework-hono"]);
    expect(result.failed).toStrictEqual([]);
  });

  it("should default to 'project' scope when old skill not found", async () => {
    const skillIds: SkillId[] = ["web-framework-react"];
    const oldSkills: SkillConfig[] = [];

    await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(mockUninstallPlugin).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
  });

  it("should collect failures without throwing", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: MARKETPLACE }),
    ];

    mockUninstallPlugin
      .mockResolvedValueOnce("removed")
      .mockRejectedValueOnce(new Error("Plugin not found"));

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(result.uninstalled).toStrictEqual(["web-framework-react"]);
    expect(result.failed).toStrictEqual([{ id: "api-framework-hono", error: "Plugin not found" }]);
  });

  it("should return uninstalled skill IDs", async () => {
    const skillIds: SkillId[] = [
      "web-framework-react",
      "web-styling-tailwind",
      "api-framework-hono",
    ];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("web-styling-tailwind", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "global", origin: MARKETPLACE }),
    ];
    mockUninstallPlugin.mockResolvedValue("removed");

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(result.uninstalled).toStrictEqual([
      "web-framework-react",
      "web-styling-tailwind",
      "api-framework-hono",
    ]);
  });

  it("does not report a skill whose plugin the host found nothing to remove", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: MARKETPLACE }),
    ];

    mockUninstallPlugin.mockResolvedValueOnce("absent").mockResolvedValueOnce("removed");

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(mockUninstallPlugin).toHaveBeenCalledTimes(2);
    expect(result.uninstalled).toStrictEqual(["api-framework-hono"]);
    expect(result.failed).toStrictEqual([]);
  });

  describe("an entry whose origin is another marketplace than the installation's", () => {
    const OTHER_MARKETPLACE = "team-marketplace";
    const HONO_FROM_OTHER = buildSkillConfig("api-framework-hono", {
      scope: "global",
      origin: OTHER_MARKETPLACE,
    });

    /** Answers as Claude Code does: only a plugin held under that name, at that scope, is removed. */
    const hostHolding = (heldRef: string) =>
      mockUninstallPlugin.mockImplementation(async (ref, scope) =>
        ref === heldRef && scope === HONO_FROM_OTHER.scope ? "removed" : "absent",
      );

    it("removes the plugin under the name its install recorded", async () => {
      hostHolding(`api-framework-hono@${OTHER_MARKETPLACE}`);

      const result = await uninstallPluginSkills(
        ["api-framework-hono"],
        [HONO_FROM_OTHER],
        MARKETPLACE,
        PROJECT_DIR,
      );

      expect(mockUninstallPlugin).toHaveBeenCalledWith(
        `api-framework-hono@${OTHER_MARKETPLACE}`,
        "global",
        PROJECT_DIR,
      );
      expect(result).toStrictEqual({ uninstalled: ["api-framework-hono"], failed: [] });
    });

    it("still removes a plugin the host holds under the installation's marketplace", async () => {
      hostHolding(`api-framework-hono@${MARKETPLACE}`);

      const result = await uninstallPluginSkills(
        ["api-framework-hono"],
        [HONO_FROM_OTHER],
        MARKETPLACE,
        PROJECT_DIR,
      );

      expect(result).toStrictEqual({ uninstalled: ["api-framework-hono"], failed: [] });
    });
  });
});
