import { describe, it, expect, beforeEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../__tests__/test-constants.js";
import { loadSkillsFromAllSources } from "./multi-source-loader";
import type { SkillDefinition, SkillId } from "../../types";
import type { ResolvedConfig } from "../configuration";
import { SKILLS } from "../__tests__/test-fixtures";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { discoverAllPluginSkills } from "../plugins";

// Mock external dependencies
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
    // Reset discoverAllPluginSkills to default empty result (clearAllMocks does not reset implementations)
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

      // marketplace parameter (from marketplace.json) takes precedence
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
      // Edge case: default source with marketplace set should use marketplace name but remain public type
      const configWithMarketplace: ResolvedConfig = {
        source: TEST_SOURCE_URL,
        sourceOrigin: "default",
        marketplace: "SomeMarketplace",
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

      // activeSource should be the local source (installed)
      expect(react.activeSource).toStrictEqual({
        name: "eject",
        type: "local",
        installed: true,
        installMode: "eject",
      });
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
    it("should tag plugin-installed skills", async () => {
      // Mock discoverAllPluginSkills to return skills from global cache
      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          description: "React framework skill",
          path: "/global/cache/react/skills/web/framework/react",
        },
        // Boundary cast: test fixture covers a subset of all SkillIds
      } satisfies Partial<Record<SkillId, SkillDefinition>>);

      const matrix = createMockMatrix({ ...SKILLS.react });

      await loadSkillsFromAllSources(matrix, DEFAULT_SOURCE_CONFIG, "/tmp/test");

      const react = matrix.skills["web-framework-react"]!;
      // Should have a single public source marked as plugin-installed
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
        // Boundary cast: test fixture covers a subset of all SkillIds
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
