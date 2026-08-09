import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  BUILT_IN_STACK_DISPLAY,
  E2E_SKILL,
  E2E_STACK_DISPLAY,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTypesTsPath,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import type { WizardResult } from "../pages/wizard-result.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * A custom marketplace, from `--source` on the first run to every later command
 * reading it without being told again.
 *
 * `--source` is the whole private-marketplace story: an organisation points one
 * `init` at its own repository and expects the installation to keep answering to
 * it. The suite proved the wizard OFFERS a custom source's stacks
 * (`interactive/init-wizard-stackless-source`) and that `eject` RECORDS one
 * (`commands/eject`), but nothing installed from a custom source and then asked
 * the other commands where they were reading from. The read-only commands are
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
  result: WizardResult,
  sourceDir: string,
): Promise<void> {
  const list = await CLI.run(["list"], result.project);
  expect(list.exitCode, list.output).toBe(EXIT_CODES.SUCCESS);
  expect(list.stdout).toContain("Installation:");

  const doctor = await CLI.run(["doctor"], result.project);
  expect(doctor.exitCode, doctor.output).toBe(EXIT_CODES.SUCCESS);
  expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_SOURCE_LOCAL);
  expect(
    doctor.stdout,
    "doctor must name the custom source it reached, not a marketplace nobody configured",
  ).toContain(sourceDir);

  const compile = await CLI.run(["compile"], result.project);
  expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
  expect(compile.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

  const found = await CLI.run(["search", E2E_SKILL.hono.slug], result.project);
  expect(found.exitCode, found.output).toBe(EXIT_CODES.SUCCESS);
  expect(found.stdout).toContain(E2E_SKILL.hono.display);

  const absent = await CLI.run(["search", PUBLIC_ONLY_SEARCH_TERM], result.project);
  expect(absent.exitCode, absent.output).toBe(EXIT_CODES.SUCCESS);
  expect(
    absent.output,
    "a skill only the public marketplace ships must not be findable from a custom source",
  ).toContain(`No skills found matching "${PUBLIC_ONLY_SEARCH_TERM}"`);

  const update = await CLI.run(["update"], result.project);
  expect(update.exitCode, update.output).toBe(EXIT_CODES.SUCCESS);
  expect(update.output).toContain(STEP_TEXT.UPDATE_EJECTED_OWNED);
  expect(update.output).toContain(STEP_TEXT.UPDATE_NO_MARKETPLACES);
}

/** The four-surface check every variant of this arc owes at its install scope. */
async function expectInstallSurfaces(installDir: string): Promise<void> {
  expect(
    Object.keys(await readCompiledAgents(installDir)).length,
    "the install must have compiled agents",
  ).toBeGreaterThan(0);
  expect((await listFiles(skillsPath(installDir))).length).toBeGreaterThan(0);

  const claudeSrcDir = path.dirname(configTypesTsPath(installDir));
  const typecheck = await typecheckGeneratedConfig(claudeSrcDir);
  expect(
    typecheck.exitCode,
    `a config installed from a custom source must type-check.\ntsc output:\n${typecheck.output}`,
  ).toBe(EXIT_CODES.SUCCESS);
  const probe = await probeConfigTypesNarrowing(claudeSrcDir, GENERATED_ALIASES);
  expect(
    probe.exitCode,
    `a bogus literal must not type-check against a custom-source install.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
  ).not.toBe(EXIT_CODES.SUCCESS);
  expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
}

describe("a custom marketplace is stored by init and resolved by every later command", () => {
  let wizard: InitWizard | undefined;
  let sourceDir: string;
  let sourceTempDir: string;
  let stacklessSourceDir: string;
  let stacklessSourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const stacked = await createE2ESource();
    sourceDir = stacked.sourceDir;
    sourceTempDir = stacked.tempDir;
    const stackless = await createE2ESource({ withoutStacks: true });
    stacklessSourceDir = stackless.sourceDir;
    stacklessSourceTempDir = stackless.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
    if (stacklessSourceTempDir) await cleanupTempDir(stacklessSourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "installs a stack from the custom source, records it, and answers every later command from it",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject({
        source: { sourceDir, tempDir: sourceTempDir },
      });
      const globalHome = wizard.globalHome;

      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
      const installOutput = result.rawOutput;

      // Surface 2: the run named the custom source's own stack, and never the
      // built-in catalogue that belongs to the public marketplace.
      expect(installOutput).toContain(E2E_STACK_DISPLAY);
      expect(installOutput).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        installOutput,
        "the built-in stacks stand in for the default marketplace only",
      ).not.toContain(BUILT_IN_STACK_DISPLAY);

      // Surface 3: the source is stored, so nothing later has to be told again.
      const globalConfig = await loadConfigOrFail(globalHome);
      expect(globalConfig.source, "init must record the source it installed from").toBe(sourceDir);
      expect(
        [...new Set(await readConfigSkillIds(result.project.dir))].sort(),
        "the installed skills must be the custom stack's, not a default's",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      // Surfaces 1 and 4.
      await expectInstallSurfaces(globalHome);

      // Every later command resolves the stored source. Run before destroy() so
      // the wizard's HOME is still the one CLI.run reads.
      await expectCommandsResolveCustomSource(result, sourceDir);

      await result.destroy();
    },
  );

  it(
    "installs from a custom source that ships no stacks and stores it just the same",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const launched = await InitWizard.launchOnDomainsInProject({
        source: { sourceDir: stacklessSourceDir, tempDir: stacklessSourceTempDir },
      });
      wizard = launched.wizard;
      const globalHome = wizard.globalHome;

      // A stackless source preselects nothing — there is no stack to preselect
      // FROM — so the build grid opens empty and the user picks. Without this the
      // run installs zero skills and every surface below is satisfied by an
      // install that never happened.
      const build = await launched.domain.acceptDefaults();
      await build.selectSkill(E2E_SKILL.react.display);
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();
      expect(await result.exitCode, `stackless init failed:\n${result.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const installOutput = result.rawOutput;

      // Surface 2, with the stack step's own sentinel as the positive subject
      // guard: the domains step painted, so the absence of a stack step below is
      // a step that never rendered rather than a frame nothing was captured from.
      expect(installOutput).toContain(STEP_TEXT.DOMAINS);
      expect(installOutput).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        installOutput,
        "a marketplace shipping no stacks must not have the built-ins substituted into it",
      ).not.toContain(BUILT_IN_STACK_DISPLAY);

      // Surface 3: a stackless install stores its source exactly as a stacked one
      // does — the two differ in what was picked, not in what was remembered.
      expect(
        (await loadConfigOrFail(globalHome)).source,
        "a stackless init must record the source it installed from",
      ).toBe(stacklessSourceDir);

      await expectInstallSurfaces(globalHome);
      await expectCommandsResolveCustomSource(result, stacklessSourceDir);

      await result.destroy();
    },
  );
});
