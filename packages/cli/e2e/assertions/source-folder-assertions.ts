import path from "path";
import { expect } from "vitest";

import { directoryExists } from "../helpers/test-utils.js";
import { DIRS } from "../pages/constants.js";

// The parent is listed too: an emptied `.agents-inc/` left behind is still a source folder.
const SOURCE_FOLDER_NAMES = [DIRS.SOURCE_ROOT, DIRS.SOURCE_CLAUDE];

async function sourceFoldersUnder(dir: string): Promise<string[]> {
  const present = await Promise.all(
    SOURCE_FOLDER_NAMES.map(async (name) =>
      (await directoryExists(path.join(dir, name))) ? name : null,
    ),
  );

  return present.filter((name) => name !== null);
}

export async function expectNoSourceFolder(dir: string, reason: string): Promise<void> {
  expect(await sourceFoldersUnder(dir), `${reason} — found instead under ${dir}`).toStrictEqual([]);
}

// Asserts the whole roster, so a third folder cannot slip past; `expected` is in roster order.
export async function expectOnlySourceFolder(
  dir: string,
  expected: readonly string[],
  reason: string,
): Promise<void> {
  expect(await sourceFoldersUnder(dir), `${reason} — under ${dir}`).toStrictEqual([...expected]);
}
