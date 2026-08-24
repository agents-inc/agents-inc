import path from "path";
import { writeFile } from "fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * An installed skill whose `metadata.yaml` exists but cannot be read is a hard
 * error under `compile`: the command exits naming WHICH skill is wrong and HOW
 * (the file and the parse reason), and writes nothing.
 *
 * The state it replaces: one pass loaded what the other skipped. `compile`'s
 * skill discovery only checked that `metadata.yaml` EXISTS, so it loaded the
 * skill from its `SKILL.md` frontmatter and compiled agents around it, while the
 * `config-types.ts` regeneration pass in the same run read the file, failed, and
 * skipped the same skill — one run printing `Loaded skill: X` and
 * `Skipping local skill 'X'` about the same file, exiting 0.
 *
 * `search` and `doctor` on the same corrupt file are pinned by
 * `local-skill-invalid-metadata-yaml.e2e.test.ts`: `search` stays usable and
 * names the skill, `doctor` reports it as a content error. This file is
 * `compile`'s half of that contract.
 */

/** Installed into the fixture project. Only the second one gets corrupted. */
const HEALTHY_SKILL: string = E2E_SKILL.react.id;
const BROKEN_SKILL: string = E2E_SKILL.vitest.id;

/** Unparseable YAML: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

/** A single token of the `yaml` parser's own reason, safe from output wrapping. */
const PARSE_REASON_TOKEN = "mappings";

type Fixture = {
  projectDir: string;
  tempDir: string;
  brokenMetadataPath: string;
};

async function seedInstalledProject(): Promise<Fixture> {
  const project = await ProjectBuilder.editable({
    skills: [HEALTHY_SKILL, BROKEN_SKILL],
    agents: ["web-developer"],
  });

  return {
    projectDir: project.dir,
    tempDir: path.dirname(project.dir),
    brokenMetadataPath: path.join(skillsPath(project.dir), BROKEN_SKILL, FILES.METADATA_YAML),
  };
}

describe("compile with an unreadable skill metadata.yaml", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("hard-errors naming the skill, the file and the parse reason", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const clean = await runCLI(["compile"], fixture.projectDir);
    expect(clean.exitCode, `the fixture must compile before it is broken:\n${clean.combined}`).toBe(
      EXIT_CODES.SUCCESS,
    );

    await writeFile(fixture.brokenMetadataPath, UNPARSEABLE_YAML);

    const { exitCode, combined } = await runCLI(["compile"], fixture.projectDir);

    expect(exitCode, `compile must refuse an unreadable metadata.yaml:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(combined, "the offending skill must be named").toContain(BROKEN_SKILL);
    expect(combined, "the offending file must be named").toContain(fixture.brokenMetadataPath);
    // Flattened, not shortened: oclif wraps the refusal at the terminal width and
    // prefixes each continuation with ` ›  `, so this sentence straddles a line break.
    // A shorter fragment would move the brittleness rather than remove it — it would
    // also pass on a message that had been truncated.
    expect(
      flattenCliOutput(combined),
      "the refusal must say what is wrong with the file",
    ).toContain(STEP_TEXT.COMPILE_METADATA_UNUSABLE);
    expect(combined, "the parser's own reason must reach the user").toContain(PARSE_REASON_TOKEN);
    expect(combined, "a refused compile must not claim completion").not.toContain(
      STEP_TEXT.COMPILE_COMPLETE,
    );
  });

  it("writes no agents and touches nothing on disk when a metadata.yaml is unreadable", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const clean = await runCLI(["compile"], fixture.projectDir);
    expect(clean.exitCode).toBe(EXIT_CODES.SUCCESS);

    await writeFile(fixture.brokenMetadataPath, UNPARSEABLE_YAML);

    const agentsBefore = await readCompiledAgents(fixture.projectDir);
    const treeBefore = await readTreeSnapshot(agentsPath(fixture.projectDir));
    const configBefore = await readTestFile(configTsPath(fixture.projectDir));
    expect(
      Object.keys(agentsBefore),
      "the clean compile must have written the agents this spec claims are left alone",
    ).toStrictEqual(["web-developer.md"]);

    const { exitCode } = await runCLI(["compile"], fixture.projectDir);
    expect(exitCode).toBe(EXIT_CODES.ERROR);

    expect(
      await readTreeSnapshot(agentsPath(fixture.projectDir)),
      "a refused compile must not rewrite a single agent file",
    ).toStrictEqual(treeBefore);
    expect(await readTestFile(configTsPath(fixture.projectDir))).toBe(configBefore);
    expect(
      await readTestFile(fixture.brokenMetadataPath),
      "compile must not rewrite the file it refused",
    ).toBe(UNPARSEABLE_YAML);
  });

  it("compiles again once the metadata.yaml is readable", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const metadataBefore = await readTestFile(fixture.brokenMetadataPath);
    await writeFile(fixture.brokenMetadataPath, UNPARSEABLE_YAML);

    const refused = await runCLI(["compile"], fixture.projectDir);
    expect(refused.exitCode).toBe(EXIT_CODES.ERROR);

    await writeFile(fixture.brokenMetadataPath, metadataBefore);

    const { exitCode, combined } = await runCLI(["compile"], fixture.projectDir);

    expect(exitCode, `a repaired metadata.yaml must compile:\n${combined}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(combined).toContain(STEP_TEXT.COMPILE_COMPLETE);
    expect(Object.keys(await readCompiledAgents(fixture.projectDir))).toStrictEqual([
      "web-developer.md",
    ]);
  });
});
