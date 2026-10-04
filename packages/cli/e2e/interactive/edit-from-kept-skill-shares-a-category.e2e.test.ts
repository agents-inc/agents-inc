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
 * `edit --from <id>` keeps the configuration's own skill assigned when a skill it may not remove
 * sits in the same category of the same sub-agent.
 *
 * A destructive apply puts back two kinds of installed skill it is not allowed to take away — one
 * written here, which no shared configuration carried, and one the configuration names that this
 * catalogue cannot place — and each comes back with the stack rows it had. Those rows used to
 * REPLACE the configuration's rows for the same category instead of joining them, so the skill the
 * configuration assigns there was installed and loaded by no sub-agent, and the plan said nothing
 * of it. Each leg below puts the kept skill beside the configuration's under one category, applies,
 * and holds the sub-agent to both: its config row, and the compiled file it is handed.
 *
 * A category that holds ONE skill cannot take both. There the configuration's skill takes the slot
 * and the kept skill stays installed, assigned nowhere in it, and the plan says so. Joining the two
 * produced a row the config writer refuses — after the yes, with the removals already made — so a
 * result the writer would refuse is refused before the question, with nothing touched.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
/** The configuration's own skill, assigned to the sub-agent by every id below. */
const VITEST = E2E_SKILL.vitest.id;
/** In the same category as Vitest, and written here by the first leg. */
const VISUAL = E2E_SKILL["visual-regression"].id;
/** Two skills of a category that holds one. */
const REACT = E2E_SKILL.react.id;
const VUE = E2E_SKILL["vue-composition-api"].id;
const ZUSTAND = E2E_SKILL.zustand.id;
/**
 * A real public-catalogue id in Vitest's category that the E2E source does not carry. Recorded in
 * the install with no files written for it, so the decode skips it while the configuration names
 * it — the catalogue's own limit, which a destructive apply may not read as an instruction.
 */
const UNPLACEABLE = "web-testing-react-testing-library";

const INSTALLED_ID = "KeptCat01";
const APPLY_ID = "KeptCat02";
const UNPLACEABLE_APPLY_ID = "KeptCat03";
/** React and Vitest on the sub-agent. */
const REACT_INSTALLED_ID = "KeptCat04";
/** Vue and Vitest: Vue is for the slot React holds. */
const VUE_APPLY_ID = "KeptCat05";
/** React, Zustand and Vitest on the sub-agent, and Vue on a second one. */
const TWO_FRAMEWORKS_INSTALLED_ID = "KeptCat06";
/** Vitest alone: it names no framework, and leaves Zustand and the second sub-agent out. */
const VITEST_ONLY_APPLY_ID = "KeptCat07";

/** A project skill on the sub-agent, loaded on demand. */
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
    // Vitest alone: the skill written here is one the configuration never speaks about.
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

  /** A fresh HOME with a project in it, installed from `id` the way a user installs one. */
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

  /**
   * Rewrites an installed skill's metadata.yaml with no `forkedFrom`, which is how a directory
   * nobody installed reads — so the round trip does not own it and the apply may not remove it.
   */
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

  /**
   * Applies `id` in `projectDir` at a real terminal, answering yes, and returns what the run
   * printed before the question and in all.
   */
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
      // The subject guard: both skills sit in one category of the one sub-agent before the apply.
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
      // Compiled first, as an install `init --from` made would be: an apply that changes nothing
      // compiles nothing, so the sub-agent's file has to exist before it to be held after it.
      const compiled = await runCLI(["compile"], project.dir);
      expect(compiled.exitCode, `compile failed: ${compiled.combined}`).toBe(EXIT_CODES.SUCCESS);

      const { planned, output } = await applyApproved(UNPLACEABLE_APPLY_ID, project.dir);

      // The subject guard: the skip was read as a skill kept, so its row is the one carried back.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_UNPLACEABLE);
      expect(
        (await loadConfigOrFail(project.dir)).stack?.[WEB_DEV],
        "the configuration's skill must stay assigned beside the one this catalogue cannot place",
      ).toStrictEqual({ "web-testing": [sa(VITEST), sa(UNPLACEABLE)] });
      expect(output).not.toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      // The kept skill has no files to load, so the compiled sub-agent is held to the one it does.
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
        // The user's own framework skill, in the slot Vue is for.
        await rewriteAsWrittenHere(env.projectDir, E2E_SKILL.react, "web-framework");
        expect((await loadConfigOrFail(env.projectDir)).stack?.[WEB_DEV]).toStrictEqual({
          "web-framework": [sa(REACT)],
          "web-testing": [sa(VITEST)],
        });
        const keptFiles = await readTreeSnapshot(path.join(skillsPath(env.projectDir), REACT));
        expect(Object.keys(keptFiles), "the kept skill's directory must exist").not.toHaveLength(0);

        // First, because it is the defect: both skills joined the one slot, and the config writer
        // refused that after the yes, with the apply half made.
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
        // Both in the one slot of one sub-agent, by hand. `compile` and `doctor` load this; only
        // the writer refuses it. The configuration names neither, so neither may be removed, and
        // it fills no framework slot of its own — so no skill of its own can take this one.
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

        // First, because it is the defect: a run that asks here goes on, after the yes, to remove
        // Zustand and the second sub-agent and only then meet the writer's refusal.
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
