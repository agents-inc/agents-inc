import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  FORKED_FROM_METADATA,
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  runCLI,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type {
  FixtureProjectConfig,
  FixtureStackAgentConfig,
  TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * `edit --from <id>` removing a GLOBALLY installed skill, and who that reaches.
 *
 * A global install is one installation shared by every registered project, so removing one from
 * inside project A changes projects B and C — which the person confirming is not looking at and
 * did not choose to be looking at. The ruling is that they may still do it, and that the confirm
 * has to say so: the removal appears under its own heading, and the statement beneath it counts
 * and NAMES the other projects the yes changes.
 *
 * Inside the global installation the case is different and is deliberately NOT gated twice. The
 * person ran the command at their home directory, the location IS the global scope, and that
 * global is inherited by projects is what global means — so they get the ordinary apply confirm,
 * with no second acknowledgement and no enumeration. A gate that fires everywhere and words
 * itself differently is a gate on its way to firing wrongly.
 *
 * Both halves have to land or the machine contradicts itself: the removal DIFF deletes
 * `~/.claude/skills/<id>` and the compiled global agent, and the config gate is what stops
 * `~/.claude-src/config.ts` going on declaring them. Every spec below reads both surfaces.
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
  [WEB_DEV]: { "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The global installation's own sub-agent stack, which the same removal has to prune. */
const globalStack = {
  [API_DEV]: { "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }] },
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
      .flatMap((dir) => [path.join(dir, DIRS.CLAUDE_SRC), path.join(dir, DIRS.CLAUDE)])
      .map(readTreeSnapshot),
  );
}

describe("edit --from <id> removing a global install", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    await ensureBinaryExists();
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

    beforeAll(async () => {
      fixture = await takeInstallation();
      publishProjectScoped(PROJECT_APPLY_ID);

      // A real compile, so the artifact the removal has to invalidate is product output
      // rather than a hand-written file that could agree with the assertion by accident.
      await runCLI(["compile"], fixture.projectB, { env: { HOME: fixture.home } });
      preEditBystanderAgent = await readTestFile(bystanderAgentPath(fixture.projectB));

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

    it("shows the global removal under its own heading", () => {
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_SKILLS_HEADING);
      expect(planned).toContain(E2E_SKILL.vitest.id);
      // The sub-agent half is its own statement for the same reason it is in the ordinary
      // plan: a skill and a sub-agent are removed by different work and read differently.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_AGENTS_HEADING);
      expect(planned).toContain(API_DEV);
    });

    it("names the other registered project the removal reaches, before removing anything", () => {
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH);
      // Counted AND named: "2 other projects" cannot be weighed, and a path can.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH_PROJECTS);
      expect(planned).toContain(realpathSync(fixture.projectB));
    });

    it("applies cleanly once it is confirmed", () => {
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("removes the skill from the global config and from the global skills directory", async () => {
      const globalConfig = await loadConfigOrFail(fixture.home);

      // Both surfaces, because either alone can look right while the other lies. The config
      // row is the config gate's half; the directory is the removal diff's.
      expect(globalConfig.skills.map((skill) => skill.id)).toStrictEqual([]);
      expect(await listFiles(skillsPath(fixture.home))).toStrictEqual([]);
    });

    it("removes the global sub-agent from the global config", async () => {
      const globalConfig = await loadConfigOrFail(fixture.home);

      expect(globalConfig.agents.map((agent) => agent.name)).toStrictEqual([]);
    });

    it("drops the removed rows from the editing project's own config", async () => {
      const config = await loadConfigOrFail(fixture.projectA);

      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(config.agents.map((agent) => agent.name)).toStrictEqual([WEB_DEV]);
    });

    it("propagates the removal into the bystander registered project", async () => {
      const config = await loadConfigOrFail(fixture.projectB);

      // The whole point of the disclosure: a project nobody was looking at really did change,
      // so a confirm that had not said so would have been a change nobody agreed to.
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
    });

    it("recompiles the bystander project's agents, and says it did", async () => {
      const recompiled = await readTestFile(bystanderAgentPath(fixture.projectB));

      expect(
        recompiled,
        "the bystander's compiled agent must lose the global skill it preloaded",
      ).not.toContain(E2E_SKILL.vitest.id);
      expect(recompiled).not.toBe(preEditBystanderAgent);
      expect(output).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
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

    it("asks the ordinary question, with no second acknowledgement", () => {
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW);
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
      // The location IS the global scope and the person chose it. Restating that global is
      // inherited by projects here is noise, and noise is what teaches people to stop reading.
      expect(planned).not.toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH);
      expect(planned).not.toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_SKILLS_HEADING);
    });

    it("does not enumerate the registered projects", () => {
      expect(planned).not.toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH_PROJECTS);
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
