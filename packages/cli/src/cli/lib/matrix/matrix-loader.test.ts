import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";

import {
  renderConfigTs,
  renderIncompleteMetadataYaml,
  renderMetadataYaml,
  renderRulesTs,
  renderSkillMd,
  renderUnparseableMetadataYaml,
  type SkillRulesFile,
} from "../__tests__/content-generators";
import { renderUnparseableConfigTs } from "../__tests__/factories/unloadable-config-factories.js";
import { writeTestFile } from "../__tests__/fixtures/create-test-source";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import { SKILL_CATEGORIES_PATH, SKILL_RULES_PATH, STANDARD_FILES } from "../../consts";
import type { SkillId } from "../../types";

vi.mock("../../utils/logger");

import { loadSkillCategories, loadSkillRules, extractAllSkills } from "./matrix-loader";
import { verbose, warn } from "../../utils/logger";
import { firstElement } from "../__tests__/helpers/element-at.js";

/** Sorts before the healthy skill, proving a parse failure does not end the scan. */
const BROKEN_SKILL_DIR = "broken-skill";
const HEALTHY_SKILL_DIR = "web-framework-react";
const HEALTHY_SKILL_ID: SkillId = "web-framework-react";
const HEALTHY_SKILL_DESCRIPTION = "React framework";
const CONTENT_HASH = "abc123";

/** The yaml parser's own words for what renderUnparseableMetadataYaml() writes. */
const PARSER_REASON = "Nested mappings are not allowed";

/** YAML reads a bare 123 as a number, which the frontmatter schema refuses as a name. */
const NUMERIC_SKILL_NAME = "123";

const CATEGORIES = {
  "web-framework": {
    id: "web-framework",
    displayName: "Framework",
    description: "Core UI framework",
    exclusive: true,
    order: 1,
  },
  "web-styling": {
    id: "web-styling",
    displayName: "Styling",
    description: "CSS approach",
    exclusive: true,
    order: 3,
  },
  "api-api": {
    id: "api-api",
    displayName: "API",
    description: "Backend framework",
    exclusive: true,
    order: 1,
  },
};

const RULES: SkillRulesFile = {
  version: "1.0.0",
  relationships: {
    conflicts: [
      { skills: ["react", "vue-composition-api"], reason: "Frameworks are mutually exclusive" },
    ],
    discourages: [{ skills: ["zustand", "react"], reason: "Test discourage rule" }],
    requires: [{ skill: "zustand", needs: ["react"], reason: "Zustand requires React" }],
    alternatives: [{ purpose: "Frontend Framework", skills: ["react", "vue-composition-api"] }],
  },
};

const NO_RELATIONSHIPS = { conflicts: [], discourages: [], requires: [], alternatives: [] };

describe("matrix-loader", () => {
  let tempDir: string;
  let skillsDir: string;
  let categoriesPath: string;
  let rulesPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-matrix-loader-");
    skillsDir = path.join(tempDir, "skills");
    categoriesPath = path.join(tempDir, SKILL_CATEGORIES_PATH);
    rulesPath = path.join(tempDir, SKILL_RULES_PATH);
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** Either file left out is absent on disk. */
  async function writeSkill(
    dirName: string,
    files: { metadata?: string; skillMd?: string },
  ): Promise<void> {
    if (files.metadata !== undefined) {
      await writeTestFile(
        path.join(skillsDir, dirName, STANDARD_FILES.METADATA_YAML),
        files.metadata,
      );
    }
    if (files.skillMd !== undefined) {
      await writeTestFile(path.join(skillsDir, dirName, STANDARD_FILES.SKILL_MD), files.skillMd);
    }
  }

  async function writeBrokenSkillAndHealthySkill(): Promise<void> {
    await writeSkill(BROKEN_SKILL_DIR, {
      metadata: renderUnparseableMetadataYaml(),
      skillMd: renderSkillMd(BROKEN_SKILL_DIR),
    });
    await writeSkill(HEALTHY_SKILL_DIR, {
      metadata: renderMetadataYaml({
        contentHash: CONTENT_HASH,
        category: "web-framework",
        domain: "web",
        displayName: "React",
        slug: "react",
        cliDescription: HEALTHY_SKILL_DESCRIPTION,
      }),
      skillMd: renderSkillMd(HEALTHY_SKILL_ID, HEALTHY_SKILL_DESCRIPTION),
    });
  }

  describe("loadSkillCategories", () => {
    it("loads the categories a valid skill-categories file declares", async () => {
      await writeTestFile(
        categoriesPath,
        renderConfigTs({ version: "1.0.0", categories: CATEGORIES }),
      );

      expect(await loadSkillCategories(categoriesPath)).toStrictEqual(CATEGORIES);
    });

    it("refuses an absent categories file, naming its path", async () => {
      await expect(loadSkillCategories(categoriesPath)).rejects.toThrow(
        `Invalid skill categories at '${categoriesPath}': failed to load or validate`,
      );
    });

    it("refuses a categories file the schema rejects, naming its path", async () => {
      await writeTestFile(
        categoriesPath,
        renderConfigTs({
          version: "1.0.0",
          categories: { "web-framework": { id: "web-framework" } },
        }),
      );

      await expect(loadSkillCategories(categoriesPath)).rejects.toThrow(
        `Config validation failed at '${categoriesPath}'`,
      );
    });

    it("refuses a categories file that does not evaluate, naming its path", async () => {
      await writeTestFile(categoriesPath, renderUnparseableConfigTs());

      await expect(loadSkillCategories(categoriesPath)).rejects.toThrow(
        `Failed to load config from '${categoriesPath}'`,
      );
    });
  });

  describe("loadSkillRules", () => {
    it("loads the rules a valid skill-rules file declares", async () => {
      await writeTestFile(rulesPath, renderRulesTs(RULES));

      expect(await loadSkillRules(rulesPath)).toStrictEqual(RULES);
    });

    it("loads a file stating only one kind of relationship", async () => {
      const onlyDiscourages: SkillRulesFile = {
        version: "1.0.0",
        relationships: {
          ...NO_RELATIONSHIPS,
          discourages: [
            { skills: ["react", "vue-composition-api"], reason: "Pick one rendering model" },
          ],
        },
      };
      await writeTestFile(rulesPath, renderRulesTs(onlyDiscourages));

      expect(await loadSkillRules(rulesPath)).toStrictEqual(onlyDiscourages);
    });

    it("answers empty relationships when the file states none", async () => {
      await writeTestFile(rulesPath, renderRulesTs({ version: "1.0.0" }));

      expect((await loadSkillRules(rulesPath)).relationships).toStrictEqual(NO_RELATIONSHIPS);
    });

    it("refuses an absent rules file, naming its path", async () => {
      await expect(loadSkillRules(rulesPath)).rejects.toThrow(
        `Invalid skill rules at '${rulesPath}': failed to load or validate`,
      );
    });

    it("refuses a rules file the schema rejects, naming its path", async () => {
      await writeTestFile(rulesPath, renderConfigTs({ version: "1.0.0", relationships: "none" }));

      await expect(loadSkillRules(rulesPath)).rejects.toThrow(
        `Config validation failed at '${rulesPath}'`,
      );
    });

    it("refuses a rules file that does not evaluate, naming its path", async () => {
      await writeTestFile(rulesPath, renderUnparseableConfigTs());

      await expect(loadSkillRules(rulesPath)).rejects.toThrow(
        `Failed to load config from '${rulesPath}'`,
      );
    });
  });

  describe("extractAllSkills", () => {
    it("extracts skills from metadata.yaml files with valid SKILL.md", async () => {
      await writeSkill("web-framework-react", {
        metadata: renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          domain: "web",
          author: "@vince",
          displayName: "react",
          slug: "react",
          cliDescription: "React framework",
        }),
        skillMd: renderSkillMd("web-framework-react", "React framework", "# React"),
      });

      const skills = await extractAllSkills(skillsDir);

      expect(skills).toHaveLength(1);
      expect(firstElement(skills).id).toBe("web-framework-react");
      expect(firstElement(skills).category).toBe("web-framework");
      expect(firstElement(skills).author).toBe("@vince");
    });

    it("skips skills without SKILL.md", async () => {
      await writeSkill("orphan-skill", {
        metadata: renderMetadataYaml({ contentHash: CONTENT_HASH, category: "web-framework" }),
      });

      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
    });

    it("skips skills with invalid metadata.yaml", async () => {
      await writeSkill("bad-skill", {
        metadata: "invalid: true\n",
        skillMd: renderSkillMd("bad-skill", "test", "# Bad"),
      });

      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
    });

    it("throws when displayName is missing from metadata", async () => {
      await writeSkill("no-cli", {
        metadata: renderIncompleteMetadataYaml(
          { contentHash: CONTENT_HASH, category: "web-framework", slug: "no-cli" },
          ["displayName"],
        ),
        skillMd: renderSkillMd("no-cli", "test", "# Test"),
      });

      await expect(extractAllSkills(skillsDir)).rejects.toThrow(
        /missing required 'displayName' field/,
      );
    });

    it("skips skills with invalid SKILL.md frontmatter", async () => {
      await writeSkill("bad-fm", {
        metadata: renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          displayName: "bad-fm",
          slug: "bad-fm",
        }),
        skillMd: "no frontmatter here",
      });

      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
    });

    it("returns empty array when no metadata files found", async () => {
      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
    });

    it("skips an unparseable metadata.yaml and extracts every other skill", async () => {
      await writeBrokenSkillAndHealthySkill();

      const skills = await extractAllSkills(skillsDir);

      expect(
        skills.map((skill) => skill.id),
        "one unparseable metadata.yaml must not abort the scan",
      ).toStrictEqual([HEALTHY_SKILL_ID]);
    });

    it("names the unparseable metadata.yaml's path in the warning", async () => {
      await writeBrokenSkillAndHealthySkill();

      await extractAllSkills(skillsDir);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          path.join(skillsDir, BROKEN_SKILL_DIR, STANDARD_FILES.METADATA_YAML),
        ),
      );
    });

    it("carries the parser's own reason in the unparseable warning", async () => {
      await writeBrokenSkillAndHealthySkill();

      await extractAllSkills(skillsDir);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(PARSER_REASON));
    });

    it("warns and skips when metadata.yaml has wrong field types", async () => {
      await writeSkill("wrong-types", {
        metadata: `
category: 12345
author: true
version: "1"
displayName: wrong
`,
        skillMd: renderSkillMd("wrong-types", "test", "# Test"),
      });

      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid metadata.yaml"));
    });

    it("extracts multiple skills and skips invalid ones in the same batch", async () => {
      await writeSkill("skill-valid", {
        metadata: renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          displayName: "valid",
          slug: "valid",
        }),
        skillMd: renderSkillMd("skill-valid", "Valid skill", "# Test"),
      });
      await writeSkill("skill-no-skillmd", {
        metadata: renderMetadataYaml({ contentHash: CONTENT_HASH, category: "web-framework" }),
      });
      await writeSkill("skill-bad-meta", {
        metadata: "invalid: true\n",
        skillMd: renderSkillMd("skill-bad-meta"),
      });

      const skills = await extractAllSkills(skillsDir);

      expect(skills).toHaveLength(1);
      expect(firstElement(skills).id).toBe("skill-valid");
    });
  });

  describe("what extraction carries and says", () => {
    const GUIDANCE = "Use when building React components";

    function oneSkillOnDisk(
      metadata: string,
      skillMd = renderSkillMd(HEALTHY_SKILL_ID, HEALTHY_SKILL_DESCRIPTION),
    ): Promise<void> {
      return writeSkill(HEALTHY_SKILL_DIR, { metadata, skillMd });
    }

    const extractedReact = {
      id: HEALTHY_SKILL_ID,
      directoryPath: HEALTHY_SKILL_DIR,
      description: HEALTHY_SKILL_DESCRIPTION,
      activationDescription: HEALTHY_SKILL_DESCRIPTION,
      category: "web-framework",
      author: "@test",
      path: `skills/${HEALTHY_SKILL_DIR}/`,
      domain: "web",
      displayName: "React",
      slug: "react",
    };

    it("carries usage guidance and the custom flag only when the metadata states them", async () => {
      await oneSkillOnDisk(
        renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          displayName: "React",
          slug: "react",
          usageGuidance: GUIDANCE,
          custom: true,
        }),
      );

      expect(await extractAllSkills(skillsDir)).toStrictEqual([
        { ...extractedReact, usageGuidance: GUIDANCE, custom: true },
      ]);
      expect(verbose).toHaveBeenCalledWith(`Extracted skill: ${HEALTHY_SKILL_ID}`);
    });

    it("leaves usage guidance and the custom flag out when the metadata does not state them", async () => {
      await oneSkillOnDisk(
        renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          displayName: "React",
          slug: "react",
        }),
      );

      expect(await extractAllSkills(skillsDir)).toStrictEqual([extractedReact]);
    });

    it("says which metadata.yaml it skipped for having no SKILL.md, and warns about nothing", async () => {
      await writeSkill("orphan-skill", {
        metadata: renderMetadataYaml({ contentHash: CONTENT_HASH, category: "web-framework" }),
      });

      await extractAllSkills(skillsDir);

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        "Skipping orphan-skill/metadata.yaml: No SKILL.md found",
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it("warns once, naming the SKILL.md, for a frontmatter that reads but its schema refused", async () => {
      await oneSkillOnDisk(
        renderMetadataYaml({
          contentHash: CONTENT_HASH,
          category: "web-framework",
          displayName: "React",
          slug: "react",
        }),
        renderSkillMd(NUMERIC_SKILL_NAME),
      );

      expect(await extractAllSkills(skillsDir)).toStrictEqual([]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(path.join(skillsDir, HEALTHY_SKILL_DIR, STANDARD_FILES.SKILL_MD)),
      );
    });

    it("says which categories and rules files it loaded", async () => {
      await writeTestFile(categoriesPath, renderConfigTs({ version: "1.0.0", categories: {} }));
      await writeTestFile(rulesPath, renderRulesTs({ version: "1.0.0" }));

      await loadSkillCategories(categoriesPath);
      await loadSkillRules(rulesPath);

      expect(verbose).toHaveBeenCalledWith(`Loaded skill categories: ${categoriesPath}`);
      expect(verbose).toHaveBeenCalledWith(`Loaded skill rules: ${rulesPath}`);
    });
  });
});
