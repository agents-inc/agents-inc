import { describe, it, expect, beforeEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../__tests__/test-constants.js";
import os from "os";
import { isLocalOnlySkill, loadSkillsFromAllSources } from "./multi-source-loader";
import type { SkillDefinition, SkillId } from "../../types";
import type { ResolvedConfig } from "../configuration";
import { SKILLS } from "../__tests__/test-fixtures";
import {
  CUSTOM_HOUSE_TOOLING_ID,
  CUSTOM_HOUSE_TOOLING_SKILL,
} from "../__tests__/mock-data/mock-skills.js";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { discoverAllPluginSkills } from "../plugins";
import { createMockSkillSource } from "../__tests__/factories/skill-factories";
import { verbose } from "../../utils/logger";

vi.mock("../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/logger")>()),
  verbose: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../plugins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins")>()),
  discoverAllPluginSkills: vi.fn().mockResolvedValue({}),
}));

const mockDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);

const DEFAULT_SOURCE_CONFIG: ResolvedConfig = {
  source: TEST_SOURCE_URL,
  sourceOrigin: "default",
};

describe("multi-source-loader", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks does not reset implementations
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  describe("primary source tagging", () => {
    it("should tag non-local skills with public source", async () => {
      const matrix = createMockMatrix({ ...SKILLS.react }, { ...SKILLS.vitest });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: false,
          primary: true,
        },
      ]);

      const vitest = matrix.skills["web-testing-vitest"]!;
      expect(vitest.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: false,
          primary: true,
        },
      ]);
    });

    it("should tag skills with private marketplace source when source is not default", async () => {
      const privateSourceConfig: ResolvedConfig = {
        source: "github:private-org/skills",
        sourceOrigin: "flag",
        marketplace: "Acme Corp",
        marketplaceRecordedIn: "/tmp/test/.agents-inc/claude/config.ts",
      };

      const matrix = createMockMatrix({ ...SKILLS.react }, { ...SKILLS.vitest });

      await loadSkillsFromAllSources(matrix, privateSourceConfig, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "Acme Corp",
          type: "private",
          installed: false,
          primary: true,
        },
      ]);

      const vitest = matrix.skills["web-testing-vitest"]!;
      expect(vitest.availableSources).toStrictEqual([
        {
          name: "Acme Corp",
          type: "private",
          installed: false,
          primary: true,
        },
      ]);
    });

    it("should use marketplace from marketplace parameter over sourceConfig", async () => {
      const privateSourceConfig: ResolvedConfig = {
        source: "github:private-org/skills",
        sourceOrigin: "flag",
      };

      const matrix = createMockMatrix({ ...SKILLS.react });

      await loadSkillsFromAllSources(matrix, privateSourceConfig, "/tmp/test", "Acme Corp");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "Acme Corp",
          type: "private",
          installed: false,
          primary: true,
        },
      ]);
    });

    it("should tag as public when default source has marketplace set", async () => {
      const configWithMarketplace: ResolvedConfig = {
        source: TEST_SOURCE_URL,
        sourceOrigin: "default",
        marketplace: "SomeMarketplace",
        marketplaceRecordedIn: "/tmp/test/.agents-inc/claude/config.ts",
      };

      const matrix = createMockMatrix({ ...SKILLS.react });

      await loadSkillsFromAllSources(matrix, configWithMarketplace, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "SomeMarketplace",
          type: "public",
          installed: false,
          primary: true,
        },
      ]);
    });

    it("should tag local skills with both public and local sources", async () => {
      const matrix = createMockMatrix({
        ...SKILLS.react,
        local: true,
        localPath: "/mock-project/.claude/skills/react/",
      });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: false,
          primary: true,
        },
        { name: "eject", type: "local", installed: true, installMode: "eject" },
      ]);

      expect(react.activeSource).toStrictEqual({
        name: "eject",
        type: "local",
        installed: true,
        installMode: "eject",
      });
    });

    it("leaves a skill no marketplace carries with its local copy as its only source", async () => {
      const matrix = createMockMatrix(
        { ...SKILLS.react },
        { ...CUSTOM_HOUSE_TOOLING_SKILL, localPath: "/mock-project/.claude/skills/house/" },
      );

      await loadSkillsFromAllSources(
        matrix,
        DEFAULT_SOURCE_CONFIG,
        "/tmp/test",
        undefined,
        new Set([CUSTOM_HOUSE_TOOLING_ID]),
      );

      const custom = matrix.skills[CUSTOM_HOUSE_TOOLING_ID]!;
      expect(custom.availableSources).toStrictEqual([
        { name: "eject", type: "local", installed: true, installMode: "eject" },
      ]);
      expect(custom.activeSource).toStrictEqual({
        name: "eject",
        type: "local",
        installed: true,
        installMode: "eject",
      });
    });

    it("still tags every skill the marketplace does carry", async () => {
      const matrix = createMockMatrix({ ...SKILLS.react }, { ...CUSTOM_HOUSE_TOOLING_SKILL });

      await loadSkillsFromAllSources(
        matrix,
        DEFAULT_SOURCE_CONFIG,
        "/tmp/test",
        undefined,
        new Set([CUSTOM_HOUSE_TOOLING_ID]),
      );

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        { name: "agents-inc", type: "public", installed: false, primary: true },
      ]);
    });
  });

  describe("local skill tagging", () => {
    it("should tag local skills with local source and installed: true", async () => {
      const matrix = createMockMatrix({
        ...SKILLS.react,
        local: true,
        localPath: "/mock-project/.claude/skills/react/",
      });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: false,
          primary: true,
        },
        { name: "eject", type: "local", installed: true, installMode: "eject" },
      ]);
    });
  });

  describe("activeSource", () => {
    it("should set activeSource to installed variant when available", async () => {
      const matrix = createMockMatrix({
        ...SKILLS.react,
        local: true,
        localPath: "/mock-project/.claude/skills/react/",
      });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.activeSource).toStrictEqual({
        name: "eject",
        type: "local",
        installed: true,
        installMode: "eject",
      });
    });

    it("should set activeSource to public when no installed variant", async () => {
      const matrix = createMockMatrix({ ...SKILLS.react });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.activeSource).toStrictEqual({
        name: "agents-inc",
        type: "public",
        installed: false,
        primary: true,
      });
    });
  });

  describe("plugin skill tagging", () => {
    it("marks a skill carried under another marketplace's name installed there, not under the loaded one", async () => {
      const otherMarketplace = "global-marketplace";
      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-state-zustand": {
          id: "web-state-zustand",
          description: "Zustand",
          path: "/global/cache/zustand/skills/web/state/zustand",
        },
      } satisfies Partial<Record<SkillId, SkillDefinition>>);
      const matrix = createMockMatrix({
        ...SKILLS.zustand,
        availableSources: [
          { name: otherMarketplace, type: "private", installed: false, primary: true },
        ],
      });

      await loadSkillsFromAllSources(
        matrix,
        DEFAULT_SOURCE_CONFIG,
        "/tmp/test",
        undefined,
        new Set<SkillId>(["web-state-zustand"]),
      );

      expect(matrix.skills["web-state-zustand"]!.availableSources).toStrictEqual([
        {
          name: otherMarketplace,
          type: "private",
          installed: true,
          installMode: "plugin",
          primary: true,
        },
      ]);
    });

    it("should tag plugin-installed skills", async () => {
      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          description: "React framework skill",
          path: "/global/cache/react/skills/web/framework/react",
        },
      } satisfies Partial<Record<SkillId, SkillDefinition>>);

      const matrix = createMockMatrix({ ...SKILLS.react });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: true,
          installMode: "plugin",
          primary: true,
        },
      ]);
    });

    it("should tag skills from multiple plugins discovered via settings.json", async () => {
      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          description: "React",
          path: "/global/cache/react/skills/web/framework/react",
        },
        "web-state-zustand": {
          id: "web-state-zustand",
          description: "Zustand",
          path: "/global/cache/zustand/skills/web/state/zustand",
        },
      } satisfies Partial<Record<SkillId, SkillDefinition>>);

      const matrix = createMockMatrix({ ...SKILLS.react }, { ...SKILLS.zustand });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      expect(react.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: true,
          installMode: "plugin",
          primary: true,
        },
      ]);

      const zustand = matrix.skills["web-state-zustand"]!;
      expect(zustand.availableSources).toStrictEqual([
        {
          name: "agents-inc",
          type: "public",
          installed: true,
          installMode: "plugin",
          primary: true,
        },
      ]);
    });
  });
});

const REACT_PLUGIN = {
  "web-framework-react": {
    id: "web-framework-react",
    description: "React framework skill",
    path: "/global/cache/react/skills/web/framework/react",
  },
} satisfies Partial<Record<SkillId, SkillDefinition>>;

const LOCAL_SOURCE = {
  name: "eject",
  type: "local",
  installed: true,
  installMode: "eject",
} as const;

describe("multi-source-loader — what the tagging pass says and adds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  /** Plugins found only under the home directory, as a global plugin install leaves them. */
  function pluginsInstalledGlobally(): void {
    mockDiscoverAllPluginSkills.mockImplementation(async (dir) =>
      dir === os.homedir() ? REACT_PLUGIN : {},
    );
  }

  it("counts the local skills it tagged", async () => {
    const matrix = createMockMatrix({ ...SKILLS.react, local: true });

    await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

    expect(verbose).toHaveBeenCalledWith("Tagged 1 local skills with local source");
  });

  it("says no plugin skill was found, and tags none, when no plugin is installed", async () => {
    const matrix = createMockMatrix({ ...SKILLS.react });

    await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

    expect(verbose).toHaveBeenCalledWith("No plugin skills discovered from settings.json");
    expect(verbose).not.toHaveBeenCalledWith("Tagged 0 plugin-installed skills");
    expect(verbose).not.toHaveBeenCalledWith("Found 0 global plugin skill(s)");
  });

  it("marks a skill installed as a plugin from the home directory, and says so", async () => {
    pluginsInstalledGlobally();
    const matrix = createMockMatrix({ ...SKILLS.react });

    await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

    expect(matrix.skills["web-framework-react"]?.availableSources).toStrictEqual([
      { name: "agents-inc", type: "public", installed: true, installMode: "plugin", primary: true },
    ]);
    expect(verbose).toHaveBeenCalledWith("Found 1 global plugin skill(s)");
    expect(verbose).toHaveBeenCalledWith("Tagged 1 plugin-installed skills");
    expect(verbose).not.toHaveBeenCalledWith("No plugin skills discovered from settings.json");
  });

  it("takes the home directory's plugins as its own, never as global ones, when the load is for the home directory", async () => {
    pluginsInstalledGlobally();
    const matrix = createMockMatrix({ ...SKILLS.react });

    await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, os.homedir());

    expect(matrix.skills["web-framework-react"]?.availableSources).toStrictEqual([
      { name: "agents-inc", type: "public", installed: true, installMode: "plugin", primary: true },
    ]);
    expect(verbose).toHaveBeenCalledWith("Tagged 1 plugin-installed skills");
    expect(verbose).not.toHaveBeenCalledWith("Found 1 global plugin skill(s)");
  });

  it("says how many project plugin skills it tagged, and never that none were found", async () => {
    mockDiscoverAllPluginSkills.mockImplementation(async (dir) =>
      dir === os.homedir() ? {} : REACT_PLUGIN,
    );
    const matrix = createMockMatrix({ ...SKILLS.react });

    await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

    expect(verbose).toHaveBeenCalledWith("Tagged 1 plugin-installed skills");
    expect(verbose).not.toHaveBeenCalledWith("No plugin skills discovered from settings.json");
  });

  it("adds no source to a skill no marketplace carries that another already has as a plugin", async () => {
    mockDiscoverAllPluginSkills.mockResolvedValue(REACT_PLUGIN);
    const installedElsewhere = createMockSkillSource("private", {
      name: "acme",
      installed: true,
      installMode: "plugin",
    });
    const matrix = createMockMatrix({
      ...SKILLS.react,
      availableSources: [installedElsewhere, LOCAL_SOURCE],
    });

    await loadSkillsFromAllSources(
      matrix,
      DEFAULT_SOURCE_CONFIG,
      "/tmp/test",
      undefined,
      new Set<SkillId>(["web-framework-react"]),
    );

    expect(matrix.skills["web-framework-react"]?.availableSources).toStrictEqual([
      installedElsewhere,
      LOCAL_SOURCE,
    ]);
  });

  it("adds a plugin source beside the local copy of a skill no marketplace carries", async () => {
    mockDiscoverAllPluginSkills.mockResolvedValue(REACT_PLUGIN);
    const matrix = createMockMatrix({ ...SKILLS.react, local: true });

    await loadSkillsFromAllSources(
      matrix,
      DEFAULT_SOURCE_CONFIG,
      "/tmp/test",
      undefined,
      new Set<SkillId>(["web-framework-react"]),
    );

    expect(matrix.skills["web-framework-react"]?.availableSources).toStrictEqual([
      LOCAL_SOURCE,
      { name: "agents-inc", type: "public", installed: true, installMode: "plugin", primary: true },
    ]);
  });
});

describe("isLocalOnlySkill", () => {
  it("answers true only for a skill whose every source is its local copy", () => {
    expect(isLocalOnlySkill(undefined)).toBe(false);
    expect(isLocalOnlySkill({ ...SKILLS.react, availableSources: [LOCAL_SOURCE] })).toBe(true);
    expect(
      isLocalOnlySkill({
        ...SKILLS.react,
        availableSources: [
          LOCAL_SOURCE,
          { name: "agents-inc", type: "public", installed: false, primary: true },
        ],
      }),
    ).toBe(false);
  });
});
