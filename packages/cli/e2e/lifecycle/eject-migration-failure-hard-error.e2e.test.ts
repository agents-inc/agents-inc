import path from "path";
import { chmod, rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  readTestFile,
  skillsPath,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { foundByName } from "../helpers/found-by-name.js";
import { pathHoldingOnly } from "../helpers/path-holding-only.js";
import { E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * The eject half of plugin-install-failure-hard-error. The lever is a read-only directory, a no-op
 * under root.
 */

/** Denies the write bit while leaving the directory readable and traversable. */
const READ_ONLY_DIR = 0o555;
/** The mode a fixture directory is built with, restored so cleanup can remove the tree. */
const WRITABLE_DIR = 0o755;

/** The binary `claudePluginUninstall` spawns by name, which the case below must not find. */
const CLAUDE_BINARY = "claude";

const REACT_EJECTED_ID = "EjctFal1";

describe("an eject migration that could not do its work must not report success", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let lockedDirs: string[] = [];
  let nodeLinkRoot: string;
  /**
   * PATH with node and system bins but no `claude`, so `claudePluginUninstall` fails with ENOENT.
   * `node` is linked into its own dir because its install dir often holds `claude` too.
   */
  let pathWithoutClaude: string;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(
      REACT_EJECTED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
          }),
        },
        agents: { [E2E_AGENT["web-developer"].name]: { scope: "project" } },
      }),
    );
    nodeLinkRoot = await createTempDir();
    const nodeAlone = await pathHoldingOnly({ root: nodeLinkRoot }, ["node"]);
    pathWithoutClaude = [nodeAlone, "/usr/bin", "/bin"].join(path.delimiter);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
    await cleanupTempDir(nodeLinkRoot);
  });

  afterEach(async () => {
    for (const dir of lockedDirs) {
      await chmod(dir, WRITABLE_DIR);
    }
    lockedDirs = [];
  });

  /**
   * A real plugin install has no `.claude/skills/` copy. Left in place, that copy is the eject
   * destination, so the migration writes nothing and the spec is vacuous.
   */
  async function pluginInstallWithNoLocalCopy(): Promise<{ dir: string }> {
    const project = await ProjectBuilder.pluginProject({
      skills: [E2E_SKILL.react.id],
      marketplace: source.sourceDir,
      marketplaceName: E2E_MARKETPLACE_NAME,
      agents: [...E2E_AGENTS.WEB],
      domains: ["web"],
    });
    await rm(path.join(skillsPath(project.dir), E2E_SKILL.react.id), { recursive: true });
    return project;
  }

  /** Ejects the one skill under a HOME holding no installation, so the run is a project one. */
  function switchToLocal(
    project: { dir: string },
    env?: Record<string, string>,
  ): Promise<{ exitCode: number; output: string }> {
    const site = { dir: project.dir, globalHome: path.dirname(project.dir) };
    return applyEditFrom(store, REACT_EJECTED_ID, site, env);
  }

  it(
    "exits non-zero and writes no eject origin when the destination skills directory is unwritable",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();
      const configPath = configTsPath(project.dir);
      const configBefore = await readTestFile(configPath);

      const destination = skillsPath(project.dir);
      await chmod(destination, READ_ONLY_DIR);
      lockedDirs.push(destination);

      const result = await switchToLocal(project);

      expect(result.exitCode, result.output).toBe(EXIT_CODES.ERROR);

      const output = result.output;
      expect(output).toContain("Eject intent could not be honored");
      expect(output).toContain(E2E_SKILL.react.id);

      // A fix that errors but still writes would leave config.ts claiming a missing copy.
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: E2E_MARKETPLACE_NAME,
      });
      expect(await readTestFile(configPath)).toStrictEqual(configBefore);
      await expect(project).not.toHaveSkillCopied(E2E_SKILL.react.id);
    },
  );

  it(
    "exits non-zero when the config directory is unwritable at the config write",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();

      const configDir = sourceFolderIn(project.dir);
      await chmod(configTsPath(project.dir), READ_ONLY_DIR);
      await chmod(configDir, READ_ONLY_DIR);
      lockedDirs.push(configDir, configTsPath(project.dir));

      const result = await switchToLocal(project);

      expect(result.exitCode, result.output).toBe(EXIT_CODES.ERROR);
      expect(result.output).toContain("Could not update config");

      // Proof the run reached the config write rather than failing earlier.
      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
    },
  );

  it(
    "reports a failed plugin uninstall as an uninstall, not as a failed copy",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();
      expect(
        await foundByName(CLAUDE_BINARY, pathWithoutClaude),
        "the PATH this edit is handed finds a claude, so its uninstall can fail for a reason other than a missing binary",
      ).toBe("");

      const result = await switchToLocal(project, { PATH: pathWithoutClaude });

      // The copy is the work; the uninstall is diagnostic-only, so the run still succeeds.
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      const output = result.output;
      // Subject guard: the copy pass ran and reported its count.
      expect(output).toContain(
        `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX}`,
      );
      expect(output).toContain("Could not uninstall plugin for");
      expect(output).toContain(E2E_SKILL.react.id);
      expect(output).not.toContain("Could not copy skills for eject");

      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect(project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: "eject",
      });
    },
  );
});
