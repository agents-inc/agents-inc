import path from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";

import { findUnusableSavedSkillMetadata } from "./unresolved-skill-entries";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../consts";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { renderMetadataYaml } from "../__tests__/content-generators";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import type { SkillId } from "../../types";

/**
 * A saved entry the loaded catalogue does not carry, whose one repairable file stopped describing
 * an intact install: the run refuses over it rather than dropping the entry.
 */

const EJECTED_SKILL = "web-framework-react" satisfies SkillId;
const MARKETPLACE = "agents-inc";

/** The category {@link EJECTED_SKILL} is stated to belong to — one a domain does claim. */
const PLACEABLE_CATEGORY = "web-framework";

/** Unparseable YAML: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

describe("unresolved-skill-entries", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createTempDir("cc-unresolved-entry-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  function installedSkillDir(baseDir: string, skillId: string): string {
    return path.join(baseDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId);
  }

  /** Writes the skill directory an ejected entry names, with whatever metadata.yaml is given. */
  async function installLocalSkill(
    baseDir: string,
    skillId: string,
    metadata: string,
  ): Promise<string> {
    const skillDir = installedSkillDir(baseDir, skillId);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), metadata);
    return skillDir;
  }

  const healthyMetadata = (): string =>
    renderMetadataYaml({ category: PLACEABLE_CATEGORY, contentHash: "unresolved-test" });

  describe("findUnusableSavedSkillMetadata", () => {
    it("names the file and the parser's reason for an installed skill it cannot read", async () => {
      const skillDir = await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toHaveLength(1);
      expect(unusable[0]?.skillDirName).toBe(EJECTED_SKILL);
      expect(unusable[0]?.metadataPath).toBe(path.join(skillDir, STANDARD_FILES.METADATA_YAML));
      expect(unusable[0]?.reason).toContain("mappings");
    });

    it("names an installed skill whose metadata.yaml parses without the fields a skill needs", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, "author: nobody\n");
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toHaveLength(1);
      expect(unusable[0]?.reason).toContain("missing required field");
    });

    it("reads each half of a [P][G] pair at its own scope", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, healthyMetadata());
      const globalSkillDir = path.join(
        resolveInstallPaths(projectDir, "global").skillsDir,
        EJECTED_SKILL,
      );
      onTestFinished(() => rm(globalSkillDir, { recursive: true, force: true }));
      await mkdir(globalSkillDir, { recursive: true });
      await writeFile(path.join(globalSkillDir, STANDARD_FILES.METADATA_YAML), UNPARSEABLE_YAML);
      const saved = [
        ...buildSkillConfigs([EJECTED_SKILL], { scope: "project" }),
        ...buildSkillConfigs([EJECTED_SKILL], { scope: "global" }),
      ];

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable.map(({ metadataPath }) => metadataPath)).toStrictEqual([
        path.join(globalSkillDir, STANDARD_FILES.METADATA_YAML),
      ]);
    });

    it("names nothing for an entry whose skill files are gone", async () => {
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });

    it("names nothing for a marketplace-sourced entry, whatever is on disk under its id", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL], { origin: MARKETPLACE });

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });

    it("names nothing for an excluded entry, whatever is on disk under its id", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL], { excluded: true });

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });

    it("names nothing when every unresolved entry's metadata.yaml is readable", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, healthyMetadata());
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata(saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });
  });
});
