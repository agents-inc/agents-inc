import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach } from "vitest";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";

export type IsolatedHome = {
  tempDir: string;
  projectDir: string;
  fakeHome: string;
  cleanup: () => Promise<void>;
};

/**
 * Creates a temp directory with an isolated `projectDir` and `fakeHome`,
 * chdirs into `projectDir`, and points `process.env.HOME` at `fakeHome`.
 *
 * The returned `cleanup` restores the original cwd and HOME (or unsets HOME
 * when it was originally undefined) and removes the temp directory.
 *
 * Call in `beforeEach` and invoke `cleanup` in `afterEach`.
 *
 * Isolation mechanism: this and {@link useFakeHome} isolate production code that
 * reads the home directory via `process.env.HOME`. They do NOT isolate code that
 * calls `os.homedir()` — that path reads the OS-level home and ignores
 * `process.env.HOME`, so it requires a `vi.spyOn(os, "homedir")` spy instead
 * (see the homedir-spy test files). The two mechanisms are NOT interchangeable.
 */
export async function setupIsolatedHome(prefix: string): Promise<IsolatedHome> {
  const tempDir = await createTempDir(prefix);
  const projectDir = path.join(tempDir, "project");
  const fakeHome = path.join(tempDir, "fakehome");
  await mkdir(projectDir, { recursive: true });
  await mkdir(fakeHome, { recursive: true });

  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  process.chdir(projectDir);
  process.env.HOME = fakeHome;

  const cleanup = async () => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await cleanupTempDir(tempDir);
  };

  return { tempDir, projectDir, fakeHome, cleanup };
}

/**
 * Hook-registering sibling of {@link setupIsolatedHome}: registers a `beforeEach`
 * that points `process.env.HOME` at `<tempDir>/fake-home` (created fresh per test)
 * and an `afterEach` that restores the original HOME. Pass `setHome: false` when
 * the test itself decides when to point HOME at the fake home. Returns a live
 * view of the fake home dir.
 *
 * Isolation mechanism: like {@link setupIsolatedHome}, this isolates production
 * code that reads the home directory via `process.env.HOME` — NOT code that calls
 * `os.homedir()` (which requires a `vi.spyOn(os, "homedir")` spy). The two are
 * NOT interchangeable.
 */
export function useFakeHome(
  getTempDir: () => string,
  options?: { setHome?: boolean },
): { readonly dir: string } {
  let savedHome: string | undefined;
  let fakeHome: string;

  beforeEach(async () => {
    savedHome = process.env.HOME;
    fakeHome = path.join(getTempDir(), "fake-home");
    await mkdir(fakeHome, { recursive: true });
    if (options?.setHome !== false) {
      process.env.HOME = fakeHome;
    }
  });

  afterEach(() => {
    if (savedHome !== undefined) {
      process.env.HOME = savedHome;
    } else {
      delete process.env.HOME;
    }
  });

  return {
    get dir() {
      return fakeHome;
    },
  };
}
