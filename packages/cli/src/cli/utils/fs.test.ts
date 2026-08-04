import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { writeFile as fsWriteFile } from "fs/promises";
import { readFileSafe } from "./fs";
import { createTempDir, cleanupTempDir } from "../lib/__tests__/test-fs-utils";

describe("fs utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-fs-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("readFileSafe", () => {
    it("should read a file within size limits", async () => {
      const filePath = path.join(tempDir, "small.json");
      const content = JSON.stringify({ name: "test", version: "1.0.0" });
      await fsWriteFile(filePath, content, "utf-8");

      const result = await readFileSafe(filePath, 1024);

      expect(result).toBe(content);
    });

    it("should throw when file exceeds size limit", async () => {
      const filePath = path.join(tempDir, "large.json");
      const content = "x".repeat(1000);
      await fsWriteFile(filePath, content, "utf-8");

      await expect(readFileSafe(filePath, 500)).rejects.toThrow(/File too large/);
    });

    it("should include file path and size details in error message", async () => {
      const filePath = path.join(tempDir, "oversized.json");
      const content = "x".repeat(2000);
      await fsWriteFile(filePath, content, "utf-8");

      await expect(readFileSafe(filePath, 100)).rejects.toThrow(filePath);
      await expect(readFileSafe(filePath, 100)).rejects.toThrow(/limit: 100 bytes/);
    });

    it("should allow files at exactly the size limit", async () => {
      const filePath = path.join(tempDir, "exact.json");
      const content = "x".repeat(100);
      await fsWriteFile(filePath, content, "utf-8");

      const result = await readFileSafe(filePath, 100);

      expect(result).toBe(content);
    });

    it("should throw when file does not exist", async () => {
      const filePath = path.join(tempDir, "nonexistent.json");

      await expect(readFileSafe(filePath, 1024)).rejects.toThrow();
    });
  });
});
