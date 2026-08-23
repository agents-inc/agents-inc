import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findUnusableSavedSkillMetadata,
  unresolvedSkillRemovalReasons,
} from "./unresolved-skill-entries";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../consts";
import { renderMetadataYaml, renderSkillMd } from "../__tests__/content-generators";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import type { SkillId } from "../../types";

/**
 * What happened to a saved entry the loaded catalogue does not carry — the marketplace dropped
 * the skill, its local files are gone, its directory holds no skill by that name, its category
 * is one no domain claims, or one repairable file stopped describing an intact install. Only
 * the last is not a removal: the run refuses over it, so it earns no sentence here.
 */

const EJECTED_SKILL = "web-framework-react" satisfies SkillId;
const MARKETPLACE = "agents-inc";

/**
 * The pseudo-category a local skill declares when it belongs to no marketplace category. It
 * belongs to no domain, so local-skill discovery refuses the skill and the catalogue the
 * wizard resolves the saved roster against never carries it — which is the entry's fate this
 * module has to name, rather than calling the install missing.
 */
const UNPLACEABLE_CATEGORY = "local";

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
    vi.restoreAllMocks();
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

  describe("unresolvedSkillRemovalReasons", () => {
    it("names the source a marketplace-sourced entry is no longer present in", async () => {
      const saved = buildSkillConfigs([EJECTED_SKILL], { origin: MARKETPLACE });

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(`not present in ${MARKETPLACE}`);
    });

    it("names the source for an id no config entry claims", async () => {
      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        [],
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(`not present in ${MARKETPLACE}`);
    });

    it("names the directory an ejected entry's skill files are missing from", async () => {
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(
        `skill files no longer exist at ${installedSkillDir(projectDir, EJECTED_SKILL)}`,
      );
    });

    it("resolves a global-scoped entry's files under the home directory, not the project", async () => {
      const homeDir = await createTempDir("cc-unresolved-entry-home-");
      vi.spyOn(os, "homedir").mockReturnValue(homeDir);
      const saved = buildSkillConfigs([EJECTED_SKILL], { scope: "global" });

      try {
        const reasons = await unresolvedSkillRemovalReasons(
          [EJECTED_SKILL],
          saved,
          projectDir,
          MARKETPLACE,
        );

        expect(reasons.get(EJECTED_SKILL)).toBe(
          `skill files no longer exist at ${installedSkillDir(homeDir, EJECTED_SKILL)}`,
        );
      } finally {
        await cleanupTempDir(homeDir);
      }
    });

    it("says the directory holds no such skill when it holds no metadata.yaml", async () => {
      const skillDir = installedSkillDir(projectDir, EJECTED_SKILL);
      await mkdir(skillDir, { recursive: true });
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(
        `no skill named '${EJECTED_SKILL}' is installed at ${skillDir}`,
      );
    });

    it("says the same when its metadata.yaml is readable but no SKILL.md names the skill", async () => {
      const skillDir = await installLocalSkill(projectDir, EJECTED_SKILL, healthyMetadata());
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(
        `no skill named '${EJECTED_SKILL}' is installed at ${skillDir}`,
      );
    });

    it("blames the category when the install is intact and the source still cannot place it", async () => {
      // Everything a local skill needs is here and readable, so what this source cannot place is
      // the category the install declares — the placeholder, which local discovery refuses
      // outright, so the catalogue never carried the skill either. Either way the reason has to
      // name the category rather than call the install missing.
      const skillDir = await installLocalSkill(
        projectDir,
        EJECTED_SKILL,
        renderMetadataYaml({ category: UNPLACEABLE_CATEGORY, contentHash: "unresolved-test" }),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(EJECTED_SKILL, "Installed, intact, and unplaceable"),
      );
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      expect(reasons.get(EJECTED_SKILL)).toBe(
        `installed at ${skillDir}, but its category '${UNPLACEABLE_CATEGORY}' is not one this source knows`,
      );
    });

    it("gives no reason for an entry whose installed metadata.yaml describes no skill", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const reasons = await unresolvedSkillRemovalReasons(
        [EJECTED_SKILL],
        saved,
        projectDir,
        MARKETPLACE,
      );

      // That entry is not removed at all — the run refuses over it, so a removal sentence for
      // it could only ever be a wrong one.
      expect(reasons.has(EJECTED_SKILL)).toBe(false);
    });
  });

  describe("findUnusableSavedSkillMetadata", () => {
    it("names the file and the parser's reason for an installed skill it cannot read", async () => {
      const skillDir = await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata([EJECTED_SKILL], saved, projectDir);

      expect(unusable).toHaveLength(1);
      expect(unusable[0]?.skillDirName).toBe(EJECTED_SKILL);
      expect(unusable[0]?.metadataPath).toBe(path.join(skillDir, STANDARD_FILES.METADATA_YAML));
      expect(unusable[0]?.reason).toContain("mappings");
    });

    it("names an installed skill whose metadata.yaml parses without the fields a skill needs", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, "author: nobody\n");
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata([EJECTED_SKILL], saved, projectDir);

      expect(unusable).toHaveLength(1);
      expect(unusable[0]?.reason).toContain("missing required field");
    });

    it("names nothing for an entry whose skill files are gone", async () => {
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata([EJECTED_SKILL], saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });

    it("names nothing for a marketplace-sourced entry, whatever is on disk under its id", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, UNPARSEABLE_YAML);
      const saved = buildSkillConfigs([EJECTED_SKILL], { origin: MARKETPLACE });

      const unusable = await findUnusableSavedSkillMetadata([EJECTED_SKILL], saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });

    it("names nothing when every unresolved entry's metadata.yaml is readable", async () => {
      await installLocalSkill(projectDir, EJECTED_SKILL, healthyMetadata());
      const saved = buildSkillConfigs([EJECTED_SKILL]);

      const unusable = await findUnusableSavedSkillMetadata([EJECTED_SKILL], saved, projectDir);

      expect(unusable).toStrictEqual([]);
    });
  });
});
