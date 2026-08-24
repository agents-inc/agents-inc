import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { chmod, mkdir, readdir, stat, writeFile as fsWriteFile } from "fs/promises";
import { copy, readFileSafe } from "./fs";
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

  // `eject` means the user owns the copy, so it has to be writable however the SOURCE was stored.
  // `fs-extra`'s copy preserves mode, and nothing normalised it: a marketplace checkout on a
  // read-only mount, in a Nix store path, or under a restrictive umask produced skills the user
  // could not subsequently edit — and the failure surfaced later, at an unrelated `edit`, naming a
  // file the user never made read-only. Found 2026-08-23 when a frozen test fixture propagated
  // `r--r--r--` into 17 spec files' installed projects.
  describe("copy normalises what it writes, because the destination is the user's", () => {
    /**
     * Makes a read-only SOURCE writable again so `afterEach` can delete it.
     *
     * The subject here is what `copy` leaves at the DESTINATION; the source being read-only is the
     * precondition, and a precondition that survives the test breaks the next one's teardown.
     */
    async function unfreeze(dir: string): Promise<void> {
      await chmod(dir, 0o755);
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await unfreeze(full);
        else await chmod(full, 0o644);
      }
    }

    it("makes a file writable even when the source was read-only", async () => {
      const src = path.join(tempDir, "src");
      const dest = path.join(tempDir, "dest");
      await mkdir(src, { recursive: true });
      await fsWriteFile(path.join(src, "SKILL.md"), "# skill\n");
      await chmod(path.join(src, "SKILL.md"), 0o444);
      await chmod(src, 0o555);

      await copy(src, dest);
      await unfreeze(src);

      const copied = path.join(dest, "SKILL.md");
      await expect(fsWriteFile(copied, "edited\n")).resolves.toBeUndefined();
      expect((await stat(copied)).mode & 0o200).toBeTruthy();
    });

    it("makes a directory writable, so a later write can add a file beside the copy", async () => {
      const src = path.join(tempDir, "src2");
      const dest = path.join(tempDir, "dest2");
      await mkdir(path.join(src, "nested"), { recursive: true });
      await fsWriteFile(path.join(src, "nested", "a.md"), "a\n");
      await chmod(path.join(src, "nested", "a.md"), 0o444);
      await chmod(path.join(src, "nested"), 0o555);
      await chmod(src, 0o555);

      await copy(src, dest);
      await unfreeze(src);

      await expect(fsWriteFile(path.join(dest, "nested", "b.md"), "b\n")).resolves.toBeUndefined();
    });

    // ADDS the owner's write bit rather than flattening the mode — a skill that ships an
    // executable script must still be executable after it is ejected.
    it("keeps an executable bit the source set", async () => {
      const src = path.join(tempDir, "src3");
      const dest = path.join(tempDir, "dest3");
      await mkdir(src, { recursive: true });
      await fsWriteFile(path.join(src, "run.sh"), "#!/bin/sh\n");
      await chmod(path.join(src, "run.sh"), 0o555);

      await copy(src, dest);
      await unfreeze(src);

      const copied = await stat(path.join(dest, "run.sh"));
      expect(copied.mode & 0o100, "the executable bit must survive").toBeTruthy();
      expect(copied.mode & 0o200, "and the owner must be able to write it").toBeTruthy();
    });
  });
});
