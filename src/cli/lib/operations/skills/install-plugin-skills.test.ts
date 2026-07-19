import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SkillConfig } from "../../../types/config.js";
import type { SkillId } from "../../../types/index.js";

vi.mock("../../../utils/exec.js", () => ({
  claudePluginInstall: vi.fn(),
}));

import { installPluginSkills } from "./install-plugin-skills";
import { claudePluginInstall } from "../../../utils/exec.js";

const mockClaudePluginInstall = vi.mocked(claudePluginInstall);

const PROJECT_DIR = "/tmp/test-project";
const MARKETPLACE = "agents-inc";

function makeSkillConfig(id: SkillId, scope: "project" | "global", source: string): SkillConfig {
  return { id, scope, source };
}

describe("installPluginSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should install plugin skills with correct scope routing", async () => {
    const skills = [
      makeSkillConfig("web-framework-react", "project", MARKETPLACE),
      makeSkillConfig("api-framework-hono", "global", MARKETPLACE),
    ];

    const result = await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginInstall).toHaveBeenCalledTimes(2);
    expect(mockClaudePluginInstall).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
    expect(mockClaudePluginInstall).toHaveBeenCalledWith(
      `api-framework-hono@${MARKETPLACE}`,
      "user",
      PROJECT_DIR,
    );

    expect(result.installed).toStrictEqual([
      { id: "web-framework-react", ref: `web-framework-react@${MARKETPLACE}` },
      { id: "api-framework-hono", ref: `api-framework-hono@${MARKETPLACE}` },
    ]);
    expect(result.failed).toStrictEqual([]);
  });

  it("should filter out local-source skills", async () => {
    const skills = [
      makeSkillConfig("web-framework-react", "project", "eject"),
      makeSkillConfig("api-framework-hono", "project", MARKETPLACE),
      makeSkillConfig("web-styling-tailwind", "global", "eject"),
    ];

    const result = await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginInstall).toHaveBeenCalledTimes(1);
    expect(mockClaudePluginInstall).toHaveBeenCalledWith(
      `api-framework-hono@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );

    expect(result.installed).toStrictEqual([
      { id: "api-framework-hono", ref: `api-framework-hono@${MARKETPLACE}` },
    ]);
  });

  it("should collect failed installations without throwing", async () => {
    const skills = [
      makeSkillConfig("web-framework-react", "project", MARKETPLACE),
      makeSkillConfig("api-framework-hono", "project", MARKETPLACE),
    ];

    mockClaudePluginInstall
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Plugin install failed: timeout"));

    const result = await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(result.installed).toStrictEqual([
      { id: "web-framework-react", ref: `web-framework-react@${MARKETPLACE}` },
    ]);
    expect(result.failed).toStrictEqual([
      { id: "api-framework-hono", error: "Plugin install failed: timeout" },
    ]);
  });

  it("should construct plugin refs as ${id}@${marketplace}", async () => {
    const skills = [makeSkillConfig("web-testing-vitest", "project", MARKETPLACE)];

    await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginInstall).toHaveBeenCalledWith(
      "web-testing-vitest@agents-inc",
      "project",
      PROJECT_DIR,
    );
  });

  it("should return empty results when no plugin skills", async () => {
    const result = await installPluginSkills([], MARKETPLACE, PROJECT_DIR);

    expect(mockClaudePluginInstall).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ installed: [], failed: [] });
  });
});
