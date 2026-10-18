import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

import {
  installPluginSkills,
  unbackedPluginInstallError,
  unbackedPluginSkillIds,
} from "./install-plugin-skills";
import {
  createMockMultiSourceSkill,
  createMockSkillSource,
} from "../../__tests__/factories/skill-factories.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import { hostAt } from "../../hosts/host-for.js";
import { buildSkillConfig } from "../../__tests__/helpers/index.js";

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

describe("plugin skills no marketplace carries", () => {
  /** Both exist only on this disk; one is installed as a plugin, the other as a copy. */
  const LOCAL_ONLY_MATRIX = createMockMatrix(
    createMockMultiSourceSkill("web-framework-react", [createMockSkillSource("local")]),
    createMockMultiSourceSkill("web-state-zustand", [createMockSkillSource("local")]),
  );

  it("names a plugin-mode skill only this disk has, and not a copied one", () => {
    const skills = [
      buildSkillConfig("web-framework-react", { origin: MARKETPLACE }),
      buildSkillConfig("web-state-zustand", { origin: "eject" }),
    ];

    expect(unbackedPluginSkillIds(skills, LOCAL_ONLY_MATRIX)).toStrictEqual([
      "web-framework-react",
    ]);
  });

  it("names every such skill in its refusal, and the two ways out", () => {
    expect(unbackedPluginInstallError(["web-framework-react", "web-state-zustand"])).toBe(
      "Cannot install 2 skill(s) as plugins — no marketplace carries them: web-framework-react, web-state-zustand. A skill that exists only in this project can only be installed as a local copy. Set its Install mode to eject in the editor, or publish it to a marketplace first.",
    );
  });
});
