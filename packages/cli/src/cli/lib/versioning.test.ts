import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  getCurrentDate,
  computeStringHash,
  computeFileHash,
  computeSkillFolderHash,
  computeShippedHash,
  determinePluginVersion,
  readEarlierBuild,
  versionAfterRebuild,
} from "./versioning";
import { getPluginManifestPath } from "./plugins/plugin-finder";
import { silenceConsole } from "./__tests__/helpers/silence-console";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_FILES } from "../consts";

describe("getCurrentDate", () => {
  it("should return date in YYYY-MM-DD format", () => {
    const result = getCurrentDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should return a valid date", () => {
    const result = getCurrentDate();
    const parsed = new Date(result);
    expect(parsed.toString()).not.toBe("Invalid Date");
  });

  it("should return today's date", () => {
    const result = getCurrentDate();
    const expected = new Date().toISOString().split("T")[0];
    expect(result).toBe(expected);
  });
});

describe("computeStringHash", () => {
  it("should return a 7-character hex string", () => {
    const result = computeStringHash("test content");
    expect(result).toMatch(/^[a-f0-9]{7}$/);
  });

  it("should return consistent hashes for the same content", () => {
    const content = "hello world";
    const hash1 = computeStringHash(content);
    const hash2 = computeStringHash(content);
    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different content", () => {
    const hash1 = computeStringHash("content A");
    const hash2 = computeStringHash("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("when given empty string, should return valid 7-char hex hash", () => {
    const result = computeStringHash("");
    expect(result).toMatch(/^[a-f0-9]{7}$/);
  });

  it("should produce known hash for known input", () => {
    // SHA-256 of "test" starts 9f86d08
    const result = computeStringHash("test");
    expect(result).toBe("9f86d08");
  });
});

describe("computeFileHash", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("hashfile-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should hash file content", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await writeFile(filePath, "test content");

    const hash = await computeFileHash(filePath);

    expect(hash).toMatch(/^[a-f0-9]{7}$/);
  });

  it("should return consistent hash for same file content", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await writeFile(filePath, "hello world");

    const hash1 = await computeFileHash(filePath);
    const hash2 = await computeFileHash(filePath);

    expect(hash1).toBe(hash2);
  });

  it("should match computeStringHash for same content", async () => {
    const content = "matching content test";
    const filePath = path.join(tempDir, "test.txt");
    await writeFile(filePath, content);

    const fileHash = await computeFileHash(filePath);
    const stringHash = computeStringHash(content);

    expect(fileHash).toBe(stringHash);
  });
});

describe("computeSkillFolderHash", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("versioning-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should hash SKILL.md content", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test Skill\n\nThis is a test.");

    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toMatch(/^[a-f0-9]{7}$/);
  });

  it("should return consistent hash for same content", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test Skill");

    const hash1 = await computeSkillFolderHash(tempDir);
    const hash2 = await computeSkillFolderHash(tempDir);

    expect(hash1).toBe(hash2);
  });

  it("should return different hash when content changes", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Version 1");
    const hash1 = await computeSkillFolderHash(tempDir);

    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Version 2");
    const hash2 = await computeSkillFolderHash(tempDir);

    expect(hash1).not.toBe(hash2);
  });

  it("should include reference.md in hash", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test");

    const hashWithoutRef = await computeSkillFolderHash(tempDir);

    await writeFile(path.join(tempDir, "reference.md"), "# Reference");
    const hashWithRef = await computeSkillFolderHash(tempDir);

    expect(hashWithoutRef).not.toBe(hashWithRef);
  });

  it("should include examples directory in hash", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test");

    const hashWithoutExamples = await computeSkillFolderHash(tempDir);

    await mkdir(path.join(tempDir, "examples"), { recursive: true });
    await writeFile(path.join(tempDir, "examples", "example.ts"), "// Example code");
    const hashWithExamples = await computeSkillFolderHash(tempDir);

    expect(hashWithoutExamples).not.toBe(hashWithExamples);
  });

  it("when skill folder has no files, should return valid hash from empty content", async () => {
    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toMatch(/^[a-f0-9]{7}$/);
  });
});

describe("computeSkillFolderHash, the hashed text", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("versioning-hashed-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("hashes each file as its path and content, in path order, between separators", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test");
    await mkdir(path.join(tempDir, "examples"), { recursive: true });
    await writeFile(path.join(tempDir, "examples", "b.ts"), "// B");
    await writeFile(path.join(tempDir, "examples", "a.ts"), "// A");

    expect(await computeSkillFolderHash(tempDir)).toBe(
      computeStringHash(
        ["SKILL.md:# Test", "examples/a.ts:// A", "examples/b.ts:// B"].join("\n---\n"),
      ),
    );
  });
});

describe("computeSkillFolderHash, nested example files", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("versioning-nested-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("hashes a nested file and a top-level one in path order, not the order they are found", async () => {
    await writeFile(path.join(tempDir, STANDARD_FILES.SKILL_MD), "# Test");
    await mkdir(path.join(tempDir, "examples", "a"), { recursive: true });
    await writeFile(path.join(tempDir, "examples", "a", "z.ts"), "// nested");
    await writeFile(path.join(tempDir, "examples", "b.ts"), "// top level");

    expect(await computeSkillFolderHash(tempDir)).toBe(
      computeStringHash(
        ["SKILL.md:# Test", "examples/a/z.ts:// nested", "examples/b.ts:// top level"].join(
          "\n---\n",
        ),
      ),
    );
  });
});

describe("determinePluginVersion", () => {
  const consoleSpies = silenceConsole(["warn"]);
  const NEW_HASH = "abc1234";
  const OLD_HASH = "0123456";
  let pluginDir: string;

  beforeEach(async () => {
    pluginDir = await createTempDir("versioning-plugin-");
  });

  afterEach(async () => {
    await cleanupTempDir(pluginDir);
  });

  async function pluginOnDisk(manifest: string, contentHash?: string): Promise<string> {
    const manifestPath = getPluginManifestPath(pluginDir);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, manifest);
    if (contentHash !== undefined) {
      await writeFile(path.join(path.dirname(manifestPath), ".content-hash"), contentHash);
    }
    return manifestPath;
  }

  it("starts a plugin with no manifest at 1.0.0, warning about nothing", async () => {
    expect(await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).toStrictEqual({
      version: "1.0.0",
      contentHash: NEW_HASH,
    });
    expect(consoleSpies.warn).not.toHaveBeenCalled();
  });

  it("keeps the version when the recorded hash matches, a trailing newline aside", async () => {
    await pluginOnDisk(JSON.stringify({ name: "acme-react", version: "3.0.0" }), `${NEW_HASH}\n`);

    expect(await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).toStrictEqual({
      version: "3.0.0",
      contentHash: NEW_HASH,
    });
  });

  it("bumps the major and resets minor and patch when the recorded hash differs", async () => {
    await pluginOnDisk(JSON.stringify({ name: "acme-react", version: "3.2.1" }), OLD_HASH);

    expect(await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).toStrictEqual({
      version: "4.0.0",
      contentHash: NEW_HASH,
    });
  });

  it("reads a major of more than one digit", async () => {
    await pluginOnDisk(JSON.stringify({ name: "acme-react", version: "10.0.0" }), OLD_HASH);

    expect((await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).version).toBe(
      "11.0.0",
    );
  });

  it.each(["latest", "v2.0.0"])(
    "bumps %s, a version that does not open with its major, as though it were major 1",
    async (version) => {
      await pluginOnDisk(JSON.stringify({ name: "acme-react", version }), OLD_HASH);

      expect(
        (await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).version,
      ).toBe("2.0.0");
    },
  );

  it("starts over at 1.0.0 from a manifest it cannot read, and names it", async () => {
    const manifestPath = await pluginOnDisk("{ not json");

    expect(await determinePluginVersion(NEW_HASH, pluginDir, getPluginManifestPath)).toStrictEqual({
      version: "1.0.0",
      contentHash: NEW_HASH,
    });
    expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        new RegExp(`^  Warning: Failed to read plugin manifest at '${manifestPath}': .+`),
      ),
    );
  });
});

async function writePluginFile(
  pluginDir: string,
  relativePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const filePath = path.join(pluginDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

describe("computeShippedHash", () => {
  const MANIFEST = ".claude-plugin/plugin.json";
  const SKILL = "skills/acme-react/SKILL.md";
  let pluginDir: string;
  let otherDir: string;

  beforeEach(async () => {
    pluginDir = await createTempDir("versioning-shipped-");
    otherDir = await createTempDir("versioning-shipped-other-");
    await writePluginFile(pluginDir, MANIFEST, '{ "name": "acme-react" }');
    await writePluginFile(pluginDir, SKILL, "# React");
  });

  afterEach(async () => {
    await cleanupTempDir(pluginDir);
    await cleanupTempDir(otherDir);
  });

  it("answers the same for two folders holding the same files, written in another order", async () => {
    await writePluginFile(otherDir, SKILL, "# React");
    await writePluginFile(otherDir, MANIFEST, '{ "name": "acme-react" }');

    expect(await computeShippedHash(otherDir)).toBe(await computeShippedHash(pluginDir));
  });

  it("answers differently when one file's bytes differ", async () => {
    await writePluginFile(otherDir, MANIFEST, '{ "name": "acme-react" }');
    await writePluginFile(otherDir, SKILL, "# React, edited");

    expect(await computeShippedHash(otherDir)).not.toBe(await computeShippedHash(pluginDir));
  });

  it.each(["skills/acme-react/examples/orphan.md", ".claude-plugin/.content-hash"])(
    "answers differently when one folder also holds %s",
    async (extraFile) => {
      await writePluginFile(otherDir, MANIFEST, '{ "name": "acme-react" }');
      await writePluginFile(otherDir, SKILL, "# React");
      await writePluginFile(otherDir, extraFile, "0123456");

      expect(await computeShippedHash(otherDir)).not.toBe(await computeShippedHash(pluginDir));
    },
  );

  it("answers differently when the same bytes sit at another path", async () => {
    await writePluginFile(otherDir, MANIFEST, '{ "name": "acme-react" }');
    await writePluginFile(otherDir, "skills/acme-react/reference.md", "# React");

    expect(await computeShippedHash(otherDir)).not.toBe(await computeShippedHash(pluginDir));
  });

  it("tells apart files whose bytes differ where they are not text", async () => {
    await writePluginFile(pluginDir, "skills/acme-react/scripts/tool.bin", Uint8Array.of(0xff));
    await writePluginFile(otherDir, MANIFEST, '{ "name": "acme-react" }');
    await writePluginFile(otherDir, SKILL, "# React");
    await writePluginFile(otherDir, "skills/acme-react/scripts/tool.bin", Uint8Array.of(0xfe));

    expect(await computeShippedHash(otherDir)).not.toBe(await computeShippedHash(pluginDir));
  });
});

describe("readEarlierBuild", () => {
  const MANIFEST_PATH = path.join(PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
  const consoleSpies = silenceConsole(["warn"]);
  let pluginDir: string;

  beforeEach(async () => {
    pluginDir = await createTempDir("versioning-earlier-");
  });

  afterEach(async () => {
    await cleanupTempDir(pluginDir);
  });

  it("answers null for a folder no build made, warning about nothing", async () => {
    await writePluginFile(pluginDir, "notes.md", "# Not a build");

    expect(await readEarlierBuild(pluginDir, getPluginManifestPath)).toBeNull();
    expect(consoleSpies.warn).not.toHaveBeenCalled();
  });

  it("reads the earlier build's version and what its folder ships", async () => {
    await writePluginFile(
      pluginDir,
      MANIFEST_PATH,
      JSON.stringify({ name: "acme-react", version: "3.0.0" }),
    );
    await writePluginFile(pluginDir, "skills/acme-react/SKILL.md", "# React");

    expect(await readEarlierBuild(pluginDir, getPluginManifestPath)).toStrictEqual({
      version: "3.0.0",
      shippedHash: await computeShippedHash(pluginDir),
    });
  });

  it("answers null from a manifest it cannot read, and names it", async () => {
    await writePluginFile(pluginDir, MANIFEST_PATH, "{ not json");
    const manifestPath = path.join(pluginDir, MANIFEST_PATH);

    expect(await readEarlierBuild(pluginDir, getPluginManifestPath)).toBeNull();
    expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        new RegExp(`^  Warning: Failed to read plugin manifest at '${manifestPath}': .+`),
      ),
    );
  });
});

describe("versionAfterRebuild", () => {
  const EARLIER = { version: "3.2.1", shippedHash: "0123456" };

  it("starts a plugin no earlier build made at 1.0.0", () => {
    expect(versionAfterRebuild(null, "abc1234")).toBe("1.0.0");
  });

  it("keeps the earlier version when the rebuild ships what the earlier build shipped", () => {
    expect(versionAfterRebuild(EARLIER, EARLIER.shippedHash)).toBe("3.2.1");
  });

  it("bumps the major and resets minor and patch when the rebuild ships anything else", () => {
    expect(versionAfterRebuild(EARLIER, "abc1234")).toBe("4.0.0");
  });
});
