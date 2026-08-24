import fs from "fs-extra";
import fg from "fast-glob";
import os from "os";
import path from "path";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../consts";
// The gate's private token module, imported here by exception (eslint records
// it): this file is the write choke point every pair write funnels through, and
// `gate-token.ts` is a dependency-free leaf, so the import cannot cycle.
import { assertGateToken } from "../lib/config-gate/gate-token.js";

/**
 * True when `child` resolves to `parent` or inside it. Purely lexical
 * (no symlink resolution) — the caller decides throw-vs-warn policy.
 */
export function isPathWithin(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * Reads a file with a size limit check before reading content.
 * Throws if the file exceeds maxSizeBytes. Prevents DoS from oversized files.
 */
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

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * @param dot Include files and directories whose name starts with a dot. Off by default, which
 *   is what a scan LOOKING for something wants; a read that has to reproduce a directory
 *   faithfully wants it on, since a file the read skips is one the copy silently loses.
 */
export async function glob(
  pattern: string,
  cwd: string,
  { dot = false }: { dot?: boolean } = {},
): Promise<string[]> {
  return fg(pattern, { cwd, onlyFiles: true, dot });
}

/**
 * True when `resolvedPath` is one of the two halves of the global config pair.
 *
 * Compares resolved paths rather than matching on the filename, so it holds
 * against every way of naming the same file — a concatenated path, a relative
 * one, a fragment assembled at runtime — which is exactly what a static check
 * cannot do.
 */
function isGlobalPairPath(resolvedPath: string): boolean {
  const globalConfigDir = path.join(os.homedir(), CLAUDE_SRC_DIR);
  return (
    resolvedPath === path.join(globalConfigDir, STANDARD_FILES.CONFIG_TS) ||
    resolvedPath === path.join(globalConfigDir, STANDARD_FILES.CONFIG_TYPES_TS)
  );
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  // Runtime tripwire: every write in the CLI funnels through here, so a pair
  // write attempted without the gate's token dies at its first execution
  // whatever route it took to get here. Costs one path compare per write.
  const resolvedPath = path.resolve(filePath);
  if (isGlobalPairPath(resolvedPath)) assertGateToken(resolvedPath);

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function remove(filePath: string): Promise<void> {
  await fs.remove(filePath);
}

/**
 * True when `dirPath` holds nothing, and true when it cannot be read at all —
 * an absent directory holds nothing either. Both callers ask the same question
 * of a directory they are about to write into or remove.
 */
export async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    return true;
  }
}

/**
 * Removes `dir` when it exists and holds nothing; true when it was removed.
 *
 * A scope directory (`.claude/skills/`, `.claude/agents/`) is an artefact of
 * what it holds, so the removal that empties it takes it too. Emptiness here is
 * FILESYSTEM emptiness and never roster emptiness — a hand-authored agent or any
 * other user-owned file keeps its directory alive, whatever a config says.
 */
export async function removeDirIfEmpty(dir: string): Promise<boolean> {
  if (!(await directoryExists(dir))) return false;
  if (!(await isDirectoryEmpty(dir))) return false;
  await remove(dir);
  return true;
}

/**
 * Copies a tree into an installation, and makes what it wrote writable by its new owner.
 *
 * **`eject` means the user owns the copy**, so the copy has to be editable however the SOURCE
 * happened to be stored. `fs-extra` preserves mode, and nothing normalised it: a marketplace on a
 * read-only mount, in a Nix store path, or written under a restrictive umask produced skills the
 * user could not subsequently edit — and the failure did not surface at the install. It surfaced
 * later, at an unrelated `edit` or mode switch, as `EACCES` on a file the user never made
 * read-only. Every caller of this function is an install or an eject, so every destination is the
 * user's.
 *
 * The owner's write bit is ADDED rather than the mode replaced. A skill may legitimately ship an
 * executable script, and flattening to `644` would break it on the way in — the destination should
 * differ from the source in exactly one respect, which is that its owner can write it.
 *
 * Directories take the same bit for the same reason: a read-only directory refuses a file added
 * beside the copy, which is what an eject-then-edit does next.
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
