import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIST_DIR = path.join(CLI_ROOT, "dist");
const SRC_AGENTS_DIR = path.join(CLI_ROOT, "src", "agents");
const DIST_AGENTS_DIR = path.join(DIST_DIR, "src", "agents");
const WHOLE_TREE = "**";

// The published package includes dist/ wholesale via the `files` field, so
// anything compiled into dist ships to every user. The tsup entry globs read
// whole directories, and this repository keeps its tests beside the code they
// cover — sixteen compiled test files shipped in 0.150.0 and every release
// before it because nothing asserted they must not.
//
// This used to carry `describe.skipIf(!existsSync(DIST_DIR))`, for the case of
// a bare `vitest run` before anything was ever built — failing that run on a
// missing build reports the wrong problem. vitest.global-setup.ts now reports
// the right one, and it does so from globalSetup, which runs before a single
// spec is collected: with dist/ moved aside, this file does not reach the skip,
// it does not reach collection at all. The run ends on "dist/ does not exist"
// and never prints a test count. So the condition could no longer be false when
// the describe body was reached, and a skip nobody can observe reads as a
// suite that has an excuse rather than one that always runs.
describe("published package contents", () => {
  it("compiles no test files into dist", async () => {
    const compiledTests = await fg(["**/*.test.js", "**/*.test.js.map", "**/*.test.d.ts"], {
      cwd: DIST_DIR,
    });

    expect(compiledTests.sort(), "dist must hold no compiled tests — they ship").toStrictEqual([]);
  });

  // The agent partials reach dist through a copy in tsup's onSuccess, and `fs.copy`
  // merges: it never removes a destination entry the source has dropped. A retired
  // agent therefore survived every incremental build and could publish, because
  // dist/ ships wholesale — and E2E builds the dist it then runs against, so the
  // stale directory was invisible to every other gate. Set equality, not a subset:
  // a subset assertion passes on precisely this failure mode.
  it("mirrors src/agents into dist instead of merging into it", async () => {
    const distEntries = await fg(WHOLE_TREE, {
      cwd: DIST_AGENTS_DIR,
      dot: true,
      onlyFiles: false,
    });
    const srcEntries = await fg(WHOLE_TREE, { cwd: SRC_AGENTS_DIR, dot: true, onlyFiles: false });

    expect(
      distEntries.sort(),
      "dist/src/agents must be a mirror of src/agents — a deleted agent that survives here ships",
    ).toStrictEqual(srcEntries.sort());
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
