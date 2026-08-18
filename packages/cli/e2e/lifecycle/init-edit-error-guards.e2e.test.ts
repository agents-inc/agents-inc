import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { flattenCliOutput } from "../fixtures/seed-config-store.js";

/** The `source-fetcher` message for a marketplace path that is not a directory. */
const LOCAL_SOURCE_NOT_FOUND = "Local marketplace not found:";
/** The two paths these guards name, so the message is proved to be ABOUT them. */
const MISSING_INIT_SOURCE_PATH = "/tmp/not-a-real-source-path-xyz";
const MISSING_EDIT_SOURCE_PATH = "/nonexistent/path/xyz";

/**
 * The three spellings the init hook's raw-argv scan answers to. oclif has not parsed
 * anything when that scan runs, so the flag's name is written a second time there and
 * nothing checks the two definitions against each other — which is why all three forms
 * are driven through the binary rather than one standing in for the others.
 */
const MARKETPLACE_FLAG_SPELLINGS = [
  ["separate argument", ["--marketplace", MISSING_INIT_SOURCE_PATH]],
  ["equals form", [`--marketplace=${MISSING_INIT_SOURCE_PATH}`]],
  ["short form", ["-m", MISSING_INIT_SOURCE_PATH]],
] as const satisfies readonly (readonly [string, readonly string[]])[];

/**
 * Error guard E2E tests for init, compile, and edit commands.
 *
 * Covers: invalid source flag handling, missing skills directory,
 * empty skills config, and edit with nonexistent source path.
 */

describe("init/edit error guards", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /**
   * The guard fires BEFORE the wizard mounts, which is the only reason this spec
   * can assert it at all: `runCLI` has no PTY, so anything after the render dies
   * on Ink's `Raw mode is not supported on the current process.stdin` and every
   * message the run would have printed is lost behind that stack trace.
   */
  it(
    "init with invalid source flag should error gracefully",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--marketplace", MISSING_INIT_SOURCE_PATH],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      // The loader names the path it could not find. `combined.length > 0` stood
      // here and was satisfied by any output at all, including a different error.
      expect(flattenCliOutput(combined)).toContain(LOCAL_SOURCE_NOT_FOUND);
      expect(combined).toContain(MISSING_INIT_SOURCE_PATH);
    },
  );

  it.each(MARKETPLACE_FLAG_SPELLINGS)(
    "init reaches the named marketplace through the %s",
    { timeout: TIMEOUTS.INSTALL },
    async (_name, argv) => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(["init", ...argv], projectDir, {
        env: { HOME: tempDir },
      });

      // Naming the path back is the proof the scan read it: a spelling the scan does
      // not answer to falls through to the default marketplace and this run would
      // reach a wizard instead of a refusal about this path.
      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(flattenCliOutput(combined)).toContain(LOCAL_SOURCE_NOT_FOUND);
      expect(combined).toContain(MISSING_INIT_SOURCE_PATH);
    },
  );

  it(
    "init refuses the withdrawn --source spelling before it reaches a marketplace",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--source", MISSING_INIT_SOURCE_PATH],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
      expect(
        flattenCliOutput(combined),
        "the parser refuses the name, so the loader is never handed the path",
      ).toContain("Nonexistent flag: --source");
      expect(flattenCliOutput(combined)).not.toContain(LOCAL_SOURCE_NOT_FOUND);
    },
  );

  it(
    "compile with missing skills directory should error",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Create config referencing a skill, but do NOT create .claude/skills/
      await writeProjectConfig(projectDir, {
        name: "test-missing-skills",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      // Create .claude/ directory without skills/ subdirectory
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: tempDir },
      });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.NO_SKILLS_FOUND);
    },
  );

  it(
    "compile with empty config skills array should handle gracefully",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // A content-less config (no skills, no agents) is not a real installation,
      // so compile fails gracefully with a not-installed error.
      await writeProjectConfig(projectDir, {
        name: "test-empty-skills",
        skills: [],
        agents: [],
      });

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: tempDir },
      });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.NO_INSTALLATION);
    },
  );

  /**
   * Same guard, same load path, reached through the command that CANNOT be pointed at a
   * source: `edit` takes no `--marketplace`, so the path it fails on is the one its own config
   * records — the install whose marketplace has since been moved or deleted.
   */
  it(
    "edit whose stored source no longer exists should error",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Create a minimal installation so detectProject() succeeds
      await writeProjectConfig(projectDir, {
        name: "test-edit-bad-source",
        marketplace: MISSING_EDIT_SOURCE_PATH,
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "Minimal skill for edit error test",
        metadata: renderMetadataYaml({ contentHash: "hash-edit-err" }),
      });

      const { exitCode, combined } = await runCLI(["edit"], projectDir, {
        env: { HOME: tempDir },
      });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      // Same reasoning as the init guard above: name the failure, not its length.
      expect(flattenCliOutput(combined)).toContain(LOCAL_SOURCE_NOT_FOUND);
      expect(combined).toContain(MISSING_EDIT_SOURCE_PATH);
    },
  );
});
