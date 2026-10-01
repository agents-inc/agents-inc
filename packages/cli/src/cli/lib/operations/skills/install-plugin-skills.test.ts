import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

import { installPluginSkills } from "./install-plugin-skills";
import { hostAt } from "../../hosts/host-for.js";
import { buildSkillConfig } from "../../__tests__/helpers/index.js";

/** The one host every `hostAt` answer in this file is, so a spy set here is the spy called. */
const mockInstallPlugin = vi.mocked(hostAt("/any-root").installPlugin);

const PROJECT_DIR = "/tmp/test-project";
const MARKETPLACE = "agents-inc";

describe("installPluginSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should install plugin skills with correct scope routing", async () => {
    const skills = [
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "global", origin: MARKETPLACE }),
    ];

    const result = await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockInstallPlugin).toHaveBeenCalledTimes(2);
    expect(mockInstallPlugin).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      PROJECT_DIR,
    );
    expect(mockInstallPlugin).toHaveBeenCalledWith(
      `api-framework-hono@${MARKETPLACE}`,
      "global",
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
      buildSkillConfig("web-framework-react", { scope: "project", origin: "eject" }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("web-styling-tailwind", { scope: "global", origin: "eject" }),
    ];

    const result = await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockInstallPlugin).toHaveBeenCalledTimes(1);
    expect(mockInstallPlugin).toHaveBeenCalledWith(
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
      buildSkillConfig("web-framework-react", { scope: "project", origin: MARKETPLACE }),
      buildSkillConfig("api-framework-hono", { scope: "project", origin: MARKETPLACE }),
    ];

    mockInstallPlugin
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
    const skills = [
      buildSkillConfig("web-testing-vitest", { scope: "project", origin: MARKETPLACE }),
    ];

    await installPluginSkills(skills, MARKETPLACE, PROJECT_DIR);

    expect(mockInstallPlugin).toHaveBeenCalledWith(
      "web-testing-vitest@agents-inc",
      "project",
      PROJECT_DIR,
    );
  });

  it("should return empty results when no plugin skills", async () => {
    const result = await installPluginSkills([], MARKETPLACE, PROJECT_DIR);

    expect(mockInstallPlugin).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ installed: [], failed: [] });
  });
});
