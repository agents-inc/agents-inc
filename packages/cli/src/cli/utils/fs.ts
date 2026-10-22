import fs from "fs-extra";
import fg from "fast-glob";
import os from "os";
import path from "path";
import { PROVIDERS, STANDARD_FILES } from "../consts";
import { sourceDir } from "../lib/installation/install-layout.js";
import { bytewise } from "./string.js";
// Private gate module, allowed here by an eslint exception: this is the write choke point.
import { assertGateToken } from "../lib/config-gate/gate-token.js";

/** Purely lexical: no symlink resolution. */
export function isPathWithin(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function readFileSafe(filePath: string, maxSizeBytes: number): Promise<string> {
  const stats = await fs.stat(filePath);
  if (stats.size > maxSizeBytes) {
    throw new Error(
      `File too large: '${filePath}' is ${stats.size} bytes (limit: ${maxSizeBytes} bytes)`,
    );
  }
  return fs.readFile(filePath, "utf-8");
}

export async function readFileOptional(filePath: string, fallback = ""): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return fallback;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Asks of the path's last part itself, where `fileExists` and `directoryExists` follow a link. */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const entry = await fs.lstat(filePath);
    return entry.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Sorted bytewise: readdir answers in the file system's order, which differs between runtimes. */
export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .toSorted(bytewise);
  } catch {
    return [];
  }
}

/**
 * Sorted bytewise, because fast-glob answers in the order its concurrent directory reads finish,
 * which changes from run to run.
 * @param dot Off for scans; on for reads that must reproduce a directory faithfully.
 */
export async function glob(
  pattern: string,
  cwd: string,
  { dot = false }: { dot?: boolean } = {},
): Promise<string[]> {
  const matches = await fg(pattern, { cwd, onlyFiles: true, dot });
  return matches.toSorted(bytewise);
}

const PAIR_HALVES = [STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS];

// Every provider's folder, not just the one in use, so an unexpected write is still caught.
function globalPairFolders(): string[] {
  const home = os.homedir();
  return PROVIDERS.map((provider) => sourceDir(home, provider));
}

function everyGlobalPairPath(): string[] {
  return globalPairFolders().flatMap((folder) =>
    PAIR_HALVES.map((half) => path.join(folder, half)),
  );
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  // Runtime tripwire: a global pair write without the gate's token throws. Resolved, so any
  // spelling of the path is caught.
  const resolvedPath = path.resolve(filePath);
  if (everyGlobalPairPath().includes(resolvedPath)) assertGateToken(resolvedPath);

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function remove(filePath: string): Promise<void> {
  await fs.remove(filePath);
}

/** An unreadable or absent directory counts as empty. */
export async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    return true;
  }
}

/** Filesystem emptiness, not roster emptiness: any user-owned file keeps the directory. */
export async function removeDirIfEmpty(dir: string): Promise<boolean> {
  if (!(await directoryExists(dir))) return false;
  if (!(await isDirectoryEmpty(dir))) return false;
  await remove(dir);
  return true;
}

/**
 * Adds the owner's write bit after copying (mode otherwise preserved), so an ejected copy
 * from a read-only source stays editable.
 */
export async function copy(src: string, dest: string): Promise<void> {
  await fs.copy(src, dest);
  await grantOwnerWrite(dest);
}

const OWNER_WRITE = 0o200;

async function grantOwnerWrite(target: string): Promise<void> {
  const entry = await fs.stat(target);
  await fs.chmod(target, entry.mode | OWNER_WRITE);

  if (!entry.isDirectory()) return;

  const children = await fs.readdir(target);
  await Promise.all(children.map((child) => grantOwnerWrite(path.join(target, child))));
}
