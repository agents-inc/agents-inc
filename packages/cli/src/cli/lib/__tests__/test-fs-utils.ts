import path from "path";
import os from "os";
import { mkdtemp, rm, stat } from "fs/promises";

const DEFAULT_TEMP_PREFIX = "ai-test-";
const CLEANUP_MAX_RETRIES = 3;
const CLEANUP_RETRY_DELAY_MS = 100;

export async function createTempDir(prefix = DEFAULT_TEMP_PREFIX): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanupTempDir(dirPath: string): Promise<void> {
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
