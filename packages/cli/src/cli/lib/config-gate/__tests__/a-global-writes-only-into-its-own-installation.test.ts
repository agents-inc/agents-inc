/**
 * A global installation rewrites the registered projects of its OWN provider, and its writer
 * refuses a pair aimed anywhere else.
 *
 * Step C2 of `todo/plans/CLI-codex-provider-plan.md` asks for two things here, and they are not
 * the same guard:
 *
 * - *"a Claude global never propagates into a Codex project"* — a POLICY, applied per registered
 *   project inside the fan-out. `globalConfig.projects[]` is a list of directories with nothing
 *   in it saying which installation each one belongs to, and the two providers' installations
 *   register in their own global config — so a project on the other provider is a different
 *   installation that happens to be reachable, and rewriting its pair from this global's data is
 *   the cross-installation write the folders exist to prevent.
 * - *"the runtime assertion fires when the path is forced wrong"* — an ASSERTION, inside the
 *   single writer both the fan-out and the wizard write go through. The plan states why it cannot
 *   be a compile-time proof: propagation resolves its destination from a config-derived STRING,
 *   so deleting `DEFAULT_PROVIDER` found every typed caller and none of these.
 *
 * **The assertion was a tautology until this file existed, and that is what this file is written
 * against.** `refuseAWriteOutsideTheInstallation` derived both sides of its comparison from one
 * `providerInUse(projectDir)` call: the config path it checked was built by joining `config.ts`
 * onto the very source folder it checked the path against, so the comparison was
 * `join(folder, "config.ts").startsWith(folder)` and could not fail for any disk state whatever.
 * A guard that cannot fail is worse than none — it reads as coverage. So the writer now takes the
 * provider the CALLER believes it is writing, and the assertion holds that belief against what
 * the installation on disk actually IS.
 *
 * **Refused and allowed sit in one file, per guard.** A refusal pinned alone cannot tell a
 * correctly-scoped guard from one that has swallowed its domain: a writer that threw for every
 * provider and a fan-out that skipped every project both leave the disk byte-identical and both
 * satisfy every negative assertion below.
 *
 * The folder names are literals throughout — text on people's disks, and an assertion importing
 * the constant the product joins would move with it and could never fail.
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
import { buildSkillConfig } from "../../__tests__/helpers/wizard-simulation.js";
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

  // Registered AFTER the hook that creates the directory, because hooks run in registration
  // order and this one reads it. HOME is read by the code under test rather than only by the
  // fixtures: the fan-out loads each registered project's own catalogue, and that load merges
  // the global local skills under `os.homedir()`.
  useFakeHome(() => tempDir);

  /**
   * A directory carrying a real config in `folder`, named by the same normalization the registrar
   * applies — `registerProjectPath` drops a registration whose config file is gone, so a bare
   * `mkdir` would be filtered out of `projects[]` before any assertion could see it.
   */
  async function plantProject(name: string, folder: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await plantConfigIn(dir, folder, name);
    return realpath(dir);
  }

  /** A second installation in the same root, so one directory holds a folder of each provider. */
  async function plantConfigIn(dir: string, folder: string, name: string): Promise<void> {
    await writeTestTsConfig(dir, buildProjectConfig({ name }), folder);
  }

  /** The global installation's own configuration, registering the projects it fans out to. */
  function installedGlobal(projects: string[]): ProjectConfig {
    return buildProjectConfig({
      name: "global-install",
      skills: [buildSkillConfig(REACT, { scope: "global" })],
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      projects,
    });
  }

  /** The project's own half, as the writer is handed it. */
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
    /**
     * **A root holding BOTH folders, because a single-provider project proves nothing here.** The
     * fan-out already skips a project whose config file for THIS provider is absent, so a Claude
     * project asked about as Codex is skipped by `fileExists` and the assertion reads as green
     * whether the provider policy exists or not. With both installations in one root, the other
     * provider's `config.ts` is there to be overwritten — and that overwrite, a global's data
     * reconciled into a different installation's file, is the thing the folders exist to prevent.
     */
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
        skipped: result.skipped,
        after: {
          codex: await readFile(codexConfigPath, "utf-8"),
          claude: await readFile(claudeConfigPath, "utf-8"),
        },
      }).toStrictEqual({ updated: [], skipped: [project], after: before });
    });

    /**
     * The arm where the registered project's own folder is REFUSED, and the reason the answer is
     * a skip rather than a throw: `providerInUse` refuses a root whose installation this release
     * has no host for, and that refusal used to be raised outside the fan-out's own `try` — so
     * one unactionable registration aborted the whole fan-out and took every other registered
     * project with it. The Claude project beside it is what makes that visible.
     */
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
        skipped: result.skipped,
        codexConfig: await readFile(codexConfigPath, "utf-8"),
      }).toStrictEqual({
        updated: [claudeProject],
        skipped: [codexProject],
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
      ).toStrictEqual({ updated: [first, second], skipped: [] });
    });
  });
});
