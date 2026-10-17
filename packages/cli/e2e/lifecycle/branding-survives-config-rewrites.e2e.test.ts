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
import { BRANDING, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { ProjectConfig } from "../../src/cli/types/index.js";
import { typedKeys } from "../../src/cli/utils/typed-object.js";

/**
 * `branding.name` (and a source repository's five layout fields) are hand-written, so every
 * command rewriting the config must carry them across: `init --from` over a project config, and
 * `edit --from` at home and in a project. Each leg proves the rewrite happened first. A project's
 * name must not reach the global config, and a project inheriting the global name must not pin a
 * copy of it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The config's own name, not the branding. */
const PROJECT_NAME = "branded-project";

const GLOBAL_INSTALL_NAME = "branded-global-install";

const WHITE_LABEL = { name: BRANDING.WHITE_LABEL_NAME };

const INIT_FROM_ID = "Rewrite1";
const EDIT_FROM_ID = "Rewrite2";
const FIRST_SAVE_ID = "Rewrite3";
const LAYOUT_EDIT_FROM_ID = "Rewrite4";
const GLOBAL_EDIT_FROM_ID = "Rewrite5";

/** Each names a path the repository chose over the default; no shared configuration sets them. */
const SOURCE_LAYOUT = {
  skillsDir: "catalogue/skills",
  agentsDir: "catalogue/agents",
  stacksFile: "catalogue/stacks.ts",
  categoriesFile: "catalogue/skill-categories.ts",
  rulesFile: "catalogue/skill-rules.ts",
} satisfies Partial<ProjectConfig>;

/**
 * Global scope: the E2E source has no marketplace, and a project skill on a default-scope
 * sub-agent is a pair the decode refuses.
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

/** Over React alone it only adds, so nothing is removed and the file still has to be rewritten. */
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

/** Over React alone at the home directory, it adds. */
const GLOBAL_REACT_AND_VITEST_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
    [E2E_SKILL.vitest.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
});

describe("what a hand-written config declares, across the commands that rewrite it", () => {
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

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
    "keeps the name in the global config edit --from rewrites at the home directory",
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

      store.publish(GLOBAL_EDIT_FROM_ID, GLOBAL_REACT_AND_VITEST_PAYLOAD);

      const applied = await applyEditFrom(store, GLOBAL_EDIT_FROM_ID, { dir: home });
      expect(applied.exitCode, `edit --from output:\n${applied.output}`).toBe(EXIT_CODES.SUCCESS);

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
      // No project config, so the project's first save reads the global one in its place.
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

      // Renamed by hand, the only way a name is set, so nothing rewrites the project.
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

      // Takes the only name this project ever had.
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
