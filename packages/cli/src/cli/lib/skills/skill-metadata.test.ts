import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { SkillId } from "../../types";

vi.mock("../../utils/logger");

import { warn } from "../../utils/logger";
import { STANDARD_FILES } from "../../consts";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import {
  injectForkedFromMetadata,
  readForkedFromMetadata,
  readLocalSkillMetadata,
  writeMetadataYaml,
} from "./skill-metadata";

/** Real filesystem; only the clock is fixed, so the date an install records can be named. */
const INSTALL_DAY = "2026-01-15";

const SCHEMA_COMMENT_OPENER = "# yaml-language-server:";

function createValidMetadataYaml(skillId: SkillId, contentHash: string, date: string): string {
  return stringifyYaml({
    forkedFrom: {
      skillId: skillId,
      contentHash: contentHash,
      date,
    },
  });
}

function createMetadataWithoutForkedFrom(): string {
  return stringifyYaml({
    author: "@test",
  });
}

function createMetadataWithSchemaComment(skillId: SkillId, contentHash: string): string {
  return `# yaml-language-server: $schema=../schema.json\n${createValidMetadataYaml(skillId, contentHash, "2026-01-01")}`;
}

/** YAML no parser reads, as opposed to YAML that parses into the wrong shape. */
const UNPARSEABLE_YAML = "forkedFrom: {unclosed\n  - and: a list under a map\n";

describe("skill-metadata", () => {
  let tempDir: string;
  let skillDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("skill-metadata-");
    skillDir = path.join(tempDir, "skills", "react");
    await mkdir(skillDir, { recursive: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${INSTALL_DAY}T12:00:00Z`));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanupTempDir(tempDir);
  });

  const metadataPath = (): string => path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  const writeMetadata = (content: string): Promise<void> => writeFile(metadataPath(), content);
  const writtenMetadata = (): Promise<string> => readFile(metadataPath(), "utf-8");

  describe("readForkedFromMetadata", () => {
    it("returns forkedFrom metadata when metadata.yaml exists and is valid", async () => {
      await writeMetadata(createValidMetadataYaml("web-framework-react", "abc1234", "2026-01-01"));

      const result = await readForkedFromMetadata(skillDir);

      expect(result).toStrictEqual({
        skillId: "web-framework-react",
        contentHash: "abc1234",
        date: "2026-01-01",
      });
    });

    it("returns the directory inside the repository when the install recorded one", async () => {
      await writeMetadata(
        stringifyYaml({
          forkedFrom: {
            skillId: "external-web-tooling-brainstorming",
            contentHash: "abc1234",
            date: "2026-01-01",
            source: "github:obra/superpowers",
            path: "skills/brainstorming",
          },
        }),
      );

      const result = await readForkedFromMetadata(skillDir);

      // Read back whole: the schema strips undeclared fields.
      expect(result).toStrictEqual({
        skillId: "external-web-tooling-brainstorming",
        contentHash: "abc1234",
        date: "2026-01-01",
        source: "github:obra/superpowers",
        path: "skills/brainstorming",
      });
    });

    it("returns null when metadata.yaml does not exist", async () => {
      const result = await readForkedFromMetadata(skillDir);

      expect(result).toBeNull();
    });

    it("returns null when metadata.yaml has no forkedFrom field", async () => {
      await writeMetadata(createMetadataWithoutForkedFrom());

      const result = await readForkedFromMetadata(skillDir);

      expect(result).toBeNull();
    });

    it("returns null and warns when metadata.yaml has invalid data", async () => {
      await writeMetadata(
        stringifyYaml({
          forkedFrom: {
            // Missing required fields: skillId, contentHash, date
            invalid_field: "bad",
          },
        }),
      );

      const result = await readForkedFromMetadata(skillDir);

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });

    it("returns null and warns when forkedFrom has wrong types", async () => {
      await writeMetadata(
        stringifyYaml({
          forkedFrom: {
            skillId: 123, // Should be string
            contentHash: "abc",
            date: "2026-01-01",
          },
        }),
      );

      const result = await readForkedFromMetadata(skillDir);

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });
  });

  describe("injectForkedFromMetadata", () => {
    it("injects forkedFrom into the skill's metadata.yaml, keeping its other fields", async () => {
      await writeMetadata(createMetadataWithoutForkedFrom());

      await injectForkedFromMetadata(skillDir, "web-framework-react", "abc1234");

      expect(parseYaml(await writtenMetadata())).toStrictEqual({
        author: "@test",
        forkedFrom: { skillId: "web-framework-react", contentHash: "abc1234", date: INSTALL_DAY },
      });
    });

    it("records the repository and the directory within it, for a skill its own bytes install", async () => {
      await writeMetadata(createMetadataWithoutForkedFrom());

      await injectForkedFromMetadata(
        skillDir,
        // Boundary cast: a skill outside every catalogue has an id outside the generated union.
        "external-web-tooling-brainstorming" as SkillId,
        "abc1234",
        { source: "github:obra/superpowers", path: "skills/brainstorming" },
      );

      const written = await writtenMetadata();
      // A skill outside every catalogue has no other record of which directory travelled.
      expect(written).toContain("source: github:obra/superpowers");
      expect(written).toContain("path: skills/brainstorming");
    });

    it("updates existing forkedFrom metadata", async () => {
      await writeMetadata(
        // Boundary cast: fictional skill ID for testing metadata update
        createValidMetadataYaml("old-skill-id" as SkillId, "old-hash", "2025-01-01"),
      );

      await injectForkedFromMetadata(skillDir, "web-framework-react", "new-hash");

      const written = await writtenMetadata();
      expect(written).toContain("web-framework-react");
      expect(written).toContain("new-hash");
      expect(written).not.toContain("old-skill-id");
      expect(written).not.toContain("old-hash");
    });

    it("rewrites a file that opens with a schema comment under one comment, without a warning", async () => {
      await writeMetadata(createMetadataWithSchemaComment("web-framework-react", "abc1234"));

      await injectForkedFromMetadata(skillDir, "web-framework-react", "new-hash");

      const written = await writtenMetadata();
      expect(written.startsWith(SCHEMA_COMMENT_OPENER)).toBe(true);
      expect(written.indexOf(SCHEMA_COMMENT_OPENER)).toBe(
        written.lastIndexOf(SCHEMA_COMMENT_OPENER),
      );
      expect(written).toContain("new-hash");
      expect(warn).not.toHaveBeenCalled();
    });

    it("writes forkedFrom and warns when the existing file cannot be parsed", async () => {
      await writeMetadata(UNPARSEABLE_YAML);

      await injectForkedFromMetadata(skillDir, "web-framework-react", "abc1234");

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Malformed metadata.yaml"));
      expect(parseYaml(await writtenMetadata())).toStrictEqual({
        forkedFrom: { skillId: "web-framework-react", contentHash: "abc1234", date: INSTALL_DAY },
      });
    });
  });

  describe("readLocalSkillMetadata", () => {
    it("returns full metadata when metadata.yaml exists and is valid", async () => {
      await writeMetadata(
        stringifyYaml({
          forkedFrom: {
            skillId: "web-framework-react",
            contentHash: "abc1234",
            date: "2026-01-01",
          },
        }),
      );

      const result = await readLocalSkillMetadata(skillDir);

      expect(result).not.toBeNull();
      expect(result?.forkedFrom?.skillId).toBe("web-framework-react");
    });

    it("returns null when metadata.yaml does not exist", async () => {
      const result = await readLocalSkillMetadata(skillDir);

      expect(result).toBeNull();
    });

    it("returns metadata without forkedFrom for user-created skills", async () => {
      await writeMetadata(createMetadataWithoutForkedFrom());

      const result = await readLocalSkillMetadata(skillDir);

      expect(result).not.toBeNull();
      expect(result?.forkedFrom).toBeUndefined();
    });

    it("returns null and warns for invalid metadata", async () => {
      await writeMetadata(
        stringifyYaml({
          forkedFrom: {
            invalid_field: "bad",
          },
        }),
      );

      const result = await readLocalSkillMetadata(skillDir);

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });

    it("returns null and warns when metadata.yaml cannot be parsed at all", async () => {
      await writeMetadata(UNPARSEABLE_YAML);

      const result = await readLocalSkillMetadata(skillDir);

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });
  });

  describe("writeMetadataYaml", () => {
    /** Longer than the yaml library's default 80-column fold. */
    const LONG_DESCRIPTION = `A description that runs on ${"and on ".repeat(15)}past any column a folding writer stops at`;

    it("writes a long value on one line, after the schema comment it is given", async () => {
      await writeMetadataYaml(metadataPath(), { cliDescription: LONG_DESCRIPTION }, "# schema\n");

      expect(await writtenMetadata()).toBe(`# schema\ncliDescription: ${LONG_DESCRIPTION}\n`);
    });
  });
});
