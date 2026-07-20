import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  cleanupTempDir,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";
import type { SkillId } from "../../src/cli/types/index.js";

/**
 * One installed skill whose metadata.yaml is syntactically broken must not
 * disable commands that read the local skill catalog. Local skill discovery
 * parses each installed metadata.yaml; a parse throw there escapes the whole
 * matrix load instead of being scoped to the one bad skill.
 */

/** Skills installed into the fixture project. Only the second one is corrupted. */
const HEALTHY_SKILL: SkillId = "web-framework-react";
const BROKEN_SKILL: SkillId = "web-testing-vitest";

/** Unparseable YAML: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

async function createProjectWithOneBrokenMetadata(): Promise<{
  projectDir: string;
  tempDir: string;
  brokenMetadataPath: string;
}> {
  const project = await ProjectBuilder.editable({
    skills: [HEALTHY_SKILL, BROKEN_SKILL],
    agents: ["web-developer"],
  });

  const brokenMetadataPath = path.join(skillsPath(project.dir), BROKEN_SKILL, FILES.METADATA_YAML);
  await writeFile(brokenMetadataPath, UNPARSEABLE_YAML);

  return {
    projectDir: project.dir,
    tempDir: path.dirname(project.dir),
    brokenMetadataPath,
  };
}

describe("installed skill with unparseable metadata.yaml", () => {
  let tempDir: string;
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  });

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("search and doctor both succeed while every metadata.yaml is parseable", async () => {
    const project = await ProjectBuilder.editable({
      skills: [HEALTHY_SKILL, BROKEN_SKILL],
      agents: ["web-developer"],
    });
    tempDir = path.dirname(project.dir);

    const searchResult = await CLI.run(
      ["search", "react"],
      { dir: project.dir },
      { env: { CC_SOURCE: source.sourceDir } },
    );
    expect(searchResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(searchResult.output).toContain(HEALTHY_SKILL);

    const doctorResult = await CLI.run(
      ["doctor"],
      { dir: project.dir },
      { env: { CC_SOURCE: source.sourceDir } },
    );
    expect(doctorResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(doctorResult.stdout).toContain("Connected to local:");
  });

  it("search still returns catalog results and names the offending skill", async () => {
    const project = await createProjectWithOneBrokenMetadata();
    tempDir = project.tempDir;

    const configBefore = await loadConfigOrFail(project.projectDir);
    const skillDirsBefore = await listFiles(skillsPath(project.projectDir));
    const brokenMetadataBefore = await readTestFile(project.brokenMetadataPath);

    const { exitCode, output } = await CLI.run(
      ["search", "react"],
      { dir: project.projectDir },
      { env: { CC_SOURCE: source.sourceDir } },
    );

    expect(exitCode, "one bad installed metadata.yaml must not abort search").toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(output, "the rest of the catalog must still be searchable").toContain(HEALTHY_SKILL);
    expect(output, "the offending skill must be named").toContain(BROKEN_SKILL);
    expect(output, "the offending file must be named").toContain(FILES.METADATA_YAML);

    // search is read-only: config and filesystem must be byte-identical after.
    expect(await loadConfigOrFail(project.projectDir)).toStrictEqual(configBefore);
    expect(await listFiles(skillsPath(project.projectDir))).toStrictEqual(skillDirsBefore);
    expect(await readTestFile(project.brokenMetadataPath)).toBe(brokenMetadataBefore);
  });

  it("doctor blames the skill, not the source", async () => {
    const project = await createProjectWithOneBrokenMetadata();
    tempDir = project.tempDir;

    const configBefore = await loadConfigOrFail(project.projectDir);
    const skillDirsBefore = await listFiles(skillsPath(project.projectDir));

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: project.projectDir },
      { env: { CC_SOURCE: source.sourceDir } },
    );

    expect(stdout, "a corrupt local skill is not a source failure").not.toContain(
      "Failed to load source",
    );
    expect(stdout, "the skills diagnostic must not be disabled").not.toContain(
      "Skipped (source unreachable)",
    );
    expect(stdout, "the configured source is reachable").toContain("Connected to local:");
    expect(exitCode, "one bad installed metadata.yaml must not fail doctor").toBe(
      EXIT_CODES.SUCCESS,
    );

    // doctor is read-only: config and filesystem must be byte-identical after.
    expect(await loadConfigOrFail(project.projectDir)).toStrictEqual(configBefore);
    expect(await listFiles(skillsPath(project.projectDir))).toStrictEqual(skillDirsBefore);
  });
});
