import { chmod, mkdir, readdir, rm, stat } from "fs/promises";
import os from "os";
import path from "path";

/**
 * The one E2E source every spec that does not mutate one shares, built once per run and FROZEN.
 *
 * Building a source costs 3ms; building the marketplace on top of it costs ~1.65s, and 51 call
 * sites were paying that separately — about 84 seconds a run. One build, shared, costs it once.
 *
 * ## Why it is read-only, and why that is not paranoia
 *
 * A shared fixture that one spec mutates is a fixture every LATER spec sees mutated, and the
 * damage does not surface where it was done: the mutating spec passes, and something unrelated
 * fails a hundred files later with an assertion about content nobody in that file wrote. Under
 * `pool: "forks"` and a worker cap of up to sixteen, which spec sees the mutation also depends on
 * scheduling, so the failure moves between runs. That is the worst shape a test failure can take,
 * and it is the whole reason a shared fixture is normally a bad idea.
 *
 * `chmod -R a-w` converts that entire class into an immediate, local, deterministic error: the
 * mutating write fails with `EACCES` at the line that made it, in the spec that owns it, on every
 * run and every machine. **The freeze is not protecting the fixture — it is protecting the
 * diagnosis.**
 *
 * A spec that genuinely needs to write into its source says so with `createE2ESource({ owned: true })`
 * and gets its own writable copy. Three do today, all of them building a marketplace or rewriting
 * `package.json`: `commands/build`, `commands/plugin-build-versioning` and
 * `commands/marketplace-author-arc`.
 *
 * ## Why a fixed path rather than a mktemp one
 *
 * `globalSetup` runs in vitest's own process and the specs run in forked workers, so the location
 * has to be something both can compute without passing it. It is derived, not random, and the
 * teardown removes it — and because the tree is frozen, teardown has to unfreeze before it can.
 *
 * ## Why the name spells neither "source" nor "marketplace"
 *
 * The same constraint `createE2ESource` documents over its own `fixture/` segment: a refusal names
 * the path it could not resolve, and specs assert the CLI's user-facing prose has withdrawn both
 * nouns (`/\bsources?\b/i`). A negative running over the whole message cannot tell the product's
 * wording from the fixture's directory name. This directory was `agents-inc-e2e-shared-source`
 * while only plugin-mode specs sat on it and no such negative reached it; it was renamed when the
 * plain source moved here too, rather than left as a trap for the first spec that does.
 */
const SHARED_SOURCE_DIR = path.join(os.tmpdir(), "agents-inc-e2e-shared-fixtures");

/** Where the shared source lives. Computable from both the setup process and a worker. */
export function sharedSourcePath(): string {
  return SHARED_SOURCE_DIR;
}

/** Whether a path is the shared source, so cleanup can refuse to delete what it does not own. */
export function isSharedSource(dir: string): boolean {
  return path.resolve(dir) === path.resolve(SHARED_SOURCE_DIR);
}

/**
 * Builds the shared source and freezes it. Called once, from `globalSetup`.
 *
 * Idempotent by removal rather than by detection: a directory left behind by a killed run holds a
 * half-built source, and reusing it would seat every spec on a fixture nobody can describe.
 */
export async function buildSharedSource(build: (dir: string) => Promise<void>): Promise<string> {
  await unfreeze();
  await rm(SHARED_SOURCE_DIR, { recursive: true, force: true });
  await mkdir(SHARED_SOURCE_DIR, { recursive: true });

  await build(SHARED_SOURCE_DIR);

  await freeze();

  return SHARED_SOURCE_DIR;
}

/** Removes the shared source. Unfreezes first, because a frozen tree refuses its own deletion. */
export async function removeSharedSource(): Promise<void> {
  await unfreeze();
  await rm(SHARED_SOURCE_DIR, { recursive: true, force: true });
}

/** Inlined rather than imported: this module is loaded by `globalSetup`, before anything else. */
async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function freeze(): Promise<void> {
  await chmodTree(SHARED_SOURCE_DIR, 0o555, 0o444);
}

async function unfreeze(): Promise<void> {
  if (!(await isDirectory(SHARED_SOURCE_DIR))) return;

  await chmodTree(SHARED_SOURCE_DIR, 0o755, 0o644);
}

/**
 * Applies one mode to directories and another to files, depth-first.
 *
 * Depth-first on the way OUT matters when freezing: a directory made read-only cannot have its own
 * children changed afterwards, so the children go first and the parent last. Unfreezing is the
 * same walk and works for the same reason in reverse — the parent is already writable on the way
 * in, because it was frozen last.
 */
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
