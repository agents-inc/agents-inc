import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { chmod, mkdir, readdir, stat, symlink, writeFile as fsWriteFile } from "fs/promises";
import {
  copy,
  glob,
  isSymlink,
  listDirectories,
  readFileOptional,
  readFileSafe,
  removeDirIfEmpty,
  writeFile,
} from "./fs";
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

  describe("copy normalises what it writes, because the destination is the user's", () => {
    // Restores the read-only source so `afterEach` can delete it.
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

  describe("reading and listing", () => {
    it("answers an empty string for a file that is not there", async () => {
      expect(await readFileOptional(path.join(tempDir, "absent.md"))).toBe("");
    });

    it("lists the folders in a directory and not its files, and nothing for a missing one", async () => {
      await mkdir(path.join(tempDir, "a-folder"));
      await fsWriteFile(path.join(tempDir, "a-file.md"), "# file");

      expect(await listDirectories(tempDir)).toStrictEqual(["a-folder"]);
      expect(await listDirectories(path.join(tempDir, "absent"))).toStrictEqual([]);
    });

    it("leaves dotfiles out of a scan unless asked for them", async () => {
      await fsWriteFile(path.join(tempDir, ".hidden"), "");
      await fsWriteFile(path.join(tempDir, "shown"), "");

      expect(await glob("*", tempDir)).toStrictEqual(["shown"]);
      expect((await glob("*", tempDir, { dot: true })).toSorted()).toStrictEqual([
        ".hidden",
        "shown",
      ]);
    });
  });

  describe("telling a link from what it names", () => {
    let folder: string;
    let file: string;

    beforeEach(async () => {
      folder = path.join(tempDir, "a-folder");
      file = path.join(tempDir, "a-file.md");
      await mkdir(path.join(folder, "inside"), { recursive: true });
      await fsWriteFile(file, "");
    });

    it("answers true for a link to a folder, to a file and to nothing", async () => {
      const toAFolder = path.join(tempDir, "link-to-a-folder");
      const toAFile = path.join(tempDir, "link-to-a-file");
      const toNothing = path.join(tempDir, "link-to-nothing");
      await symlink(folder, toAFolder);
      await symlink(file, toAFile);
      await symlink(path.join(tempDir, "absent"), toNothing);

      expect(await isSymlink(toAFolder)).toBe(true);
      expect(await isSymlink(toAFile)).toBe(true);
      expect(await isSymlink(toNothing)).toBe(true);
    });

    it("answers false for a folder, a file and a path with nothing at it", async () => {
      expect(await isSymlink(folder)).toBe(false);
      expect(await isSymlink(file)).toBe(false);
      expect(await isSymlink(path.join(tempDir, "absent"))).toBe(false);
    });

    it("reads only the last part of the path, so a folder reached through a link is no link", async () => {
      const toAFolder = path.join(tempDir, "link-to-a-folder");
      await symlink(folder, toAFolder);

      expect(await isSymlink(path.join(toAFolder, "inside"))).toBe(false);
    });
  });

  describe("writing and removing", () => {
    it("creates the folders a written file needs", async () => {
      const nested = path.join(tempDir, "one", "two", "file.md");

      await writeFile(nested, "# nested");

      expect((await stat(nested)).isFile()).toBe(true);
    });

    it("removes nothing, and says so, for a directory that is not there", async () => {
      expect(await removeDirIfEmpty(path.join(tempDir, "absent"))).toBe(false);
    });
  });
});
