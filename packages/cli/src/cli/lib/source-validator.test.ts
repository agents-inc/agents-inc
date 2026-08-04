import { describe, expect, it, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import {
  checkDirNameMatchesSkillId,
  checkSnakeCaseKeys,
  isSnakeCase,
  validateSkillFilePairs,
  validateSource,
} from "./source-validator";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import {
  DIRS,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STACKS_FILE_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../consts";
import { renderConfigTs, renderAgentYaml, renderSkillMd } from "./__tests__/content-generators";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
  VALID_SKILL_RULES_FILE,
  VALID_STACK_CONFIG_FILE,
  VALID_STACKS_CONFIG_FILE,
} from "./__tests__/mock-data/mock-source-files.js";

describe("source-validator", () => {
  describe("isSnakeCase", () => {
    it("should return true for snake_case keys", () => {
      expect(isSnakeCase("display_name")).toBe(true);
      expect(isSnakeCase("some_key")).toBe(true);
      expect(isSnakeCase("a_b_c")).toBe(true);
    });

    it("should return false for camelCase keys", () => {
      expect(isSnakeCase("displayName")).toBe(false);
      expect(isSnakeCase("someKey")).toBe(false);
    });

    it("should return false for keys without underscores", () => {
      expect(isSnakeCase("name")).toBe(false);
      expect(isSnakeCase("slug")).toBe(false);
    });

    it("should return false for uppercase_UPPER patterns", () => {
      expect(isSnakeCase("UPPER_CASE")).toBe(false);
      expect(isSnakeCase("A_B")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isSnakeCase("")).toBe(false);
    });

    it("should return false for leading/trailing underscores without lowercase pair", () => {
      expect(isSnakeCase("_name")).toBe(false);
      expect(isSnakeCase("name_")).toBe(false);
    });
  });

  describe("checkSnakeCaseKeys", () => {
    const REL_PATH = "src/skills/web/framework/react/metadata.yaml";

    it("should report error for snake_case keys", () => {
      const rawMetadata = {
        display_name: "react",
        category: "web-framework",
      };

      const issues = checkSnakeCaseKeys(rawMetadata, REL_PATH);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe("error");
      expect(issues[0]?.message).toContain("display_name");
      expect(issues[0]?.file).toBe(REL_PATH);
    });

    it("should report multiple snake_case keys", () => {
      const rawMetadata = {
        display_name: "react",
        usage_guidance: "use for React",
        category: "web-framework",
      };

      const issues = checkSnakeCaseKeys(rawMetadata, REL_PATH);

      expect(issues).toHaveLength(2);
    });

    it("should return no issues for camelCase keys", () => {
      const rawMetadata = {
        displayName: "react",
        usageGuidance: "use for React",
        category: "web-framework",
      };

      const issues = checkSnakeCaseKeys(rawMetadata, REL_PATH);

      expect(issues).toStrictEqual([]);
    });

    it("should handle null rawMetadata without crashing", () => {
      const issues = checkSnakeCaseKeys(null, REL_PATH);

      expect(issues).toStrictEqual([]);
    });

    it("should handle array rawMetadata without crashing", () => {
      const issues = checkSnakeCaseKeys([1, 2, 3], REL_PATH);

      expect(issues).toStrictEqual([]);
    });

    it("should set file path on all reported issues", () => {
      const rawMetadata = { display_name: "A", usage_guidance: "B" };

      const issues = checkSnakeCaseKeys(rawMetadata, REL_PATH);

      for (const issue of issues) {
        expect(issue.file).toBe(REL_PATH);
      }
    });
  });

  describe("checkDirNameMatchesSkillId", () => {
    const REL_PATH = "src/skills/web-framework-react/SKILL.md";

    it("should warn when directory name does not match skill id", () => {
      const issues = checkDirNameMatchesSkillId("web-framework-react", REL_PATH, "react");

      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe("warning");
      expect(issues[0]?.message).toContain("web-framework-react");
      expect(issues[0]?.message).toContain("'react'");
      expect(issues[0]?.file).toBe(REL_PATH);
    });

    it("should return no issues when directory name matches skill id", () => {
      const issues = checkDirNameMatchesSkillId(
        "web-framework-react",
        REL_PATH,
        "web-framework-react",
      );

      expect(issues).toStrictEqual([]);
    });
  });

  describe("validateSkillFilePairs", () => {
    const SKILLS_DIR = "/source/src/skills";

    it("should return no issues when all pairs match", () => {
      const skillMdDirs = new Set(["web/framework/react", "api/database/drizzle"]);
      const metadataDirs = new Set(["web/framework/react", "api/database/drizzle"]);

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues).toStrictEqual([]);
    });

    it("should report error for directories with SKILL.md but no metadata.yaml", () => {
      const skillMdDirs = new Set(["web/framework/react", "web/framework/vue"]);
      const metadataDirs = new Set(["web/framework/react"]);

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe("error");
      expect(issues[0]?.message).toContain("Missing metadata.yaml");
      expect(issues[0]?.message).toContain("SKILL.md");
      expect(issues[0]?.file).toContain("web/framework/vue");
    });

    it("should report error for directories with metadata.yaml but no SKILL.md", () => {
      const skillMdDirs = new Set(["web/framework/react"]);
      const metadataDirs = new Set(["web/framework/react", "web/framework/vue"]);

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe("error");
      expect(issues[0]?.message).toContain("Missing SKILL.md");
      expect(issues[0]?.message).toContain("metadata.yaml");
      expect(issues[0]?.file).toContain("web/framework/vue");
    });

    it("should report multiple missing pairs", () => {
      const skillMdDirs = new Set(["a", "b"]);
      const metadataDirs = new Set(["c", "d"]);

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      // a and b missing metadata.yaml, c and d missing SKILL.md
      expect(issues).toHaveLength(4);
      const missingMetadata = issues.filter((i) => i.message.includes("Missing metadata.yaml"));
      const missingSkillMd = issues.filter((i) => i.message.includes("Missing SKILL.md"));
      expect(missingMetadata).toHaveLength(2);
      expect(missingSkillMd).toHaveLength(2);
    });

    it("should return no issues for empty sets", () => {
      const skillMdDirs = new Set<string>();
      const metadataDirs = new Set<string>();

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues).toStrictEqual([]);
    });

    it("should construct file paths using skillsDir", () => {
      const skillMdDirs = new Set(["web/framework/react"]);
      const metadataDirs = new Set<string>();

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues[0]?.file).toBe("/source/src/skills/web/framework/react");
    });

    it("should handle single-entry sets correctly", () => {
      const skillMdDirs = new Set(["only-skill-md"]);
      const metadataDirs = new Set(["only-metadata"]);

      const issues = validateSkillFilePairs(skillMdDirs, metadataDirs, SKILLS_DIR);

      expect(issues).toHaveLength(2);
    });
  });

  describe("validateSource", () => {
    let tempDir: string;
    let sourceDir: string;
    let skillsDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir("source-validator-");
      sourceDir = path.join(tempDir, "source");
      skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    it("should handle source with zero skills gracefully", async () => {
      const result = await validateSource(sourceDir);

      expect(result.skillCount).toBe(0);
      // Zero skills is not an error — the source simply has no skills yet
      expect(result.issues.every((i) => !i.message.includes("does not exist"))).toBe(true);
    });

    it("should report specific error for malformed YAML in metadata", async () => {
      const skillDir = path.join(skillsDir, "web", "framework", "react");
      await mkdir(skillDir, { recursive: true });

      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      // Write invalid YAML that will fail parsing
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        "category: web-framework\n  bad-indent: [\nunmatched bracket",
      );

      const result = await validateSource(sourceDir);

      expect(result.errorCount).toBe(1);
      const yamlErrors = result.issues.filter((i) => i.message.includes("Failed to parse YAML"));
      expect(yamlErrors).toHaveLength(1);
      expect(yamlErrors[0]?.severity).toBe("error");
    });

    describe("cliDescription severity routing", () => {
      it("should report over-length cliDescription as a warning carrying the actual length", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "x".repeat(75) }),
        );

        const result = await validateSource(sourceDir);

        const cliDescriptionIssues = result.issues.filter((i) =>
          i.message.includes("cliDescription"),
        );
        expect(cliDescriptionIssues).toHaveLength(1);
        expect(cliDescriptionIssues[0]?.severity).toBe("warning");
        expect(cliDescriptionIssues[0]?.message).toContain("75 characters");
        expect(result.errorCount).toBe(0);
      });

      it("should report empty cliDescription as an error", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "" }),
        );

        const result = await validateSource(sourceDir);

        const cliDescriptionIssues = result.issues.filter((i) =>
          i.message.includes("cliDescription"),
        );
        expect(cliDescriptionIssues).toHaveLength(1);
        expect(cliDescriptionIssues[0]?.severity).toBe("error");
      });
    });

    describe("directory name vs skill id", () => {
      it("should pass when directory name equals the skill id and displayName is a human name", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, displayName: "React" }),
        );

        const result = await validateSource(sourceDir);

        const dirNameIssues = result.issues.filter((i) => i.message.includes("does not match"));
        expect(dirNameIssues).toStrictEqual([]);
        expect(result.errorCount).toBe(0);
      });

      it("should warn when directory name does not equal the skill id", async () => {
        const skillDir = path.join(skillsDir, "react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
        );

        const result = await validateSource(sourceDir);

        const dirNameIssues = result.issues.filter((i) =>
          i.message.includes("does not match skill id"),
        );
        expect(dirNameIssues).toHaveLength(1);
        expect(dirNameIssues[0]?.severity).toBe("warning");
        expect(dirNameIssues[0]?.message).toContain("'react'");
        expect(dirNameIssues[0]?.message).toContain("'web-framework-react'");
      });
    });

    it("should not crash when source has skills dir but no agent directories", async () => {
      // Source with skills dir but no agents dir — should not crash
      const result = await validateSource(sourceDir);

      // Should complete without throwing
      expect(result).toStrictEqual(
        expect.objectContaining({
          issues: expect.any(Array),
          skillCount: expect.any(Number),
          errorCount: expect.any(Number),
          warningCount: expect.any(Number),
        }),
      );
    });

    describe("stack config validation", () => {
      it("should report zero issues when src/stacks/ is absent", async () => {
        const result = await validateSource(sourceDir);

        const stackIssues = result.issues.filter((i) => i.file.startsWith(DIRS.stacks));
        expect(stackIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid stack config.yaml and embedded-skill metadata", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(VALID_STACK_CONFIG_FILE),
        );

        const embeddedSkillDir = path.join(stackDir, "skills", "react");
        await mkdir(embeddedSkillDir, { recursive: true });
        await writeFile(
          path.join(embeddedSkillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
        );

        const result = await validateSource(sourceDir);

        const stackIssues = result.issues.filter((i) => i.file.startsWith(DIRS.stacks));
        expect(stackIssues).toStrictEqual([]);
      });

      it("should report error when stack config.yaml has schema violation", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        const invalidStackConfig = { ...VALID_STACK_CONFIG_FILE, version: undefined };
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(invalidStackConfig),
        );

        const result = await validateSource(sourceDir);

        const configPath = path.join(DIRS.stacks, "test-stack", STANDARD_FILES.CONFIG_YAML);
        const versionErrors = result.issues.filter(
          (i) => i.file === configPath && i.message.includes("version"),
        );
        expect(versionErrors.length).toBeGreaterThan(0);
        expect(versionErrors[0]?.severity).toBe("error");
      });

      it("should report error when embedded-skill metadata.yaml has schema violation", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(VALID_STACK_CONFIG_FILE),
        );

        const embeddedSkillDir = path.join(stackDir, "skills", "react");
        await mkdir(embeddedSkillDir, { recursive: true });
        const invalidMetadata = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, author: "no-at-sign" };
        await writeFile(
          path.join(embeddedSkillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(invalidMetadata),
        );

        const result = await validateSource(sourceDir);

        const metadataPath = path.join(
          DIRS.stacks,
          "test-stack",
          "skills",
          "react",
          STANDARD_FILES.METADATA_YAML,
        );
        const authorErrors = result.issues.filter(
          (i) => i.file === metadataPath && i.message.includes("author"),
        );
        expect(authorErrors.length).toBeGreaterThan(0);
        expect(authorErrors[0]?.severity).toBe("error");
      });
    });

    describe("source-side agent metadata validation", () => {
      it("should report zero issues when src/agents/ is absent", async () => {
        const result = await validateSource(sourceDir);

        const agentIssues = result.issues.filter((i) => i.file.startsWith(DIRS.agents));
        expect(agentIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid agent metadata.yaml", async () => {
        const agentDir = path.join(sourceDir, DIRS.agents, "developer", "web-developer");
        await mkdir(agentDir, { recursive: true });
        await writeFile(
          path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
          renderAgentYaml("web-developer"),
        );

        const result = await validateSource(sourceDir);

        const agentIssues = result.issues.filter((i) => i.file.startsWith(DIRS.agents));
        expect(agentIssues).toStrictEqual([]);
      });

      it("should report error when agent metadata.yaml has schema violation", async () => {
        const agentDir = path.join(sourceDir, DIRS.agents, "developer", "web-developer");
        await mkdir(agentDir, { recursive: true });
        // Missing required 'tools' field (schema requires min(1))
        const invalidAgent = {
          id: "web-developer",
          title: "Web Developer",
          description: "Builds web apps",
        };
        await writeFile(
          path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
          stringifyYaml(invalidAgent),
        );

        const result = await validateSource(sourceDir);

        const agentPath = path.join(
          DIRS.agents,
          "developer",
          "web-developer",
          STANDARD_FILES.AGENT_METADATA_YAML,
        );
        const toolsErrors = result.issues.filter(
          (i) => i.file === agentPath && i.message.includes("tools"),
        );
        expect(toolsErrors.length).toBeGreaterThan(0);
        expect(toolsErrors[0]?.severity).toBe("error");
      });
    });

    describe("TS config file validation", () => {
      it("should report zero issues when config/ directory is absent", async () => {
        const result = await validateSource(sourceDir);

        const configFilePaths = [SKILL_CATEGORIES_PATH, SKILL_RULES_PATH, STACKS_FILE_PATH];
        const configIssues = result.issues.filter(
          (i) =>
            configFilePaths.includes(i.file) &&
            !i.message.includes("Cross-reference validation skipped"),
        );
        expect(configIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid config/skill-categories.ts, skill-rules.ts, stacks.ts", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(
          path.join(sourceDir, SKILL_CATEGORIES_PATH),
          renderConfigTs(VALID_SKILL_CATEGORIES_FILE),
        );
        await writeFile(
          path.join(sourceDir, SKILL_RULES_PATH),
          renderConfigTs(VALID_SKILL_RULES_FILE),
        );
        await writeFile(
          path.join(sourceDir, STACKS_FILE_PATH),
          renderConfigTs(VALID_STACKS_CONFIG_FILE),
        );

        const result = await validateSource(sourceDir);

        const configFilePaths = [SKILL_CATEGORIES_PATH, SKILL_RULES_PATH, STACKS_FILE_PATH];
        const configIssues = result.issues.filter((i) => configFilePaths.includes(i.file));
        expect(configIssues).toStrictEqual([]);
      });

      it("should report error when config/skill-categories.ts default export fails schema", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        // Missing required 'version' field
        await writeFile(
          path.join(sourceDir, SKILL_CATEGORIES_PATH),
          renderConfigTs({ categories: {} }),
        );

        const result = await validateSource(sourceDir);

        const categoriesErrors = result.issues.filter(
          (i) => i.file === SKILL_CATEGORIES_PATH && i.severity === "error",
        );
        expect(categoriesErrors.length).toBeGreaterThan(0);
      });

      it("should report error when config/stacks.ts has no default export", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(path.join(sourceDir, STACKS_FILE_PATH), "export const stacks = {};\n");

        const result = await validateSource(sourceDir);

        const stacksErrors = result.issues.filter(
          (i) => i.file === STACKS_FILE_PATH && i.severity === "error",
        );
        expect(stacksErrors.length).toBeGreaterThan(0);
      });
    });
  });
});
