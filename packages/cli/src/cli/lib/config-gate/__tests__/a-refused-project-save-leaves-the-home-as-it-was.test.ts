/**
 * A project save refused at the project's own pair leaves the home as it was: a global pair the
 * write made for a home with none goes, with the folders it made for it, and what the home already
 * held stays. Folder names are literals so the assertions cannot move with the product's constants.
 */

import path from "path";
import { chmod, mkdir, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfig } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { readTestTsConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { readInstallTree } from "../../__tests__/helpers/golden-tree.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { matrix } from "../../matrix/matrix-provider.js";
import { writeConfigByScope } from "../index.js";

const CODEX_SOURCE_REL = ".agents-inc/codex";
/** The fake home's shared marketplace checkout, a symlink no write here touches. */
const SHARED_CACHE_REL = ".cache";

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const WEB_DEVELOPER = "web-developer";
const API_DEVELOPER = "api-developer";

const NO_AGENTS = {};

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;

/** A sub-agent and a skill of the project's own, so the project's pair is owed and written first. */
const PROJECT_OWN_SESSION: ProjectConfig = buildProjectConfig({
  name: "project",
  skills: [buildSkillConfig(VITEST, { scope: "project" })],
  agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
});

// Root writes through the mode bits, so a refused save cannot happen there.
describe.skipIf(process.getuid?.() === 0)(
  "writeConfigByScope from a project that refuses its own pair",
  () => {
    let tempDir: string;
    let project: string;

    beforeEach(async () => {
      tempDir = await createTempDir("cc-refused-project-save-");
      const dir = path.join(tempDir, "project");
      await mkdir(dir, { recursive: true });
      project = await realpath(dir);
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    // After the hook that creates the directory: hooks run in order, and the code under test reads HOME.
    const home = useFakeHome(() => tempDir);

    const homeTree = () => readInstallTree(home.dir, { skip: [SHARED_CACHE_REL] });

    function writeFromProject() {
      return writeConfigByScope({
        finalConfig: PROJECT_OWN_SESSION,
        matrix,
        agents: NO_AGENTS,
        projectDir: project,
        projectConfigPath: getProjectConfigPath(project, "claude"),
        projectInstallationExists: true,
      });
    }

    async function writeRefusedByTheProject(): Promise<void> {
      const projectConfigPath = getProjectConfigPath(project, "claude");
      const sourceFolder = path.dirname(projectConfigPath);
      await mkdir(sourceFolder, { recursive: true });
      await chmod(sourceFolder, READ_ONLY_DIR);
      try {
        await expect(
          writeFromProject(),
          "precondition: the write is refused at the project's own config",
        ).rejects.toThrow(projectConfigPath);
      } finally {
        await chmod(sourceFolder, WRITABLE_DIR);
      }
    }

    it("takes back the blank global pair it made, and the folders it made for it, in a home with no global install", async () => {
      const before = await homeTree();

      await writeRefusedByTheProject();

      expect(
        await homeTree(),
        "the home is as it was: no blank global config, no types beside it and no folder made for them",
      ).toStrictEqual(before);
    });

    it("keeps the folder it found when the home holds only the other provider's global install", async () => {
      await writeTestTsConfig(
        home.dir,
        buildProjectConfig({ name: "codex-global" }),
        CODEX_SOURCE_REL,
      );
      const before = await homeTree();

      await writeRefusedByTheProject();

      expect(
        await homeTree(),
        "the Codex install and the folder holding it stay, and no Claude folder is left beside it",
      ).toStrictEqual(before);
    });

    it("keeps the global pair the home already held", async () => {
      await writeTestTsConfig(
        home.dir,
        buildProjectConfig({
          name: "global-install",
          skills: [buildSkillConfig(REACT, { scope: "global" })],
          agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        }),
      );
      const before = await homeTree();

      await writeRefusedByTheProject();

      expect(
        await homeTree(),
        "a global config the run found is no blank one it made, so it stays byte for byte",
      ).toStrictEqual(before);
    });

    it("keeps the global pair it made in a home with no global install when the project's pair is saved", async () => {
      await writeFromProject();

      const { projects } = await readTestTsConfig<ProjectConfig>(
        getProjectConfigPath(home.dir, "claude"),
      );
      expect(
        projects,
        "a saved project keeps the global config made for it, which registers the project",
      ).toStrictEqual([project]);
    });
  },
);
