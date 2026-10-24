import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  codexProjectSkillsDir,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  fileExists,
  flattenCliOutput,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  DIRS,
  doctorRow,
  EXIT_CODES,
  FILES,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * One project holding a Claude installation and then a Codex one that carries a skill: each of
 * doctor's blocks reads the skills its own installation copied in, so the Codex block finds the
 * carried skill in `.agents/skills` rather than looking for it in `.claude/skills`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const PINNED_TO_PROJECT = { scope: "project" } as const;

const EJECTED_INTO_THE_PROJECT = {
  install: "eject",
  scope: "project",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

/** Non-exclusive, so the carried skill sits beside React without the one-skill rule. */
const EXTERNAL_CATEGORY = "web-tooling";

/** Over 30 characters; the id is what the editor's `externalSkillId` mints for it. */
const LONG_NAME = "observability-and-instrumentation";
const LONG_NAME_ID = "external-web-tooling-observability-and-instrumentation";

describe("doctor over a Claude installation and a Codex one carrying a long-named skill", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installClaudeThenCodexCarryingALongName(): Promise<ProjectHandle> {
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    store.publish(
      "ClaudeHf",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT) },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );
    store.publish(
      "CodexLng",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT),
          [LONG_NAME_ID]: buildSeedSkill(EJECTED_INTO_THE_PROJECT),
        },
        external: {
          [LONG_NAME_ID]: buildSeedExternalSkill({
            displayName: LONG_NAME,
            categoryId: EXTERNAL_CATEGORY,
            path: `skills/${LONG_NAME}`,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const claude = await runInitFromOnClaude(store, "ClaudeHf", project, sourceDir);
    expect(claude.exitCode, flattenCliOutput(claude.output)).toBe(EXIT_CODES.SUCCESS);
    const codex = await runInitFromOnCodex(store, "CodexLng", project, sourceDir);
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    // Subject guards: read from Claude's folder, the carried skill would be missing.
    expect(
      await fileExists(path.join(codexProjectSkillsDir(project.dir), LONG_NAME_ID, FILES.SKILL_MD)),
      "Codex copied the carried skill into its own folder",
    ).toBe(true);
    expect(
      await fileExists(path.join(skillsPath(project.dir), LONG_NAME_ID, FILES.SKILL_MD)),
      "the Claude installation holds no copy of the carried skill",
    ).toBe(false);
    expect(
      await readTestFile(path.join(project.dir, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
      "the Codex configuration names the carried skill",
    ).toContain(LONG_NAME_ID);

    return project;
  }

  it.each([
    {
      at: "with no terminal",
      doctor: async (project: ProjectHandle) => {
        const { exitCode, stdout } = await CLI.run(["doctor"], project);
        return { exitCode, said: stdout };
      },
    },
    {
      at: "at a wide terminal",
      doctor: async (project: ProjectHandle) => {
        prompt = new InteractivePrompt(["doctor"], project.dir, {
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.globalHome },
        });
        const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        return { exitCode, said: prompt.getOutput() };
      },
    },
  ])(
    "finds each installation's skills where it copied them, exiting 0 $at",
    { timeout: TIMEOUTS.LIFECYCLE },
    async ({ doctor }) => {
      const project = await installClaudeThenCodexCarryingALongName();

      const { exitCode, said } = await doctor(project);

      expect(said).toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_INSTALLATIONS,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          `2 ${STEP_TEXT.DOCTOR_INSTALLATIONS_EACH_CHECKED}`,
        ),
      );
      const claudeResolved = doctorRow(
        STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        "1/1 skill found",
      );
      const codexResolved = doctorRow(
        STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        "2/2 skills found",
      );
      expect(said, "each block resolves its own installation's skills").toMatch(
        new RegExp(
          `The claude installation[\\s\\S]*?${claudeResolved.source}` +
            `[\\s\\S]*The codex installation[\\s\\S]*?${codexResolved.source}`,
        ),
      );
      expect(said, "no row reports the carried skill missing").not.toContain(
        `${LONG_NAME_ID} (not found)`,
      );
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
