import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "fs/promises";
import os from "os";
import path from "path";

/**
 * The E2E source non-mutating specs share, frozen (`chmod a-w`) so a stray write fails with EACCES
 * in the spec that made it. Each run builds its own folder, named for the process that owns it, so
 * two runs never touch each other's and a later run can sweep one a killed run left. The name
 * avoids "source"/"marketplace" because specs assert refusals never say those words.
 */
const SHARED_SOURCE_PREFIX = "agents-inc-e2e-shared-fixtures-";
const SHARED_SOURCE_NAME = new RegExp(`^${SHARED_SOURCE_PREFIX}(\\d+)-[A-Za-z0-9]+$`);
const SHARED_SOURCE_ENV = "AGENTS_INC_E2E_SHARED_FIXTURES";

type BuildInto = (dir: string) => Promise<void>;

type SharedSourceOptions = { parent?: string; pid?: number };

export function sharedSourcePath(): string {
  const dir = process.env[SHARED_SOURCE_ENV];
  if (dir === undefined) {
    throw new Error(
      `${SHARED_SOURCE_ENV} is unset: the shared fixtures are published by e2e/global-setup.ts (or the hand-run harness), and this process was not started after either`,
    );
  }
  return dir;
}

/** Any run's folder, recognised by its name, so no spec's cleanup deletes it. */
export function isSharedSource(dir: string): boolean {
  return SHARED_SOURCE_NAME.test(path.basename(path.resolve(dir)));
}

export async function setUpSharedSource(build: BuildInto): Promise<() => Promise<void>> {
  await sweepAbandonedSharedSources(os.tmpdir());
  const dir = await buildSharedSource(build);
  process.env[SHARED_SOURCE_ENV] = dir;

  return () => removeSharedSource(dir);
}

/** Removes any tree a killed run left at `root` first, so a half-built source is never reused. */
export async function buildFrozenSourceTree(root: string, build: BuildInto): Promise<string> {
  await removeFrozenSourceTree(root);
  await mkdir(root, { recursive: true });

  return fillAndFreeze(root, build);
}

export async function removeFrozenSourceTree(root: string): Promise<void> {
  await unfreeze(root);
  await rm(root, { recursive: true, force: true });
}

export async function buildSharedSource(
  build: BuildInto,
  { parent = os.tmpdir(), pid = process.pid }: SharedSourceOptions = {},
): Promise<string> {
  const root = await mkdtemp(path.join(parent, `${SHARED_SOURCE_PREFIX}${pid}-`));

  return fillAndFreeze(root, build);
}

export async function removeSharedSource(dir: string): Promise<void> {
  await removeFrozenSourceTree(dir);
}

export async function sweepAbandonedSharedSources(parent: string): Promise<void> {
  const abandoned = (await readdir(parent)).filter(isAbandonedSharedSource);

  await Promise.all(abandoned.map((name) => removeUnlessAlreadyGone(path.join(parent, name))));
}

function isAbandonedSharedSource(name: string): boolean {
  const owner = SHARED_SOURCE_NAME.exec(name)?.[1];

  return owner !== undefined && !processRunning(Number(owner));
}

/** Signal 0 signals nothing and fails only where no such process is: EPERM is another user's. */
function processRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !failedWith(error, "ESRCH");
  }
}

/** Two runs starting together sweep the same folder; whichever meets the other's removal stops. */
async function removeUnlessAlreadyGone(dir: string): Promise<void> {
  try {
    await removeFrozenSourceTree(dir);
  } catch (error) {
    if (!failedWith(error, "ENOENT")) throw error;
  }
}

function failedWith(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function fillAndFreeze(root: string, build: BuildInto): Promise<string> {
  await build(root);
  await freeze(root);

  return root;
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

  await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? chmodTree(full, dirMode, fileMode) : chmod(full, fileMode);
    }),
  );

  await chmod(dir, dirMode);
}
