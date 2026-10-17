import path from "path";
import { readFile, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  flattenCliOutput,
  loadConfigOrFail,
  readTreeSnapshot,
  renderMetadataYaml,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { CategoryPath } from "../../src/cli/types/index.js";

/**
 * `edit --from` keeps the configuration's own skill assigned when a skill it may not remove
 * (written here, or named but unplaceable) shares its category on the same sub-agent: rows join
 * rather than replace. In a one-skill category the configuration's skill takes the slot, and a
 * result the writer would refuse is refused before the question.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const VITEST = E2E_SKILL.vitest.id;
const VISUAL = E2E_SKILL["visual-regression"].id;
const REACT = E2E_SKILL.react.id;
const VUE = E2E_SKILL["vue-composition-api"].id;
const ZUSTAND = E2E_SKILL.zustand.id;
/**
 * Recorded with no files, so the decode skips it while the configuration names it; a destructive
 * apply may not read that as an instruction.
 */
const UNPLACEABLE = "web-testing-react-testing-library";

const INSTALLED_ID = "KeptCat01";
const APPLY_ID = "KeptCat02";
const UNPLACEABLE_APPLY_ID = "KeptCat03";
const REACT_INSTALLED_ID = "KeptCat04";
const VUE_APPLY_ID = "KeptCat05";
const TWO_FRAMEWORKS_INSTALLED_ID = "KeptCat06";
const VITEST_ONLY_APPLY_ID = "KeptCat07";

const onWebDeveloper = buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } });
const webDeveloperHere = {
  [WEB_DEV]: { on: true, scope: "project" },
} satisfies SeedPayload["agents"];

describe("edit --from <id> keeps the configuration's skill beside a kept one in its category", () => {
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: { [VITEST]: onWebDeveloper, [VISUAL]: onWebDeveloper },
        agents: webDeveloperHere,
      }),
    );
    // The skill written here is one the configuration never mentions.
    store.publish(
      APPLY_ID,
      buildSeedPayload({ skills: { [VITEST]: onWebDeveloper }, agents: webDeveloperHere }),
    );
    store.publish(
      UNPLACEABLE_APPLY_ID,
      buildSeedPayload({
        skills: { [VITEST]: onWebDeveloper, [UNPLACEABLE]: onWebDeveloper },
        agents: webDeveloperHere,
      }),
    );
    store.publish(
      REACT_INSTALLED_ID,
      buildSeedPayload({
        skills: { [REACT]: onWebDeveloper, [VITEST]: onWebDeveloper },
        agents: webDeveloperHere,
      }),
    );
    store.publish(
      VUE_APPLY_ID,
      buildSeedPayload({
        skills: { [VUE]: onWebDeveloper, [VITEST]: onWebDeveloper },
        agents: webDeveloperHere,
      }),
    );
    store.publish(
      TWO_FRAMEWORKS_INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [REACT]: onWebDeveloper,
          [ZUSTAND]: onWebDeveloper,
          [VITEST]: onWebDeveloper,
          [VUE]: buildSeedSkill({ scope: "project", assignments: { [API_DEV]: "lazy" } }),
        },
        agents: { ...webDeveloperHere, [API_DEV]: { on: true, scope: "project" } },
      }),
    );
    store.publish(
      VITEST_ONLY_APPLY_ID,
      buildSeedPayload({ skills: { [VITEST]: onWebDeveloper }, agents: webDeveloperHere }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  async function installedFrom(id: string): Promise<TestEnvironment> {
    const env = await createTestEnvironment();
    tempDirs.push(env.tempDir);
    const installed = await runInitFrom(
      store,
      id,
      { dir: env.projectDir, globalHome: env.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return env;
  }

  /** No `forkedFrom` reads as written here, so the apply may not remove it. */
  async function rewriteAsWrittenHere(
    projectDir: string,
    skill: (typeof E2E_SKILL)[keyof typeof E2E_SKILL],
    category: CategoryPath,
  ): Promise<void> {
    await writeFile(
      path.join(skillsPath(projectDir), skill.id, FILES.METADATA_YAML),
      renderMetadataYaml({
        displayName: skill.display,
        category,
        slug: skill.slug,
        cliDescription: "Written by hand, not installed",
        usageGuidance: "Use when the house's own guidance applies",
        contentHash: "authored1",
      }),
    );
  }

  async function applyApproved(
    id: string,
    projectDir: string,
    home?: string,
  ): Promise<{ planned: string; output: string }> {
    prompt = new InteractivePrompt(["edit", "--from", id], projectDir, {
      env: { AGENTS_INC_API_URL: store.url, ...(home !== undefined && { HOME: home }) },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    const planned = prompt.getOutput();
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
    return { planned, output: prompt.getOutput() };
  }

  it(
    "keeps the configuration's skill assigned beside a skill written here in the same category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await installedFrom(INSTALLED_ID);
      await rewriteAsWrittenHere(env.projectDir, E2E_SKILL["visual-regression"], "web-testing");
      // Subject guard: both skills share one category of the sub-agent.
      expect((await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV]).toStrictEqual({
        "web-testing": [sa(VITEST), sa(VISUAL)],
      });

      const { planned, output } = await applyApproved(APPLY_ID, env.projectDir, env.fakeHome);

      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_AUTHORED);
      expect(
        (await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV],
        "the configuration's skill must stay assigned beside the kept one in its category",
      ).toStrictEqual({ "web-testing": [sa(VITEST), sa(VISUAL)] });
      expect(output).not.toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
        skillIds: [VITEST, VISUAL],
      });
    },
  );

  it(
    "keeps the configuration's skill assigned beside a skill it cannot place in the same category",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [VITEST],
        agents: [WEB_DEV],
        domains: ["web"],
        forkedFrom: true,
        unresolvableSkills: [UNPLACEABLE],
        stack: { [WEB_DEV]: { "web-testing": [sa(VITEST), sa(UNPLACEABLE)] } },
      });
      tempDirs.push(path.dirname(project.dir));
      // Compiled first: an apply that changes nothing compiles nothing.
      const compiled = await runCLI(["compile"], project.dir);
      expect(compiled.exitCode, `compile failed: ${compiled.combined}`).toBe(EXIT_CODES.SUCCESS);

      const { planned, output } = await applyApproved(UNPLACEABLE_APPLY_ID, project.dir);

      // Subject guard: the skip was read as a skill kept.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_UNPLACEABLE);
      expect(
        (await loadConfigOrFail(project.dir)).stack?.[WEB_DEV],
        "the configuration's skill must stay assigned beside the one this catalogue cannot place",
      ).toStrictEqual({ "web-testing": [sa(VITEST), sa(UNPLACEABLE)] });
      expect(output).not.toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      // The kept skill has no files, so the compiled sub-agent holds only the other.
      await expect({ dir: project.dir }).toHaveAgentDynamicSkills(WEB_DEV, {
        skillIds: [VITEST],
      });
    },
  );

  describe("in a category that holds one skill", () => {
    it(
      "gives the slot to the configuration's skill, and keeps the skill written here unassigned there",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const env = await installedFrom(REACT_INSTALLED_ID);
        await rewriteAsWrittenHere(env.projectDir, E2E_SKILL.react, "web-framework");
        expect((await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV]).toStrictEqual({
          "web-framework": [sa(REACT)],
          "web-testing": [sa(VITEST)],
        });
        const keptFiles = await readTreeSnapshot(path.join(skillsPath(env.projectDir), REACT));
        expect(Object.keys(keptFiles), "the kept skill's directory must exist").not.toHaveLength(0);

        // First, because it is the defect: joining both into the slot was refused after the yes.
        const { planned } = await applyApproved(VUE_APPLY_ID, env.projectDir, env.fakeHome);

        expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_AUTHORED);
        expect(
          planned,
          "the plan must say the kept skill loses the slot the configuration's skill takes",
        ).toContain(
          `${REACT}: ${STEP_TEXT.SHARED_CONFIG_KEPT_UNASSIGNED} ${WEB_DEV}'s web-framework`,
        );
        const config = await loadConfigOrFail(env.projectDir);
        expect(
          config.stack?.[WEB_DEV],
          "the configuration's skill must hold the slot alone",
        ).toStrictEqual({ "web-framework": [sa(VUE)], "web-testing": [sa(VITEST)] });
        expect(config.skills.map((skill) => skill.id)).toContain(REACT);
        expect(
          await readTreeSnapshot(path.join(skillsPath(env.projectDir), REACT)),
          "the kept skill's files must be left as they were",
        ).toStrictEqual(keptFiles);
        await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
          skillIds: [VUE, VITEST],
          noSkillIds: [REACT],
        });
      },
    );

    it(
      "refuses a result the config writer would refuse before it asks, with nothing touched",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const env = await installedFrom(TWO_FRAMEWORKS_INSTALLED_ID);
        await rewriteAsWrittenHere(env.projectDir, E2E_SKILL.react, "web-framework");
        await rewriteAsWrittenHere(
          env.projectDir,
          E2E_SKILL["vue-composition-api"],
          "web-framework",
        );
        // Both in one slot by hand: `compile` and `doctor` load this; only the writer refuses it.
        const configPath = configTsPath(env.projectDir);
        const source = await readFile(configPath, "utf-8");
        await writeFile(
          configPath,
          source.replace(`'web-framework': '${REACT}'`, `'web-framework': ['${REACT}', '${VUE}']`),
        );
        expect((await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV]).toStrictEqual({
          "web-framework": [sa(REACT), sa(VUE)],
          "web-client-state": [sa(ZUSTAND)],
          "web-testing": [sa(VITEST)],
        });
        const surfaces = (): Promise<unknown[]> =>
          Promise.all([
            readTreeSnapshot(env.projectDir),
            readTreeSnapshot(path.join(env.fakeHome, DIRS.CLAUDE)),
            readTreeSnapshot(path.join(env.fakeHome, DIRS.SOURCE_ROOT)),
          ]);
        const before = await surfaces();

        prompt = new InteractivePrompt(["edit", "--from", VITEST_ONLY_APPLY_ID], env.projectDir, {
          env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
        });
        await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

        // First, because it is the defect: asking here leads to removals before the writer refuses.
        expect(
          prompt.getOutput(),
          "a result the config writer refuses must be refused before the user is asked to confirm it",
        ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
        expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(prompt.getOutput())).toContain(
          STEP_TEXT.SHARED_CONFIG_SLOT_OVERFULL,
        );
        expect(await surfaces(), "a refused apply must remove and write nothing").toStrictEqual(
          before,
        );
      },
    );
  });
});
