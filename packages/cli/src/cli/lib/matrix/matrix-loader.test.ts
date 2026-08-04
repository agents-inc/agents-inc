import { describe, it, expect, vi } from "vitest";

import { renderSkillMd } from "../__tests__/content-generators";
import { STANDARD_FILES } from "../../consts";

// For extractAllSkills tests, we mock fs/loader. For loadSkillCategories/loadSkillRules,
// we mock loadConfig from the configuration module.
const mockReadFile = vi.fn();
const mockFileExists = vi.fn().mockResolvedValue(true);
const mockGlob = vi.fn().mockResolvedValue([]);
const mockParseFrontmatter = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock("../../utils/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/fs")>()),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  glob: (...args: unknown[]) => mockGlob(...args),
}));

vi.mock("../../utils/logger");

vi.mock("../loading", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading")>()),
  parseFrontmatter: (...args: unknown[]) => mockParseFrontmatter(...args),
}));

vi.mock("../configuration/config-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../configuration/config-loader")>()),
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

import { loadSkillCategories, loadSkillRules, extractAllSkills } from "./matrix-loader";
import { warn } from "../../utils/logger";

describe("matrix-loader", () => {
  describe("loadSkillCategories", () => {
    it("loads and validates a valid skill-categories config", async () => {
      mockLoadConfig.mockResolvedValue({
        version: "1.0.0",
        categories: {
          "web-framework": {
            id: "web-framework",
            displayName: "Framework",
            description: "Core UI framework",
            exclusive: true,
            required: true,
            order: 1,
          },
          "web-styling": {
            id: "web-styling",
            displayName: "Styling",
            description: "CSS approach",
            exclusive: true,
            required: true,
            order: 3,
          },
          "api-api": {
            id: "api-api",
            displayName: "API",
            description: "Backend framework",
            exclusive: true,
            required: true,
            order: 1,
          },
        },
      });

      const categories = await loadSkillCategories("/project/config/skill-categories.ts");

      expect(categories["web-framework"]).toStrictEqual({
        id: "web-framework",
        displayName: "Framework",
        description: "Core UI framework",
        exclusive: true,
        required: true,
        order: 1,
      });
      expect(categories["web-styling"]).toStrictEqual({
        id: "web-styling",
        displayName: "Styling",
        description: "CSS approach",
        exclusive: true,
        required: true,
        order: 3,
      });
      expect(categories["api-api"]).toStrictEqual({
        id: "api-api",
        displayName: "API",
        description: "Backend framework",
        exclusive: true,
        required: true,
        order: 1,
      });
    });

    it("throws when loadConfig returns null", async () => {
      mockLoadConfig.mockResolvedValue(null);

      await expect(loadSkillCategories("/nonexistent/skill-categories.ts")).rejects.toThrow(
        /Invalid skill categories/,
      );
    });

    it("throws when loadConfig rejects", async () => {
      mockLoadConfig.mockRejectedValue(new Error("ENOENT: file not found"));

      await expect(loadSkillCategories("/nonexistent/skill-categories.ts")).rejects.toThrow();
    });

    it("includes path in error message", async () => {
      mockLoadConfig.mockResolvedValue(null);

      await expect(loadSkillCategories("/custom/path/categories.ts")).rejects.toThrow(
        /\/custom\/path\/categories\.ts/,
      );
    });
  });

  describe("loadSkillRules", () => {
    it("loads and validates a valid skill-rules config", async () => {
      mockLoadConfig.mockResolvedValue({
        version: "1.0.0",
        relationships: {
          conflicts: [
            {
              skills: ["react", "vue"],
              reason: "Frameworks are mutually exclusive",
            },
          ],
          discourages: [
            {
              skills: ["zustand", "react"],
              reason: "Test discourage rule",
            },
          ],
          recommends: [{ skill: "zustand", reason: "Best React state management" }],
          requires: [
            {
              skill: "zustand",
              needs: ["react"],
              reason: "Zustand requires React",
            },
          ],
          alternatives: [
            {
              purpose: "Frontend Framework",
              skills: ["react", "vue"],
            },
          ],
        },
      });

      const result = await loadSkillRules("/project/config/skill-rules.ts");

      expect(result.version).toBe("1.0.0");
      expect(result.relationships).toStrictEqual({
        conflicts: [
          {
            skills: ["react", "vue"],
            reason: "Frameworks are mutually exclusive",
          },
        ],
        discourages: [
          {
            skills: ["zustand", "react"],
            reason: "Test discourage rule",
          },
        ],
        recommends: [{ skill: "zustand", reason: "Best React state management" }],
        requires: [
          {
            skill: "zustand",
            needs: ["react"],
            reason: "Zustand requires React",
          },
        ],
        alternatives: [
          {
            purpose: "Frontend Framework",
            skills: ["react", "vue"],
          },
        ],
      });
    });

    it("throws when loadConfig returns null", async () => {
      mockLoadConfig.mockResolvedValue(null);

      await expect(loadSkillRules("/nonexistent/skill-rules.ts")).rejects.toThrow(
        /Invalid skill rules/,
      );
    });

    it("throws when loadConfig rejects", async () => {
      mockLoadConfig.mockRejectedValue(new Error("ENOENT: file not found"));

      await expect(loadSkillRules("/nonexistent/skill-rules.ts")).rejects.toThrow();
    });

    it("parses valid relationships without error", async () => {
      mockLoadConfig.mockResolvedValue({
        version: "1.0.0",
        relationships: {
          conflicts: [],
          discourages: [],
          recommends: [{ skill: "react", reason: "Recommended framework" }],
          requires: [],
          alternatives: [],
        },
      });

      const result = await loadSkillRules("/project/skill-rules.ts");

      expect(result.relationships.recommends).toHaveLength(1);
      expect(result.relationships.recommends[0].skill).toBe("react");
    });

    it("returns default empty arrays when relationships are missing", async () => {
      mockLoadConfig.mockResolvedValue({
        version: "1.0.0",
      });

      const result = await loadSkillRules("/project/skill-rules.ts");

      expect(result.relationships.conflicts).toStrictEqual([]);
      expect(result.relationships.discourages).toStrictEqual([]);
      expect(result.relationships.recommends).toStrictEqual([]);
      expect(result.relationships.requires).toStrictEqual([]);
      expect(result.relationships.alternatives).toStrictEqual([]);
    });

    it("includes path in error message", async () => {
      mockLoadConfig.mockResolvedValue(null);

      await expect(loadSkillRules("/custom/path/rules.ts")).rejects.toThrow(
        /\/custom\/path\/rules\.ts/,
      );
    });
  });

  describe("extractAllSkills", () => {
    it("extracts skills from metadata.yaml files with valid SKILL.md", async () => {
      mockGlob.mockResolvedValue([`web-framework-react/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          return `
category: web-framework
domain: web
author: "@vince"
version: "1"
displayName: react
slug: react
cliDescription: React framework
`;
        }
        // SKILL.md content
        return renderSkillMd("web-framework-react", "React framework", "# React");
      });
      mockParseFrontmatter.mockReturnValue({
        name: "web-framework-react",
        description: "React framework",
      });

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe("web-framework-react");
      expect(skills[0].category).toBe("web-framework");
      expect(skills[0].author).toBe("@vince");
    });

    it("skips skills without SKILL.md", async () => {
      mockGlob.mockResolvedValue([`orphan-skill/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(false);

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(0);
    });

    it("skips skills with invalid metadata.yaml", async () => {
      mockGlob.mockResolvedValue([`bad-skill/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          // Missing required 'category' and 'author' fields
          return "invalid: true\n";
        }
        return renderSkillMd("bad-skill", "test", "# Bad");
      });

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(0);
    });

    it("throws when displayName is missing from metadata", async () => {
      mockGlob.mockResolvedValue([`no-cli/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          return `
category: web-framework
domain: web
author: "@test"
slug: "no-cli"
`;
        }
        return renderSkillMd("no-cli", "test", "# Test");
      });
      mockParseFrontmatter.mockReturnValue({
        name: "no-cli",
        description: "test",
      });

      await expect(extractAllSkills("/project/src/skills")).rejects.toThrow(
        /missing required 'displayName' field/,
      );
    });

    it("skips skills with invalid SKILL.md frontmatter", async () => {
      mockGlob.mockResolvedValue([`bad-fm/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          return `
category: web-framework
domain: web
author: "@test"
version: "1"
displayName: bad-fm
slug: bad-fm
`;
        }
        return "no frontmatter here";
      });
      mockParseFrontmatter.mockReturnValue(null);

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(0);
    });

    it("returns empty array when no metadata files found", async () => {
      mockGlob.mockResolvedValue([]);

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(0);
    });

    it("warns when metadata.yaml has invalid YAML syntax", async () => {
      mockGlob.mockResolvedValue([`broken-yaml/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          return "category: [unclosed bracket";
        }
        return renderSkillMd("broken", "test", "# Broken");
      });

      // YAML parse error should propagate (metadata readFile succeeds but YAML is malformed)
      await expect(extractAllSkills("/project/src/skills")).rejects.toThrow();
    });

    it("warns and skips when metadata.yaml has wrong field types", async () => {
      mockGlob.mockResolvedValue([`wrong-types/${STANDARD_FILES.METADATA_YAML}`]);
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          // category must be a valid CategoryPath string, not a number
          return `
category: 12345
author: true
version: "1"
displayName: wrong
`;
        }
        return renderSkillMd("wrong-types", "test", "# Test");
      });

      const skills = await extractAllSkills("/project/src/skills");

      expect(skills).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid metadata.yaml"));
    });

    it("extracts multiple skills and skips invalid ones in the same batch", async () => {
      mockGlob.mockResolvedValue([
        `skill-valid/${STANDARD_FILES.METADATA_YAML}`,
        `skill-no-skillmd/${STANDARD_FILES.METADATA_YAML}`,
        `skill-bad-meta/${STANDARD_FILES.METADATA_YAML}`,
      ]);
      mockFileExists.mockImplementation(async (filePath: string) => {
        // skill-no-skillmd has no SKILL.md
        return !filePath.includes("skill-no-skillmd");
      });
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes("skill-valid") && filePath.includes(STANDARD_FILES.METADATA_YAML)) {
          return `category: web-framework\ndomain: web\nauthor: "@test"\nversion: "1"\ndisplayName: valid\nslug: valid`;
        }
        if (
          filePath.includes("skill-bad-meta") &&
          filePath.includes(STANDARD_FILES.METADATA_YAML)
        ) {
          return "invalid: true\n";
        }
        return renderSkillMd("skill-valid", "Valid skill", "# Test");
      });
      mockParseFrontmatter.mockReturnValue({
        name: "skill-valid",
        description: "Valid skill",
      });

      const skills = await extractAllSkills("/project/src/skills");

      // Only the valid skill should be extracted
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe("skill-valid");
    });
  });
});
