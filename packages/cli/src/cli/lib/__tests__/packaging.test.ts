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

// dist/ ships wholesale, and tests live beside the code they cover.
describe("published package contents", () => {
  it("compiles no test files into dist", async () => {
    const compiledTests = await fg(["**/*.test.js", "**/*.test.js.map", "**/*.test.d.ts"], {
      cwd: DIST_DIR,
    });

    expect(compiledTests.sort(), "dist must hold no compiled tests — they ship").toStrictEqual([]);
  });

  // `fs.copy` merges, so a retired agent's partials would survive. Set equality, not a subset.
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
