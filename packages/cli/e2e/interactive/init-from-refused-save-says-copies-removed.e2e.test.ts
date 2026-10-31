import { chmod, mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  listFiles,
  skillsPath,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` at a terminal whose configuration cannot be saved: it has said "Copied 2 skills
 * (1 project, 1 global)", then takes both copies back, so after the error one line says so and
 * nothing follows it. The save is refused by a read-only source folder in the project.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const SEED_ID = "CopiesBk1";

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;
const COPIED = 2;

const copiesRemoved = (count: number) =>
  `${STEP_TEXT.COPIES_REMOVED_PREFIX} ${count} ${STEP_TEXT.COPIES_REMOVED_SUFFIX}`;

// Root writes through the mode bits, so a refused save cannot happen there.
describe.skipIf(process.getuid?.() === 0)("init --from <id> at a terminal: a refused save", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    store.publish(
      SEED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [API_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Exit code, and everything the terminal showed with oclif's wrapping undone. */
  async function installApproved(
    environment: TestEnvironment,
  ): Promise<{ exitCode: number; said: string }> {
    const session = new InteractivePrompt(
      ["init", "--from", SEED_ID, "--marketplace", sourceDir],
      environment.projectDir,
      { env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome } },
    );
    prompt = session;
    await session.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
    expect(
      session.getOutput(),
      "init --from at a terminal must ask before it installs a shared configuration",
    ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
    await session.confirm();
    const exitCode = await session.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, said: compactCliOutput(session.getOutput()) };
  }

  it(
    "says, after the error and as the last thing it says, that it removed the skills it copied",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await createTestEnvironment();
      const sourceFolder = path.join(env.projectDir, DIRS.SOURCE_CLAUDE);
      await mkdir(sourceFolder, { recursive: true });
      await chmod(sourceFolder, READ_ONLY_DIR);

      let run: { exitCode: number; said: string };
      try {
        run = await installApproved(env);
      } finally {
        await chmod(sourceFolder, WRITABLE_DIR);
      }
      const { exitCode, said } = run;

      expect(exitCode, said).toBe(EXIT_CODES.ERROR);
      expect(said, "precondition: the run copied both skills before the save").toContain(
        compactCliOutput(`${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} ${COPIED}`),
      );
      const ending = compactCliOutput(
        [
          STEP_TEXT.GENERATING_CONFIGURATION,
          `${STEP_TEXT.CONFIG_WRITE_REFUSED} '${configTsPath(env.projectDir)}'`,
          copiesRemoved(COPIED),
        ].join("\n"),
      );
      expect(
        said.slice(-ending.length),
        "the error follows the save it refused, and one line saying the copies were removed follows the error",
      ).toBe(ending);
      expect(
        {
          project: await listFiles(skillsPath(env.projectDir)),
          home: await listFiles(skillsPath(env.fakeHome)),
        },
        "the line is true: no copy is left at either root",
      ).toStrictEqual({ project: [], home: [] });
    },
  );

  it(
    "says nothing of removing copies when the configuration is saved",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await createTestEnvironment();

      const { exitCode, said } = await installApproved(env);

      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
      expect(said).toContain(compactCliOutput(STEP_TEXT.INIT_SUCCESS));
      expect(said).not.toContain(compactCliOutput(STEP_TEXT.COPIES_REMOVED_SUFFIX));
      expect({
        project: await listFiles(skillsPath(env.projectDir)),
        home: await listFiles(skillsPath(env.fakeHome)),
      }).toStrictEqual({ project: [E2E_SKILL.react.id], home: [E2E_SKILL.vitest.id] });
    },
  );
});
