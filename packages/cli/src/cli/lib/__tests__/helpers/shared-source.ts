import { chmod, mkdir, readdir, rm, stat } from "fs/promises";
import os from "os";
import path from "path";

/**
 * The E2E source non-mutating specs share, built once per run and frozen (`chmod a-w`) so a stray
 * write fails with EACCES in the spec that made it. A fixed path, since `globalSetup` and the
 * workers must both compute it; only global setup writes it, since unit and E2E runs share it.
 * The name avoids "source"/"marketplace" because specs assert refusals never say those words.
 */
const SHARED_SOURCE_DIR = path.join(os.tmpdir(), "agents-inc-e2e-shared-fixtures");

export function sharedSourcePath(): string {
  return SHARED_SOURCE_DIR;
}

export function isSharedSource(dir: string): boolean {
  return path.resolve(dir) === path.resolve(SHARED_SOURCE_DIR);
}

/** Removes any tree a killed run left at `root` first, so a half-built source is never reused. */
export async function buildFrozenSourceTree(
  root: string,
  build: (dir: string) => Promise<void>,
): Promise<string> {
  await unfreeze(root);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  await build(root);

  await freeze(root);

  return root;
}

export async function removeFrozenSourceTree(root: string): Promise<void> {
  await unfreeze(root);
  await rm(root, { recursive: true, force: true });
}

/** Only `e2e/global-setup.ts` may call this. */
export async function buildSharedSource(build: (dir: string) => Promise<void>): Promise<string> {
  return buildFrozenSourceTree(SHARED_SOURCE_DIR, build);
}

/** Only `e2e/global-setup.ts` may call this. */
export async function removeSharedSource(): Promise<void> {
  await removeFrozenSourceTree(SHARED_SOURCE_DIR);
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function freeze(root: string): Promise<void> {
  await chmodTree(root, 0o555, 0o444);
}

async function unfreeze(root: string): Promise<void> {
  if (!(await isDirectory(root))) return;

  await chmodTree(root, 0o755, 0o644);
}

/** Children before parent: a read-only directory's children can no longer be changed. */
async function chmodTree(dir: string, dirMode: number, fileMode: number): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await chmodTree(full, dirMode, fileMode);
    } else {
      await chmod(full, fileMode);
    }
  }

  await chmod(dir, dirMode);
}
