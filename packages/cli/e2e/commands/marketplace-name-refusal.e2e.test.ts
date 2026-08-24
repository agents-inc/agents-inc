import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, runCLI } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * The name a `marketplace.json` publishes under is the namespace Claude Code registers
 * every plugin in, and the CLI piggybacks on what Claude Code accepts (owner ruling
 * 2026-08-20). `marketplaceSchema` has held the name to kebab-case since; what this file
 * pins is that the refusal REACHES the person running the command, on the two surfaces
 * that resolve a marketplace without reading a full installation.
 *
 * The discriminating assertion is `doctor`'s own row rather than the warning: a warning
 * about the manifest was printed all along, directly above `Marketplaces ✓ 1 marketplace
 * validated`, and the tick beside it was the defect.
 *
 * Every leg has its accepted-name twin in this same file. A guard scoped to the name and
 * one that has swallowed every manifest leave an all-refusal file reading identically, and
 * the second marketplace here differs from the first in exactly this one field.
 */

/** A name Claude Code registers no plugin under, and the same name written the way it does. */
const NAME_REFUSED = "Acme_Skills";
const NAME_ACCEPTED = "acme-skills";

/** The word the refusal has to reach for, since the rule — not the regex — is the fix. */
const RULE_STATED = "kebab-case";

/** The Marketplaces row's clean verdict, which a refused manifest must not earn. */
const MARKETPLACES_ROW_CLEAN = "marketplace validated";

/** Publishes the fixture marketplace under `name`, replacing whatever manifest it had. */
async function publishUnder(source: E2ESource, name: string): Promise<void> {
  const manifestDir = path.join(source.sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    path.join(manifestDir, FILES.MARKETPLACE_JSON),
    JSON.stringify({
      name,
      version: "1.0.0",
      owner: { name: "E2E Fixture" },
      plugins: [{ name: E2E_SKILL.react.id, source: `./src/skills/${E2E_SKILL.react.id}` }],
    }),
  );
}

describe("a marketplace whose manifest names it something Claude Code cannot register", () => {
  let source: E2ESource;
  let project: { dir: string };
  let projectTempDir: string;

  beforeAll(async () => {
    source = await createE2ESource();
    project = await ProjectBuilder.editable({
      marketplace: source.sourceDir,
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
    });
    projectTempDir = path.dirname(project.dir);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
    await cleanupTempDir(projectTempDir);
  });

  it("is refused by search, which must not answer out of it", async () => {
    await publishUnder(source, NAME_REFUSED);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], project.dir, {
      env: { HOME: project.dir },
    });

    const output = flattenCliOutput(combined);
    expect(
      exitCode,
      "a marketplace nothing can be installed from must not answer a query",
    ).not.toBe(EXIT_CODES.SUCCESS);
    expect(output, "the manifest holding the name must be named").toContain(FILES.MARKETPLACE_JSON);
    expect(output, "the refusal must state the rule, not the regex").toContain(RULE_STATED);
  });

  it("is answered out of by search once the name is one Claude Code accepts", async () => {
    await publishUnder(source, NAME_ACCEPTED);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], project.dir, {
      env: { HOME: project.dir },
    });

    expect(exitCode, "the same marketplace, renamed, loads like any other").toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(flattenCliOutput(combined), "its skills must still be found").toContain(
      E2E_SKILL.react.id,
    );
  });

  it("is reported by doctor as an error rather than counted as validated", async () => {
    await publishUnder(source, NAME_REFUSED);

    const { exitCode, combined } = await runCLI(["doctor"], project.dir, {
      env: { HOME: project.dir },
    });

    const output = flattenCliOutput(combined);
    expect(
      exitCode,
      "doctor must not exit clean over a marketplace it cannot install from",
    ).not.toBe(EXIT_CODES.SUCCESS);
    expect(
      output,
      "the row is the summary a reader trusts — it must not contradict itself",
    ).not.toContain(MARKETPLACES_ROW_CLEAN);
    expect(output, "the manifest holding the name must be named").toContain(FILES.MARKETPLACE_JSON);
    expect(output, "the refusal must state the rule, not the regex").toContain(RULE_STATED);
  });

  it("is counted as validated by doctor once the name is one Claude Code accepts", async () => {
    await publishUnder(source, NAME_ACCEPTED);

    const { combined } = await runCLI(["doctor"], project.dir, { env: { HOME: project.dir } });

    const output = flattenCliOutput(combined);
    expect(output, "a marketplace with a usable name is one doctor validates").toContain(
      MARKETPLACES_ROW_CLEAN,
    );
    expect(output, "nothing may be said about the manifest's name").not.toContain(RULE_STATED);
  });
});
