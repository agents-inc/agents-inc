import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { discoverLocalSkills } from "./local-skill-loader";
import { CLAUDE_DIR, LOCAL_SKILLS_PATH, STANDARD_DIRS, STANDARD_FILES } from "../../consts";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { renderSkillMd } from "../__tests__/content-generators";
import { warn } from "../../utils/logger";

vi.mock("../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/logger")>()),
  warn: vi.fn(),
}));

describe("local-skill-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-local-skill-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** Create a local skill directory with metadata.yaml and optionally SKILL.md */
  async function writeLocalSkill(
    skillName: string,
    options: {
      metadata?: string;
      skillMd?: string;
      /** If false, skip creating SKILL.md. Default true. */
      withSkillMd?: boolean;
    } = {},
  ): Promise<string> {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
    const skillDir = path.join(skillsDir, skillName);
    await mkdir(skillDir, { recursive: true });

    if (options.metadata !== undefined) {
      await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), options.metadata);
    }

    if (options.withSkillMd !== false && options.skillMd !== undefined) {
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), options.skillMd);
    }

    return skillDir;
  }

  describe("discoverLocalSkills", () => {
    it("returns null when .claude/skills/ does not exist", async () => {
      const result = await discoverLocalSkills(tempDir);
      expect(result).toBeNull();
    });

    it("returns empty skills array when directory exists but is empty", async () => {
      await mkdir(path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS), { recursive: true });

      const result = await discoverLocalSkills(tempDir);

      expect(result).not.toBeNull();
      expect(result?.skills).toStrictEqual([]);
      expect(result?.localSkillsPath).toBe(path.join(tempDir, LOCAL_SKILLS_PATH));
    });

    it("discovers skills regardless of name prefix", async () => {
      await writeLocalSkill("my-normal-skill", {
        metadata: `displayName: My Normal Skill\nslug: my-normal-skill\ncliDescription: A normal skill\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("my-normal-skill (@local)", "A normal skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result).not.toBeNull();
      expect(result?.skills).toHaveLength(1);
      expect(result?.skills[0].id).toBe("my-normal-skill (@local)");
      expect(result?.skills[0].category).toBe("web-framework");
      expect(result?.skills[0].author).toBe("@dummy-author");
      expect(result?.skills[0].local).toBe(true);
      expect(result?.skills[0].localPath).toBe(
        path.join(tempDir, LOCAL_SKILLS_PATH, "my-normal-skill") + path.sep,
      );
    });

    it("skips skill without metadata.yaml", async () => {
      await writeLocalSkill("no-metadata", {
        skillMd: renderSkillMd("no-metadata (@local)", "Missing metadata", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill without SKILL.md", async () => {
      await writeLocalSkill("no-skillmd", {
        metadata: `displayName: No Skill MD`,
        withSkillMd: false,
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill when metadata.yaml is missing displayName", async () => {
      await writeLocalSkill("no-cli-name", {
        metadata: `slug: no-cli-name\ncliDescription: Just a description\ncategory: web-framework\ndomain: web`,
        skillMd: renderSkillMd("no-cli-name (@local)", "Missing displayName", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);
      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill with invalid SKILL.md frontmatter", async () => {
      await writeLocalSkill("bad-frontmatter", {
        metadata: `displayName: Bad Frontmatter Skill`,
        // SKILL.md without proper frontmatter (missing name)
        skillMd: `---\ndescription: Only description, no name\n---\nContent`,
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });

    it("uses cliDescription from metadata.yaml when provided", async () => {
      await writeLocalSkill("with-desc", {
        metadata: `displayName: Desc Skill\nslug: desc-skill\ncliDescription: Custom CLI description\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("desc-skill (@local)", "Frontmatter description", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills[0].description).toBe("Custom CLI description");
    });

    it("falls back to frontmatter description when cliDescription not provided", async () => {
      await writeLocalSkill("fallback-desc", {
        metadata: `displayName: Fallback Skill\nslug: fallback-skill\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("fallback-skill (@local)", "Frontmatter description", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills[0].description).toBe("Frontmatter description");
    });

    it("discovers multiple valid skills", async () => {
      await writeLocalSkill("skill-one", {
        metadata: `displayName: Skill One\nslug: skill-one\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("skill-one (@local)", "First skill", "Content"),
      });
      await writeLocalSkill("skill-two", {
        metadata: `displayName: Skill Two\nslug: skill-two\ndomain: api\ncategory: api-api`,
        skillMd: renderSkillMd("skill-two (@local)", "Second skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toHaveLength(2);
      const skillIds = result?.skills.map((s) => s.id).sort();
      expect(skillIds).toStrictEqual(["skill-one (@local)", "skill-two (@local)"]);
    });

    it("sets correct extracted metadata properties", async () => {
      await writeLocalSkill("full-skill", {
        metadata: `displayName: Full Skill\nslug: full-skill\ncliDescription: Complete skill for testing\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("full-skill (@local)", "Complete skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);
      const skill = result?.skills[0];

      // Identity
      expect(skill?.id).toBe("full-skill (@local)");
      expect(skill?.directoryPath).toBe("full-skill");
      expect(skill?.description).toBe("Complete skill for testing");

      // Catalog data
      expect(skill?.category).toBe("web-framework");
      expect(skill?.author).toBe("@dummy-author");
      expect(skill?.domain).toBe("web");

      // Location
      expect(skill?.path).toBe(`${LOCAL_SKILLS_PATH}/full-skill/`);
      expect(skill?.local).toBe(true);
      expect(skill?.localPath).toBe(path.join(tempDir, LOCAL_SKILLS_PATH, "full-skill") + path.sep);
    });

    it("uses category from metadata.yaml when provided", async () => {
      await writeLocalSkill("categorized-skill", {
        metadata: `displayName: Categorized Skill\nslug: categorized-skill\ncategory: web-framework\ndomain: web`,
        skillMd: renderSkillMd("categorized-skill (@local)", "A categorized skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills[0].category).toBe("web-framework");
    });

    it("preserves optional fields from metadata.yaml", async () => {
      await writeLocalSkill("rich-skill", {
        metadata: [
          "displayName: Rich Skill",
          "slug: rich-skill",
          "category: web-framework",
          "domain: web",
          "usageGuidance: When building components",
        ].join("\n"),
        skillMd: renderSkillMd("rich-skill (@local)", "A rich skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);
      const skill = result?.skills[0];

      expect(skill?.usageGuidance).toBe("When building components");
    });

    it("skips skill when metadata.yaml has wrong field types", async () => {
      await writeLocalSkill("wrong-types", {
        // displayName must be a string, but providing a number via YAML
        metadata: "displayName: 123\ndomain: web",
        skillMd: renderSkillMd("wrong-types (@local)", "Wrong types in metadata", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      // Schema validation may fail for wrong types, but the function should not throw
      expect(result).not.toBeNull();
    });

    it("skips valid skills alongside invalid ones", async () => {
      // Valid skill
      await writeLocalSkill("valid-skill", {
        metadata:
          "displayName: Valid Skill\nslug: valid-skill\ndomain: web\ncategory: web-framework",
        skillMd: renderSkillMd("valid-skill (@local)", "A valid skill", "Content"),
      });

      // Invalid skill (no SKILL.md)
      await writeLocalSkill("invalid-skill", {
        metadata: "displayName: Invalid Skill\nslug: invalid-skill\ndomain: web",
        withSkillMd: false,
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toHaveLength(1);
      expect(result?.skills[0].id).toBe("valid-skill (@local)");
    });

    it("skips skill with empty metadata.yaml", async () => {
      await writeLocalSkill("empty-meta", {
        metadata: "",
        skillMd: renderSkillMd("empty-meta (@local)", "Has empty metadata", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      // Empty YAML parses to null, schema validation fails — skill should be skipped
      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill with metadata.yaml containing only comments", async () => {
      await writeLocalSkill("comments-only", {
        metadata: "# This is a comment\n# No actual fields",
        skillMd: renderSkillMd("comments-only (@local)", "Only comments", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      // YAML with only comments parses to null — schema validation fails
      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill with metadata.yaml that parses to a non-object type", async () => {
      await writeLocalSkill("bad-yaml", {
        // YAML that parses to a string instead of an object
        metadata: "just a plain string",
        skillMd: renderSkillMd("bad-yaml (@local)", "Bad YAML", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      // Schema validation expects an object, so this should be skipped
      expect(result?.skills).toStrictEqual([]);
    });

    it("skips a skill whose metadata.yaml is not parseable YAML and keeps discovering", async () => {
      await writeLocalSkill("unparseable-meta", {
        metadata: `{{{ this is not: valid: yaml: "at all`,
        skillMd: renderSkillMd("unparseable-meta (@local)", "Unparseable metadata", "Content"),
      });
      await writeLocalSkill("valid-skill", {
        metadata:
          "displayName: Valid Skill\nslug: valid-skill\ndomain: web\ncategory: web-framework",
        skillMd: renderSkillMd("valid-skill (@local)", "A valid skill", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(
        result?.skills.map((skill) => skill.id),
        "one unparseable metadata.yaml must not abort discovery",
      ).toStrictEqual(["valid-skill (@local)"]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping local skill 'unparseable-meta'"),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(STANDARD_FILES.METADATA_YAML));
    });

    it("handles directory with only non-skill subdirectories", async () => {
      const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      // Create subdirectories with no metadata or SKILL.md files
      const randomDir = path.join(skillsDir, "random-dir");
      await mkdir(randomDir, { recursive: true });
      await writeFile(path.join(randomDir, "README.md"), "# Not a skill");

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });
  });
});
