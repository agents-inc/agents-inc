import path from "path";
import { isSharedSource } from "./helpers/shared-source.js";
import os from "os";
import { mkdtemp, rm, stat } from "fs/promises";

const DEFAULT_TEMP_PREFIX = "ai-test-";
const CLEANUP_MAX_RETRIES = 3;
const CLEANUP_RETRY_DELAY_MS = 100;

export async function createTempDir(prefix = DEFAULT_TEMP_PREFIX): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a temp directory, unless it is the shared E2E source, which this does not own.
 *
 * 121 spec files tear their source down in `afterAll`, written when every source was private. The
 * shared fixture is handed to most of them by default now, and one file's teardown must not delete
 * the fixture the rest of the run is still reading. Refused here rather than at 121 call sites, and
 * refused by IDENTITY rather than by permissions: the tree is frozen, so a delete would fail
 * anyway, but it would fail as a confusing `EACCES` in an unrelated `afterAll` instead of simply
 * not happening. `e2e/global-setup.ts` owns its lifetime.
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
