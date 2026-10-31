import path from "path";
import { isSharedSource } from "./helpers/shared-source.js";
import os from "os";
import { mkdtemp, realpath, rm, stat } from "fs/promises";

const DEFAULT_TEMP_PREFIX = "ai-test-";
const CLEANUP_MAX_RETRIES = 3;
const CLEANUP_RETRY_DELAY_MS = 100;

/** The real path, as `process.cwd()` answers it: on macOS `os.tmpdir()` is behind a symlink. */
export async function createTempDir(prefix = DEFAULT_TEMP_PREFIX): Promise<string> {
  return realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
}

/**
 * Skips the shared E2E source: one spec's teardown must not delete the fixture the rest of the run
 * reads. `e2e/global-setup.ts` owns its lifetime.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  if (isSharedSource(dirPath)) return;

  await rm(dirPath, {
    recursive: true,
    force: true,
    maxRetries: CLEANUP_MAX_RETRIES,
    retryDelay: CLEANUP_RETRY_DELAY_MS,
  });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}
