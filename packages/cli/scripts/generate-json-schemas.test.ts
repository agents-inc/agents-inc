/**
 * Contract for `scripts/generate-json-schemas.ts` — the writer of every generated file in
 * `src/schemas/`.
 *
 * The check these specs pin is deliberately not the one `generate:schemas:check` used to run.
 * That was `bun run generate:schemas && git diff --exit-code src/schemas/`, which answers "does
 * this differ from what is staged or committed" rather than "is this stale against source", is
 * blind to a path git has never seen, and cannot be run at all by an agent working under the
 * no-write-git rule. So the assertions below name a drifted file, catch a newly emitted path that
 * is not on disk, and reach both verdicts in a directory outside any repository.
 *
 * Testability is part of the contract: the output directory is a parameter, and importing the
 * module must write nothing.
 */
import { cpSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { check, generate } from "./generate-json-schemas.js";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const SCHEMAS_DIR = path.join(CLI_ROOT, "src/schemas");

/** Every file the generator owns, in the order `SCHEMA_ENTRIES` declares them. */
const GENERATED_SCHEMAS = [
  "agent.schema.json",
  "agent-frontmatter.schema.json",
  "hooks.schema.json",
  "marketplace.schema.json",
  "metadata.schema.json",
  "custom-metadata.schema.json",
  "plugin.schema.json",
  "skill-frontmatter.schema.json",
  "stacks.schema.json",
  "stack.schema.json",
];

/** Committed to `src/schemas/` and written by hand — the generator must neither emit nor judge them. */
const HAND_MAINTAINED_SCHEMAS = ["project-config.schema.json", "project-source-config.schema.json"];

const DRIFTED_FILE = "metadata.schema.json";
const DRIFTED_CONTENT = '{ "hand-edited after generation": true }\n';

/** Stands in for a path the generator emits that git has never seen — absent from disk. */
const ABSENT_FILE = "stack.schema.json";

const listFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

const modifiedAt = (filePath: string): bigint => statSync(filePath, { bigint: true }).mtimeNs;

/** A copy of the committed schemas in `os.tmpdir()` — untracked, and outside every repository. */
async function copyCommittedSchemas(prefix: string): Promise<string> {
  const root = await createTempDir(prefix);
  cpSync(SCHEMAS_DIR, root, { recursive: true });
  return root;
}

// -- Module shape ------------------------------------------------------------

describe("generate-json-schemas module", () => {
  it("exports generate and check, and importing it writes nothing", async () => {
    const committedFiles = listFiles(SCHEMAS_DIR).map((name) => path.join(SCHEMAS_DIR, name));
    const modifiedBefore = committedFiles.map(modifiedAt);

    vi.resetModules();
    const reimported = await import("./generate-json-schemas.js");

    expect(typeof reimported.generate).toBe("function");
    expect(typeof reimported.check).toBe("function");
    expect(
      committedFiles.map(modifiedAt),
      "importing the generator must not touch any file in src/schemas",
    ).toStrictEqual(modifiedBefore);
  });
});

// -- Generating against the repository ---------------------------------------

describe("generating into a fresh directory", () => {
  it("emits exactly the schemas it owns, and neither hand-maintained file", async () => {
    const outputRoot = await createTempDir("schemas-generate-");

    const { written } = await generate({ schemasDir: outputRoot });

    expect(written).toStrictEqual(GENERATED_SCHEMAS);
    expect(listFiles(outputRoot)).toStrictEqual([...GENERATED_SCHEMAS].sort());
    for (const name of HAND_MAINTAINED_SCHEMAS) {
      expect(written, `${name} is hand-maintained and must not be emitted`).not.toContain(name);
    }

    await cleanupTempDir(outputRoot);
  });

  it("reproduces every committed schema byte for byte", async () => {
    const outputRoot = await createTempDir("schemas-bytes-");

    const { written } = await generate({ schemasDir: outputRoot });

    for (const name of written) {
      expect(
        readFileSync(path.join(outputRoot, name), "utf-8"),
        `${name} must be identical to the file committed in src/schemas`,
      ).toBe(readFileSync(path.join(SCHEMAS_DIR, name), "utf-8"));
    }

    await cleanupTempDir(outputRoot);
  });
});

// -- Check mode --------------------------------------------------------------

describe("check mode", () => {
  it("reports no drift against the committed schemas", async () => {
    expect(await check({ schemasDir: SCHEMAS_DIR })).toStrictEqual({ clean: true, drifted: [] });
  });

  it("names the drifted file and leaves the tree untouched", async () => {
    const copyRoot = await copyCommittedSchemas("schemas-check-");
    writeFileSync(path.join(copyRoot, DRIFTED_FILE), DRIFTED_CONTENT);
    const filesBefore = listFiles(copyRoot);

    const result = await check({ schemasDir: copyRoot });

    expect(result).toStrictEqual({ clean: false, drifted: [DRIFTED_FILE] });
    expect(
      readFileSync(path.join(copyRoot, DRIFTED_FILE), "utf-8"),
      "check must not rewrite the file it reports as drifted",
    ).toBe(DRIFTED_CONTENT);
    expect(listFiles(copyRoot)).toStrictEqual(filesBefore);

    await cleanupTempDir(copyRoot);
  });

  it("names an emitted path that is not on disk at all", async () => {
    const copyRoot = await copyCommittedSchemas("schemas-absent-");
    unlinkSync(path.join(copyRoot, ABSENT_FILE));

    expect(await check({ schemasDir: copyRoot })).toStrictEqual({
      clean: false,
      drifted: [ABSENT_FILE],
    });

    await cleanupTempDir(copyRoot);
  });

  it("ignores a hand-maintained schema it does not own", async () => {
    const copyRoot = await copyCommittedSchemas("schemas-handmaintained-");
    for (const name of HAND_MAINTAINED_SCHEMAS) {
      writeFileSync(path.join(copyRoot, name), DRIFTED_CONTENT);
    }

    expect(await check({ schemasDir: copyRoot })).toStrictEqual({ clean: true, drifted: [] });

    await cleanupTempDir(copyRoot);
  });

  it("reaches the same verdict in a directory no repository tracks", async () => {
    const copyRoot = await copyCommittedSchemas("schemas-untracked-");

    expect(
      await check({ schemasDir: copyRoot }),
      "identical bytes must produce the committed directory's verdict wherever they sit",
    ).toStrictEqual(await check({ schemasDir: SCHEMAS_DIR }));

    await cleanupTempDir(copyRoot);
  });

  it("reports drift in a directory no repository tracks", async () => {
    const copyRoot = await copyCommittedSchemas("schemas-untracked-drift-");
    writeFileSync(path.join(copyRoot, DRIFTED_FILE), DRIFTED_CONTENT);

    expect(
      await check({ schemasDir: copyRoot }),
      "the verdict must come from the bytes, not from what a diff can see",
    ).toStrictEqual({ clean: false, drifted: [DRIFTED_FILE] });

    await cleanupTempDir(copyRoot);
  });
});
