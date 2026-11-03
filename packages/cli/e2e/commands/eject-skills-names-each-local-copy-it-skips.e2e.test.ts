import path from "path";
import { appendFile, mkdir, rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  createTempDir,
  directoryExists,
  flattenCliOutput,
  listFiles,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import "../matchers/setup.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * A skill with a local copy outside the folder `eject skills` writes to is left out, with or
 * without --force. Each one is named with the folder its copy is in, in the same words whether
 * that copy is in a project or in the global installation.
 */
describe("eject skills names each skill it leaves at a local copy elsewhere", () => {
  const KEPT = E2E_SKILL.react.id;
  const NOT_KEPT = E2E_SKILL_IDS.filter((id) => id !== KEPT);

  let sourceDir: string;
  let e2eSourceTempDir: string;
  let tempDir: string | undefined;
  let home: ProjectHandle;
  let project: ProjectHandle;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
  });

  afterAll(async () => {
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  function localCopyKept(skillId: string, copyDir: string): string {
    return `Warning: ${STEP_TEXT.EJECT_LOCAL_COPY_KEPT_PREFIX} ${skillId}: ${STEP_TEXT.EJECT_LOCAL_COPY_KEPT_AT} ${copyDir} ${STEP_TEXT.EJECT_LOCAL_COPY_KEPT_SUFFIX}`;
  }

  /** A global installation reading the fixture marketplace, and a config-less project beside it. */
  async function globalInstallationAndProject(): Promise<void> {
    tempDir = await createTempDir();
    const homeDir = path.join(tempDir, "home");
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    await writeProjectConfig(
      homeDir,
      buildProjectConfig({
        name: "global-install",
        marketplace: sourceDir,
        skills: [],
        agents: [],
      }),
    );
    home = { dir: homeDir, globalHome: homeDir };
    project = { dir: projectDir, globalHome: homeDir };
  }

  /** Ejects every skill into `at`'s skills folder, then deletes all but the `kept` ones. */
  async function ejectKeeping(at: ProjectHandle, kept: readonly string[]): Promise<void> {
    const ejected = await CLI.run(["eject", "skills"], at);
    expect(ejected.exitCode, flattenCliOutput(ejected.output)).toBe(EXIT_CODES.SUCCESS);
    await Promise.all(
      E2E_SKILL_IDS.filter((id) => !kept.includes(id)).map((id) =>
        rm(path.join(skillsPath(at.dir), id), { recursive: true }),
      ),
    );
  }

  it("in a project, ejects every other skill and names the one the global installation holds a copy of", async () => {
    await globalInstallationAndProject();
    await ejectKeeping(home, [KEPT]);
    const homeBefore = await readTreeSnapshot(home.dir);

    const { exitCode, stdout, stderr, output } = await CLI.run(["eject", "skills"], project);

    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(localCopyKept(KEPT, path.join(skillsPath(home.dir), KEPT))),
    );
    expect(stdout).toContain(
      `${NOT_KEPT.length} skills ejected to ${skillsPath(project.dir)} from ${sourceDir}\n`,
    );
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect((await listFiles(skillsPath(project.dir))).sort()).toStrictEqual(NOT_KEPT);
    await expect(project).toHaveConfig({ marketplace: sourceDir });
    expect(await readTreeSnapshot(home.dir)).toStrictEqual(homeBefore);
  });

  it("in a project, names every skill when the global installation holds a copy of each, rather than saying the marketplace has none", async () => {
    await globalInstallationAndProject();
    await ejectKeeping(home, E2E_SKILL_IDS);
    const homeBefore = await readTreeSnapshot(home.dir);

    const { exitCode, stdout, stderr, output } = await CLI.run(["eject", "skills"], project);

    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(
        E2E_SKILL_IDS.map((id) => localCopyKept(id, path.join(skillsPath(home.dir), id))).join(
          "\n",
        ),
      ),
    );
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(await directoryExists(skillsPath(project.dir))).toBe(false);
    await expect(project).toHaveConfig({ marketplace: sourceDir });
    expect(await readTreeSnapshot(home.dir)).toStrictEqual(homeBefore);
  });

  it("in a project, leaves the global installation's copy as it is with --force, still naming it", async () => {
    await globalInstallationAndProject();
    await ejectKeeping(home, [KEPT]);
    await appendFile(
      path.join(skillsPath(home.dir), KEPT, FILES.SKILL_MD),
      "\nthe user's own edit to an ejected skill\n",
    );
    const homeBefore = await readTreeSnapshot(home.dir);

    const { exitCode, stdout, stderr, output } = await CLI.run(
      ["eject", "skills", "--force"],
      project,
    );

    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(localCopyKept(KEPT, path.join(skillsPath(home.dir), KEPT))),
    );
    expect(stdout).toContain(
      `${NOT_KEPT.length} skills ejected to ${skillsPath(project.dir)} from ${sourceDir}\n`,
    );
    expect((await listFiles(skillsPath(project.dir))).sort()).toStrictEqual(NOT_KEPT);
    expect(await readTreeSnapshot(home.dir)).toStrictEqual(homeBefore);
  });

  it("in a project, names a skill the project holds a copy of in the same words, when ejecting into another folder", async () => {
    await globalInstallationAndProject();
    await ejectKeeping(project, [KEPT]);
    const outputDir = path.join(project.dir, "ejected");
    const configBefore = await readTestFile(configTsPath(project.dir));
    const projectSkillsBefore = await readTreeSnapshot(skillsPath(project.dir));

    const { exitCode, stdout, stderr, output } = await CLI.run(
      ["eject", "skills", "-o", outputDir],
      project,
    );

    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(
        [
          STEP_TEXT.DECLARES_NOTHING_EJECT,
          localCopyKept(KEPT, path.join(skillsPath(project.dir), KEPT)),
        ].join("\n"),
      ),
    );
    expect(stdout).toContain(
      `${NOT_KEPT.length} skills ejected to ${outputDir} from ${sourceDir}\n`,
    );
    expect((await listFiles(outputDir)).sort()).toStrictEqual(NOT_KEPT);
    expect(await readTreeSnapshot(skillsPath(project.dir))).toStrictEqual(projectSkillsBefore);
    expect(await readTestFile(configTsPath(project.dir))).toBe(configBefore);
  });

  it("in the global installation, names a skill it holds a copy of in the same words, when ejecting into another folder", async () => {
    await globalInstallationAndProject();
    await ejectKeeping(home, [KEPT]);
    const outputDir = path.join(project.dir, "ejected");
    const configBefore = await readTestFile(configTsPath(home.dir));
    const homeSkillsBefore = await readTreeSnapshot(skillsPath(home.dir));

    const { exitCode, stdout, stderr, output } = await CLI.run(
      ["eject", "skills", "-o", outputDir],
      home,
    );

    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(localCopyKept(KEPT, path.join(skillsPath(home.dir), KEPT))),
    );
    expect(stdout).toContain(
      `${NOT_KEPT.length} skills ejected to ${outputDir} from ${sourceDir}\n`,
    );
    expect((await listFiles(outputDir)).sort()).toStrictEqual(NOT_KEPT);
    expect(await readTreeSnapshot(skillsPath(home.dir))).toStrictEqual(homeSkillsBefore);
    expect(await readTestFile(configTsPath(home.dir))).toBe(configBefore);
  });
});
