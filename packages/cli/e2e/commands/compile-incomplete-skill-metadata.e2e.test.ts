import path from "path";
import { writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  renderIncompleteMetadataYaml,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { metadataFieldsFor, ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * A metadata.yaml missing a required field is a hard `compile` error naming the skill and field;
 * nothing is written.
 */

const HEALTHY_SKILL: string = E2E_SKILL.react.id;
const INCOMPLETE_SKILL: string = E2E_SKILL.vitest.id;

const OMITTED_FIELD = "category";

type Fixture = {
  projectDir: string;
  tempDir: string;
  metadataPath: string;
};

async function seedInstalledProject(): Promise<Fixture> {
  const project = await ProjectBuilder.editable({
    skills: [HEALTHY_SKILL, INCOMPLETE_SKILL],
    agents: ["web-developer"],
  });

  return {
    projectDir: project.dir,
    tempDir: path.dirname(project.dir),
    metadataPath: path.join(skillsPath(project.dir), INCOMPLETE_SKILL, FILES.METADATA_YAML),
  };
}

async function stripRequiredField(fixture: Fixture): Promise<void> {
  await writeFile(
    fixture.metadataPath,
    renderIncompleteMetadataYaml(
      { ...metadataFieldsFor(INCOMPLETE_SKILL), contentHash: "b2c3d4e" },
      [OMITTED_FIELD],
    ),
  );
}

describe("compile with an incomplete skill metadata.yaml", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("hard-errors naming the skill and the field its metadata.yaml leaves out", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const clean = await runCLI(["compile"], fixture.projectDir);
    expect(
      clean.exitCode,
      `the fixture must compile before a field is taken away:\n${clean.combined}`,
    ).toBe(EXIT_CODES.SUCCESS);

    await stripRequiredField(fixture);

    const { exitCode, combined } = await runCLI(["compile"], fixture.projectDir);

    expect(exitCode, `compile must refuse an incomplete metadata.yaml:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(combined, "the offending skill must be named").toContain(INCOMPLETE_SKILL);
    expect(combined, "the offending file must be named").toContain(fixture.metadataPath);
    // Flattened, not shortened: oclif wraps with ` › `, and a shorter fragment would also pass on a
    // truncated message.
    expect(
      flattenCliOutput(combined),
      "the refusal must say what is wrong with the file",
    ).toContain(STEP_TEXT.COMPILE_METADATA_UNUSABLE);
    expect(combined, "the refusal must say the file is missing a field").toContain(
      STEP_TEXT.COMPILE_METADATA_MISSING_FIELD,
    );
    expect(combined, "the missing field must be named").toContain(OMITTED_FIELD);
    expect(combined, "a refused compile must not claim completion").not.toContain(
      STEP_TEXT.COMPILE_COMPLETE,
    );
  });

  it("writes no agents and touches nothing on disk when a metadata.yaml is incomplete", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const clean = await runCLI(["compile"], fixture.projectDir);
    expect(clean.exitCode).toBe(EXIT_CODES.SUCCESS);

    await stripRequiredField(fixture);

    const agentsBefore = await readCompiledAgents(fixture.projectDir);
    const treeBefore = await readTreeSnapshot(agentsPath(fixture.projectDir));
    const configBefore = await readTestFile(configTsPath(fixture.projectDir));
    const metadataBefore = await readTestFile(fixture.metadataPath);
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
      await readTestFile(fixture.metadataPath),
      "compile must not rewrite the file it refused",
    ).toBe(metadataBefore);
  });

  it("compiles again once the missing field is restored", async () => {
    const fixture = await seedInstalledProject();
    tempDir = fixture.tempDir;

    const metadataBefore = await readTestFile(fixture.metadataPath);
    await stripRequiredField(fixture);

    const refused = await runCLI(["compile"], fixture.projectDir);
    expect(refused.exitCode).toBe(EXIT_CODES.ERROR);

    await writeFile(fixture.metadataPath, metadataBefore);

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
