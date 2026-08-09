import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  ensureBinaryExists,
  loadConfigOrFail,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  finishWizard,
  readAllSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import {
  TS_NOT_ASSIGNABLE,
  TS_UNKNOWN_PROPERTY,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import type { WizardResult } from "../pages/wizard-result.js";

/**
 * A global-scope change must not turn an untouched project's generated config
 * into a type error.
 *
 * The two files a project install writes are produced from the same merged
 * config but cover different scopes. `generateProjectConfigWithInlinedGlobal`
 * writes config.ts with every ACTIVE GLOBAL row inlined verbatim — the skill
 * entry, its stack category key, its domain. `buildProjectTypesExtras` widens
 * the imported global unions with entries active at PROJECT scope ONLY. So the
 * project's own types never account for the global rows sitting in its own
 * config.ts; they are covered only for as long as the global unions happen to
 * still contain them.
 *
 * A later global-scope edit that deselects a skill ends that. The global unions
 * narrow, the project's config.ts still names the skill, its category and its
 * domain, and `tsc` reports the file the CLI itself wrote as invalid — TS2322 on
 * the skill id and the domain, TS2353 on the stack's category key.
 *
 * Not hypothetical: that is the live state of a real installation, with exactly
 * those two diagnostic codes.
 *
 * The skill deselected here is deliberately `web-state-zustand`: it is dynamic
 * (a preloaded skill is locked to its agent and cannot be deselected on its own)
 * and it is the sole occupant of its category, so removing it narrows the
 * Category union as well as SkillId.
 */

const NARROWED_SKILL = E2E_SKILL.zustand;
const NARROWED_CATEGORY = "web-client-state";

/** `source` recorded for skills installed from a local source via `setAllLocal`. */
const EJECT_SOURCE = "eject";

/** The `.claude-src/` directory holding a scope's generated config pair. */
function claudeSrcDir(dir: string): string {
  return path.dirname(configTsPath(dir));
}

/**
 * Fresh project install with every skill ejected locally. Skills keep their
 * default GLOBAL scope, so the project owns nothing at project scope — the
 * shape in which its config-types.ts is `SkillId = GlobalSkillId` with no extras
 * of its own, and therefore entirely at the mercy of the global unions.
 */
async function initProjectWithGlobalSkills(options: {
  sourceDir: string;
  sourceTempDir: string;
  projectDir: string;
  globalHome: string;
}): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launchInProject({
    source: { sourceDir: options.sourceDir, tempDir: options.sourceTempDir },
    projectDir: options.projectDir,
    globalHome: options.globalHome,
    ...TERMINAL_SIZE.TALL,
  });

  try {
    return await finishWizard(await completeWithLocalSources(wizard));
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * One `cc edit` at the global root (HOME === cwd === globalHome) that deselects
 * `skillLabel` and saves. This is the only kind of run that can REMOVE a global
 * entry — a project-scope edit never narrows the global config.
 */
async function editGlobalRootDeselecting(options: {
  sourceDir: string;
  sourceTempDir: string;
  globalHome: string;
  skillLabel: string;
}): Promise<{ exitCode: number; output: string }> {
  const wizard = await EditWizard.launch({
    projectDir: options.globalHome,
    source: { sourceDir: options.sourceDir, tempDir: options.sourceTempDir },
    env: { HOME: options.globalHome },
    ...TERMINAL_SIZE.TALL,
  });

  try {
    await wizard.build.selectSkill(options.skillLabel);
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result: WizardResult = await confirm.confirm();
    return await finishWizard(result);
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Drops the global config's registered `projects` list.
 *
 * This is the state of the reported installation — its global config carries no
 * `projects` key at all — and it is the state this spec is about: a project the
 * global config does not know it should propagate to. With the registration in
 * place `propagateGlobalChangesToProjects` rewrites the project's config.ts to
 * match the narrowed global data, so the divergence is repaired by a mechanism
 * that has nothing to do with the project's own types being self-sufficient.
 * Removing it puts the project's types on their own, which is the property under
 * test.
 */
async function unregisterProjects(globalHome: string): Promise<void> {
  const globalConfig = await loadConfigOrFail(globalHome);
  expect(
    globalConfig.projects?.length,
    "the project install must have registered itself before this removes the registration",
  ).toBeGreaterThan(0);

  // Deregistering removes the key entirely — an explicit `undefined` is not a config state.
  const { projects: _projects, ...withoutProjects } = globalConfig;
  await writeProjectConfig(globalHome, withoutProjects);
}

describe("a global-scope narrowing keeps an untouched project's config.ts type-checking", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "still type-checks after a global edit removes a skill the project config inlines",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase 1 — a project install whose skills all default to global scope.
      const install = await initProjectWithGlobalSkills({
        sourceDir,
        sourceTempDir,
        projectDir,
        globalHome: fakeHome,
      });
      expect(install.exitCode, `Project init failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Precondition: the project's config.ts inlines the skill as a global row,
      // and the global config is where it actually lives.
      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global skill it is about to be orphaned from",
      ).toContainEqual({ id: NARROWED_SKILL.id, scope: "global", source: EJECT_SOURCE });
      expect((await readAllSkillEntries(fakeHome)).map((s) => s.id)).toContain(NARROWED_SKILL.id);

      // Control: what the CLI just wrote type-checks. Without this the assertion
      // at the end could be failing on something the install never got right.
      const afterInstall = await typecheckGeneratedConfig(claudeSrcDir(projectDir));
      expect(
        afterInstall.exitCode,
        `A freshly installed project config.ts must type-check.\ntsc output:\n${afterInstall.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      await unregisterProjects(fakeHome);

      // Phase 2 — a global-scope edit that narrows the global unions.
      const edit = await editGlobalRootDeselecting({
        sourceDir,
        sourceTempDir,
        globalHome: fakeHome,
        skillLabel: NARROWED_SKILL.display,
      });
      expect(edit.exitCode, `Global edit failed: ${edit.output}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        (await readAllSkillEntries(fakeHome)).map((s) => s.id),
        "the global edit must actually have removed the skill",
      ).not.toContain(NARROWED_SKILL.id);

      // The divergence: the project was never touched, so it still names the skill.
      expect(
        await readAllSkillEntries(projectDir),
        "the untouched project config must still inline the now-removed global row",
      ).toContainEqual({ id: NARROWED_SKILL.id, scope: "global", source: EJECT_SOURCE });

      // Phase 3 — the property that matters: a file the user never edited must
      // not have become a type error.
      const afterNarrowing = await typecheckGeneratedConfig(claudeSrcDir(projectDir));
      expect(
        afterNarrowing.exitCode,
        `A global-scope edit must not invalidate an untouched project's config.ts.\ntsc output:\n${afterNarrowing.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
      // Named codes, not just a clean exit: these are the two shapes the
      // divergence takes — an unassignable literal (a skill id or a domain) and
      // an unknown property (a stack's category key). WHICH of them fires depends
      // on what the removed entry was the last member of, so both are asserted
      // rather than the one this fixture happens to trip.
      expect(afterNarrowing.output).not.toContain(TS_NOT_ASSIGNABLE);
      expect(afterNarrowing.output).not.toContain(TS_UNKNOWN_PROPERTY);
      expect(afterNarrowing.output).not.toContain(NARROWED_SKILL.id);
      expect(afterNarrowing.output).not.toContain(NARROWED_CATEGORY);
    },
  );
});
