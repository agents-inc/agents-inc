import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  compactCliOutput,
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
  matchedAsWritten,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  DIRS,
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
  UNCHANGED_MARKER,
  panelRow,
} from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
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
 * `edit --from` and a global skill the configuration leaves out: from a project nothing global is
 * removed or changed, the global install and the other registered project stay byte-identical, and
 * the plan names the kept skill. At the home directory the global install itself is edited, the
 * skill is removed under the ordinary confirm, and the confirm names the registered projects the
 * change rewrites. Both halves stay in one file.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PROJECT_APPLY_ID = "GlobalReach1";
const DECLINE_ID = "GlobalReach2";
const AT_HOME_ID = "GlobalReach3";

type Fixture = {
  tempDir: string;
  home: string;
  projectA: string;
  projectB: string;
};

/** The bystander's own sub-agent preloads the global skill, so its compiled agent tracks it. */
const bystanderStack = {
  [WEB_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const globalStack = {
  [API_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

function bystanderAgentPath(dir: string): string {
  return path.join(agentsPath(dir), `${WEB_DEV}.md`);
}

/**
 * Not the whole home directory: the update check drops a version cache under `~/.cache/` on any
 * run.
 */
function snapshotEveryScope(fixture: Fixture): Promise<Record<string, TreeSnapshotEntry>[]> {
  return Promise.all(
    [fixture.home, fixture.projectA, fixture.projectB]
      .flatMap((dir) => [sourceFolderIn(dir), path.join(dir, DIRS.CLAUDE)])
      .map(readTreeSnapshot),
  );
}

/** Project A is left out because the apply rightly changes it. */
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
   * The global copy carries `forkedFrom`, so the round trip owns it; every config records
   * `marketplaceName`, as a built-marketplace install does.
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

  /** Every entry global: the only shape the home directory accepts. */
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

      // A real compile, so the artifact is product output.
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
      // The question is the subject guard for the negatives below.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
      expect(planned, "a project apply shows the global skill it keeps as it stands").toContain(
        panelRow(UNCHANGED_MARKER, E2E_SKILL.vitest.display),
      );
      expect(
        planned,
        "a project apply removes nothing global, so the panel must not mark it removed",
      ).not.toContain(panelRow(REMOVED_MARKER, E2E_SKILL.vitest.display));
      expect(
        planned,
        "a project apply must name the global skill it keeps though the configuration leaves it out, as the panel row does",
      ).toMatch(
        new RegExp(
          `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`skill ${E2E_SKILL.vitest.display}`)}`,
        ),
      );
      expect(compactCliOutput(planned)).not.toContain(
        compactCliOutput(realpathSync(fixture.projectB)),
      );
    });

    it("names the global sub-agent it keeps though the configuration leaves it out", () => {
      expect(planned).toMatch(
        new RegExp(
          `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`sub-agent ${API_DEV}`)}`,
        ),
      );
    });

    it("applies cleanly once it is confirmed", () => {
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("keeps the skill in the global config and in the global skills directory", async () => {
      const globalConfig = await loadConfigOrFail(fixture.home);

      // Both surfaces: either alone can look right.
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
      // Proof the apply ran: the project's sub-agent carries the configuration's skill.
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
        // Nothing at all moved, at any scope.
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
      // At home the location is the global scope, so the left-out skill is an ordinary removal
      // under the ordinary question.
      expect(planned).toContain(panelRow(REMOVED_MARKER, E2E_SKILL.vitest.display));
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
    });

    it("names each registered project the run recompiles before asking", () => {
      // Compacted: a path longer than the terminal wraps onto the next row.
      for (const project of [fixture.projectA, fixture.projectB]) {
        expect(compactCliOutput(planned)).toMatch(
          new RegExp(
            `${matchedAsWritten(compactCliOutput(STEP_TEXT.SHARED_CONFIG_REGISTERED_RECOMPILED))}[\\s\\S]*${matchedAsWritten(compactCliOutput(realpathSync(project)))}`,
          ),
        );
      }
    });

    it("removes the skill from the global config and the global skills directory anyway", async () => {
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfig = await loadConfigOrFail(fixture.home);
      expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(fixture.home))).not.toContain(E2E_SKILL.vitest.id);
    });
  });
});
