import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { discoverLocalSkills } from "./local-skill-loader";
import {
  CLAUDE_DIR,
  LOCAL_PSEUDO_CATEGORY,
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";
import { METADATA_KEYS } from "../metadata-keys";
import { skillsDir, skillsPathPrefix, sourceDir } from "../installation/install-layout";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { renderMetadataYaml, renderSkillMd } from "../__tests__/content-generators";
import { silenceConsole } from "../__tests__/helpers/silence-console";
import { setVerbose, warn } from "../../utils/logger";
import { bytewise } from "../../utils/string";

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

      const skill = result?.skills[0];

      expect(result).not.toBeNull();
      expect(result?.skills).toHaveLength(1);
      expect(skill?.id).toBe("my-normal-skill (@local)");
      expect(skill?.category).toBe("web-framework");
      expect(skill?.author).toBe("@dummy-author");
      expect(skill?.local).toBe(true);
      expect(skill?.localPath).toBe(
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

      expect(result?.skills[0]?.description).toBe("Custom CLI description");
    });

    it("falls back to frontmatter description when cliDescription not provided", async () => {
      await writeLocalSkill("fallback-desc", {
        metadata: `displayName: Fallback Skill\nslug: fallback-skill\ndomain: web\ncategory: web-framework`,
        skillMd: renderSkillMd("fallback-skill (@local)", "Frontmatter description", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills[0]?.description).toBe("Frontmatter description");
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

      expect(skill?.id).toBe("full-skill (@local)");
      expect(skill?.directoryPath).toBe("full-skill");
      expect(skill?.description).toBe("Complete skill for testing");

      expect(skill?.category).toBe("web-framework");
      expect(skill?.author).toBe("@dummy-author");
      expect(skill?.domain).toBe("web");

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

      expect(result?.skills[0]?.category).toBe("web-framework");
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
        metadata: "displayName: 123\ndomain: web",
        skillMd: renderSkillMd("wrong-types (@local)", "Wrong types in metadata", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result).not.toBeNull();
    });

    it("skips valid skills alongside invalid ones", async () => {
      await writeLocalSkill("valid-skill", {
        metadata:
          "displayName: Valid Skill\nslug: valid-skill\ndomain: web\ncategory: web-framework",
        skillMd: renderSkillMd("valid-skill (@local)", "A valid skill", "Content"),
      });

      await writeLocalSkill("invalid-skill", {
        metadata: "displayName: Invalid Skill\nslug: invalid-skill\ndomain: web",
        withSkillMd: false,
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toHaveLength(1);
      expect(result?.skills[0]?.id).toBe("valid-skill (@local)");
    });

    it("skips skill with empty metadata.yaml", async () => {
      await writeLocalSkill("empty-meta", {
        metadata: "",
        skillMd: renderSkillMd("empty-meta (@local)", "Has empty metadata", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill with metadata.yaml containing only comments", async () => {
      await writeLocalSkill("comments-only", {
        metadata: "# This is a comment\n# No actual fields",
        skillMd: renderSkillMd("comments-only (@local)", "Only comments", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });

    it("skips skill with metadata.yaml that parses to a non-object type", async () => {
      await writeLocalSkill("bad-yaml", {
        metadata: "just a plain string",
        skillMd: renderSkillMd("bad-yaml (@local)", "Bad YAML", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

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

    it("refuses a skill declaring the local pseudo-category, and says what to declare instead", async () => {
      await writeLocalSkill("uncategorised-skill", {
        metadata: `displayName: Uncategorised\nslug: uncategorised\ndomain: web\ncategory: ${LOCAL_PSEUDO_CATEGORY}\ncustom: true`,
        skillMd: renderSkillMd("uncategorised (@local)", "No real category", "Content"),
      });
      await writeLocalSkill("categorised-skill", {
        metadata:
          "displayName: Categorised\nslug: categorised\ndomain: web\ncategory: web-tooling\ncustom: true",
        skillMd: renderSkillMd("categorised (@local)", "A real category", "Content"),
      });

      const result = await discoverLocalSkills(tempDir);

      expect(
        result?.skills.map((skill) => skill.id),
        "the pseudo-category reaches no sub-agent, so a skill wearing it is refused rather than loaded unusable",
      ).toStrictEqual(["categorised (@local)"]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping local skill 'uncategorised-skill'"),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(METADATA_KEYS.CATEGORY));
    });

    it("handles directory with only non-skill subdirectories", async () => {
      const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      const randomDir = path.join(skillsDir, "random-dir");
      await mkdir(randomDir, { recursive: true });
      await writeFile(path.join(randomDir, "README.md"), "# Not a skill");

      const result = await discoverLocalSkills(tempDir);

      expect(result?.skills).toStrictEqual([]);
    });
  });

  describe("on a Codex installation", () => {
    it("reads the skills Codex copied in, where Codex keeps them", async () => {
      const codexSkills = skillsDir("codex", "project", tempDir);
      const skillDir = path.join(codexSkills, "codex-skill");
      await mkdir(sourceDir(tempDir, "codex"), { recursive: true });
      await writeFile(path.join(sourceDir(tempDir, "codex"), STANDARD_FILES.CONFIG_TS), "");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          contentHash: "abc123",
          category: "web-framework",
          displayName: "Codex Skill",
          slug: "codex-skill",
        }),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("codex-skill", "Copied in by Codex"),
      );

      const result = await discoverLocalSkills(tempDir);

      expect(result?.localSkillsPath).toBe(codexSkills);
      expect(
        result?.skills.map(({ id, path: at, localPath }) => ({ id, at, localPath })),
      ).toStrictEqual([
        {
          id: "codex-skill",
          at: `${skillsPathPrefix("codex", "project", tempDir)}/codex-skill/`,
          localPath: skillDir + path.sep,
        },
      ]);
    });
  });

  describe("what discovery says and carries", () => {
    const consoleSpies = silenceConsole(["log"]);

    beforeEach(() => setVerbose(true));
    afterEach(() => setVerbose(false));

    const localSkillsPath = () => path.join(tempDir, LOCAL_SKILLS_PATH);

    function usableMetadata(fields: { custom?: boolean } = {}): string {
      return renderMetadataYaml({
        contentHash: "abc123",
        category: "web-framework",
        displayName: "Said Skill",
        slug: "said-skill",
        ...fields,
      });
    }

    const said = (line: string) => expect(consoleSpies.log).toHaveBeenCalledWith(`  ${line}`);

    it("says there is no local skills folder", async () => {
      await discoverLocalSkills(tempDir);

      said(`Local skills directory not found: ${localSkillsPath()}`);
    });

    it("says how many local skills it discovered, and from where", async () => {
      await writeLocalSkill("first-skill", {
        metadata: usableMetadata(),
        skillMd: renderSkillMd("first-skill", "First"),
      });
      await writeLocalSkill("second-skill", {
        metadata: usableMetadata(),
        skillMd: renderSkillMd("second-skill", "Second"),
      });

      await discoverLocalSkills(tempDir);

      said(`Discovered 2 local skills from ${localSkillsPath()}`);
    });

    it("says which skill it skipped for having no metadata.yaml, and warns about nothing", async () => {
      await writeLocalSkill("no-metadata", { skillMd: renderSkillMd("no-metadata") });

      await discoverLocalSkills(tempDir);

      said("Skipping local skill 'no-metadata': No metadata.yaml found");
      expect(warn).not.toHaveBeenCalled();
    });

    it("says which skill it skipped for having no SKILL.md", async () => {
      await writeLocalSkill("no-skillmd", { metadata: usableMetadata(), withSkillMd: false });

      await discoverLocalSkills(tempDir);

      said("Skipping local skill 'no-skillmd': No SKILL.md found");
    });

    it("says which skill it skipped for an invalid SKILL.md frontmatter", async () => {
      await writeLocalSkill("bad-frontmatter", {
        metadata: usableMetadata(),
        skillMd: "---\ndescription: Only description, no name\n---\nContent",
      });

      await discoverLocalSkills(tempDir);

      said("Skipping local skill 'bad-frontmatter': invalid SKILL.md frontmatter");
    });

    it("carries the activation description, and the custom flag only when the metadata states it", async () => {
      await writeLocalSkill("custom-skill", {
        metadata: usableMetadata({ custom: true }),
        skillMd: renderSkillMd("custom-skill", "Activates on custom work"),
      });
      await writeLocalSkill("plain-skill", {
        metadata: usableMetadata(),
        skillMd: renderSkillMd("plain-skill", "Activates on plain work"),
      });

      const result = await discoverLocalSkills(tempDir);

      const extracted = (dirName: string, description: string) => ({
        id: dirName,
        directoryPath: dirName,
        description,
        activationDescription: description,
        category: "web-framework",
        author: "@dummy-author",
        path: `${LOCAL_SKILLS_PATH}/${dirName}/`,
        local: true,
        localPath: path.join(localSkillsPath(), dirName) + path.sep,
        domain: "web",
        slug: "said-skill",
        displayName: "Said Skill",
      });
      expect(result?.skills.toSorted((a, b) => bytewise(a.id, b.id))).toStrictEqual([
        { ...extracted("custom-skill", "Activates on custom work"), custom: true },
        extracted("plain-skill", "Activates on plain work"),
      ]);
      said("Extracted local skill: custom-skill");
    });
  });
});
