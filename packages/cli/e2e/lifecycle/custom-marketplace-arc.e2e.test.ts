import path from "path";
import type { AgentName } from "../../src/cli/types/index.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  BUILT_IN_STACK_DISPLAY,
  E2E_AGENT,
  E2E_SKILL,
  E2E_STACK_DESCRIPTION,
  E2E_STACK_SKILL_IDS,
  E2E_STACK_AGENTS,
} from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import {
  createTestEnvironment,
  readConfigSkillIds,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * A custom marketplace, from `--marketplace` on the first run to every later command
 * reading it without being told again.
 *
 * `--marketplace` is the whole private-marketplace story: an organisation points one
 * `init` at its own repository and expects the installation to keep answering to
 * it. `eject` RECORDS one (`commands/eject`), but nothing else installed from a
 * custom source and then asked the other commands where they were reading from. The read-only commands are
 * where a silent fallback to the public marketplace would surface first — and
 * would look like success.
 *
 * `search` carries the discriminating negative: a skill the PUBLIC marketplace
 * has and this source does not must not be findable. Asserting only that the
 * custom source's own skills are found passes just as well for a run that merged
 * both catalogues.
 *
 * The refresh leg is honest about what an ejected install can be asked for:
 * `update` names the copies the user owns and reports that there is no
 * marketplace to refresh. The marketplace-refresh SUCCESS branch needs a real
 * registered marketplace and the Claude CLI — it is journey 10's blocked branch
 * and is not re-attempted here.
 */

/**
 * A skill the real public marketplace ships and the E2E source does not. The
 * negative that tells "resolved the custom source" apart from "merged in the
 * default one".
 */
const PUBLIC_ONLY_SEARCH_TERM = "playwright";

/** The aliases an install fills in from whatever source it read. */
const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

/**
 * Every read-only command that must resolve the source from the configuration
 * rather than from a flag, run against a finished install.
 *
 * Grouped into one helper because the claim is about the SET: a spec that runs
 * `list` alone cannot tell a stored source from a lucky default, and each of
 * these reaches the source through a different path.
 */
async function expectCommandsResolveCustomSource(
  project: ProjectHandle,
  sourceDir: string,
): Promise<void> {
  const list = await CLI.run(["list"], project);
  expect(list.exitCode, list.output).toBe(EXIT_CODES.SUCCESS);
  expect(list.stdout).toContain("Installation:");

  const doctor = await CLI.run(["doctor"], project);
  expect(doctor.exitCode, doctor.output).toBe(EXIT_CODES.SUCCESS);
  expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_SOURCE_LOCAL);
  expect(
    doctor.stdout,
    "doctor must name the custom source it reached, not a marketplace nobody configured",
  ).toContain(sourceDir);

  const compile = await CLI.run(["compile"], project);
  expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
  expect(compile.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

  const found = await CLI.run(["search", E2E_SKILL.hono.slug], project);
  expect(found.exitCode, found.output).toBe(EXIT_CODES.SUCCESS);
  expect(found.stdout).toContain(E2E_SKILL.hono.display);

  const absent = await CLI.run(["search", PUBLIC_ONLY_SEARCH_TERM], project);
  expect(absent.exitCode, absent.output).toBe(EXIT_CODES.SUCCESS);
  expect(
    absent.output,
    "a skill only the public marketplace ships must not be findable from a custom source",
  ).toContain(`No skills found matching "${PUBLIC_ONLY_SEARCH_TERM}"`);

  const update = await CLI.run(["update"], project);
  expect(update.exitCode, update.output).toBe(EXIT_CODES.SUCCESS);
  expect(update.output).toContain(STEP_TEXT.UPDATE_EJECTED_OWNED);
  expect(update.output).toContain(STEP_TEXT.UPDATE_NO_MARKETPLACES);
}

/**
 * The four-surface check every variant of this arc owes at its install scope.
 *
 * The roster is a parameter because the two variants compile different ones — a stack install
 * compiles what the stack declares, the stackless one the one sub-agent its configuration names —
 * and a single shared expectation would have to be loose enough to accept both.
 */
async function expectInstallSurfaces(
  installDir: string,
  expectedAgents: readonly AgentName[],
): Promise<void> {
  // Members, not a count: a count cannot detect a swap — one sub-agent removed and another added
  // leaves `length` identical — and this arc's whole subject is which roster a CUSTOM source
  // compiles. `share-round-trip-compiled-bodies` names its roster for the same reason.
  expect(
    Object.keys(await readCompiledAgents(installDir))
      .map((file) => path.basename(file, ".md"))
      .sort(),
    "the install must compile exactly the expected sub-agents",
  ).toStrictEqual([...expectedAgents].sort());
  expect((await listFiles(skillsPath(installDir))).length).toBeGreaterThan(0);

  const sourceFolderDir = path.dirname(configTypesTsPath(installDir));
  const typecheck = await typecheckGeneratedConfig(sourceFolderDir);
  expect(
    typecheck.exitCode,
    `a config installed from a custom source must type-check.\ntsc output:\n${typecheck.output}`,
  ).toBe(EXIT_CODES.SUCCESS);
  const probe = await probeConfigTypesNarrowing(sourceFolderDir, GENERATED_ALIASES);
  expect(
    probe.exitCode,
    `a bogus literal must not type-check against a custom-source install.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
  ).not.toBe(EXIT_CODES.SUCCESS);
  expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
  // EACH alias, not any: the two above hold while one alias rejects and the others have
  // collapsed to `string`.
  expect(
    probe.rejected,
    `every alias asked for must reject its bogus literal.\ntsc output:\n${probe.output}`,
  ).toStrictEqual([...GENERATED_ALIASES]);
}

/** The stack, installed globally from a project. */
const STACK_ID = "CustomM1";

/** One skill on one sub-agent, from a source that ships no stacks to name. */
const STACKLESS_ID = "CustomM2";

const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("a custom marketplace is stored by init and resolved by every later command", () => {
  let store: SeedConfigStore;
  let sourceDir: string;
  let sourceTempDir: string;
  let stacklessSourceDir: string;
  let stacklessSourceTempDir: string;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    const stacked = await createE2ESource();
    sourceDir = stacked.sourceDir;
    sourceTempDir = stacked.tempDir;
    const stackless = await createE2ESource({ withoutStacks: true });
    stacklessSourceDir = stackless.sourceDir;
    stacklessSourceTempDir = stackless.tempDir;

    store = await startSeedConfigStore();
    store.publish(STACK_ID, e2eStackPayload({ scope: "global" }));
    store.publish(
      STACKLESS_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
      }),
    );
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
    if (stacklessSourceTempDir) await cleanupTempDir(stacklessSourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "installs a stack from the custom source, records it, and answers every later command from it",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const globalHome = env.fakeHome;
      const project = { dir: env.projectDir, globalHome };

      const result = await runInitFrom(store, STACK_ID, project, sourceDir);
      expect(result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);

      // Surface 2: the run installed, and never named the built-in catalogue that
      // belongs to the public marketplace.
      expect(result.output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        result.output,
        "the built-in stacks stand in for the default marketplace only",
      ).not.toContain(BUILT_IN_STACK_DISPLAY);

      // Surface 3: the source is stored, so nothing later has to be told again.
      const globalConfig = await loadConfigOrFail(globalHome);
      expect(globalConfig.marketplace, "init must record the source it installed from").toBe(
        sourceDir,
      );
      expect(
        (await loadConfigOrFail(project.dir)).description,
        "the custom source's own stack must have resolved",
      ).toBe(E2E_STACK_DESCRIPTION);
      expect(
        [...new Set(await readConfigSkillIds(project.dir))].sort(),
        "the installed skills must be the custom stack's, not a default's",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      // Surfaces 1 and 4.
      await expectInstallSurfaces(globalHome, E2E_STACK_AGENTS);

      // Every later command resolves the stored source.
      await expectCommandsResolveCustomSource(project, sourceDir);
    },
  );

  it(
    "installs from a custom source that ships no stacks and stores it just the same",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const globalHome = env.fakeHome;
      const project = { dir: env.projectDir, globalHome };

      const result = await runInitFrom(store, STACKLESS_ID, project, stacklessSourceDir);
      expect(result.exitCode, `stackless init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);

      expect(result.output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        result.output,
        "a marketplace shipping no stacks must not have the built-ins substituted into it",
      ).not.toContain(BUILT_IN_STACK_DISPLAY);

      // Surface 3: a stackless install stores its source exactly as a stacked one
      // does — the two differ in what was picked, not in what was remembered.
      expect(
        (await loadConfigOrFail(globalHome)).marketplace,
        "a stackless init must record the source it installed from",
      ).toBe(stacklessSourceDir);

      await expectInstallSurfaces(globalHome, [WEB_DEV]);
      await expectCommandsResolveCustomSource(project, stacklessSourceDir);
    },
  );
});
