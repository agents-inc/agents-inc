import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";

import {
  cleanupTempDir,
  configTypesTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  finishWizard,
  readAllSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";

/**
 * A project-scoped skill whose CATEGORY the global install does not hold must widen the
 * project's own `Category` union, or the sibling `config.ts` the same run writes stops
 * type-checking against it.
 *
 * `buildProjectTypesExtras` derives `extraCategories` from every active entry of the effective
 * project view and `extraDomains` from those categories, and `generateProjectConfigTypesSource`
 * emits each as `GlobalCategory | …` / `GlobalDomain | …`. The unit tests for that function
 * no-op straight through the widening branch — their mock matrix carries no skill outside the
 * global roster's own categories — so nothing held the emitted text against an install where the
 * two scopes genuinely differ. This is that install.
 *
 * WHY ONE WIZARD RUN AND NOT TWO. A second `cc init` inside a project that already has a global
 * install opens the DASHBOARD rather than the stack step, so the domain and build steps are not
 * reachable a second time. One scratch run that leaves react at global scope and moves hono to
 * project scope produces the divergence directly, in a flow a user actually has.
 *
 * WHAT THIS DOES NOT COVER, stated because the assertions below would otherwise read as though
 * it did. The `Domain` union does NOT diverge: `selectedDomains` is carried WHOLE into the
 * global partition regardless of any skill's scope, so the global side already names every
 * domain the run selected, and the project's `"api"` restates it rather than introducing it. No
 * wizard flow reaches a project domain the global install lacks. The domain path is exercised
 * here only through `deriveDomains(extraCategories)` — `api-api` resolving to `api` — which is
 * why the emitted `Domain` line is asserted verbatim rather than for the presence of `"api"`.
 */

/** `origin` recorded for skills installed from a local source via `setAllLocal`. */
const EJECT_SOURCE = "eject";

/**
 * The category hono is filed under in the E2E source, and the reason it is the skill this spec
 * picks: it is the only one the fixture ships outside the `web` domain, so it is the only
 * project-scope selection that can name a category the global side does not hold.
 */
const NEW_CATEGORY = "api-api";

/**
 * The union lines the install must emit, verbatim.
 *
 * Verbatim rather than a membership check, because the SHAPE of the emitted alias is the whole
 * subject: a `Category` that had degraded to `GlobalCategory`, to `string`, or to a union that
 * dropped `web-framework` while keeping `api-api` each satisfy `toContain("api-api")`, and each
 * is a different defect. The global pair is the control — an extension is only an extension if
 * the thing it extends lacks the member.
 */
const GLOBAL_CATEGORY_LINE = `export type Category = "web-framework";`;
const GLOBAL_DOMAIN_LINE = `export type Domain = "api" | "mobile" | "web";`;
const PROJECT_CATEGORY_LINE = `export type Category = GlobalCategory | "api-api" | "web-framework";`;
const PROJECT_DOMAIN_LINE = `export type Domain = GlobalDomain | "api" | "mobile" | "web";`;

/**
 * One scratch init in a project directory with no prior global install: react selected on the
 * Web page and left at its default GLOBAL scope, hono selected on the API page and moved to
 * PROJECT scope. That single toggle is the whole of the divergence.
 */
async function initReactGlobalHonoProject(options: {
  fakeHome: string;
  projectDir: string;
}): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    projectDir: options.projectDir,
    env: { HOME: options.fakeHome },
    ...TERMINAL_SIZE.TALL,
  });

  try {
    const domain = await wizard.stack.selectScratch();
    const build = await domain.advance();

    await build.selectSkill(E2E_SKILL.react.display);
    await build.advanceDomain();

    // `selectSkill` leaves focus on the cell it just toggled, so the scope toggle below lands on
    // hono rather than on wherever the API page happened to open.
    await build.selectSkill(E2E_SKILL.hono.display);
    await build.toggleScopeOnFocusedSkill();

    const sources = await build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    return await finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

describe("a project-scoped skill in a category the global install lacks widens the project's unions", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "extends GlobalCategory with the project-only category and leaves the global union without it",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const install = await initReactGlobalHonoProject({
        fakeHome,
        projectDir,
      });
      expect(install.exitCode, `Install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Config side, both scopes. Without this the union assertions below could hold over an
      // install that never put a skill at project scope at all.
      expect(
        await readAllSkillEntries(fakeHome),
        "the global config must hold react alone — the divergence is that it never sees hono",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: EJECT_SOURCE }]);
      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global react row and own hono at project scope",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: EJECT_SOURCE },
        { id: E2E_SKILL.hono.id, scope: "project", origin: EJECT_SOURCE },
      ]);

      // Filesystem side: each skill is copied under the scope its row claims, so the config
      // describes an install that happened rather than one it merely recorded.
      expect(
        await listFiles(skillsPath(fakeHome)),
        "react must be copied into the global skills dir and nothing else with it",
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect(
        await listFiles(skillsPath(projectDir)),
        "hono must be copied into the project skills dir and nothing else with it",
      ).toStrictEqual([E2E_SKILL.hono.id]);

      const globalTypes = await readTestFile(configTypesTsPath(fakeHome));
      const projectTypes = await readTestFile(configTypesTsPath(projectDir));

      // The control. `api-api` is genuinely absent from the global union, which is what makes
      // the project's line below an EXTENSION rather than a restatement.
      expect(
        globalTypes,
        "the global Category union must not name the project-only category — with it there, the project's extension proves nothing",
      ).toContain(GLOBAL_CATEGORY_LINE);
      expect(globalTypes).not.toContain(NEW_CATEGORY);
      expect(globalTypes).toContain(GLOBAL_DOMAIN_LINE);

      expect(
        projectTypes,
        "the project Category union must extend GlobalCategory with the category only its own scope holds",
      ).toContain(PROJECT_CATEGORY_LINE);
      expect(
        projectTypes,
        "the project Domain union must extend GlobalDomain with every domain the effective view derives",
      ).toContain(PROJECT_DOMAIN_LINE);

      // The reason the widening exists, asserted independently of its text: the project's own
      // config.ts names hono's id and its stack category key, so a `SkillId` that had not been
      // widened makes the file the CLI just wrote a type error (TS2322) and an unwidened
      // `Category` makes it TS2353.
      const typecheck = await typecheckGeneratedConfig(path.dirname(configTypesTsPath(projectDir)));
      expect(
        typecheck.exitCode,
        `The project pair must type-check against itself.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
