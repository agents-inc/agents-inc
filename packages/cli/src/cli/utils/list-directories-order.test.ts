import type { Dirent } from "fs";
import { describe, expect, it, vi } from "vitest";

/** The two fields `listDirectories` reads off an entry. */
type DirectoryEntry = Pick<Dirent, "name" | "isDirectory">;

// readdir answers in the order the file system keeps entries, which differs between runtimes and
// file systems, so it answers here in an order no sort would produce.
const { readdir } = vi.hoisted(() => ({
  readdir: vi.fn<(dirPath: string, options: object) => Promise<DirectoryEntry[]>>(),
}));
vi.mock("fs-extra", async (importOriginal) => {
  const original = await importOriginal<{ default: object }>();
  return { default: { ...original.default, readdir } };
});

import { listDirectories } from "./fs";

function directory(name: string): DirectoryEntry {
  return { name, isDirectory: () => true };
}

function file(name: string): DirectoryEntry {
  return { name, isDirectory: () => false };
}

const AS_THE_FILE_SYSTEM_KEEPS_THEM = [
  directory("worse-plugin"),
  file("README.md"),
  directory("bad-plugin"),
  directory("Zeta-plugin"),
];

/** Code-unit order puts the capital first, where a locale-aware compare would not. */
const IN_BYTEWISE_ORDER = ["Zeta-plugin", "bad-plugin", "worse-plugin"];

describe("listDirectories", () => {
  it("answers the directories in bytewise order, whatever order the read found them in", async () => {
    readdir.mockResolvedValue(AS_THE_FILE_SYSTEM_KEEPS_THEM);

    expect(await listDirectories("/plugins")).toStrictEqual(IN_BYTEWISE_ORDER);
  });
});
