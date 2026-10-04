import path from "path";
import { pick } from "remeda";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import {
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  FORKED_FROM_METADATA,
  listFiles,
  loadConfigOrFail,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { BRANDING, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import type { ProjectHandle } from "../pages/wizard-result.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { ProjectConfig } from "../../src/cli/types/index.js";
import { typedKeys } from "../../src/cli/utils/typed-object.js";

/**
 * `branding.name` is written by hand: no wizard step sets it and no shared configuration carries
 * it, so the config on disk is the only place it lives. Every command that rewrites that config
 * has to carry it across, or a white-labelled install goes back to the shipped name after its
 * first edit and nothing says so.
 *
 * Three rewrites are driven here, one per entry point: `init --from` over a project config, a
 * wizard `edit` of the global installation, and `edit --from` inside a project. Each leg first
 * proves the rewrite happened — the roster it asked for is in the file and on disk — because a
 * file nobody rewrote keeps its name for free. Then it reads the name back out of the FILE, which
 * is the subject, and out of the next command's heading, which is where a person sees it.
 *
 * The other half is where the name must not go. A project's name is the project's own, and the
 * global config a project command writes is the whole machine's: a project's name carried into it
 * renames every installation that declares none of its own. The `edit --from` leg is the one that
 * writes the global config from a session holding the project's whole config, so its global half
 * is what sees a name kept by copying it to every scope.
 *
 * Mutation-checked three ways. Against a merge that drops the key, all three legs go red on the
 * `branding` read off the rewritten config, after their roster assertions pass. Against a merge
 * that keeps it while the global partition still spreads it, only the `edit --from` leg goes red,
 * on the global config carrying `{ name: 'Northwind' }`. Against one that also fills the global
 * config's name from the session, as it fills `marketplace`, the `init --from` leg's global half
 * goes red as well.
 *
 * The fourth leg is the same rule read from the global side. A project that declares no name
 * takes the global one at read time, field by field, so a copy of it in the project's own file is
 * a name the project declared — and keeping a file's name across rewrites, which the first three
 * legs demand, would then pin that copy for good, so a renamed global never reached the project.
 * Mutation-checked: with the merge and the split fixed but either the merge lending the global's
 * name to a project's first save, or the writer inlining it, the leg goes red on the project
 * config's `branding`, after its roster assertions pass. The same leg then uninstalls the global
 * installation: a project that only ever inherited the name has nothing left to inherit, so it
 * prints the shipped one (owner, 2026-10-02: an inherited name falls back to "Agents Inc.").
 *
 * The last leg is the same carry-forward for the five fields a source repository declares its own
 * layout with. They are hand-written as `branding` is, and the merge's fixed list of fields it
 * copies back from disk names none of them either. They stay in the file that carried them, so
 * the global config the apply writes takes none of them (orchestrator decision, 2026-10-02).
 *
 * A kept field has to be a field the file may declare: the first and last legs type-check the
 * rewritten `config.ts` against the `config-types.ts` written beside it, whose `ProjectConfig`
 * once declared neither `branding` nor the layout fields, so a config that kept them failed its
 * own `satisfies ProjectConfig` (TS2353) the moment the merge stopped dropping them.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The `name` every project config here carries — the config's own name, not the branding. */
const PROJECT_NAME = "branded-project";

/** The `name` of the global installation the wizard leg edits. */
const GLOBAL_INSTALL_NAME = "branded-global-install";

/** What each fixture configures by hand, and what each rewrite must leave in the file. */
const WHITE_LABEL = { name: BRANDING.WHITE_LABEL_NAME };

/** The ids the store publishes each leg's configuration under. Eight characters, as elsewhere. */
const INIT_FROM_ID = "Rewrite1";
const EDIT_FROM_ID = "Rewrite2";
const FIRST_SAVE_ID = "Rewrite3";
const LAYOUT_EDIT_FROM_ID = "Rewrite4";

/**
 * A source repository's own layout, as its config declares it by hand: each field names a path
 * the repository chose over the default, so a config that lost one would send the next read of
 * that repository to a directory it does not use. No wizard step and no shared configuration
 * sets any of them.
 */
const SOURCE_LAYOUT = {
  skillsDir: "catalogue/skills",
  agentsDir: "catalogue/agents",
  stacksFile: "catalogue/stacks.ts",
  categoriesFile: "catalogue/skill-categories.ts",
  rulesFile: "catalogue/skill-rules.ts",
} satisfies Partial<ProjectConfig>;

/**
 * React, ejected at GLOBAL scope — the shape every `init --from` spec installs, because the E2E
 * source carries no marketplace and a project-scoped skill on a sub-agent left at the shared
 * default is a pair the decode refuses.
 */
const GLOBAL_REACT_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
});

/**
 * React and Vitest at PROJECT scope. Applied over a project holding React alone it only adds, so
 * the plan removes nothing and the file still has to be rewritten.
 */
const PROJECT_REACT_AND_VITEST_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      scope: "project",
      assignments: { [WEB_DEV]: "lazy" },
    }),
    [E2E_SKILL.vitest.id]: buildSeedSkill({
      scope: "project",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "project" } },
});

describe("what a hand-written config declares, across the commands that rewrite it", () => {
  let store: SeedConfigStore;
  let wizard: EditWizard | undefined;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A HOME of its own with a project directory under it, removed after the test. */
  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment();
    tempDirs.push(env.tempDir);
    return env;
  }

  it(
    "keeps the name in the project config init --from rewrites, and gives the global config none",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await takeEnvironment();
      // A project config that declares nothing but its own name and its branding.
      await writeProjectConfig(
        env.projectDir,
        buildProjectConfig({ name: PROJECT_NAME, skills: [], agents: [], branding: WHITE_LABEL }),
      );
      store.publish(INIT_FROM_ID, GLOBAL_REACT_PAYLOAD);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };

      const installed = await runInitFrom(store, INIT_FROM_ID, project, E2E_SOURCE.sourceDir);
      expect(installed.exitCode, `init --from output:\n${installed.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.skills.map((skill) => skill.id),
        "the install must have rewritten the project config it started from",
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect((await listFiles(skillsPath(env.fakeHome))).sort()).toStrictEqual([
        E2E_SKILL.react.id,
      ]);
      expect(
        projectConfig.branding,
        "a rewrite must keep the branding the project config already carried",
      ).toStrictEqual(WHITE_LABEL);
      expect(
        await loadConfigOrFail(env.fakeHome),
        "the global config this install created must not take the project's name",
      ).not.toHaveProperty("branding");
      const typecheck = await typecheckGeneratedConfig(path.dirname(configTsPath(env.projectDir)));
      expect(
        typecheck.exitCode,
        `a config that keeps its branding must type-check against the types written beside it:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      const { output: doctor } = await CLI.run(["doctor"], project);
      expect(doctor).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(doctor).not.toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
    },
  );

  it(
    "keeps the name in the global config a wizard edit rewrites",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { fakeHome: home } = await takeEnvironment();
      await writeProjectConfig(
        home,
        buildProjectConfig({
          name: GLOBAL_INSTALL_NAME,
          marketplace: E2E_SOURCE.sourceDir,
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
          selectedDomains: ["web"],
          branding: WHITE_LABEL,
        }),
      );
      await createLocalSkill(home, E2E_SKILL.react.id, { metadata: FORKED_FROM_METADATA });

      wizard = await EditWizard.launchInGlobal({
        projectDir: home,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      // Local: the source carries no marketplace, so the plugin default an added skill takes in
      // an edit could not install.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode, `edit output:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfig = await loadConfigOrFail(home);
      expect(
        globalConfig.skills.map((skill) => skill.id).sort(),
        "the edit must have rewritten the global config with the skill it added",
      ).toStrictEqual([E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort());
      expect((await listFiles(skillsPath(home))).sort()).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
      expect(
        globalConfig.branding,
        "a rewrite must keep the branding the global config already carried",
      ).toStrictEqual(WHITE_LABEL);

      const { output: doctor } = await CLI.run(["doctor"], { dir: home });
      expect(doctor).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(doctor).not.toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
    },
  );

  it(
    "keeps the name in the project config edit --from rewrites, and out of the global config",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await takeEnvironment();
      await writeProjectConfig(
        env.projectDir,
        buildProjectConfig({
          name: PROJECT_NAME,
          marketplace: E2E_SOURCE.sourceDir,
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
          selectedDomains: ["web"],
          branding: WHITE_LABEL,
        }),
      );
      await createLocalSkill(env.projectDir, E2E_SKILL.react.id, {
        metadata: FORKED_FROM_METADATA,
      });
      store.publish(EDIT_FROM_ID, PROJECT_REACT_AND_VITEST_PAYLOAD);

      prompt = new InteractivePrompt(["edit", "--from", EDIT_FROM_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(exitCode, `edit --from output:\n${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.skills.map((skill) => skill.id).sort(),
        "the apply must have rewritten the project config with the skill it added",
      ).toStrictEqual([E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort());
      expect((await listFiles(skillsPath(env.projectDir))).sort()).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
      expect(
        projectConfig.branding,
        "a rewrite must keep the branding the project config already carried",
      ).toStrictEqual(WHITE_LABEL);
      expect(
        await loadConfigOrFail(env.fakeHome),
        "a project's name must not reach the global config its apply writes",
      ).not.toHaveProperty("branding");

      const { output: inProject } = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const { output: atHome } = await CLI.run(["doctor"], { dir: env.fakeHome });
      expect(inProject).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(inProject).not.toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(atHome).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(atHome).not.toContain(BRANDING.WHITE_LABEL_NAME);
    },
  );

  it(
    "writes the global name into no project, so renaming it reaches a project that declares none",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await takeEnvironment();
      // A branded global config over a project directory with no config of its own, so the
      // project's first save reads the global config in its place.
      await writeProjectConfig(
        env.fakeHome,
        buildProjectConfig({
          name: GLOBAL_INSTALL_NAME,
          skills: [],
          agents: [],
          branding: WHITE_LABEL,
        }),
      );
      store.publish(FIRST_SAVE_ID, PROJECT_REACT_AND_VITEST_PAYLOAD);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };

      const installed = await runInitFrom(store, FIRST_SAVE_ID, project, E2E_SOURCE.sourceDir);
      expect(installed.exitCode, `init --from output:\n${installed.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.skills.map((skill) => skill.id).sort(),
        "the install must have written the project's own config",
      ).toStrictEqual([E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort());
      expect((await listFiles(skillsPath(env.projectDir))).sort()).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
      expect(
        projectConfig,
        "a project that declares no name must not be written the global config's",
      ).not.toHaveProperty("branding");
      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(globalConfig.branding, "a project's install must leave the global name").toStrictEqual(
        WHITE_LABEL,
      );

      // Renamed by hand, which is the only way a name is set, so nothing rewrites the project.
      await writeProjectConfig(
        env.fakeHome,
        buildProjectConfig({
          ...globalConfig,
          branding: { name: BRANDING.RENAMED_WHITE_LABEL_NAME },
        }),
      );

      const { output: doctor } = await CLI.run(["doctor"], project);
      expect(doctor).toContain(
        `${BRANDING.RENAMED_WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`,
      );
      expect(doctor).not.toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);

      // The global installation goes, and with it the only name this project ever had.
      const uninstalled = await CLI.run(["uninstall", "--yes"], { dir: env.fakeHome });
      expect(uninstalled.exitCode, `global uninstall output:\n${uninstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const { output: orphaned } = await CLI.run(["doctor"], project);
      expect(orphaned).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
      expect(orphaned).not.toContain(BRANDING.RENAMED_WHITE_LABEL_NAME);
    },
  );

  it(
    "keeps a source repository's layout fields in the project config edit --from rewrites",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await takeEnvironment();
      await writeProjectConfig(
        env.projectDir,
        buildProjectConfig({
          name: PROJECT_NAME,
          marketplace: E2E_SOURCE.sourceDir,
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
          selectedDomains: ["web"],
          ...SOURCE_LAYOUT,
        }),
      );
      await createLocalSkill(env.projectDir, E2E_SKILL.react.id, {
        metadata: FORKED_FROM_METADATA,
      });
      store.publish(LAYOUT_EDIT_FROM_ID, PROJECT_REACT_AND_VITEST_PAYLOAD);

      prompt = new InteractivePrompt(["edit", "--from", LAYOUT_EDIT_FROM_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(exitCode, `edit --from output:\n${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.skills.map((skill) => skill.id).sort(),
        "the apply must have rewritten the project config with the skill it added",
      ).toStrictEqual([E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort());
      expect((await listFiles(skillsPath(env.projectDir))).sort()).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
      expect(
        {
          skillsDir: projectConfig.skillsDir,
          agentsDir: projectConfig.agentsDir,
          stacksFile: projectConfig.stacksFile,
          categoriesFile: projectConfig.categoriesFile,
          rulesFile: projectConfig.rulesFile,
        },
        "a rewrite must keep the layout fields the project config already carried",
      ).toStrictEqual(SOURCE_LAYOUT);
      expect(
        pick(await loadConfigOrFail(env.fakeHome), typedKeys(SOURCE_LAYOUT)),
        "a project's layout must not reach the global config its apply writes",
      ).toStrictEqual({});

      const typecheck = await typecheckGeneratedConfig(path.dirname(configTsPath(env.projectDir)));
      expect(
        typecheck.exitCode,
        `a config that keeps its layout must type-check against the types written beside it:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
