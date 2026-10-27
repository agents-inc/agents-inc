import path from "path";
import { readFile, writeFile } from "fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * A marketplace's own documents choose the keys and values doctor quotes back when it refuses them,
 * so a line break in one must not start a line that reads as doctor's.
 */

/** On a line of its own it reads as doctor's verdict; folded into the quote, it is the author's. */
const FORGED_LINE = "Marketplace verified.";

/** Anchored, so it matches the sentence only where it begins a line, at any indent. */
const FORGED_LINE_OF_ITS_OWN = /^\s*Marketplace verified\./m;

async function rewriteReactMetadata(
  source: E2ESource,
  change: (metadata: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const metadataPath = path.join(
    source.sourceDir,
    SOURCE_PATHS.SKILLS_DIR,
    E2E_SKILL.react.id,
    FILES.METADATA_YAML,
  );
  const metadata: Record<string, unknown> = parseYaml(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, stringifyYaml(change(metadata)));
}

describe("doctor in a marketplace repository quoting what its documents wrote", () => {
  let source: E2ESource | undefined;

  afterEach(async () => {
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
  });

  it(
    "names a key the document wrote across lines on the one line",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource();
      await rewriteReactMetadata(source, (metadata) => ({
        ...metadata,
        [`homepage\n${FORGED_LINE}`]: "https://example.com",
      }));

      const { exitCode, stdout, output } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode, stdout).toBe(EXIT_CODES.ERROR);
      // Ends on the line break, so the whole key is shown to sit inside the one line.
      expect(stdout).toContain(`Unrecognized key: "homepage ${FORGED_LINE}"\n`);
      // Both streams: a line printed to stderr reads as doctor's just the same.
      expect(
        output,
        "the sentence the key carried must not stand as a line of doctor's own",
      ).not.toMatch(FORGED_LINE_OF_ITS_OWN);
    },
  );

  it("names an honest unrecognised key in full", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // The permitted case: a fold that dropped the key, or the line, would fail here.
    source = await createE2ESource();
    await rewriteReactMetadata(source, (metadata) => ({
      ...metadata,
      homepage: "https://example.com",
    }));

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

    expect(exitCode, stdout).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain('Unrecognized key: "homepage"\n');
  });

  it(
    "quotes a slug the document wrote across lines on the one line",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource();
      await rewriteReactMetadata(source, (metadata) => ({
        ...metadata,
        slug: `react\n${FORGED_LINE}`,
      }));

      const { exitCode, stdout, output } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode, stdout).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(
        `slug: 'react ${FORGED_LINE}' is not a slug the public catalogue carries`,
      );
      expect(
        output,
        "the sentence the slug carried must not stand as a line of doctor's own",
      ).not.toMatch(FORGED_LINE_OF_ITS_OWN);
    },
  );

  it("quotes an honest unknown slug in full", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // The permitted case: the refusal still names the slug the author wrote.
    source = await createE2ESource();
    await rewriteReactMetadata(source, (metadata) => ({ ...metadata, slug: "reakt" }));

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

    expect(exitCode, stdout).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("slug: 'reakt' is not a slug the public catalogue carries");
  });
});
