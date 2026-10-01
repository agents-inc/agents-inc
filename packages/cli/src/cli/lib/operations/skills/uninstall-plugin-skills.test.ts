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

/** The one host every `hostAt` answer in this file is, so a spy set here is the spy called. */
const mockUninstallPlugin = vi.mocked(hostAt("/any-root").uninstallPlugin);

const PROJECT_DIR = "/tmp/test-project";
const MARKETPLACE = "agents-inc-marketplace";

describe("uninstallPluginSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should uninstall skills with scope from old config", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: "agents-inc" }),
      buildSkillConfig("api-framework-hono", { scope: "global", origin: "agents-inc" }),
    ];

    // Stated rather than defaulted: the host's answer is what this function REPORTS, so a spec
    // whose expectation is "both were removed" has to be the thing that says both were.
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
      buildSkillConfig("web-framework-react", { scope: "project", origin: "agents-inc" }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: "agents-inc" }),
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
      buildSkillConfig("web-framework-react", { scope: "project", origin: "agents-inc" }),
      buildSkillConfig("web-styling-tailwind", { scope: "project", origin: "agents-inc" }),
      buildSkillConfig("api-framework-hono", { scope: "global", origin: "agents-inc" }),
    ];
    mockUninstallPlugin.mockResolvedValue("removed");

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(result.uninstalled).toStrictEqual([
      "web-framework-react",
      "web-styling-tailwind",
      "api-framework-hono",
    ]);
  });

  /**
   * `removed` and `absent` are both ordinary endings — asking twice is ordinary, and a user who ran
   * the host's own remove command themselves is the common case — so the distinction cannot be an
   * exception and is the return value. Before it was read, a plugin that had already gone was
   * reported as one this run took away, and the two were indistinguishable in the output.
   */
  it("does not report a skill whose plugin the host found nothing to remove", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: "agents-inc" }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: "agents-inc" }),
    ];

    mockUninstallPlugin.mockResolvedValueOnce("absent").mockResolvedValueOnce("removed");

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    // Both were ASKED — an `absent` answer is not a skipped call — and only the one the host
    // really removed is reported.
    expect(mockUninstallPlugin).toHaveBeenCalledTimes(2);
    expect(result.uninstalled).toStrictEqual(["api-framework-hono"]);
    expect(result.failed).toStrictEqual([]);
  });
});
