import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach } from "vitest";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { linkSharedCache } from "./shared-marketplace-checkout.js";

export type IsolatedHome = {
  tempDir: string;
  projectDir: string;
  fakeHome: string;
  cleanup: () => Promise<void>;
};

/**
 * oclif's update-check door, closed for the life of every isolated home.
 *
 * `@oclif/plugin-warn-if-update-available`'s init hook spawns a DETACHED, `unref`ed
 * child that `mkdir -p`s and writes `<home>/.cache/agents-inc/version` before it makes
 * its network call. The child outlives the test that started it, so it recreates a fake
 * home `cleanup` has already removed — and its `mkdir` landing inside a running
 * recursive remove is the other side of the `ENOTEMPTY: rmdir` this suite sees. Measured
 * on `commands/eject.test.ts`: 26 resurrected `/tmp/cc-eject-test-*` directories in one
 * run of that one file, and 0 with this set.
 *
 * The key is oclif's own — `Config.scopedEnvVarKey` upper-cases the bin name and joins
 * it to the flag — and only `"1"` and `"true"` count, which is what
 * `isolated-home.test.ts` asserts through `Config` rather than by spelling.
 */
const OCLIF_SKIP_VERSION_CHECK = { name: "AGENTS_INC_SKIP_NEW_VERSION_CHECK", value: "1" };

/** Restores one environment variable to the state it was found in — absent included. */
type RestoreEnv = () => void;

/**
 * Remembers a variable without touching it, for the caller that sets its own value and
 * still wants the original put back.
 */
function captureEnv(name: string): RestoreEnv {
  const original = process.env[name];

  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

function overrideEnv(name: string, value: string): RestoreEnv {
  const restore = captureEnv(name);
  process.env[name] = value;
  return restore;
}

/**
 * Creates a temp directory with an isolated `projectDir` and `fakeHome`,
 * chdirs into `projectDir`, and points `process.env.HOME` at `fakeHome`.
 *
 * The returned `cleanup` restores the original cwd, HOME and update-check setting (or
 * unsets each when it was originally undefined) and removes the temp directory.
 *
 * Call in `beforeEach` and invoke `cleanup` in `afterEach`.
 *
 * ONE thing in the fake home is not private to the test: `.cache` is a symlink to the shared
 * marketplace checkout, so a command falling through to the default source finds it already
 * downloaded instead of fetching it from GitHub again. That is deliberate and it is what stopped
 * this project failing on machine speed — `helpers/shared-marketplace-checkout.ts` carries why
 * sharing it costs no isolation, and `cleanup` leaves it standing because `fs.rm` unlinks a
 * symlink rather than following it.
 *
 * Isolation mechanism. `vitest.setup.ts` installs a process-wide `vi.spyOn(os, "homedir")`
 * that answers with `process.env.HOME` whenever that differs from the real home, so setting
 * the variable does reach `os.homedir()` — under bun, which resolves it once at startup, as
 * well as under node, which re-reads it per call.
 *
 * Two things used to escape it, and both are closed. The spy was installed in a `beforeAll`,
 * so a `vi.restoreAllMocks()` ANYWHERE in a file removed it for every later test in that
 * file — it is installed per TEST now. And no mechanism here reaches a constant a module
 * computed from `os.homedir()` at IMPORT time, which `CACHE_DIR` and `GLOBAL_INSTALL_ROOT`
 * in `src/cli/consts.ts` both were — they are `cacheRoot()` and `globalInstallRoot()` now,
 * read at call time. `src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts` holds both,
 * the second as a declaration-shape gate over the whole of `src/cli`, since the frozen form
 * is a hazard for any constant somebody adds rather than for those two.
 */
export async function setupIsolatedHome(prefix: string): Promise<IsolatedHome> {
  const tempDir = await createTempDir(prefix);
  const projectDir = path.join(tempDir, "project");
  const fakeHome = path.join(tempDir, "fakehome");
  await mkdir(projectDir, { recursive: true });
  await mkdir(fakeHome, { recursive: true });
  await linkSharedCache(fakeHome);

  const originalCwd = process.cwd();
  process.chdir(projectDir);
  const restoreEnv = [
    overrideEnv("HOME", fakeHome),
    overrideEnv(OCLIF_SKIP_VERSION_CHECK.name, OCLIF_SKIP_VERSION_CHECK.value),
  ];

  const cleanup = async () => {
    process.chdir(originalCwd);
    for (const restore of restoreEnv) restore();
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
 * `setHome: false` withholds the HOME override and nothing else: the update-check door
 * is closed either way, because a detached writer is a hazard to the temp tree whatever
 * HOME says at the moment the command runs. The shared-checkout link is made either way too,
 * for the same reason — see {@link setupIsolatedHome}, which carries it in full.
 *
 * Isolation mechanism, and its two gaps: see {@link setupIsolatedHome}, which carries
 * both in full.
 */
export function useFakeHome(
  getTempDir: () => string,
  options?: { setHome?: boolean },
): { readonly dir: string } {
  let restoreEnv: RestoreEnv[] = [];
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = path.join(getTempDir(), "fake-home");
    await mkdir(fakeHome, { recursive: true });
    await linkSharedCache(fakeHome);
    restoreEnv = [
      options?.setHome === false ? captureEnv("HOME") : overrideEnv("HOME", fakeHome),
      overrideEnv(OCLIF_SKIP_VERSION_CHECK.name, OCLIF_SKIP_VERSION_CHECK.value),
    ];
  });

  afterEach(() => {
    for (const restore of restoreEnv) restore();
    restoreEnv = [];
  });

  return {
    get dir() {
      return fakeHome;
    },
  };
}
