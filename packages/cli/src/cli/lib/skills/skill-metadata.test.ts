import { describe, expect, it, vi } from "vitest";
import type { SkillId } from "../../types";

// Mock file system and logger (manual mocks from __mocks__ directories)
vi.mock("../../utils/fs");
vi.mock("../../utils/logger");

// Mock versioning
vi.mock("../versioning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../versioning")>()),
  getCurrentDate: vi.fn().mockReturnValue("2026-01-15"),
}));

import { stringify as stringifyYaml } from "yaml";
import { fileExists, readFile, writeFile } from "../../utils/fs";
import { warn } from "../../utils/logger";
import { elementAt, firstElement } from "../__tests__/helpers/element-at.js";
import {
  injectForkedFromMetadata,
  readForkedFromMetadata,
  readLocalSkillMetadata,
} from "./skill-metadata";

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

describe("skill-metadata", () => {
  describe("readForkedFromMetadata", () => {
    it("returns forkedFrom metadata when metadata.yaml exists and is valid", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        createValidMetadataYaml("web-framework-react", "abc1234", "2026-01-01"),
      );

      const result = await readForkedFromMetadata("/project/.claude/skills/react");

      expect(result).toStrictEqual({
        skillId: "web-framework-react",
        contentHash: "abc1234",
        date: "2026-01-01",
      });
      expect(fileExists).toHaveBeenCalledWith("/project/.claude/skills/react/metadata.yaml");
    });

    it("returns null when metadata.yaml does not exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await readForkedFromMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
      expect(readFile).not.toHaveBeenCalled();
    });

    it("returns null when metadata.yaml has no forkedFrom field", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(createMetadataWithoutForkedFrom());

      const result = await readForkedFromMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
    });

    it("returns null and warns when metadata.yaml has invalid data", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        stringifyYaml({
          forkedFrom: {
            // Missing required fields: skillId, contentHash, date
            invalid_field: "bad",
          },
        }),
      );

      const result = await readForkedFromMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });

    it("returns null and warns when forkedFrom has wrong types", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        stringifyYaml({
          forkedFrom: {
            skillId: 123, // Should be string
            contentHash: "abc",
            date: "2026-01-01",
          },
        }),
      );

      const result = await readForkedFromMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });
  });

  describe("injectForkedFromMetadata", () => {
    it("injects forkedFrom metadata into existing metadata.yaml", async () => {
      vi.mocked(readFile).mockResolvedValue(createMetadataWithoutForkedFrom());

      await injectForkedFromMetadata(
        "/project/.claude/skills/react",
        "web-framework-react",
        "abc1234",
      );

      expect(writeFile).toHaveBeenCalledWith(
        "/project/.claude/skills/react/metadata.yaml",
        expect.stringContaining("forkedFrom"),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("web-framework-react"),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("abc1234"),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("2026-01-15"), // From mocked getCurrentDate
      );
    });

    it("updates existing forkedFrom metadata", async () => {
      vi.mocked(readFile).mockResolvedValue(
        // Boundary cast: fictional skill ID for testing metadata update
        createValidMetadataYaml("old-skill-id" as SkillId, "old-hash", "2025-01-01"),
      );

      await injectForkedFromMetadata("/dest", "web-framework-react", "new-hash");

      const writtenContent = elementAt(firstElement(vi.mocked(writeFile).mock.calls), 1);
      expect(writtenContent).toContain("web-framework-react");
      expect(writtenContent).toContain("new-hash");
      expect(writtenContent).not.toContain("old-skill-id");
      expect(writtenContent).not.toContain("old-hash");
    });

    it("strips yaml-language-server schema comment before parsing", async () => {
      vi.mocked(readFile).mockResolvedValue(
        createMetadataWithSchemaComment("web-framework-react", "abc1234"),
      );

      await injectForkedFromMetadata("/dest", "web-framework-react", "new-hash");

      // Should successfully write (no parse error from schema comment)
      expect(writeFile).toHaveBeenCalledTimes(1);
      const writtenContent = elementAt(firstElement(vi.mocked(writeFile).mock.calls), 1);
      expect(writtenContent).toContain("new-hash");
    });

    it("throws when metadata.yaml contains unparseable YAML", async () => {
      vi.mocked(readFile).mockResolvedValue("not: [valid: yaml: {broken");

      await expect(
        injectForkedFromMetadata("/dest", "web-framework-react", "abc1234"),
      ).rejects.toThrow();
    });

    it("reads from correct metadata.yaml path", async () => {
      vi.mocked(readFile).mockResolvedValue(createMetadataWithoutForkedFrom());

      await injectForkedFromMetadata("/project/skills/react", "web-framework-react", "abc1234");

      expect(readFile).toHaveBeenCalledWith("/project/skills/react/metadata.yaml");
    });
  });

  describe("readLocalSkillMetadata", () => {
    it("returns full metadata when metadata.yaml exists and is valid", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        stringifyYaml({
          forkedFrom: {
            skillId: "web-framework-react",
            contentHash: "abc1234",
            date: "2026-01-01",
          },
        }),
      );

      const result = await readLocalSkillMetadata("/project/.claude/skills/react");

      expect(result).not.toBeNull();
      expect(result?.forkedFrom?.skillId).toBe("web-framework-react");
    });

    it("returns null when metadata.yaml does not exist", async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await readLocalSkillMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
    });

    it("returns metadata without forkedFrom for user-created skills", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(createMetadataWithoutForkedFrom());

      const result = await readLocalSkillMetadata("/project/.claude/skills/custom");

      expect(result).not.toBeNull();
      expect(result?.forkedFrom).toBeUndefined();
    });

    it("returns null and warns for invalid metadata", async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        stringifyYaml({
          forkedFrom: {
            invalid_field: "bad",
          },
        }),
      );

      const result = await readLocalSkillMetadata("/project/.claude/skills/react");

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid metadata.yaml"));
    });
  });
});
