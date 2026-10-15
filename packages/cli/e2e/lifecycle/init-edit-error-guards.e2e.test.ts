import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/** The `source-fetcher` message for a marketplace path that is not a directory. */
const LOCAL_MARKETPLACE_NOT_FOUND = "Local marketplace not found:";
/** The two paths these guards name, so the message is proved to be ABOUT them. */
const MISSING_INIT_SOURCE_PATH = "/tmp/not-a-real-source-path-xyz";
const MISSING_EDIT_SOURCE_PATH = "/nonexistent/path/xyz";

/** The id every `--from` run here fetches; what it names never matters, as no run reaches it. */
const CONFIG_ID = "Guards01";

/** The three spellings of the flag, each driven through the binary. */
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
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(CONFIG_ID, e2eStackPayload());
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it.each(MARKETPLACE_FLAG_SPELLINGS)(
    "init --from reaches the named marketplace through the %s",
    { timeout: TIMEOUTS.INSTALL },
    async (_name, argv) => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--from", CONFIG_ID, ...argv],
        projectDir,
        { env: { HOME: tempDir, AGENTS_INC_API_URL: store.url } },
      );

      // Naming the path back is the proof the flag reached the loader: a spelling that
      // did not would fall through to the configuration's own marketplace.
      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(flattenCliOutput(combined)).toContain(LOCAL_MARKETPLACE_NOT_FOUND);
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
      expect(flattenCliOutput(combined)).not.toContain(LOCAL_MARKETPLACE_NOT_FOUND);
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
   * source: `edit --from` takes no `--marketplace`, so the path it fails on is the one its own
   * config records — the install whose marketplace has since been moved or deleted.
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
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.react.id),
          contentHash: "hash-edit-err",
        }),
      });

      // `edit --from` applies destructively, so it runs only at a terminal.
      prompt = new InteractivePrompt(["edit", "--from", CONFIG_ID], projectDir, {
        env: { HOME: tempDir, AGENTS_INC_API_URL: store.url },
      });
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      const combined = prompt.getOutput();

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      // Same reasoning as the init guard above: name the failure, not its length.
      expect(flattenCliOutput(combined)).toContain(LOCAL_MARKETPLACE_NOT_FOUND);
      expect(flattenCliOutput(combined).replace(/ /g, "")).toContain(MISSING_EDIT_SOURCE_PATH);
    },
  );
});
