import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach } from "vitest";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { CLAUDE_CONFIG_DIR_VAR } from "../../installation/install-layout.js";
import { linkSharedCache } from "./shared-marketplace-checkout.js";

export type IsolatedHome = {
  tempDir: string;
  projectDir: string;
  fakeHome: string;
  cleanup: () => Promise<void>;
};

/**
 * oclif's update check spawns a detached child that writes into `<home>/.cache` after the test,
 * resurrecting a removed fake home. The key is oclif's own; only `"1"` and `"true"` count.
 */
const OCLIF_SKIP_VERSION_CHECK = { name: "AGENTS_INC_SKIP_NEW_VERSION_CHECK", value: "1" };

/** Restores one variable as it was found, absent included. */
type RestoreEnv = () => void;

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

// Claude Code's state file follows `CLAUDE_CONFIG_DIR` before HOME, so an exported one would
// send a spec's writes to the developer's real state file.
function clearClaudeConfigDir(): RestoreEnv {
  const restore = captureEnv(CLAUDE_CONFIG_DIR_VAR);
  delete process.env[CLAUDE_CONFIG_DIR_VAR];
  return restore;
}

/**
 * Call in `beforeEach`; `cleanup` in `afterEach` restores cwd and env and removes the temp dir.
 * The fake home's `.cache` symlinks the shared marketplace checkout, so the default source is
 * already downloaded; `fs.rm` unlinks rather than follows it.
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
    clearClaudeConfigDir(),
  ];

  const cleanup = async () => {
    process.chdir(originalCwd);
    for (const restore of restoreEnv) restore();
    await cleanupTempDir(tempDir);
  };

  return { tempDir, projectDir, fakeHome, cleanup };
}

/**
 * Hook-registering form of {@link setupIsolatedHome}. `setHome: false` withholds only the HOME
 * override; the update check is still disabled and the shared checkout still linked.
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
      clearClaudeConfigDir(),
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
