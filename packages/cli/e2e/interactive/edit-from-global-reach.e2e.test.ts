import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  FORKED_FROM_METADATA,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  runCLI,
  skillsPath,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import type {
  FixtureProjectConfig,
  FixtureStackAgentConfig,
  TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import type { AgentName, ProjectConfig } from "../../src/cli/types/index.js";

/**
 * `edit --from <id>` and a GLOBALLY installed skill the configuration leaves out — who it reaches.
 *
 * A global install is one installation shared by every registered project, so removing one from
 * inside project A would change projects B and C, which the person confirming is not looking at
 * and did not choose to be looking at. The ruling is that a project run does not do it: from a
 * project, `--from` never removes or changes anything global, so the global skill, the global
 * sub-agent and its rows stay, the global installation and the other registered project are
 * byte-identical, and the plan names no global removal and no other project — there is nothing
 * reaching them to name. It does name the global skill it keeps, because the configuration leaves
 * it out. The project's own rows still change, which is what proves the apply ran.
 *
 * Inside the global installation the case is different. The person ran the command at their home
 * directory, the location IS the global scope, so there the configuration is applied to the
 * global install itself and the skill it leaves out is removed — with the ordinary confirm, no
 * second acknowledgement and no enumeration. That half is the permitted counterpart of the
 * project half, and the two stay in one file so they cannot drift apart.
 *
 * Both surfaces are read on each side, because either alone can look right while the other lies:
 * the global `config.ts` declaring a skill, and `~/.claude/skills/<id>` holding it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_APPLY_ID = "GlobalReach1";
const DECLINE_ID = "GlobalReach2";
const AT_HOME_ID = "GlobalReach3";

/** One global installation, the two projects registered against it, and their source. */
type Fixture = {
  tempDir: string;
  home: string;
  projectA: string;
  projectB: string;
};

/** The bystander's own sub-agent preloads the GLOBAL skill, so its compiled agent tracks it. */
const bystanderStack = {
  [WEB_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The global installation's own sub-agent stack, which a project run has to leave as it is. */
const globalStack = {
  [API_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The compiled project-scope agent a registered project owns. */
function bystanderAgentPath(dir: string): string {
  return path.join(agentsPath(dir), `${WEB_DEV}.md`);
}

/**
 * Every tree one run could write across the three scopes: each scope's configs and its content.
 *
 * Deliberately NOT the home directory whole. The update check drops a version cache under
 * `~/.cache/` on any run at all, which is not part of any installation — snapshotting around it
 * is what keeps "nothing moved" a statement about the install rather than about the process.
 */
function snapshotEveryScope(fixture: Fixture): Promise<Record<string, TreeSnapshotEntry>[]> {
  return Promise.all(
    [fixture.home, fixture.projectA, fixture.projectB]
      .flatMap((dir) => [sourceFolderIn(dir), path.join(dir, DIRS.CLAUDE)])
      .map(readTreeSnapshot),
  );
}

/**
 * The scopes a project run in project A has no business writing: the global installation and the
 * other registered project. Project A itself is left out because the apply rightly changes it.
 */
function snapshotGlobalAndBystander(
  fixture: Fixture,
): Promise<Record<string, TreeSnapshotEntry>[]> {
  return Promise.all(
    [fixture.home, fixture.projectB]
      .flatMap((dir) => [sourceFolderIn(dir), path.join(dir, DIRS.CLAUDE)])
      .map(readTreeSnapshot),
  );
}

describe("edit --from <id> and a global install the configuration leaves out", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /**
   * A real global installation — a config pair at `$HOME`, the skill's own directory under
   * `~/.claude/skills/`, a global sub-agent — plus two projects registered against it, each
   * inlining the global rows exactly as a project write leaves them.
   *
   * The global copy carries `forkedFrom`, so the round trip owns it: without the stamp it would
   * read as somebody's own work and be kept for a reason that has nothing to do with this file.
   *
   * Every config records `marketplaceName`, as an install from a built marketplace does: the
   * source publishes a manifest, and a config written without its name is a legacy one that a
   * project write fills in.
   */
  async function takeInstallation(): Promise<Fixture> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);

    const home = path.join(tempDir, "home");
    const projectA = path.join(tempDir, "project-a");
    const projectB = path.join(tempDir, "project-b");
    for (const dir of [home, projectA, projectB]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    await writeProjectConfig(
      home,
      buildProjectConfig({
        name: "global-install",
        marketplace: sourceDir,
        marketplaceName: E2E_MARKETPLACE_NAME,
        skills: [buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" })],
        agents: buildAgentConfigs([API_DEV], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectA), realpathSync(projectB)],
      }),
    );
    await createLocalSkill(home, E2E_SKILL.vitest.id, {
      description: "Globally installed skill",
      metadata: FORKED_FROM_METADATA,
    });

    await writeProjectConfig(projectA, registeredProjectConfig("project-a"));
    await createLocalSkill(projectA, E2E_SKILL.react.id, {
      description: "Project-owned skill",
      metadata: FORKED_FROM_METADATA,
    });

    await writeProjectConfig(projectB, registeredProjectConfig("project-b"));
    await createLocalSkill(projectB, E2E_SKILL.react.id, {
      description: "Project-owned skill",
      metadata: FORKED_FROM_METADATA,
    });

    return { tempDir, home, projectA, projectB };
  }

  /** A registered project as a project write leaves it: its own row, plus the global ones. */
  function registeredProjectConfig(name: string): FixtureProjectConfig {
    return buildProjectConfig({
      name,
      marketplace: sourceDir,
      marketplaceName: E2E_MARKETPLACE_NAME,
      skills: [
        buildSkillConfig(E2E_SKILL.react.id, { scope: "project" }),
        buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" }),
      ],
      agents: [
        ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
        ...buildAgentConfigs([API_DEV], { scope: "global" }),
      ],
      selectedDomains: ["web"],
      stack: bystanderStack,
    });
  }

  /** A configuration naming the project's own skill alone, at the scope the project holds it. */
  function publishProjectScoped(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  /**
   * The same configuration with every entry at GLOBAL scope, which is the only shape the home
   * directory accepts — a global installation holds only global-scoped content.
   */
  function publishGlobalScoped(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
  }

  function launch(id: string, cwd: string, home: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], cwd, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
  }

  describe("from inside a project", () => {
    let fixture: Fixture;
    let planned: string;
    let output: string;
    let exitCode: number;
    let preEditBystanderAgent: string;
    let globalConfigBefore: ProjectConfig;
    let globalAndBystanderBefore: Record<string, TreeSnapshotEntry>[];

    beforeAll(async () => {
      fixture = await takeInstallation();
      publishProjectScoped(PROJECT_APPLY_ID);

      // A real compile, so the artifact a global removal would have invalidated is product
      // output rather than a hand-written file that could agree with the assertion by accident.
      await runCLI(["compile"], fixture.projectB, { env: { HOME: fixture.home } });
      preEditBystanderAgent = await readTestFile(bystanderAgentPath(fixture.projectB));
      globalConfigBefore = await loadConfigOrFail(fixture.home);
      globalAndBystanderBefore = await snapshotGlobalAndBystander(fixture);

      const prompt = launch(PROJECT_APPLY_ID, fixture.projectA, fixture.home);
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        planned = prompt.getOutput();
        await prompt.confirm();
        exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        output = prompt.getOutput();
      } finally {
        await prompt.destroy();
      }
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("names no global removal and no other project in its plan, only the skill it keeps", () => {
      // The question matched here is the positive subject guard for the negatives below: the
      // plan is on screen, and nothing global arrives or leaves, so nothing reaches another
      // project. The global install's being left as it is, is the byte-identity test below.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
      expect(
        planned,
        "a project apply must not plan anything for the global install",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_LIST_GLOBAL);
      expect(
        planned,
        "a project apply removes nothing global, so the plan must not open by promising removals",
      ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW);
      expect(
        planned,
        "a project apply must name the global skill it keeps though the configuration leaves it out",
      ).toMatch(
        new RegExp(`${STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED}[\\s\\S]*${E2E_SKILL.vitest.id}`),
      );
      expect(planned).not.toContain(realpathSync(fixture.projectB));
    });

    it("names the global sub-agent it keeps though the configuration leaves it out", () => {
      expect(planned).toMatch(
        new RegExp(`${STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED}[\\s\\S]*sub-agent ${API_DEV}`),
      );
    });

    it("applies cleanly once it is confirmed", () => {
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("keeps the skill in the global config and in the global skills directory", async () => {
      const globalConfig = await loadConfigOrFail(fixture.home);

      // Both surfaces, because either alone can look right while the other lies.
      expect(
        globalConfig.skills.map((skill) => skill.id),
        "a project apply must not remove a skill from the global install",
      ).toStrictEqual([E2E_SKILL.vitest.id]);
      expect(await listFiles(skillsPath(fixture.home))).toStrictEqual([E2E_SKILL.vitest.id]);
    });

    it("keeps the global sub-agent and its skill rows in the global config", async () => {
      const globalConfig = await loadConfigOrFail(fixture.home);

      expect(
        globalConfig.agents.map((agent) => agent.name),
        "a project apply must not remove a sub-agent from the global install",
      ).toStrictEqual([API_DEV]);
      expect(
        globalConfig.stack,
        "a project apply must not change a global sub-agent's skill rows",
      ).toStrictEqual(globalConfigBefore.stack);
    });

    it("leaves the global installation and the bystander project byte-identical", async () => {
      expect(await snapshotGlobalAndBystander(fixture)).toStrictEqual(globalAndBystanderBefore);
    });

    it("leaves the bystander's compiled agent preloading the global skill", async () => {
      const compiled = await readTestFile(bystanderAgentPath(fixture.projectB));

      expect(compiled).toBe(preEditBystanderAgent);
      expect(compiled).toContain(E2E_SKILL.vitest.id);
    });

    it("changes the editing project's own rows, which is what it was asked to do", async () => {
      const config = await loadConfigOrFail(fixture.projectA);

      expect(
        config.skills.filter((skill) => skill.scope === "project").map((skill) => skill.id),
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect(
        config.agents.filter((agent) => agent.scope === "project").map((agent) => agent.name),
      ).toStrictEqual([WEB_DEV]);
      // The proof the apply ran: the project's own sub-agent now carries the configuration's
      // skill, which the installation never assigned it.
      expect(config.stack).toHaveProperty([WEB_DEV, "web-framework"]);
    });
  });

  describe("declining it", () => {
    it(
      "leaves the global installation and both projects byte-identical",
      async () => {
        const fixture = await takeInstallation();
        publishProjectScoped(DECLINE_ID);
        const before = await snapshotEveryScope(fixture);

        const prompt = launch(DECLINE_ID, fixture.projectA, fixture.home);
        let exitCode: number;
        try {
          await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
          await prompt.deny();
          exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        } finally {
          await prompt.destroy();
        }

        expect(exitCode).toBe(EXIT_CODES.CANCELLED);
        // Not "the global skill survived" — nothing at all moved, at any scope. A decline that
        // rewrote one config or recompiled one agent would still be a change the user refused,
        // and the scope it reached is exactly the one nobody was watching.
        expect(await snapshotEveryScope(fixture)).toStrictEqual(before);
      },
      TIMEOUTS.EXTENDED_LIFECYCLE,
    );
  });

  describe("from inside the global installation", () => {
    let fixture: Fixture;
    let planned: string;
    let output: string;
    let exitCode: number;

    beforeAll(async () => {
      fixture = await takeInstallation();
      publishGlobalScoped(AT_HOME_ID);

      const prompt = launch(AT_HOME_ID, fixture.home, fixture.home);
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        planned = prompt.getOutput();
        await prompt.confirm();
        exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        output = prompt.getOutput();
      } finally {
        await prompt.destroy();
      }
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("asks the ordinary question about the removal, with no second acknowledgement", () => {
      // The location IS the global scope and the person chose it, so the global skill the
      // configuration leaves out is planned as an ordinary removal, under the ordinary question —
      // and the one yes below is all the run waits for.
      expect(planned).toMatch(
        new RegExp(`${STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW}[\\s\\S]*${E2E_SKILL.vitest.display}`),
      );
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
    });

    it("does not enumerate the registered projects", () => {
      expect(planned).not.toContain(realpathSync(fixture.projectA));
      expect(planned).not.toContain(realpathSync(fixture.projectB));
    });

    it("removes the skill from the global config and the global skills directory anyway", async () => {
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfig = await loadConfigOrFail(fixture.home);
      expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(fixture.home))).not.toContain(E2E_SKILL.vitest.id);
    });
  });
});
