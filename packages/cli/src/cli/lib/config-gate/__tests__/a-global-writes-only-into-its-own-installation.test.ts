/**
 * A global rewrites only its own provider's registered projects (a policy), and its writer refuses
 * a pair aimed elsewhere (an assertion). Refused and allowed cases sit together; folder names are
 * literals so the assertions cannot move with the product's constants.
 */

import path from "path";
import { readFile, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfig } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { matrix } from "../../matrix/matrix-provider.js";
import { propagateGlobalChangesToProjects, writeProjectConfigPair } from "../propagate.js";

/** The new layout, per provider, as it is written on disk and shown to a user. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

const REACT = "web-framework-react";
const WEB_DEVELOPER = "web-developer";

/** No agent definitions: nothing below reads a compiled body, and the fan-out takes the map. */
const NO_AGENTS = {};

describe("a global installation writes only into its own", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-writes-stay-in-one-installation-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // After the hook that creates the directory (hooks run in order); the code under test reads HOME.
  useFakeHome(() => tempDir);

  /** A real config, since `registerProjectPath` drops a registration whose config is gone. */
  async function plantProject(name: string, folder: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await plantConfigIn(dir, folder, name);
    return realpath(dir);
  }

  /** A second installation in the same root, so one directory holds a folder of each provider. */
  async function plantConfigIn(dir: string, folder: string, name: string): Promise<void> {
    await writeTestTsConfig(dir, buildProjectConfig({ name }), folder);
  }

  function installedGlobal(projects: string[]): ProjectConfig {
    return buildProjectConfig({
      name: "global-install",
      skills: [buildSkillConfig(REACT, { scope: "global" })],
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      projects,
    });
  }

  function projectSplit(name: string): ProjectConfig {
    return buildProjectConfig({ name, skills: [], agents: [] });
  }

  describe("the assertion inside the single writer", () => {
    it("refuses a pair the caller aims at a provider the directory does not hold", async () => {
      const project = await plantProject("claude-project", CLAUDE_SOURCE_REL);

      await expect(
        writeProjectConfigPair(
          project,
          "codex",
          projectSplit("claude-project"),
          installedGlobal([project]),
          matrix,
          NO_AGENTS,
          { regenerateTypes: false },
        ),
        "the caller's belief and the installation on disk are two independent reads, and a writer that cannot tell them apart writes into whichever folder it was handed",
      ).rejects.toThrow(CODEX_SOURCE_REL);
    });

    it("writes the pair when the caller names the installation that is there", async () => {
      const project = await plantProject("claude-project", CLAUDE_SOURCE_REL);

      await writeProjectConfigPair(
        project,
        "claude",
        projectSplit("claude-project"),
        installedGlobal([project]),
        matrix,
        NO_AGENTS,
        { regenerateTypes: false },
      );

      expect(
        await readFile(getProjectConfigPath(project, "claude"), "utf-8"),
        "the permitted case is what says the refusal above is scoped — a writer that threw for every provider satisfies it and writes nothing at all",
      ).toContain(REACT);
    });
  });

  describe("the policy inside the fan-out", () => {
    /** Both folders in one root: a single-provider project is skipped by `fileExists`. */
    it("leaves the other installation in a root that holds two byte-identical", async () => {
      const project = await plantProject("two-installations", CLAUDE_SOURCE_REL);
      await plantConfigIn(project, CODEX_SOURCE_REL, "two-installations");
      const codexConfigPath = getProjectConfigPath(project, "codex");
      const claudeConfigPath = getProjectConfigPath(project, "claude");
      const before = {
        codex: await readFile(codexConfigPath, "utf-8"),
        claude: await readFile(claudeConfigPath, "utf-8"),
      };

      const result = await propagateGlobalChangesToProjects(
        installedGlobal([project]),
        NO_AGENTS,
        "codex",
      );

      expect({
        updated: result.updated,
        notOurs: result.notOurs,
        after: {
          codex: await readFile(codexConfigPath, "utf-8"),
          claude: await readFile(claudeConfigPath, "utf-8"),
        },
      }).toStrictEqual({ updated: [], notOurs: [project], after: before });
    });

    /** A skip, not a throw: one unactionable registration must not abort the whole fan-out. */
    it("skips a registered project this release cannot act on, and keeps going", async () => {
      const claudeProject = await plantProject("claude-project", CLAUDE_SOURCE_REL);
      const codexProject = await plantProject("codex-project", CODEX_SOURCE_REL);
      const codexConfigPath = getProjectConfigPath(codexProject, "codex");
      const before = await readFile(codexConfigPath, "utf-8");

      const result = await propagateGlobalChangesToProjects(
        installedGlobal([claudeProject, codexProject]),
        NO_AGENTS,
        "claude",
      );

      expect({
        updated: result.updated,
        notOurs: result.notOurs,
        codexConfig: await readFile(codexConfigPath, "utf-8"),
      }).toStrictEqual({
        updated: [claudeProject],
        notOurs: [codexProject],
        codexConfig: before,
      });
    });

    it("reaches every registered project of its own provider", async () => {
      const first = await plantProject("first", CLAUDE_SOURCE_REL);
      const second = await plantProject("second", CLAUDE_SOURCE_REL);

      const result = await propagateGlobalChangesToProjects(
        installedGlobal([first, second]),
        NO_AGENTS,
        "claude",
      );

      expect(
        result,
        "without this, a fan-out that skipped everything would satisfy both skips above and rewrite nothing on the machine",
      ).toStrictEqual({
        updated: [first, second],
        unreadable: [],
        gone: [],
        notOurs: [],
        failed: [],
      });
    });

    /** An empty folder reads as a new installation's provider, so the policy alone misjudges it. */
    it.each(["claude", "codex"] as const)(
      "reports a registered folder holding nothing as gone to a %s global",
      async (provider) => {
        const deleted = path.join(tempDir, "deleted-project");

        const result = await propagateGlobalChangesToProjects(
          installedGlobal([deleted]),
          NO_AGENTS,
          provider,
        );

        expect(result).toStrictEqual({
          updated: [],
          unreadable: [],
          gone: [deleted],
          notOurs: [],
          failed: [],
        });
      },
    );
  });
});
