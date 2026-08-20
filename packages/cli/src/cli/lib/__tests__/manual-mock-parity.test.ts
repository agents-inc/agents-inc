import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Where vitest looks for a manual mock: a directory of this name beside the module it stands in for. */
const MOCKS_DIR = "__mocks__";
const MANUAL_MOCK_GLOB = `src/cli/**/${MOCKS_DIR}/*.ts`;

/**
 * Every manual mock the tree holds, named rather than counted so a new one arrives here
 * deliberately and is measured from its first day.
 *
 * A mock is not simply smaller than its module when it is partial — it TEACHES. A spec that
 * needed an export the mock lacked wrote its own inline `vi.mock` factory, and the next one
 * copied that, because from inside a spec that works there is nothing to explain. The absence
 * survived in the one place nobody greps.
 */
const MANUAL_MOCKS = ["src/cli/utils/__mocks__/fs.ts", "src/cli/utils/__mocks__/logger.ts"];

/**
 * Exports a manual mock leaves out on purpose, keyed by the mock's path, each entry standing as
 * the reason it is missing rather than an oversight.
 *
 * Empty, and that is the state to keep it in: an omission means every spec taking the mock gets
 * `undefined` where it expected a function, and the TypeError is raised inside the code under
 * test where it reads as a product defect. An entry here has to be worth that.
 */
const DELIBERATELY_ABSENT: Record<string, readonly string[]> = {};

/** The module a manual mock stands in for: the same filename, one directory up. */
function realModuleFor(mockPath: string): string {
  return mockPath.replace(`/${MOCKS_DIR}/`, "/");
}

/**
 * The value exports a module has at runtime, read off the module itself rather than off a list
 * restated here — a second copy of either side would agree with itself whichever way the module
 * moved. Types are absent by construction: they are erased before there is a namespace to read.
 */
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
