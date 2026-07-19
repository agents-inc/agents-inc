import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SkillId } from "../../../types/index.js";
import type { SkillConfig } from "../../../types/config.js";

vi.mock("../../../utils/exec.js", () => ({
  claudePluginUninstall: vi.fn(),
}));

import { uninstallPluginSkills } from "./uninstall-plugin-skills";
import { claudePluginUninstall } from "../../../utils/exec.js";

const mockClaudePluginUninstall = vi.mocked(claudePluginUninstall);

const PROJECT_DIR = "/tmp/test-project";
const MARKETPLACE = "agents-inc-marketplace";

function makeSkillConfig(
  id: SkillId,
  scope: "project" | "global",
  source = "agents-inc",
): SkillConfig {
  return { id, scope, source };
}

describe("uninstallPluginSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should uninstall skills with scope from old config", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("api-framework-hono", "global"),
    ];

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginUninstall).toHaveBeenCalledTimes(2);
    expect(mockClaudePluginUninstall).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
    expect(mockClaudePluginUninstall).toHaveBeenCalledWith(
      `api-framework-hono@${MARKETPLACE}`,
      "user",
      PROJECT_DIR,
    );

    expect(result.uninstalled).toStrictEqual(["web-framework-react", "api-framework-hono"]);
    expect(result.failed).toStrictEqual([]);
  });

  it("should default to 'project' scope when old skill not found", async () => {
    const skillIds: SkillId[] = ["web-framework-react"];
    const oldSkills: SkillConfig[] = [];

    await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginUninstall).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
  });

  it("should collect failures without throwing", async () => {
    const skillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];
    const oldSkills = [
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("api-framework-hono", "project"),
    ];

    mockClaudePluginUninstall
      .mockResolvedValueOnce(undefined)
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
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("web-styling-tailwind", "project"),
      makeSkillConfig("api-framework-hono", "global"),
    ];

    const result = await uninstallPluginSkills(skillIds, oldSkills, MARKETPLACE, PROJECT_DIR);

    expect(result.uninstalled).toStrictEqual([
      "web-framework-react",
      "web-styling-tailwind",
      "api-framework-hono",
    ]);
  });
});
