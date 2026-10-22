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

const LOCAL_MARKETPLACE_NOT_FOUND = "Local marketplace not found:";
/** Named back in the message, proving it is about them. */
const MISSING_INIT_SOURCE_PATH = "/tmp/not-a-real-source-path-xyz";
const MISSING_EDIT_SOURCE_PATH = "/nonexistent/path/xyz";

/** No run reaches it, so what it names never matters. */
const CONFIG_ID = "Guards01";

const MARKETPLACE_FLAG_SPELLINGS = [
  ["separate argument", ["--marketplace", MISSING_INIT_SOURCE_PATH]],
  ["equals form", [`--marketplace=${MISSING_INIT_SOURCE_PATH}`]],
  ["short form", ["-m", MISSING_INIT_SOURCE_PATH]],
] as const satisfies readonly (readonly [string, readonly string[]])[];

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

      // Naming the path back proves the flag reached the loader.
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

      await writeProjectConfig(projectDir, {
        name: "test-missing-skills",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

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

  /** `edit --from` takes no `--marketplace`, so it fails on the path its own config records. */
  it(
    "edit whose stored source no longer exists should error",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

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
      expect(flattenCliOutput(combined)).toContain(LOCAL_MARKETPLACE_NOT_FOUND);
      expect(flattenCliOutput(combined).replace(/ /g, "")).toContain(MISSING_EDIT_SOURCE_PATH);
    },
  );
});
