import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const MOCKS_DIR = "__mocks__";
const MANUAL_MOCK_GLOB = `src/cli/**/${MOCKS_DIR}/*.ts`;

/** Named, not counted, so a new manual mock arrives here deliberately. */
const MANUAL_MOCKS = ["src/cli/utils/__mocks__/fs.ts", "src/cli/utils/__mocks__/logger.ts"];

/** Keep empty: an omitted export is `undefined` in code under test and reads as a product bug. */
const DELIBERATELY_ABSENT: Record<string, readonly string[]> = {};

function realModuleFor(mockPath: string): string {
  return mockPath.replace(`/${MOCKS_DIR}/`, "/");
}

/** Read off the module itself, so no restated list can drift. Types are erased at runtime. */
async function exportsOf(modulePath: string): Promise<string[]> {
  // Parse boundary: a dynamic import of a computed specifier carries no static type.
  const module = (await import(pathToFileURL(path.join(CLI_ROOT, modulePath)).href)) as Record<
    string,
    unknown
  >;
  return Object.keys(module).sort();
}

describe("a manual mock mirrors its module's export list", () => {
  it("names every manual mock the tree holds", async () => {
    const found = await fg(MANUAL_MOCK_GLOB, { cwd: CLI_ROOT });

    expect(
      found.sort(),
      "a manual mock nothing measures is exactly the one that goes partial — add it to MANUAL_MOCKS",
    ).toStrictEqual(MANUAL_MOCKS);
  });

  it.each(MANUAL_MOCKS)("%s exports what its module exports", async (mockPath) => {
    const realPath = realModuleFor(mockPath);
    const omitted = DELIBERATELY_ABSENT[mockPath] ?? [];

    const mocked = await exportsOf(mockPath);
    const real = (await exportsOf(realPath)).filter((name) => !omitted.includes(name));

    expect(
      real,
      `${realPath} exports nothing — the parity below would hold for a mock exporting nothing either`,
    ).not.toStrictEqual([]);
    expect(
      mocked,
      `${mockPath} does not mirror ${realPath}: a spy it leaves out arrives at the call site as undefined, and the TypeError is raised inside the code under test`,
    ).toStrictEqual(real);
  });
});
