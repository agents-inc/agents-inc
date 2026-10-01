import path from "path";
import { expect } from "vitest";

import { directoryExists } from "../helpers/test-utils.js";
import { DIRS } from "../pages/constants.js";

/**
 * "No source folder here", asserted so it can still fail once the folder has two names.
 *
 * Three shapes of assertion in this suite claimed that and stopped being able to, and the rename
 * is what exposed all three at once:
 *
 *   - `expect(await listFiles(dir)).not.toContain(DIRS.CLAUDE_SRC)` — `listFiles` is a top-level
 *     `readdir`, so it answers `.agents-inc`, never `.agents-inc/claude`. A two-segment name can
 *     never appear in that list and the assertion is true for every directory on the machine.
 *   - `expect(await directoryExists(path.join(dir, DIRS.CLAUDE_SRC))).toBe(false)` — true of every
 *     install created after the flip, whatever it left behind under the other name.
 *   - either of those after an uninstall — both stay green with an emptied `.agents-inc/` sitting
 *     where the install was, which is a directory naming this product with nothing in it.
 *
 * So the question is asked of every name a source folder is spelled in, the PARENT included, and
 * the failure names which one was found rather than reporting a boolean. Both spellings come from
 * `e2e/pages/constants.ts`, the one place this tree mirrors the product's path vocabulary.
 */
const SOURCE_FOLDER_NAMES = [DIRS.CLAUDE_SRC, DIRS.SOURCE_ROOT, DIRS.SOURCE_CLAUDE];

/** Every source-folder name present under `dir`, in roster order. */
async function sourceFoldersUnder(dir: string): Promise<string[]> {
  const present = await Promise.all(
    SOURCE_FOLDER_NAMES.map(async (name) =>
      (await directoryExists(path.join(dir, name))) ? name : null,
    ),
  );

  return present.filter((name) => name !== null);
}

/**
 * Refuses a source folder under `dir` by any of its names.
 *
 * `reason` is the caller's own sentence about why nothing should be there — "init --from wrote
 * into the project it was pointed at, not this one", "uninstall removed everything it made" — and
 * it is what the failure leads with, because "a directory exists" says nothing about which
 * promise was broken.
 */
export async function expectNoSourceFolder(dir: string, reason: string): Promise<void> {
  expect(await sourceFoldersUnder(dir), `${reason} — found instead under ${dir}`).toStrictEqual([]);
}

/**
 * Pins WHICH source-folder names are under `dir`, and refuses every other one.
 *
 * The counterpart of {@link expectNoSourceFolder} for a directory that is MEANT to hold one. Two
 * `directoryExists` calls — one asserting the name that should be there, one the name that should
 * not — are the shape it replaces, and they cannot see a THIRD name appearing: an install that
 * grew a second folder beside its first satisfies both and reads as clean. Asserting the roster
 * fails on any name the caller did not list, and the failure prints what was actually found.
 *
 * `expected` is in {@link SOURCE_FOLDER_NAMES} order, which is the order the roster comes back in.
 * The parent counts as one of the names: an install on the new layout holds `.agents-inc` AND
 * `.agents-inc/claude`, and a scope whose provider folder has been uninstalled from under a kept
 * parent holds the parent alone.
 */
export async function expectOnlySourceFolder(
  dir: string,
  expected: readonly string[],
  reason: string,
): Promise<void> {
  expect(await sourceFoldersUnder(dir), `${reason} — under ${dir}`).toStrictEqual([...expected]);
}
