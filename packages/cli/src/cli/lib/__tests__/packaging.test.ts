import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIST_DIR = path.join(CLI_ROOT, "dist");

// The published package includes dist/ wholesale via the `files` field, so
// anything compiled into dist ships to every user. The tsup entry globs read
// whole directories, and this repository keeps its tests beside the code they
// cover — sixteen compiled test files shipped in 0.150.0 and every release
// before it because nothing asserted they must not.
//
// Skipped when dist/ is absent: `turbo test` builds first (turbo.json declares
// test dependsOn build), so in any full run dist exists. A bare `vitest run`
// before ever building is the only path here, and failing that run on a
// missing build would report the wrong problem.
describe.skipIf(!existsSync(DIST_DIR))("published package contents", () => {
  it("compiles no test files into dist", async () => {
    const compiledTests = await fg(["**/*.test.js", "**/*.test.js.map", "**/*.test.d.ts"], {
      cwd: DIST_DIR,
    });

    expect(compiledTests.sort(), "dist must hold no compiled tests — they ship").toStrictEqual([]);
  });

  it("names only paths that exist in the files field", async () => {
    const pkg = JSON.parse(await readFile(path.join(CLI_ROOT, "package.json"), "utf8")) as {
      files: string[];
    };

    for (const entry of pkg.files) {
      expect(existsSync(path.join(CLI_ROOT, entry)), `files entry does not exist: ${entry}`).toBe(
        true,
      );
    }
  });
});
