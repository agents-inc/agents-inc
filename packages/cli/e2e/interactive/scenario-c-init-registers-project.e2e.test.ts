import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { initGlobalWithEject, initProject } from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
} from "../helpers/test-utils.js";

/**
 * `cc init` registers each project's realpath in the global config's `projects`
 * array via `registerProjectPath` (the project-context branch of
 * `writeScopedFromWizard`). Because `detectInstallation` falls back to the global
 * HOME install, once a global install exists every subsequent project init is
 * driven through the dashboard -> Edit path; both paths reach
 * `registerProjectPath`. Two projects under the same HOME must both be
 * registered, each exactly once, with neither overwriting the other.
 *
 * Global HOME install itself is NOT self-registered — only project-context
 * installs append to `projects`. Each project edit toggles a skill + agent to
 * project scope so the write path runs a genuine change (an unchanged edit
 * short-circuits before `registerProjectPath`).
 */

describe("cc init registers each project exactly once in the global projects array", () => {
  let tempDir: string;
  let fakeHome: string;
  let project1: string;
  let project2: string;

  let projectsAfterGlobalInit: string[] | undefined;
  let projectsAfterFirst: string[] | undefined;
  let projectsAfterSecond: string[] | undefined;
  let globalExit: number;
  let firstExit: number;
  let secondExit: number;

  beforeAll(async () => {
    await ensureBinaryExists();

    tempDir = await createTempDir();
    fakeHome = path.join(tempDir, "home");
    project1 = path.join(fakeHome, "project-1");
    project2 = path.join(fakeHome, "project-2");
    for (const dir of [fakeHome, project1, project2]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Phase A: global install at HOME (eject). Populates the global config so
    // subsequent project edits have skills to keep at global scope.
    const globalRes = await initGlobalWithEject(E2E_SOURCE, fakeHome);
    globalExit = globalRes.exitCode;
    const afterGlobal = await loadConfigOrFail(fakeHome);
    projectsAfterGlobalInit = afterGlobal.projects;

    // Phase B: project-1 via dashboard -> Edit, toggling a skill + agent to
    // project scope (a genuine change that drives the registration write).
    const firstRes = await initProject(E2E_SOURCE, fakeHome, project1);
    firstExit = firstRes.exitCode;
    const afterFirst = await loadConfigOrFail(fakeHome);
    projectsAfterFirst = afterFirst.projects;

    // Phase C: project-2 via dashboard -> Edit, same genuine change.
    const secondRes = await initProject(E2E_SOURCE, fakeHome, project2);
    secondExit = secondRes.exitCode;
    const afterSecond = await loadConfigOrFail(fakeHome);
    projectsAfterSecond = afterSecond.projects;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("all three installs complete successfully", () => {
    expect(globalExit).toBe(EXIT_CODES.SUCCESS);
    expect(firstExit).toBe(EXIT_CODES.SUCCESS);
    expect(secondExit).toBe(EXIT_CODES.SUCCESS);
  });

  it("does not self-register the global HOME install", () => {
    // `toBeUndefined`, not `?? []` against `[]`. The fallback made the two states
    // indistinguishable, and they are not the same claim: a global install writes no
    // `projects` KEY at all, where `[]` would mean it wrote one and left it empty.
    expect(projectsAfterGlobalInit).toBeUndefined();
  });

  it("registers the first project exactly once", () => {
    expect(projectsAfterFirst).toStrictEqual([realpathSync(project1)]);
  });

  it("appends the second project without dropping or duplicating the first", () => {
    expect(projectsAfterSecond).toStrictEqual([realpathSync(project1), realpathSync(project2)]);
  });
});
